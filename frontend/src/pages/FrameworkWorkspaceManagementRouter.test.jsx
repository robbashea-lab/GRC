// Real router, contexts, workspace, assessment menu, native guard and management sheet.
// Only current authentication and API transport are controlled. This is not server authorization proof.
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter, Route, Routes, useLocation, useNavigate} from 'react-router-dom';
import {OrgProvider, useOrg} from '@/context/OrgContext';
import {ComplianceProvider} from '@/context/ComplianceContext';
import ComplianceWorkspace from './ComplianceWorkspace';
import {cisClient, cisWorkspace} from '@/testUtils/cisExperience';
import {versionForSafeguard} from '@/lib/guidedAssessment';
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
