import {reviewSchedule} from '../lib/reviewOccurrences';
import * as nativeDates from '../lib/reviewOccurrences';
import {krustyHistoryVolumePlan} from './cisCanonicalKrustyVolume';

const CID = 'demo_krusty_krab';
const OPTIONS = {anchor:'2026-11-04T00:00:00.000Z',organization_origin:'2021-11-04T00:00:00.000Z',
  framework_origin:'2024-07-01T00:00:00.000Z'};
const copy = value => JSON.parse(JSON.stringify(value));
function review(values = {}) {
  const row = {review_id:'review-1',client_id:CID,status:'upcoming',recurrence:'monthly',
    due_date:'2026-11-30',created_at:'2026-01-01T00:00:00.000Z',...values};
  return {...row,...reviewSchedule(row)};
}
const plan = (rows, options = {}) => krustyHistoryVolumePlan(rows, {...OPTIONS,...options});
const datesFor = (result, id = 'review-1') => result.reviews.find(row => row.review_id === id).due_dates;

afterEach(() => jest.restoreAllMocks());

test('monthly month-end planning retains clipped February and forward-native March without mutating or creating history', () => {
  const row = review(), inputs = [row], before = copy(inputs), result = plan(inputs);
  expect(datesFor(result)).toEqual(['2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31',
    '2026-06-30','2026-07-31','2026-08-31','2026-09-30','2026-10-31']);
  expect(result.counts).toMatchObject({review_parents:1,supplemental_review_parents:1,planned_past_periods:10});
  expect(result.reviews[0].schedule_anchor).toEqual({day:30,month_end:true});
  expect(reviewSchedule({...row,due_date:'2026-02-28',recurrence_due_date:null}).next_review_date.slice(0,10)).toBe('2026-03-31');
  expect(result.complete).toBe(true); expect(result.unresolved).toEqual([]); expect(inputs).toEqual(before);
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  expect(JSON.stringify(result)).not.toMatch(/"completed_at"|"completed_by"|"occurrences"|"outcome"|"user_id"/);
});

test('a retained day30 anchor does not drift to March31 after a clipped February', () => {
  const row = review({due_date:'2026-03-30'}), result = plan([row], {anchor:'2026-03-31T00:00:00.000Z'});
  expect(datesFor(result)).toEqual(['2026-01-30','2026-02-28']);
  expect(row.schedule_anchor).toEqual({day:30,month_end:false});
  expect(reviewSchedule({...row,due_date:'2026-02-28',recurrence_due_date:null}).next_review_date.slice(0,10)).toBe('2026-03-30');
});

test('annual leap-day cycles retain native month-end semantics across non-leap years', () => {
  const row = review({recurrence:'annual',due_date:'2030-02-28',created_at:'2024-07-01T00:00:00.000Z'});
  const result = plan([row], {anchor:'2030-03-01T00:00:00.000Z'});
  expect(datesFor(result)).toEqual(['2025-02-28','2026-02-28','2027-02-28','2028-02-29','2029-02-28']);
  expect(reviewSchedule({...row,due_date:'2028-02-29',recurrence_due_date:null}).next_review_date.slice(0,10)).toBe('2029-02-28');
});

test.each([['quarterly','2026-10-31',['2026-01-31','2026-04-30','2026-07-31']],
  ['semiannual','2026-10-31',['2026-04-30']]])('%s uses native calendar months rather than fixed-day approximations', (recurrence, due, expected) => {
  const row = review({recurrence,due_date:due}), result = plan([row]);
  expect(datesFor(result)).toEqual(expected);
});

test('custom seven-day periods stop at the actual AI birth and exclude the anchor and future periods', () => {
  const row = review({recurrence:'custom',custom_recurrence_days:7,due_date:'2026-11-10',
    created_at:'2026-10-15T00:00:00.000Z',ai_system_id:'ai-new'}), result = plan([row]);
  expect(datesFor(result)).toEqual(['2026-10-20','2026-10-27','2026-11-03']);
  expect(result.reviews[0]).toMatchObject({origin:row.created_at,current_due_date:'2026-11-10',planned_period_count:3});
  expect(reviewSchedule({...row,due_date:'2026-11-03',recurrence_due_date:null}).next_review_date.slice(0,10)).toBe('2026-11-10');
});

test('a moved deadline retains its original current period and recurrence phase', () => {
  const row = review({due_date:'2026-04-05',recurrence_due_date:'2026-03-31',schedule_anchor:{day:31,month_end:true}});
  const result = plan([row], {anchor:'2026-04-10T00:00:00.000Z'});
  expect(datesFor(result)).toEqual(['2026-01-31','2026-02-28']);
  expect(result.reviews[0]).toMatchObject({current_due_date:'2026-04-05',recurrence_due_date:'2026-03-31',current_period_date:'2026-03-31'});
});

