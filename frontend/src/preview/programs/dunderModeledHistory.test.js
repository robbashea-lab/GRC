import {activeDefinitions, frameworkCatalog} from '../../lib/frameworks';
import {DUNDER_ISO_HISTORY_VERSION} from '../../lib/demoClients';
import {captureDemoReporting} from '../portfolioReporting';
import {assessmentAt, DUNDER_SCENARIO_VERSION, EIGHT_YEAR_ANCHOR} from './isoSocEightYearSupport';
import {DUNDER_CURRENT_ASSESSMENTS} from './dunderEightYearContent';
import {registerDunderPreparedHistory, qualifiedDunderPreparedHistory,
  registerDunderModeledHistory, getDunderDemoScenarioContext} from './dunderPreparedHistory';

const CID = 'demo_dunder', PROGRAM = CID + ':iso-27001';
const AT = '2026-11-03T12:00:00.000Z', NEXT = '2026-11-04T12:00:00.000Z';
const SCOPE_AT = '2026-11-05T12:00:00.000Z', END = '2026-11-06T12:00:00.000Z';
const SAVED = ['2024-03-18', '2024-09-20', '2025-09-26', '2026-09-25'].map(day => day + 'T00:00:00.000Z');
const IDS = SAVED.slice(0, 2).map((at, index) => `demo:${PROGRAM}:${at}:${index}`);
const copy = value => JSON.parse(JSON.stringify(value));

// Use actual native catalog/capture vectors, with independent full historical answers.
function buildPrepared() {
  const baseline = {version: 3, completed: true, updated_at: EIGHT_YEAR_ANCHOR, requirements: {'iso-27001': 'applies'}};
  const db = {user: {user_id: 'demo_admin', workspace_mode: 'demo', role: 'super_admin', status: 'active', client_ids: [CID]},
    clients: [{client_id: CID, name: 'Dunder Mifflin', status: 'active', environment: 'Demo',
      demo_program_version: DUNDER_SCENARIO_VERSION, onboarding_baseline: copy(baseline),
      initial_program_baseline: {completed_at: EIGHT_YEAR_ANCHOR, state: copy(baseline)}}],
    baselines: {[CID]: baseline}, requirements: [{requirement_id: 'original_native_iso_enrollment', client_id: CID,
      baseline_key: 'iso-27001', baseline_response: 'applies', status: 'active'}],
    logs: [], findings: [], tasks: [], reviews: [], risks: [], vendors: [], policies: [],
    evidence: [{evidence_id: 'retained_native_file', client_id: CID, content_base64: 'ZXhhY3QgZmlsZQ=='}]};
  db.framework_assessments = activeDefinitions('iso-27001').map(definition => {
    const content = DUNDER_CURRENT_ASSESSMENTS[definition.id], excluded = ['A.8.4', 'A.8.28'].includes(definition.id);
    const history = SAVED.map((at, index) => ({...copy(content),
      status: excluded ? 'not_applicable' : index === 0 && ['A.5.30', 'A.8.13', 'A.8.16'].includes(definition.id) ? 'in_progress' : 'addressed',
      owner_id: 'demo_dunder_user_0', related_links: [], at, by: 'demo_dunder_user_0',
      na_rationale: excluded ? content.soa_justification : '', implementation: content.implementation + ' Saved at ' + at}));
    return {...definition, ...copy(history.at(-1)), framework_assessment_id: 'native_modeled_' + definition.id,
      definition_id: definition.id, client_id: CID, framework_key: 'iso-27001',
      framework_version: frameworkCatalog('iso-27001').version, created_at: SAVED[0],
      last_saved: SAVED[3], last_assessed: SAVED[3], updated_at: SAVED[3], assessment_history: history};
  });
  let previous = null;
  for (const at of SAVED) {
    const projection = {...db, framework_assessments: db.framework_assessments.map(row => assessmentAt(row, at)),
      portfolio_reporting: previous?.portfolio_reporting || {}};
    captureDemoReporting(projection, previous, at); previous = projection;
  }
  db.portfolio_reporting = previous.portfolio_reporting;
  registerDunderPreparedHistory(db);
  return db;
}

