import {clientAccess} from './assignmentEligibility';
import {DEMO_INLINE_LIMIT} from '../lib/demoStorageErrors';
import {DUNDER_ID, EIGHT_YEAR_ANCHOR, DUNDER_SCENARIO_VERSION} from './programs/isoSocEightYearSupport';
import {DUNDER_ARTIFACT_DEFINITIONS, DUNDER_ARTIFACT_VERSION, DUNDER_ARTIFACT_SOURCE_SHA256, resolveDunderArtifact} from './programs/dunderEightYearArtifacts';

const SOURCE_FIELDS = ['schema_version','source_version','source_sha256','fixture_version','client_id','anchor','artifacts'];
const DESCRIPTOR_FIELDS = ['key','immutable','fingerprint'];
const IMMUTABLE_FIELDS = ['evidence_id','client_id','filename','mime_type','size','version',
  'linked_type','linked_id','occurrence_id','created_at','uploaded_at','uploaded_by','uploaded_by_email','sha256'];
const PARENTS = {review:['reviews','review_id'],risk:['risks','risk_id'],vendor:['vendors','vendor_id'],
  policy:['policies','policy_id'],ai_system:['ai_systems','ai_system_id'],finding:['findings','finding_id']};
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value,keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key=>Object.hasOwn(value,key));
const clone = value => JSON.parse(JSON.stringify(value));
const immutableMetadata = row => Object.fromEntries(IMMUTABLE_FIELDS.map(key=>[key,row[key]??null]));
const same = (left,right) => JSON.stringify(left) === JSON.stringify(right);

function matchesStaticMetadata(metadata,definition) {
  const fixed=IMMUTABLE_FIELDS.filter(key=>key!=='linked_id');
  return fixed.every(key=>(metadata[key]??null)===(definition[key]??null))
    &&typeof metadata.linked_id==='string'&&metadata.linked_id.length>0&&metadata.linked_id.length<=256
    &&(definition.linked_id?metadata.linked_id===definition.linked_id:definition.linked_type==='policy');
}

function cohort(db) {
  const clients = db?.clients?.filter(row=>row.client_id===DUNDER_ID)||[];
  return db?.user?.workspace_mode==='demo' && db.user.status==='active'
    && clientAccess(db.user,DUNDER_ID) && clients.length===1 && clients[0].environment==='Demo'
    && clients[0].demo_program_version===DUNDER_SCENARIO_VERSION ? clients[0] : null;
}

function fingerprint(key,metadata,bytes) {
  const text=JSON.stringify({key,metadata,bytes});
  let value=2166136261;
  for(let index=0;index<text.length;index++)value=Math.imul(value^text.charCodeAt(index),16777619);
  // Accidental-change detection only; native authorization remains authoritative.
  return text.length+':'+(value>>>0);
}

function validSource(source) {
  if(!exact(source,SOURCE_FIELDS)||source.schema_version!==1||source.source_version!==DUNDER_ARTIFACT_VERSION
    ||source.source_sha256!==DUNDER_ARTIFACT_SOURCE_SHA256
    ||source.fixture_version!==DUNDER_SCENARIO_VERSION||source.client_id!==DUNDER_ID
    ||source.anchor!==EIGHT_YEAR_ANCHOR||!plain(source.artifacts))return false;
  const ids=Object.keys(source.artifacts);
  return ids.length===32&&ids.every(id=>DUNDER_ARTIFACT_DEFINITIONS.some(definition=>definition.evidence_id===id));
}

function freeze(value) {
  if(value&&typeof value==='object'){
    Object.values(value).forEach(freeze);Object.freeze(value);
  }
  return value;
}

function validateInitialRow(db,row,definition) {
  const immutable=immutableMetadata(row);
  if(!matchesStaticMetadata(immutable,definition)||row.client_id!==DUNDER_ID||!PARENTS[row.linked_type]
    ||row.content_base64!==definition.content_base64
    ||!Number.isInteger(row.size)||row.size<1||row.size>DEMO_INLINE_LIMIT
    ||row.relationships!==undefined&&(!Array.isArray(row.relationships)||row.relationships.length>100))
    throw new Error('Invalid initial Dunder artifact metadata or original bytes');
  const [kind,idField]=PARENTS[row.linked_type];
  const parents=(db[kind]||[]).filter(parent=>parent[idField]===row.linked_id&&parent.client_id===DUNDER_ID);
  if(parents.length!==1||definition.linked_id&&definition.linked_id!==row.linked_id)
    throw new Error('Invalid initial Dunder artifact parent');
  if(definition.linked_type==='policy'){
    const policies=db.policies.filter(policy=>policy.client_id===DUNDER_ID&&policy.baseline_key==='policy-backup-restoration-policy');
    if(policies.length!==1||policies[0].policy_id!==row.linked_id)throw new Error('Dunder policy source identity is ambiguous');
  }
  try{
    const bytes=atob(row.content_base64);
    if(bytes.length!==row.size||btoa(bytes)!==row.content_base64)throw new Error('Invalid bytes');
  }catch{throw new Error('Invalid initial Dunder artifact encoding');}
  return immutable;
}

