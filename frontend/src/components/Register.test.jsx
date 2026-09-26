import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { HeaderActions, PrimaryAction, SecondaryAction, SearchField, ViewTabs, RegisterCount, SortableHeader, sortState } from './Register';

let root, host;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const render = element => act(async () => root.render(element));
const type = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

test('header actions: secondary actions first, the one primary action last and filled', async () => {
  const onCreate = jest.fn();
  await render(<HeaderActions><SecondaryAction label="Export CSV" testid="export" /><PrimaryAction label="New Finding" testid="create" onClick={onCreate} /></HeaderActions>);
  const buttons = [...host.querySelectorAll('.header-actions > button')];
  expect(buttons.map(b => b.textContent)).toEqual(['Export CSV', 'New Finding']);
  expect(buttons.every(b => b.type === 'button')).toBe(true);
  expect(buttons[0].className).toContain('border');
  expect(buttons[1].className).toContain('bg-primary');
  // The primary action carries a decorative icon that screen readers skip.
  expect(buttons[1].querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  await act(async () => buttons[1].click());
  expect(onCreate).toHaveBeenCalledTimes(1);
});

test('an icon-only secondary action keeps its accessible name', async () => {
  await render(<SecondaryAction aria-label="Previous month" testid="prev" icon={() => <svg />} />);
  const button = host.querySelector('[data-testid="prev"]');
  expect(button.getAttribute('aria-label')).toBe('Previous month');
  expect(button.textContent).toBe('');
});

test('search field is labelled and reports the typed value', async () => {
  const onChange = jest.fn();
  await render(<SearchField value="" onChange={onChange} label="Search findings" testid="findings-search" />);
  const input = host.querySelector('[data-testid="findings-search"]');
  expect(input.getAttribute('aria-label')).toBe('Search findings');
  expect(input.getAttribute('placeholder')).toBe('Search…');
  expect(host.querySelector('.register-search-icon').getAttribute('aria-hidden')).toBe('true');
  await type(input, 'mfa');
  expect(onChange).toHaveBeenCalledWith('mfa');
});

test('view tabs: one pressed view, counts with a zero fallback, and a pick callback', async () => {
  const onPick = jest.fn();
  const views = [{ id: 'all', label: 'All Active' }, { id: 'overdue', label: 'Overdue' }, { id: 'closed', label: 'Closed' }];
  await render(<ViewTabs views={views} active="overdue" counts={{ all: 12, overdue: 3 }} onPick={onPick} label="Finding views" testIdPrefix="view-" />);
  const group = host.querySelector('[role="group"]');
  expect(group.getAttribute('aria-label')).toBe('Finding views');
  const buttons = [...group.querySelectorAll('button')];
  expect(buttons.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  expect(buttons.map(b => b.textContent)).toEqual(['All Active12', 'Overdue3', 'Closed0']);
  await act(async () => host.querySelector('[data-testid="view-closed"]').click());
  expect(onPick).toHaveBeenCalledWith('closed');
});

test('view tabs without counts render labels only', async () => {
  await render(<ViewTabs views={[{ id: 'active', label: 'Active' }]} active="active" onPick={() => {}} label="Scope" />);
  expect(host.querySelector('button').textContent).toBe('Active');
});

test('register count reads shown / total', async () => {
  await render(<RegisterCount shown={3} total={10} testid="count" />);
  expect(host.querySelector('[data-testid="count"]').textContent).toBe('3 / 10');
});

test('sortable header announces its sort state and names its control', async () => {
  const table = (sort) => ({ columns: [{ key: 'due_date', label: 'Due' }, { key: 'title', label: 'Title' }], state: { filters: {}, sort }, options: () => [] });
  expect(sortState(table(null), 'due_date')).toBeUndefined();
  expect(sortState(table({ key: 'due_date', dir: 'asc' }), 'due_date')).toBe('ascending');
  expect(sortState(table({ key: 'due_date', dir: 'desc' }), 'due_date')).toBe('descending');
  expect(sortState(table({ key: 'title', dir: 'asc' }), 'due_date')).toBeUndefined();
  await render(<table><thead><tr>
    <SortableHeader table={table({ key: 'due_date', dir: 'desc' })} columnKey="due_date" className="text-right" />
    <SortableHeader table={table({ key: 'due_date', dir: 'desc' })} column={{ key: 'title', label: 'Title' }} data-column="title" />
  </tr></thead></table>);
  const [due, title] = host.querySelectorAll('th');
  expect(due.getAttribute('scope')).toBe('col');
  expect(due.getAttribute('aria-sort')).toBe('descending');
  expect(due.className).toBe('tbl-head text-right');
  expect(due.querySelector('button').getAttribute('aria-label')).toBe('Due: sort and filter');
  expect(title.hasAttribute('aria-sort')).toBe(false);
  expect(title.dataset.column).toBe('title');
});
