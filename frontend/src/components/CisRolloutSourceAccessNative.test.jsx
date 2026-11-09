import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import {buildLegacyDemoStore, saveStore} from '../preview/store';

let mockAuth, mockOrg;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: true, API: '/api',
  default: require('axios').default.create({adapter: require('../preview/adapter').previewAdapter}),
  formatError: error => error.response?.data?.detail || error.message}));
jest.mock('sonner', () => ({toast: {error: jest.fn(), success: jest.fn()}}));
// Real drawer, guide, dialogs, native Preview routes and current eligibility.
// The isolated legacy Demo builder is test input, not bundled-fresh qualification.

const clientId = 'demo_brawndo';
let root, host, record, originalRecord, task, finding, base, getSpy, putSpy, patchSpy, postSpy, deleteSpy, currentCase;
const surfaces = () => [...document.querySelectorAll('[data-testid="brawndo-cis-assessment"]')];
const ticket = () => document.querySelector('[data-testid="remediation-ticket-drawer"]');
const button = (scope, label) => [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === label);
const orderedPaths = aid => ['/framework_assessments/' + aid + '/related', '/clients/' + clientId + '/members',
  '/contacts', '/comments', '/framework_assessments/' + aid + '/activity', '/frameworks/cis-ig1'];
const writes = () => [putSpy, patchSpy, postSpy, deleteSpy];

function ensureActive(owner) {
  // Jest cannot cancel a timed-out promise; never let it use the next case's globals.
  if (!owner.active || currentCase !== owner) throw new Error('Native source-access case has ended');
}
async function nativeAction(owner, action) {
  ensureActive(owner);
  const spies = [getSpy, ...writes()];
  const offsets = spies.map(spy => spy.mock.results.length);
  await act(async () => { ensureActive(owner); return action(); });
  ensureActive(owner);
  while (true) {
    ensureActive(owner);
    const pending = spies.flatMap((spy, index) => {
      const results = spy.mock.results.slice(offsets[index]);
      offsets[index] = spy.mock.results.length;
      return results.map(result => result.value);
    });
    if (!pending.length) break;
    await act(async () => { await Promise.allSettled(pending); });
    ensureActive(owner);
  }
}
async function click(owner, scope, label) {
  ensureActive(owner);
  const target = button(scope, label);
  expect(target).toBeTruthy();
  expect(target.disabled).toBe(false);
  await nativeAction(owner, () => target.click());
  ensureActive(owner);
}
async function edit(owner, node, value) {
  ensureActive(owner);
  expect(node.disabled).toBe(false);
  await nativeAction(owner, () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', {bubbles: true}));
  });
  ensureActive(owner);
}
async function render(owner, props = {}) {
  ensureActive(owner);
  await nativeAction(owner, () => root.render(<MemoryRouter><FrameworkDrawer open visualReference
    record={record} clientId={clientId} onOpenChange={() => {}} {...props}/></MemoryRouter>));
  ensureActive(owner);
}
async function snapshot(owner) {
  ensureActive(owner);
  const paths = [base, base + '/guided-assessment', base + '/guided-assessment/history', base + '/related',
    '/tasks/' + task.task_id, '/findings/' + finding.finding_id];
  const records = await Promise.all(paths.map(path => api.get(path).then(response => response.data)));
  ensureActive(owner);
  return records;
}
function expectNoWrites(owner) {
  ensureActive(owner);
  for (const spy of writes()) expect(spy).not.toHaveBeenCalled();
}
async function openSource(owner) {
  ensureActive(owner);
  await render(owner);
  ensureActive(owner);
  const outer = surfaces()[0];
  const findings = [...outer.querySelectorAll('[role="tab"]')].find(node => node.textContent.startsWith('Findings'));
  expect(findings).toBeTruthy();
  await nativeAction(owner, () => findings.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0})));
  ensureActive(owner);
  const opener = outer.querySelector('[data-ticket-id="finding:' + finding.finding_id + '"] button');
  expect(opener).toBeTruthy();
  await nativeAction(owner, () => opener.click());
  ensureActive(owner);
  expect(ticket()).toBeTruthy();
  const before = surfaces();
  const firstRead = getSpy.mock.calls.length;
  await click(owner, ticket(), 'CIS Controls v8.1 Assessment → Safeguard 1.1');
  ensureActive(owner);
  const added = surfaces().filter(node => !before.includes(node));
  expect(added).toHaveLength(1);
  return {outer, source: added[0], firstRead};
}

