import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {OrgProvider, useOrg} from './OrgContext';
import api from '@/lib/api';

let mockAuth;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/lib/api', () => ({__esModule: true, default: {get: jest.fn()}}));

let host, root, org, requests;
const clients = name => [{client_id: 'a', name, status: 'active'}, {client_id: 'b', name: 'Other authorized client', status: 'active'}];
function Probe() { org = useOrg(); return null; }
async function render() {
  await act(async () => root.render(<MemoryRouter initialEntries={['/reviews?client_id=a']}>
    <OrgProvider><Probe /></OrgProvider>
  </MemoryRouter>));
}
async function reply(request, data) {
  await act(async () => { request.resolve({data}); await request.promise; });
}
async function portfolioRefresh() {
  await act(async () => {
    window.dispatchEvent(new Event('grc:portfolio-changed'));
    jest.advanceTimersByTime(0);
  });
}
async function verifiedWorkspace() {
  await render();
  expect(org.loading).toBe(true);
  expect(requests).toHaveLength(1);
  await reply(requests[0], clients('Previously verified Alpha'));
  expect(org.loading).toBe(false);
  expect(org.currentClientId).toBe('a');
  expect(org.currentClient.name).toBe('Previously verified Alpha');
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear(); localStorage.setItem('grc_client_id', 'a');
  mockAuth = {workspaceMode: 'standard', user: {user_id: 'synthetic-org-actor', role: 'client_grc_manager',
    status: 'active', client_ids: ['a', 'b'], all_clients: false}};
  requests = [];
  api.get.mockImplementation((path, config) => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    requests.push({path, config, promise, resolve, reject}); return promise;
  });
  jest.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  jest.useFakeTimers();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    requests.forEach(request => request.resolve({data: clients('Unmounted synthetic reply')}));
    await Promise.allSettled(requests.map(request => request.promise));
  });
  host.remove(); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks();
  localStorage.clear(); sessionStorage.clear();
});

test('the real portfolio event timer refreshes an already verified same-owner workspace without ending its access', async () => {
  await verifiedWorkspace();
  const actor = mockAuth.user, current = org.currentClient;
  await act(async () => window.dispatchEvent(new Event('grc:portfolio-changed')));
  expect(requests).toHaveLength(1);
  await act(async () => jest.advanceTimersByTime(0));
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({path: '/clients', config: {params: {include_archived: true}}});
  expect(mockAuth.user).toBe(actor);
  expect(org.loading).toBe(false);
  expect(org.refreshing).toBe(true);
  expect(org.currentClient).toBe(current);
  expect(org.currentClientId).toBe('a');
  expect(org.error).toBe('');
  await reply(requests[1], clients('Fresh authoritative Alpha'));
  expect(org.loading).toBe(false);
  expect(org.refreshing).toBe(false);
  expect(org.currentClient.name).toBe('Fresh authoritative Alpha');
});

test('identical client clones preserve workspace identity while authoritative program and status changes replace it', async () => {
  await render();
  const initial = clients('Authoritative program Alpha');
  initial[0].framework_settings = {'cis-ig1': {implementation_group: 1}};
  await reply(requests[0], initial);
  const identity = org.workspaceIdentity;
  expect(typeof identity).toBe('string');
  await portfolioRefresh();
  expect(org.loading).toBe(false);
  await reply(requests[requests.length - 1], JSON.parse(JSON.stringify(initial)));
  expect(org.workspaceIdentity).toBe(identity);

  const changedProgram = JSON.parse(JSON.stringify(initial));
  changedProgram[0].framework_settings['cis-ig1'].implementation_group = 2;
  await portfolioRefresh();
  expect(org.workspaceIdentity).toBe(identity);
  await reply(requests[requests.length - 1], changedProgram);
  const programIdentity = org.workspaceIdentity;
  expect(programIdentity).not.toBe(identity);
  expect(org.currentClient.framework_settings['cis-ig1'].implementation_group).toBe(2);

  const archived = JSON.parse(JSON.stringify(changedProgram));
  archived[0].status = 'archived';
  await portfolioRefresh();
  await reply(requests[requests.length - 1], archived);
  expect(org.workspaceIdentity).not.toBe(programIdentity);
  expect(org.currentClientId).toBe('a');
  expect(org.currentClient.status).toBe('archived');
});

