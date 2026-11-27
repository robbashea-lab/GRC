import { formatAcceptedRefresh } from './acceptedRefreshPresentation';

test.each([
  ['2026-07-01T16:05:00Z', 'Jul 1, 2026, 12:05 PM ET'],
  ['2026-01-01T16:05:00Z', 'Jan 1, 2026, 11:05 AM ET'],
  ['2026-03-08T06:59:00Z', 'Mar 8, 2026, 1:59 AM ET'],
  ['2026-03-08T07:00:00Z', 'Mar 8, 2026, 3:00 AM ET'],
  ['2026-10-19T02:00:00Z', 'Oct 18, 2026, 10:00 PM ET'],
])('formats the accepted instant in Eastern, including DST and rollover: %s', (input, expected) => {
  expect(formatAcceptedRefresh(input)).toBe(expected);
});

test.each([null, undefined, '', 'not a date', '2026-10-18'])('does not invent an instant from %s', value => {
  expect(formatAcceptedRefresh(value)).toBe('');
});
