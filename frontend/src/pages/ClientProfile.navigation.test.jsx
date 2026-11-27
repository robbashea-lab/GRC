import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter, Routes, Route, useLocation} from 'react-router-dom';
import ClientProfile, {LegacyClientSettings} from './ClientProfile';
import {OrgProvider, useOrg} from '@/context/OrgContext';
import {rememberClient, selectedClient} from '@/lib/clientSelection';
import api from '@/lib/api';

jest.mock('@/context/AuthContext', () => ({useAuth: () => ({
  user: {user_id: 'synthetic-provider', role: 'platform_admin', status: 'active',
    workspace_mode: 'standard', client_ids: ['g', 'p'], all_clients: false},
  workspaceMode: 'standard', loading: false, error: '',
})}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: false,
  default: {get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn()},
  formatError: error => error.message}));
jest.mock('./Onboarding', () => () => <div>Native onboarding boundary</div>);
jest.mock('./PlatformAdmin', () => ({UsersTable: () => null}));
jest.mock('@/components/ComplianceProfile', () => () => null);
jest.mock('@/components/ClientDialog', () => () => null);
jest.mock('@/components/ProgramConfiguration', () => ({clientId}) =>
  <output aria-label="Program configuration client">{clientId}</output>);

const CLIENTS = [
  {client_id: 'g', name: 'SYNTHETIC General', status: 'active', shared_programs: [], cis_program: null},
  {client_id: 'p', name: 'SYNTHETIC Primary', status: 'active', shared_programs: [], cis_program: null},
];
const clone = value => JSON.parse(JSON.stringify(value));
let host, root, mountId, route, org;

function ObserveScope() {
  const location = useLocation();
  org = useOrg();
  route = location.pathname + location.search + location.hash;
  return <><output aria-label="Verified client">{org.currentClientId}</output>
    {org.error && <p role="alert">{org.error}</p>}</>;
}
function handoff(client) {
  return {client, records: {
    requirements: [], framework_assessments: [], policies: [],
    reviews: [{client_id: client.client_id, review_id: 'synthetic-review-' + client.client_id,
      title: 'SYNTHETIC scheduling fixture', status: 'needs_scheduling', due_date: null, owner_id: null}],
  }, people: {contacts: 0, active_client_users: 1, eligible_assignees_available: true}};
}
async function mount(url) {
  await act(async () => root.render(
    <MemoryRouter key={++mountId} initialEntries={[url]}>
      <OrgProvider><ObserveScope /><Routes>
        <Route path="/client-settings" element={<LegacyClientSettings />} />
        <Route path="/client-profile" element={<ClientProfile />} />
      </Routes></OrgProvider>
    </MemoryRouter>
  ));
}
const profileReads = () => api.get.mock.calls.filter(([path]) => /^\/clients\/[^/]+\/profile$/.test(path));
const handoffReads = () => api.get.mock.calls.filter(([path]) => path === '/onboarding/handoff');
const sectionButton = label => [...host.querySelectorAll('nav[aria-label="Client Profile sections"] button')]
  .find(button => button.textContent === label);
function expectOnlyClientReads(clientId) {
  expect(profileReads().length).toBeGreaterThan(0);
  expect(profileReads().every(([path]) => path === '/clients/' + clientId + '/profile')).toBe(true);
  expect(handoffReads().length).toBeGreaterThan(0);
  expect(handoffReads().every(([, options]) => options.params.client_id === clientId)).toBe(true);
}
function expectNoCommands() {
  for (const method of ['post', 'patch', 'put', 'delete']) expect(api[method]).not.toHaveBeenCalled();
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear(); jest.clearAllMocks();
  rememberClient('p');
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host); mountId = 0;
  api.get.mockImplementation(async (path, options) => {
    if (path === '/clients') return {data: clone(CLIENTS)};
    const profile = path.match(/^\/clients\/([^/]+)\/profile$/);
    if (profile) {
      if (!CLIENTS.some(client => client.client_id === profile[1])) throw new Error('Unexpected client profile');
      return {data: {client_id: profile[1], completed: true, profile: {}, history: []}};
    }
    if (path === '/onboarding/handoff') {
      const client = CLIENTS.find(candidate => candidate.client_id === options?.params?.client_id);
      if (!client) throw new Error('Unexpected handoff client');
      return {data: handoff(clone(client))};
    }
    throw new Error('Unexpected native read: ' + path);
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); localStorage.clear(); sessionStorage.clear();
});

