import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import RecordListPage from './RecordListPage';
import api from '@/lib/api';

jest.setTimeout(15000);
let mockAuth, mockOrg, mockDrawerProps, mockLocationSearch;
const mockNavigate = jest.fn();
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/context/OrgContext', () => ({ useOrg: () => mockOrg }));
jest.mock('react-router-dom', () => ({
  Link: ({ children }) => <span>{children}</span>,
  useLocation: () => ({ pathname: '/policies', search: mockLocationSearch }), useNavigate: () => mockNavigate,
  useSearchParams: () => {
    const [params, setParams] = require('react').useState(new URLSearchParams(mockLocationSearch));
    return [params, value => { const next = new URLSearchParams(value), query = next.toString(); mockLocationSearch = query ? `?${query}` : ''; setParams(next); }];
  },
}), { virtual: true });
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() }, formatError: error => error.message, API: '/api', PREVIEW_MODE: true }));
jest.mock('@/components/RecordDrawer', () => function NativeDrawer(props) {
  mockDrawerProps = props;
  return props.open && <aside data-testid="native-policy-drawer">{props.record?.policy_id}</aside>;
});

let root, container;
const rows = [
  { policy_id: 'p1', client_id: 'demo_brawndo', title: 'Missing governance', category: 'Governance', status: 'draft', presence: 'reported_missing' },
  { policy_id: 'p2', client_id: 'demo_brawndo', title: 'Missing operations', category: 'Operations', status: 'draft', presence: 'reported_missing' },
  { policy_id: 'p3', client_id: 'demo_brawndo', title: 'Approved governance', category: 'Governance', status: 'approved', approved_at: '2026-10-01', version: '2' },
];
const review = { review_id: 'actual-review', client_id: 'demo_brawndo', policy_ids: ['p1', 'p3'], title: 'Actual annual review', recurrence: 'annual', status: 'upcoming', due_date: '2026-11-01' };
beforeAll(() => Object.defineProperty(global, 'crypto', { configurable: true, value: require('crypto').webcrypto }));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('grc_client_id', 'demo_brawndo');
  mockLocationSearch = '';
  mockAuth = { workspaceMode: 'demo', user: { user_id: 'demo-actor', role: 'super_admin', workspace_mode: 'demo' } };
  mockOrg = { currentClientId: 'demo_brawndo', currentClient: { client_id: 'demo_brawndo', name: 'Brawndo', status: 'active' } };
  api.get.mockImplementation(async path => ({ data: path === '/policies' ? rows.map(row => ({ ...row, client_id: mockOrg.currentClientId })) : path === '/policies/p1' ? { ...rows[0], client_id: mockOrg.currentClientId } : path === '/reviews' ? [review] : path === '/frameworks/summary' ? { client_id: mockOrg.currentClientId, items: [] } : [] }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.clearAllMocks(); });
const click = node => act(async () => node.click());
const input = (node, value) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); });
const visibleRows = () => [...container.querySelectorAll('[role="row"][data-testid^="policies-row-"]')];

test('strict canonical Policies target keeps native identity, read-only filters/sort and visible-subset selection', async () => {
  await act(async () => root.render(<RecordListPage kind="policies" />));
  expect(container.querySelector('[data-testid="additional-policies"]')).toBeTruthy();
  expect(visibleRows()).toHaveLength(3);
  await click(container.querySelector('[data-testid="additional-policy-metric-missing"]'));
  expect(visibleRows()).toHaveLength(2);
  const category = container.querySelector('[aria-label="Policy category"]');
  await act(async () => { category.value = 'Governance'; category.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(visibleRows()).toHaveLength(1);
  expect(visibleRows()[0].textContent).toContain('Missing governance');
  await click(container.querySelector('[aria-label="Select all policies"]'));
  expect(container.querySelector('[data-testid="bulk-selected-count"]').textContent).toBe('1');
  await click(container.querySelector('.bapv-name'));
  expect(mockDrawerProps).toMatchObject({ open: true, kind: 'policies', clientId: 'demo_brawndo', record: expect.objectContaining({ policy_id: 'p1', presence: 'reported_missing' }) });
  expect(mockDrawerProps.schema.some(field => field.name === 'title')).toBe(true);
  await click(container.querySelector('.bapv-link'));
  const destination = new URL(mockNavigate.mock.calls.at(-1)[0], 'https://local.test');
  expect(destination.pathname).toBe('/reviews'); expect(destination.searchParams.get('id')).toBe('actual-review'); expect(destination.searchParams.get('client_id')).toBe('demo_brawndo');
  await act(async () => { container.querySelector('[aria-label="Policy: sort and filter"]').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false })); });
  const ascending = [...document.querySelectorAll('[role="menuitemcheckbox"]')].find(node => node.textContent === 'A → Z');
  expect(ascending).toBeTruthy(); await click(ascending);
  expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled(); expect(api.delete).not.toHaveBeenCalled();
});

