import {displayDay,displayRecordedAt} from './managementDates';
// Calendar days (deadlines, review dates) must read the same for every viewer. Jest cannot change the
// process timezone per file, so a viewer in America/Chicago is simulated for formatting that names no timeZone.
const format = Date.prototype.toLocaleDateString;
beforeEach(() => jest.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (locales, options) { return format.call(this, locales, {timeZone: 'America/Chicago', ...options}); }));
afterEach(() => jest.restoreAllMocks());
const literal = (y, m, d) => format.call(new Date(Date.UTC(y, m - 1, d)), undefined, {timeZone: 'UTC'});

test('a date-only value is not displayed as the previous day west of UTC', () => {
  expect(new Date('2035-10-29').toLocaleDateString()).toBe(literal(2035, 10, 28));
  expect(displayDay('2035-10-29')).toBe(literal(2035, 10, 29));
  expect(displayDay('2035-10-29T00:00:00.000Z')).toBe(literal(2035, 10, 29));
});

test('missing or malformed dates display nothing rather than "Invalid Date"', () => {
  expect(displayDay(null)).toBeNull();
  expect(displayDay('')).toBeNull();
  expect(displayDay('2035-02-30')).toBeNull();
});

test('evidence preserves recorded calendar days while real timestamps retain local time', () => {
  expect(displayRecordedAt('2026-07-07')).toBe(literal(2026,7,7));
  const stamp='2026-07-07T14:30:00Z';
  expect(displayRecordedAt(stamp)).toBe(new Date(stamp).toLocaleString());
  for(const value of [null,'','not-a-date','2035-02-30'])expect(displayRecordedAt(value)).toBeNull();
});
