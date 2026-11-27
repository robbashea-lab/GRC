import {applicableCounts, calendarRangeStart, currentPercentage, forecastImplementation, historyWindow,
  periodChange, portfolioGroups, programIdentity, snapshotTime,isDemoScenarioPosition,canConnectHistoryPositions} from './portfolioProgress';

const at = day => new Date(Date.UTC(2026, 6, 15) + day * 86400000).toISOString();
const snapshot = (day, implemented, overrides = {}) => ({effective_at: at(day), captured_at: at(day),
  observation_kind: 'committed_event', source_revision: `revision-${day}`, measure_version: 'native-implementation-v1',
  scope_signature: '56-safeguards', availability: 'available', denominator: 56, implemented,
  counts: [{key: 'addressed', count: implemented}, {key: 'in_progress', count: 0},
    {key: 'needs_attention', count: 56 - implemented}, {key: 'not_assessed', count: 0}], ...overrides});
const fixture = [snapshot(0, 26), snapshot(30, 29), snapshot(60, 32)];

test('modeled fixture votes require the exact opt-in context and preserve their provenance',()=>{
  const context={version:'brawndo-cis-ig1-history-v2',client_id:'demo_brawndo',program_id:'demo_brawndo:cis-ig1',anchor:at(60),fingerprint:'owned-model',point_ids:['p0','p1','p2']};
  const points=fixture.map((value,index)=>({...value,program_id:context.program_id,snapshot_id:context.point_ids[index],
    observation_kind:'demo_fixture',provenance:{kind:'demo_fixture'},scenario_version:context.version,scenario_anchor:context.anchor,scenario_fingerprint:context.fingerprint,
    modeled_until:at([30,60,60][index])}));
  const before=JSON.stringify(points);
  expect(forecastImplementation(points,points[2],at(60)).ok).toBe(false);
  expect(forecastImplementation(points,points[2],at(60),{demoScenario:context})).toMatchObject({ok:true,calculation_basis:'demo_scenario'});
  expect(forecastImplementation(points,points[2],at(60),{demoScenario:{...context,fingerprint:'other'}}).ok).toBe(false);
  expect(isDemoScenarioPosition({...points[0],program_id:'foreign'},context)).toBe(false);
  expect(canConnectHistoryPositions(points[0],points[1])).toBe(false);
  expect(canConnectHistoryPositions(points[0],points[1],{demoScenario:context})).toBe(true);
  expect(canConnectHistoryPositions(points[0],points[2],{demoScenario:context})).toBe(false);
  expect(canConnectHistoryPositions(points[0],{...points[1],snapshot_id:'unknown-foreign-fixture'},{demoScenario:context})).toBe(false);
  expect(JSON.stringify(points)).toBe(before);
});

test('shared OLS fixture calculates 0.1 implemented items/day and 240 remaining days', () => {
  const forecast = forecastImplementation(fixture, fixture[2], at(60));
  expect(forecast.slope).toBeCloseTo(0.1, 12);
  expect(forecast.days).toBeCloseTo(240, 10);
  expect(forecast.monthly_pace).toBeCloseTo(3.044, 12);
  expect(forecast.label).toMatch(/^Around /);
});

test('one vote per UTC calendar day retains latest actual effective timestamp', () => {
  const burst = snapshot(30, 50, {effective_at: at(30).replace('00:00', '01:00'), captured_at: at(30).replace('00:00', '01:00')});
  const latest = snapshot(30, 29, {effective_at: at(30).replace('00:00', '02:00'), captured_at: at(30).replace('00:00', '02:00')});
  const result = forecastImplementation([fixture[0], burst, latest, fixture[2]], fixture[2], at(60));
  expect(result.slope).toBeCloseTo(0.1, 4);
  expect(result.note).toContain('3 genuine daily positions');
});

