// Real router, contexts, workspace, assessment menu, native guard and management sheet.
// Only current authentication and API transport are controlled. This is not server authorization proof.
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {MemoryRouter, Route, Routes, useLocation, useNavigate} from 'react-router-dom';
import {OrgProvider, useOrg} from '@/context/OrgContext';
import {ComplianceProvider} from '@/context/ComplianceContext';
import ComplianceWorkspace from './ComplianceWorkspace';
import Layout from '@/components/Layout';
import {cisClient, cisWorkspace} from '@/testUtils/cisExperience';
import {generateResult, validateGuidedCompletion, versionForSafeguard} from '@/lib/guidedAssessment';
import {clearPendingCommands, syncPendingCommandIdentity} from '@/lib/createIntent';
import api from '@/lib/api';

let mockAuth;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: false, API: '/api',
  default: {get: jest.fn(), patch: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn()},
  formatError: error => error.message}));

const CLIENT = 'synthetic-management-a', OTHER = 'synthetic-management-b', ACTOR = 'synthetic-management-owner';
const copy = value => JSON.parse(JSON.stringify(value));
const baseUrl = clientId => '/compliance/cis-ig1?client_id=' + clientId;
let root, host, clients, sources, currentLocation, navigate, org, before, unexpectedReads;

function Probe() {
  currentLocation = useLocation();
  navigate = useNavigate();
  org = useOrg();
  return <output data-testid="current-router-client">{org.currentClientId}</output>;
}

function App() {
  return <MemoryRouter initialEntries={[baseUrl(CLIENT)]}><OrgProvider><ComplianceProvider>
    <Routes><Route path="/compliance/:requirementKey" element={<ComplianceWorkspace/>}/></Routes>
    <Probe/>
  </ComplianceProvider></OrgProvider></MemoryRouter>;
}

// Settle only actual API promises dispatched by the native effects. No sleeps, retries or extra reads.
async function action(perform) {
  let next = api.get.mock.results.length;
  await act(async () => { perform(); });
  while (next < api.get.mock.results.length) {
    const issued = api.get.mock.results.slice(next).map(result => result.value);
    next = api.get.mock.results.length;
    await act(async () => { await Promise.allSettled(issued); });
  }
}

const assessment = () => document.querySelector('[data-testid="brawndo-cis-assessment"]');
const management = () => document.querySelector('[data-testid="framework-record-management"]');
const button = (scope, text) => [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === text);
async function click(target) {
  expect(target).toBeTruthy();
  expect(target.disabled).toBe(false);
  await action(() => target.click());
}

async function openFirst() {
  const target = [...host.querySelectorAll('button')].find(node => node.textContent.trim().startsWith('Continue: 1.1 '));
  await click(target);
  expect(currentLocation.pathname).toBe('/compliance/cis-ig1');
  expect(new URLSearchParams(currentLocation.search).get('assessment')).toBe(CLIENT + ':1.1');
  expect(assessment()).not.toBeNull();
}

async function chooseManagement() {
  const trigger = button(assessment(), 'Assessment details');
  expect(trigger).toBeTruthy();
  await action(() => trigger.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: 'ArrowDown'})));
  const menu = document.querySelector('[role="menu"]');
  expect(menu).not.toBeNull();
  const item = [...menu.querySelectorAll('[role="menuitem"]')]
    .find(node => node.textContent.trim() === 'Ownership & assessment history');
  expect(item).toBeTruthy();
  expect(item.hasAttribute('data-disabled')).toBe(false);
  await action(() => item.click());
}

function assertManager(clientId, definitionId) {
  const sheet = management();
  expect(sheet).not.toBeNull();
  expect(assessment()).toBeNull();
  const definition = sources[clientId].definitions.find(row => row.id === definitionId);
  expect(sheet.querySelector('h2').textContent).toBe(definition.id + ' · ' + definition.title);
  const link = sheet.querySelector('a[href^="/reviews?"]');
  expect(link).not.toBeNull();
  const query = new URL(link.href).searchParams;
  expect(query.get('client_id')).toBe(clientId);
  expect(query.get('framework_assessment')).toBe(clientId + ':' + definitionId);
  expect(new URLSearchParams(currentLocation.search).get('client_id')).toBe(clientId);
  expect(new URLSearchParams(currentLocation.search).has('assessment')).toBe(false);
  return sheet;
}

