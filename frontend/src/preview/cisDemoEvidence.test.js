import axios from 'axios';
import {CIS_SHOWCASE_VERSION} from '../lib/demoClients';
import {registerCisDemoArtifact, cisDemoArtifactDescriptor} from './cisDemoArtifactRecipes';
import {restoredCisDemoEvidence} from './cisDemoEvidence';
import {renderCisOperationArtifact} from './cisDemoOperations';
import {renderCisOperatingArtifact} from './cisDemoOperatingEvidence';
import {previewAdapter} from './adapter';
import {seedStore, saveStore, readStore, STORE_KEY} from './store';
import {clearFileCache, getEvidenceCacheRevision, lightweightStore, restoreFiles} from './evidenceStorage';
import {decodeDemoStore} from './demoStorageCodec';

const NOW = '2026-10-28T17:30:00.000Z';
const ANCHOR = '2026-10-28T00:00:00.000Z';
const CID = 'demo_brawndo';
const copy = value => JSON.parse(JSON.stringify(value));
const api = axios.create({adapter: previewAdapter});

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(NOW));
  sessionStorage.clear();
  localStorage.clear();
  clearFileCache();
});
afterEach(() => {jest.useRealTimers(); sessionStorage.clear(); localStorage.clear(); clearFileCache();});

function prepared(kind = 'operation') {
  const recipe = {kind, schema_version: 1, fixture_version: CIS_SHOWCASE_VERSION, client_id: CID, anchor: ANCHOR,
    key: kind === 'operation' ? 'evidence_vendor_current' : 'operating_periodic',
    ...(kind === 'operation' ? {title: 'Synthetic Microsoft workspace assurance checklist', day: '2026-10-08'}
      : {rows: [{id: '1.1', state: 'P', frequency: 's', trigger: false}]})};
  const bytes = kind === 'operation' ? renderCisOperationArtifact(recipe) : renderCisOperatingArtifact(recipe);
  const row = {evidence_id: kind === 'operation' ? CID + '_' + recipe.key : CID + '_showcase_evidence_' + recipe.key,
    client_id: CID, filename: kind === 'operation' ? recipe.key + '.txt' : 'cis-' + recipe.key + '.csv',
    mime_type: kind === 'operation' ? 'text/plain' : 'text/csv', version: 1, ...bytes,
    linked_type: kind === 'operation' ? 'vendor' : 'framework_assessment',
    linked_id: kind === 'operation' ? CID + '_vendor_0' : 'fw_' + CID + '_assessment_1.1',
    created_at: kind === 'operation' ? recipe.day + 'T00:00:00.000Z' : ANCHOR,
    uploaded_at: kind === 'operation' ? recipe.day + 'T00:00:00.000Z' : ANCHOR,
    uploaded_by: 'original-uploader', uploaded_by_email: 'uploader@example.test',
    display_name: 'Original display name', notes: 'Original notes', relationships: []};
  const db = {user: {workspace_mode: 'demo'}, clients: [{client_id: CID, name: 'Brawndo', environment: 'Demo', status: 'active'}],
    users: [{user_id: 'original-uploader', status: 'active'}], evidence: [row],
    framework_assessments: [{framework_assessment_id: 'fw_' + CID + '_assessment_1.1', status: 'in_progress'}],
    cis_demo_refresh: {version: CIS_SHOWCASE_VERSION, anchor: ANCHOR, timezone: 'UTC',
      clients: {[CID]: {version: CIS_SHOWCASE_VERSION, state: 'fresh_fixture'}}}};
  registerCisDemoArtifact(db, row, recipe);
  return {db, row, recipe, original: row.content_base64};
}

function emptyCacheRow(db, row) {
  delete row.content_base64;
  row.demo_file_storage = 'session_only';
  return db.evidence.find(item => item.evidence_id === row.evidence_id);
}

test.each(['operation', 'operating'])('%s artifact returns its exact original bytes from immutable initial inputs', kind => {
  const {db, row, original} = prepared(kind);
  emptyCacheRow(db, row);
  const before = copy(db), cache = getEvidenceCacheRevision();
  const response = restoredCisDemoEvidence(db, row);
  expect(response.content_base64).toBe(original);
  expect(atob(response.content_base64)).toHaveLength(row.size);
  expect(response).not.toBe(row);
  expect(db).toEqual(before);
  expect(getEvidenceCacheRevision()).toBe(cache);
  expect(row.content_base64).toBeUndefined();
});