let preparedFixture, modeledFixture, nativeFixture;
beforeAll(() => {
  preparedFixture = buildPrepared();
  modeledFixture = copy(preparedFixture); registerDunderModeledHistory(modeledFixture);
  nativeFixture = copy(modeledFixture); captureDemoReporting(nativeFixture, null, AT);
});
const fixture = () => copy(modeledFixture);
const context = (db, at = AT) => getDunderDemoScenarioContext(db, CID, at);
const originals = db => db.portfolio_reporting.snapshots.filter(point => IDS.includes(point.snapshot_id));

function appendState(db, definition, at, fields) {
  const row = db.framework_assessments.find(record => record.definition_id === definition);
  const event = {...copy(row.assessment_history.at(-1)), ...fields, at, by: 'demo_dunder_user_0'};
  row.assessment_history.push(event);
  Object.assign(row, fields, {last_saved: at, last_assessed: at, updated_at: at});
}

function addExtraNative(db, fields = {}) {
  const point = copy(db.portfolio_reporting.snapshots.find(row => !IDS.includes(row.snapshot_id)));
  point.snapshot_id = 'extra_native_position'; point.source_event = point.snapshot_id;
  point.current.source_event = point.snapshot_id; point.current.provenance.source_event = point.snapshot_id;
  Object.assign(point, fields); db.portfolio_reporting.snapshots.push(point);
  return point;
}

test('fresh modeled registration adds only its bounded separate marker and preserves all prepared v1 bytes', () => {
  const db = copy(preparedFixture), before = copy(db), reporting = db.portfolio_reporting, prepared = db.dunder_demo_prepared_history;
  expect(registerDunderModeledHistory(db)).toBe(true);
  expect(db.portfolio_reporting).toBe(reporting); expect(db.dunder_demo_prepared_history).toBe(prepared);
  const after = copy(db); delete after.dunder_demo_modeled_history; expect(after).toEqual(before);
  expect(Object.keys(db.dunder_demo_prepared_history)).toHaveLength(13);
  expect(db.clients[0].demo_program_version).toBe(DUNDER_SCENARIO_VERSION);
  expect(db.dunder_demo_modeled_history).toMatchObject({schema_version: 1, version: DUNDER_ISO_HISTORY_VERSION,
    fixture_version: DUNDER_SCENARIO_VERSION, client_id: CID, program_id: PROGRAM, framework_key: 'iso-27001',
    anchor: EIGHT_YEAR_ANCHOR, intervals: [
      {point_id: IDS[0], from: SAVED[0], until: SAVED[1]},
      {point_id: IDS[1], from: SAVED[1], until: EIGHT_YEAR_ANCHOR},
    ]});
  expect(Object.keys(db.dunder_demo_modeled_history)).toHaveLength(10);
  expect(typeof db.dunder_demo_modeled_history.prepared_fingerprint).toBe('string');
  expect(typeof db.dunder_demo_modeled_history.fingerprint).toBe('string');
  const exact = JSON.stringify(db);
  expect(registerDunderModeledHistory(db)).toBe(false); expect(JSON.stringify(db)).toBe(exact);
  expect(registerDunderPreparedHistory(db)).toBe(false); expect(JSON.stringify(db)).toBe(exact);
  expect(qualifiedDunderPreparedHistory(db, AT)).not.toBeNull();
});

test('pure reader returns exactly six independent context fields and never decorates stored observations', () => {
  const db = fixture(), before = JSON.stringify(db), result = context(db);
  expect(Object.keys(result)).toEqual(['version', 'client_id', 'program_id', 'anchor', 'fingerprint', 'point_ids']);
  expect(result).toEqual({version: DUNDER_ISO_HISTORY_VERSION, client_id: CID, program_id: PROGRAM,
    anchor: EIGHT_YEAR_ANCHOR, fingerprint: db.dunder_demo_modeled_history.fingerprint, point_ids: IDS});
  result.point_ids.pop(); expect(context(db).point_ids).toEqual(IDS);
  expect(JSON.stringify(db)).toBe(before);
  for (const point of originals(db)) for (const row of [point, point.current, point.current.provenance]) {
    expect(Object.keys(row).some(key => key === 'modeled_until' || key.startsWith('join_') || key.startsWith('held_'))).toBe(false);
    expect(Object.hasOwn(row, 'continuity_proven')).toBe(false);
  }
});

