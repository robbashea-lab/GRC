import axios from 'axios';
import crypto from 'crypto';
import fixture from './programs/prestigeEightYearFixtureData.json';
import {seedStore, saveStore, readStore, clearEvidenceFiles, STORE_KEY} from './store';
import {clearFileCache, getEvidenceCacheRevision, lightweightStore} from './evidenceStorage';
import {compactPortfolioReporting} from './portfolioReporting';
import {writeDemoStore} from './demoStorageCodec';
import {previewAdapter} from './adapter';
import {restoredPrestigeDemoEvidence} from './prestigeDemoEvidence';

const CID = 'demo_prestige', SESSION = 'grc_demo_entered';
const definitions = fixture.payload.collections.evidence;
const api = axios.create({adapter: previewAdapter});
const copy = value => JSON.parse(JSON.stringify(value));
const sha = base64 => crypto.createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex');
let saved, db, priorStore, priorSession;
beforeAll(() => {
  const prior = process.env.REACT_APP_PREVIEW;
  process.env.REACT_APP_PREVIEW = 'true';
  try { db = seedStore(new Date('2026-11-08T00:00:00.000Z')); }
  finally { if (prior === undefined) delete process.env.REACT_APP_PREVIEW; else process.env.REACT_APP_PREVIEW = prior; }
  const original = Storage.prototype.setItem;
  const quota = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (key === STORE_KEY && value.length * 2 > 5 * 1024 * 1024)
      throw new DOMException('Controlled native fixture quota', 'QuotaExceededError');
    return original.call(this, key, value);
  });
  try { saveStore(db); saved = sessionStorage.getItem(STORE_KEY); }
  finally { quota.mockRestore(); sessionStorage.removeItem(STORE_KEY); clearFileCache(); }
});
beforeEach(() => {
  priorStore = sessionStorage.getItem(STORE_KEY); priorSession = sessionStorage.getItem(SESSION);
  sessionStorage.setItem(STORE_KEY, saved); sessionStorage.setItem(SESSION, 'true'); clearFileCache();
});
afterEach(() => {
  if (priorStore === null) sessionStorage.removeItem(STORE_KEY); else sessionStorage.setItem(STORE_KEY, priorStore);
  if (priorSession === null) sessionStorage.removeItem(SESSION); else sessionStorage.setItem(SESSION, priorSession);
  clearFileCache();
});
test.each(definitions)('$filename: native download after cold reload returns every exact byte without storage or cache writes', async definition => {
  const cold = readStore().evidence.find(row => row.evidence_id === definition.evidence_id);
  expect(cold.content_base64).toBeUndefined(); expect(cold.demo_file_storage).toBe('session_only');
  const before = sessionStorage.getItem(STORE_KEY), revision = getEvidenceCacheRevision();
  const result = (await api.get('/evidence/' + definition.evidence_id + '/download', {params: {client_id: CID}})).data;
  expect(result).toMatchObject({filename: definition.filename, mime_type: definition.mime_type,
    size: definition.size, version: definition.version, sha256: definition.sha256});
  expect(result.content_base64).toBe(definition.content_base64);
  expect(sha(result.content_base64)).toBe(definition.sha256);
  expect(Buffer.from(result.content_base64, 'base64')).toHaveLength(definition.size);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect(getEvidenceCacheRevision()).toBe(revision);
  expect(readStore().evidence.find(row => row.evidence_id === definition.evidence_id).content_base64).toBeUndefined();
});

test('editable display metadata, archived state and current record edits preserve the frozen original file without repairing anything', () => {
  const cold = readStore(), original = definitions[0], row = cold.evidence.find(item => item.evidence_id === original.evidence_id);
  Object.assign(row, {display_name: 'Visitor label', notes: 'Visitor annotation', archived_at: '2026-11-08T00:00:00.000Z', relationships: []});
  cold.clients.find(client => client.client_id === CID).status = 'archived';
  const before = JSON.stringify(cold), revision = getEvidenceCacheRevision();
  expect(restoredPrestigeDemoEvidence(cold, row)).toMatchObject({display_name: 'Visitor label',
    notes: 'Visitor annotation', archived_at: row.archived_at, content_base64: original.content_base64});
  expect(JSON.stringify(cold)).toBe(before); expect(getEvidenceCacheRevision()).toBe(revision);
});

const immutableFields = ['evidence_id', 'client_id', 'filename', 'mime_type', 'size', 'version', 'sha256',
  'linked_type', 'linked_id', 'occurrence_id', 'created_at', 'uploaded_at', 'uploaded_by', 'uploaded_by_email'];
test.each(immutableFields)('reject immutable %s tampering without falling back to another file', field => {
  const cold = readStore(), row = cold.evidence.find(item => item.evidence_id === definitions[0].evidence_id);
  row[field] = typeof row[field] === 'number' ? row[field] + 1 : String(row[field] || '') + '-changed';
  expect(restoredPrestigeDemoEvidence(cold, row)).toBeNull();
});

test.each(['cleared', 'deleted', 'duplicate', 'foreign parent', 'missing parent', 'wrong fixture', 'wrong source',
  'old client', 'authenticated', 'foreign scope', 'unsupported role', 'inactive user', 'ordinary upload', 'available bytes'])