function assertNoBusinessWrites() {
  expect(unexpectedReads).toEqual([]);
  for (const method of ['patch', 'post', 'put', 'delete']) expect(api[method]).not.toHaveBeenCalled();
  expect(JSON.stringify(sources)).toBe(before);
  expect(sources[CLIENT].assessments.every(row => row.assessment_history.length === 0)).toBe(true);
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear(); clearPendingCommands();
  mockAuth = {user: {user_id: ACTOR, name: 'Synthetic management owner', role: 'platform_admin',
    status: 'active', client_ids: [CLIENT, OTHER], all_clients: false}, workspaceMode: 'standard', loading: false, error: ''};
  syncPendingCommandIdentity(ACTOR, 'standard');
  // A different remembered client must not replace the explicit router identity.
  localStorage.setItem('grc_client_id', OTHER);
  window.history.replaceState({}, '', baseUrl(CLIENT));
  clients = [cisClient(CLIENT, 1), cisClient(OTHER, 1)].map((client, index) => ({...client,
    name: 'SYNTHETIC management client ' + (index ? 'B' : 'A')}));
  sources = Object.fromEntries(clients.map(client => {
    const source = cisWorkspace(client.client_id, 1);
    source.assessments = source.assessments.map(row => ({...row, owner_id: ACTOR,
      verification: 'not_verified', implementation: '', technology: '', notes: '', na_rationale: '',
      last_saved: '2026-11-01T12:00:00+00:00', assessment_history: []}));
    source.work = {};
    return [client.client_id, source];
  }));
  before = JSON.stringify(sources); unexpectedReads = [];
  for (const method of ['get', 'patch', 'post', 'put', 'delete']) api[method].mockReset();
  for (const method of ['patch', 'post', 'put', 'delete']) {
    api[method].mockImplementation(async () => { throw new Error('Unexpected business write in read-only management regression'); });
  }
  api.get.mockImplementation(async (path, options = {}) => {
    const clientId = options.params?.client_id;
    if (path === '/clients') return {data: copy(clients)};
    if (path === '/onboarding/baseline') return {data: {state: {completed: true}}};
    if (path === '/requirements') return {data: [{client_id: clientId, baseline_key: 'cis-ig1', baseline_response: 'applies'}]};
    if (path === '/frameworks/cis-ig1') {
      if (!sources[clientId]) throw new Error('Unexpected framework tenant');
      return {data: copy(sources[clientId])};
    }
    if (clients.some(client => path === '/clients/' + client.client_id + '/members')) return {data: [copy(mockAuth.user)]};
    if (path === '/contacts' || path === '/comments') return {data: []};
    const match = /^\/framework_assessments\/([^/]+)\/(.+)$/.exec(path);
    if (match) {
      const record = Object.values(sources).flatMap(source => source.assessments)
        .find(row => row.framework_assessment_id === match[1]);
      if (!record) throw new Error('Unexpected assessment identity');
      if (match[2] === 'related') return {data: {reviews: [], evidence: [], findings: [], tasks: [], risks: [], policies: []}};
      if (match[2] === 'activity') return {data: []};
      if (match[2] === 'service-context') return {data: {client_id: record.client_id,
        expected_client_updated_at: 'synthetic-client-A', selected_activity_id: null,
        catalog: [], services: {areas: {}, custom_tools: []}, candidates: []}};
      if (match[2] === 'guided-assessment/history') return {data: {items: [], next_before_revision: null}};
      if (match[2] === 'guided-assessment') return {data: {client_id: record.client_id,
        assessment_id: record.framework_assessment_id, user_id: ACTOR,
        version: versionForSafeguard(record.definition_id, true), revision: 0, answers: {}, step: 0,
        completed: false, narrative: '', result: null, base_assessment_token: null, base_scope_fingerprint: null,
        current_assessment_token: record.last_saved, current_scope_fingerprint: 'a'.repeat(64),
        lineage_known: true, lineage_stale: false}};
    }
    unexpectedReads.push(path);
    throw new Error('Unexpected native read: ' + path);
  });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); clearPendingCommands(); jest.clearAllMocks();
});