test('later native metadata, framework, uploader and parent changes cannot rewrite the original artifact', () => {
  const {db, row, original} = prepared('operating');
  emptyCacheRow(db, row);
  db.framework_assessments[0].status = 'addressed';
  db.clients[0].framework_settings = {'cis-ig1': {implementation_group: 2}};
  db.clients[0].archived_at = NOW;
  db.users[0].status = 'disabled';
  Object.assign(row, {display_name: 'Renamed by the authorized operator', notes: 'New native metadata', evidence_date: '2026-10-27',
    effective_date: '2026-10-26', evidence_type: 'Other', archived_at: NOW, updated_at: NOW,
    relationships: [{kind: 'policies', id: 'supporting-native-policy'}]});
  const response = restoredCisDemoEvidence(db, row);
  expect(response.content_base64).toBe(original);
  for (const field of ['display_name', 'notes', 'evidence_date', 'effective_date', 'evidence_type', 'archived_at', 'updated_at', 'relationships'])
    expect(response[field]).toEqual(row[field]);
});

test('registration owns an independent bounded source snapshot and refuses replacement', () => {
  const {db, row, recipe} = prepared();
  const descriptor = cisDemoArtifactDescriptor(db, row);
  expect(JSON.stringify(descriptor)).not.toContain(row.content_base64);
  recipe.title = 'Changed caller object';
  expect(descriptor.recipe.title).toBe('Synthetic Microsoft workspace assurance checklist');
  expect(Object.isFrozen(descriptor.recipe)).toBe(true);
  expect(() => registerCisDemoArtifact(db, row, recipe)).toThrow(/original.*retained/i);
  expect(cisDemoArtifactDescriptor(db, row)).toBe(descriptor);
});

test.each([
  ['filename', 'different.txt'], ['mime_type', 'text/html'], ['size', 1], ['version', 2],
  ['linked_type', 'task'], ['linked_id', 'a-different-parent'], ['occurrence_id', 'new-occurrence'],
  ['uploaded_by', 'another-uploader'], ['uploaded_by_email', 'another@example.test'],
  ['created_at', NOW], ['uploaded_at', NOW], ['sha256', 'a'.repeat(64)]
])('changed immutable %s fails closed without changing the record', (field, value) => {
  const {db, row} = prepared();
  emptyCacheRow(db, row);
  row[field] = value;
  const before = copy(db);
  expect(restoredCisDemoEvidence(db, row)).toBeNull();
  expect(db).toEqual(before);
});

test.each([
  ['normal mode', db => {db.user.workspace_mode = 'normal';}],
  ['standard mode', db => {db.user.workspace_mode = 'standard';}],
  ['missing cohort', db => {delete db.cis_demo_refresh;}],
  ['unknown showcase', db => {db.cis_demo_refresh.version = 'unknown';}],
  ['unknown member version', db => {db.cis_demo_refresh.clients[CID].version = 'unknown';}],
  ['retained unknown state', db => {db.cis_demo_refresh.clients[CID].state = 'retained_without_rewrite';}],
  ['missing source', db => {delete db.cis_demo_refresh.clients[CID].artifacts;}],
  ['changed anchor', db => {db.cis_demo_refresh.anchor = '2026-10-29T00:00:00.000Z';}],
  ['non-midnight anchor', db => {db.cis_demo_refresh.anchor = NOW;}],
  ['normal client environment', db => {db.clients[0].environment = 'Production';}],
  ['duplicate evidence identity', db => {db.evidence.push(copy(db.evidence[0]));}],
  ['unknown recipe version', db => {db.cis_demo_refresh.clients[CID].artifacts[db.evidence[0].evidence_id].recipe.schema_version = 9;}],
  ['unknown generator', db => {db.cis_demo_refresh.clients[CID].artifacts[db.evidence[0].evidence_id].recipe.kind = 'customer';}],
  ['null recipe', db => {db.cis_demo_refresh.clients[CID].artifacts[db.evidence[0].evidence_id].recipe = null;}],
  ['oversized title', db => {db.cis_demo_refresh.clients[CID].artifacts[db.evidence[0].evidence_id].recipe.title = 'x'.repeat(241);}],
  ['changed captured recipe', db => {db.cis_demo_refresh.clients[CID].artifacts[db.evidence[0].evidence_id].recipe.title = 'different original title';}],
  ['extra copied payload', db => {db.cis_demo_refresh.clients[CID].artifacts[db.evidence[0].evidence_id].recipe.content_base64 = 'eA==';}]
])('%s has no source-backed fallback', (_label, mutate) => {
  const preparedValue = prepared(), db = copy(preparedValue.db), row = db.evidence[0];
  emptyCacheRow(db, row);
  mutate(db);
  const before = copy(db);
  expect(restoredCisDemoEvidence(db, row)).toBeNull();
  expect(db).toEqual(before);
});

