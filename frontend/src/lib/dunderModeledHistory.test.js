import {DUNDER_ISO_HISTORY_VERSION} from './demoClients';
import {canConnectHistoryPositions, forecastImplementation, isDemoScenarioPosition, isDunderModeledHistoryPosition} from './portfolioProgress';

const program = 'demo_dunder:iso-27001';
const anchor = '2026-11-02T00:00:00.000Z';
const dates = ['2024-03-18T00:00:00.000Z', '2024-09-20T00:00:00.000Z'];
const ids = dates.map((at, index) => `demo:${program}:${at}:${index}`);
const context = {version: DUNDER_ISO_HISTORY_VERSION, client_id: 'demo_dunder', program_id: program,
  anchor, fingerprint: 'qualified-native-source-proof', point_ids: ids};
const copy = value => JSON.parse(JSON.stringify(value));
const counts = implemented => [{key: 'addressed', count: implemented}, {key: 'in_progress', count: 121 - implemented},
  {key: 'needs_attention', count: 0}, {key: 'not_assessed', count: 0}];
const fixtures = dates.map((at, index) => ({program_id: program, client_id: context.client_id,
  framework_key: 'iso-27001', snapshot_id: ids[index], captured_at: at, effective_at: at,
  observation_kind: 'demo_fixture', provenance: {kind: 'demo_fixture'},
  scenario_version: context.version, scenario_anchor: anchor, scenario_fingerprint: context.fingerprint,
  modeled_until: dates[index + 1] || anchor, scope_signature: `demo-scope:${program}:0`,
  source_revision: `demo-source:${program}:${index + 1}`, measure_version: 'native-implementation-v1',
  availability: 'available', denominator: 121, implemented: index ? 121 : 118,
  included_counts: counts(index ? 121 : 118)}));
const baseline = {...copy(fixtures[1]), snapshot_id: 'native-first-save', captured_at: '2026-11-03T12:00:00.000Z',
  effective_at: '2026-11-03T12:00:00.000Z', observation_kind: 'current_baseline', provenance: {kind: 'current_baseline'}};
for (const key of ['scenario_version', 'scenario_anchor', 'scenario_fingerprint', 'modeled_until']) delete baseline[key];

test('only the exact two source fixtures connect within their bounded fictional interval', () => {
  const before = JSON.stringify({fixtures, context, baseline});
  expect(fixtures.map(point => isDunderModeledHistoryPosition(point, context))).toEqual([true, true]);
  expect(fixtures.map(point => isDemoScenarioPosition(point, context))).toEqual([false, false]);
  expect(canConnectHistoryPositions(fixtures[0], fixtures[1], {demoScenario: context})).toBe(true);
  expect(canConnectHistoryPositions(fixtures[1], fixtures[0], {demoScenario: context})).toBe(false);
  expect(canConnectHistoryPositions(fixtures[0], fixtures[1])).toBe(false);
  expect(canConnectHistoryPositions(fixtures[1], baseline, {demoScenario: context})).toBe(false);
  expect(canConnectHistoryPositions(fixtures[0], baseline, {demoScenario: context})).toBe(false);
  expect(isDunderModeledHistoryPosition(baseline, context)).toBe(false);
  expect(JSON.stringify({fixtures, context, baseline})).toBe(before);
});

test('Dunder ISO presentation metadata grants no admission to the existing CIS scenario classifier', () => {
  const cisContext = {...context, program_id: 'demo_dunder:cis-ig1'};
  const forged = {...fixtures[0], program_id: cisContext.program_id, framework_key: 'cis-ig1'};
  expect(isDemoScenarioPosition(forged, cisContext)).toBe(false);
  expect(isDunderModeledHistoryPosition(forged, cisContext)).toBe(false);
});

