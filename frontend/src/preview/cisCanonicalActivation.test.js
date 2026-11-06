import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY,ids,buildLegacyDemoStore,readStore,saveStore} from './store';
import {refreshCanonicalCisDemo} from './cisDemoRefresh';
import {CIS_CANONICAL_SCENARIO_REVISION} from './cisCanonicalArtifactBooks';
import {buildCanonicalBrawndoCandidate} from './cisCanonicalBrawndoCandidate';
import {buildCanonicalInitechCandidate} from './cisCanonicalInitechCandidate';
import {buildCanonicalKrustyCandidate} from './cisCanonicalKrustyCandidate';
import {snapshotCanonicalCisClient} from './cisCanonicalScope';
import {cisDemoFixtureDates,CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {cisDemoSelection} from './cisDemoSelection';
import {clearFileCache,lightweightStore} from './evidenceStorage';
import {restoredCisDemoEvidence} from './cisDemoEvidence';
import {cisSummary} from '../lib/cisVerification';

const {createHash} = require('crypto');
const api = axios.create({adapter:previewAdapter});
const CLOCK = new Date('2026-11-05T12:00:00.000Z'), dates = cisDemoFixtureDates(CLOCK);
const EFFECTIVE_FROM = new Date('2026-11-02T00:00:00.000Z');
const BEFORE_EFFECTIVE = new Date(+EFFECTIVE_FROM-1);
const CLIENTS = ['demo_brawndo','demo_initech','demo_krusty_krab'];
const FOREIGN = ['demo_dunder','demo_prestige'];
const PRIVATE_FLAGS = ['REACT_APP_PREVIEW','REACT_APP_DEMO_ONBOARDING_CLIENT',
  'REACT_APP_CIS_BRAWNDO_CANDIDATE_QA','REACT_APP_CIS_INITECH_CANDIDATE_QA','REACT_APP_CIS_KRUSTY_CANDIDATE_QA'];
const originalFlags = Object.fromEntries(PRIVATE_FLAGS.map(key => [key,process.env[key]]));
const copy = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(Buffer.from(value,'base64')).digest('hex');
let initial, saved, reference, entry, importedForeignSnapshots;
const clearPrivateFlags = () => {for (const key of PRIVATE_FLAGS) delete process.env[key];};

function unaffected(value) {
  const reporting = value.portfolio_reporting || {};
  return copy({records:Object.fromEntries(Object.entries(value).filter(([,rows]) => Array.isArray(rows))
    .map(([kind,rows]) => [kind,rows.filter(row => FOREIGN.includes(row.client_id))])),
    baselines:Object.fromEntries(FOREIGN.map(cid => [cid,value.baselines[cid]])),
    reporting:{snapshots:(reporting.snapshots || []).filter(row => FOREIGN.includes(row.client_id)),
      identities:(reporting.identities || []).filter(row => FOREIGN.some(cid => row.program_id.startsWith(cid+':'))),
      scope_events:(reporting.scope_events || []).filter(row => FOREIGN.includes(row.client_id))}});
}

function immutableCohort(value) {
  return copy({anchor:value.cis_demo_refresh.anchor,refresh:value.cis_demo_refresh,rollout:value.cis_demo_rollout,
    history:value.cis_demo_scenario_history,
    records:Object.fromEntries(['framework_assessments','reviews','policies'].map(kind =>
      [kind,value[kind].filter(row => CLIENTS.includes(row.client_id))]))});
}

function projectNewCurrentBaselines(value) {
  const result = unaffected(value), all = value.portfolio_reporting.snapshots;
  const importedIds = new Set(importedForeignSnapshots.map(point => point.snapshot_id));
  for (const imported of importedForeignSnapshots) {
    const matches = all.filter(point => point.snapshot_id === imported.snapshot_id);
    expect(matches).toHaveLength(1);
    expect(JSON.stringify(matches[0])).toBe(JSON.stringify(imported));
  }
  let comparisonSequence = 0;
  for (const point of result.reporting.snapshots) {
    if (point.observation_kind !== 'current_baseline' || importedIds.has(point.snapshot_id)) continue;
    const index = all.findIndex(original => original.snapshot_id === point.snapshot_id);
    expect(all.filter(original => original.snapshot_id === point.snapshot_id)).toHaveLength(1);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(point.program_id).toBe(point.client_id+':'+point.framework_key);
    expect(point.current.program_id).toBe(point.program_id);
    expect(point.captured_at).toBe(CLOCK.toISOString());
    expect(point.effective_at).toBe(point.captured_at);
    expect(point.current.captured_at).toBe(point.captured_at);
    expect(point.current.effective_at).toBe(point.captured_at);
    expect(point.current.observation_kind).toBe('current_baseline');
    expect(point.current.provenance.kind).toBe('current_baseline');
    expect(point.observation_sequence).toBe(index+1);
    const nativeId = `demo:${point.program_id}:${point.captured_at}:${index}`;
    expect(point.snapshot_id).toBe(nativeId); expect(point.source_event).toBe(nativeId);
    expect(point.current.source_event).toBe(nativeId); expect(point.current.provenance.source_event).toBe(nativeId);
    expect(point.source_revision).toBe(point.current.source_revision);
    // Only fresh capture's five session-wide sequence/identity fields differ
    // between independently initialized shapes; all other fields stay exact.
    const comparisonId = `new-current-baseline:${point.program_id}:${point.captured_at}`;
    Object.assign(point,{snapshot_id:comparisonId,source_event:comparisonId,observation_sequence:++comparisonSequence});
    point.current.source_event = comparisonId; point.current.provenance.source_event = comparisonId;
  }
  return result;
}

beforeAll(async () => {
  clearPrivateFlags();
  jest.useFakeTimers().setSystemTime(CLOCK);
  sessionStorage.clear(); localStorage.clear(); clearFileCache();
  // Only the unrelated-client/account/order reference uses the explicit older
  // helper. Every activation assertion below uses real normal Explore entry.
  const legacy = buildLegacyDemoStore(CLOCK);
  refreshCanonicalCisDemo(legacy,{clock:CLOCK,fresh:true});
  importedForeignSnapshots = copy((legacy.portfolio_reporting?.snapshots || []).filter(point => FOREIGN.includes(point.client_id)));
  saveStore(legacy); reference = readStore();
  sessionStorage.clear(); clearFileCache();
  localStorage.setItem('grc_token','standard-session-sentinel');
  entry = (await api.post('/demo/enter',{})).data;
  initial = readStore(); saved = sessionStorage.getItem(STORE_KEY);
});

beforeEach(() => {
  clearPrivateFlags();
  jest.setSystemTime(CLOCK);
  sessionStorage.clear(); localStorage.clear(); clearFileCache();
  sessionStorage.setItem(STORE_KEY,saved);
  sessionStorage.setItem('grc_demo_entered','true');
});
afterEach(clearPrivateFlags);
afterAll(() => {
  sessionStorage.clear();localStorage.clear();clearFileCache();jest.useRealTimers();
  for (const [key,value] of Object.entries(originalFlags)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('normal Explore entry activates allthree current canonical populations without changing unrelated records, identities or portfolio order', async () => {
  expect(entry.user.workspace_mode).toBe('demo'); expect(entry.access_token).toBeUndefined();
  expect(unaffected(initial)).toEqual(unaffected(reference));
  expect(initial.users).toEqual(reference.users); expect(initial.contacts).toEqual(reference.contacts);
  const order = reference.clients.map(row => row.client_id);
  expect(initial.clients.map(row => row.client_id)).toEqual(order);
  const directory = (await api.get('/clients/directory')).data.clients;
  // The directory ranks native workload; its order is not the source array.
  expect(directory.map(row => row.client_id).sort()).toEqual([...order].sort());
  expect(new Set(directory.map(row => row.client_id)).size).toBe(order.length);
  for (const row of directory) expect(row.status).toBe(initial.clients.find(client => client.client_id === row.client_id).status);
  for (const [cid,addressed,partial,gap,notAssessed] of [
    ['demo_brawndo',48,4,2,2],['demo_initech',120,7,1,2],['demo_krusty_krab',153,0,0,0]
  ]) {
    expect(initial.cis_demo_refresh.clients[cid].canonical_revision).toBe(CIS_CANONICAL_SCENARIO_REVISION);
    expect(initial.cis_demo_rollout.clients[cid].canonical_revision).toBe(CIS_CANONICAL_SCENARIO_REVISION);
    const rows = initial.framework_assessments.filter(row => row.client_id === cid && row.framework_key === 'cis-ig1');
    expect(cisSummary(rows,CLOCK)).toMatchObject({total:addressed+partial+gap+notAssessed,addressed,partial,gap,notAssessed});
  }
});

test('canonical anchors, native history, file bytes and same-client relationships survive later navigation and cache-loss reload', async () => {
  const files = initial.evidence.filter(row => CLIENTS.some(cid => row.evidence_id.startsWith(cid+'_canonical_evidence_')));
  expect(CLIENTS.map(cid => files.filter(row => row.client_id === cid).length)).toEqual([31,30,32]);
  expect(initial.reviews.filter(row => row.client_id === 'demo_krusty_krab')
    .reduce((sum,row) => sum+(row.occurrences || []).length,0)).toBe(514);
  const before = immutableCohort(initial);
  jest.setSystemTime(new Date(+CLOCK+45*86400000)); clearFileCache();
  await api.get('/clients/directory');
  await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_krusty_krab'}});
  await api.get('/calendar',{params:{client_id:'demo_brawndo'}});
  const reloaded = readStore();
  expect(immutableCohort(reloaded)).toEqual(before);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(saved);
  for (const cid of CLIENTS) {
    const original = files.find(row => row.client_id === cid);
    const source = original.content_base64 ? original : restoredCisDemoEvidence(initial,original);
    const downloaded = (await api.get('/evidence/'+original.evidence_id+'/download')).data;
    expect(downloaded.evidence_id).toBe(original.evidence_id);
    expect(Buffer.from(downloaded.content_base64,'base64').length).toBe(original.size);
    expect(hash(downloaded.content_base64)).toBe(hash(source.content_base64));
  }
  for (const file of files) for (const link of file.relationships) {
    const target = reloaded[link.kind].find(row => row[ids[link.kind]] === link.id);
    expect(target.client_id).toBe(file.client_id);
    if (link.occurrence_id) expect(target.occurrences.some(row => row.occurrence_id === link.occurrence_id)).toBe(true);
  }
});

test('native visitor saves, moved dates and newly added work survive re-entry and a later retained read', async () => {
  const cid = 'demo_brawndo';
  const risk = (await api.get('/risks',{params:{client_id:cid}})).data.find(row => ['assessed','in_progress'].includes(row.status));
  expect(risk).toBeDefined();
  await api.patch('/risks/'+risk.risk_id,{title:'Visitor retained commercial exposure',notes:'Preserve this native visitor save',expected_updated_at:risk.updated_at});
  const review = (await api.get('/reviews',{params:{client_id:cid}})).data.find(row => row.risk_id === risk.risk_id
    && !['completed','cancelled'].includes(row.status));
  expect(review).toBeDefined();
  await api.patch('/reviews/'+review.review_id,{due_date:dates.day(26),calendar_move:true,
    expected_updated_at:review.updated_at,expected_occurrence_id:review.current_occurrence_id});
  const added = (await api.post('/tasks',{client_id:cid,title:'Visitor retained follow-up',priority:'medium',due_date:dates.day(33)},
    {headers:{'Idempotency-Key':'activation-visitor-follow-up'}})).data;
  const current = readStore(), expected = copy({risk:current.risks.find(row => row.risk_id === risk.risk_id),
    review:current.reviews.find(row => row.review_id === review.review_id),task:current.tasks.find(row => row.task_id === added.task_id)});
  const retainedBytes = sessionStorage.getItem(STORE_KEY), anchor = current.cis_demo_refresh.anchor;
  jest.setSystemTime(new Date(+CLOCK+30*86400000)); clearFileCache();
  const reentered = axios.create({adapter:previewAdapter});
  await reentered.post('/demo/enter',{});
  await reentered.get('/dashboard',{params:{client_id:cid}});
  await reentered.get('/reviews',{params:{client_id:cid}});
  const kept = readStore();
  expect({risk:kept.risks.find(row => row.risk_id === risk.risk_id),review:kept.reviews.find(row => row.review_id === review.review_id),
    task:kept.tasks.find(row => row.task_id === added.task_id)}).toEqual(expected);
  expect(kept.tasks.filter(row => row.task_id === added.task_id)).toHaveLength(1);
  expect(kept.cis_demo_refresh.anchor).toBe(anchor);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(retainedBytes);
});

test('actual Explore re-entry preserves a visitor-edited older v2 persisted cohort without migrating its records, bytes or anchor', async () => {
  sessionStorage.clear(); clearFileCache(); jest.setSystemTime(BEFORE_EFFECTIVE);
  await api.post('/demo/enter',{});
  const older = readStore(), cid = 'demo_brawndo';
  expect(older.cis_demo_refresh.version).toBe(CIS_SHOWCASE_VERSION);
  expect(older.cis_demo_refresh.version).toBe('cis81-showcase-v2');
  expect(older.cis_demo_refresh.clients[cid].canonical_revision).toBeUndefined();
  const row = older.framework_assessments.find(item => item.client_id === cid);
  await api.patch('/framework_assessments/'+row.framework_assessment_id,
    {notes:'Visitor-owned older v2 assessment note',expected_last_assessed:row.last_saved??row.last_assessed??null});
  const edited = readStore(), before = immutableCohort(edited), retainedBytes = sessionStorage.getItem(STORE_KEY);
  const original = edited.evidence.find(item => item.evidence_id === cid+'_showcase_evidence_operating_periodic');
  expect(original).toBeDefined();
  const available = original.content_base64 ? original : restoredCisDemoEvidence(edited,original);
  expect(available).toBeTruthy(); const originalHash = hash(available.content_base64);
  jest.setSystemTime(new Date(+CLOCK+60*86400000)); clearFileCache();
  await api.post('/demo/enter',{});
  await api.get('/clients/directory');
  const kept = readStore();
  expect(immutableCohort(kept)).toEqual(before);
  expect(kept.framework_assessments.find(item => item.framework_assessment_id === row.framework_assessment_id).notes)
    .toBe('Visitor-owned older v2 assessment note');
  const downloaded = (await api.get('/evidence/'+original.evidence_id+'/download')).data;
  expect(hash(downloaded.content_base64)).toBe(originalHash); expect(downloaded.size).toBe(original.size);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(retainedBytes);
});

test('a normal generic Demo client onboards through the native catalog without canonical narratives, history, approvals or files', async () => {
  const client = (await api.post('/clients',{name:'Activation generic onboarding'},
    {headers:{'Idempotency-Key':'activation-generic-client'}})).data;
  const cid = client.client_id, setup = (await api.get('/onboarding/baseline',{params:{client_id:cid}})).data;
  const selected = cisDemoSelection(1).selected_policy_keys;
  const state = {...setup.state,version:3,step:3,selected_policy_keys:selected,
    policies:Object.fromEntries(selected.map(key => [key,'no'])),reviews:[],framework_reviews:{},
    framework_settings:{'cis-ig1':{implementation_group:1}},
    requirements:Object.fromEntries(setup.catalog.requirements.map(row => [row.key,row.key === 'cis-ig1' ? 'applies' : 'does_not_apply']))};
  await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true,
    expected_updated_at:setup.state.updated_at??null,expected_records:setup.record_versions},
  {headers:{'Idempotency-Key':'activation-generic-onboarding'}});
  const program = (await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data;
  expect(program.assessments).toHaveLength(56);
  expect(program.assessments.every(row => row.status === 'not_assessed' && !row.implementation && !row.last_assessed
    && !row.guided_assessment_source && !row.assessment_history.length)).toBe(true);
  const kept = readStore(), policies = kept.policies.filter(row => row.client_id === cid), reviews = kept.reviews.filter(row => row.client_id === cid);
  expect(policies.map(row => row.baseline_key).sort()).toEqual([...selected].sort());
  expect(policies.every(row => row.presence === 'reported_missing' && row.status === 'needs_creation'
    && !row.approval_subject && !(row.decision_history || []).length)).toBe(true);
  expect(reviews.length).toBeGreaterThan(0);
  expect(reviews.every(row => row.status === 'needs_scheduling' && !row.due_date && !(row.occurrences || []).length)).toBe(true);
  for (const kind of ['risks','vendors','ai_systems','tasks','findings','evidence']) expect(kept[kind].filter(row => row.client_id === cid)).toEqual([]);
  expect(kept.cis_demo_refresh.clients[cid]).toBeUndefined(); expect(kept.cis_demo_scenario_history[cid]).toBeUndefined();
  expect(kept.users.map(row => row.user_id)).toEqual(initial.users.map(row => row.user_id));
  clearFileCache();
  expect((await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data.assessments).toEqual(program.assessments);
});

test('standard sign-in stays outside Demo entry and authenticated construction is rejected without mutation', async () => {
  sessionStorage.removeItem('grc_demo_entered'); localStorage.setItem('grc_token','standard-session-sentinel');
  await expect(api.post('/auth/login',{})).rejects.toMatchObject({response:{status:401}});
  expect(localStorage.getItem('grc_token')).toBe('standard-session-sentinel');
  expect(sessionStorage.getItem('grc_demo_entered')).toBeNull();
  expect(sessionStorage.getItem(STORE_KEY)).toBe(saved);
  for (const build of [buildCanonicalBrawndoCandidate,buildCanonicalInitechCandidate,buildCanonicalKrustyCandidate]) {
    const input = copy(initial); input.user.workspace_mode = 'authenticated'; const before = copy(input);
    expect(() => build(input,{clock:CLOCK})).toThrow(); expect(input).toEqual(before);
  }
});

test('actual flagged fresh Explore onboarding remains blank on retained reads and preserves the other clients and access identities', async () => {
  const cid = 'demo_krusty_krab';
  const source = {...reference,evidence:lightweightStore(reference).evidence};
  const others = CLIENTS.filter(id => id !== cid).map(id => snapshotCanonicalCisClient(source,id));
  const users = copy(reference.users), contacts = copy(reference.contacts);
  sessionStorage.clear(); clearFileCache();
  process.env.REACT_APP_PREVIEW = 'true'; process.env.REACT_APP_DEMO_ONBOARDING_CLIENT = cid;
  await api.post('/demo/enter',{});
  await api.get('/frameworks/cis-ig1',{params:{client_id:cid}});
  clearFileCache();
  const kept = readStore();
  const comparable = {...kept,evidence:lightweightStore(kept).evidence};
  expect(kept.baselines[cid]).toMatchObject({completed:false,step:0,selected_policy_keys:[]});
  expect(kept.cis_demo_rollout.clients[cid]).toMatchObject({ownership:'fresh_fixture',onboarding_prepared:true});
  for (const kind of ['framework_assessments','reviews','policies','risks','vendors','ai_systems','tasks','findings','evidence'])
    expect(kept[kind].filter(row => row.client_id === cid)).toEqual([]);
  expect(CLIENTS.filter(id => id !== cid).map(id => snapshotCanonicalCisClient(comparable,id))).toEqual(others);
  expect(projectNewCurrentBaselines(comparable)).toEqual(projectNewCurrentBaselines(source));
  expect(kept.users).toEqual(users); expect(kept.contacts).toEqual(contacts);
  for (const id of CLIENTS.filter(value => value !== cid)) {
    const original = reference.evidence.find(row => row.evidence_id === id+'_showcase_evidence_operating_periodic');
    expect(original).toBeDefined();
    const available = original.content_base64 ? original : restoredCisDemoEvidence(reference,original);
    expect(available).toBeTruthy();
    const downloaded = (await api.get('/evidence/'+original.evidence_id+'/download')).data;
    expect(hash(downloaded.content_base64)).toBe(hash(available.content_base64)); expect(downloaded.size).toBe(original.size);
  }
});

test('normal entry immediately before the effective UTC date retains the exact older v2 fixture without current v3 files or future Brawndo samples', async () => {
  jest.setSystemTime(BEFORE_EFFECTIVE); sessionStorage.clear(); clearFileCache();
  const older = buildLegacyDemoStore(BEFORE_EFFECTIVE);
  refreshCanonicalCisDemo(older,{clock:BEFORE_EFFECTIVE,fresh:true});
  saveStore(older); const expected = readStore();
  sessionStorage.clear(); clearFileCache();
  await api.post('/demo/enter',{});
  const actual = readStore();
  expect(copy(actual)).toEqual(copy(expected));
  expect(actual.cis_demo_refresh.anchor).toBe('2026-11-01T00:00:00.000Z');
  expect(actual.cis_demo_refresh.version).toBe('cis81-showcase-v2');
  for (const cid of CLIENTS) expect(actual.cis_demo_refresh.clients[cid].canonical_revision).toBeUndefined();
  expect(actual.evidence.filter(row => CLIENTS.some(cid => row.evidence_id.startsWith(cid+'_canonical_evidence_')))).toEqual([]);
  expect(actual.evidence.filter(row => row.client_id === 'demo_brawndo')
    .every(row => !row.evidence_date || row.evidence_date.slice(0,10) <= '2026-11-01')).toBe(true);
});

test('normal entry at the effective UTC date installs allthree v3 populations and complete canonical file sets', async () => {
  jest.setSystemTime(EFFECTIVE_FROM); sessionStorage.clear(); clearFileCache();
  await api.post('/demo/enter',{});
  const actual = readStore();
  expect(actual.cis_demo_refresh.anchor).toBe(EFFECTIVE_FROM.toISOString());
  for (const [cid,addressed,partial,gap,notAssessed,files] of [
    ['demo_brawndo',48,4,2,2,31],['demo_initech',120,7,1,2,30],['demo_krusty_krab',153,0,0,0,32]
  ]) {
    expect(actual.cis_demo_refresh.clients[cid].canonical_revision).toBe(CIS_CANONICAL_SCENARIO_REVISION);
    expect(cisSummary(actual.framework_assessments.filter(row => row.client_id === cid && row.framework_key === 'cis-ig1'),EFFECTIVE_FROM))
      .toMatchObject({total:addressed+partial+gap+notAssessed,addressed,partial,gap,notAssessed});
    expect(actual.evidence.filter(row => row.client_id === cid && row.evidence_id.startsWith(cid+'_canonical_evidence_'))).toHaveLength(files);
  }
});
