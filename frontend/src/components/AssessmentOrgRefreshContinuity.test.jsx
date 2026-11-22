import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import Layout from './Layout';
import FrameworkDrawer from './FrameworkDrawer';
import {OrgProvider, useOrg} from '@/context/OrgContext';
import api, {setWorkspaceMode} from '@/lib/api';
import {previewAdapter} from '@/preview/adapter';
import {clearPendingCommands, syncPendingCommandIdentity} from '@/lib/createIntent';
import {rememberClient} from '@/lib/clientSelection';
import {toast} from 'sonner';

let mockAuth;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('sonner', () => ({toast: {error: jest.fn(), success: jest.fn(), info: jest.fn()}}));

// The isolated adapter is only the transport. Org refreshes, Axios interceptors,
// Layout availability, scoped ownership and both native drawer controllers are real.
const CID = 'demo_prestige';
let root, host, assessment, review, org, transport, originalAdapter, reads, writes;
let holdClients, clientGate, clientsStarted, startGate, startCommitted, startResponse;
const query = id => document.querySelector('[data-testid="' + id + '"]');
const button = label => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label);
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return {promise, resolve};
}
function OrgProbe() { org = useOrg(); return null; }
function application() {
  const url = '/compliance/soc-2?client_id=' + CID;
  return <MemoryRouter initialEntries={[url]}><OrgProvider><OrgProbe />
    <Routes><Route element={<Layout />}>
      <Route path="/compliance/soc-2" element={<FrameworkDrawer open reviewManagement
        record={assessment} clientId={CID} onOpenChange={() => {}} />} />
    </Route></Routes>
  </OrgProvider></MemoryRouter>;
}
async function render() {
  await act(async () => root.render(application()));
  await drainReads();
}
async function drainReads() {
  let index = 0;
  while (index < reads.length) {
    const batch = reads.slice(index); index = reads.length;
    await act(async () => {
      await Promise.allSettled(batch.filter(read => !(holdClients && read.path === '/clients')).map(read => read.promise));
    });
  }
}
async function openReview() {
  await render();
  const opener = button(review.title);
  expect(opener).toBeTruthy();
  expect(host.querySelector('[data-client-workspace-body]')).toBeTruthy();
  await act(async () => opener.click());
  await drainReads();
  expect(query('reviews-drawer')).toBeTruthy();
  const notes = query('field-notes');
  expect(notes).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(notes, 'SYNTHETIC native metadata retained through background Org refresh');
    notes.dispatchEvent(new Event('input', {bubbles: true}));
  });
}
async function beginStart() {
  holdClients = true;
  const start = query('review-start') || button('In progress');
  expect(start).toBeTruthy(); expect(start.disabled).toBe(false);
  await act(async () => { start.click(); await startCommitted.promise; });
  const patch = writes.find(write => write.method === 'patch' && write.path === '/reviews/' + review.review_id);
  const next = writes.find(write => write.method === 'post' && write.path === '/reviews/' + review.review_id + '/start');
  expect(patch).toBeTruthy(); expect(next).toBeTruthy();
  expect(patch.response.data.notes).toBe('SYNTHETIC native metadata retained through background Org refresh');
  expect(next.response).toBeUndefined();
  // This is the actual portfolio-event timer emitted by api.js after the PATCH.
  await act(async () => { jest.advanceTimersByTime(0); await clientsStarted.promise; });
  expect(org.currentClientId).toBe(CID);
  expect(org.currentClient.client_id).toBe(CID);
  expect(startResponse.data.status).toBe('in_progress');
  return next;
}
async function deliverStart(next) {
  await act(async () => { startGate.resolve(); await Promise.allSettled([next.promise]); });
  await drainReads();
}
async function finishRefresh() {
  holdClients = false;
  await act(async () => clientGate.resolve());
  await drainReads();
}
async function expectOneNativeStart() {
  expect(transport.mock.calls.filter(([config]) => config.method === 'patch' && config.url === '/reviews/' + review.review_id)).toHaveLength(1);
  expect(transport.mock.calls.filter(([config]) => config.method === 'post' && config.url === '/reviews/' + review.review_id + '/start')).toHaveLength(1);
  const saved = (await api.get('/reviews/' + review.review_id)).data;
  expect(saved).toMatchObject({review_id: review.review_id, client_id: CID, status: 'in_progress',
    notes: 'SYNTHETIC native metadata retained through background Org refresh'});
  const rows = (await api.get('/reviews', {params: {client_id: CID}})).data.filter(row => row.title === review.title);
  expect(rows).toHaveLength(1); expect(rows[0].review_id).toBe(review.review_id);
}

