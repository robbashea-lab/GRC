import {createHash} from 'crypto';
import approved from './dunderEightYearArtifacts.json';
import {evidenceKind, evidenceSources} from '../../lib/evidenceReferences';
import {DEMO_INLINE_LIMIT} from '../../lib/demoStorageErrors';
import {DUNDER_SCENARIO_VERSION, EIGHT_YEAR_ANCHOR} from './isoSocEightYearSupport';
import {consolidateDunderArtifacts, resolveDunderArtifact, DUNDER_ARTIFACT_DEFINITIONS,
  DUNDER_ARTIFACT_SOURCE_SHA256, DUNDER_ARTIFACT_VERSION} from './dunderEightYearArtifacts';

const CID = 'demo_dunder';
const copy = value => JSON.parse(JSON.stringify(value));
const bytes = row => Buffer.from(row.content_base64, 'base64');
const hash = value => createHash('sha256').update(value).digest('hex');
const originalById = new Map(approved.originals.map(row => [row.evidence_id, row]));
const replacedIds = new Set(approved.artifacts.flatMap(row => row.original_ids.filter(id => id !== row.evidence_id)));
const riskBook = approved.artifacts[0];
const riskOriginal = riskBook.original_ids[0];
const transitionOriginal = approved.artifacts.find(row => row.key.startsWith('transition_validation_')).original_ids[0];
const approvedBookHashes = [
  'c8efc1dc075e1d1a1ec37f45a1ad78fd119e32f3d44d3f51deb02b223cba20aa',
  'b84ea6f8192f8d00ec07ecc2aab8a747171773276f08dc420cfdb82923f965cb',
  '45682199f044f17c787aaa2e81f2eeb1e3f9fa37a946a219835a7fd476be9392',
  '29af2971eb7d3a6cdb9afebfb14d27e596acda1555223f564e6ca7fcf09bd0a1',
  '41278d4e002d4f294b214d9a029b239990deefde12d25422be87b502dbc5e3d1',
];

// Independent CSV reader verifies embedded newlines, quotes and exact original bytes.
function csvRows(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(field); field = ''; }
    else if (character === '\r' && text[index + 1] === '\n') {
      row.push(field); rows.push(row); row = []; field = ''; index += 1;
    } else throw new Error('Unexpected unquoted CSV character');
  }
  expect(quoted).toBe(false); expect(row).toEqual([]); expect(field).toBe('');
  const header = rows.shift();
  return rows.map(values => {
    expect(values).toHaveLength(header.length);
    return Object.fromEntries(header.map((key, index) => [key, values[index]]));
  });
}