test('native Clear and existing content take precedence; custom and out-of-scope IDs are never synthesized', () => {
  const {db, row} = prepared();
  expect(restoredCisDemoEvidence(db, row)).toBeNull();
  emptyCacheRow(db, row);
  row.demo_file_storage = 'cleared';
  expect(restoredCisDemoEvidence(db, row)).toBeNull();
  row.demo_file_storage = 'session_only';
  const custom = {...row, evidence_id: 'evidence_demo_custom_upload'};
  db.evidence.push(custom);
  expect(restoredCisDemoEvidence(db, custom)).toBeNull();
  for (const cid of ['demo_dunder', 'demo_prestige', 'clients_demo_new_client']) {
    const other = {...row, client_id: cid, evidence_id: cid + '_evidence_vendor_current'};
    db.clients.push({client_id: cid, environment: 'Demo'});
    db.evidence.push(other);
    expect(restoredCisDemoEvidence(db, other)).toBeNull();
  }
});

test('initial registration rejects detached, invalid or oversized source records', () => {
  const {db, row, recipe} = prepared();
  delete db.cis_demo_refresh.clients[CID].artifacts;
  expect(() => registerCisDemoArtifact(db, {...row}, recipe)).toThrow(/Invalid initial/);
  const original = row.content_base64;
  row.content_base64 = 'invalid base64';
  expect(() => registerCisDemoArtifact(db, row, recipe)).toThrow(/Invalid initial/);
  row.content_base64 = original;
  expect(() => registerCisDemoArtifact(db, row, {...recipe, title: 'x'.repeat(513)})).toThrow(/Invalid initial/);
  delete db.cis_demo_refresh;
  expect(registerCisDemoArtifact(db, row, recipe)).toBe(false);
  expect(db.cis_demo_refresh).toBeUndefined();
});

let canonicalSeed;
function nativeSession() {
  canonicalSeed ||= seedStore(new Date(NOW));
  const db = copy(canonicalSeed);
  saveStore(db, {resetFiles: true});
  sessionStorage.setItem('grc_demo_entered', 'true');
  clearFileCache();
  return db;
}

test('native authorized download survives a real budget overflow and empty-cache reload without displacing other files', async () => {
  const original = nativeSession();
  const saved = sessionStorage.getItem(STORE_KEY), persisted = decodeDemoStore(saved);
  const target = persisted.evidence.find(row => row.client_id === 'demo_krusty_krab' && !row.content_base64 && row.demo_file_storage === 'session_only');
  expect(target).toBeTruthy();
  const expected = original.evidence.find(row => row.evidence_id === target.evidence_id);
  const outside = persisted.evidence.filter(row => ['demo_dunder', 'demo_prestige'].includes(row.client_id));
  const cache = getEvidenceCacheRevision();
  const {data} = await api.get('/evidence/' + target.evidence_id + '/download');
  expect(data.content_base64).toBe(expected.content_base64);
  expect(data.size).toBe(expected.size);
  expect(getEvidenceCacheRevision()).toBe(cache);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(saved);
  expect(readStore().evidence.find(row => row.evidence_id === target.evidence_id).content_base64).toBeUndefined();
  expect(decodeDemoStore(sessionStorage.getItem(STORE_KEY)).evidence.filter(row => ['demo_dunder', 'demo_prestige'].includes(row.client_id))).toEqual(outside);
  expect(restoreFiles(copy(lightweightStore(persisted))).evidence.filter(row => ['demo_dunder', 'demo_prestige'].includes(row.client_id))).toEqual(outside);
});

test('the native route still denies foreign tenants, allows authorized read-only access, and honors Clear', async () => {
  const db = nativeSession();
  const persisted = decodeDemoStore(sessionStorage.getItem(STORE_KEY));
  const target = persisted.evidence.find(row => row.client_id === 'demo_krusty_krab' && !row.content_base64);
  expect(target).toBeTruthy();
  db.user = {...db.user, role: 'client_readonly', client_ids: [target.client_id]};
  saveStore(db, {resetFiles: true});
  clearFileCache();
  expect((await api.get('/evidence/' + target.evidence_id + '/download')).data.content_base64)
    .toBe(db.evidence.find(row => row.evidence_id === target.evidence_id).content_base64);
  db.user.client_ids = ['demo_dunder'];
  saveStore(db, {resetFiles: true});
  clearFileCache();
  await expect(api.get('/evidence/' + target.evidence_id + '/download')).rejects.toMatchObject({response: {status: 403}});
  db.user = copy(canonicalSeed.user);
  saveStore(db, {resetFiles: true});
  await api.post('/demo/clear-evidence-files');
  await expect(api.get('/evidence/' + target.evidence_id + '/download')).rejects.toMatchObject({response: {status: 400}});
  expect(readStore().evidence.find(row => row.evidence_id === target.evidence_id).demo_file_storage).toBe('cleared');
});
