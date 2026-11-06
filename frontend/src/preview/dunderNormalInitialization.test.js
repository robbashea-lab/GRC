import {seedStore, readStore, saveStore, resetStore, write, clone, STORE_KEY} from './store';
import {clearFileCache, restoreFiles} from './evidenceStorage';
import * as dunderScenario from './programs/dunderEightYearScenario';
import {DUNDER_ID as CID, DUNDER_SCENARIO_VERSION, EIGHT_YEAR_ANCHOR} from './programs/isoSocEightYearSupport';

const RUNTIME = '2026-11-05T12:00:00.000Z';
const FLAGS = ['REACT_APP_PREVIEW', 'REACT_APP_STANDARD_SIGN_IN',
  'REACT_APP_DUNDER_EIGHT_YEAR_QA', 'REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA'];
const client = db => db.clients.find(row => row.client_id === CID);
const foreign = row => row.client_id !== CID && !row.program_id?.startsWith(CID + ':');
const foreignArrays = db => Object.fromEntries(Object.entries(db)
  .filter(([kind, value]) => kind !== 'users' && Array.isArray(value)).map(([kind, rows]) => [kind, rows.filter(foreign)]));
const history = db => JSON.stringify({
  assessments: db.framework_assessments.filter(row => row.client_id === CID).map(row => row.assessment_history),
  reviews: db.reviews.filter(row => row.client_id === CID).map(row => row.occurrences),
});
let prior, legacy, normal, savedNormal, normalForeign;

function normalFlags() {
  process.env.REACT_APP_PREVIEW = 'true';
  process.env.REACT_APP_STANDARD_SIGN_IN = 'true';
  delete process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA;
  delete process.env.REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA;
}

beforeAll(() => {
  prior = Object.fromEntries(FLAGS.map(key => [key, process.env[key]]));
  jest.useFakeTimers({doNotFake: ['performance']});
  jest.setSystemTime(new Date(RUNTIME));
  sessionStorage.clear(); localStorage.clear(); clearFileCache();
  normalFlags();
  process.env.REACT_APP_PREVIEW = 'false';
  legacy = seedStore(new Date(RUNTIME));
  process.env.REACT_APP_PREVIEW = 'true';
  normal = seedStore(new Date(RUNTIME));
  normalForeign = JSON.stringify(foreignArrays(normal));
  saveStore(normal, {resetFiles: true});
  savedNormal = sessionStorage.getItem(STORE_KEY);
});

beforeEach(() => {
  normalFlags();
  jest.setSystemTime(new Date(RUNTIME));
  sessionStorage.clear(); localStorage.clear(); clearFileCache();
  sessionStorage.setItem(STORE_KEY, savedNormal);
});