beforeAll(() => Object.defineProperty(global, 'crypto', {configurable: true, value: require('crypto').webcrypto}));
beforeEach(async () => {
  const owner = currentCase = {active: true, root: null, host: null};
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  localStorage.clear();
  saveStore(buildLegacyDemoStore(), {resetFiles: true});
  const user = (await api.post('/demo/enter')).data.user;
  ensureActive(owner);
  mockAuth = {user, workspaceMode: 'demo', loading: false, error: null};
  const clients = (await api.get('/clients')).data;
  ensureActive(owner);
  mockOrg = {currentClientId: clientId, currentClient: clients.find(row => row.client_id === clientId),
    clients, loading: false, error: null};
  sessionStorage.setItem('grc_client_id', clientId);
  window.history.replaceState({}, '', '/compliance/cis-ig1?client_id=' + clientId);
  const taskRows = (await api.get('/tasks', {params: {client_id: clientId}})).data;
  ensureActive(owner);
  task = taskRows
    .find(row => row.task_id === 'demo_brawndo_cis_action_1.1');
  expect(task).toBeTruthy();
  const sourceFinding = (await api.get('/findings/' + task.finding_id)).data;
  ensureActive(owner);
  finding = sourceFinding;
  base = '/framework_assessments/' + finding.framework_assessment_id;
  const sourceRecord = (await api.get(base)).data;
  ensureActive(owner);
  record = sourceRecord;
  originalRecord = {...record};
  getSpy = jest.spyOn(api, 'get');
  putSpy = jest.spyOn(api, 'put');
  patchSpy = jest.spyOn(api, 'patch');
  postSpy = jest.spyOn(api, 'post');
  deleteSpy = jest.spyOn(api, 'delete');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  owner.root = root;
  owner.host = host;
});
afterEach(async () => {
  const owner = currentCase;
  owner.active = false;
  if (owner.root) await act(async () => owner.root.unmount());
  owner.host?.remove();
  if (currentCase === owner) jest.restoreAllMocks();
});

test('current rollout indirect ticket source uses all six native reads, current identity and client-first context without writes', async () => {
  const owner = currentCase;
  const before = await snapshot(owner); ensureActive(owner);
  const {source, firstRead} = await openSource(owner); ensureActive(owner);
  expect(source.classList.contains('brawndo-assessment-pilot')).toBe(true);
  const paths = orderedPaths(record.framework_assessment_id);
  const contextReads = getSpy.mock.calls.slice(firstRead).filter(([path]) => paths.includes(path));
  expect(contextReads.map(([path]) => path)).toEqual(paths);
  expect(contextReads.every(([, config]) => config.signal === contextReads[0][1].signal)).toBe(true);
  expect(contextReads[0][1].signal.aborted).toBe(false);
  expect(source.querySelector('[aria-label="Current implementation"]').value).toBe(record.implementation);
  expect(source.querySelector('[aria-label="Saved implementation status"]').textContent).toBe(surfaces()[0].querySelector('[aria-label="Saved implementation status"]').textContent);
  expect(source.querySelector('[aria-label="Saved verification"]').textContent).toBe(surfaces()[0].querySelector('[aria-label="Saved verification"]').textContent);
  expect(source.querySelector('[aria-label$="location"] li').textContent).toBe(mockOrg.currentClient.name);
  expect(await snapshot(owner)).toEqual(before); ensureActive(owner);
  expectNoWrites(owner);
});

