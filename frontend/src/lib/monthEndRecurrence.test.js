import {reviewSchedule} from './reviewOccurrences';
// Calendar-month anchoring: a last-of-month start keeps last-of-month semantics; other days clamp and recover.
const run=(due,recurrence,n)=>{let r={due_date:due,recurrence},out=[];for(let i=0;i<n;i++){const s=reviewSchedule(r,i===0);out.push(s.next_review_date.slice(0,10));r={...r,...s,due_date:s.next_review_date};}return out;};
test('Jan 31 monthly → Feb last day → Mar 31 → Apr 30 → May 31, through a leap year',()=>{
  expect(run('2027-01-31','monthly',5)).toEqual(['2027-02-28','2027-03-31','2027-04-30','2027-05-31','2027-06-30']);
  expect(run('2028-01-31','monthly',2)).toEqual(['2028-02-29','2028-03-31']);
});
test('a mid-month anchor clamps in short months and returns to its day',()=>{
  expect(run('2027-01-30','monthly',3)).toEqual(['2027-02-28','2027-03-30','2027-04-30']);
});
test('quarter-end and half-year-end schedules stay on month ends; leap-day annual',()=>{
  expect(run('2026-11-30','quarterly',4)).toEqual(['2027-02-28','2027-05-31','2027-08-31','2027-11-30']);
  expect(run('2027-08-31','semiannual',2)).toEqual(['2028-02-29','2028-08-31']);
  expect(run('2028-02-29','annual',4)).toEqual(['2029-02-28','2030-02-28','2031-02-28','2032-02-29']);
});
test('late completion does not move the cadence anchor',()=>{
  const s=reviewSchedule({due_date:'2026-03-31',recurrence:'quarterly',completed_at:'2026-04-20'},true);
  expect(s.next_review_date.slice(0,10)).toBe('2026-06-30');
});
