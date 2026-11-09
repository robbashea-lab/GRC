import axios from 'axios';
import {previewAdapter} from '../adapter';
import {seedStore, readStore, saveStore, clone, STORE_KEY} from '../store';
import {clearFileCache} from '../evidenceStorage';
import {stable} from '../commandRequests';
import {activeDefinitions, activePlans, FRAMEWORKS} from '../../lib/frameworks';
import {namedDemoClient} from '../../lib/demoClients';
import {socGuidedCatalog} from '../../lib/socGuidedAssessment';
import * as fixtureInstaller from './prestigeEightYearFixture';
import prestigeEightYearFixtureData from './prestigeEightYearFixtureData.json';
import {getPrestigeDemoScenarioContext} from './prestigePreparedHistory';

const CID = 'demo_prestige', PROGRAM = CID + ':soc-2';
const RUNTIME = '2026-11-08T12:00:00.000Z', VERSION = 'prestige-eight-year-v1';
const NativeDate = global.Date, fixtureTime = NativeDate.parse(RUNTIME);
class FixtureDate extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [fixtureTime])); }
  static now() { return fixtureTime; }
}
const FLAGS = ['REACT_APP_PREVIEW', 'REACT_APP_STANDARD_SIGN_IN', 'REACT_APP_DUNDER_EIGHT_YEAR_QA',
  'REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA', 'REACT_APP_PRESTIGE_EIGHT_YEAR_ONBOARDING_QA'];
const api = axios.create({adapter: previewAdapter});
const owned = (db, kind, cid = CID) => (db[kind] || []).filter(row => row.client_id === cid);
const foreign = row => row?.client_id !== CID && row?.program_id !== PROGRAM;
const client = db => db.clients.find(row => row.client_id === CID);
const withoutPrestige = map => Object.fromEntries(Object.entries(map || {}).filter(([key, value]) => {
  if (key === CID || !foreign(value)) return false;
  if (key.startsWith('[')) {
    const scope = JSON.parse(key);
    if (Array.isArray(scope) && scope[1] === CID) return false;
  }
  return true;
}));
const identities = db => db.clients.map(row => ({client_id: row.client_id, name: row.name,
  environment: row.environment, primary_contact_id: row.primary_contact_id,
  assigned_owner_id: row.assigned_owner_id, logo: namedDemoClient(row.client_id)?.logo}));

function normalFlags() {
  process.env.REACT_APP_PREVIEW = 'true';
  process.env.REACT_APP_STANDARD_SIGN_IN = 'true';
  for (const key of FLAGS.slice(2)) delete process.env[key];
}