test.each(['authenticated', 'other-client'])('Policies additional target stays absent for %s context', async variant => {
  if (variant === 'authenticated') mockAuth = { workspaceMode: 'authenticated', user: { ...mockAuth.user, workspace_mode: 'authenticated' } };
  else { mockOrg.currentClientId = 'demo_dunder'; mockOrg.currentClient = { ...mockOrg.currentClient, client_id: 'demo_dunder' }; sessionStorage.setItem('grc_client_id', 'demo_dunder'); }
  await act(async () => root.render(<RecordListPage kind="policies" />));
  expect(container.querySelector('[data-testid="additional-policies"]')).toBeNull();
});

test('combined URL search, status and category filters clear together through the native parent', async () => {
  await act(async () => root.render(<RecordListPage kind="policies" />));
  await click(container.querySelector('[data-testid="additional-policy-view-missing"]'));
  const category = container.querySelector('[aria-label="Policy category"]');
  await act(async () => { category.value = 'Governance'; category.dispatchEvent(new Event('change', { bubbles: true })); });
  await input(container.querySelector('[data-testid="policies-search"]'), 'unmatched search');
  expect(visibleRows()).toHaveLength(0);
  await click([...container.querySelectorAll('.bapv-empty button')].find(node => node.textContent === 'Clear filters'));
  expect(container.querySelector('[data-testid="policies-search"]').value).toBe('');
  expect(container.querySelector('[aria-label="Policy category"]').value).toBe('');
  expect(container.querySelector('[data-testid="additional-policy-view-all"]').getAttribute('aria-pressed')).toBe('true');
  expect(visibleRows()).toHaveLength(3);
  expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled(); expect(api.delete).not.toHaveBeenCalled();
});

test.each([['owner', 'missing-account'], ['status', 'needs_verification']])('Policy Clear filters removes a carried %s while retaining client, record and sort context', async (key, value) => {
  const initial = new URLSearchParams({ client_id: 'demo_brawndo', id: 'p1', sortBy: 'title', sortDir: 'asc', [key]: value });
  mockLocationSearch = `?${initial}`;
  await act(async () => root.render(<RecordListPage kind="policies" />));
  expect(visibleRows()).toHaveLength(0);
  expect(container.querySelector('[data-testid="carried-scope-chip"]')).toBeTruthy();
  await click([...container.querySelectorAll('.bapv-empty button')].find(node => node.textContent === 'Clear filters'));
  const remaining = new URLSearchParams(mockLocationSearch);
  expect(remaining.has(key)).toBe(false);
  expect(Object.fromEntries(remaining)).toEqual({ client_id: 'demo_brawndo', id: 'p1', sortBy: 'title', sortDir: 'asc' });
  expect(visibleRows()).toHaveLength(3);
  expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled(); expect(api.delete).not.toHaveBeenCalled();
});

test('same-client role and actor changes await their own alignment snapshot and ignore a late previous response', async () => {
  let summaries = 0, resolvePrevious;
  api.get.mockImplementation(async path => {
    if (path === '/frameworks/summary') {
      summaries++;
      if (summaries === 2) return new Promise(resolve => { resolvePrevious = resolve; });
      return { data: { client_id: 'demo_brawndo', items: summaries === 1 ? [{ key: 'cis-ig1', tracking_available: true, implementation_group: 1 }] : [] } };
    }
    return { data: path === '/policies' ? rows.map((row, index) => ({ ...row, ...(index === 0 ? { baseline_key: 'policy-access-control-identity-management-policy' } : {}) })) : path === '/reviews' ? [review] : path === '/frameworks/cis-ig1' ? { assessments: [] } : [] };
  });
  await act(async () => root.render(<RecordListPage kind="policies" />));
  expect(container.querySelector('[data-testid="additional-policy-metric-mapped"] strong').textContent.startsWith('1')).toBe(true);
  mockAuth = { ...mockAuth, user: { ...mockAuth.user, role: 'platform_admin' } };
  await act(async () => root.render(<RecordListPage kind="policies" />));
  expect(summaries).toBe(2);
  expect(container.querySelector('[data-testid="additional-policies"]')).toBeNull();
  expect(container.textContent).not.toContain('Supports CIS');
  mockAuth = { ...mockAuth, user: { ...mockAuth.user, user_id: 'next-demo-actor' } };
  await act(async () => root.render(<RecordListPage kind="policies" />));
  expect(summaries).toBe(3);
  expect(container.querySelector('[data-testid="additional-policy-metric-mapped"] strong').textContent.startsWith('0')).toBe(true);
  await act(async () => resolvePrevious({ data: { client_id: 'demo_brawndo', items: [{ key: 'cis-ig1', tracking_available: true, implementation_group: 3 }] } }));
  expect(container.querySelector('[data-testid="additional-policy-metric-mapped"] strong').textContent.startsWith('0')).toBe(true);
  expect(container.textContent).not.toContain('Mapped to CIS IG3');
});
