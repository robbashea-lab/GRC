import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { formatDue, DueDate, formatHistory, HistoryDate, OwnerCell } from './RegisterCells';

jest.mock('./ContactAccess', () => ({ OwnerAccountNote: () => null }));

const short = (y, m, d) => new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const literal = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

let root, host;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  jest.useFakeTimers().setSystemTime(new Date(2026, 8, 26, 12));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.useRealTimers(); });
const render = element => act(async () => root.render(element));

test('due dates: red only when overdue, amber within a week, quiet otherwise', () => {
  expect(formatDue('2026-09-20')).toEqual({ primary: short(2026, 9, 20), secondary: '6 days overdue', tone: 'critical' });
  expect(formatDue('2026-09-25').secondary).toBe('1 day overdue');
  expect(formatDue('2026-09-26')).toEqual({ primary: short(2026, 9, 26), secondary: 'today', tone: 'duesoon' });
  expect(formatDue('2026-09-27')).toMatchObject({ secondary: 'in 1 day', tone: 'duesoon' });
  expect(formatDue('2026-10-03')).toMatchObject({ secondary: 'in 7 days', tone: 'duesoon' });
  expect(formatDue('2026-10-26')).toMatchObject({ secondary: 'in 30 days', tone: 'neutral' });
  // Timestamps are read as their literal calendar day.
  expect(formatDue('2026-09-20T23:59:00Z').primary).toBe(short(2026, 9, 20));
});

test('closed records and missing dates never raise a due callout', () => {
  expect(formatDue('2026-09-20', true)).toEqual({ primary: short(2026, 9, 20), secondary: '', tone: 'neutral' });
  expect(formatDue(null)).toEqual({ primary: '—', secondary: '', tone: 'neutral' });
  expect(formatDue('not a date').primary).toBe('—');
});

test('due date cell carries its tone as a class and a quiet dash when empty', async () => {
  await render(<div><DueDate iso="2026-09-20" testid="late" /><DueDate iso="2026-09-28" testid="soon" /><DueDate iso="2026-12-01" testid="later" /><DueDate iso="" /></div>);
  expect(host.querySelector('[data-testid="late"]').className).toContain('is-critical');
  expect(host.querySelector('[data-testid="late"]').textContent).toBe(`${short(2026, 9, 20)}6 days overdue`);
  expect(host.querySelector('[data-testid="soon"]').className).toContain('is-duesoon');
  expect(host.querySelector('[data-testid="later"]').className).not.toMatch(/is-critical|is-duesoon/);
  expect(host.querySelector('.register-empty').textContent).toBe('—');
});

test('history dates show the literal calendar day with the year, never shifted by timezone', async () => {
  expect(formatHistory('2026-01-09')).toBe(literal(2026, 1, 9));
  expect(formatHistory('2026-01-09T23:30:00Z')).toBe(literal(2026, 1, 9));
  expect(formatHistory('2026-01-09T00:15:00-08:00')).toBe(literal(2026, 1, 9));
  expect(formatHistory('')).toBeNull();
  expect(formatHistory(undefined)).toBeNull();
  await render(<div><HistoryDate value="2026-01-09" testid="h" /><HistoryDate value={null} empty="Never reviewed" /></div>);
  expect(host.querySelector('[data-testid="h"]').className).toContain('is-history');
  expect(host.querySelector('.register-empty').textContent).toBe('Never reviewed');
});

test('owner cell: a name, a quiet Unassigned, never a raw account ID', async () => {
  const people = [{ user_id: 'u1', name: 'Joe Bowers' }];
  await render(<div>
    <OwnerCell people={people} id="u1" testid="named" />
    <OwnerCell people={people} id={null} testid="empty" />
    <OwnerCell people={people} id="user_8f2a" testid="former" />
    <OwnerCell label="Unassigned" assigned={false} testid="labelled-empty" />
    <OwnerCell label="Frito Pendejo" assigned testid="labelled" />
  </div>);
  const cell = id => host.querySelector(`[data-testid="${id}"]`);
  expect(cell('named').textContent).toBe('Joe Bowers');
  expect(cell('named').className).not.toContain('register-owner--unassigned');
  expect(cell('empty').textContent).toBe('Unassigned');
  expect(cell('empty').className).toContain('register-owner--unassigned');
  expect(cell('former').textContent).toBe('Former user');
  expect(cell('labelled-empty').className).toContain('register-owner--unassigned');
  expect(cell('labelled').textContent).toBe('Frito Pendejo');
  expect(cell('labelled').className).not.toContain('register-owner--unassigned');
  expect([...host.querySelectorAll('svg')].every(svg => svg.getAttribute('aria-hidden') === 'true')).toBe(true);
});
