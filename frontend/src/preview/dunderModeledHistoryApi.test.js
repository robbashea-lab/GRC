import axios from 'axios';
import {DUNDER_ISO_HISTORY_VERSION} from '../lib/demoClients';
import {canConnectHistoryPositions, forecastImplementation, isDunderModeledHistoryPosition} from '../lib/portfolioProgress';
import {previewAdapter} from './adapter';
import {clearFileCache, lightweightStore} from './evidenceStorage';
import {readPortfolioStore, writePortfolioStore, portfolioReportingRequest} from './portfolioReporting';
import {readStore, STORE_KEY} from './store';
import {getDunderDemoScenarioContext} from './programs/dunderPreparedHistory';
import {DUNDER_ID as CID, EIGHT_YEAR_ANCHOR as anchor, copy} from './programs/isoSocEightYearSupport';

const api = axios.create({adapter: previewAdapter});
const runtime = '2026-11-03T12:00:00.000Z';
const program = CID + ':iso-27001';
const points = db => db.portfolio_reporting.snapshots.filter(point => point.program_id === program);
const history = (range = '6m', extra = {}) => api.get('/portfolio/reporting/history', {
  params: {client_id: CID, program_key: 'iso-27001', range, demo_scenario: DUNDER_ISO_HISTORY_VERSION, ...extra},
}).then(response => response.data);
const retain = db => { writePortfolioStore(sessionStorage, STORE_KEY, lightweightStore(db)); clearFileCache(); };
let originalEnv, saved, originals;

beforeAll(() => {
  originalEnv = Object.fromEntries(['REACT_APP_PREVIEW', 'REACT_APP_DUNDER_EIGHT_YEAR_QA',
    'REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA'].map(key => [key, process.env[key]]));
  process.env.REACT_APP_PREVIEW = 'true'; process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA = 'true';
  delete process.env.REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA;
  jest.useFakeTimers({doNotFake: ['performance']}); jest.setSystemTime(new Date(runtime));
  sessionStorage.clear(); localStorage.clear(); clearFileCache();
  const fresh = readStore();
  originals = copy(points(fresh));
  saved = sessionStorage.getItem(STORE_KEY);
  clearFileCache();
});

beforeEach(() => {
  jest.setSystemTime(new Date(runtime));
  sessionStorage.clear(); localStorage.clear(); clearFileCache();
  sessionStorage.setItem(STORE_KEY, saved); sessionStorage.setItem('grc_demo_entered', 'true');
});

afterAll(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  jest.useRealTimers(); sessionStorage.clear(); localStorage.clear(); clearFileCache();
});

test.each(['1m', '3m', '6m', '12m'])('%s explicitly requested modeled comparison reports zero change without extending the source interval', async range => {
  const before = sessionStorage.getItem(STORE_KEY), report = await history(range);
  expect(report.scenario_context).toMatchObject({version: DUNDER_ISO_HISTORY_VERSION,
    client_id: CID, program_id: program, anchor, point_ids: originals.map(point => point.snapshot_id)});
  expect(Object.keys(report.scenario_context).sort()).toEqual(['version', 'client_id', 'program_id', 'anchor', 'fingerprint', 'point_ids'].sort());
  expect(report.comparison).toMatchObject({comparable: true, baseline_effective_at_start: true,
    calculation_basis: 'demo_scenario', change_pp: 0, change_implemented: 0,
    baseline: {snapshot_id: originals[1].snapshot_id, implemented: 121, denominator: 121,
      modeled_until: anchor, observation_kind: 'demo_fixture'}});
  expect(report.comparison.reason).toMatch(/Illustrative demo scenario/);
  expect(report.snapshots.map(point => point.observation_kind)).toEqual(['current_baseline']);
  expect(report.forecast_snapshots.map(point => point.observation_kind)).toEqual(['current_baseline']);
  expect(report.forecast_snapshots.every(point => !Object.hasOwn(point, 'modeled_until') && !Object.hasOwn(point, 'scenario_version'))).toBe(true);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect(points(readPortfolioStore(before)).slice(0, 2)).toEqual(originals);
});

