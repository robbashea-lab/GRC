import {activeDefinitions, frameworkCatalog} from '../../lib/frameworks';
import {captureDemoReporting} from '../portfolioReporting';
import {assessmentAt, DUNDER_SCENARIO_VERSION, EIGHT_YEAR_ANCHOR} from './isoSocEightYearSupport';
import {DUNDER_CURRENT_ASSESSMENTS} from './dunderEightYearContent';
import {registerDunderPreparedHistory, qualifiedDunderPreparedHistory} from './dunderPreparedHistory';

const CID = 'demo_dunder', PROGRAM = CID + ':iso-27001', AT = '2026-11-03T12:00:00.000Z';
const DAYS = ['2024-03-18', '2024-09-20', '2025-09-26', '2026-09-25'];
const INSTANTS = DAYS.map(day => day + 'T00:00:00.000Z');
const POINT_IDS = INSTANTS.slice(0, 2).map((at, index) => `demo:${PROGRAM}:${at}:${index}`);
const copy = value => JSON.parse(JSON.stringify(value));

// Actual native catalog/capture vectors; no Scenario/store construction is needed.
function buildFixture() {
  const baseline = {version: 3, completed: true, updated_at: EIGHT_YEAR_ANCHOR, requirements: {'iso-27001': 'applies'}};
  const db = {user: {user_id: 'demo_admin', workspace_mode: 'demo', role: 'super_admin', status: 'active', client_ids: [CID]},
    clients: [{client_id: CID, name: 'Dunder Mifflin', status: 'active', environment: 'Demo',
      demo_program_version: DUNDER_SCENARIO_VERSION, onboarding_baseline: copy(baseline),
      initial_program_baseline: {completed_at: EIGHT_YEAR_ANCHOR, state: copy(baseline)}}],
    baselines: {[CID]: baseline}, requirements: [{requirement_id: 'native_iso_enrollment', client_id: CID,
      baseline_key: 'iso-27001', baseline_response: 'applies', status: 'active'}],
    logs: [], findings: [], tasks: [], reviews: [], risks: [], vendors: [], policies: [], evidence: []};
  db.framework_assessments = activeDefinitions('iso-27001').map(definition => {
    const content = DUNDER_CURRENT_ASSESSMENTS[definition.id];
    const excluded = ['A.8.4', 'A.8.28'].includes(definition.id);
    const history = INSTANTS.map((at, index) => ({...copy(content),
      status: excluded ? 'not_applicable' : index === 0 && ['A.5.30', 'A.8.13', 'A.8.16'].includes(definition.id) ? 'in_progress' : 'addressed',
      owner_id: 'demo_dunder_user_0', related_links: [], at, by: 'demo_dunder_user_0',
      na_rationale: excluded ? content.soa_justification : '',
      implementation: content.implementation + ' Retained saved state ' + at}));
    return {...definition, ...copy(history.at(-1)), framework_assessment_id: 'native_assessment_' + definition.id,
      definition_id: definition.id, client_id: CID, framework_key: 'iso-27001',
      framework_version: frameworkCatalog('iso-27001').version, created_at: INSTANTS[0],
      last_saved: INSTANTS[3], last_assessed: INSTANTS[3], updated_at: INSTANTS[3], assessment_history: history};
  });
  let previous = null;
  for (const at of INSTANTS) {
    const projection = {...db, framework_assessments: db.framework_assessments.map(row => assessmentAt(row, at)),
      portfolio_reporting: previous?.portfolio_reporting || {}};
    captureDemoReporting(projection, previous, at);
    previous = projection;
  }
  db.portfolio_reporting = previous.portfolio_reporting;
  db.portfolio_reporting.snapshots.push({snapshot_id: 'foreign_point', client_id: 'demo_prestige', program_id: 'demo_prestige:soc-2',
    captured_at: '2025-01-01T00:00:00.000Z', current: {note: 'Keep foreign history'}});
  db.portfolio_reporting.identities.push({program_id: 'demo_prestige:soc-2', note: 'Keep foreign identity'});
  return db;
}

let retainedFixture;
beforeAll(() => { retainedFixture = buildFixture(); });
const fixture = () => copy(retainedFixture);

function initialPoints(db) { return db.portfolio_reporting.snapshots.filter(row => POINT_IDS.includes(row.snapshot_id)); }

