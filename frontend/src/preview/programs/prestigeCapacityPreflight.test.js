import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {seedStoreBeforePrestige, saveStore, readStore, STORE_KEY} from '../store';
import {stable} from '../commandRequests';
import {preparePrestigeNativeOnboarding} from './prestigeNativeOnboarding';
import {createPrestigeCurrentModel} from './prestigeCurrentModel';
import {payloadBytes, fileBytes, clearFileCache, restoreFiles} from '../evidenceStorage';
import {compactPortfolioReporting} from '../portfolioReporting';
import {decodeDemoStore, MAX_DEMO_DECODE_BYTES} from '../demoStorageCodec';

const CLOCK = new Date('2026-11-02T12:00:00.000Z');
const CID = 'demo_prestige';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
let source, sourceBefore, candidate, report;

beforeAll(async () => {
  // Preserve the deployed d358 baseline for this lower-bound comparison; full fixture capacity is tested separately.
  const priorPreview = process.env.REACT_APP_PREVIEW;
  process.env.REACT_APP_PREVIEW = 'true';
  try { source = seedStoreBeforePrestige(CLOCK); }
  finally {
    if (priorPreview === undefined) delete process.env.REACT_APP_PREVIEW;
    else process.env.REACT_APP_PREVIEW = priorPreview;
  }
  sourceBefore = JSON.stringify(source);
  const prepared = preparePrestigeNativeOnboarding(source, {clock: CLOCK, purpose: 'native_onboarding_qa'});
  candidate = await createPrestigeCurrentModel(prepared, {clock: CLOCK,
    purpose: 'current_model_source_qa', expected_source_sha256: hash(stable(prepared.backup))});
});

afterAll(() => clearFileCache());

test('measure the complete deployed cohort and current-model lower bound without changing storage limits', () => {
  const json = JSON.stringify(candidate.db);
  let saved, persisted;
  const writes = [];
  const originalSet = Storage.prototype.setItem, originalGet = Storage.prototype.getItem;
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (key !== STORE_KEY) return originalSet.call(this, key, value);
    writes.push({utf16_bytes: value.length * 2, compressed: value.startsWith('{"demo_storage_codec"')});
    if (value.length * 2 > 5 * 1024 * 1024)
      throw Object.assign(new Error('Controlled fixture quota'), {name: 'QuotaExceededError'});
    saved = value;
  });
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
    return key === STORE_KEY ? saved ?? null : originalGet.call(this, key);
  });
  let storageError = null, restored;
  try {
    // Exercise the real first-save reporting, byte-retention and read/hydration pipeline.
    persisted = saveStore(candidate.db, {resetFiles: true});
    restored = readStore();
  } catch (error) { storageError = {name: error.name, message: error.message}; }
  finally { set.mockRestore(); get.mockRestore(); }
  const packed = persisted ? JSON.stringify(compactPortfolioReporting(persisted)) : '';
  const expanded = persisted ? restoreFiles(JSON.parse(JSON.stringify(persisted))) : null;
  const arrayEquality = Object.fromEntries(Object.entries(expanded || {}).filter(([, rows]) => Array.isArray(rows))
    .map(([key, rows]) => [key, stable(restored?.[key]) === stable(rows)]));
  const historyEquality = Object.fromEntries(Object.entries(expanded?.portfolio_reporting || {})
    .map(([key, value]) => [key, stable(restored?.portfolio_reporting?.[key]) === stable(value)]));
  const byClient = Object.fromEntries(source.clients.map(client => [client.client_id,
    Object.fromEntries(Object.entries(candidate.db).filter(([, rows]) => Array.isArray(rows))
      .map(([kind, rows]) => [kind, rows.filter(row => row?.client_id === client.client_id).length]))]));
  report = {kind: 'current-model lower-bound capacity, not completed eight-year qualification',
    anchor: CLOCK.toISOString(), baseline_raw_characters: sourceBefore.length,
    baseline_sha256: hash(sourceBefore), raw_characters: json.length, raw_utf8_bytes: Buffer.byteLength(json),
    packed_utf8_bytes: Buffer.byteLength(packed), stored_utf16_bytes: saved?.length * 2 ?? null,
    original_raw_guard: 4000000, original_raw_guard_met: json.length < 4000000,
    decoded_envelope_limit_bytes: MAX_DEMO_DECODE_BYTES,
    decoded_envelope_limit_met: Buffer.byteLength(packed) <= MAX_DEMO_DECODE_BYTES,
    controlled_storage_limit_bytes: 5 * 1024 * 1024, writes, storage_error: storageError,
    all_client_inline_utf16_bytes: (persisted?.evidence || []).reduce((n, row) => n + payloadBytes(row.content_base64), 0),
    all_client_evidence_decoded_bytes: candidate.db.evidence.reduce((n, row) => n + fileBytes(row.content_base64), 0),
    unavailable_after_cache_loss: (persisted?.evidence || []).filter(row => !row.content_base64 && row.demo_file_storage === 'session_only')
      .map(row => ({client_id: row.client_id, evidence_id: row.evidence_id})),
    counts: byClient, native_array_roundtrip: arrayEquality, native_reporting_roundtrip: historyEquality,
    codec_roundtrip_equal: !!saved && stable(decodeDemoStore(saved)) === stable(JSON.parse(packed)),
    native_store_roundtrip_equal: Object.values(arrayEquality).every(Boolean) && Object.values(historyEquality).every(Boolean),
    sha256: hash(json), limitations: ['No added Prestige history, Controls or artifact bodies yet',
      'Existing exact fixture recovery may restore some missing file bytes; metadata alone is not proof',
      'Controlled storage is not an actual browser quota measurement',
      'Original raw preflight guard is reported, never waived by a native storage pass']};
  if (process.env.PRESTIGE_CAPACITY_OUTPUT) {
    fs.mkdirSync(process.env.PRESTIGE_CAPACITY_OUTPUT, {recursive: true});
    fs.writeFileSync(path.join(process.env.PRESTIGE_CAPACITY_OUTPUT, 'CURRENT-MODEL-LOWER-BOUND.json'), JSON.stringify(report, null, 2));
  }
  expect(storageError).toBeNull();
  expect(report.codec_roundtrip_equal).toBe(true);
  expect(report.native_store_roundtrip_equal).toBe(true);
  expect(report.all_client_inline_utf16_bytes).toBeLessThanOrEqual(65536);
  expect(report.decoded_envelope_limit_met).toBe(true);
});

test('the measured replacement keeps every other client and its records exactly', () => {
  expect(JSON.stringify(source)).toBe(sourceBefore);
  expect(candidate.backup).toEqual(source);
  for (const [kind, rows] of Object.entries(source)) {
    if (Array.isArray(rows))
      expect(candidate.db[kind].filter(row => row?.client_id !== CID)).toEqual(rows.filter(row => row?.client_id !== CID));
  }
  expect(source.clients.find(row => row.client_id === 'demo_dunder').demo_program_version).toBe('dunder-eight-year-v1');
  expect(candidate.db.framework_assessments.filter(row => row.client_id === CID)).toHaveLength(38);
});
