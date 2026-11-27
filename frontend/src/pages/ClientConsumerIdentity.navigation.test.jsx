import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Route, Routes, useLocation} from 'react-router-dom';
import {OrgProvider, useOrg} from '@/context/OrgContext';
import Contacts from './Contacts';
import BrawndoActionItems from './BrawndoActionItems';
import FrameworkProgramCard from '@/components/FrameworkProgramCard';
import ClientWorkDashboard from '@/components/ClientWorkDashboard';
import CisDashboardRiskMatrix from '@/components/CisDashboardRiskMatrix';
import NativeApp from '@/App';
import {rememberClient, selectedClient} from '@/lib/clientSelection';
import api from '@/lib/api';

jest.mock('@/context/AuthContext', () => ({AuthProvider: ({children}) => children,
  useAuth: () => ({workspaceMode: 'standard', loading: false, error: '',
  user: mockUser})}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: false, API: '/api',
  default: {get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn()},
  formatError: error => error.message}));
// The legacy test keeps App's real route, Protected and OrgProvider; the destination
// form and shell are presentation boundaries, not a substitute tenant resolver.
jest.mock('@/components/Layout', () => () => {
  const {Outlet} = jest.requireActual('react-router-dom');
  return <Outlet/>;
});
jest.mock('@/pages/ClientProfile', () => ({...jest.requireActual('@/pages/ClientProfile'),__esModule:true,
  default: function ProfileDestination() {
    const scope = jest.requireActual('@/context/OrgContext').useOrg();
    const route = jest.requireActual('react-router-dom').useLocation();
    mockProfileObservation = {clientId: scope.currentClientId, route, error: scope.error};
    return <>{scope.error && <p role="alert">{scope.error}</p>}<output>{scope.currentClientId}</output></>;
  },
}));

const A = 'synthetic-consumer-a', B = 'synthetic-consumer-b';
const mockUser = {user_id: 'synthetic-consumer-reader', role: 'platform_admin', status: 'active', client_ids: [A, B]};
const clients = [A, B].map(client_id => ({client_id, name: 'SYNTHETIC ' + client_id, status: 'active',
  cis_program: null, shared_programs: []}));
const copy = value => JSON.parse(JSON.stringify(value));
const queue = {as_of: '2026-11-20', groups: Object.fromEntries(['all', 'pastDue', 'due30', 'unassigned']
  .map(key => [key, {total: 0, items: []}]))};
let root, host, generation, org, location, unexpected, contactClients, actionClients, mockProfileObservation;

function Observe() {
  org = useOrg(); location = useLocation();
  return <output data-testid="current-consumer-client">{org.currentClientId}</output>;
}
function DashboardLinks() {
  const {currentClientId} = useOrg(), params = new URLSearchParams(useLocation().search);
  if (params.get('example') === 'risk') return <CisDashboardRiskMatrix clientId={currentClientId}/>;
  if (params.get('example') === 'framework') return <FrameworkProgramCard clientId={currentClientId}
    program={{key: 'cis-ig1', label: 'CIS IG1', to: '/compliance/cis-ig1?origin=dashboard#implementation'}}
    rows={[{definition_id: '1.1', status: 'not_assessed'}]}/>;
  return <ClientWorkDashboard clientId={currentClientId} queue={queue} programs={[]}
    filter="all" onFilter={() => {}} onOpen={() => {}} loadDetail={async () => ({items: [], total: 0})}/>;
}
function App() {
  return <BrowserRouter key={generation}><OrgProvider><Observe/><Routes>
    <Route path="/contacts" element={<Contacts/>}/>
    <Route path="/action-items" element={<BrawndoActionItems/>}/>
    <Route path="/dashboard-links" element={<DashboardLinks/>}/>
    <Route path="*" element={<p>Native destination boundary</p>}/>
  </Routes></OrgProvider></BrowserRouter>;
}

async function action(perform) {
  let read = api.get.mock.results.length;
  await act(async () => { perform(); });
  while (read < api.get.mock.results.length) {
    const issued = api.get.mock.results.slice(read).map(result => result.value);
    read = api.get.mock.results.length;
    await act(async () => { await Promise.allSettled(issued); });
  }
}
async function mount(url) {
  window.history.replaceState({}, '', url); generation++;
  await action(() => root.render(<App/>));
}
const button = label => [...host.querySelectorAll('button')].find(node => node.textContent.trim() === label);
async function click(target) {
  expect(target).toBeTruthy();
  await action(() => target.click());
}
function assertNoWrites() {
  expect(unexpected).toEqual([]);
  for (const method of ['post', 'patch', 'put', 'delete']) expect(api[method]).not.toHaveBeenCalled();
}
async function assertColdIdentity() {
  const url = location.pathname + location.search + location.hash;
  rememberClient(B); api.get.mockClear();
  await mount(url);
  expect(org.currentClientId).toBe(A);
  expect(new URLSearchParams(location.search).get('client_id')).toBe(A);
  expect(location.pathname + location.search + location.hash).toBe(url);
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear(); sessionStorage.clear(); generation = 0;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  unexpected = []; contactClients = []; actionClients = []; mockProfileObservation = null;
  for (const method of ['get', 'post', 'patch', 'put', 'delete']) api[method].mockReset();
  api.get.mockImplementation(async (path, options = {}) => {
    const cid = options.params?.client_id;
    if (path === '/clients') return {data: copy(clients)};
    if (path === '/contacts') {
      expect([A, B]).toContain(cid); contactClients.push(cid);
      return {data: [{contact_id: 'synthetic-contact-' + cid, client_id: cid, name: 'SYNTHETIC native Contact ' + cid,
        status: 'active', email: 'synthetic@example.com'}]};
    }
    if (clients.some(client => path === '/clients/' + client.client_id + '/contact-accounts')) return {data: []};
    if (clients.some(client => path === '/clients/' + client.client_id + '/members')) return {data: [copy(mockUser)]};
    if (path === '/tasks') {
      expect([A, B]).toContain(cid); actionClients.push(cid);
      return {data: [{task_id: 'synthetic-action-' + cid, client_id: cid, title: 'SYNTHETIC native Action ' + cid,
        source_type: 'manual', status: 'open', owner_id: mockUser.user_id, priority: 'low', due_date: '2099-01-01'}]};
    }
    if (['/findings', '/reviews', '/risks', '/vendors', '/policies'].includes(path)) {
      expect([A, B]).toContain(cid); return {data: []};
    }
    if (path === '/onboarding/state') { expect([A, B]).toContain(cid); return {data: {assessments: []}}; }
    unexpected.push(path); throw new Error('Unexpected native read: ' + path);
  });
  for (const method of ['post', 'patch', 'put', 'delete']) {
    api[method].mockImplementation(async () => { throw new Error('Unexpected business mutation'); });
  }
  rememberClient(B);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  window.history.replaceState({}, '', '/'); localStorage.clear(); sessionStorage.clear(); jest.clearAllMocks();
});