test('old prepared-only stores stay available to v1 and never gain modeled context on read', () => {
  const db = copy(preparedFixture), before = JSON.stringify(db);
  expect(qualifiedDunderPreparedHistory(db, AT)).not.toBeNull(); expect(context(db)).toBeNull();
  expect(JSON.stringify(db)).toBe(before); expect(Object.hasOwn(db, 'dunder_demo_modeled_history')).toBe(false);
});

test.each(['super_admin', 'platform_admin', 'client_grc_manager', 'client_contributor', 'client_readonly', 'client_viewer'])(
  'recognized %s readers retain native client access', role => {
    const db = fixture(); db.user.role = role; db.user.client_ids = [CID];
    const before = JSON.stringify(db); expect(context(db)).not.toBeNull(); expect(JSON.stringify(db)).toBe(before);
  });

test('native platform-wide access remains distinct from the viewer membership exception', () => {
  const db = fixture(); Object.assign(db.user, {role: 'platform_admin', all_clients: true, client_ids: []});
  expect(context(db)).not.toBeNull(); db.user.role = 'client_viewer'; expect(context(db)).toBeNull();
  db.user.client_ids = [CID]; expect(context(db)).not.toBeNull();
  db.user.client_ids = CID; expect(context(db)).toBeNull();
});

test('genuine later native observations, current baseline dates and scope/head changes preserve the original proof', () => {
  const db = copy(nativeFixture), marker = copy(db.dunder_demo_prepared_history), points = JSON.stringify(originals(db));
  expect(db.portfolio_reporting.snapshots).toHaveLength(3); expect(context(db)).not.toBeNull();
  expect(qualifiedDunderPreparedHistory(db, AT)).toBeNull(); // First-save v1 stays strict.
  let previous = copy(db);
  appendState(db, '4.1', NEXT, {status: 'in_progress', implementation: 'Later native current answer'});
  db.baselines[CID].updated_at = NEXT; captureDemoReporting(db, previous, NEXT);
  previous = copy(db);
  appendState(db, 'A.5.1', SCOPE_AT, {status: 'not_applicable', soa_applicability: 'excluded',
    soa_justification: 'Later native scope decision', na_rationale: 'Later native scope decision'});
  db.baselines[CID].updated_at = SCOPE_AT; captureDemoReporting(db, previous, SCOPE_AT);
  const identity = db.portfolio_reporting.identities.find(row => row.program_id === PROGRAM);
  expect(identity.head.revision).toBeGreaterThan(4); expect(identity.scopes).toHaveLength(2);
  expect(db.portfolio_reporting.scope_events.length).toBeGreaterThan(0);
  const beforeRead = JSON.stringify(db), result = context(db, END);
  expect(result).not.toBeNull(); expect(result.point_ids).toEqual(IDS); expect(result.anchor).toBe(EIGHT_YEAR_ANCHOR);
  expect(JSON.stringify(db)).toBe(beforeRead); expect(JSON.stringify(originals(db))).toBe(points);
  expect(db.dunder_demo_prepared_history).toEqual(marker); expect(db.baselines[CID].updated_at).toBe(SCOPE_AT);
  expect(db.framework_assessments.find(row => row.definition_id === '4.1').status).toBe('in_progress');
  expect(() => registerDunderModeledHistory(db)).toThrow('fresh prepared source');
});

test('the historical context does not assert availability or counts for a later native endpoint', () => {
  const db = copy(nativeFixture), point = db.portfolio_reporting.snapshots.at(-1);
  point.current.availability = 'partial'; point.current.implemented = null; point.current.percentage = null;
  expect(context(db)).not.toBeNull();
});