test('current rollout indirect source Cancel retains its exact dirty draft and Discard leaves all native saved records unchanged', async () => {
  const owner = currentCase;
  const before = await snapshot(owner); ensureActive(owner);
  const {source} = await openSource(owner); ensureActive(owner);
  const draft = 'Current rollout synthetic unsaved source wording.';
  await edit(owner, source.querySelector('[aria-label="Current implementation"]'), draft); ensureActive(owner);
  await click(owner, source, 'Close'); ensureActive(owner);
  // Indirect rollout uses the native labels; only the direct reference pilot changes them.
  expect(document.body.textContent).toContain('Leave unsaved changes?');
  await click(owner, document.body, 'Keep editing'); ensureActive(owner);
  expect(source.isConnected).toBe(true);
  expect(source.querySelector('[aria-label="Current implementation"]').value).toBe(draft);
  expect(await snapshot(owner)).toEqual(before); ensureActive(owner);
  expectNoWrites(owner);
  await click(owner, source, 'Close'); ensureActive(owner);
  await click(owner, document.body, 'Discard changes'); ensureActive(owner);
  expect(source.isConnected).toBe(false);
  expect(ticket()).toBeTruthy();
  expect(await snapshot(owner)).toEqual(before); ensureActive(owner);
  expectNoWrites(owner);
});

test('current rollout cannot reuse settled context for an absent identity and preserves the unsaved draft when the original identity returns', async () => {
  const owner = currentCase;
  const before = await snapshot(owner); ensureActive(owner);
  await render(owner, {visualReference: false}); ensureActive(owner);
  const draft = 'Unsaved native wording survives unavailable context without a write.';
  await edit(owner, surfaces()[0].querySelector('[aria-label="Current implementation"]'), draft); ensureActive(owner);
  const relatedRequest = getSpy.mock.calls.find(([path, config]) => path === base + '/related' && config?.signal);
  expect(relatedRequest).toBeTruthy();
  const firstContext = relatedRequest[1].signal;
  record = {...originalRecord, framework_assessment_id: originalRecord.framework_assessment_id + '-absent'};
  await render(owner, {visualReference: false}); ensureActive(owner);
  expect(firstContext.aborted).toBe(true);
  let source = surfaces()[0];
  expect(source.classList.contains('brawndo-assessment-pilot')).toBe(false);
  expect(source.querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
  expect(button(source, 'Save assessment').disabled).toBe(true);
  const unavailableGuide = source.querySelector('[aria-label="CIS assessment interview"]');
  expect(!unavailableGuide || unavailableGuide.hidden).toBe(true);
  record = originalRecord;
  await render(owner, {visualReference: false}); ensureActive(owner);
  source = surfaces()[0];
  expect(source.classList.contains('brawndo-assessment-pilot')).toBe(true);
  expect(source.querySelector('[aria-label="Current implementation"]').disabled).toBe(false);
  expect(source.querySelector('[aria-label="Current implementation"]').value).toBe(draft);
  expect(await snapshot(owner)).toEqual(before); ensureActive(owner);
  expectNoWrites(owner);
});

test('a real foreign native assessment ID cannot acquire rollout context from the selected client workspace', async () => {
  const owner = currentCase;
  const before = await snapshot(owner); ensureActive(owner);
  const foreignRow = (await api.get('/frameworks/cis-ig1', {params: {client_id: 'demo_initech'}})).data
    .assessments.find(row => row.definition_id === '1.1');
  ensureActive(owner);
  const foreign = (await api.get('/framework_assessments/' + foreignRow.framework_assessment_id)).data;
  ensureActive(owner);
  expect(foreign.client_id).toBe('demo_initech');
  // Synthetic stale caller identity; all response data still comes from the real adapter.
  record = {...foreign, client_id: clientId};
  await render(owner, {visualReference: false}); ensureActive(owner);
  const source = surfaces()[0];
  expect(source.classList.contains('brawndo-assessment-pilot')).toBe(false);
  expect(source.querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
  expect(button(source, 'Save assessment').disabled).toBe(true);
  const unavailableGuide = source.querySelector('[aria-label="CIS assessment interview"]');
  expect(!unavailableGuide || unavailableGuide.hidden).toBe(true);
  expect(await snapshot(owner)).toEqual(before); ensureActive(owner);
  const foreignAfter = (await api.get('/framework_assessments/' + foreign.framework_assessment_id)).data;
  ensureActive(owner);
  expect(foreignAfter).toEqual(foreign);
  expectNoWrites(owner);
});
