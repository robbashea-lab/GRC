import axios from 'axios';
import crypto from 'crypto';
import {readStore, saveStore, STORE_KEY} from './store';
import {previewAdapter} from './adapter';
import {clearFileCache, lightweightStore} from './evidenceStorage';
import {decodeDemoStore, MAX_DEMO_DECODE_BYTES} from './demoStorageCodec';
import {readPortfolioStore, writePortfolioStore} from './portfolioReporting';
import {DUNDER_ARTIFACT_DEFINITIONS} from './programs/dunderEightYearArtifacts';
import {DUNDER_ID as CID, EIGHT_YEAR_ANCHOR, copy} from './programs/isoSocEightYearSupport';

const api = axios.create({adapter: previewAdapter});
const runtime = '2026-11-03T12:00:00.000Z';
const program = CID + ':iso-27001';
const points = db => db.portfolio_reporting.snapshots.filter(point => point.program_id === program);
const own = row => row.client_id === CID || row.program_id === program;
const sha = value => crypto.createHash('sha256').update(Buffer.from(value, 'base64')).digest('hex');
let originalEnv, fresh, saved, persisted, authored;

beforeAll(() => {
  originalEnv = Object.fromEntries(['REACT_APP_PREVIEW', 'REACT_APP_DUNDER_EIGHT_YEAR_QA',
    'REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA'].map(key => [key, process.env[key]]));
  process.env.REACT_APP_PREVIEW = 'true';
  process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA = 'true';
  delete process.env.REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA;
  jest.useFakeTimers({doNotFake: ['performance']});
  jest.setSystemTime(new Date(runtime));
  sessionStorage.clear(); localStorage.clear(); clearFileCache();
  // Exercise startup itself: readStore must seed and commit through saveStore.
  fresh = readStore();
  authored = copy(points(fresh));
  saved = sessionStorage.getItem(STORE_KEY);
  clearFileCache();
  persisted = readStore();
});

beforeEach(() => {
  jest.setSystemTime(new Date(runtime));
  sessionStorage.clear(); localStorage.clear(); clearFileCache();
  sessionStorage.setItem(STORE_KEY, saved);
  sessionStorage.setItem('grc_demo_entered', 'true');
});

afterAll(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  jest.useRealTimers(); sessionStorage.clear(); localStorage.clear(); clearFileCache();
});

test('the actual first save retains two fictional source points and a distinct native baseline', () => {
  expect(fresh.dunder_demo_prepared_history.anchor).toBe(EIGHT_YEAR_ANCHOR);
  expect(authored).toHaveLength(2);
  expect(authored.map(point => point.captured_at)).toEqual([
    '2024-03-18T00:00:00.000Z', '2024-09-20T00:00:00.000Z',
  ]);
  expect(authored.map(point => point.current.implemented)).toEqual([118, 121]);
  const retained = points(persisted);
  expect(retained).toHaveLength(3);
  expect(retained.slice(0, 2)).toEqual(authored);
  expect(retained[2]).toMatchObject({captured_at: runtime, effective_at: runtime,
    observation_kind: 'current_baseline', current: {implemented: 121, denominator: 121,
      percentage: 100, observation_kind: 'current_baseline'}});
  expect(retained[2].snapshot_id).not.toBe(authored[1].snapshot_id);
  for (const point of retained.slice(0, 2)) {
    expect(point.observation_kind).toBe('demo_fixture');
    expect(point.current.provenance.kind).toBe('demo_fixture');
    for (const value of [point, point.current, point.current.provenance]) {
      for (const key of ['continuity_proven', 'effective_until', 'continuity_source_event',
        'modeled_until', 'join_snapshot_id', 'held_until']) expect(value).not.toHaveProperty(key);
    }
  }
  const sourceIdentity = fresh.portfolio_reporting.identities.find(row => row.program_id === program);
  expect(persisted.portfolio_reporting.identities.find(row => row.program_id === program)).toEqual(sourceIdentity);
  expect(points(readPortfolioStore(saved))).toEqual(retained);
  expect(Buffer.byteLength(JSON.stringify(decodeDemoStore(saved)))).toBeLessThanOrEqual(MAX_DEMO_DECODE_BYTES);
  expect(saved.length * 2).toBeLessThanOrEqual(5 * 1024 * 1024);
});

test('repeated native save and cold reload keep all points once without rewriting source records', () => {
  const visitor = readStore();
  const beforeHistory = copy(visitor.portfolio_reporting);
  const beforeAssessments = copy(visitor.framework_assessments);
  const beforeReviews = copy(visitor.reviews);
  const beforeForeign = copy(visitor.clients.filter(row => row.client_id !== CID));
  visitor.clients.find(row => row.client_id === CID).notes = 'Disposable first-save preservation check';
  saveStore(visitor); clearFileCache();
  const reloaded = readStore();
  saveStore(reloaded); clearFileCache();
  const repeated = readStore();
  expect(repeated.clients.find(row => row.client_id === CID).notes).toBe('Disposable first-save preservation check');
  expect(repeated.portfolio_reporting.snapshots).toEqual(beforeHistory.snapshots);
  expect(repeated.portfolio_reporting.identities).toEqual(beforeHistory.identities);
  expect(new Set(points(repeated).map(point => point.snapshot_id)).size).toBe(3);
  expect(repeated.framework_assessments).toEqual(beforeAssessments);
  expect(repeated.reviews).toEqual(beforeReviews);
  expect(repeated.clients.filter(row => row.client_id !== CID)).toEqual(beforeForeign);
  for (const source of fresh.portfolio_reporting.snapshots.filter(point => !own(point))) {
    expect(repeated.portfolio_reporting.snapshots.find(point => point.snapshot_id === source.snapshot_id)).toEqual(source);
  }
});