test('register only the two native source positions and qualify their complete four saved-history prefixes', () => {
  const db = fixture(), originalRows = JSON.stringify(db.framework_assessments), originalPoints = copy(initialPoints(db));
  const foreignPoint = db.portfolio_reporting.snapshots.at(-1), foreignIdentity = db.portfolio_reporting.identities.at(-1);
  expect(initialPoints(db)).toHaveLength(2);
  expect(db.portfolio_reporting.identities[0].head.revision).toBe(4);
  expect(registerDunderPreparedHistory(db)).toBe(true);
  expect(JSON.stringify(db.framework_assessments)).toBe(originalRows);
  expect(db.portfolio_reporting.snapshots.at(-1)).toBe(foreignPoint);
  expect(db.portfolio_reporting.identities.at(-1)).toBe(foreignIdentity);
  const marker = db.dunder_demo_prepared_history;
  expect(marker).toMatchObject({schema_version: 1, version: 'dunder-iso27001-prepared-history-v1',
    fixture_version: DUNDER_SCENARIO_VERSION, client_id: CID, program_id: PROGRAM,
    framework_key: 'iso-27001', catalog_version: '2022 + Amd 1:2024', measure_version: 'native-implementation-v1',
    anchor: EIGHT_YEAR_ANCHOR, point_ids: POINT_IDS});
  expect(marker.source_fingerprints).toHaveLength(4); expect(new Set(marker.source_fingerprints).size).toBe(4);
  expect(marker.point_fingerprints).toHaveLength(2); expect(typeof marker.identity_fingerprint).toBe('string');
  expect(JSON.stringify(marker).length).toBeLessThan(2000);
  const beforeRead = JSON.stringify(db), result = qualifiedDunderPreparedHistory(db, AT);
  expect(JSON.stringify(db)).toBe(beforeRead);
  expect(Object.keys(result).sort()).toEqual(['anchor', 'client_id', 'identities', 'point_ids', 'program_id', 'snapshots']);
  expect(result.point_ids).toEqual(POINT_IDS); expect(result.snapshots).toHaveLength(2); expect(result.identities).toHaveLength(1);
  result.snapshots.forEach((point, index) => {
    const original = originalPoints[index];
    for (const key of ['snapshot_id', 'captured_at', 'effective_at', 'source_revision']) expect(point[key]).toEqual(original[key]);
    for (const key of ['implemented', 'denominator', 'percentage', 'counts', 'scope', 'scope_signature'])
      expect(point.current[key]).toEqual(original.current[key]);
    expect(point.current.provenance.source_references).toEqual(original.current.provenance.source_references);
    expect(point.current.provenance.source_references).toHaveLength(123);
    expect(point.observation_kind).toBe('demo_fixture'); expect(point.current.observation_kind).toBe('demo_fixture');
    expect(point.current.provenance).toMatchObject({kind: 'demo_fixture', label: 'Fictional Demo assessment history', source_event: null});
    expect(point.source_event).toBeNull(); expect(point.current.source_event).toBeNull();
    for (const value of [point, point.current, point.current.provenance])
      for (const key of ['continuity_proven', 'effective_until', 'continuity_source_event', 'modeled_until', 'join_snapshot_id', 'held_until'])
        expect(Object.hasOwn(value, key)).toBe(false);
  });
  expect(result.snapshots.map(point => point.current.implemented)).toEqual([118, 121]);
  expect(result.snapshots.map(point => point.current.denominator)).toEqual([121, 121]);
  expect(result.snapshots.map(point => point.current.excluded)).toEqual([2, 2]);
});

test('qualification returns independent values and repeat registration never rewrites source', () => {
  const db = fixture(); registerDunderPreparedHistory(db);
  const before = JSON.stringify(db), reporting = db.portfolio_reporting, marker = db.dunder_demo_prepared_history;
  const result = qualifiedDunderPreparedHistory(db, AT);
  result.snapshots[0].current.provenance.source_references[0].status = 'needs_attention';
  result.identities[0].head.revision = 999; result.point_ids.pop();
  expect(JSON.stringify(db)).toBe(before); expect(qualifiedDunderPreparedHistory(db, AT)).not.toBeNull();
  expect(registerDunderPreparedHistory(db)).toBe(false);
  expect(db.portfolio_reporting).toBe(reporting); expect(db.dunder_demo_prepared_history).toBe(marker);
  expect(JSON.stringify(db)).toBe(before);
});