beforeAll(() => Object.defineProperty(global, 'crypto', {configurable: true, value: require('crypto').webcrypto}));
const nativeScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => { if (!nativeScrollIntoView) Element.prototype.scrollIntoView = jest.fn(); });
afterAll(() => { if (!nativeScrollIntoView) delete Element.prototype.scrollIntoView; });
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear(); localStorage.clear(); clearPendingCommands(); setWorkspaceMode('standard');
  originalAdapter = api.defaults.adapter;
  holdClients = false; clientGate = deferred(); clientsStarted = deferred(); startGate = deferred(); startCommitted = deferred();
  startResponse = null; reads = []; writes = [];
  transport = jest.fn(async config => {
    const response = await previewAdapter(config);
    if (config.method === 'get' && config.url === '/clients' && holdClients) {
      clientsStarted.resolve(); await clientGate.promise;
    }
    if (config.method === 'post' && config.url === '/reviews/' + review?.review_id + '/start') {
      startResponse = response; startCommitted.resolve(); await startGate.promise;
    }
    return response;
  });
  api.defaults.adapter = transport;
  const user = (await api.post('/demo/enter')).data.user;
  mockAuth = {user: {...user, workspace_mode: 'standard'}, workspaceMode: 'standard', loading: false, error: null};
  syncPendingCommandIdentity(user.user_id, 'standard');
  const workspace = (await api.get('/frameworks/soc-2', {params: {client_id: CID}})).data;
  assessment = workspace.assessments.find(row => row.definition_id === 'CC1.1');
  expect(assessment).toBeTruthy();
  review = (await api.post('/reviews', {client_id: CID, title: 'SYNTHETIC Org refresh continuity Review',
    review_type: 'access', recurrence: 'annual', due_date: '2099-09-30'})).data;
  await api.post('/framework_assessments/' + assessment.framework_assessment_id + '/links', {kind: 'reviews', id: review.review_id});
  assessment = (await api.get('/frameworks/soc-2', {params: {client_id: CID}})).data.assessments
    .find(row => row.framework_assessment_id === assessment.framework_assessment_id);
  rememberClient(CID);
  window.history.replaceState({}, '', '/compliance/soc-2?client_id=' + CID);
  const get = api.get.bind(api), patch = api.patch.bind(api), post = api.post.bind(api);
  jest.spyOn(api, 'get').mockImplementation((path, config) => {
    const promise = get(path, config); reads.push({path, promise}); return promise;
  });
  for (const [method, request] of [['patch', patch], ['post', post]]) {
    jest.spyOn(api, method).mockImplementation((path, body, config) => {
      const promise = request(path, body, config), write = {method, path, body, config, promise};
      writes.push(write);
      promise.then(response => { write.response = response; }, error => { write.error = error; });
      return promise;
    });
  }
  jest.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  jest.useFakeTimers();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  holdClients = false;
  await act(async () => { clientGate.resolve(); startGate.resolve(); root.unmount();
    await Promise.allSettled([...reads, ...writes].map(request => request.promise)); });
  host.remove(); api.defaults.adapter = originalAdapter;
  jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks();
  clearPendingCommands(); sessionStorage.clear(); localStorage.clear();
});

test('a same-owner native metadata-save to Start chain accepts its delayed receipt through the real portfolio Org refresh and Layout boundary', async () => {
  await openReview();
  const actor = mockAuth.user, next = await beginStart();
  expect(mockAuth.user).toBe(actor);
  await deliverStart(next);
  // The real Axios settlement guard is observed, so a swallowed reload error or
  // a success toast alone cannot make this continuity regression pass.
  expect(next.error).toBeUndefined();
  expect(next.response.data).toMatchObject({review_id: review.review_id, client_id: CID, status: 'in_progress'});
  expect(toast.success).toHaveBeenCalledWith('Review started');
  expect(toast.error.mock.calls.some(([message]) => /assessment context|ended workspace|owner changed/i.test(message))).toBe(false);
  await finishRefresh();
  expect(org.loading).toBe(false); expect(org.currentClientId).toBe(CID);
  expect(query('field-notes').value).toBe('SYNTHETIC native metadata retained through background Org refresh');
  expect(button('Retry unconfirmed save')).toBeUndefined();
  await expectOneNativeStart();
});

test('a genuine role revocation still refuses a delayed native Start receipt and retains the original Review metadata', async () => {
  await openReview();
  const next = await beginStart();
  mockAuth = {...mockAuth, user: {...mockAuth.user, role: 'client_viewer', client_ids: [CID]}};
  await render();
  await deliverStart(next);
  expect(next.response).toBeUndefined();
  expect(next.error?.message).toMatch(/assessment context|ended workspace|owner changed/i);
  expect(toast.success).not.toHaveBeenCalledWith('Review started');
  await finishRefresh();
  expect(query('field-notes').value).toBe('SYNTHETIC native metadata retained through background Org refresh');
  expect(query('field-notes').disabled).toBe(true);
  await expectOneNativeStart();
});