test.each([
  ['missing model marker', db => { delete db.dunder_demo_modeled_history; }],
  ['unknown model key', db => { db.dunder_demo_modeled_history.extra = true; }],
  ['unsupported version', db => { db.dunder_demo_modeled_history.version = 'another_version'; }],
  ['wrong model schema', db => { db.dunder_demo_modeled_history.schema_version = 2; }],
  ['wrong fixture', db => { db.dunder_demo_modeled_history.fixture_version = 'another_fixture'; }],
  ['wrong anchor', db => { db.dunder_demo_modeled_history.anchor = AT; }],
  ['wrong program', db => { db.dunder_demo_modeled_history.program_id = 'demo_dunder:cis-ig1'; }],
  ['wrong bound', db => { db.dunder_demo_modeled_history.intervals[1].until = AT; }],
  ['wrong first bound', db => { db.dunder_demo_modeled_history.intervals[0].from = '2018-11-02T00:00:00.000Z'; }],
  ['prepared fingerprint', db => { db.dunder_demo_modeled_history.prepared_fingerprint = 'changed'; }],
  ['model fingerprint', db => { db.dunder_demo_modeled_history.fingerprint = 'changed'; }],
  ['missing prepared proof', db => { delete db.dunder_demo_prepared_history; }],
  ['changed old full answer', db => { db.framework_assessments[0].assessment_history[2].implementation = 'Changed old answer'; }],
  ['changed old actor', db => { db.framework_assessments[0].assessment_history[2].by = 'another_actor'; }],
  ['changed old relationship', db => db.framework_assessments[0].assessment_history[2].related_links.push({kind: 'risks', id: 'changed'})],
  ['additional pre-anchor state', db => db.framework_assessments[0].assessment_history.push({...copy(db.framework_assessments[0].assessment_history[3]), at: '2026-10-01T00:00:00.000Z'})],
  ['changed old applicability', db => { db.framework_assessments.find(row => row.definition_id === 'A.8.4').assessment_history[0].soa_applicability = 'included'; }],
  ['missing source record', db => db.framework_assessments.pop()],
  ['duplicate source record', db => db.framework_assessments.push(copy(db.framework_assessments[0]))],
  ['foreign source record', db => { db.framework_assessments[0].client_id = 'demo_prestige'; }],
  ['unsupported catalog', db => { db.framework_assessments[0].framework_version = '2013'; }],
  ['changed original point', db => { db.portfolio_reporting.snapshots[0].current.percentage = 100; }],
  ['missing original point', db => db.portfolio_reporting.snapshots.splice(0, 1)],
  ['duplicate original point', db => db.portfolio_reporting.snapshots.push(copy(db.portfolio_reporting.snapshots[0]))],
  ['changed original enrollment', db => { db.portfolio_reporting.snapshots[0].current.scope.enrollment_ids = ['unknown']; }],
  ['inactive original enrollment', db => { db.requirements[0].status = 'inactive'; }],
  ['missing native identity', db => db.portfolio_reporting.identities.splice(0, 1)],
  ['altered original scope0', db => { db.portfolio_reporting.identities[0].scopes[0] += 'changed'; }],
  ['duplicate native identity', db => db.portfolio_reporting.identities.push(copy(db.portfolio_reporting.identities[0]))],
  ['signed-in user', db => { db.user.workspace_mode = 'standard'; }],
  ['disabled reader', db => { db.user.status = 'disabled'; }],
  ['reader without membership', db => { db.user.role = 'client_readonly'; db.user.client_ids = ['demo_prestige']; }],
  ['unknown role', db => { db.user.role = 'unknown'; }],
  ['custom client', db => { db.clients[0].client_id = 'custom_dunder'; }],
  ['archived client', db => { db.clients[0].archived = true; }],
  ['wrong environment', db => { db.clients[0].environment = 'Production'; }],
  ['ISO no longer enabled', db => { db.baselines[CID].requirements['iso-27001'] = 'does_not_apply'; }],
  ['altered initial anchor', db => { db.clients[0].initial_program_baseline.state.updated_at = AT; }],
  ['malformed collections', db => { db.framework_assessments = {}; }],
  ['null snapshot', db => db.portfolio_reporting.snapshots.push(null)],
])('%s fails closed without mutation', (name, alter) => {
  const db = fixture(); alter(db); const before = JSON.stringify(db);
  expect(() => context(db)).not.toThrow(); expect(context(db)).toBeNull(); expect(JSON.stringify(db)).toBe(before);
});

