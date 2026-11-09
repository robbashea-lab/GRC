import * as store from '../store';
import * as nativeBaseline from '../baseline';
import * as nativeFramework from '../frameworks';
import {stable} from '../commandRequests';
import * as preparation from './prestigeNativeOnboarding';
import * as governance from './prestigeCurrentGovernance';
import * as registers from './prestigeEightYearRegisters';
import {PRESTIGE_CURRENT_ASSESSMENTS, preparePrestigeCurrentAssessment} from './prestigeEightYearContent';
import {createPrestigeCurrentModel} from './prestigeCurrentModel';
import {reviewDrivers} from '../../lib/frameworks';
import {onboardingProjection} from '../../lib/aiOnboarding';
import {reviewedProgress} from '../../lib/programProgress';

// Reconstruct this immutable authored-V2 source under its original current-version
// context. Real rollout defaults/startup are qualified in separate unpatched suites.
jest.mock('../../lib/socGuidedAssessment',()=>({
  ...jest.requireActual('../../lib/socGuidedAssessment'),
  socGuidedCatalog:jest.requireActual('@catalogs/guidedSoc2.json'),
}));

const CID = 'demo_prestige', CLOCK = new Date('2026-11-02T12:00:00.000Z');
const MARKER = 'prestige_current_model_fixture';
const copy = value => JSON.parse(JSON.stringify(value));
const owned = (db, kind) => (db[kind] || []).filter(row => row.client_id === CID);
function expectNativeCurrentHistory(row, fact, actorId) {
  expect(row.assessment_history).toHaveLength(2);
  const [metadataEdit, recordedAssessment] = row.assessment_history;
  expect(metadataEdit).toMatchObject({...fact.ownership, status: 'not_assessed', implementation: '',
    technology: fact.technology, notes: fact.notes, assessment_recorded_at: null,
    assessment_recorded_by: null, by: actorId});
  expect(metadataEdit).not.toHaveProperty('guided_assessment_source');
  expect(metadataEdit.last_saved).toBe(metadataEdit.at);
  expect(recordedAssessment).toMatchObject({...fact.ownership, status: 'addressed',
    implementation: fact.result.narrative, technology: fact.technology, notes: fact.notes,
    assessment_recorded_by: actorId, by: actorId,
    guided_assessment_source: {answers: fact.answers, by: actorId}});
  expect(recordedAssessment.guided_assessment_source.answers).toEqual(fact.answers);
  expect(recordedAssessment.assessment_recorded_at).toBe(recordedAssessment.at);
  expect(recordedAssessment.last_saved).toBe(recordedAssessment.at);
  expect(Number.isFinite(Date.parse(metadataEdit.at))).toBe(true);
  expect(Number.isFinite(Date.parse(recordedAssessment.at))).toBe(true);
}

async function digest(value) {
  const bytes = new TextEncoder().encode(stable(value));
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}
const withoutClient = map => Object.fromEntries(Object.entries(map || {}).filter(([key]) => key !== CID));
let source, prepared, options, candidate, original, preparedBefore, started, finished;
let childManifests, frameworkCalls;

beforeAll(async () => {
  source = store.buildLegacyDemoStore(CLOCK);
  // Controlled foreign fixture: preserve a valid native legacy alias without normalizing it.
  source.logs.push({log_id: 'current-model-foreign-log-only', client_id: 'demo_dunder',
    action: 'Retained fixture audit', timestamp: '2025-05-01T12:00:00.000Z', meta: {original: ['keep']}});
  source.dunder_demo_prepared_history = {client_id: 'demo_dunder', version: 'controlled-retained-proof', nested: {original: ['keep']}};
  original = JSON.stringify(source);
  prepared = preparation.preparePrestigeNativeOnboarding(source, {clock: CLOCK, purpose: 'native_onboarding_qa'});
  preparedBefore = JSON.stringify(prepared);
  options = {clock: CLOCK, purpose: 'current_model_source_qa', expected_source_sha256: await digest(prepared.backup)};
  childManifests = {};
  const nativeGovernance = governance.createPrestigeCurrentGovernance;
  jest.spyOn(governance, 'createPrestigeCurrentGovernance').mockImplementation(async (...args) => {
    const result = await nativeGovernance(...args);
    childManifests.governance = copy(result.manifest);
    return result;
  });
  const nativeRegisters = registers.createPrestigeCurrentRegisters;
  jest.spyOn(registers, 'createPrestigeCurrentRegisters').mockImplementation(async (...args) => {
    const result = await nativeRegisters(...args);
    childManifests.registers = copy(result.manifest);
    return result;
  });
  frameworkCalls = [];
  const frameworkRequest = nativeFramework.frameworkRequest;
  jest.spyOn(nativeFramework, 'frameworkRequest').mockImplementation((...args) => {
    const [db, path, method, , body, context] = args;
    frameworkCalls.push({path, method, body: copy(body), context: context ? copy(context) : context,
      actor: copy(db.user)});
    return frameworkRequest(...args);
  });
  started = Date.now();
  try { candidate = await createPrestigeCurrentModel(prepared, options); }
  finally { finished = Date.now(); jest.restoreAllMocks(); }
});

