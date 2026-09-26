// Management uses the existing backend UTC day; due values retain their literal
// calendar date. No conversion of date-only deadlines into local timestamps.
export function calendarDay(value) {
  if (!value || typeof value !== 'string') return null;
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (!match) return null;
  const [y,m,d]=match.slice(1).map(Number), date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d ? date.getTime()/86400000 : null;
}
export const managementDay = (today=new Date()) => calendarDay(today instanceof Date ? today.toISOString() : today);
// Calendar days display as their literal date in the viewer's locale; never shifted a day by timezone.
export function displayDay(value) {
  const day = calendarDay(value);
  return day === null ? null : new Date(day * 86400000).toLocaleDateString(undefined, {timeZone: 'UTC'});
}