test('a moved deadline colliding with a prior native period leaves occurrence identity unresolved', () => {
  const row = review({due_date:'2026-03-01',recurrence_due_date:'2026-04-01',schedule_anchor:{day:1,month_end:false}});
  const result = plan([row], {anchor:'2026-05-01T00:00:00.000Z'});
  expect(result.complete).toBe(false); expect(datesFor(result)).toEqual([]);
  expect(result.reviews[0]).toMatchObject({current_due_date:'2026-03-01',recurrence_due_date:'2026-04-01',planned_period_count:null});
  expect(result.unresolved).toEqual([expect.objectContaining({review_id:row.review_id,code:'ambiguous_moved_due'})]);
  expect(result.counts.planned_past_periods).toBeNull();
});

test('current overdue periods stay excluded and one-off Reviews do not acquire a fabricated recurrence', () => {
  const overdue = review({due_date:'2026-10-31'}), oneOff = review({review_id:'one-off',recurrence:'none',due_date:'2026-10-20'});
  const result = plan([overdue,oneOff]);
  expect(datesFor(result)).not.toContain('2026-10-31'); expect(datesFor(result).at(-1)).toBe('2026-09-30');
  expect(datesFor(result, 'one-off')).toEqual([]); expect(result.reviews[1].planned_period_count).toBe(0);
});

test('known cancellation and source terminal dates are exclusive calendar-day cutoffs', () => {
  const row = review({recurrence:'custom',custom_recurrence_days:7,due_date:'2026-11-10',
    created_at:'2026-10-13T00:00:00.000Z',status:'cancelled',cancelled_at:'2026-10-27T18:00:00.000Z',risk_id:'risk-1'});
  const source = {review_id:row.review_id,origin:row.created_at,terminal_at:row.cancelled_at,source_kind:'risks',source_id:'risk-1'};
  const result = plan([row], {review_origins:[source]});
  expect(datesFor(result)).toEqual(['2026-10-13','2026-10-20']);
  expect(result.boundaries.terminal).toBe('exclusive calendar day');
  expect(result.reviews[0].terminal_at).toBe(row.cancelled_at);
});

test('an exact source origin/terminal may supply missing native dates without inventing them', () => {
  const row = review({recurrence:'annual',due_date:'2026-11-01',created_at:undefined,status:'cancelled',vendor_id:'vendor-1'});
  const source = {review_id:row.review_id,origin:'2021-11-04T00:00:00.000Z',terminal_at:'2026-10-01',
    source_kind:'vendors',source_id:'vendor-1'};
  const result = plan([row], {review_origins:[source]});
  expect(datesFor(result)).toEqual(['2022-11-01','2023-11-01','2024-11-01','2025-11-01']);
  expect(result.reviews[0].origin).toBe(source.origin); expect(result.complete).toBe(true);
});

test('unknown cancellation dates remain unresolved with null parent and total counts', () => {
  const row = review({status:'cancelled'}), result = plan([row,review({review_id:'known'})]);
  expect(result.complete).toBe(false);
  expect(result.unresolved).toEqual([expect.objectContaining({review_id:row.review_id,code:'terminal_date_unknown'})]);
  expect(result.reviews[0].planned_period_count).toBeNull(); expect(datesFor(result)).toEqual([]);
  expect(result.counts).toMatchObject({planned_past_periods:null,unresolved_review_parents:1,resolved_planned_past_periods:10});
});

test('framework parents use the declared post-release origin while supplemental parents retain their five-year source life', () => {
  const framework = review({review_id:'framework',framework_key:'cis-ig1',framework_version:'8.1',
    recurrence:'annual',created_at:OPTIONS.framework_origin,due_date:'2026-11-05'});
  const supplemental = review({review_id:'supplemental',recurrence:'annual',created_at:OPTIONS.organization_origin,due_date:'2026-11-05'});
  const result = plan([framework,supplemental], {framework_review_ids:['framework']});
  expect(datesFor(result, 'framework')).toEqual(['2024-11-05','2025-11-05']);
  expect(datesFor(result, 'supplemental')).toEqual(['2021-11-05','2022-11-05','2023-11-05','2024-11-05','2025-11-05']);
  expect(result.counts).toMatchObject({framework_review_parents:1,supplemental_review_parents:1,planned_past_periods:7});
});