test('the real outer route retains the exact management sheet after Continue and Ownership', async () => {
  await action(() => root.render(<App/>));
  expect(org.currentClientId).toBe(CLIENT);
  await openFirst();
  const assessmentKey = currentLocation.key;
  await chooseManagement();
  assertManager(CLIENT, '1.1');
  expect(currentLocation.key).not.toBe(assessmentKey);
  await click(button(management(), 'Close'));
  expect(management()).toBeNull();
  expect(assessment()).toBeNull();
  expect(currentLocation.pathname + currentLocation.search).toBe(baseUrl(CLIENT));
  assertNoBusinessWrites();
});

test('native Next replaces the assessment history entry and management keeps its exact record', async () => {
  await action(() => root.render(<App/>));
  await openFirst();
  await click(button(assessment(), 'Next'));
  expect(new URLSearchParams(currentLocation.search).get('assessment')).toBe(CLIENT + ':1.2');
  await chooseManagement();
  assertManager(CLIENT, '1.2');
  await click(button(management(), 'Close'));
  await action(() => navigate(1));
  expect(new URLSearchParams(currentLocation.search).get('assessment')).toBe(CLIENT + ':1.2');
  expect(assessment()).not.toBeNull();
  await action(() => navigate(-1));
  expect(new URLSearchParams(currentLocation.search).has('assessment')).toBe(false);
  expect(assessment()).toBeNull();
  assertNoBusinessWrites();
});

test('a current read-only role cannot retain editable management controls', async () => {
  await action(() => root.render(<App/>));
  await openFirst(); await chooseManagement(); assertManager(CLIENT, '1.1');
  mockAuth = {...mockAuth, user: {...mockAuth.user, role: 'client_readonly'}};
  await action(() => root.render(<App/>));
  const sheet = assertManager(CLIENT, '1.1');
  expect(sheet.querySelector('fieldset').disabled).toBe(true);
  expect(button(sheet, 'Save owner').disabled).toBe(true);
  assertNoBusinessWrites();
});

test('a different explicit authorized client withdraws the prior management record', async () => {
  await action(() => root.render(<App/>));
  await openFirst(); await chooseManagement(); const prior = assertManager(CLIENT, '1.1');
  await action(() => navigate(baseUrl(OTHER)));
  expect(org.currentClientId).toBe(OTHER);
  expect(prior.isConnected).toBe(false);
  expect(management()).toBeNull();
  expect(assessment()).toBeNull();
  expect(new URLSearchParams(currentLocation.search).get('client_id')).toBe(OTHER);
  expect(api.get.mock.calls.some(([path, options]) => path === '/frameworks/cis-ig1' && options.params.client_id === OTHER)).toBe(true);
  assertNoBusinessWrites();
});

// Exercise the real inactive-tab rule that Jest's CSS-module mock otherwise omits.
function installNativeTabStyles() {
  const style = document.createElement('style');
  style.dataset.interviewHistoryNativeTabs = 'true';
  const css = readFileSync(resolve(__dirname, '../components/AssessmentLayout.css'), 'utf8');
  const rules = css.match(/\.assessment-layout\s*>\s*\[role=tabpanel\]\[data-state=inactive\]\s*\{[^{}]*\}/g) || [];
  expect(rules).toHaveLength(1);
  expect(rules[0]).toBe('.assessment-layout > [role=tabpanel][data-state=inactive] { display:none; }');
  style.textContent = rules[0];
  document.head.appendChild(style);
}
afterEach(() => document.head.querySelectorAll('style[data-interview-history-native-tabs]').forEach(style => style.remove()));