let originalFlags, beforePrestige, fresh, savedFresh;
beforeAll(() => {
  originalFlags = Object.fromEntries(FLAGS.map(key => [key, process.env[key]]));
  // Jest 27 does not support doNotFake. Replace Date alone; leave all scheduling and performance native.
  global.Date = FixtureDate;
  normalFlags();
  sessionStorage.clear(); localStorage.clear(); clearFileCache();
  // Dunder creates legitimate native IDs during seeding; compare this installation's exact input.
  const nativeInstall = fixtureInstaller.installPrestigeEightYearFixture;
  const capture = jest.spyOn(fixtureInstaller, 'installPrestigeEightYearFixture').mockImplementation((source, ...args) => {
    beforePrestige = clone(source);
    return nativeInstall(source, ...args);
  });
  try {
    fresh = seedStore(new Date(RUNTIME));
    expect(capture).toHaveBeenCalledTimes(1);
  } finally { capture.mockRestore(); }
  saveStore(fresh, {resetFiles: true});
  savedFresh = sessionStorage.getItem(STORE_KEY);
});
beforeEach(() => {
  normalFlags();
  global.Date = FixtureDate;
  sessionStorage.clear(); localStorage.clear(); clearFileCache();
  sessionStorage.setItem(STORE_KEY, savedFresh);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  for (const [key, value] of Object.entries(originalFlags)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  global.Date = NativeDate;
  sessionStorage.clear(); localStorage.clear(); clearFileCache();
});

test('normal fresh Preview installs the canonical cohort without changing client identities, order, logos or foreign records', () => {
  expect(client(beforePrestige).demo_program_version).not.toBe(VERSION);
  expect(client(fresh).demo_program_version).toBe(VERSION);
  expect(identities(fresh)).toEqual(identities(beforePrestige));
  expect(new Set(fresh.clients.map(row => row.client_id))).toEqual(new Set([
    'demo_brawndo', 'demo_initech', 'demo_krusty_krab', 'demo_dunder', CID]));
  expect(namedDemoClient(CID)).toMatchObject({name: 'Prestige Worldwide', logo: '/client-logos/prestige-worldwide.svg'});
  for (const [kind, value] of Object.entries(beforePrestige)) if (Array.isArray(value))
    expect(fresh[kind].filter(foreign)).toEqual(value.filter(foreign));
  expect(fresh.users).toEqual(beforePrestige.users);
  expect(fresh.contacts).toEqual(beforePrestige.contacts);
  for (const key of ['baselines', 'drafts', 'ai_intake', 'ai_counters', 'riskSequences',
    'create_requests', 'vendor_action_requests', 'command_requests', 'guided_assessment_pilot', 'guided_assessment_history'])
    expect(withoutPrestige(fresh[key])).toEqual(withoutPrestige(beforePrestige[key]));
  for (const [key, value] of Object.entries(beforePrestige.portfolio_reporting)) {
    if (Array.isArray(value)) expect(fresh.portfolio_reporting[key].filter(foreign)).toEqual(value.filter(foreign));
    else if (key === 'activity_proofs') expect(withoutPrestige(fresh.portfolio_reporting[key])).toEqual(withoutPrestige(value));
  }
  for (const [kind, count] of Object.entries({framework_assessments: 38, organizational_controls: 25, risks: 31, evidence: 14}))
    expect(owned(fresh, kind)).toHaveLength(count);
  expect(owned(fresh, 'organizational_controls').reduce((count, row) => count + row.observations.length, 0)).toBe(31);
  expect(owned(fresh, 'framework_assessments').every(row => row.status === 'addressed')).toBe(true);
  expect(fresh.riskSequences[CID]).toBe(31);
});

test('real native fresh entry and save/read keep the qualified historical proof after warm and cold cache reloads', async () => {
  sessionStorage.clear(); clearFileCache();
  const entered = await api.post('/demo/enter', {});
  expect(entered.data.user.workspace_mode).toBe('demo');
  expect((await api.get('/clients')).data.map(row => row.client_id)).toEqual(fresh.clients.map(row => row.client_id));
  const warm = readStore(), expectedPoints = warm.prestige_eight_year_fixture.history.point_ids;
  expect(warm.prestige_eight_year_fixture.history.fingerprint_format).toBe('stable-json-v1');
  expect(getPrestigeDemoScenarioContext(warm, CID, RUNTIME)).toMatchObject({version: VERSION, client_id: CID, point_ids: expectedPoints});
  expect(expectedPoints).toHaveLength(8);
  saveStore(warm);
  clearFileCache();
  const saved = sessionStorage.getItem(STORE_KEY), cold = readStore();
  expect(cold.prestige_eight_year_fixture.history.fingerprint_format).toBe('stable-json-v1');
  expect(getPrestigeDemoScenarioContext(cold, CID, RUNTIME)).toEqual(getPrestigeDemoScenarioContext(warm, CID, RUNTIME));
  expect(getPrestigeDemoScenarioContext(cold, CID, RUNTIME)).not.toBeNull();
  expect(sessionStorage.getItem(STORE_KEY)).toBe(saved);
  for (const [kind, count] of Object.entries({framework_assessments: 38, organizational_controls: 25, risks: 31, evidence: 14}))
    expect(owned(cold, kind)).toHaveLength(count);
  for (const pointId of expectedPoints)
    expect(cold.portfolio_reporting.snapshots.filter(row => row.snapshot_id === pointId)).toHaveLength(1);
});

test('unpatched rollout defaults preserve the materialized authored-V2 personal interviews across cold reload without grafting new questions',()=>{
  expect(socGuidedCatalog.version).toBe('soc2-assessment-rollout-1');
  const warm=readStore();
  const ownGuided=db=>Object.fromEntries(Object.entries(db.guided_assessment_pilot||{}).filter(([,draft])=>draft.client_id===CID));
  // The installer copies these authored native identities verbatim; do not derive
  // the preservation oracle from already-initialized records.
  expect(ownGuided(warm)).toEqual(prestigeEightYearFixtureData.payload.guided.guided_assessment_pilot);
  expect(owned(warm,'framework_assessments')).toEqual(prestigeEightYearFixtureData.payload.collections.framework_assessments);
  const before=clone(ownGuided(warm));expect(Object.keys(before)).toHaveLength(38);
  const definitions=new Map(owned(warm,'framework_assessments').map(row=>[row.framework_assessment_id,row.definition_id]));
  for(const draft of Object.values(before)){
    expect(draft.version).toBe('soc2-omni-2');expect(typeof draft.narrative).toBe('string');expect(draft.narrative.trim().length).toBeGreaterThan(0);
    expect(Object.keys(draft.answers).length).toBeGreaterThan(0);
    const id=definitions.get(draft.assessment_id);expect(id).toBeDefined();
    const context=socGuidedCatalog.definitions[id].groups.find(group=>group.id==='implementation_context');expect(context).toBeDefined();
    for(const question of context.questions)expect(Object.hasOwn(draft.answers,question.id)).toBe(false);
  }
  const saved=sessionStorage.getItem(STORE_KEY);clearFileCache();
  const cold=readStore();expect(ownGuided(cold)).toEqual(before);expect(sessionStorage.getItem(STORE_KEY)).toBe(saved);
  expect(owned(cold,'framework_assessments')).toEqual(owned(warm,'framework_assessments'));
});

test('a retained pre-refresh session keeps visitor notes and onboarding draft without adding the new fixture', () => {
  const retained = clone(beforePrestige);
  client(retained).notes = 'Retain this visitor-owned Prestige note.';
  const draft = {version: 3, step: 2, selected_policy_keys: [], policies: {}, requirements: {'soc-2': 'unsure'},
    notes: 'Unfinished visitor decision; do not replace it with the canonical scenario.'};
  retained.drafts[CID] = clone(draft);
  const originalCounts = Object.fromEntries(['framework_assessments', 'organizational_controls', 'risks', 'vendors', 'evidence']
    .map(kind => [kind, owned(retained, kind).length]));
  saveStore(retained, {resetFiles: true});
  clearFileCache();
  const install = jest.spyOn(fixtureInstaller, 'installPrestigeEightYearFixture');
  const reloaded = readStore();
  expect(install).not.toHaveBeenCalled();
  expect(client(reloaded).notes).toBe(client(retained).notes);
  expect(reloaded.drafts[CID]).toEqual(draft);
  expect(reloaded.prestige_eight_year_fixture).toBeUndefined();
  expect(client(reloaded).demo_program_version).not.toBe(VERSION);
  for (const [kind, count] of Object.entries(originalCounts)) expect(owned(reloaded, kind)).toHaveLength(count);
});

test('a same-name disposable new client follows native SOC onboarding without inheriting fictional operating history', async () => {
  await api.post('/demo/enter', {});
  const {data: created} = await api.post('/clients', {name: 'Prestige Worldwide', environment: 'Demo',
    notes: 'Disposable Jest-only normal onboarding client.'}, {headers: {'Idempotency-Key': 'prestige-fresh-new-client'}});
  expect(created.client_id).not.toBe(CID);
  const {data: setup} = await api.get('/onboarding/baseline', {params: {client_id: created.client_id}});
  const framework = FRAMEWORKS.find(row => row.key === 'soc-2');
  expect(framework).toBeDefined();
  const plans = activePlans(framework.key);
  const state = {...setup.state, version: 3, step: 3, selected_policy_keys: [], policies: {}, reviews: [],
    requirements: Object.fromEntries(setup.catalog.requirements.map(row => [row.key, row.key === framework.key ? 'applies' : 'does_not_apply'])),
    framework_reviews: Object.fromEntries(plans.map(plan => [plan.key, {enabled: plan.default_enabled ?? true,
      recurrence: plan.default_cadence, ...(plan.default_cadence === 'custom' ? {custom_recurrence_days: plan.default_custom_recurrence_days || 90} : {}),
      due_date: '2027-11-08'}]))};
  await api.post('/onboarding/baseline', {client_id: created.client_id, state, finalize: true,
    expected_updated_at: setup.state.updated_at ?? null, expected_records: setup.record_versions},
  {headers: {'Idempotency-Key': 'prestige-fresh-new-soc-baseline'}});
  clearFileCache();
  const reloaded = readStore(), assessments = owned(reloaded, 'framework_assessments', created.client_id);
  expect(reloaded.baselines[created.client_id].completed).toBe(true);
  expect(assessments).toHaveLength(activeDefinitions(framework.key).length);
  expect(assessments.length).toBeGreaterThan(0);
  for (const assessment of assessments) {
    expect(assessment).toMatchObject({framework_key: 'soc-2', status: 'not_assessed', implementation: '', assessment_history: []});
    expect(assessment.guided_assessment_source).toBeUndefined();
  }
  for (const kind of ['organizational_controls', 'risks', 'vendors', 'ai_systems', 'evidence', 'findings', 'tasks'])
    expect(owned(reloaded, kind, created.client_id)).toEqual([]);
  for (const review of owned(reloaded, 'reviews', created.client_id)) {
    expect(review.occurrences || []).toEqual([]);
    expect(review.provenance).toBeUndefined();
    expect(review.completed_at).toBeFalsy();
  }
  expect(reloaded.clients.find(row => row.client_id === created.client_id).demo_program_version).toBeUndefined();
  expect(getPrestigeDemoScenarioContext(reloaded, created.client_id, RUNTIME)).toBeNull();
  const points = reloaded.portfolio_reporting.snapshots.filter(row => row.client_id === created.client_id);
  expect(points.every(point => point.observation_kind !== 'demo_fixture' && point.effective_at >= RUNTIME)).toBe(true);
});

test('the next real native Prestige Risk uses the imported high-water mark without reusing a historical number', async () => {
  await api.post('/demo/enter', {});
  const priorIds = owned(readStore(), 'risks').map(row => row.risk_id);
  const {data: risk} = await api.post('/risks', {client_id: CID, title: 'Disposable native counter regression',
    description: 'Jest-isolated additional Risk; no change to the bundled fixture.',
    owner_id: CID + '_user_2', likelihood_score: 2, impact_score: 3,
    likelihood_rationale: 'Controlled test likelihood.', impact_rationale: 'Controlled test impact.',
    assessment_rationale: 'Disposable native-create check.', treatment: 'mitigate', treatment_plan: 'Discard this isolated test session.',
    review_cadence: 'none', next_review: null}, {headers: {'Idempotency-Key': 'prestige-fresh-next-risk'}});
  expect(risk.display_id).toBe('RISK-032');
  expect(priorIds).not.toContain(risk.risk_id);
  clearFileCache();
  const reloaded = readStore();
  expect(owned(reloaded, 'risks')).toHaveLength(32);
  expect(new Set(owned(reloaded, 'risks').map(row => row.display_id)).size).toBe(32);
  expect(reloaded.riskSequences[CID]).toBe(32);
  expect(stable(owned(reloaded, 'risks').filter(row => priorIds.includes(row.risk_id))))
    .toBe(stable(owned(fresh, 'risks')));
});