// Only the explicit fresh Dunder source builder calls this after consolidation.
// Every row is checked before the descriptor inventory is committed.
export function registerDunderDemoArtifacts(db) {
  const client=cohort(db);
  if(!client||client.status!=='active'||client.archived||client.archived_at
    ||db.baselines?.[DUNDER_ID]?.completed!==true
    ||!['super_admin','platform_admin'].includes(db.user.role))throw new Error('Dunder source installation requires its active native Demo scope');
  if(DUNDER_ARTIFACT_DEFINITIONS.length!==32
    ||new Set(DUNDER_ARTIFACT_DEFINITIONS.map(row=>row.evidence_id)).size!==32
    ||new Set(DUNDER_ARTIFACT_DEFINITIONS.map(row=>row.key)).size!==32)throw new Error('Dunder source inventory must retain exactly 32 files');
  const pending={};
  for(const definition of DUNDER_ARTIFACT_DEFINITIONS){
    const rows=db.evidence.filter(row=>row.evidence_id===definition.evidence_id);
    if(rows.length!==1)throw new Error('Dunder artifact identity is missing or duplicated');
    const immutable=validateInitialRow(db,rows[0],definition);
    pending[definition.evidence_id]=freeze({key:definition.key,immutable,
      fingerprint:fingerprint(definition.key,immutable,definition.content_base64)});
  }
  const source={schema_version:1,source_version:DUNDER_ARTIFACT_VERSION,source_sha256:DUNDER_ARTIFACT_SOURCE_SHA256,fixture_version:DUNDER_SCENARIO_VERSION,
    client_id:DUNDER_ID,anchor:EIGHT_YEAR_ANCHOR,artifacts:pending};
  if(db.dunder_demo_artifacts!==undefined){
    if(!validSource(db.dunder_demo_artifacts)||!same(db.dunder_demo_artifacts,source))throw new Error('The original Dunder artifact inventory must be retained');
    return false;
  }
  db.dunder_demo_artifacts=freeze(source);
  return true;
}

// The native route authorizes the entered session, role and client first.
// This supplies original static bytes only; it never repairs records or caches.
export function restoredDunderDemoEvidence(db,evidence) {
  if(!plain(evidence)||evidence.content_base64||evidence.demo_file_storage!=='session_only'
    ||evidence.client_id!==DUNDER_ID||!cohort(db)||!validSource(db.dunder_demo_artifacts))return null;
  const rows=db.evidence.filter(row=>row.evidence_id===evidence.evidence_id);
  if(rows.length!==1||!plain(rows[0])||rows[0].client_id!==DUNDER_ID)return null;
  const descriptor=db.dunder_demo_artifacts.artifacts[evidence.evidence_id];
  if(!exact(descriptor,DESCRIPTOR_FIELDS)||!exact(descriptor.immutable,IMMUTABLE_FIELDS))return null;
  const original=resolveDunderArtifact(descriptor.key);
  if(!original||original.evidence_id!==evidence.evidence_id||original.size!==descriptor.immutable.size
    ||!Number.isInteger(original.size)||original.size<1||original.size>DEMO_INLINE_LIMIT
    ||typeof original.content_base64!=='string'||original.content_base64.length>4*Math.ceil(DEMO_INLINE_LIMIT/3)
    ||!matchesStaticMetadata(descriptor.immutable,original)||!same(immutableMetadata(rows[0]),immutableMetadata(evidence))
    ||!same(immutableMetadata(evidence),descriptor.immutable)
    ||descriptor.fingerprint!==fingerprint(descriptor.key,descriptor.immutable,original.content_base64))return null;
  return {...evidence,content_base64:original.content_base64};
}