const retainedInterviewNarrative = 'SYNTHETIC retained assessment — München Ω 🔍';
const retainedInterviewAnswers = {
  inventory: 'Not sure', existing: 'SYNTHETIC records require confirmation.',
  additional_gap: 'No', additional_confirmation: 'Yes',
  unknowns: 'SYNTHETIC owner confirmation — München Ω.',
};

// Read-only retained DTO fixtures, not a claim that this test executed native Save.
function retainedInterview() {
  const record = sources[CLIENT].assessments.find(row => row.definition_id === '1.1');
  record.implementation = retainedInterviewNarrative;
  sources[CLIENT].work[record.framework_assessment_id] = {
    context_complete: true, evidence_count: 0, finding_ids: [], review_ids: [], task_ids: [],
    open_findings: 0, open_actions: 0, overdue_reviews: 0, overdue_actions: 0, priority_records: [],
  };
  before = JSON.stringify(sources);
  const version = versionForSafeguard('1.1', true);
  validateGuidedCompletion('1.1', retainedInterviewAnswers, version);
  const result = generateResult('1.1', retainedInterviewAnswers, new Date('2026-10-31T12:01:00Z'), version);
  expect(result.status).toBe('not_assessed');
  return {
    client_id: CLIENT, assessment_id: record.framework_assessment_id, user_id: ACTOR,
    version, revision: 2, answers: copy(retainedInterviewAnswers), step: 0,
    completed: true, narrative: retainedInterviewNarrative, result,
    generated_at: '2026-10-31T12:01:00Z',
    base_assessment_token: '2026-10-31T12:00:00Z', current_assessment_token: record.last_saved,
    base_scope_fingerprint: 'a'.repeat(64), current_scope_fingerprint: 'a'.repeat(64),
    lineage_known: true, lineage_stale: true,
  };
}

function archivedInterview(draft) {
  return {client_id: draft.client_id, assessment_id: draft.assessment_id, user_id: draft.user_id,
    revision: 1, version: draft.version, completed: true, updated_at: draft.generated_at,
    narrative: draft.narrative, answers: copy(draft.answers), result: copy(draft.result)};
}

function holdInterviewHistory(draft) {
  const nativeRead = api.get.getMockImplementation();
  const path = '/framework_assessments/' + draft.assessment_id + '/guided-assessment';
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  api.get.mockImplementation((url, options) => {
    if (url === path) return Promise.resolve({data: copy(draft)});
    if (url === path + '/history') return promise;
    return nativeRead(url, options);
  });
  return {path: path + '/history', promise, resolve};
}

async function selectAssessmentSection(name) {
  const tab = [...assessment().querySelectorAll('[role="tab"]')]
    .find(node => node.textContent.trim().startsWith(name));
  expect(tab).toBeTruthy();
  await act(async () => tab.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0, ctrlKey: false})));
  expect(tab.getAttribute('aria-selected')).toBe('true');
}