afterEach(() => { jest.restoreAllMocks(); });
afterAll(() => {
  for (const [key, value] of Object.entries(prior)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  jest.useRealTimers();
  sessionStorage.clear(); localStorage.clear(); clearFileCache();
});

test('normal Preview installs the full fixed Dunder source while foreign clients keep the real clock', () => {
  expect(new Date().toISOString()).toBe(RUNTIME);
  expect(client(legacy).demo_program_version).not.toBe(DUNDER_SCENARIO_VERSION);
  expect(client(normal).demo_program_version).toBe(DUNDER_SCENARIO_VERSION);
  expect(normal.dunder_demo_artifacts.anchor).toBe(EIGHT_YEAR_ANCHOR);
  expect(normal.cis_demo_refresh.anchor).toBe('2026-11-05T00:00:00.000Z');
  expect(normalForeign).toBe(JSON.stringify(foreignArrays(legacy)));
  for (const user of legacy.users) expect(normal.users.find(row => row.user_id === user.user_id)).toEqual(user);
  for (const key of ['snapshots', 'identities', 'scope_events']) {
    expect((normal.portfolio_reporting[key] || []).filter(foreign)).toEqual((legacy.portfolio_reporting[key] || []).filter(foreign));
  }
  expect(normal.framework_assessments.filter(row => row.client_id === CID)).toHaveLength(123);
  const reviews = normal.reviews.filter(row => row.client_id === CID);
  expect(reviews).toHaveLength(129);
  expect(reviews.reduce((count, row) => count + row.occurrences.length, 0)).toBe(524);
  expect(normal.evidence.filter(row => row.client_id === CID)).toHaveLength(32);
});

test('normal Preview before the source anchor retains legacy Dunder rather than importing future completions', () => {
  const clock = new Date('2026-11-01T23:59:59.999Z');
  jest.setSystemTime(clock);
  const db = seedStore(clock);
  expect(client(db).demo_program_version).not.toBe(DUNDER_SCENARIO_VERSION);
  expect(db.dunder_demo_artifacts).toBeUndefined();
  expect(db.reviews.filter(row => row.client_id === CID).flatMap(row => row.occurrences || [])
    .every(row => !row.completed_at || Date.parse(row.completed_at) <= +clock)).toBe(true);
});

test.each([EIGHT_YEAR_ANCHOR, '2030-11-02T12:00:00.000Z'])('normal source at %s keeps Dunder fixed without freezing the CIS cohort', at => {
  const clock = new Date(at);
  jest.setSystemTime(clock);
  const db = seedStore(clock);
  expect(client(db).demo_program_version).toBe(DUNDER_SCENARIO_VERSION);
  expect(db.dunder_demo_artifacts.anchor).toBe(EIGHT_YEAR_ANCHOR);
  expect(db.cis_demo_refresh.anchor).toBe(at.slice(0, 10) + 'T00:00:00.000Z');
  const occurrences = db.reviews.filter(row => row.client_id === CID).flatMap(row => row.occurrences || []);
  expect(occurrences).toHaveLength(524);
  expect(occurrences.every(row => row.completed_at <= EIGHT_YEAR_ANCHOR)).toBe(true);
});

test('retained legacy visitor state is not installed or prepared when either private flag later appears', () => {
  const visitor = clone(legacy);
  client(visitor).notes = 'Keep the existing visitor Dunder dataset';
  visitor.ai_intake = {...visitor.ai_intake, [CID]: {usage: 'unsure', indicators: [], updated_at: RUNTIME}};
  const expectedClient = clone(client(visitor)), originalHistory = history(visitor);
  // Native compaction re-appends inherited keys; retain its exact expanded representation.
  const baseline = restoreFiles(saveStore(visitor, {resetFiles: true}));
  expect(JSON.parse(history(baseline))).toEqual(JSON.parse(originalHistory));
  const expectedHistory = history(baseline);
  process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA = 'true';
  process.env.REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA = 'true';
  const constructor = jest.spyOn(dunderScenario, 'createDunderEightYearCandidate');
  const reloaded = readStore();
  expect(constructor).not.toHaveBeenCalled();
  expect(client(reloaded)).toEqual(expectedClient);
  expect(reloaded.ai_intake[CID]).toEqual(visitor.ai_intake[CID]);
  expect(history(reloaded)).toBe(expectedHistory);
  expect(reloaded.dunder_demo_artifacts).toBeUndefined();
});

test('normal visitor edits, AI disclosure, history and a same-name custom client survive reload without reseeding', () => {
  const visitor = readStore();
  client(visitor).notes = 'Keep the current visitor note';
  visitor.ai_intake[CID] = {...visitor.ai_intake[CID], usage: 'no', indicators: [], updated_at: RUNTIME};
  const custom = write(visitor, 'clients', {name: 'Dunder Mifflin', environment: 'Demo', notes: 'Visitor-created client'});
  const expectedCustom = clone(custom), expectedHistory = history(visitor);
  saveStore(visitor);
  const constructor = jest.spyOn(dunderScenario, 'createDunderEightYearCandidate');
  const reloaded = readStore();
  expect(constructor).not.toHaveBeenCalled();
  expect(client(reloaded).notes).toBe('Keep the current visitor note');
  expect(reloaded.ai_intake[CID]).toEqual(visitor.ai_intake[CID]);
  expect(history(reloaded)).toBe(expectedHistory);
  expect(custom.client_id).not.toBe(CID);
  expect(reloaded.clients.find(row => row.client_id === custom.client_id)).toEqual(expectedCustom);
  for (const kind of ['framework_assessments', 'reviews', 'risks', 'policies', 'vendors', 'ai_systems', 'evidence']) {
    expect(reloaded[kind].filter(row => row.client_id === custom.client_id)).toEqual([]);
  }
});

test('explicit private full-source and onboarding modes keep their precedence', () => {
  process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA = 'true';
  process.env.REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA = 'true';
  const full = seedStore(new Date(RUNTIME));
  expect(client(full).demo_program_version).toBe(DUNDER_SCENARIO_VERSION);
  expect(full.cis_demo_refresh.anchor).toBe(EIGHT_YEAR_ANCHOR);
  expect(full.baselines[CID].completed).toBe(true);
  delete process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA;
  const setup = seedStore(new Date(EIGHT_YEAR_ANCHOR));
  expect(setup.baselines[CID].completed).toBe(false);
  expect(setup.framework_assessments.filter(row => row.client_id === CID)).toEqual([]);
  expect(setup.dunder_demo_artifacts).toBeUndefined();
});

test('only an explicit native Reset replaces visitor changes with the normal canonical source', () => {
  const visitor = readStore();
  client(visitor).notes = 'An explicitly reset visitor note';
  saveStore(visitor);
  resetStore();
  const reset = readStore();
  expect(client(reset).demo_program_version).toBe(DUNDER_SCENARIO_VERSION);
  expect(client(reset).notes).toBe(client(normal).notes);
  expect(reset.dunder_demo_artifacts.anchor).toBe(EIGHT_YEAR_ANCHOR);
  expect(reset.cis_demo_refresh.anchor).toBe('2026-11-05T00:00:00.000Z');
});

test('fresh constructor errors propagate without persisting a legacy fallback', () => {
  sessionStorage.removeItem(STORE_KEY);
  jest.spyOn(dunderScenario, 'createDunderEightYearCandidate').mockImplementationOnce(() => {
    throw new Error('Synthetic Dunder admission failure');
  });
  expect(() => readStore()).toThrow('Synthetic Dunder admission failure');
  expect(sessionStorage.getItem(STORE_KEY)).toBeNull();
});

test('native persistence errors retain the saved visitor source and report failure', () => {
  const before = sessionStorage.getItem(STORE_KEY), visitor = readStore();
  client(visitor).notes = 'This edit must not be reported as saved';
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
  });
  expect(() => saveStore(visitor)).toThrow('Changes were not saved');
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('the combined sign-in and Demo bundle keeps standard API requests on HTTP without seeding Demo', async () => {
  sessionStorage.clear();
  let standard;
  jest.isolateModules(() => { standard = require('../lib/api'); });
  standard.setWorkspaceMode('standard');
  standard.setAccessToken('synthetic-standard-token');
  const http = jest.fn(async config => ({data: {standard: true}, status: 200, statusText: 'OK', headers: {}, config}));
  standard.default.defaults.adapter = http;
  expect(standard.DEMO_AVAILABLE).toBe(true);
  expect(standard.STANDARD_AUTH_ENABLED).toBe(true);
  expect((await standard.default.get('/clients')).data).toEqual({standard: true});
  expect(http).toHaveBeenCalledTimes(1);
  expect(http.mock.calls[0][0].withCredentials).toBe(true);
  expect(http.mock.calls[0][0].headers.Authorization).toBe('Bearer synthetic-standard-token');
  const denied = new Error('Synthetic signed-in API rejection');
  http.mockRejectedValueOnce(denied);
  await expect(standard.default.get('/auth/me')).rejects.toBe(denied);
  expect(http).toHaveBeenCalledTimes(2);
  expect(sessionStorage.getItem(STORE_KEY)).toBeNull();
  expect(sessionStorage.getItem('grc_demo_entered')).toBeNull();
});