('no recovery for %s', mode => {
  const cold = readStore(), row = cold.evidence.find(item => item.evidence_id === definitions[0].evidence_id);
  if (mode === 'cleared') row.demo_file_storage = 'cleared';
  if (mode === 'deleted') cold.evidence = cold.evidence.filter(item => item.evidence_id !== row.evidence_id);
  if (mode === 'duplicate') cold.evidence.push(copy(row));
  if (mode === 'foreign parent') cold.assets.find(item => item.asset_id === row.linked_id).client_id = 'other';
  if (mode === 'missing parent') cold.assets = cold.assets.filter(item => item.asset_id !== row.linked_id);
  if (mode === 'wrong fixture') cold.prestige_eight_year_fixture.fingerprint += '-changed';
  if (mode === 'wrong source') cold.prestige_eight_year_fixture.generated_payload_sha256 = '0'.repeat(64);
  if (mode === 'old client') delete cold.clients.find(client => client.client_id === CID).demo_program_version;
  if (mode === 'authenticated') cold.user.workspace_mode = 'authenticated';
  if (mode === 'foreign scope') Object.assign(cold.user, {role: 'client_readonly', client_ids: ['demo_dunder']});
  if (mode === 'unsupported role') cold.user.role = 'unrecognized';
  if (mode === 'inactive user') cold.user.status = 'disabled';
  if (mode === 'ordinary upload') row.evidence_id = 'ordinary-visitor-upload';
  if (mode === 'available bytes') row.content_base64 = 'aGVsbG8=';
  const before = JSON.stringify(cold);
  expect(restoredPrestigeDemoEvidence(cold, row)).toBeNull();
  expect(JSON.stringify(cold)).toBe(before);
});

function persona(user) {
  const next = readStore(); next.user = {...next.user, ...user};
  writeDemoStore(sessionStorage, STORE_KEY, JSON.stringify(compactPortfolioReporting(lightweightStore(next))));
}
test('native read-only download remains available while mutation is denied and a foreign client cannot download', async () => {
  persona({role: 'client_readonly', client_ids: [CID]});
  const definition = definitions[0];
  expect((await api.get('/evidence/' + definition.evidence_id + '/download', {params: {client_id: CID}})).data.content_base64)
    .toBe(definition.content_base64);
  const before = sessionStorage.getItem(STORE_KEY);
  // The existing Evidence Library reports this native denial as400/Read-only; do not change its contract here.
  await expect(api.patch('/evidence-library/items/' + definition.evidence_id,
    {notes: 'Denied write', expected_updated_at: definition.updated_at})).rejects.toThrow('Read-only');
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  persona({role: 'client_readonly', client_ids: ['demo_dunder']});
  await expect(api.get('/evidence/' + definition.evidence_id + '/download', {params: {client_id: CID}}))
    .rejects.toMatchObject({response: {status: 403}});
});
test('native editable metadata and relationship save survive reload while original bytes and version remain exact', async () => {
  const definition = definitions[0], url = '/evidence-library/items/' + definition.evidence_id;
  const original = (await api.get(url)).data;
  const changed = (await api.patch(url, {display_name: 'Reviewed fictional source', notes: 'Disposable QA note',
    expected_updated_at: original.updated_at})).data;
  const asset = readStore().assets.find(row => row.client_id === CID && row.asset_id !== definition.linked_id);
  await api.post(url + '/relationships', {linked_type: 'assets', linked_id: asset.asset_id,
    expected_updated_at: changed.updated_at});
  clearFileCache();
  const detail = (await api.get(url)).data;
  expect(detail).toMatchObject({display_name: 'Reviewed fictional source', notes: 'Disposable QA note', version: 1});
  expect(detail.references.some(link => link.kind === 'assets' && link.id === asset.asset_id)).toBe(true);
  const downloaded = (await api.get('/evidence/' + definition.evidence_id + '/download', {params: {client_id: CID}})).data;
  expect(downloaded.content_base64).toBe(definition.content_base64);
  expect(sha(downloaded.content_base64)).toBe(definition.sha256);
});
test('native DELETE soft-archives retained history; authorized historical download does not recreate or unarchive it', async () => {
  const definition = definitions.find(row => row.filename === 'pw-foundation-2018.txt');
  await api.delete('/evidence/' + definition.evidence_id);
  clearFileCache();
  const row = readStore().evidence.find(item => item.evidence_id === definition.evidence_id);
  expect(row.archived_at).toBeTruthy();
  const before = sessionStorage.getItem(STORE_KEY);
  expect((await api.get('/evidence/' + definition.evidence_id + '/download', {params: {client_id: CID}})).data.content_base64)
    .toBe(definition.content_base64);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect(readStore().evidence.find(item => item.evidence_id === definition.evidence_id).archived_at).toBe(row.archived_at);
});
test('native retention still refuses deletion of operating Control Evidence and preserves its exact download', async () => {
  const definition = definitions.find(row => row.filename === 'pw-recovery-workpaper-current.txt');
  const before = sessionStorage.getItem(STORE_KEY);
  await expect(api.delete('/evidence/' + definition.evidence_id)).rejects.toThrow('Control design and operation evidence must be retained');
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect((await api.get('/evidence/' + definition.evidence_id + '/download', {params: {client_id: CID}})).data.sha256)
    .toBe(definition.sha256);
});
test('native Clear files remains authoritative after reload', async () => {
  clearEvidenceFiles();
  await expect(api.get('/evidence/' + definitions[0].evidence_id + '/download', {params: {client_id: CID}}))
    .rejects.toThrow('not available');
  expect(readStore().evidence.find(row => row.evidence_id === definitions[0].evidence_id).demo_file_storage).toBe('cleared');
});
