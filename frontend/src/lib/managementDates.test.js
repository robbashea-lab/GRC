import {displayDay} from './managementDates';
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