test.each([
  ['missing context', () => null],
  ['foreign client', value => ({...value, client_id: 'demo_prestige'})],
  ['foreign program', value => ({...value, program_id: 'demo_dunder:soc-2'})],
  ['CIS version', value => ({...value, version: 'brawndo-cis-ig1-history-v2'})],
  ['unknown version', value => ({...value, version: 'unapproved'})],
  ['shifted anchor', value => ({...value, anchor: '2026-11-03T00:00:00.000Z'})],
  ['wrong fingerprint', value => ({...value, fingerprint: 'another-source'})],
  ['missing point', value => ({...value, point_ids: value.point_ids.slice(0, 1)})],
  ['reversed points', value => ({...value, point_ids: [...value.point_ids].reverse()})],
  ['extra point', value => ({...value, point_ids: [...value.point_ids, 'native-first-save']})],
  ['join context', value => ({...value, join_snapshot_id: baseline.snapshot_id})],
  ['held context', value => ({...value, held_until: baseline.effective_at})],
])('%s cannot qualify or connect a Dunder fixture', (_label, alter) => {
  const changed = alter(copy(context));
  expect(isDunderModeledHistoryPosition(fixtures[0], changed)).toBe(false);
  expect(canConnectHistoryPositions(fixtures[0], fixtures[1], {demoScenario: changed})).toBe(false);
  expect(canConnectHistoryPositions(fixtures[1], baseline, {demoScenario: changed})).toBe(false);
});

test.each([
  ['foreign identity', value => { value.snapshot_id = 'foreign'; }],
  ['foreign program', value => { value.program_id = 'demo_prestige:soc-2'; }],
  ['foreign client', value => { value.client_id = 'custom_dunder'; }],
  ['foreign framework', value => { value.framework_key = 'cis-ig1'; }],
  ['unknown version', value => { value.scenario_version = 'unapproved'; }],
  ['different anchor', value => { value.scenario_anchor = baseline.effective_at; }],
  ['different fingerprint', value => { value.scenario_fingerprint = 'changed'; }],
  ['different effective date', value => { value.effective_at = '2018-11-02T00:00:00.000Z'; }],
  ['extended interval', value => { value.modeled_until = baseline.effective_at; }],
  ['foreign measure', value => { value.measure_version = 'unknown'; }],
  ['different source revision', value => { value.source_revision = 'native-later-source'; }],
  ['different scope', value => { value.scope_signature = 'changed'; }],
  ['invalid count', value => { value.implemented = 123; }],
  ['observed continuity', value => { value.continuity_proven = true; value.effective_until = baseline.effective_at; }],
  ['join metadata', value => { value.join_snapshot_id = baseline.snapshot_id; }],
  ['held provenance', value => { value.provenance.held_until = baseline.effective_at; }],
])('%s cannot borrow the qualified fictional interval', (_label, alter) => {
  const changed = copy(fixtures[0]); alter(changed);
  expect(isDunderModeledHistoryPosition(changed, context)).toBe(false);
  expect(canConnectHistoryPositions(changed, fixtures[1], {demoScenario: context})).toBe(false);
});

test('Dunder fixture metadata cannot override a disconnected native baseline with observed-continuity claims', () => {
  const poisoned = {...fixtures[1], continuity_proven: true, effective_until: baseline.effective_at};
  expect(canConnectHistoryPositions(poisoned, baseline, {demoScenario: context})).toBe(false);
  expect(canConnectHistoryPositions(poisoned, baseline)).toBe(false);
  const native = {...baseline, continuity_proven: true, effective_until: '2026-11-04T12:00:00.000Z'};
  const next = {...baseline, snapshot_id: 'native-next', observation_kind: 'committed_event',
    effective_at: native.effective_until, captured_at: native.effective_until};
  expect(canConnectHistoryPositions(native, next, {demoScenario: context})).toBe(true);
});

test('2024 modeled positions contribute no votes to an incomplete 2026 native forecast', () => {
  const current = {...baseline, snapshot_id: 'native-later', observation_kind: 'committed_event',
    effective_at: '2026-11-04T12:00:00.000Z', captured_at: '2026-11-04T12:00:00.000Z',
    source_revision: `demo-source:${program}:5`, implemented: 120, included_counts: counts(120)};
  const result = forecastImplementation([...fixtures, baseline, current], current, current.effective_at, {demoScenario: context});
  expect(result).toMatchObject({ok: false, label: 'Not estimated', days: null, slope: null, monthly_pace: null});
  expect(result.reason).toMatch(/at least three genuine positions/);
  expect(result.calculation_basis).toBeUndefined();
});