const interviewHistory = () => document.querySelector('.brawndo-pilot-history[role="dialog"]');
async function openInterviewHistory() {
  const trigger = button(assessment(), 'Assessment details');
  await action(() => trigger.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: 'ArrowDown'})));
  const item = [...document.querySelectorAll('[role="menuitem"]')]
    .find(node => node.textContent.trim() === 'Interview history');
  expect(item).toBeTruthy();expect(item.hasAttribute('data-disabled')).toBe(false);
  // The deliberately pending history request must not be awaited by action().
  await act(async () => item.click());
}
async function settleNativeFocusLifecycle() {
  // The established Radix focus lifecycle can finish after the opening click.
  await act(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
function expectVisibleInterviewHistory(dialog) {
  expect(interviewHistory()).toBe(dialog);
  expect(dialog.getAttribute('data-state')).toBe('open');
  expect(getComputedStyle(dialog).display).not.toBe('none');
  expect(dialog.closest('[hidden],[inert],[aria-hidden="true"]')).toBeNull();
  expect(dialog.contains(document.activeElement)).toBe(true);
}

test.each([
  ['Assessment', 'empty'], ['Items to address', 'empty'], ['Items to address', 'populated'],
])('Interview history opened from %s remains available after its %s read and menu teardown without input', async (section, shape) => {
  installNativeTabStyles();
  const draft = retainedInterview(), request = holdInterviewHistory(draft);
  await action(() => root.render(<App/>));await openFirst();
  await selectAssessmentSection(section);
  const parent = assessment(), field = parent.querySelector('[aria-label="Current implementation"]');
  const implementationPanel = field.closest('[role="tabpanel"]');
  expect(implementationPanel.getAttribute('data-state')).toBe(section === 'Items to address' ? 'inactive' : 'active');
  if (section === 'Items to address') expect(getComputedStyle(implementationPanel).display).toBe('none');
  else expect(getComputedStyle(implementationPanel).display).not.toBe('none');
  expect(field.value).toBe(retainedInterviewNarrative);
  await openInterviewHistory();
  const dialog = interviewHistory();expect(dialog).not.toBeNull();
  expect(parent.contains(dialog)).toBe(true);
  expect(implementationPanel.contains(dialog)).toBe(false);
  expect(dialog.querySelector('[role="status"]').textContent).toBe('Loading interview history…');
  // No further input: retain the same dialog through menu/focus cleanup and the native read.
  await settleNativeFocusLifecycle();expectVisibleInterviewHistory(dialog);
  const archived = archivedInterview(draft);
  await act(async () => {
    request.resolve({data: {items: shape === 'populated' ? [archived] : [], has_more: false, next_before_revision: null}});
    await request.promise;
  });
  await settleNativeFocusLifecycle();expectVisibleInterviewHistory(dialog);
  expect(api.get.mock.calls.filter(([path]) => path === request.path))
    .toEqual([[request.path, {params: {limit: 25}}]]);
  if (shape === 'populated') {
    expect(dialog.textContent).toContain(retainedInterviewNarrative);
    expect(dialog.querySelector('pre').textContent).toBe(JSON.stringify(retainedInterviewAnswers, null, 2));
  } else {
    expect(dialog.textContent).toContain('No available archived interview snapshots.');
  }
  expect(assessment()).toBe(parent);expect(field.value).toBe(retainedInterviewNarrative);
  expect(new URLSearchParams(currentLocation.search).get('assessment')).toBe(CLIENT + ':1.1');
  assertNoBusinessWrites();
  await click(button(dialog, 'Close'));await settleNativeFocusLifecycle();
  expect(interviewHistory()).toBeNull();expect(assessment()).toBe(parent);
  expect(parent.querySelector('[role="tab"][aria-selected="true"]').textContent).toContain(section);
  expect(document.activeElement).toBe(button(parent, 'Assessment details'));
  assertNoBusinessWrites();
});

test('an actual client-route change withdraws pending Interview history and its late response cannot reopen or disclose it', async () => {
  installNativeTabStyles();
  const draft = retainedInterview(), request = holdInterviewHistory(draft);
  await action(() => root.render(<App/>));await openFirst();
  await selectAssessmentSection('Items to address');await openInterviewHistory();
  const dialog = interviewHistory();expect(dialog).not.toBeNull();
  await action(() => navigate(baseUrl(OTHER)));
  expect(org.currentClientId).toBe(OTHER);expect(dialog.isConnected).toBe(false);
  await act(async () => {
    request.resolve({data: {items: [archivedInterview(draft)], has_more: false, next_before_revision: null}});
    await request.promise;
  });
  await settleNativeFocusLifecycle();
  expect(interviewHistory()).toBeNull();expect(assessment()).toBeNull();
  expect(document.body.textContent).not.toContain(retainedInterviewNarrative);
  expect(new URLSearchParams(currentLocation.search).get('client_id')).toBe(OTHER);
  assertNoBusinessWrites();
});

// Include the native Layout and its availability provider for a real background client refresh.
function RefreshApp() {
  return <MemoryRouter initialEntries={[baseUrl(CLIENT)]}><OrgProvider>
    <Routes><Route element={<Layout/>}>
      <Route path="/compliance/:requirementKey" element={<ComplianceWorkspace/>}/>
    </Route></Routes>
    <Probe/>
  </OrgProvider></MemoryRouter>;
}

test('Items Interview history survives an actual focus-triggered same-client refresh without exposing unavailable controls', async () => {
  installNativeTabStyles();
  const draft = retainedInterview(), historyRead = holdInterviewHistory(draft);
  const nativeRead = api.get.getMockImplementation();
  let holdClients = false, refreshReads = 0, releaseClients, markDispatched;
  const clientResponse = new Promise(resolve => { releaseClients = resolve; });
  const clientDispatched = new Promise(resolve => { markDispatched = resolve; });
  const originalClients = JSON.stringify(clients);
  api.get.mockImplementation((path, options = {}) => {
    if (path === '/clients' && holdClients) {
      refreshReads++;
      expect(options).toEqual({params: {include_archived: true}});
      markDispatched();
      return clientResponse;
    }
    // Real shell read-only consumers remain mounted; their empty fixture populations are explicit.
    if (path === '/notifications') return Promise.resolve({data: {items: [], unread: 0}});
    if (options.params?.client_id === CLIENT) {
      if (path === '/dashboard') return Promise.resolve({data: {client_id: CLIENT, kpis: {}, posture: {}}});
      if (path === '/findings' || path === '/tasks') return Promise.resolve({data: []});
    }
    if (path === '/clients/' + CLIENT + '/iv-setup')
      return Promise.resolve({data: {client_id: CLIENT, activities: [], outstanding_count: 0}});
    return nativeRead(path, options);
  });
  await action(() => root.render(<RefreshApp/>));await openFirst();
  await selectAssessmentSection('Items to address');await openInterviewHistory();
  await act(async () => {
    historyRead.resolve({data: {items: [], has_more: false, next_before_revision: null}});
    await historyRead.promise;
  });
  await settleNativeFocusLifecycle();
  const parent = assessment(), dialog = interviewHistory();
  expect(dialog).not.toBeNull();expectVisibleInterviewHistory(dialog);
  expect(dialog.textContent).toContain('No available archived interview snapshots.');
  const locationBefore = currentLocation.pathname + currentLocation.search;
  const joinedPath = '/framework_assessments/' + draft.assessment_id + '/related';
  const joinedBefore = api.get.mock.calls.filter(([path]) => path === joinedPath).length;
  const body = document.querySelector('[data-client-workspace-body]');
  expect(body.hidden).toBe(false);assertNoBusinessWrites();

  holdClients = true;
  // Await the actual native zero-delay refresh dispatch, not an invented sleep or extra HTTP call.
  await act(async () => { window.dispatchEvent(new Event('focus')); await clientDispatched; });
  expect(refreshReads).toBe(1);expect(org.loading).toBe(true);
  expect(org.currentClientId).toBe(CLIENT);expect(org.currentClient.client_id).toBe(CLIENT);
  expect(body.hidden).toBe(true);expect(body.hasAttribute('inert')).toBe(true);
  expect(parent.isConnected).toBe(true);expect(parent.hidden).toBe(true);
  for (const surface of document.querySelectorAll('.ui-dialog,.ui-overlay')) {
    expect(surface.hidden).toBe(true);expect(surface.hasAttribute('inert')).toBe(true);
  }
  assertNoBusinessWrites();

  await action(() => releaseClients({data: copy(clients)}));
  await settleNativeFocusLifecycle();
  expect(refreshReads).toBe(1);expect(org.loading).toBe(false);
  expect(org.currentClientId).toBe(CLIENT);expect(org.currentClient.client_id).toBe(CLIENT);
  expect(JSON.stringify(clients)).toBe(originalClients);
  expect(body.hidden).toBe(false);expect(body.hasAttribute('inert')).toBe(false);
  expect(assessment()).toBe(parent);expect(parent.hidden).toBe(false);
  expect(parent.querySelector('[aria-label="Current implementation"]').value).toBe(retainedInterviewNarrative);
  expect(parent.querySelector('[role="tab"][aria-selected="true"]').textContent).toContain('Items to address');
  expect(currentLocation.pathname + currentLocation.search).toBe(locationBefore);
  expect(api.get.mock.calls.filter(([path]) => path === joinedPath).length).toBeGreaterThan(joinedBefore);
  // Live eligibility may legitimately unmount a concealed child; restore the exact owner's view, not its old DOM node.
  const restoredHistory = interviewHistory();expect(restoredHistory).not.toBeNull();
  expectVisibleInterviewHistory(restoredHistory);expect(parent.contains(restoredHistory)).toBe(true);
  expect(restoredHistory.querySelector('h2').textContent).toBe('Interview history');
  expect(restoredHistory.textContent).toContain('No available archived interview snapshots.');
  expect(api.get.mock.calls.filter(([path]) => path.endsWith('/guided-assessment/history'))
    .every(([path]) => path === historyRead.path)).toBe(true);
  assertNoBusinessWrites();
});
test('a committed role withdrawal and return cannot resurrect the former owner Interview history intent', async () => {
  installNativeTabStyles();
  const draft = retainedInterview(), request = holdInterviewHistory(draft);
  await action(() => root.render(<App/>));await openFirst();
  await selectAssessmentSection('Items to address');await openInterviewHistory();
  await act(async () => {
    request.resolve({data: {items: [], has_more: false, next_before_revision: null}});
    await request.promise;
  });
  await settleNativeFocusLifecycle();
  const oldDialog = interviewHistory();expect(oldDialog).not.toBeNull();
  expectVisibleInterviewHistory(oldDialog);assertNoBusinessWrites();
  const locationBefore = currentLocation.pathname + currentLocation.search;

  mockAuth = {...mockAuth, user: {...mockAuth.user, role: 'client_readonly'}};
  await action(() => root.render(<App/>));await settleNativeFocusLifecycle();
  expect(org.currentClientId).toBe(CLIENT);expect(org.currentClient.client_id).toBe(CLIENT);
  expect(interviewHistory()).toBeNull();expect(oldDialog.isConnected).toBe(false);
  expect(assessment()).not.toBeNull();
  expect(assessment().querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
  expect(button(assessment(), 'Save assessment')).toBeUndefined();
  expect(currentLocation.pathname + currentLocation.search).toBe(locationBefore);
  assertNoBusinessWrites();

  mockAuth = {...mockAuth, user: {...mockAuth.user, role: 'platform_admin'}};
  await action(() => root.render(<App/>));await settleNativeFocusLifecycle();
  expect(org.currentClientId).toBe(CLIENT);expect(org.currentClient.client_id).toBe(CLIENT);
  expect(interviewHistory()).toBeNull();
  expect(assessment().querySelector('[aria-label="Current implementation"]').value).toBe(retainedInterviewNarrative);
  expect(assessment().querySelector('[aria-label="Current implementation"]').disabled).toBe(false);
  expect(button(assessment(), 'Save assessment').disabled).toBe(false);
  expect(currentLocation.pathname + currentLocation.search).toBe(locationBefore);
  assertNoBusinessWrites();

  await openInterviewHistory();await settleNativeFocusLifecycle();
  const currentDialog = interviewHistory();expect(currentDialog).not.toBeNull();
  expectVisibleInterviewHistory(currentDialog);
  expect(currentDialog.textContent).toContain('No available archived interview snapshots.');
  expect(assessment().contains(currentDialog)).toBe(true);
  expect(api.get.mock.calls.filter(([path]) => path.endsWith('/guided-assessment/history'))
    .every(([path]) => path === request.path)).toBe(true);
  assertNoBusinessWrites();
});