test.each([
  ['sampled positions', fixture.map(value => ({...value, observation_kind: 'sampled'}))],
  ['two positions', [fixture[0], fixture[2]]],
  ['short span', [snapshot(10, 26), snapshot(30, 29), snapshot(60, 32)]],
  ['decline', [snapshot(0, 40), snapshot(30, 35), fixture[2]]],
  ['no net gain', [snapshot(0, 32), snapshot(30, 30), fixture[2]]],
  ['same-size changed scope', [fixture[0], {...fixture[1], scope_signature: 'other-56-members'}, fixture[2]]],
  ['changed measure', [fixture[0], {...fixture[1], measure_version: 'other'}, fixture[2]]],
  ['future observation', [snapshot(61, 26), snapshot(62, 29), snapshot(63, 32)]]
])('suppresses forecast for %s', (_label, values) => {
  expect(forecastImplementation(values, fixture[2], at(60)).ok).toBe(false);
});

test('scope activity resets the fit even if counts and denominator return to the original state', () => {
  expect(forecastImplementation(fixture, fixture[2], at(60), {scopeChanges: [{at: at(1)}]}).ok).toBe(false);
});

test('current source revision, current counts and freshness must match retained history', () => {
  expect(forecastImplementation(fixture, {...fixture[2], source_revision: 'new-save'}, at(60)).note).toMatch(/does not yet match/);
  expect(forecastImplementation(fixture, fixture[2], at(91)).note).toMatch(/30 days old/);
  expect(forecastImplementation(fixture, snapshot(60, 33), at(60)).ok).toBe(false);
});

test('missing scope/version/revision never supports an estimate; samples prove freshness without regression votes',()=>{
  for(const field of ['scope_signature','measure_version','source_revision']) {
    const incomplete=fixture.map(value=>({...value,[field]:undefined}));
    expect(forecastImplementation(incomplete,incomplete[2],at(60)).ok).toBe(false);
  }
  const observed={...fixture[2],effective_at:at(90),captured_at:at(90),observation_kind:'sampled'};
  const shifted=fixture.map((value,index)=>({...value,effective_at:at([1,31,61][index]),captured_at:at([1,31,61][index])}));
  const current=shifted[2];
  const fresh={...observed,source_revision:current.source_revision};
  expect(forecastImplementation([...shifted,fresh],current,at(92)).ok).toBe(false);
  expect(forecastImplementation([...shifted,fresh],current,at(91)).slope).toBeCloseTo(0.1,12);
  expect(forecastImplementation([...shifted,fresh],current,at(91)).note).toContain('3 genuine daily positions');
});

test('all implemented nonzero scope, zero scope and invalid counts remain distinct', () => {
  expect(forecastImplementation([], snapshot(60, 56), at(60)).label).toBe('Fully implemented');
  const zero = snapshot(60, 0, {denominator: 0, counts: snapshot(60, 56).counts.map(value => ({...value, count: 0}))});
  expect(forecastImplementation([], zero, at(60)).note).toBe('No applicable scope.');
  expect(currentPercentage(zero)).toBeNull();
  expect(currentPercentage({...fixture[2], denominator: 55})).toBeNull();
  expect(currentPercentage({...fixture[2], availability: 'partial'})).toBeNull();
  expect(currentPercentage({...fixture[2], counts: [...fixture[2].counts, fixture[2].counts[0]]})).toBeNull();
  expect(currentPercentage({...fixture[2], missing_records: 1})).toBeNull();
  expect(currentPercentage({...fixture[2], implemented: NaN})).toBeNull();
});

test('slow positive pace reports beyond five years; unverified implementation receives full credit', () => {
  const slow = [snapshot(0, 1), snapshot(30, 1), snapshot(60, 2)];
  expect(forecastImplementation(slow, slow[2], at(60)).label).toBe('Beyond 5 years');
  expect(currentPercentage({...fixture[2], verification_status: 'unverified'})).toBe(32 / 56 * 100);
});

test('calendar month clamping preserves UTC time, leap years and differs from 90 elapsed days', () => {
  expect(calendarRangeStart('2024-03-31T23:30:00Z', 1)).toBe('2024-02-29T23:30:00.000Z');
  expect(calendarRangeStart('2025-03-31T01:02:03Z', 1)).toBe('2025-02-28T01:02:03.000Z');
  expect(calendarRangeStart('2024-02-29T12:00:00Z', 12)).toBe('2023-02-28T12:00:00.000Z');
  expect(calendarRangeStart('2026-10-13T00:00:00Z', 3)).toBe('2026-07-13T00:00:00.000Z');
  for (const months of [1, 3, 6, 12, 36]) expect(calendarRangeStart('2026-10-31T03:04:05Z', months)).not.toBeNull();
  expect(calendarRangeStart('invalid', 3)).toBeNull();
  expect(calendarRangeStart(at(60), 2)).toBeNull();
});