afterEach(() => { jest.restoreAllMocks(); });

test('one source transaction returns the complete original recovery copy and never mutates either caller', () => {
  expect(JSON.stringify(source)).toBe(original);
  expect(JSON.stringify(prepared)).toBe(preparedBefore);
  expect(JSON.stringify(candidate.backup)).toBe(original);
  expect(candidate.db).not.toBe(prepared.db);
  expect(candidate.backup).not.toBe(prepared.backup);
  expect(candidate.backup.clients[0]).not.toBe(prepared.backup.clients[0]);
  expect(candidate.db.clients[0]).not.toBe(candidate.backup.clients[0]);
  expect(candidate.clientId).toBe(CID);
  expect(candidate.anchor).toBe('2026-11-02T00:00:00.000Z');
  expect(candidate.inventory).toEqual(prepared.inventory);
  expect(candidate.removedRecordIds).toEqual(prepared.removedRecordIds);
  expect(candidate.db.user).toEqual(source.user);
  expect(candidate.db.users).toEqual(source.users);
  expect(candidate.db.contacts).toEqual(source.contacts);
});

test('native onboarding, Governance and Registers compose one current cohort without duplicate generic Reviews', () => {
  const {db, manifest} = candidate;
  expect(db.baselines[CID].completed).toBe(true);
  expect(db.baselines[CID].selected_policy_keys).toEqual(governance.prestigeGovernanceOnboardingState().selected_policy_keys);
  expect(db.baselines[CID].reviews).toEqual([]);
  expect(owned(db, 'policies')).toHaveLength(16);
  expect(owned(db, 'vendors')).toHaveLength(23);
  expect(owned(db, 'risks')).toHaveLength(30);
  expect(owned(db, 'ai_systems')).toHaveLength(4);
  expect(owned(db, 'reviews')).toHaveLength(101);
  const frameworkReviews = owned(db, 'reviews').filter(row => reviewDrivers(row).some(driver => driver.framework_key === 'soc-2'));
  expect(frameworkReviews).toHaveLength(8);
  expect(new Set(frameworkReviews.flatMap(row => reviewDrivers(row).filter(driver => driver.framework_key === 'soc-2').map(driver => driver.framework_plan_key))).size).toBe(8);
  expect(owned(db, 'reviews').some(row => row.baseline_key && !reviewDrivers(row).length)).toBe(false);
  expect(owned(db, 'reviews').some(row => row.status === 'completed' || row.occurrences?.length)).toBe(false);
  const maps = {policy_ids: ['policies', 16], review_ids: ['reviews', 8], vendor_ids: ['vendors', 23],
    risk_ids: ['risks', 30], ai_ids: ['ai_systems', 4], assessment_ids: ['framework_assessments', 38]};
  for (const [key, [kind, count]] of Object.entries(maps)) {
    const ids = Object.values(manifest[key]);
    expect(ids).toHaveLength(count);
    expect(new Set(ids).size).toBe(count);
    for (const id of ids) expect(owned(db, kind).some(row => row[store.ids[kind] || 'framework_assessment_id'] === id)).toBe(true);
  }
});