function fixture() {
  const actualPolicyId = 'policy_created_by_this_native_import';
  const baseline = {version: 3, completed: true, requirements: {'iso-27001': 'applies'}, updated_at: EIGHT_YEAR_ANCHOR};
  const db = {user: {user_id: 'demo_admin', role: 'super_admin', status: 'active', workspace_mode: 'demo'},
    clients: [{client_id: CID, environment: 'Demo', status: 'active', demo_program_version: DUNDER_SCENARIO_VERSION,
      initial_program_baseline: {completed_at: EIGHT_YEAR_ANCHOR, state: copy(baseline)}}], baselines: {[CID]: baseline},
    evidence: copy(approved.originals).map(row => {
      delete row.sha256;
      return {...row, linked_id: row.linked_type === 'policy' ? actualPolicyId : row.linked_id};
    }),
    policies: [{policy_id: actualPolicyId, client_id: CID, status: 'approved', baseline_key: 'policy-backup-restoration-policy'}],
    reviews: [], risks: [], vendors: [], ai_systems: [], findings: [], tasks: [], framework_assessments: [], logs: []};
  function parent(kind, id, occurrenceId) {
    const specification = evidenceSources[kind];
    db[kind] ||= [];
    let row = db[kind].find(item => item[specification.key] === id);
    if (!row) { row = {[specification.key]: id, client_id: CID, status: 'active', related_links: []}; db[kind].push(row); }
    if (kind === 'reviews' && occurrenceId) {
      row.current_occurrence_id ||= occurrenceId;
      row.occurrences ||= [];
      if (!row.occurrences.some(item => item.occurrence_id === occurrenceId)) row.occurrences.push({
        occurrence_id: occurrenceId, status: 'completed', due_date: '2024-06-21',
        completed_at: '2024-06-21T00:00:00.000Z', completed_by: 'retained-actor',
        outcome: 'findings_raised', finding_count: 2, notes: 'Retained original execution.', evidence: []});
    }
    return row;
  }
  for (const evidence of db.evidence) {
    const owner = parent(evidenceKind(evidence.linked_type), evidence.linked_id, evidence.occurrence_id);
    if (owner.related_links) owner.related_links.push({kind: 'evidence', id: evidence.evidence_id});
    for (const link of evidence.relationships || []) parent(link.kind, link.id, link.occurrence_id);
    if (evidenceKind(evidence.linked_type) === 'reviews') owner.occurrences.find(row =>
      row.occurrence_id === evidence.occurrence_id).evidence.push({evidence_id: evidence.evidence_id,
      filename: evidence.filename, version: 1, sha256: null});
    if (evidence.linked_type === 'vendor') owner.assurance_records = [{assurance_id: 'assurance_' + owner.vendor_id,
      received_at: evidence.created_at, evidence_ids: [evidence.evidence_id], history: []}];
  }
  db.framework_assessments.push({framework_assessment_id: 'test_dunder_assessment', client_id: CID,
    related_links: [{kind: 'evidence', id: transitionOriginal}, {kind: 'evidence', id: approved.artifacts[4].original_ids[1]}],
    assessment_history: [{at: '2025-09-26T00:00:00.000Z', by: 'retained-actor', related_links: [
      {kind: 'evidence', id: approved.artifacts.find(row => row.key.startsWith('audit_')).evidence_id}]}]});
  const unchangedLogEvidence = approved.artifacts.find(row => row.key.startsWith('audit_'));
  db.logs.push({client_id: CID, entity_type: 'evidence', entity_id: unchangedLogEvidence.evidence_id,
    at: unchangedLogEvidence.created_at, user_id: 'retained-actor', action: 'upload',
    meta: {kind: 'evidence', id: unchangedLogEvidence.evidence_id, evidence_id: unchangedLogEvidence.evidence_id,
      filename: unchangedLogEvidence.filename, sha256: null}});
  db.tasks.push({task_id: 'test_current_links', client_id: CID, source_type: 'evidence', source_id: riskOriginal,
    evidence_id: riskOriginal, evidence_ids: [...riskBook.original_ids.slice(0, 2)],
    contract_evidence_ids: [riskOriginal], unlinked_evidence_ids: [riskOriginal]});
  db.evidence.push({evidence_id: 'foreign_evidence', client_id: 'demo_prestige', filename: 'keep.txt', content_base64: 'a2VlcA=='});
  db.vendors.push({vendor_id: 'foreign_vendor', client_id: 'demo_prestige',
    assurance_records: [{evidence_ids: ['foreign_evidence', 'foreign_evidence']}], notes: 'Keep foreign state.'});
  return db;
}

function historicalContainers(db) {
  return JSON.stringify({occurrences: db.reviews.map(row => row.occurrences),
    history: db.framework_assessments.map(row => row.assessment_history), logs: db.logs});
}

function exactReferences(value, ids, found = []) {
  if (typeof value === 'string' && ids.has(value)) found.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach(child => exactReferences(child, ids, found));
  return found;
}

test('versioned payload is the exact approved 32-file set with all 70 complete originals', () => {
  expect(DUNDER_ARTIFACT_VERSION).toBe('dunder-artifacts-run2-v1');
  expect(DUNDER_ARTIFACT_SOURCE_SHA256).toBe('93baef21591084b678313f04f1f2a26de9934ba814d134509d17cd23d701d8d4');
  expect(DUNDER_ARTIFACT_DEFINITIONS).toHaveLength(32);
  expect(new Set(DUNDER_ARTIFACT_DEFINITIONS.map(row => row.evidence_id)).size).toBe(32);
  expect(approved.originals).toHaveLength(70);
  expect(approved.originals.reduce((total, row) => total + bytes(row).length, 0)).toBe(61955);
  expect(DUNDER_ARTIFACT_DEFINITIONS.reduce((total, row) => total + row.size, 0)).toBe(82152);
  const books = DUNDER_ARTIFACT_DEFINITIONS.filter(row => row.mime_type === 'text/csv');
  expect(books.map(row => hash(bytes(row)))).toEqual(approvedBookHashes);
  expect(books.map(row => row.size)).toEqual([15397, 15941, 9517, 5504, 2564]);
  expect(books.map(row => row.original_ids.length)).toEqual([14, 14, 9, 4, 2]);
  const preserved = [];
  for (const definition of DUNDER_ARTIFACT_DEFINITIONS) {
    expect(bytes(definition)).toHaveLength(definition.size);
    expect(definition.size).toBeLessThanOrEqual(DEMO_INLINE_LIMIT);
    expect(hash(bytes(definition))).toBe(definition.sha256);
    expect(definition.version).toBe(1);
    if (definition.mime_type === 'text/csv') {
      expect(definition.display_name).toMatch(/archive|compilation/i);
      const rows = csvRows(bytes(definition).toString('utf8'));
      expect(rows.map(row => row.original_evidence_id)).toEqual(definition.original_ids);
      for (const row of rows) {
        const original = originalById.get(row.original_evidence_id);
        expect(Buffer.from(row.original_content, 'utf8')).toEqual(bytes(original));
        expect(row.original_created_at).toBe(original.created_at);
        expect(row.original_evidence_date).toBe(original.evidence_date);
        expect(row.original_sha256).toBe(hash(bytes(original)));
        expect(row.book_recorded_at).toBe(definition.created_at);
        preserved.push(row.original_evidence_id);
      }
    } else {
      expect(definition.original_ids).toEqual([definition.evidence_id]);
      expect(bytes(definition)).toEqual(bytes(originalById.get(definition.evidence_id)));
      preserved.push(definition.evidence_id);
    }
  }
  expect(preserved).toHaveLength(70); expect(new Set(preserved).size).toBe(70);
});