test.each([
  ['extra pre-anchor native point', db => addExtraNative(db, {effective_at: SAVED[2], captured_at: SAVED[2]})],
  ['extra future native point', db => addExtraNative(db, {effective_at: END, captured_at: END})],
  ['extra authored point', db => addExtraNative(db, {observation_kind: 'demo_fixture'})],
  ['owned point with wrong program', db => addExtraNative(db, {program_id: 'another:iso-27001'})],
  ['owned point with wrong client', db => addExtraNative(db, {client_id: 'demo_prestige'})],
  ['unknown point kind', db => addExtraNative(db, {observation_kind: 'unknown'})],
  ['missing native source event', db => { addExtraNative(db).source_event = null; }],
  ['duplicate native point', db => db.portfolio_reporting.snapshots.push(copy(db.portfolio_reporting.snapshots.at(-1)))],
])('%s cannot expand the two modeled source positions', (name, alter) => {
  const db = copy(nativeFixture); alter(db); const before = JSON.stringify(db);
  expect(context(db)).toBeNull(); expect(JSON.stringify(db)).toBe(before);
});

test.each(['null-prototype', 'custom-prototype'])('an existing %s marker is rejected atomically', kind => {
  const db = copy(preparedFixture), marker = copy(modeledFixture.dunder_demo_modeled_history);
  db.dunder_demo_modeled_history = Object.assign(Object.create(kind === 'null-prototype' ? null : {custom: true}), marker);
  const before = JSON.stringify(db), original = db.dunder_demo_modeled_history;
  expect(context(db)).toBeNull(); expect(() => registerDunderModeledHistory(db)).toThrow('must be retained');
  expect(db.dunder_demo_modeled_history).toBe(original); expect(JSON.stringify(db)).toBe(before);
});

test('failed fresh registration cannot publish a marker or modify prepared v1 state', () => {
  for (const alter of [db => Object.preventExtensions(db), db => { db.user.role = 'client_readonly'; },
    db => { db.dunder_demo_modeled_history = {}; }, db => { db.dunder_demo_prepared_history.point_fingerprints[0] = 'changed'; }]) {
    const db = copy(preparedFixture); alter(db); const before = JSON.stringify(db), reporting = db.portfolio_reporting;
    expect(() => registerDunderModeledHistory(db)).toThrow(); expect(JSON.stringify(db)).toBe(before);
    expect(db.portfolio_reporting).toBe(reporting);
  }
  const db = copy(preparedFixture), setter = jest.fn();
  Object.setPrototypeOf(db, Object.defineProperty({}, 'dunder_demo_modeled_history', {set: setter}));
  const before = JSON.stringify(db); expect(() => registerDunderModeledHistory(db)).toThrow();
  expect(setter).not.toHaveBeenCalled(); expect(JSON.stringify(db)).toBe(before);
});

test('context never opts in foreign clients, pre-anchor requests or malformed roots', () => {
  const db = fixture(), before = JSON.stringify(db);
  expect(getDunderDemoScenarioContext(db, 'demo_prestige', AT)).toBeNull();
  expect(getDunderDemoScenarioContext(db, 'custom_dunder', AT)).toBeNull();
  for (const at of [undefined, 'invalid', '2018-11-02T00:00:00.000Z', '2026-11-01T23:59:59.999Z']) expect(getDunderDemoScenarioContext(db, CID, at)).toBeNull();
  expect(getDunderDemoScenarioContext(null, CID, AT)).toBeNull(); expect(JSON.stringify(db)).toBe(before);
});