test('the native history API sees preserved points without inventing period coverage or forecast votes', async () => {
  const before = sessionStorage.getItem(STORE_KEY);
  const report = (await api.get('/portfolio/reporting/history', {
    params: {client_id: CID, program_key: 'iso-27001', range: '6m'},
  })).data;
  expect(report.current).toMatchObject({implemented: 121, denominator: 121, percentage: 100});
  expect(report.scenario_context).toBeUndefined();
  expect(report.comparison).toMatchObject({comparable: false, change_pp: null,
    baseline_effective_at_start: false,
    reason: 'The older observation does not establish the state effective at the period boundary.',
    baseline: {effective_at: authored[1].effective_at, implemented: 121, denominator: 121}});
  expect(report.coverage.started_at).toBe(authored[0].captured_at);
  expect(report.snapshots.map(point => point.snapshot_id)).toEqual([points(persisted)[2].snapshot_id]);
  expect(report.forecast_snapshots.some(point => authored.some(source => source.snapshot_id === point.snapshot_id))).toBe(false);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('the existing 36-month native history range reaches both original points and the first-save baseline', async () => {
  const before = sessionStorage.getItem(STORE_KEY);
  const report = (await api.get('/portfolio/reporting/history', {
    params: {client_id: CID, program_key: 'iso-27001', range: '36m'},
  })).data;
  const expected = points(persisted).map(point => ({snapshot_id: point.snapshot_id,
    captured_at: point.captured_at, effective_at: point.effective_at,
    implemented: point.current.implemented, denominator: point.current.denominator,
    percentage: point.current.percentage, observation_kind: point.observation_kind}));
  const actual = report.snapshots.map(point => ({snapshot_id: point.snapshot_id,
    captured_at: point.captured_at, effective_at: point.effective_at,
    implemented: point.implemented, denominator: point.denominator,
    percentage: point.percentage, observation_kind: point.observation_kind}));
  expect(actual).toEqual(expected);
  expect(actual.map(point => point.captured_at)).toEqual([
    '2024-03-18T00:00:00.000Z', '2024-09-20T00:00:00.000Z', runtime,
  ]);
  expect(actual.map(point => point.implemented)).toEqual([118, 121, 121]);
  expect(actual.map(point => point.denominator)).toEqual([121, 121, 121]);
  expect(actual.map(point => point.observation_kind)).toEqual(['demo_fixture', 'demo_fixture', 'current_baseline']);
  expect(actual.every(point => point.effective_at >= '2024-01-01T00:00:00.000Z')).toBe(true);
  expect(report.scenario_context).toBeUndefined();
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('a retained session is authoritative even if its caller presents the prepared source again', () => {
  const retained = readStore();
  const nativeBaseline = copy(points(retained)[2]);
  retained.portfolio_reporting.snapshots = retained.portfolio_reporting.snapshots.filter(point => !own(point)).concat(nativeBaseline);
  delete retained.dunder_demo_prepared_history;
  retained.clients.find(row => row.client_id === CID).notes = 'Existing visitor data is authoritative';
  writePortfolioStore(sessionStorage, STORE_KEY, lightweightStore(retained));
  const attempted = readStore();
  attempted.dunder_demo_prepared_history = copy(fresh.dunder_demo_prepared_history);
  attempted.portfolio_reporting = copy(fresh.portfolio_reporting);
  saveStore(attempted); clearFileCache();
  const reloaded = readStore();
  expect(points(reloaded)).toEqual([nativeBaseline]);
  expect(reloaded.clients.find(row => row.client_id === CID).notes).toBe('Existing visitor data is authoritative');
  expect(reloaded.framework_assessments).toEqual(retained.framework_assessments);
  for (const key of ['snapshots', 'identities', 'scope_events']) {
    expect((reloaded.portfolio_reporting[key] || []).filter(row => !own(row)))
      .toEqual((retained.portfolio_reporting[key] || []).filter(row => !own(row)));
  }
});

test.each([
  ['an authenticated-mode actor', db => { db.user.workspace_mode = 'standard'; }],
  ['a missing preparation marker', db => { delete db.dunder_demo_prepared_history; }],
])('%s cannot admit the fictional points at an empty store boundary', (_label, change) => {
  sessionStorage.removeItem(STORE_KEY); clearFileCache();
  const value = copy(fresh);
  change(value);
  saveStore(value); clearFileCache();
  const retained = readPortfolioStore(sessionStorage.getItem(STORE_KEY));
  expect(points(retained)).toHaveLength(1);
  expect(points(retained)[0].observation_kind).toBe('current_baseline');
  expect(points(retained).some(point => authored.some(source => source.snapshot_id === point.snapshot_id))).toBe(false);
  expect(retained.user).toEqual(value.user);
  expect(retained.framework_assessments).toEqual(value.framework_assessments);
});

test.each(DUNDER_ARTIFACT_DEFINITIONS)('$filename remains exact through the actual first-save and cold-download path', async definition => {
  const before = readStore().evidence.find(row => row.evidence_id === definition.evidence_id);
  expect(before.content_base64).toBeUndefined();
  const result = (await api.get('/evidence/' + definition.evidence_id + '/download', {params: {client_id: CID}})).data;
  expect(result.filename).toBe(definition.filename);
  expect(result.size).toBe(definition.size);
  expect(result.content_base64).toBe(definition.content_base64);
  expect(sha(result.content_base64)).toBe(definition.sha256);
  expect(readStore().evidence.find(row => row.evidence_id === definition.evidence_id).content_base64).toBeUndefined();
  expect(points(readStore())).toEqual(points(persisted));
});