test('resolution is independent of editable records and caller mutations', () => {
  const original = resolveDunderArtifact(riskBook.key);
  expect(original).toEqual(resolveDunderArtifact(riskBook.evidence_id));
  original.content_base64 = 'changed'; original.original_ids.pop(); original.size = 1;
  expect(resolveDunderArtifact(riskBook.key)).toEqual(riskBook);
  expect(Object.isFrozen(DUNDER_ARTIFACT_DEFINITIONS[0].original_ids)).toBe(true);
  expect(resolveDunderArtifact('__proto__')).toBeNull(); expect(resolveDunderArtifact(null)).toBeNull();
  const policy = DUNDER_ARTIFACT_DEFINITIONS.find(row => row.linked_type === 'policy');
  expect(policy.linked_id).toBeNull(); expect(policy.baseline_key).toBe('policy-backup-restoration-policy');
});

test('atomic consolidation reconciles current native pointers and preserves historical references', () => {
  const db = fixture(), before = copy(db), history = historicalContainers(db);
  const foreignEvidence = db.evidence.at(-1), foreignVendor = db.vendors.at(-1);
  expect(consolidateDunderArtifacts(db)).toBe(db);
  const owned = db.evidence.filter(row => row.client_id === CID);
  expect(owned).toHaveLength(32); expect(exactReferences(db, replacedIds)).toEqual([]);
  expect(historicalContainers(db)).toBe(history);
  expect(db.evidence.find(row => row.evidence_id === 'foreign_evidence')).toBe(foreignEvidence);
  expect(db.vendors.at(-1)).toBe(foreignVendor); expect(foreignVendor).toEqual(before.vendors.at(-1));
  for (const row of owned) {
    const definition = resolveDunderArtifact(row.evidence_id);
    expect(row.content_base64).toBe(definition.content_base64); expect(row.sha256).toBe(hash(bytes(row)));
    expect(row.created_at).toBe(definition.created_at); expect(row.evidence_date).toBe(definition.evidence_date);
    expect(row.relationships.length).toBeLessThanOrEqual(100);
    for (const id of definition.original_ids) {
      const source = before.evidence.find(item => item.evidence_id === id);
      expect(row.linked_id === source.linked_id || row.relationships.some(link => link.id === source.linked_id)).toBe(true);
      for (const link of source.relationships || []) expect(row.relationships).toContainEqual(link);
    }
  }
  expect(db.evidence.find(row => row.linked_type === 'policy').linked_id).toBe('policy_created_by_this_native_import');
  const task = db.tasks.find(row => row.task_id === 'test_current_links');
  for (const key of ['source_id', 'evidence_id']) expect(task[key]).toBe(riskBook.evidence_id);
  for (const key of ['evidence_ids', 'contract_evidence_ids', 'unlinked_evidence_ids']) expect(task[key]).toEqual([riskBook.evidence_id]);
  expect(db.framework_assessments[0].related_links).toEqual([{kind: 'evidence', id: approved.artifacts[4].evidence_id}]);
  expect(db.logs).toEqual(before.logs);
  expect(db.reviews.flatMap(row => row.occurrences || []).flatMap(row => row.evidence || []).every(row => row.sha256 === null)).toBe(true);
});

