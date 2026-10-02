import { CircleDashed, UserRound } from 'lucide-react';
import {Label} from './ui/label';
import { calendarDay } from '@/lib/managementDates';
import { personLabel } from '@/lib/people';
import { OwnerAccountNote } from './ContactAccess';

// Shared register cells: one date grammar and one owner grammar across every register.
export function DateReadonly({ value, label }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-ink-secondary">{label}</Label>
      <div className="text-sm font-mono text-ink-primary">{value ? new Date(String(value).slice(0, 10) + "T00:00:00").toLocaleDateString() : <span className="text-ink-help">—</span>}</div>
    </div>
  );
}

// Due-like dates: "Oct 8" over "in 12 days" / "3 days overdue". Closed records get no callout.
// Date-only values are compared as literal local calendar days, never shifted by timezone.
export function formatDue(iso, closed = false) {
  if (!iso) return { primary: '—', secondary: '', tone: 'neutral' };
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return { primary: '—', secondary: '', tone: 'neutral' };
  const primary = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (closed) return { primary, secondary: '', tone: 'neutral' };
  const now = new Date();
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (days < 0) return { primary, secondary: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, tone: 'critical' };
  if (days === 0) return { primary, secondary: 'today', tone: 'duesoon' };
  if (days <= 7) return { primary, secondary: `in ${days} day${days === 1 ? '' : 's'}`, tone: 'duesoon' };
  return { primary, secondary: `in ${days} days`, tone: 'neutral' };
}

const DUE_TONE = { critical: 'is-critical', duesoon: 'is-duesoon', neutral: '' };
export function DueDate({ iso, closed = false, testid }) {
  const { primary, secondary, tone } = formatDue(iso, closed);
  if (primary === '—') return <span className="register-empty">—</span>;
  return <span className={`register-date inline-flex flex-col ${DUE_TONE[tone] || ''}`} data-testid={testid}>
    <span>{primary}</span>{secondary && <span>{secondary}</span>}
  </span>;
}

// Historical dates (last reviewed, uploaded): "Jan 9, 2026", the literal calendar day.
export function formatHistory(value) {
  const day = calendarDay(typeof value === 'string' ? value : '');
  return day === null ? null : new Date(day * 86400000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export function HistoryDate({ value, empty = '—', testid }) {
  const text = formatHistory(value);
  return text ? <span className="register-date is-history" data-testid={testid}><span>{text}</span></span> : <span className="register-empty">{empty}</span>;
}

// Owner: a name (never a raw account ID), a quiet "Unassigned", and the disabled-account flag.
// Pre-labelled rows (dashboard contract rows) pass `label` and `assigned` instead of an ID.
export function OwnerCell({ people, id, status, label, assigned = !!id, testid }) {
  return <span className={`register-owner ${assigned ? '' : 'register-owner--unassigned'}`} data-testid={testid}>
    {assigned ? <UserRound aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
    <span>{label || personLabel(people, id)}{!label && <OwnerAccountNote users={people} id={id} status={status} />}</span>
  </span>;
}
