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

const phaseOrder = ['seedStoreBeforePrestige', 'source_json_snapshot', 'preparePrestigeNativeOnboarding',
  'independent_stable_source_hash', 'createPrestigeCurrentModel'];
const phaseMarkers = [];
let measurementStarted = null, markerBookkeepingNs = 0n, modelAwaitState = 'not_started';
function markPhase(phase, boundary) {
  const bookkeepingStarted = process.hrtime.bigint();
  if (measurementStarted === null) measurementStarted = bookkeepingStarted;
  phaseMarkers.push({phase, boundary, elapsed_ms: Number(bookkeepingStarted - measurementStarted) / 1e6,
    cpu_us: process.cpuUsage(), memory_bytes: process.memoryUsage()});
  markerBookkeepingNs += process.hrtime.bigint() - bookkeepingStarted;
}

beforeAll(async () => {
  // Preserve the deployed d358 baseline for this lower-bound comparison; full fixture capacity is tested separately.
  const priorPreview = process.env.REACT_APP_PREVIEW;
  process.env.REACT_APP_PREVIEW = 'true';
  try {
    markPhase('seedStoreBeforePrestige', 'start');
    source = seedStoreBeforePrestige(CLOCK);
    markPhase('seedStoreBeforePrestige', 'end');
  }
  finally {
    if (priorPreview === undefined) delete process.env.REACT_APP_PREVIEW;
    else process.env.REACT_APP_PREVIEW = priorPreview;
  }
  markPhase('source_json_snapshot', 'start');
  sourceBefore = JSON.stringify(source);
  markPhase('source_json_snapshot', 'end');
  markPhase('preparePrestigeNativeOnboarding', 'start');
  const prepared = preparePrestigeNativeOnboarding(source, {clock: CLOCK, purpose: 'native_onboarding_qa'});
  markPhase('preparePrestigeNativeOnboarding', 'end');
  markPhase('independent_stable_source_hash', 'start');
  const expectedSourceSha256 = hash(stable(prepared.backup));
  markPhase('independent_stable_source_hash', 'end');
  markPhase('createPrestigeCurrentModel', 'start');
  modelAwaitState = 'awaiting';
  try {
    candidate = await createPrestigeCurrentModel(prepared, {clock: CLOCK,
      purpose: 'current_model_source_qa', expected_source_sha256: expectedSourceSha256});
    modelAwaitState = 'resolved';
    markPhase('createPrestigeCurrentModel', 'end');
  } finally {
    if (modelAwaitState === 'awaiting') modelAwaitState = 'threw_or_rejected';
  }
});

afterAll(() => clearFileCache());

afterAll(() => {
  const phases = phaseOrder.map(phase => {
    const start = phaseMarkers.find(marker => marker.phase === phase && marker.boundary === 'start');
    const end = phaseMarkers.find(marker => marker.phase === phase && marker.boundary === 'end');
    return {phase, status: end ? 'complete' : start ? 'end_not_reached' : 'not_reached',
      duration_ms: start && end ? end.elapsed_ms - start.elapsed_ms : null};
  });
  console.log('PRESTIGE_CAPACITY_HOOK_DIAGNOSTIC ' + JSON.stringify({
    kind: 'test-only setup phase diagnostic; not qualification',
    baseline_commit: 'f6a15b8d84726a49d7cd62d7f77063f8d6ac3e70',
    diagnostic_commit: process.env.GITHUB_SHA || null, node: process.version,
    worker: process.env.JEST_WORKER_ID || null, clock: CLOCK.toISOString(), phases, markers: phaseMarkers,
    model_await_state_at_flush: modelAwaitState,
    marker_bookkeeping_ms: Number(markerBookkeepingNs) / 1e6,
    limits: ['Complete boundary durations include marker bookkeeping; no savings are subtracted.',
      'Marker timing omits some function-entry, clock/counter-update, settlement-state and flush cost.',
      'CPU/memory are process snapshots including GC/native threads, not per-function allocations.',
      'Runner load, scheduling, GC and warm caches can affect wall time; frontend uses runInBand.',
      'Missing phase ends do not establish final cost, savings or test-body coverage.']
  }));
});

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
