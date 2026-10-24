import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from './Dashboard';
import {useOrg} from '@/context/OrgContext';
import {loadClientDashboard} from '@/lib/loadClientDashboard';
import {cisContext} from '../testUtils/cisExperience';

jest.mock('@/context/OrgContext', () => ({useOrg: jest.fn()}));
const mockUser = {user_id: 'actor', role: 'super_admin', workspace_mode: 'demo'};
jest.mock('@/context/AuthContext', () => ({useAuth: () => ({user: mockUser, workspaceMode: 'demo'})}));
jest.mock('@/lib/loadClientDashboard', () => ({loadClientDashboard: jest.fn()}));
jest.mock('@/lib/api', () => ({__esModule: true, default: {get: jest.fn()}, formatError: error => error.message}));
jest.mock('react-router-dom', () => ({Link: ({to, children, ...props}) => <a href={to} {...props}>{children}</a>, useNavigate: () => jest.fn(), useLocation: () => ({pathname: '/dashboard', search: ''}), useSearchParams: () => require('react').useState(new URLSearchParams())}), {virtual: true});

const snapshot = {contract_version: 2, members: [], programs: [], programRows: {}, queue: {as_of: '2026-10-24', groups: Object.fromEntries(['all', 'pastDue', 'due30', 'unassigned'].map(key => [key, {total: 0, items: []}]))}};
let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('grc_client_id', 'demo_brawndo');
  sessionStorage.setItem('grc_client_id', 'demo_brawndo');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  loadClientDashboard.mockReset();
});
afterEach(async () => {await act(async () => root.unmount()); container.remove(); localStorage.clear(); sessionStorage.clear();});

function expectNeutralPending() {
  expect(container.querySelector('[role=status]')?.textContent).toBe('Loading workspace…');
  expect(container.querySelector('h1')).toBeNull();
  expect(container.querySelector('button, table, [role=dialog], [data-cis-dashboard-concept]')).toBeNull();
  expect(container.textContent).not.toMatch(/Client Dashboard|Synthetic|Brawndo|Priority overview/);
}

test.each([null, {client_id: 'another-client', name: 'Foreign Synthetic client'}])('unresolved or mismatched client stays neutral even when dashboard data arrives early (%j)', async currentClient => {
  useOrg.mockReturnValue({...cisContext(), currentClient, loading: true});
  let finish;
  loadClientDashboard.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  await act(async () => root.render(<Dashboard/>));
  expectNeutralPending();
  await act(async () => finish(snapshot));
  expectNeutralPending();
  useOrg.mockReturnValue(cisContext());
  loadClientDashboard.mockResolvedValue(snapshot);
  await act(async () => root.render(<Dashboard/>));
  expect(container.querySelector('.brawndo-demo-dashboard')).not.toBeNull();
  expect(container.querySelector('h1').textContent).toContain('Synthetic CIS client');
});

test('a failed organization bootstrap does not remain stuck behind the neutral pending frame', async () => {
  useOrg.mockReturnValue({...cisContext(), currentClient: null, loading: true});
  loadClientDashboard.mockRejectedValue(new Error('Dashboard read failed'));
  await act(async () => root.render(<Dashboard/>));
  expectNeutralPending();
  useOrg.mockReturnValue({...cisContext(), currentClient: null, loading: false, error: 'Client unavailable'});
  await act(async () => root.render(<Dashboard/>));
  expect(container.textContent).not.toContain('Loading workspace…');
  expect(container.querySelector('[role=alert]').textContent).toContain('Dashboard read failed');
  expect(container.querySelector('.brawndo-demo-dashboard')).toBeNull();
});

test('a resolved non-CIS client keeps its native dashboard', async () => {
  const client = {client_id: 'demo_brawndo', name: 'Synthetic native client', status: 'active'};
  useOrg.mockReturnValue({...cisContext(), currentClient: null, loading: true});
  loadClientDashboard.mockResolvedValue(snapshot);
  await act(async () => root.render(<Dashboard/>));
  expectNeutralPending();
  useOrg.mockReturnValue({...cisContext(), currentClient: client, clients: [client], loading: false});
  await act(async () => root.render(<Dashboard/>));
  expect(container.querySelector('h1').textContent).toBe('Synthetic native client Dashboard');
  expect(container.textContent).toContain('Priority overview');
  expect(container.querySelector('.brawndo-demo-dashboard')).toBeNull();
});