test('Contacts clears its filters while retaining explicit client, unrelated query and fragment through reload', async () => {
  await mount('/contacts?client_id=' + A + '&q=missing&access=none&archived=true&origin=fixture#people');
  expect(org.currentClientId).toBe(A); rememberClient(B);
  await click(button('Clear filters'));
  const params = new URLSearchParams(location.search);
  expect(params.get('client_id')).toBe(A); expect(params.get('origin')).toBe('fixture');
  for (const key of ['q', 'access', 'archived']) expect(params.has(key)).toBe(false);
  expect(location.hash).toBe('#people'); expect(selectedClient()).toBe(B);
  expect(host.textContent).toContain('SYNTHETIC native Contact ' + A);
  await assertColdIdentity();
  expect(contactClients.length).toBeGreaterThan(1); expect(contactClients.every(cid => cid === A)).toBe(true);
  assertNoWrites();
});

test('the native empty Action register clears filter state without discarding client or unrelated route state', async () => {
  await mount('/action-items?client_id=' + A + '&view=overdue&q=missing&owner=nobody&unassigned=1&signal=material&origin=fixture#actions');
  expect(org.currentClientId).toBe(A); rememberClient(B);
  await click(button('Clear filters'));
  const params = new URLSearchParams(location.search);
  expect(params.get('client_id')).toBe(A); expect(params.get('view')).toBe('all');
  expect(params.get('origin')).toBe('fixture'); expect(location.hash).toBe('#actions');
  for (const key of ['q', 'owner', 'unassigned', 'signal']) expect(params.has(key)).toBe(false);
  expect(host.textContent).toContain('SYNTHETIC native Action ' + A);
  expect(selectedClient()).toBe(B); await assertColdIdentity();
  expect(actionClients.length).toBeGreaterThan(1); expect(actionClients.every(cid => cid === A)).toBe(true);
  assertNoWrites();
});

test.each([
  ['configuration', '/client-profile', null, ''],
  ['framework', '/compliance/cis-ig1', 'not_assessed', '#implementation'],
  ['risk', '/risks', null, ''],
])('the actual %s Dashboard link retains its verified client after another tab changes preference', async (example, destination, view, hash) => {
  await mount('/dashboard-links?client_id=' + A + '&example=' + example);
  expect(org.currentClientId).toBe(A); rememberClient(B);
  const target = example === 'configuration'
    ? [...host.querySelectorAll('a')].find(node => node.textContent.trim() === 'Review client configuration')
    : example === 'risk' ? [...host.querySelectorAll('a')].find(node => node.textContent.trim().startsWith('Open risk register'))
      : host.querySelector('a[href*="view=not_assessed"]');
  expect(target).toBeTruthy();
  const href = new URL(target.href);
  expect(href.searchParams.get('client_id')).toBe(A); expect(href.pathname).toBe(destination);
  expect(href.hash).toBe(hash);
  if (view) { expect(href.searchParams.get('view')).toBe(view); expect(href.searchParams.get('origin')).toBe('dashboard'); }
  await click(target);
  expect(location.pathname).toBe(destination); expect(org.currentClientId).toBe(A);
  expect(selectedClient()).toBe(B); await assertColdIdentity(); assertNoWrites();
});

test.each([A, 'foreign', 'unknown'])('the actual legacy onboarding route retains explicit %s identity, query and fragment', async clientId => {
  window.history.replaceState({}, '', '/onboarding?client_id=' + clientId + '&origin=legacy&step=2#setup');
  await action(() => root.render(<NativeApp/>));
  expect(mockProfileObservation).not.toBeNull();
  const route = mockProfileObservation.route, params = new URLSearchParams(route.search);
  expect(route.pathname).toBe('/client-profile');
  expect(params.get('client_id')).toBe(clientId); expect(params.get('origin')).toBe('legacy');
  expect(params.get('step')).toBe('2'); expect(params.has('tab')).toBe(false); expect(route.hash).toBe('#setup');
  if (clientId === A) {
    expect(mockProfileObservation.clientId).toBe(A);
    rememberClient(B);
    await action(() => root.unmount()); root = createRoot(host);
    await action(() => root.render(<NativeApp/>));
    expect(mockProfileObservation.clientId).toBe(A);
  } else {
    expect(mockProfileObservation.clientId).toBe('');
    expect(host.querySelector('[role="alert"]').textContent).toContain('outside your current access');
  }
  expect(api.get.mock.calls.every(([path]) => path === '/clients')).toBe(true); assertNoWrites();
});
