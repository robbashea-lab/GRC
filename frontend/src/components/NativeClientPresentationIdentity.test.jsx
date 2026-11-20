import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Route, Routes, useLocation, useNavigate} from 'react-router-dom';
import {OrgProvider, useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import api from '@/lib/api';
import {rememberClient, selectedClient} from '@/lib/clientSelection';
import {cisClient, cisWorkspace} from '@/testUtils/cisExperience';
import {useCisPresentation, useAdditionalSectionsSurface, useAdditionalSectionsPresentation} from '@/lib/brawndoAdditionalScope';
import {useBrawndoFullRecord} from '@/lib/brawndoFullRecord';
import {useBrawndoOnboardingAppearance} from '@/lib/useBrawndoOnboardingAppearance';
import {sharedAppearanceEligible} from '@/lib/sharedExperience';
import {versionForSafeguard} from '@/lib/guidedAssessment';
import FrameworkWorkspace from '@/pages/FrameworkWorkspace';
import GuidedAssessor from './GuidedAssessor';

let mockAuth;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: false,
  default: {get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn()},
  formatError: error => error.message}));

const P = 'synthetic-presentation-primary', G = 'synthetic-presentation-general';
const copy = value => JSON.parse(JSON.stringify(value));
let root, host, org, location, navigate, clients, workspace, guide, freshReady;

function HookChecks({loadedClientId, recordClientId}) {
  const auth = useAuth(), current = useOrg(), route = useLocation();
  const context = {...current, ...auth, pathname: route.pathname,
    selectedClientId: selectedClient(), routeClientId: new URLSearchParams(route.search).get('client_id'),
    authLoading: auth.loading, authError: auth.error, orgLoading: current.loading, orgError: current.error};
  const frame = useCisPresentation(), evidence = useAdditionalSectionsSurface('evidence', loadedClientId);
  const evidenceFrame = useAdditionalSectionsPresentation('evidence');
  const full = useBrawndoFullRecord({client_id: recordClientId}, current.currentClientId);
  const onboarding = useBrawndoOnboardingAppearance({loadedClientId, profileClientId: loadedClientId, handoffClientId: loadedClientId});
  return <output data-testid="appearance">{JSON.stringify({
    common: sharedAppearanceEligible(context), frame, evidence, evidenceFrame, full, onboarding,
  })}</output>;
}

function ClientPage({kind = 'workspace', loadedClientId = P, recordClientId = P}) {
  org = useOrg(); location = useLocation(); navigate = useNavigate();
  return <><output data-testid="resolved-client">{org.currentClientId}</output>
    {org.error ? <p role="alert">{org.error}</p> : org.loading ? <p role="status">Resolving native client</p>
      : org.currentClient && (kind === 'workspace' ? <Routes>
          <Route path="/compliance/cis-ig1" element={<FrameworkWorkspace frameworkKey="cis-ig1" clientId={org.currentClientId}/>}/>
          <Route path="*" element={<HookChecks {...{loadedClientId, recordClientId}}/>}/>
        </Routes>
        : kind === 'guide' ? <GuidedAssessor clientId={org.currentClientId} framework="cis-ig1"
          configuration={{implementation_group: 1}} record={guide.record} current={guide.record} form={guide.record}
          visualReference inline contextComplete onFreshInterviewReady={freshReady}/>
          : <HookChecks {...{loadedClientId, recordClientId}}/>)}
  </>;
}