test('Profile tab navigation pins the verified client and survives another tab preference plus reload', async () => {
  await mount('/client-profile?client_id=g&tab=overview&origin=qa#profile-anchor');
  expect(org.currentClientId).toBe('g'); expectOnlyClientReads('g');
  expect(host.querySelector('a[href="/dashboard?client_id=g"]')).not.toBeNull();

  await act(async () => sectionButton('Program Configuration').click());
  let url = new URL(route, 'https://synthetic.example');
  expect(url.searchParams.get('client_id')).toBe('g');
  expect(url.searchParams.get('tab')).toBe('program');
  expect(url.searchParams.get('origin')).toBe('qa');
  expect(url.hash).toBe('#profile-anchor');
  expect(host.querySelector('[aria-label="Program configuration client"]').textContent).toBe('g');
  expect(host.querySelector('a[href="/reviews?setup=scheduling&client_id=g"]')).not.toBeNull();
  expect(host.querySelector('a[href="/reviews?client_id=g"]')).not.toBeNull();
  expect(host.querySelector('a[href="/client-profile?tab=program&client_id=g"]')).not.toBeNull();

  const reloadUrl = route;
  // Normal authenticated tabs share this preference. Router and OrgProvider remain real.
  rememberClient('p');
  expect(selectedClient()).toBe('p'); expect(org.currentClientId).toBe('g');
  api.get.mockClear();
  await mount(reloadUrl);
  expect(org.currentClientId).toBe('g'); expectOnlyClientReads('g');
  expect(host.querySelector('[aria-label="Program configuration client"]').textContent).toBe('g');
  expect(route).toBe(reloadUrl);

  await act(async () => sectionButton('People & Ownership').click());
  url = new URL(route, 'https://synthetic.example');
  expect(url.searchParams.get('client_id')).toBe('g');
  expect(url.searchParams.get('origin')).toBe('qa'); expect(url.hash).toBe('#profile-anchor');
  expect(host.querySelector('a[href="/contacts?client_id=g"]')).not.toBeNull();
  expectNoCommands();
});

test('an initially unpinned Profile tab acquires only its current verified client', async () => {
  rememberClient('g');
  await mount('/client-profile?tab=overview&origin=legacy#profile-anchor');
  expect(org.currentClientId).toBe('g');
  await act(async () => sectionButton('Program Configuration').click());
  const url = new URL(route, 'https://synthetic.example');
  expect(url.searchParams.get('client_id')).toBe('g');
  expect(url.searchParams.get('origin')).toBe('legacy'); expect(url.hash).toBe('#profile-anchor');
  expectOnlyClientReads('g'); expectNoCommands();
});

test.each(['foreign', 'unknown'])('an explicit %s Profile never falls back to a remembered authorized client', async clientId => {
  await mount('/client-profile?client_id=' + clientId + '&tab=program&origin=qa#profile-anchor');
  expect(org.currentClientId).toBe('');
  expect(host.querySelector('[role="alert"]').textContent).toContain('outside your current access');
  expect(profileReads()).toHaveLength(0); expect(handoffReads()).toHaveLength(0);
  expect(host.querySelector('[aria-label="Program configuration client"]')).toBeNull();
  expect(new URL(route, 'https://synthetic.example').searchParams.get('client_id')).toBe(clientId);
  expectNoCommands();
});

test.each(['g', 'foreign', 'unknown'])('legacy settings retains explicit %s identity, other query values and fragment', async clientId => {
  await mount('/client-settings?client_id=' + clientId + '&tab=compliance&origin=legacy#profile-anchor');
  const url = new URL(route, 'https://synthetic.example');
  expect(url.pathname).toBe('/client-profile');
  expect(url.searchParams.get('client_id')).toBe(clientId);
  expect(url.searchParams.get('tab')).toBe('program');
  expect(url.searchParams.get('origin')).toBe('legacy'); expect(url.hash).toBe('#profile-anchor');
  if (clientId === 'g') {
    expect(org.currentClientId).toBe('g'); expectOnlyClientReads('g');
  } else {
    expect(org.currentClientId).toBe('');
    expect(host.querySelector('[role="alert"]').textContent).toContain('outside your current access');
    expect(profileReads()).toHaveLength(0); expect(handoffReads()).toHaveLength(0);
  }
  expectNoCommands();
});
