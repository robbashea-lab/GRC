import {reviewSchedule,reviewView,belongsToOccurrence} from './reviewOccurrences';
import {reviewMatches} from './tableFilters';
test.each([['monthly','2026-10-31'],['quarterly','2026-12-31'],['semiannual','2027-03-31'],['annual','2027-09-30']])('calendar cadence: %s', (recurrence,expected) => {
  expect(reviewSchedule({due_date:'2026-09-30',recurrence}).next_review_date.slice(0,10)).toBe(expected);
});
test('month-end anchor and scheduled period survive late completions', () => {
  const first = reviewSchedule({due_date:'2026-01-30',recurrence:'monthly'});
  expect(first.next_review_date.slice(0,10)).toBe('2026-02-28');
  expect(reviewSchedule({...first,due_date:first.next_review_date,recurrence:'monthly'}).next_review_date.slice(0,10)).toBe('2026-03-30');
  expect(reviewSchedule({due_date:'2026-09-30',recurrence:'quarterly',completion_date:'2026-10-08'}).period).toBe('Q3 2026');
  expect(reviewView({review_id:'r',due_date:null,status:'upcoming'}).status).toBe('needs_scheduling');
});
test('legacy untagged evidence belongs only to the original occurrence', () => {
  const r = {review_id:'r',current_occurrence_id:'next'};
  expect(belongsToOccurrence({},r)).toBe(false);
  expect(belongsToOccurrence({},r,'occ_r')).toBe(true);
  expect(belongsToOccurrence({occurrence_id:'next'},r)).toBe(true);
});
test('quick presets share overlapping workflow and 90-day schedule predicates', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-09-12T12:00:00Z'));
  const r = {status:'in_progress',due_date:'2026-09-10'};
  expect(reviewMatches(r,'overdue')).toBe(true);
  expect(reviewMatches(r,'in_progress')).toBe(true);
  expect(reviewMatches({...r,due_date:'2026-09-12'},'upcoming')).toBe(true);
  expect(reviewMatches({...r,due_date:'2027-09-12'},'upcoming')).toBe(false);
  expect(reviewMatches({...r,due_date:'2027-09-12'},'all')).toBe(true);
  expect(reviewMatches({...r,status:'completed'},'all')).toBe(false);
  expect(reviewMatches({...r,due_date:null},'needs_scheduling')).toBe(true);
  jest.useRealTimers();
});