const view = props => <BrowserRouter><OrgProvider><ClientPage {...props}/></OrgProvider></BrowserRouter>;
async function render(props) { await act(async () => root.render(view(props))); }
const buttons = name => [...host.querySelectorAll('button')].filter(node => node.textContent.trim() === name);
const appearance = () => JSON.parse(host.querySelector('[data-testid="appearance"]').textContent);
function expectNoWrites() {
  for (const method of ['post', 'put', 'patch', 'delete']) expect(api[method]).not.toHaveBeenCalled();
}
function expectR4() {
  expect(org.currentClientId).toBe(P);
  expect(org.currentClient).toEqual(clients[0]);
  expect(new URLSearchParams(location.search).get('client_id')).toBe(P);
  expect(host.querySelector('.brawndo-cis-visual [aria-labelledby="cis-visual-register"]')).not.toBeNull();
  expect(host.querySelector('.now-label').textContent).toBe('Current implementation');
  expect(host.textContent).not.toContain('Controls overview');
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState({}, '', '/compliance/cis-ig1?client_id=' + P);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  mockAuth = {loading: false, error: '', workspaceMode: 'standard',
    user: {user_id: 'synthetic-presentation-operator', role: 'platform_admin', status: 'active',
      all_clients: false, client_ids: [P, G]}};
  const primary = {...cisClient(P), cis_program: {client_id: P, program_id: P + ':cis-ig1',
    framework_key: 'cis-ig1', version: '8.1', selected: true, implementation_group: 1}, shared_programs: []};
  const general = {client_id: G, name: 'Synthetic General', status: 'active', cis_program: null,
    shared_programs: [], onboarding_baseline: {completed: true, requirements: {}}};
  clients = [primary, general]; workspace = cisWorkspace(P);
  const definition = workspace.definitions[0];
  guide = {record: {...workspace.assessments[0], title: definition.title, implementation: '',
    verification: 'not_verified', assessment_history: [], work: {context_complete: true, finding_ids: [],
      review_ids: [], task_ids: [], open_findings: 0, open_actions: 0, overdue_reviews: 0, overdue_actions: 0, priority_records: []}}};
  guide.draft = {client_id: P, assessment_id: guide.record.framework_assessment_id,
    user_id: mockAuth.user.user_id, version: versionForSafeguard(definition.id, true),
    revision: 0, answers: {}, step: 0, completed: false, narrative: '', result: null};
  freshReady = jest.fn();
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) api[method].mockReset();
  api.get.mockImplementation(async (path, config) => {
    if (path === '/clients') {
      expect(config.params).toEqual({include_archived: true});
      return {data: copy(clients)};
    }
    if (path === '/frameworks/cis-ig1') {
      expect(config.params).toEqual({client_id: P});
      expect(config.signal).toBeInstanceOf(AbortSignal);
      return {data: copy(workspace)};
    }
    if (path === '/framework_assessments/' + guide.record.framework_assessment_id + '/guided-assessment') return {data: copy(guide.draft)};
    throw new Error('Unexpected native read ' + path);
  });
  for (const method of ['post', 'put', 'patch', 'delete']) api[method].mockImplementation(() => {throw new Error('Unexpected business write');});
  rememberClient(P);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); window.history.replaceState({}, '', '/'); jest.clearAllMocks();
});

test('a pinned authorized CIS workspace keeps its native56-register after another tab remembers General', async () => {
  const before = JSON.stringify(workspace);
  window.history.replaceState({}, '', '/dashboard?client_id=' + P);
  await render();
  expect(org.currentClientId).toBe(P); expect(appearance().common).toBe(true);
  rememberClient(G);
  // Same pinned client, different native route: the Org URL effect must not be relied on to rewrite storage.
  await act(async () => navigate('/compliance/cis-ig1?client_id=' + P));
  expect(selectedClient()).toBe(G); expectR4();
  await act(async () => buttons('Expand all')[0].click());
  expect(host.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(56);
  // A different standard tab changes the shared preference, not this tab's URL or authorized Org identity.
  rememberClient(G);
  const search = host.querySelector('input[type="search"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, '1.1');
    search.dispatchEvent(new Event('input', {bubbles: true}));
  });
  expect(selectedClient()).toBe(G); expectR4();
  expect(host.querySelector('[data-testid="requirement-1.1"]')).not.toBeNull();
  expect(api.get.mock.calls.filter(([path]) => path === '/frameworks/cis-ig1')).toHaveLength(1);
  // A real authorized-list refresh may consult the preference; the explicit URL still resolves to P.
  await act(async () => org.refresh());
  expect(selectedClient()).toBe(G); expectR4();
  expect(JSON.stringify(workspace)).toBe(before); expectNoWrites();
});

test('a stored other-tab preference cannot replace an explicit authorized URL on initial resolution', async () => {
  rememberClient(G); await render(); expectR4();
  expect(api.get.mock.calls.filter(([path]) => path === '/frameworks/cis-ig1').map(([, config]) => config.params.client_id)).toEqual([P]);
  expectNoWrites();
});

