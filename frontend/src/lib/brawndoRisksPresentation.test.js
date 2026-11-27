import {riskRefreshLabel,riskReviewDate} from './brawndoRisksPresentation';

test.each([
  ['2026-07-01T12:05:00Z','Jul 1, 2026, 8:05 AM ET'],
  ['2026-01-01T12:05:00Z','Jan 1, 2026, 7:05 AM ET'],
  ['2026-01-01T02:30:00Z','Dec 31, 2025, 9:30 PM ET'],
  ['2026-03-08T06:59:00Z','Mar 8, 2026, 1:59 AM ET'],
  ['2026-03-08T07:00:00Z','Mar 8, 2026, 3:00 AM ET'],
  ['2026-11-01T05:59:00Z','Nov 1, 2026, 1:59 AM ET'],
  ['2026-11-01T06:00:00Z','Nov 1, 2026, 1:00 AM ET'],
])('accepted refresh %s uses actual Eastern DST and rollover', (instant,expected)=>{
  expect(riskRefreshLabel(instant)).toBe(expected);
});

test('literal review dates keep their day, compact dates disclose a different year, invalid dates stay unavailable',()=>{
  const now=new Date('2026-10-18T12:00:00Z');
  expect(riskReviewDate('2026-12-22')).toBe('Dec 22, 2026');
  expect(riskReviewDate('2026-09-21',{compact:true,now})).toBe('Sep 21');
  expect(riskReviewDate('2025-09-21',{compact:true,now})).toBe('Sep 21, 2025');
  expect(riskReviewDate('2026-02-30')).toBeNull();
  expect(riskReviewDate('bad')).toBeNull();
  expect(riskReviewDate(null)).toBeNull();
  expect(riskRefreshLabel('bad')).toBeNull();
  expect(riskRefreshLabel(null)).toBeNull();
});