test('focus upgrades a queued portfolio notification to a foreground access check', async () => {
  await verifiedWorkspace();
  await act(async () => {
    window.dispatchEvent(new Event('grc:portfolio-changed'));
    window.dispatchEvent(new Event('focus'));
    jest.advanceTimersByTime(0);
  });
  expect(requests).toHaveLength(2);
  expect(org.loading).toBe(true);
  expect(org.refreshing).toBe(false);
  await reply(requests[1], clients('Focus-verified Alpha'));
  expect(org.loading).toBe(false);
  expect(org.currentClient.name).toBe('Focus-verified Alpha');
  await portfolioRefresh();
  expect(org.loading).toBe(false);
  expect(org.refreshing).toBe(true);
});

test('a queued portfolio event cannot turn an explicit pending foreground access check into background access', async () => {
  await verifiedWorkspace();
  await act(async () => window.dispatchEvent(new Event('grc:portfolio-changed')));
  let manual;
  await act(async () => { manual = org.refresh(); });
  expect(org.loading).toBe(true);
  expect(requests).toHaveLength(2);
  await act(async () => jest.advanceTimersByTime(0));
  expect(org.loading).toBe(true);
  const latest = requests[requests.length - 1];
  // Coalescing the event or starting another foreground check are both safe;
  // neither may reuse the proof invalidated by the explicit refresh.
  await reply(latest, clients('Fresh foreground Alpha'));
  for (const request of requests.slice(1).filter(request => request !== latest)) {
    await reply(request, clients('Obsolete foreground Alpha'));
  }
  await act(async () => manual);
  expect(org.loading).toBe(false);
  expect(org.currentClient.name).toBe('Fresh foreground Alpha');
  expect(org.error).toBe('');
});

test.each(['error', 'selected-client removal'])('a background %s withdraws access and makes the next portfolio read foreground', async outcome => {
  await verifiedWorkspace();
  await portfolioRefresh();
  expect(org.loading).toBe(false);
  const pending = requests[requests.length - 1];
  if (outcome === 'error') {
    await act(async () => { pending.reject(new Error('Synthetic background client read failed')); await Promise.allSettled([pending.promise]); });
    expect(org.error).toContain('Synthetic background client read failed');
    expect(org.clients).toEqual([]);
  } else {
    await reply(pending, [{client_id: 'b', name: 'Other authorized client', status: 'active'}]);
    expect(org.error).toMatch(/unavailable|outside your current access/i);
  }
  expect(org.currentClient).toBeNull();
  expect(org.currentClientId).toBe('');
  expect(org.loading).toBe(false);
  await portfolioRefresh();
  expect(org.loading).toBe(true);
  expect(org.refreshing).toBe(false);
  expect(org.currentClient).toBeNull();
  await reply(requests[requests.length - 1], clients('Recovered authoritative Alpha'));
  expect(org.loading).toBe(false);
  expect(org.currentClientId).toBe('a');
  expect(org.currentClient.name).toBe('Recovered authoritative Alpha');
  expect(org.error).toBe('');
});

test.each(['role', 'grants'])('a real %s A to B to A transition requires fresh foreground proof and rejects earlier A and B replies', async change => {
  await verifiedWorkspace();
  const original = mockAuth;
  await portfolioRefresh();
  const olderA = requests[requests.length - 1];
  expect(org.loading).toBe(false);
  mockAuth = {...original, user: {...original.user,
    ...(change === 'role' ? {role: 'client_viewer'} : {client_ids: ['a']})}};
  await render();
  const olderB = requests[requests.length - 1];
  expect(olderB).not.toBe(olderA);
  expect(org.loading).toBe(true);
  mockAuth = {...original, user: {...original.user, client_ids: [...original.user.client_ids]}};
  await render();
  const returnedA = requests[requests.length - 1];
  expect(returnedA).not.toBe(olderB);
  expect(org.loading).toBe(true);
  await reply(olderA, clients('Stale earlier A proof'));
  await reply(olderB, clients('Stale B proof'));
  expect(org.loading).toBe(true);
  expect(org.currentClient?.name || '').not.toMatch(/Stale/);
  await portfolioRefresh();
  expect(org.loading).toBe(true);
  const latest = requests[requests.length - 1];
  await reply(latest, clients('Fresh returned-A proof'));
  if (latest !== returnedA) await reply(returnedA, clients('Superseded returned-A proof'));
  expect(org.loading).toBe(false);
  expect(org.currentClientId).toBe('a');
  expect(org.currentClient.name).toBe('Fresh returned-A proof');
  expect(org.error).toBe('');
});