test('append-only events after the anchor remain intact without extending the four-prefix source proof', () => {
  const db = fixture(); registerDunderPreparedHistory(db);
  const marker = copy(db.dunder_demo_prepared_history), row = db.framework_assessments[0];
  const later = {...copy(row.assessment_history.at(-1)), at: '2026-11-03T00:00:00.000Z',
    status: 'in_progress', implementation: 'Later changed current implementation', notes: 'Later native saved state'};
  row.assessment_history.push(later);
  Object.assign(row, {status: later.status, implementation: later.implementation, notes: later.notes,
    last_saved: later.at, last_assessed: later.at, updated_at: later.at});
  const before = JSON.stringify(db);
  expect(qualifiedDunderPreparedHistory(db, AT)).not.toBeNull();
  expect(JSON.stringify(db)).toBe(before); expect(db.dunder_demo_prepared_history).toEqual(marker);
  expect(row.assessment_history).toHaveLength(5); expect(row.status).toBe('in_progress');
});

test.each([
  ['missing marker', db => { delete db.dunder_demo_prepared_history; }],
  ['unknown marker key', db => { db.dunder_demo_prepared_history.custom = true; }],
  ['schema', db => { db.dunder_demo_prepared_history.schema_version = 2; }],
  ['version', db => { db.dunder_demo_prepared_history.version = 'unapproved'; }],
  ['fixture version', db => { db.clients[0].demo_program_version = 'another_fixture'; }],
  ['signed-in actor', db => { db.user.workspace_mode = 'standard'; }],
  ['inactive actor', db => { db.user.status = 'disabled'; }],
  ['read-only actor', db => { db.user.role = 'client_readonly'; }],
  ['actor without access', db => { db.user.role = 'platform_admin'; db.user.client_ids = []; }],
  ['custom client', db => { db.clients[0].client_id = 'custom_dunder'; }],
  ['archived client', db => { db.clients[0].archived_at = AT; }],
  ['wrong environment', db => { db.clients[0].environment = 'Production'; }],
  ['wrong anchor', db => { db.dunder_demo_prepared_history.anchor = AT; }],
  ['incomplete baseline', db => { db.baselines[CID].completed = false; }],
  ['duplicate client', db => db.clients.push(copy(db.clients[0]))],
  ['missing assessment', db => db.framework_assessments.pop()],
  ['duplicate assessment', db => db.framework_assessments.push(copy(db.framework_assessments[0]))],
  ['foreign assessment', db => { db.framework_assessments[0].client_id = 'demo_prestige'; }],
  ['wrong catalog', db => { db.framework_assessments[0].framework_version = '2013'; }],
  ['missing saved state', db => db.framework_assessments[0].assessment_history.splice(2, 1)],
  ['duplicate saved state', db => db.framework_assessments[0].assessment_history.push(copy(db.framework_assessments[0].assessment_history[3]))],
  ['extra state before anchor', db => db.framework_assessments[0].assessment_history.push({...copy(db.framework_assessments[0].assessment_history[3]), at: '2026-10-01T00:00:00.000Z'})],
  ['changed full saved answer', db => { db.framework_assessments[0].assessment_history[1].implementation = 'Altered historical answer'; }],
  ['changed historical actor', db => { db.framework_assessments[0].assessment_history[1].by = 'another_actor'; }],
  ['changed historical relationship', db => db.framework_assessments[0].assessment_history[1].related_links.push({kind: 'risks', id: 'changed'})],
  ['missing point', db => db.portfolio_reporting.snapshots.splice(0, 1)],
  ['duplicate point', db => db.portfolio_reporting.snapshots.push(copy(db.portfolio_reporting.snapshots[0]))],
  ['foreign point', db => { db.portfolio_reporting.snapshots[0].client_id = 'demo_prestige'; }],
  ['wrong point ID', db => { db.portfolio_reporting.snapshots[0].snapshot_id = 'another_point'; }],
  ['changed point date', db => { db.portfolio_reporting.snapshots[0].effective_at = '2018-11-02T00:00:00.000Z'; }],
  ['changed numerator', db => { db.portfolio_reporting.snapshots[0].current.implemented += 1; }],
  ['changed reference', db => { db.portfolio_reporting.snapshots[0].current.provenance.source_references[0].status = 'not_assessed'; }],
  ['changed reference version', db => { db.portfolio_reporting.snapshots[0].current.provenance.source_references[0].version = INSTANTS[3]; }],
  ['changed applicability', db => { db.portfolio_reporting.snapshots[0].current.scope.applicability['A.8.4'] = 'included'; }],
  ['missing identity', db => db.portfolio_reporting.identities.splice(0, 1)],
  ['duplicate identity', db => db.portfolio_reporting.identities.push(copy(db.portfolio_reporting.identities[0]))],
  ['changed identity revision', db => { db.portfolio_reporting.identities[0].head.revision = 5; }],
  ['changed identity vector', db => { db.portfolio_reporting.identities[0].head.signature += 'altered'; }],
  ['modeled interval', db => { db.portfolio_reporting.snapshots[0].current.modeled_until = EIGHT_YEAR_ANCHOR; }],
  ['held metadata', db => { db.portfolio_reporting.snapshots[0].current.provenance.held_source_revision = 'unauthorized'; }],
  ['join metadata', db => { db.portfolio_reporting.snapshots[0].join_custom = 'unauthorized'; }],
])('%s rejects qualification without repairing or writing any record', (name, alter) => {
  const db = fixture(); registerDunderPreparedHistory(db); alter(db);
  const before = JSON.stringify(db);
  expect(qualifiedDunderPreparedHistory(db, AT)).toBeNull();
  expect(JSON.stringify(db)).toBe(before);
});

