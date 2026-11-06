import approved from './dunderEightYearArtifacts.json';
import {DEMO_INLINE_LIMIT} from '../../lib/demoStorageErrors';
import {evidenceKind, evidenceSources} from '../../lib/evidenceReferences';
import {clientAccess} from '../assignmentEligibility';
import {DUNDER_SCENARIO_VERSION, EIGHT_YEAR_ANCHOR} from './isoSocEightYearSupport';

// Approved RUN2 artifact-proposal-run2: exact versioned payloads and 70 original-source checks.
// The backup-policy parent is intentionally absent from static data; each import binds its native ID.
const CID = 'demo_dunder';
const MAX_ARTIFACTS = 32;
const MAX_RELATIONSHIPS = 100;
const ORIGINAL_FIELDS = ['filename', 'mime_type', 'size', 'version', 'created_at',
  'evidence_date', 'uploaded_by', 'uploaded_by_email', 'linked_type', 'occurrence_id'];
const clone = value => JSON.parse(JSON.stringify(value));
const fail = reason => { throw new Error('Invalid initial Dunder artifacts: ' + reason); };

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

freeze(approved);
export const DUNDER_ARTIFACT_VERSION = approved.version;
export const DUNDER_ARTIFACT_SOURCE_SHA256 = approved.source_sha256;
export const DUNDER_ARTIFACT_DEFINITIONS = approved.artifacts;
const definitions = new Map(approved.artifacts.flatMap(row => [[row.key, row], [row.evidence_id, row]]));

// Fixed approved bytes, never rendered from current records or an operator's edits.
export function resolveDunderArtifact(key) {
  const definition = typeof key === 'string' && definitions.get(key);
  return definition ? clone(definition) : null;
}

function validateParent(db, link) {
  if (!link || typeof link !== 'object' || typeof link.id !== 'string') fail('invalid native relationship');
  const specification = Object.hasOwn(evidenceSources, link.kind) && evidenceSources[link.kind];
  const parents = specification && (db[link.kind] || []).filter(row =>
    row.client_id === CID && row[specification.key] === link.id);
  if (!parents || parents.length !== 1) fail('missing or ambiguous same-client parent');
  if (link.occurrence_id && (link.kind !== 'reviews' ||
    parents[0].current_occurrence_id !== link.occurrence_id &&
    !parents[0].occurrences?.some(row => row.occurrence_id === link.occurrence_id)))
    fail('missing native Review occurrence');
}

function primaryLink(row) {
  return {kind: evidenceKind(row.linked_type), id: row.linked_id,
    ...(row.occurrence_id ? {occurrence_id: row.occurrence_id} : {})};
}

const relationshipKey = link => JSON.stringify([link.kind, link.id, link.occurrence_id || null]);

function validateInitialRows(db) {
  const clients = db.clients?.filter(row => row.client_id === CID) || [];
  const client = clients[0], baseline = db.baselines?.[CID];
  if (db.user?.workspace_mode !== 'demo' || !db.user.user_id || db.user.status !== 'active' ||
    !['super_admin', 'platform_admin'].includes(db.user.role) || !clientAccess(db.user, CID) ||
    clients.length !== 1 || client.environment !== 'Demo' || client.status !== 'active' ||
    client.archived || client.archived_at || client.demo_program_version !== DUNDER_SCENARIO_VERSION ||
    baseline?.completed !== true || baseline.requirements?.['iso-27001'] !== 'applies' ||
    baseline.updated_at !== EIGHT_YEAR_ANCHOR ||
    client.initial_program_baseline?.completed_at !== EIGHT_YEAR_ANCHOR ||
    client.initial_program_baseline.state?.completed !== true ||
    client.initial_program_baseline.state.updated_at !== EIGHT_YEAR_ANCHOR)
    fail('canonical Demo source required');
  if (approved.artifacts.length !== MAX_ARTIFACTS || approved.originals.length !== 70)
    fail('approved inventory count');
  const rows = (db.evidence || []).filter(row => row.client_id === CID);
  if (rows.length !== approved.originals.length) fail('expected all 70 original Evidence rows');
  const originals = new Map();
  for (const expected of approved.originals) {
    const matches = db.evidence.filter(row => row.evidence_id === expected.evidence_id);
    const row = matches[0];
    if (matches.length !== 1 || row.client_id !== CID || row.content_base64 !== expected.content_base64 ||
      ORIGINAL_FIELDS.some(key => (row[key] ?? null) !== (expected[key] ?? null)))
      fail('original Evidence bytes or metadata changed');
    if (expected.linked_type === 'policy') {
      const policies = (db.policies || []).filter(policy => policy.client_id === CID &&
        policy.baseline_key === 'policy-backup-restoration-policy' && !policy.archived_at && policy.status !== 'archived');
      if (policies.length !== 1 || policies[0].policy_id !== row.linked_id)
        fail('backup policy must bind to this import');
    } else if (row.linked_id !== expected.linked_id) fail('original parent changed');
    const links = row.relationships || [];
    if (!Array.isArray(links) || links.length > MAX_RELATIONSHIPS) fail('original relationships exceed native limit');
    [primaryLink(row), ...links].forEach(link => validateParent(db, link));
    originals.set(row.evidence_id, row);
  }
  return originals;
}

