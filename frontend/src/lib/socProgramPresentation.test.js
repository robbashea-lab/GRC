import {SOC_PROGRAM_STATUS_LABELS, socProgramFreshness, socProgramAsOf, socProgramMatches} from './socProgramPresentation';
import {STALE_DAYS, freshness, cisSummary} from './cisVerification';
import {matchesAssessment} from './frameworkWorkspace';
import {operatorStatuses} from './frameworkOperator';

const TODAY = new Date('2026-10-31T12:00:00Z');
const DAY = 86400000;
const daysAgo = days => new Date(TODAY.getTime() - days * DAY).toISOString();
const row = (changes = {}) => ({framework_assessment_id: 'native-soc-assessment', framework_key: 'soc-2',
  definition_id: 'CC1.1', title: 'Governance expectations', control_name: 'Governance and accountability',
  status: 'addressed', assessment_recorded_at: daysAgo(30), last_assessed: daysAgo(1), last_saved: daysAgo(1),
  verification: 'not_verified', ...changes});

test('program labels retain native keys and leave global SOC/editor labels unchanged', () => {
  const nativeLabels = operatorStatuses('soc-2');
  expect(SOC_PROGRAM_STATUS_LABELS).toEqual({addressed: 'Implemented', in_progress: 'Partially implemented',
    needs_attention: 'Implementation not established', not_assessed: 'Not assessed', not_applicable: 'Not applicable'});
  expect(new Set(Object.keys(SOC_PROGRAM_STATUS_LABELS))).toEqual(new Set(Object.keys(nativeLabels)));
  expect(operatorStatuses('soc-2')).toEqual(nativeLabels);
  expect(nativeLabels.addressed).toBe('Addressed (Readiness)');
  expect(nativeLabels.needs_attention).toBe('Needs Remediation / Validation');
});

test.each([
  [STALE_DAYS - 1, 'aging', false],
  [STALE_DAYS, 'aging', false],
  [STALE_DAYS + 1, 'stale', true],
])('judgment age %s days preserves the existing strictly-over-365-day stale rule', (days, state, stale) => {
  const record = row({assessment_recorded_at: daysAgo(days)});
  expect(socProgramFreshness(record, TODAY)).toEqual(freshness({...record, last_assessed: daysAgo(days)}, TODAY));
  expect(socProgramFreshness(record, TODAY)).toMatchObject({state, days});
  expect(socProgramMatches(record, 'stale', '', TODAY)).toBe(stale);
});

test('the shared whole-day boundary is retained instead of introducing a new elapsed-time threshold', () => {
  const record = row({assessment_recorded_at: new Date(TODAY.getTime() - (STALE_DAYS + 0.5) * DAY).toISOString()});
  expect(socProgramFreshness(record, TODAY)).toMatchObject({state: 'aging', days: STALE_DAYS});
  expect(socProgramMatches(record, 'stale', '', TODAY)).toBe(false);
});

test('recent narrative saves do not renew an old judgment or change the legacy global freshness result', () => {
  const record = row({assessment_recorded_at: daysAgo(400)});
  expect(freshness(record, TODAY)).toMatchObject({state: 'current', days: 1});
  expect(socProgramFreshness(record, TODAY)).toMatchObject({state: 'stale', days: 400});
  expect(socProgramAsOf([record], TODAY)).toBe(daysAgo(400));
  expect(socProgramMatches(record, 'stale', 'CC1.1', TODAY)).toBe(true);
  expect(socProgramMatches(record, 'stale', 'unrelated title', TODAY)).toBe(false);
  expect(socProgramMatches(record, 'attention', '', TODAY)).toBe(false);
});

test.each([undefined, null, ''])('missing judgment %p with a native write token is explicitly unconfirmed', assessment_recorded_at => {
  const record = row({assessment_recorded_at});
  expect(socProgramFreshness(record, TODAY)).toEqual({state: 'unknown', days: null, label: 'Legacy date unconfirmed'});
  expect(socProgramAsOf([record], TODAY)).toBeNull();
  expect(socProgramMatches(record, 'stale', '', TODAY)).toBe(false);
});

test.each([undefined, null, '', '   '])('an assessed record without judgment or legacy token %p remains date-unavailable', last_assessed => {
  const record = row({assessment_recorded_at: null, last_assessed});
  expect(socProgramFreshness(record, TODAY)).toEqual({state: 'unknown', days: null, label: 'Assessment date unavailable'});
  expect(socProgramAsOf([record], TODAY)).toBeNull();
  expect(socProgramMatches(record, 'not_assessed', '', TODAY)).toBe(false);
});

test.each([
  'invalid', '2026-02-30T12:00:00Z', '2025-02-29T12:00:00Z', '2026-13-01T12:00:00Z',
  '2026-10-31T24:00:00Z', '2026-10-31T12:00:00', '2026-10-31', '10/31/2026', 123, {},
  '2026-10-31T12:00:00.001Z', '2026-11-01T00:00:00Z',
])('invalid, imprecise or future native judgment %p stays unknown without a save-date fallback', assessment_recorded_at => {
  const record = row({assessment_recorded_at});
  expect(socProgramFreshness(record, TODAY)).toEqual({state: 'unknown', days: null, label: 'Assessment date unavailable'});
  expect(socProgramAsOf([record], TODAY)).toBeNull();
  expect(socProgramMatches(record, 'stale', '', TODAY)).toBe(false);
});

