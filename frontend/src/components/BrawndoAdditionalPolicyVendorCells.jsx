import { personLabel } from '@/lib/people';
import { calendarDay, managementDay } from '@/lib/managementDates';

export function savedDate(value, short = false) {
  const day = calendarDay(value);
  return day === null ? null : new Date(day * 86400000).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', ...(short ? {} : { year: 'numeric' }) });
}

function relativeTo(value, today) {
  const day = calendarDay(value);
  if (day === null) return '';
  const delta = day - today;
  return delta < 0 ? `${-delta} ${delta === -1 ? 'day' : 'days'} overdue` : delta === 0 ? 'Due today' : `In ${delta} ${delta === 1 ? 'day' : 'days'}`;
}
export const relativeDate = (value, now = new Date()) => relativeTo(value, managementDay(now));
export const relativePolicyDate = (value, now = new Date()) => relativeTo(value, Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);

export function AdditionalOwner({ users, id }) {
  const name = personLabel(users, id);
  const initials = name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase();
  return <span className="bapv-owner"><i className="bapv-avatar" aria-hidden="true">{id ? initials : '—'}</i><span>{name}</span></span>;
}