test('period change requires a trustworthy effective boundary and preserves original denominators', () => {
  expect(periodChange(fixture, fixture[2], at(20)).comparable).toBe(false);
  const delta = periodChange(fixture, fixture[2], at(20), {baselineEffective: true});
  expect(delta.change_pp).toBeCloseTo(6 / 56 * 100, 12);
  expect(delta.change_count).toBe(6);
  const changed = snapshot(60, 32, {scope_signature: 'smaller', denominator: 32,
    counts: fixture[2].counts.map(value => ({...value, count: value.key === 'addressed' ? 32 : 0}))});
  const scoped = periodChange(fixture, changed, at(20), {baselineEffective: true});
  expect(scoped.change_pp).toBeCloseTo(100 - 26 / 56 * 100);
  expect(scoped.scope_changed).toBe(true);
  expect(historyWindow(fixture, at(20), at(60))).toEqual(fixture.slice(1));
  expect(applicableCounts({...fixture[2], counts: [...fixture[2].counts, {key: 'excluded', count: 2}]})).toHaveLength(4);
});

test('an authoritative missing/conflicting baseline is never replaced by an arbitrary timestamp tie',()=>{
  const tied=[snapshot(0,26),snapshot(0,29),snapshot(60,32)];
  const comparison={baseline:null,baseline_effective_at_start:true,comparable:false,reason:'Conflicting positions share the baseline timestamp.'};
  const result=periodChange(tied,tied[2],at(0),{comparison});
  expect(result.comparable).toBe(false);expect(result.baseline).toBeNull();expect(result.change_pp).toBeNull();
  expect(result.reason).toBe(comparison.reason);
});

test('displayed carried baseline requires boundary proof and retains the original saved time', () => {
  const baseline = snapshot(0, 20), current = snapshot(60, 32);
  expect(historyWindow([current], at(20), at(60), {baseline,baseline_effective_at_start:false})).toEqual([current]);
  const displayed = historyWindow([current], at(20), at(60), {baseline,baseline_effective_at_start:true});
  expect(displayed).toHaveLength(2);
  expect(snapshotTime(displayed[0])).toBe(snapshotTime(baseline));
  expect(displayed[0].display_at).toBe(at(20));
  expect(displayed[0].carried).toBe(true);
});

test('client search composes visible framework filter and real lead IDs, with stable minimum sorts', () => {
  const clients = [{client_id: 'b', name: 'Beta', industry: 'Software', grc_lead: {name: 'Morgan'}, grc_lead_id: 'm'},
    {client_id: 'a', name: 'Alpha', assigned_owner_id: 'm'}, {client_id: 'c', name: 'Gamma'}];
  const program = (cid, key, implemented, delta) => ({client_id: cid, program_key: key, framework_key: key, program_label: key,
    current: snapshot(60, implemented), comparison_90d: {baseline_effective_at_start: true, change_pp: delta}});
  const programs = [program('b', 'ISO 27001', 50, 5), program('b', 'CIS IG3', 2, -2), program('a', 'CIS IG3', 30, 0)];
  const all = {framework: 'all', sort: 'name'};
  expect(portfolioGroups(clients, programs, {...all, search: ' mORgan '}, 'm').map(group => group.client.client_id)).toEqual(['b']);
  expect(portfolioGroups(clients, programs, {...all, search: 'ISO', framework: 'CIS IG3'}, 'm')[0].programs[0].program_key).toBe('CIS IG3');
  expect(portfolioGroups(clients, programs, {...all, mine: true}, 'm')).toHaveLength(2);
  expect(portfolioGroups(clients, programs, {...all, sort: 'progress'}, 'm').map(group => group.client.client_id)).toEqual(['b', 'a', 'c']);
  expect(portfolioGroups(clients, programs, {...all, sort: 'change'}, 'm').map(group => group.client.client_id)).toEqual(['b', 'a', 'c']);
  expect(programIdentity({...programs[0], program_id: 'stable'})).toBe('stable');
});
