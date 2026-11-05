import {CIS_SHOWCASE_VERSION, namedDemoClient} from '../lib/demoClients';
import {DEMO_INLINE_LIMIT} from '../lib/demoStorageErrors';
import {CIS_CANONICAL_SCENARIO_REVISION,canonicalArtifactLimit,resolveCanonicalArtifact,resolveCanonicalArtifacts} from './cisCanonicalArtifactBooks';

const SCHEMA_VERSION = 1;
const MAX_ARTIFACTS = 32;
const MAX_RECIPE_CHARS = 24000;
const OPERATING_KEYS = new Set(['operating_periodic', 'operating_event', 'operating_configuration', '6_8_sample', '17_9_sample']);
const OPERATION_OFFSETS = {evidence_vendor_current: -20, evidence_provider_1: -20, evidence_provider_2: -20,
  evidence_contract_0: -180, evidence_contract_1: -180, evidence_contract_2: -180,
  evidence_pending_validation: -10, evidence_validated: -40};
const IMMUTABLE_FIELDS = ['evidence_id', 'client_id', 'filename', 'mime_type', 'size', 'version',
  'linked_type', 'linked_id', 'occurrence_id', 'created_at', 'uploaded_at', 'uploaded_by', 'uploaded_by_email', 'sha256'];
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const keysAre = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const shortText = (value, limit = 512) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => Array.isArray(value) ? value.map(canonical) : plain(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

function utcAnchor(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(+parsed) && parsed.toISOString() === value;
}

function cohort(db, cid) {
  const group = namedDemoClient(cid)?.group, refresh = db?.cis_demo_refresh;
  const clients = db?.clients?.filter(client => client.client_id === cid) || [];
  const member = refresh?.clients?.[cid];
  if (db?.user?.workspace_mode !== 'demo' || !group || clients.length !== 1 || clients[0].environment !== 'Demo'
    || refresh?.version !== CIS_SHOWCASE_VERSION || refresh.timezone !== 'UTC' || !utcAnchor(refresh.anchor)
    || member?.version !== CIS_SHOWCASE_VERSION || member.state !== 'fresh_fixture') return null;
  return {member, group, anchor: refresh.anchor};
}

// Only Krusty's current canonical books may exceed the legacy inventory limit.
function artifactLimit(cid,context,recipe) {
  return recipe?.kind==='scenario_book'&&recipe.client_id===cid
    &&recipe.scenario_revision===context.member.canonical_revision
    ?canonicalArtifactLimit(cid,recipe.scenario_revision):MAX_ARTIFACTS;
}

function boundedData(value, depth = 0) {
  if (depth > 4) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 512;
  if (Array.isArray(value)) return value.length <= 153 && value.every(item => boundedData(item, depth + 1));
  return plain(value) && Object.keys(value).length <= 12 && Object.entries(value).every(([key, item]) =>
    !['__proto__', 'prototype', 'constructor'].includes(key) && boundedData(item, depth + 1));
}

function recipeValid(recipe, cid, context, canonicalSource=null) {
  const common = ['kind', 'schema_version', 'fixture_version', 'client_id', 'anchor', 'key'];
  if (!plain(recipe) || !boundedData(recipe) || recipe.schema_version !== SCHEMA_VERSION || recipe.fixture_version !== CIS_SHOWCASE_VERSION
    || recipe.client_id !== cid || recipe.anchor !== context.anchor || JSON.stringify(recipe).length > MAX_RECIPE_CHARS) return false;
  if(recipe.kind==='scenario_book')return context.member.canonical_revision===CIS_CANONICAL_SCENARIO_REVISION
    &&!!canonicalSource;
  if (recipe.kind === 'operation') {
    if (!keysAre(recipe, [...common, 'title', 'day']) || !Object.hasOwn(OPERATION_OFFSETS, recipe.key) || !shortText(recipe.title, 240)) return false;
    if (context.group !== 3 && !['evidence_vendor_current', 'evidence_pending_validation', 'evidence_validated'].includes(recipe.key)) return false;
    const date = new Date(context.anchor);
    date.setUTCDate(date.getUTCDate() + OPERATION_OFFSETS[recipe.key]);
    return recipe.day === date.toISOString().slice(0, 10);
  }
  if (recipe.kind !== 'operating' || !keysAre(recipe, [...common, 'rows']) || !OPERATING_KEYS.has(recipe.key)
    || !Array.isArray(recipe.rows) || !recipe.rows.length || recipe.rows.length > 153) return false;
  if (recipe.key === '6_8_sample' && context.group < 2 || recipe.key === '17_9_sample' && context.group !== 3) return false;
  const ids = new Set();
  for (const row of recipe.rows) {
    if (!keysAre(row, ['id', 'state', 'frequency', 'trigger']) || !/^(?:[1-9]|1[0-8])\.[1-9]\d?$/.test(row.id)
      || !['A', 'P', 'G'].includes(row.state) || !['d', 'w', 'm', 'q', 's', 'a', 't', 'e', 'i', 'o'].includes(row.frequency)
      || typeof row.trigger !== 'boolean' || ids.has(row.id)) return false;
    ids.add(row.id);
  }
  if (recipe.key === '6_8_sample' || recipe.key === '17_9_sample') return recipe.rows.length === 1
    && recipe.rows[0].id === (recipe.key === '6_8_sample' ? '6.8' : '17.9');
  return true;
}

function immutableMetadata(evidence) {
  return Object.fromEntries(IMMUTABLE_FIELDS.map(key => [key, evidence[key] ?? null]));
}

function metadataValid(metadata, recipe, canonicalSource=null) {
  const cid = recipe.client_id;
  const book=recipe.kind==='scenario_book'?canonicalSource?.definition:null;
  if(recipe.kind==='scenario_book'&&!book)return false;
  const operation = recipe.kind === 'operation';
  const id = book?book.evidence_id:operation ? cid + '_' + recipe.key : cid + '_showcase_evidence_' + recipe.key;
  const timestamp = operation ? recipe.day + 'T00:00:00.000Z' : recipe.anchor;
  if (metadata.evidence_id !== id || metadata.client_id !== cid || metadata.version !== 1
    || !Number.isInteger(metadata.size) || metadata.size < 1 || metadata.size > DEMO_INLINE_LIMIT
    || metadata.filename !== (book?book.filename:operation ? recipe.key + '.txt' : 'cis-' + recipe.key + '.csv')
    || metadata.mime_type !== (book?book.mime_type:operation ? 'text/plain' : 'text/csv')
    || metadata.created_at !== timestamp || metadata.uploaded_at !== timestamp
    || !shortText(metadata.uploaded_by, 160) || metadata.uploaded_by_email !== null && !shortText(metadata.uploaded_by_email, 320)
    || metadata.occurrence_id !== (book?book.occurrence_id:null) || metadata.sha256 !== null && !/^[a-f0-9]{64}$/.test(metadata.sha256)) return false;
  if(book)return metadata.linked_type===book.linked_type&&metadata.linked_id===book.linked_id&&metadata.size===canonicalSource.size;
  if (!operation) return metadata.linked_type === 'framework_assessment'
    && metadata.linked_id === `fw_${cid}_assessment_${recipe.rows[0].id}`;
  const provider = recipe.key === 'evidence_vendor_current' || recipe.key === 'evidence_contract_0'
    ? cid + (cid === 'demo_brawndo' ? '_vendor_0' : '_vendor_hosting')
    : recipe.key === 'evidence_provider_1' || recipe.key === 'evidence_contract_1' ? cid + '_vendor_openai'
      : recipe.key === 'evidence_provider_2' || recipe.key === 'evidence_contract_2' ? cid + '_vendor_anthropic' : null;
  return provider ? metadata.linked_type === 'vendor' && metadata.linked_id === provider
    : metadata.linked_type === 'task' && metadata.linked_id === cid + '_task_operating_' + recipe.key.replace('evidence_', '');
}

// Detect accidental/local record changes. This bounded fingerprint is not an
// authorization mechanism or cryptographic proof against rewriting the store.
function fingerprint(recipe, immutable, originalContent) {
  const text = JSON.stringify(canonical({recipe, immutable,...(recipe.kind==='scenario_book'?{original_content:originalContent}:{})}));
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return text.length + ':' + (value >>> 0);
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function initialDescriptor(db,evidence,recipe,context,canonicalSource) {
  const records = db.evidence?.filter(row => row.evidence_id === evidence.evidence_id) || [];
  const immutable = immutableMetadata(evidence);
  if (records.length !== 1 || records[0] !== evidence || !recipeValid(recipe, evidence.client_id, context,canonicalSource)
    || !metadataValid(immutable, recipe,canonicalSource) || !shortText(evidence.content_base64, 4 * DEMO_INLINE_LIMIT))
    throw new Error('Invalid initial CIS Demo artifact source.');
  try {
    const bytes = atob(evidence.content_base64);
    if (bytes.length !== immutable.size || btoa(bytes) !== evidence.content_base64) throw new Error('Invalid bytes');
  } catch {
    throw new Error('Invalid initial CIS Demo artifact bytes.');
  }
  if(recipe.kind==='scenario_book') {
    if(!canonicalSource||canonicalSource.size!==immutable.size||canonicalSource.content_base64!==evidence.content_base64)
      throw new Error('Invalid initial canonical CIS Demo artifact bytes.');
    if(evidence.relationships!==undefined&&(!Array.isArray(evidence.relationships)||evidence.relationships.length>100))
      throw new Error('Invalid initial canonical CIS Demo artifact relationships.');
  }
  return {recipe: clone(recipe), immutable, fingerprint: fingerprint(recipe, immutable,evidence.content_base64)};
}

// Only initial source builders call this, immediately after inserting a new row.
// Reads never install missing proof or repair an unknown/retained artifact.
export function registerCisDemoArtifact(db, evidence, recipe) {
  if (!plain(evidence)) throw new Error('Invalid initial CIS Demo artifact record.');
  const context = cohort(db, evidence.client_id);
  if (!context) return false;
  const artifacts=context.member.artifacts===undefined?{}:context.member.artifacts;
  const limit=artifactLimit(evidence.client_id,context,recipe);
  if(!plain(artifacts)||Object.keys(artifacts).length>limit)
    throw new Error('CIS Demo artifact source inventory is invalid or full.');
  const canonicalSource=recipe?.kind==='scenario_book'?resolveCanonicalArtifact(recipe):null;
  const descriptor=initialDescriptor(db,evidence,recipe,context,canonicalSource);
  const prior = artifacts[evidence.evidence_id];
  if (prior) {
    if (!equal(prior, descriptor)) throw new Error('The original CIS Demo artifact source must be retained.');
    return true;
  }
  if (Object.keys(artifacts).length >= limit)
    throw new Error('CIS Demo artifact source inventory is invalid or full.');
  if(context.member.artifacts===undefined)context.member.artifacts=artifacts;
  artifacts[evidence.evidence_id]=freeze(descriptor);
  return true;
}

// The candidate's Evidence rows are already staged in db. Validate the complete
// initial batch before changing its descriptor inventory; never call on reads.
export function registerCisDemoArtifacts(db,evidenceRows,recipes) {
  if(!Array.isArray(evidenceRows)||!evidenceRows.length||evidenceRows.length>40
    ||evidenceRows.some(evidence=>!plain(evidence))||!Array.isArray(recipes)||recipes.length!==evidenceRows.length)
    throw new Error('Invalid initial canonical CIS Demo artifact batch.');
  const cid=evidenceRows[0].client_id;
  if(evidenceRows.some(evidence=>evidence.client_id!==cid)
    ||new Set(evidenceRows.map(evidence=>evidence.evidence_id)).size!==evidenceRows.length)
    throw new Error('Invalid initial canonical CIS Demo artifact batch scope or identities.');
  const context=cohort(db,cid);
  if(!context)return false;
  const limit=artifactLimit(cid,context,recipes[0]);
  if(evidenceRows.length>limit)throw new Error('Invalid initial canonical CIS Demo artifact batch.');
  const prior=context.member.artifacts===undefined?{}:context.member.artifacts;
  if(!plain(prior)||Object.keys(prior).length>limit)
    throw new Error('CIS Demo artifact source inventory is invalid or full.');
  const sources=resolveCanonicalArtifacts(recipes);
  if(!sources)throw new Error('Invalid initial canonical CIS Demo artifact batch source.');
  const pending={};
  for(const [index,evidence] of evidenceRows.entries()) {
    const descriptor=initialDescriptor(db,evidence,recipes[index],context,sources[index]);
    if(Object.hasOwn(prior,evidence.evidence_id)) {
      if(!equal(prior[evidence.evidence_id],descriptor))throw new Error('The original CIS Demo artifact source must be retained.');
    }else pending[evidence.evidence_id]=freeze(descriptor);
  }
  if(Object.keys(prior).length+Object.keys(pending).length>limit)
    throw new Error('CIS Demo artifact source inventory is invalid or full.');
  // This is the only commit. A bad final row cannot leave the preceding files registered.
  if(Object.keys(pending).length)context.member.artifacts={...prior,...pending};
  return true;
}

// Internal source lookup only. The existing native adapter remains responsible
// for current session, role and client authorization before any byte response.
export function resolveCisDemoArtifact(db, evidence) {
  const context = cohort(db, evidence?.client_id);
  if (!context || !plain(context.member.artifacts)) return null;
  const descriptor = context.member.artifacts[evidence.evidence_id];
  if(Object.keys(context.member.artifacts).length>artifactLimit(evidence.client_id,context,descriptor?.recipe))return null;
  const records = db.evidence?.filter(row => row.evidence_id === evidence.evidence_id) || [];
  if (records.length !== 1 || records[0].client_id !== evidence.client_id
    || !equal(immutableMetadata(records[0]), immutableMetadata(evidence))) return null;
  const original=descriptor?.recipe?.kind==='scenario_book'?resolveCanonicalArtifact(descriptor.recipe):null;
  if (!keysAre(descriptor, ['recipe', 'immutable', 'fingerprint']) || !keysAre(descriptor.immutable, IMMUTABLE_FIELDS)
    || !recipeValid(descriptor.recipe, evidence.client_id, context,original) || !metadataValid(descriptor.immutable, descriptor.recipe,original)
    || descriptor.recipe.kind==='scenario_book'&&!original
    || descriptor.fingerprint !== fingerprint(descriptor.recipe, descriptor.immutable,original?.content_base64)
    || !equal(descriptor.immutable, immutableMetadata(evidence))) return null;
  return {descriptor,rendered:original?{content_base64:original.content_base64,size:original.size}:null};
}

export function cisDemoArtifactDescriptor(db,evidence) {
  return resolveCisDemoArtifact(db,evidence)?.descriptor||null;
}