test('the finite bound derives the full real date span rather than silently stopping after1300 cycles', () => {
  const row = review({recurrence:'custom',custom_recurrence_days:1,due_date:'2026-11-05',created_at:OPTIONS.organization_origin});
  const result = plan([row]);
  expect(datesFor(result)).toHaveLength(1826);
  expect(datesFor(result)[0]).toBe('2021-11-04'); expect(datesFor(result).at(-1)).toBe('2026-11-03');
  expect(result.counts.planned_past_periods).toBe(1826);
});

test('deeply frozen native inputs and source manifests are unchanged', () => {
  const row = review({risk_id:'risk-1'}), source = {review_id:row.review_id,origin:row.created_at,terminal_at:null,source_kind:'risks',source_id:'risk-1'};
  const options = {...OPTIONS,review_origins:Object.freeze([Object.freeze(source)]),framework_review_ids:Object.freeze([])};
  Object.freeze(row.schedule_anchor); Object.freeze(row); Object.freeze(options);
  const input = Object.freeze([row]), before = JSON.stringify({input,options});
  expect(plan(input, options).complete).toBe(true); expect(JSON.stringify({input,options})).toBe(before);
});

test.each([
  ['foreign client',(row) => {row.client_id = 'other';}],
  ['unknown cadence',(row) => {row.recurrence = 'weekly';}],
  ['zero custom interval',(row) => {row.recurrence = 'custom';row.custom_recurrence_days = 0;}],
  ['invalid current due',(row) => {row.due_date = '2026-02-30';}],
  ['invalid creation',(row) => {row.created_at = 'not-a-date';}],
  ['missing creation',(row) => {delete row.created_at;}],
  ['future creation',(row) => {row.created_at = '2027-01-01';}],
  ['pre-scope creation',(row) => {row.created_at = '2020-11-04';}],
  ['pre-enrollment framework',(row) => {row.framework_key = 'cis-ig1';row.created_at = OPTIONS.organization_origin;}],
  ['foreign framework',(row) => {row.framework_key = 'iso-27001';}],
  ['legacy framework version',(row) => {row.framework_key = 'cis-ig1';row.framework_version = '8.0';}],
  ['invalid calendar anchor',(row) => {row.schedule_anchor.day = 0;}],
  ['terminal before birth',(row) => {row.cancelled_at = '2025-12-31';row.status = 'cancelled';}],
  ['future terminal',(row) => {row.cancelled_at = '2027-01-01';row.status = 'cancelled';}]
])('%s fails without mutating caller state', (_label, mutate) => {
  const row = review(); mutate(row); const before = copy(row);
  expect(() => plan([row])).toThrow(/Krusty history volume/); expect(row).toEqual(before);
});

test.each([
  {anchor:'2026-02-30'}, {organization_origin:'not-a-date'}, {framework_origin:'2024-06-23'},
  {framework_origin:'2027-01-01'}, {framework_review_ids:['missing']}, {framework_review_ids:['review-1','review-1']},
  {framework_review_ids:[]},
])('invalid date/identity scope is rejected: %j', options => {
  const row = review({framework_key:'cis-ig1',created_at:OPTIONS.framework_origin});
  expect(() => plan([row], options)).toThrow(/Krusty history volume/);
});

test('duplicate IDs, source-scope conflicts and inconsistent exact lifecycle dates fail rather than being rewritten', () => {
  const row = review({risk_id:'risk-1'}), source = {review_id:row.review_id,origin:row.created_at};
  expect(() => plan([row,copy(row)])).toThrow(/distinct Review IDs/);
  expect(() => plan([row], {review_origins:[source,source]})).toThrow(/distinct Reviews/);
  expect(() => plan([row], {review_origins:[{...source,review_id:'missing'}]})).toThrow(/canonical client/);
  expect(() => plan([row], {review_origins:[{...source,origin:'2026-01-02'}]})).toThrow(/conflicts with Review creation/);
  expect(() => plan([row], {review_origins:[{...source,source_kind:'risks',source_id:'other-risk'}]})).toThrow(/different native record/);
  const cancelled = {...row,status:'cancelled',cancelled_at:'2026-10-01'};
  expect(() => plan([cancelled], {review_origins:[{...source,terminal_at:'2026-10-02'}]})).toThrow(/terminal dates conflict/);
});

test('non-advancing native scheduling and a failed reverse/forward round trip fail explicitly', () => {
  const row = review(), native = nativeDates.reviewSchedule;
  const spy = jest.spyOn(nativeDates, 'reviewSchedule').mockImplementation(value => value.due_date === row.due_date
    ? native(value) : {...native(value),next_review_date:value.due_date+'T00:00:00.000Z'});
  expect(() => plan([row])).toThrow(/round-trip through native scheduling/);
  spy.mockImplementation(value => ({...native(value),next_review_date:value.due_date+'T00:00:00.000Z'}));
  expect(() => plan([row])).toThrow(/does not advance/);
});