test('later parent descriptions and identities never regenerate approved artifact bytes', () => {
  const db = fixture();
  db.clients[0].name = 'Edited client name';
  for (const row of [...db.risks, ...db.vendors, ...db.ai_systems]) Object.assign(row, {title: 'Edited current title', description: 'Edited current state'});
  db.risks[0].notes = riskOriginal;
  consolidateDunderArtifacts(db);
  expect(db.risks[0].notes).toBe(riskOriginal);
  for (const row of db.evidence.filter(row => row.client_id === CID)) expect(row.content_base64).toBe(resolveDunderArtifact(row.evidence_id).content_base64);
});

test.each([
  ['signed-in actor', db => { db.user.workspace_mode = 'signed_in'; }],
  ['inactive actor', db => { db.user.status = 'disabled'; }],
  ['nonplatform actor', db => { db.user.role = 'client_contributor'; }],
  ['platform actor without client access', db => { db.user.role = 'platform_admin'; db.user.client_ids = []; }],
  ['inactive canonical client', db => { db.clients[0].status = 'inactive'; }],
  ['archived canonical client', db => { db.clients[0].archived = true; }],
  ['unsupported scenario version', db => { db.clients[0].demo_program_version = 'another_version'; }],
  ['unfinished native baseline', db => { db.baselines[CID].completed = false; }],
  ['wrong frozen anchor', db => { db.baselines[CID].updated_at = '2026-11-03T00:00:00.000Z'; }],
  ['missing original', db => db.evidence.splice(0, 1)],
  ['duplicate original', db => db.evidence.push(copy(db.evidence[0]))],
  ['altered bytes', db => { db.evidence[0].content_base64 = 'YWx0ZXJlZA=='; }],
  ['altered file date', db => { db.evidence[0].created_at = '2026-11-03T00:00:00.000Z'; }],
  ['wrong original parent', db => { db.evidence[1].linked_id = 'another_parent'; }],
  ['ambiguous native policy', db => db.policies.push({...db.policies[0], policy_id: 'duplicate_policy'})],
  ['archived native policy', db => { db.policies[0].archived_at = '2026-11-03T00:00:00.000Z'; }],
  ['foreign relationship', db => { db.evidence[1].relationships = [{kind: 'vendors', id: 'foreign_vendor'}]; }],
  ['invalid relationship', db => { db.evidence[1].relationships = [null]; }],
  ['unknown relationship kind', db => { db.evidence[1].relationships = [{kind: '__proto__', id: 'unknown'}]; }],
  ['foreign reference', db => { db.vendors.at(-1).evidence_ids = [riskOriginal]; }],
  ['read-only destination', db => Object.defineProperty(db, 'evidence', {writable: false})],
])('%s fails without partially changing any source collection', (name, alter) => {
  const db = fixture(); alter(db); const before = JSON.stringify(db);
  expect(() => consolidateDunderArtifacts(db)).toThrow('Invalid initial Dunder artifacts');
  expect(JSON.stringify(db)).toBe(before);
});

test.each([
  ['historical audit log', db => { db.logs[0].entity_id = riskOriginal; }],
  ['completed Review Evidence', db => db.reviews[0].occurrences[0].evidence.push({evidence_id: riskOriginal})],
  ['completion snapshot', db => { db.reviews[0].completion_snapshot = {evidence: [{evidence_id: transitionOriginal}]}; }],
  ['historical assessment links', db => db.framework_assessments[0].assessment_history[0].related_links.push({kind: 'evidence', id: transitionOriginal})],
  ['audit payload', db => { db.reviews[0].iso_audit = {report_evidence_id: riskOriginal}; }],
  ['SoA snapshot', db => { db.reviews[0].iso_soa_snapshot = {assessments: [{related_links: [{kind: 'evidence', id: riskOriginal}]}]}; }],
  ['retained vendor assurance history', db => { db.vendors[0].assurance_records[0].history = [{evidence_ids: [riskOriginal]}]; }],
])('%s refuses a current compilation instead of rewriting immutable history', (name, alter) => {
  const db = fixture(); alter(db); const before = JSON.stringify(db);
  expect(() => consolidateDunderArtifacts(db)).toThrow('immutable history');
  expect(JSON.stringify(db)).toBe(before);
});

test('merging cannot exceed the unchanged native 100-relationship limit', () => {
  const db = fixture();
  const original = db.evidence.find(row => row.evidence_id === riskOriginal);
  original.relationships = Array.from({length: 100}, (_, index) => {
    const id = 'extra_same_client_task_' + index;
    db.tasks.push({task_id: id, client_id: CID});
    return {kind: 'tasks', id};
  });
  const before = JSON.stringify(db);
  expect(() => consolidateDunderArtifacts(db)).toThrow('consolidated relationships exceed native limit');
  expect(JSON.stringify(db)).toBe(before);
});