test('timezone offsets compare actual instants across calendar dates and normalize only known judgments', () => {
  const east = row({assessment_recorded_at: '2026-10-31T01:30:00+02:00'});
  const west = row({assessment_recorded_at: '2026-10-30T19:30:00-04:00'});
  expect(socProgramAsOf([east], TODAY)).toBe('2026-10-30T23:30:00.000Z');
  expect(socProgramFreshness(east, TODAY)).toEqual(socProgramFreshness(west, TODAY));
  const atBoundary = row({assessment_recorded_at: '2025-10-31T08:00:00-04:00'});
  expect(socProgramFreshness(atBoundary, TODAY)).toMatchObject({days: STALE_DAYS, state: 'aging'});
  expect(socProgramMatches(atBoundary, 'stale', '', TODAY)).toBe(false);
  expect(socProgramAsOf([row({assessment_recorded_at: '2026-11-01T01:00:00+14:00'})], TODAY))
    .toBe('2026-10-31T11:00:00.000Z');
  expect(socProgramAsOf([row({assessment_recorded_at: '2026-10-31T11:30:00-01:00'})], TODAY)).toBeNull();
});

test('valid leap-day and fractional server timestamps remain real judgments', () => {
  expect(socProgramAsOf([row({assessment_recorded_at: '2024-02-29T12:00:00.123456+00:00'})], TODAY))
    .toBe('2024-02-29T12:00:00.123Z');
  expect(socProgramFreshness(row({assessment_recorded_at: TODAY.toISOString()}), TODAY))
    .toEqual({state: 'current', days: 0, label: 'Assessed today'});
});

test('Not assessed stays distinct even with an authentic retained judgment date', () => {
  const record = row({status: 'not_assessed', assessment_recorded_at: daysAgo(400)});
  expect(socProgramFreshness(record, TODAY)).toEqual({state: 'never', days: null, label: 'Not assessed'});
  expect(socProgramMatches(record, 'stale', '', TODAY)).toBe(false);
  expect(socProgramMatches(record, 'not_assessed', '', TODAY)).toBe(true);
  expect(socProgramAsOf([record], TODAY)).toBe(daysAgo(400));
});

test('Not applicable retains the existing native stale eligibility when its judgment is known', () => {
  const record = row({status: 'not_applicable', assessment_recorded_at: daysAgo(STALE_DAYS + 1)});
  expect(socProgramMatches(record, 'stale', '', TODAY)).toBe(true);
  expect(freshness({...record, last_assessed: record.assessment_recorded_at}, TODAY).state).toBe('stale');
});

test('As of selects the latest valid judgment in the supplied scope, never a save, retrieval date or now', () => {
  const records = [row({assessment_recorded_at: daysAgo(60)}), row({assessment_recorded_at: daysAgo(5)}),
    row({assessment_recorded_at: null, last_saved: TODAY.toISOString(), retrieved_at: TODAY.toISOString()}),
    row({assessment_recorded_at: '2027-01-01T00:00:00Z'})];
  expect(socProgramAsOf(records, TODAY)).toBe(daysAgo(5));
  expect(socProgramAsOf(records.slice(0, 1), TODAY)).toBe(daysAgo(60));
  expect(socProgramAsOf([], TODAY)).toBeNull();
  expect(socProgramAsOf([row({assessment_recorded_at: null, last_assessed: null})], TODAY)).toBeNull();
});

test.each([
  ['not_assessed', {}, 'not_verified', true], ['in_progress', {}, 'not_verified', true],
  ['needs_attention', {}, 'not_verified', true], ['addressed', {open_findings: 1}, 'verified', true],
  ['addressed', {overdue_actions: 1}, 'verified', true], ['addressed', {overdue_reviews: 1}, 'verified', true],
  ['addressed', {}, 'needs_validation', false], ['addressed', {}, 'not_verified', false],
])('native attention for %s / %j / %s stays %s', (status, work, verification, expected) => {
  const record = row({status, work, verification});
  expect(socProgramMatches(record, 'attention', '', TODAY)).toBe(expected);
  expect(socProgramMatches(record, 'attention', '', TODAY)).toBe(matchesAssessment(record, 'attention'));
});

test('every non-stale filter preserves native status, related-work and search semantics', () => {
  const records = ['addressed', 'in_progress', 'needs_attention', 'not_assessed', 'not_applicable'].map(status =>
    row({status, work: {overdue_actions: 1, direct_findings: 0, evidence_count: 0}}));
  for (const record of records) for (const filter of ['all', 'attention', 'assessed', 'gaps', 'addressed', 'in_progress',
    'needs_attention', 'not_assessed', 'not_applicable', 'unevidenced', 'unremediated', 'overdue_actions']) {
    for (const search of ['', 'governance', ' CC1.1 ', 'does not match']) {
      expect(socProgramMatches(record, filter, search, TODAY)).toBe(matchesAssessment(record, filter, search));
    }
  }
});

test('all adapters preserve native record identities, payloads and implementation counts', () => {
  const records = Object.freeze(['addressed', 'in_progress', 'needs_attention', 'not_assessed', 'not_applicable'].map((status, index) =>
    Object.freeze(row({status, framework_assessment_id: 'native-' + index, definition_id: 'CC1.' + (index + 1),
      assessment_recorded_at: daysAgo(400), work: Object.freeze({open_findings: index === 0 ? 1 : 0})}))));
  const before = JSON.stringify(records), counts = cisSummary(records, TODAY);
  records.forEach(record => socProgramFreshness(record, TODAY)); socProgramAsOf(records, TODAY);
  const filtered = records.filter(record => socProgramMatches(record, 'stale', '', TODAY));
  expect(filtered).toEqual([records[0], records[1], records[2], records[4]]);
  filtered.forEach(record => expect(record).toBe(records.find(native => native.framework_assessment_id === record.framework_assessment_id)));
  expect(cisSummary(records, TODAY)).toEqual(counts);
  expect(counts).toMatchObject({total: 5, applicable: 4, addressed: 1, partial: 1, gap: 1, notAssessed: 1, na: 1, assessed: 3});
  expect(JSON.stringify(records)).toBe(before);
});