function prepareArtifacts(db, originals) {
  const artifacts = [], mapping = new Map();
  for (const definition of approved.artifacts) {
    if (!Number.isInteger(definition.size) || definition.size < 1 || definition.size > DEMO_INLINE_LIMIT ||
      atob(definition.content_base64).length !== definition.size || !/^[a-f0-9]{64}$/.test(definition.sha256))
      fail('approved file exceeds native limit or has invalid bytes');
    if (db.evidence.some(row => row.evidence_id === definition.evidence_id && !originals.has(row.evidence_id)))
      fail('proposed Evidence ID already exists');
    const sources = definition.original_ids.map(id => originals.get(id));
    if (!sources.length || sources.some(row => !row)) fail('approved mapping is incomplete');
    const primary = sources[0], primaryKey = relationshipKey(primaryLink(primary));
    const relationships = new Map();
    for (const source of sources) {
      if (mapping.has(source.evidence_id)) fail('duplicate original mapping');
      mapping.set(source.evidence_id, definition);
      for (const link of [primaryLink(source), ...(source.relationships || [])]) {
        validateParent(db, link);
        const key = relationshipKey(link);
        if (key !== primaryKey && !relationships.has(key)) relationships.set(key, clone(link));
      }
    }
    if (relationships.size > MAX_RELATIONSHIPS) fail('consolidated relationships exceed native limit');
    const metadata = {...definition};
    delete metadata.key; delete metadata.original_ids; delete metadata.baseline_key;
    artifacts.push({...primary, ...metadata, linked_type: primary.linked_type, linked_id: primary.linked_id,
      relationships: [...relationships.values()]});
  }
  if (mapping.size !== originals.size) fail('an original was omitted');
  return {artifacts, mapping};
}

function deduplicateReferences(rows, field) {
  if (field === 'evidence_ids' || field.endsWith('_evidence_ids')) return [...new Set(rows)];
  if (!['evidence', 'related_links', 'relationships'].includes(field)) return rows;
  const seen = new Set();
  return rows.filter(row => {
    if (!row || typeof row !== 'object' || !row.evidence_id && row.kind !== 'evidence') return true;
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function frozenHistoricalContainers(db, mapping) {
  const protectedObjects = new Set();
  function containsReplacedId(value) {
    if (typeof value === 'string') return mapping.has(value) && mapping.get(value).evidence_id !== value;
    return !!value && typeof value === 'object' && Object.values(value).some(containsReplacedId);
  }
  function protect(snapshot) {
    if (!snapshot) return;
    // A current compilation cannot become evidence for an earlier immutable execution.
    if (containsReplacedId(snapshot)) fail('immutable history references an artifact selected for consolidation');
    protectedObjects.add(snapshot);
  }
  function inspect(value, clientId = null) {
    if (!value || typeof value !== 'object') return;
    if (protectedObjects.has(value)) return;
    if (Array.isArray(value)) { value.forEach(row => inspect(row, clientId)); return; }
    const scope = value.client_id || clientId;
    if (scope && scope !== CID) return;
    if (scope === CID && value.review_id && value.status === 'completed') { protect(value); return; }
    for (const [key, child] of Object.entries(value)) {
      const childScope = key === CID ? CID : scope;
      if (childScope === CID && child && typeof child === 'object' &&
        (key === 'history' || key.endsWith('_history') || key.endsWith('_snapshot') ||
          key === 'iso_audit' || key === 'occurrences')) protect(child);
      else inspect(child, childScope);
    }
  }
  for (const log of db.logs || []) if (log.client_id === CID) protect(log);
  inspect(db);
  return protectedObjects;
}

function rewriteReferences(value, mapping, protectedObjects, clientId = null, field = '') {
  if (typeof value === 'string') {
    const target = mapping.get(value);
    // Native IDs and ID lists only; literal prose and encoded original contents stay intact.
    if (!target || field !== 'id' && !field.endsWith('_id') && !field.endsWith('_ids')) return value;
    if (clientId !== CID) fail('Evidence reference outside Dunder scope');
    return target.evidence_id;
  }
  if (!value || typeof value !== 'object') return value;
  if (protectedObjects.has(value)) return value;
  if (Array.isArray(value)) {
    const rewritten = value.map(row => rewriteReferences(row, mapping, protectedObjects, clientId, field));
    if (rewritten.every((row, index) => row === value[index])) return value;
    return clientId === CID ? deduplicateReferences(rewritten, field) : rewritten;
  }
  const scope = value.client_id || clientId;
  const result = Object.fromEntries(Object.entries(value).map(([key, child]) =>
    [key, rewriteReferences(child, mapping, protectedObjects, key === CID ? CID : scope, key)]));
  const target = mapping.get(value.evidence_id);
  if (target && target.evidence_id !== value.evidence_id && Object.hasOwn(value, 'filename')) {
    // Current Evidence metadata names the actual downloadable compilation.
    Object.assign(result, {filename: target.filename, version: target.version, sha256: target.sha256});
    for (const key of ['size', 'mime_type']) if (Object.hasOwn(value, key)) result[key] = target[key];
  }
  return Object.keys(result).every(key => result[key] === value[key]) ? value : result;
}

// Source-builder only, after all 70 originals exist; reads never consolidate or repair records.
export function consolidateDunderArtifacts(db) {
  const originals = validateInitialRows(db);
  const {artifacts, mapping} = prepareArtifacts(db, originals);
  const protectedObjects = frozenHistoricalContainers(db, mapping);
  const staged = rewriteReferences({...db,
    evidence: [...db.evidence.filter(row => row.client_id !== CID), ...artifacts]}, mapping, protectedObjects);
  const changes = Object.entries(staged).filter(([key, value]) => value !== db[key]);
  // Validate everything before replacing any collection, including writable root slots.
  if (changes.some(([key]) => Object.getOwnPropertyDescriptor(db, key)?.writable !== true))
    fail('source is not writable');
  for (const [key, value] of changes) db[key] = value;
  return db;
}