test.each([undefined, 'unapproved-version', 'brawndo-cis-ig1-history-v2'])('request version %s cannot enable Dunder modeled comparison', async version => {
  const before = sessionStorage.getItem(STORE_KEY), report = await history('6m', {demo_scenario: version});
  expect(report.scenario_context).toBeUndefined();
  expect(report.comparison).toMatchObject({comparable: false, change_pp: null, baseline_effective_at_start: false});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('36 months reaches the exact two projected source points and the disconnected raw first-save baseline', async () => {
  const before = sessionStorage.getItem(STORE_KEY), retained = points(readStore());
  const report = await history('36m');
  expect(report.snapshots.map(point => point.snapshot_id)).toEqual(retained.map(point => point.snapshot_id));
  expect(report.snapshots.map(point => point.captured_at)).toEqual(['2024-03-18T00:00:00.000Z', '2024-09-20T00:00:00.000Z', runtime]);
  expect(report.snapshots.map(point => [point.implemented, point.denominator])).toEqual([[118, 121], [121, 121], [121, 121]]);
  expect(report.snapshots.map(point => point.modeled_until)).toEqual([originals[1].effective_at, anchor, undefined]);
  expect(report.comparison).toMatchObject({comparable: false, baseline: null, change_pp: null, baseline_effective_at_start: false});
  expect(canConnectHistoryPositions(report.snapshots[0], report.snapshots[1], {demoScenario: report.scenario_context})).toBe(true);
  expect(canConnectHistoryPositions(report.snapshots[1], report.snapshots[2], {demoScenario: report.scenario_context})).toBe(false);
  expect(report.snapshots.every(point => point.effective_at >= '2024-01-01T00:00:00.000Z')).toBe(true);
  for (const point of report.snapshots.slice(0, 2)) {
    expect(isDunderModeledHistoryPosition(point, report.scenario_context)).toBe(true);
    expect(point.continuity_proven).toBeUndefined(); expect(point.effective_until).toBeUndefined();
    expect(point.join_snapshot_id).toBeUndefined(); expect(point.held_until).toBeUndefined();
  }
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect(points(readPortfolioStore(before)).slice(0, 2)).toEqual(originals);
});

test('a period starting after the anchor remains unavailable without a later native boundary observation', async () => {
  jest.setSystemTime(new Date('2026-12-05T12:00:00.000Z'));
  const before = sessionStorage.getItem(STORE_KEY), report = await history('1m');
  expect(report.period_start > anchor).toBe(true);
  expect(report.comparison).toMatchObject({comparable: false, change_pp: null, baseline_effective_at_start: false});
  expect(report.snapshots).toEqual([]);
  expect(report.forecast_snapshots).toHaveLength(1);
  expect(report.forecast_snapshots[0].observation_kind).toBe('current_baseline');
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test.each(['1m', '3m', '6m', '12m'])('compact Portfolio overview %s remains observed-only for every client', async range => {
  const before = sessionStorage.getItem(STORE_KEY);
  const report = (await api.get('/portfolio/reporting/overview', {params: {range}})).data;
  const dunder = report.programs.find(row => row.program_id === program);
  expect(dunder.comparison).toMatchObject({comparable: false, baseline_effective_at_start: false, change_pp: null});
  expect(dunder.comparison_90d).toMatchObject({comparable: false, baseline_effective_at_start: false, change_pp: null});
  expect(dunder.snapshots_90d).toHaveLength(1);
  expect(dunder.snapshots_90d[0]).not.toHaveProperty('modeled_until');
  expect(dunder.snapshots_90d[0]).not.toHaveProperty('scenario_version');
  const unqualified = readStore(); delete unqualified.dunder_demo_modeled_history;
  const native = portfolioReportingRequest(unqualified, '/portfolio/reporting/overview', {range});
  expect(report.programs).toEqual(native.programs);
  expect(report.clients).toEqual(native.clients);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('a genuine later narrative save preserves the original source proof and uses the current native revision', async () => {
  const before = readStore(), row = before.framework_assessments.find(value => value.client_id === CID && value.definition_id === 'A.5.1');
  const prefix = copy(row.assessment_history), originalRevision = before.portfolio_reporting.identities.find(value => value.program_id === program).head.revision;
  await api.patch('/framework_assessments/' + row.framework_assessment_id,
    {expected_last_assessed: row.last_saved ?? row.last_assessed ?? null, notes: row.notes + '\nDisposable native narrative edit.'});
  clearFileCache();
  const reloaded = readStore(), savedRow = reloaded.framework_assessments.find(value => value.framework_assessment_id === row.framework_assessment_id);
  expect(savedRow.assessment_history.slice(0, prefix.length)).toEqual(prefix);
  expect(savedRow.assessment_history).toHaveLength(prefix.length + 1);
  expect(reloaded.portfolio_reporting.identities.find(value => value.program_id === program).head.revision).toBeGreaterThan(originalRevision);
  expect(points(reloaded).slice(0, 2)).toEqual(originals);
  const report = await history('6m');
  expect(report.scenario_context).toBeDefined();
  expect(report.current.source_revision).not.toBe(points(before).at(-1).current.source_revision);
  expect(report.comparison).toMatchObject({comparable: true, change_pp: 0, calculation_basis: 'demo_scenario'});
});

test('a genuine incomplete assessment save changes native counts without turning modeled points into forecast votes', async () => {
  const before = readStore(), row = before.framework_assessments.find(value => value.client_id === CID && value.definition_id === 'A.5.1');
  await api.patch('/framework_assessments/' + row.framework_assessment_id,
    {expected_last_assessed: row.last_saved ?? row.last_assessed ?? null, status: 'in_progress'});
  clearFileCache();
  const report = await history('6m');
  expect(report.current).toMatchObject({implemented: 120, denominator: 121});
  expect(report.comparison).toMatchObject({comparable: true, calculation_basis: 'demo_scenario', change_implemented: -1});
  expect(report.comparison.change_pp).toBeCloseTo(-100 / 121, 10);
  expect(report.forecast_snapshots.every(point => point.observation_kind !== 'demo_fixture')).toBe(true);
  const forecast = forecastImplementation(report.forecast_snapshots, report.current, report.as_of, {demoScenario: report.scenario_context});
  expect(forecast).toMatchObject({ok: false, days: null, monthly_pace: null});
  expect(forecast.reason).toMatch(/at least three genuine positions/);
  expect(points(readStore()).slice(0, 2)).toEqual(originals);
});

test('a native applicability change keeps the source history but reports the changed scope separately', async () => {
  const before = readStore(), row = before.framework_assessments.find(value => value.client_id === CID && value.definition_id === 'A.5.1');
  await api.patch('/framework_assessments/' + row.framework_assessment_id, {
    expected_last_assessed: row.last_saved ?? row.last_assessed ?? null,
    soa_applicability: 'excluded', soa_justification: 'Disposable scope-change test; not a customer exclusion.',
  });
  clearFileCache();
  const report = await history('6m');
  expect(report.scenario_context).toBeDefined();
  expect(report.current.denominator).toBe(120);
  expect(report.comparison).toMatchObject({comparable: false, scope_changed: true});
  expect(report.scope_changes.some(change => change.removed_ids.includes('A.5.1'))).toBe(true);
  expect(points(readStore()).slice(0, 2)).toEqual(originals);
});

test('retained preservation-only data is not implicitly enrolled into modeled history', async () => {
  const old = readStore(); delete old.dunder_demo_modeled_history;
  retain(old);
  const before = sessionStorage.getItem(STORE_KEY), reloaded = readStore();
  expect(reloaded.dunder_demo_modeled_history).toBeUndefined();
  expect(points(reloaded).slice(0, 2)).toEqual(originals);
  const report = await history('6m');
  expect(report.scenario_context).toBeUndefined(); expect(report.comparison.comparable).toBe(false);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test.each([
  ['authenticated mode', db => { db.user.workspace_mode = 'standard'; }],
  ['changed full historical answer', db => { db.framework_assessments.find(row => row.client_id === CID).assessment_history[0].implementation += ' Altered source'; }],
  ['changed original point', db => { points(db)[0].current.implemented -= 1; }],
  ['held metadata', db => { points(db)[1].current.provenance.held_until = runtime; }],
])('%s cannot gain modeled eligibility through the API', async (_label, change) => {
  const value = readStore(); change(value); retain(value);
  const before = sessionStorage.getItem(STORE_KEY);
  expect(getDunderDemoScenarioContext(readStore(), CID, runtime)).toBeNull();
  const report = await history('6m');
  expect(report.scenario_context).toBeUndefined(); expect(report.comparison.comparable).toBe(false);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test.each([undefined, DUNDER_ISO_HISTORY_VERSION])('a forged continuity flag cannot qualify a source fixture with request context %s', async version => {
  const value = readStore(), source = points(value)[1];
  source.current.continuity_proven = true; source.current.effective_until = runtime;
  if (version === undefined) delete value.dunder_demo_modeled_history;
  retain(value);
  const before = sessionStorage.getItem(STORE_KEY), report = await history('6m', {demo_scenario: version});
  expect(report.scenario_context).toBeUndefined();
  expect(report.comparison).toMatchObject({comparable: false, baseline_effective_at_start: false, change_pp: null});
  expect(canConnectHistoryPositions(source, points(value).at(-1), {demoScenario: report.scenario_context})).toBe(false);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('the context respects native same-client readers and cannot grant a foreign tenant access', async () => {
  const allowed = readStore(); allowed.user = {...allowed.user, role: 'client_readonly', client_ids: [CID]};
  retain(allowed);
  const report = await history('6m');
  expect(report.scenario_context).toBeDefined(); expect(report.comparison.calculation_basis).toBe('demo_scenario');
  const before = sessionStorage.getItem(STORE_KEY), row = allowed.framework_assessments.find(value => value.client_id === CID);
  await expect(api.patch('/framework_assessments/' + row.framework_assessment_id, {notes: 'Not permitted'})).rejects.toMatchObject({response: {status: 403}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  const foreign = readStore(); foreign.user = {...foreign.user, client_ids: ['demo_prestige']}; retain(foreign);
  const foreignBefore = sessionStorage.getItem(STORE_KEY);
  await expect(history('6m')).rejects.toMatchObject({response: {status: 403}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(foreignBefore);
});

test('the Dunder version cannot enable another program or an unknown lookalike client', async () => {
  const before = sessionStorage.getItem(STORE_KEY);
  const prestige = await history('6m', {client_id: 'demo_prestige', program_key: 'soc-2'});
  expect(prestige.scenario_context).toBeUndefined();
  await expect(history('6m', {client_id: 'custom_dunder'})).rejects.toMatchObject({response: {status: 404}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('an existing custom ISO client with copied display metadata receives only its native state', async () => {
  const value = readStore(), custom = 'synthetic_custom_iso';
  value.clients.push({...copy(value.clients.find(row => row.client_id === CID)), client_id: custom});
  value.baselines[custom] = copy(value.baselines[CID]);
  value.requirements.push(...value.requirements.filter(row => row.client_id === CID && row.baseline_key === 'iso-27001')
    .map(row => ({...copy(row), client_id: custom, requirement_id: custom + ':' + row.requirement_id})));
  value.framework_assessments.push(...value.framework_assessments.filter(row => row.client_id === CID)
    .map(row => ({...copy(row), client_id: custom, framework_assessment_id: custom + ':' + row.framework_assessment_id})));
  retain(value);
  const before = sessionStorage.getItem(STORE_KEY), report = await history('6m', {client_id: custom});
  expect(report.program_id).toBe(custom + ':iso-27001');
  expect(report.current).toMatchObject({implemented: 121, denominator: 121, percentage: 100});
  expect(report.scenario_context).toBeUndefined(); expect(report.snapshots).toEqual([]);
  expect(report.comparison).toMatchObject({comparable: false, baseline: null});
  expect(points(readStore()).slice(0, 2)).toEqual(originals);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});