test.each([
  ['/risks', 'full'], ['/evidence', 'evidence'], ['/client-profile', 'onboarding'],
])('%s common and loaded appearance follows the resolved client after a shared preference change', async (pathname, enabled) => {
  window.history.replaceState({}, '', pathname + '?client_id=' + P);
  await render({kind: 'hooks'}); expect(appearance()[enabled]).toBe(true);
  rememberClient(G); await render({kind: 'hooks'});
  expect(selectedClient()).toBe(G);
  expect(org.currentClientId).toBe(P); expect(appearance()[enabled]).toBe(true);
  expect(appearance().common).toBe(true); expect(appearance().frame).toBe(true);
  expectNoWrites();
});

test('the actual CIS guide keeps its verified fresh-entry affordance when the remembered preference is different', async () => {
  const originalRead = api.get.getMockImplementation();
  let resolveGuide;
  const guidePath = '/framework_assessments/' + guide.record.framework_assessment_id + '/guided-assessment';
  api.get.mockImplementation((path, config) => path === guidePath
    ? new Promise(resolve => {resolveGuide = resolve;}) : originalRead(path, config));
  await render({kind: 'guide'});
  expect(typeof resolveGuide).toBe('function');
  rememberClient(G);
  await act(async () => resolveGuide({data: copy(guide.draft)}));
  expect(selectedClient()).toBe(G); expect(org.currentClientId).toBe(P);
  expect(freshReady).toHaveBeenCalledTimes(1);
  expect(api.get.mock.calls.filter(([path]) => path.endsWith('/guided-assessment'))).toHaveLength(1);
  expectNoWrites();
});

test('foreign loaded evidence and record identities remain unavailable while current record-free chrome is valid', async () => {
  window.history.replaceState({}, '', '/evidence?client_id=' + P);
  await render({kind: 'hooks', loadedClientId: G, recordClientId: G});
  expect(appearance()).toMatchObject({common: true, frame: true, evidenceFrame: true, evidence: false, full: false, onboarding: false});
  await act(async () => navigate('/risks?client_id=' + P));
  expect(location.pathname).toBe('/risks');
  expect(appearance().full).toBe(false); expectNoWrites();
});

test('a foreign explicit URL fails closed even when the remembered client is authorized', async () => {
  window.history.replaceState({}, '', '/compliance/cis-ig1?client_id=not-authorized');
  await render();
  expect(org.currentClientId).toBe(''); expect(org.currentClient).toBeNull();
  expect(host.querySelector('[role="alert"]').textContent).toContain('outside your current access');
  expect(host.querySelector('.brawndo-cis-visual')).toBeNull();
  expect(api.get.mock.calls.map(([path]) => path)).toEqual(['/clients']); expectNoWrites();
});

test('a failed authorized-list read cannot activate appearance from stored preference or loaded-looking fixture data', async () => {
  api.get.mockRejectedValueOnce(new Error('Synthetic authorized-list failure'));
  await render();
  expect(org.currentClientId).toBe(''); expect(org.currentClient).toBeNull();
  expect(host.querySelector('[role="alert"]').textContent).toBe('Synthetic authorized-list failure');
  expect(host.querySelector('.brawndo-cis-visual')).toBeNull(); expectNoWrites();
});

test('a foreign framework response remains rejected independently of remembered selection', async () => {
  workspace.assessments[0].client_id = G; rememberClient(G);
  await render();
  expect(org.currentClientId).toBe(P);
  expect(host.textContent).toContain('CIS workspace records could not be verified for this client.');
  expect(host.querySelector('.brawndo-cis-visual')).toBeNull(); expectNoWrites();
});

test('a route without an explicit client uses the authorized remembered preference on a fresh provider', async () => {
  rememberClient(G); window.history.replaceState({}, '', '/evidence');
  await render({kind: 'hooks', loadedClientId: G, recordClientId: G});
  expect(org.currentClientId).toBe(G); expect(org.currentClient).toEqual(clients[1]);
  expect(appearance()).toMatchObject({common: true, frame: true, evidence: true, evidenceFrame: true});
  expect(org.currentClient.cis_program).toBeNull(); expectNoWrites();
});
