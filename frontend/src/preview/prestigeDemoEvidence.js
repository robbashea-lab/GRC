import fixture from './programs/prestigeEightYearFixtureData.json';
import {evidenceAccess} from './evidence';
import {evidenceKind, evidenceSources} from '../lib/evidenceReferences';
import {DEMO_FILE_LIMIT} from '../lib/demoStorageErrors';

const CID = 'demo_prestige', VERSION = 'prestige-eight-year-v1';
const FIELDS = ['evidence_id', 'client_id', 'filename', 'mime_type', 'size', 'version', 'sha256',
  'linked_type', 'linked_id', 'occurrence_id', 'created_at', 'uploaded_at', 'uploaded_by', 'uploaded_by_email'];
const definitions = new Map(fixture.payload.collections.evidence.map(row =>
  [row.evidence_id, Object.freeze({...row})]));
const sameImmutable = (row, original) => FIELDS.every(key => (row?.[key] ?? null) === (original[key] ?? null));

// Native route authorization runs first. Only exact bundled synthetic bytes are returned;
// this never fills the cache, changes storage, repairs a record or approves a document.
export function restoredPrestigeDemoEvidence(db, evidence) {
  const marker = db?.prestige_eight_year_fixture;
  const clients = db?.clients?.filter(row => row.client_id === CID) || [];
  if (!evidence || evidence.client_id !== CID || evidence.content_base64
    || evidence.demo_file_storage !== 'session_only' || definitions.size !== 14
    || db.user?.workspace_mode !== 'demo' || db.user.status !== 'active'
    || !['super_admin', 'platform_admin', 'client_grc_manager', 'client_contributor', 'client_readonly', 'client_viewer'].includes(db.user.role)
    || !evidenceAccess(db.user, CID)
    || clients.length !== 1 || clients[0].environment !== 'Demo' || clients[0].demo_program_version !== VERSION
    || marker?.version !== VERSION || marker.fingerprint !== fixture.fingerprint
    || marker.generated_payload_sha256 !== fixture.payload_sha256) return null;
  const original = definitions.get(evidence.evidence_id);
  const rows = db.evidence.filter(row => row.evidence_id === evidence.evidence_id);
  if (!original || rows.length !== 1 || !sameImmutable(rows[0], original) || !sameImmutable(evidence, original)
    || !Number.isInteger(original.size) || original.size < 1 || original.size > DEMO_FILE_LIMIT
    || typeof original.content_base64 !== 'string') return null;
  const kind = evidenceKind(original.linked_type), spec = evidenceSources[kind];
  if (!spec || (db[kind] || []).filter(row => row.client_id === CID && row[spec.key] === original.linked_id).length !== 1)
    return null;
  return {...evidence, content_base64: original.content_base64};
}