test('every current SOC answer is recorded through the guided native sequence with Dale as the actual assessment actor', () => {
  const {db, manifest} = candidate, rows = owned(db, 'framework_assessments');
  const dale = db.users.find(row => row.user_id === 'demo_prestige_user_0');
  expect(dale).toMatchObject({status: 'active'});
  expect(manifest.actor_id).toBe(source.user.user_id);
  expect(manifest.assessment_actor_id).toBe(dale.user_id);
  expect(rows).toHaveLength(38);
  expect(rows.map(row => row.definition_id).sort()).toEqual(Object.keys(PRESTIGE_CURRENT_ASSESSMENTS).sort());
  for (const row of rows) {
    const fact = preparePrestigeCurrentAssessment(row.definition_id);
    const path = '/framework_assessments/' + row.framework_assessment_id;
    const calls = frameworkCalls.filter(call => call.path === path || call.path === path + '/guided-assessment');
    expect(calls.map(call => [call.method, call.path])).toEqual([
      ['patch', path], ['get', path + '/guided-assessment'], ['put', path + '/guided-assessment'], ['patch', path],
    ]);
    expect(calls.every(call => call.actor.user_id === dale.user_id && call.actor.name === dale.name)).toBe(true);
    expect(calls[0].body).toMatchObject({...fact.ownership, technology: fact.technology, notes: fact.notes});
    expect(calls[1].context).toMatchObject({user_id: dale.user_id});
    expect(calls[2].body).toMatchObject({version: fact.version, answers: fact.answers, completed: true,
      expected_revision: 0, summary_review: {version: fact.version, answers: fact.answers}});
    expect(calls[2].body.base_scope_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(calls[3].body).toMatchObject({record_assessment: true,
      guided_assessment_source: {version: fact.version, revision: 1}});
    expect(row).toMatchObject({...fact.ownership, status: 'addressed', technology: fact.technology,
      implementation: fact.result.narrative, assessment_recorded_by: dale.user_id});
    expect(row.guided_assessment_source).toMatchObject({answers: fact.answers, by: dale.user_id});
    expectNativeCurrentHistory(row, fact, dale.user_id);
    const draftKey = row.framework_assessment_id + ':' + dale.user_id;
    expect(db.guided_assessment_pilot[draftKey]).toMatchObject({answers: fact.answers, completed: true, revision: 1});
    expect(db.guided_assessment_history?.[draftKey + ':1']).toBeUndefined();
    expect(row).not.toHaveProperty('verification');
    expect(row).not.toHaveProperty('soc_assessment_checks');
    expect(Date.parse(row.last_assessed)).toBeGreaterThanOrEqual(started);
    expect(Date.parse(row.last_assessed)).toBeLessThanOrEqual(finished);
  }
  expect(reviewedProgress(rows, 'soc-2')).toEqual({total: 38, resolved: 38, valid_na: 0, invalid_na: 0, percent: 100});
});

test('current command provenance does not pretend to be backdated onboarding, AI approval or eight years of history', () => {
  const {db} = candidate, client = db.clients.find(row => row.client_id === CID);
  expect(client.initial_program_baseline.completed_by).toBe(source.user.user_id);
  expect(Date.parse(client.initial_program_baseline.completed_at)).toBeGreaterThanOrEqual(started);
  expect(Date.parse(client.initial_program_baseline.completed_at)).toBeLessThanOrEqual(finished);
  for (const ai of owned(db, 'ai_systems')) {
    expect(ai.approval_status).toBe('pending_assessment');
    expect(ai.approval_history || []).toEqual([]);
    expect(onboardingProjection(ai).screening_complete).toBe(true);
    const vendor = db.vendors.find(row => row.vendor_id === ai.vendor_id);
    if (vendor) expect(vendor.client_id).toBe(CID);
  }
  for (const kind of ['organizational_controls', 'evidence', 'assets', 'findings', 'tasks', 'exceptions', 'assessments'])
    expect(owned(db, kind)).toEqual([]);
  expect(db).not.toHaveProperty('prestige_demo_modeled_history');
  expect(db).not.toHaveProperty('prestige_demo_artifacts');
  expect(owned(db, 'reviews').some(row => row.completed_at || row.completed_by || row.occurrences?.length)).toBe(false);
});

test('foreign rows, account identities, scoped maps and legacy log aliases remain exact', () => {
  const {db} = candidate;
  for (const [kind, rows] of Object.entries(source)) {
    if (!Array.isArray(rows)) continue;
    expect((db[kind] || []).filter(row => row.client_id !== CID)).toEqual(rows.filter(row => row.client_id !== CID));
  }
  for (const key of ['baselines', 'drafts', 'ai_intake', 'ai_counters', 'riskSequences'])
    expect(withoutClient(db[key])).toEqual(withoutClient(source[key]));
  const sourceAssessmentIds = new Set(owned(source, 'framework_assessments').map(row => row.framework_assessment_id));
  for (const key of ['guided_assessment_pilot', 'guided_assessment_history']) {
    const foreign = Object.fromEntries(Object.entries(source[key] || {}).filter(([id, row]) => row.client_id !== CID
      && ![...sourceAssessmentIds].some(assessmentId => id.startsWith(assessmentId + ':'))));
    for (const [id, row] of Object.entries(foreign)) expect(db[key]?.[id]).toEqual(row);
  }
  const retained = source.logs.find(row => row.log_id === 'current-model-foreign-log-only');
  expect(db.logs.find(row => row.log_id === retained.log_id)).toEqual(retained);
  expect(db.logs.find(row => row.log_id === retained.log_id)).not.toHaveProperty('audit_id');
  expect(db.dunder_demo_prepared_history).toEqual(source.dunder_demo_prepared_history);
});

test('the final receipt binds the original source, exact stage receipts and native assessment IDs', async () => {
  const {db, manifest} = candidate;
  expect(manifest.version).toBe('prestige-current-model-v1');
  expect(manifest.source_sha256).toBe(options.expected_source_sha256);
  expect(manifest.source_sha256).toBe(await digest(source));
  for (const key of ['facts_sha256', 'state_sha256', 'receipt_sha256']) expect(manifest[key]).toMatch(/^[a-f0-9]{64}$/);
  expect(manifest.child_receipts).toEqual(childManifests);
  expect(manifest.child_receipts.governance.receipt_sha256).toBe(db.prestige_current_governance_fixture.receipt_sha256);
  expect(manifest.child_receipts.registers).toEqual(db.prestige_current_register_fixture);
  expect(db[MARKER]).toEqual(manifest);
  expect(manifest.scope).toBe('current_governance_registers_and_guided_assessments_only');
  expect(manifest.blocked_populations).toEqual(['C09-chains']);
  expect(manifest.deferred).toEqual(['organizational_controls_and_observations', 'eight_year_history', 'material_evidence',
    'two_additional_organization_reviews', 'browser_and_release_acceptance']);
  expect(candidate.diagnostics.native_counts).toEqual(Object.fromEntries(Object.entries(db).filter(([, value]) => Array.isArray(value))
    .map(([key, rows]) => [key, rows.filter(row => row.client_id === CID).length])));
  expect(candidate.diagnostics.source_interval).toEqual({start: '2018-11-02T00:00:00.000Z', end: candidate.anchor});
  expect(candidate.diagnostics.boundaries).toEqual({full_history_constructed: false, evidence_materialized: false,
    browser_onboarding_proved: false, capacity_qualified: false, C09: 'unrecorded'});
  const measured = copy(db);
  delete measured[MARKER];
  const serialized = stable(measured);
  expect(candidate.diagnostics.raw_characters).toBe(serialized.length);
  expect(candidate.diagnostics.raw_utf8_bytes).toBe(new TextEncoder().encode(serialized).byteLength);
});

test('a full terminal retry returns independent copies and performs no preparation, baseline or native commands', async () => {
  const input = copy(candidate), before = JSON.stringify(input);
  const spies = [jest.spyOn(preparation, 'preparePrestigeNativeOnboarding'), jest.spyOn(nativeBaseline, 'saveBaseline'),
    jest.spyOn(governance, 'createPrestigeCurrentGovernance'), jest.spyOn(registers, 'createPrestigeCurrentRegisters'),
    jest.spyOn(nativeFramework, 'prepareGuidedContext'), jest.spyOn(nativeFramework, 'frameworkRequest'), jest.spyOn(store, 'write')];
  const result = await createPrestigeCurrentModel(input, options);
  expect(result).toEqual(candidate);
  expect(JSON.stringify(input)).toBe(before);
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  owned(result.db, 'policies')[0].summary = 'Changed returned clone';
  expect(owned(input.db, 'policies')[0].summary).not.toBe('Changed returned clone');
  expect(JSON.stringify(result.backup)).toBe(original);
  result.backup.clients[0].name = 'Changed returned backup';
  expect(JSON.stringify(input.backup)).toBe(original);
});

test.each([
  ['wrong purpose', value => value, {...{clock: CLOCK}, purpose: 'ordinary_reload'}],
  ['missing source hash', value => value, {expected_source_sha256: undefined}],
  ['wrong source hash', value => value, {clock: CLOCK, purpose: 'current_model_source_qa', expected_source_sha256: '0'.repeat(64)}],
  ['wrong day', value => value, {clock: new Date('2026-11-03T12:00:00Z'), purpose: 'current_model_source_qa'}],
  ['invalid clock', value => value, {clock: new Date('invalid'), purpose: 'current_model_source_qa'}],
  ['missing envelope', () => null],
  ['raw source is not a prepared envelope', () => copy(source)],
  ['wrong client envelope', value => { value.clientId = 'demo_dunder'; return value; }],
  ['wrong anchor envelope', value => { value.anchor = '2026-11-03T00:00:00.000Z'; return value; }],
  ['missing full backup', value => { delete value.backup; return value; }],
  ['altered inventory', value => { value.inventory.policies += 1; return value; }],
  ['altered removed identities', value => { value.removedRecordIds.policies.pop(); return value; }],
  ['altered prepared client', value => { value.db.clients.find(row => row.client_id === CID).name += ' changed'; return value; }],
  ['visitor partial record', value => { value.db.vendors.push({vendor_id: 'partial-vendor', client_id: CID, name: 'Partial visitor'}); return value; }],
  ['pre-finalized baseline', value => { value.db.baselines[CID].completed = true; return value; }],
  ['forged actor label', value => { value.db.user.name = 'Robert Doback'; return value; }],
])('%s is rejected before native construction without changing the caller', async (_label, change, replacementOptions = undefined) => {
  const value = change(copy(prepared)), before = JSON.stringify(value);
  const baselineSpy = jest.spyOn(nativeBaseline, 'saveBaseline'), frameworkSpy = jest.spyOn(nativeFramework, 'frameworkRequest');
  await expect(createPrestigeCurrentModel(value, replacementOptions ? {...options, ...replacementOptions} : options)).rejects.toThrow();
  expect(JSON.stringify(value)).toBe(before);
  expect(baselineSpy).not.toHaveBeenCalled();
  expect(frameworkSpy).not.toHaveBeenCalled();
});

test.each(['governance', 'register', 'model', 'guided'])('an already assembled %s backup cannot become a new fresh cohort', async kind => {
  const value = copy(prepared);
  const keys = {governance: 'prestige_current_governance_fixture', register: 'prestige_current_register_fixture', model: MARKER};
  if (kind === 'guided') {
    const row = owned(value.backup, 'framework_assessments')[0];
    value.backup.guided_assessment_pilot ||= {};
    value.backup.guided_assessment_pilot[row.framework_assessment_id + ':demo_prestige_user_0'] = {
      client_id: CID, assessment_id: row.framework_assessment_id, revision: 1};
  } else value.backup[keys[kind]] = {version: 'existing-cohort', client_id: CID};
  const before = JSON.stringify(value), baselineSpy = jest.spyOn(nativeBaseline, 'saveBaseline');
  await expect(createPrestigeCurrentModel(value, {...options, expected_source_sha256: await digest(value.backup)})).rejects.toThrow();
  expect(JSON.stringify(value)).toBe(before);
  expect(baselineSpy).not.toHaveBeenCalled();
});

test.each([
  ['saved assessment', value => { owned(value.db, 'framework_assessments')[0].implementation += ' changed'; }],
  ['child receipt', value => { value.db.prestige_current_register_fixture.receipt_sha256 = '0'.repeat(64); }],
  ['terminal actor', value => { value.db[MARKER].actor_id = 'demo_prestige_user_1'; }],
  ['terminal facts', value => { value.db[MARKER].facts_sha256 = '0'.repeat(64); }],
  ['external manifest', value => { value.manifest.assessment_actor_id = 'demo_prestige_user_1'; }],
  ['retained foreign history', value => { value.db.logs.find(row => row.log_id === 'current-model-foreign-log-only').meta.original.push('changed'); }],
  ['full original backup', value => { value.backup.clients[0].name += ' changed'; }],
])('a changed %s rejects terminal replay instead of re-signing a different model', async (_label, change) => {
  const value = copy(candidate); change(value); const before = JSON.stringify(value);
  const baselineSpy = jest.spyOn(nativeBaseline, 'saveBaseline'), frameworkSpy = jest.spyOn(nativeFramework, 'frameworkRequest');
  await expect(createPrestigeCurrentModel(value, options)).rejects.toThrow();
  expect(JSON.stringify(value)).toBe(before);
  expect(baselineSpy).not.toHaveBeenCalled();
  expect(frameworkSpy).not.toHaveBeenCalled();
});

test('a conflict at the final native assessment publishes no partial model and a clean retry can finish', async () => {
  const value = copy(prepared), before = JSON.stringify(value), native = nativeFramework.frameworkRequest;
  let attempted = 0;
  const request = jest.spyOn(nativeFramework, 'frameworkRequest').mockImplementation((...args) => {
    if (args[2] === 'patch' && args[4]?.record_assessment && ++attempted === 38)
      throw new Error('Controlled final assessment conflict');
    return native(...args);
  });
  await expect(createPrestigeCurrentModel(value, options)).rejects.toThrow(/Controlled final assessment conflict/);
  expect(attempted).toBe(38);
  expect(JSON.stringify(value)).toBe(before);
  expect(value.db).not.toHaveProperty(MARKER);
  expect(owned(value.db, 'policies')).toEqual([]);
  expect(owned(value.db, 'framework_assessments')).toEqual([]);
  request.mockRestore();
  const retried = await createPrestigeCurrentModel(value, options);
  expect(owned(retried.db, 'framework_assessments')).toHaveLength(38);
  expect(retried.manifest.assessment_actor_id).toBe('demo_prestige_user_0');
  for (const row of owned(retried.db, 'framework_assessments')) {
    expect(row.status).toBe('addressed');
    expectNativeCurrentHistory(row, preparePrestigeCurrentAssessment(row.definition_id),
      retried.manifest.assessment_actor_id);
  }
  expect(retried.backup).toEqual(prepared.backup);
  expect(JSON.stringify(value)).toBe(before);
});

test.each([
  ['unknown empty map', false, db => { db.unexpected_empty_map = {}; }],
  ['nonempty AI intake map', false, db => {
    db.ai_intake.demo_dunder = {client_id: 'demo_dunder', usage: 'unsure', indicators: []};
  }],
  ['nonempty command map', false, db => {
    db.command_requests[JSON.stringify(['demo_admin', 'demo_dunder', '/controlled-preservation', 'guard'])] = {
      fingerprint: 'controlled-foreign-command', result: {}};
  }],
  ['nonempty guided map', false, db => {
    db.guided_assessment_pilot['controlled-foreign-interview'] = {
      client_id: 'demo_dunder', assessment_id: 'controlled-foreign-assessment', revision: 1};
  }],
  ['empty command array', false, db => { db.command_requests = []; }],
  ['empty guided array', false, db => { db.guided_assessment_pilot = []; }],
  ['loss of an originally present map', true, db => { delete db.ai_intake; }],
  ['type change of an originally present map', true, db => { db.ai_intake = null; }],
])('%s still rejects construction without changing the caller', async (_label, originallyPresentMap, change) => {
  let value = copy(prepared), caseOptions = options;
  if (originallyPresentMap) {
    // Synthetic shape boundary only; the shared native seed and prepared fixture remain unchanged.
    const original = copy(source);
    original.ai_intake = {};
    value = preparation.preparePrestigeNativeOnboarding(original, {clock: CLOCK, purpose: 'native_onboarding_qa'});
    caseOptions = {...options, expected_source_sha256: await digest(value.backup)};
  }
  const before = JSON.stringify(value), native = nativeFramework.frameworkRequest;
  let attempted = 0, working;
  jest.spyOn(nativeFramework, 'frameworkRequest').mockImplementation((...args) => {
    const saved = native(...args);
    if (args[2] === 'patch' && args[4]?.record_assessment && ++attempted === 38) {
      working = args[0];
      change(working);
    }
    return saved;
  });
  await expect(createPrestigeCurrentModel(value, caseOptions))
    .rejects.toThrow(/foreign data, identity, source maps or unrelated settings changed/);
  expect(attempted).toBe(38);
  expect(JSON.stringify(value)).toBe(before);
  expect(value.db).not.toHaveProperty(MARKER);
  expect(working).not.toHaveProperty(MARKER);
});