test.each([
  ['missing clients', db => { delete db.clients; }],
  ['nonarray clients', db => { db.clients = {}; }],
  ['null client row', db => db.clients.push(null)],
  ['nonarray assessments', db => { db.framework_assessments = {}; }],
  ['null assessment row', db => db.framework_assessments.push(null)],
  ['nonarray requirements', db => { db.requirements = {}; }],
  ['null requirement row', db => db.requirements.push(null)],
  ['nonarray snapshots', db => { db.portfolio_reporting.snapshots = {}; }],
  ['null snapshot', db => db.portfolio_reporting.snapshots.push(null)],
  ['nonarray identities', db => { db.portfolio_reporting.identities = {}; }],
  ['null identity', db => db.portfolio_reporting.identities.push(null)],
  ['malformed counts', db => { db.portfolio_reporting.snapshots[0].current.counts = {}; }],
])('%s returns null at the optional admission boundary', (name, alter) => {
  const db = fixture(); registerDunderPreparedHistory(db); alter(db);
  const before = JSON.stringify(db);
  expect(() => qualifiedDunderPreparedHistory(db, AT)).not.toThrow();
  expect(qualifiedDunderPreparedHistory(db, AT)).toBeNull();
  expect(JSON.stringify(db)).toBe(before);
});

test.each([
  ['missing source point', db => db.portfolio_reporting.snapshots.splice(0, 1)],
  ['changed native identity', db => { db.portfolio_reporting.identities[0].head.revision = 3; }],
  ['forbidden held field', db => { db.portfolio_reporting.snapshots[0].held_snapshot_id = 'not_allowed'; }],
  ['forbidden join field', db => { db.portfolio_reporting.snapshots[0].current.join_source_revision = 'not_allowed'; }],
  ['nonextensible root', db => Object.preventExtensions(db)],
  ['read-only reporting slot', db => Object.defineProperty(db, 'portfolio_reporting', {writable: false})],
  ['unknown existing marker', db => { db.dunder_demo_prepared_history = {}; }],
])('%s makes registration fail atomically', (name, alter) => {
  const db = fixture(); alter(db); const before = JSON.stringify(db), reporting = db.portfolio_reporting;
  expect(() => registerDunderPreparedHistory(db)).toThrow();
  expect(JSON.stringify(db)).toBe(before); expect(db.portfolio_reporting).toBe(reporting);
});

test('an inherited marker setter is never invoked and cannot partially publish reporting', () => {
  const db = fixture(), setter = jest.fn();
  Object.setPrototypeOf(db, Object.defineProperty({}, 'dunder_demo_prepared_history', {set: setter}));
  const before = JSON.stringify(db), reporting = db.portfolio_reporting;
  expect(() => registerDunderPreparedHistory(db)).toThrow('Invalid initial Dunder prepared history source');
  expect(setter).not.toHaveBeenCalled(); expect(db.portfolio_reporting).toBe(reporting);
  expect(JSON.stringify(db)).toBe(before);
});

test('an early or invalid cutoff cannot qualify the fixed source', () => {
  const db = fixture(); registerDunderPreparedHistory(db);
  for (const at of [undefined, 'invalid', '2024-03-18T00:00:00.000Z', '2026-11-01T23:59:59.999Z'])
    expect(qualifiedDunderPreparedHistory(db, at)).toBeNull();
  expect(qualifiedDunderPreparedHistory(null, AT)).toBeNull();
});
