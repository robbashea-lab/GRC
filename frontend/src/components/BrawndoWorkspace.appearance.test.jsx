import {cisClient} from '../testUtils/cisExperience';
import React, {act, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useLocation} from 'react-router-dom';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {PREVIEW_MODE} from '@/lib/api';
import {selectedClient} from '@/lib/clientSelection';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {cis, FRAMEWORKS} from '@/lib/frameworks';
import {brawndoCisVisualGate} from '@/lib/brawndoCisVisual';
import {AdditionalSectionsProvider, useAdditionalSectionsSurface} from '@/lib/brawndoAdditionalScope';
import {useCisVisualAppearance} from './BrawndoCisVisualAppearance';
import BrawndoWorkspace from './BrawndoWorkspace';

let mockAuth, mockOrg, mockLocation, mockLoadedOrigin, mockMounts, mockUnmounts;
let mockDashboardEnabled=true;
jest.mock('@/lib/brawndoDemoDashboard',()=>({
  ...jest.requireActual('@/lib/brawndoDemoDashboard'),
  get BRAWNDO_DEMO_DASHBOARD_ENABLED(){return mockDashboardEnabled;},
}));
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/context/ComplianceContext', () => ({useCompliance: () => ({items: []})}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: true,
  default: {get: jest.fn()}, formatError: error => error.message}));
jest.mock('./NotificationBell', () => () => null);
// Match the repository's virtual Router fixtures; navigation itself is not under test.
jest.mock('react-router-dom', () => ({
  Link: ({to, children, ...props}) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => jest.fn(), useLocation: () => mockLocation,
}), {virtual: true});

const definitions = cis.requirements.filter(row => row.implementation_group === 1);
const program = {
  framework: FRAMEWORKS.find(row => row.key === 'cis-ig1'), selected: true, configured: true,
  configuration: {implementation_group: 1}, active_definition_ids: definitions.map(row => row.id), definitions,
  assessments: definitions.map(row => ({framework_assessment_id: `native-${row.id}`,
    definition_id: row.id, client_id: 'demo_brawndo', framework_key: 'cis-ig1', framework_version: '8.1'})),
  implementation_position: {program_id: 'demo_brawndo:cis-ig1'},
};

function currentOrigin() {
  return {clientId: mockOrg.currentClientId, frameworkKey: 'cis-ig1', userId: mockAuth.user.user_id,
    role: mockAuth.user.role, workspaceMode: mockAuth.workspaceMode,
    userWorkspaceMode: mockAuth.user.workspace_mode, trustedDemo: PREVIEW_MODE};
}

function NativeDraftController() {
  // Deliberately identity-agnostic: this observes provider remounts. Native pages'
  // actor/client/mode draft resets have their own real-controller regression suites.
  const [draft, setDraft] = useState('');
  useEffect(() => {mockMounts++; return () => {mockUnmounts++;};}, []);
  return <label>Native draft<input value={draft} onChange={event => setDraft(event.target.value)}/></label>;
}

function NativePageOrigin() {
  const auth = useAuth(), org = useOrg(), {pathname, search} = useLocation(), [theme] = useBrawndoTheme();
  // The native Additional pages withhold loadedClientId until their read's actor,
  // role, client and mode match. Keep that read receipt independent of current context.
  const readMatches = Object.entries(currentOrigin()).every(([key, value]) => mockLoadedOrigin[key] === value);
  useAdditionalSectionsSurface('policies', readMatches ? mockLoadedOrigin.clientId : null);
  const cisEnabled = brawndoCisVisualGate({...org, ...auth, trustedDemo: PREVIEW_MODE,
    pathname, frameworkKey: 'cis-ig1', clientId: org.currentClientId, data: program, loadedScope: mockLoadedOrigin,
    selectedClientId: selectedClient(), routeClientId: new URLSearchParams(search).get('client_id'),
    authLoading: auth.loading, authError: auth.error, orgLoading: org.loading, orgError: org.error});
  useCisVisualAppearance(cisEnabled, theme);
  return <NativeDraftController/>;
}

let root, host;
beforeEach(() => {
  mockDashboardEnabled=true;
  require('@/lib/api').PREVIEW_MODE = true;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear();
  sessionStorage.setItem('grc_client_id', 'demo_brawndo');
  mockAuth = {workspaceMode: 'demo', loading: false,
    user: {user_id: 'actor-one', role: 'super_admin', workspace_mode: 'demo', name: 'Demo owner'}};
  const client = {...cisClient(), name: 'Brawndo'};
  mockOrg = {currentClientId: client.client_id, currentClient: client, clients: [client], loading: false};
  mockLocation = {pathname: '/dashboard', search: ''};
  mockLoadedOrigin = currentOrigin(); mockMounts = 0; mockUnmounts = 0;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host.remove(); localStorage.clear(); sessionStorage.clear(); jest.clearAllMocks();
});

const render = () => act(async () => root.render(
  <AdditionalSectionsProvider><BrawndoWorkspace><NativePageOrigin/></BrawndoWorkspace></AdditionalSectionsProvider>
));

test('the Dashboard-only shell follows the documented gate-only rollback without changing other page appearance',async()=>{
  mockDashboardEnabled=false;await render();
  expect(host.querySelector('.brawndo-workspace-pilot').dataset.cisDashboardConcept).toBeUndefined();
  mockOrg={...mockOrg,loading:true};await render();
  expect(host.querySelector('.brawndo-workspace-pilot').dataset.cisDashboardConcept).toBeUndefined();
  mockLocation={pathname:'/policies',search:''};await render();
  expect(host.querySelector('.brawndo-workspace-pilot').dataset.additionalSurface).toBe('policies');
});

function expectAppearance(surface, theme = 'light', chrome = surface) {
  const shell = host.querySelector('.brawndo-workspace-pilot'), html = document.documentElement;
  const visual = surface === 'dashboard' ? surface : undefined;
  const additional = surface === 'policies' ? surface : undefined;
  const additionalChrome = chrome === 'policies' ? chrome : undefined;
  const cisVisual = surface === 'cis' ? 'true' : undefined;
  const cisChrome = chrome === 'cis' ? 'true' : undefined;
  expect(shell.dataset.visualSurface).toBe(visual);
  expect(shell.dataset.additionalSurface).toBe(additionalChrome);
  expect(shell.dataset.cisVisual).toBe(cisChrome);
  expect(html.dataset.visualSurface).toBe(visual);
  expect(html.dataset.visualTheme).toBe(visual ? theme : undefined);
  expect(html.dataset.additionalSurface).toBe(additional);
  expect(html.dataset.additionalTheme).toBe(additional ? theme : undefined);
  for (const element of [html, document.body]) {
    expect(element.dataset.brawndoCisVisual).toBe(cisVisual);
    expect(element.dataset.brawndoCisTheme).toBe(cisVisual ? theme : undefined);
  }
}

test('combined appearance transitions retain the mounted native draft and reject stale or mismatched origins', async () => {
  await render(); expectAppearance('dashboard');
  const input = host.querySelector('label input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Unsaved native draft');
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
  const expectDraft = () => {
    expect(host.querySelector('label input')).toBe(input);
    expect(input.isConnected).toBe(true); expect(input.value).toBe('Unsaved native draft');
    expect(mockMounts).toBe(1); expect(mockUnmounts).toBe(0);
  };
  for (const [pathname, surface] of [['/policies', 'policies'], ['/compliance/cis-ig1', 'cis'], ['/systems', null]]) {
    mockLocation = {pathname, search: ''}; await render(); expectAppearance(surface); expectDraft();
  }

  for (const [pathname, surface] of [['/policies', 'policies'], ['/compliance/cis-ig1', 'cis']]) {
    mockLocation = {pathname, search: ''}; mockLoadedOrigin = currentOrigin();
    await render(); expectAppearance(surface); expectDraft();

    // A routine refresh withdraws styling without remounting the native editor.
    mockOrg = {...mockOrg, loading: true}; await render(); expectAppearance(null, 'light', surface); expectDraft();
    mockOrg = {...mockOrg, loading: false}; await render(); expectAppearance(surface); expectDraft();

    mockAuth = {...mockAuth, user: {...mockAuth.user, user_id: `${mockAuth.user.user_id}-next`}};
    await render(); expectAppearance(null, 'light', surface); expectDraft();
    mockLoadedOrigin = currentOrigin(); await render(); expectAppearance(surface); expectDraft();

    // A different authorized client receives common appearance, never a CIS program design by name.
    const originalOrg = mockOrg;
    const other = {client_id: 'other-client', name: 'Brawndo', status: 'active'};
    mockOrg = {...mockOrg, currentClientId: other.client_id, currentClient: other, clients: [other]};
    sessionStorage.setItem('grc_client_id', other.client_id); mockLoadedOrigin = currentOrigin();
    await render(); expectAppearance(surface==='policies'?'policies':null); expectDraft();
    mockOrg = originalOrg; sessionStorage.setItem('grc_client_id', 'demo_brawndo');
    mockLoadedOrigin = currentOrigin(); await render(); expectAppearance(surface); expectDraft();

    mockAuth = {...mockAuth, workspaceMode: 'standard', user: {...mockAuth.user, workspace_mode: 'standard'}};
    require('@/lib/api').PREVIEW_MODE = false;
    localStorage.setItem('grc_client_id', 'demo_brawndo');
    mockLoadedOrigin = currentOrigin(); await render(); expectAppearance(surface); expectDraft();
    mockAuth = {...mockAuth, workspaceMode: 'demo', user: {...mockAuth.user, workspace_mode: 'demo'}};
    require('@/lib/api').PREVIEW_MODE = true;
    mockLoadedOrigin = currentOrigin(); await render(); expectAppearance(surface); expectDraft();

    mockLocation = {pathname, search: '?client_id=other-client'};
    await render(); expectAppearance(null); expectDraft();
    mockLocation = {pathname, search: ''}; await render(); expectAppearance(surface); expectDraft();
  }
  await act(async () => host.querySelector('.bwp-theme').click());
  expectAppearance('cis', 'dark'); expectDraft();
  mockLocation = {pathname: '/systems', search: ''}; await render(); expectAppearance(null, 'dark'); expectDraft();
  await act(async () => root.unmount()); root = null;
  expect(mockUnmounts).toBe(1);
  for (const attribute of ['data-brawndo-workspace', 'data-visual-surface', 'data-visual-theme',
    'data-additional-surface', 'data-additional-theme', 'data-brawndo-cis-visual', 'data-brawndo-cis-theme']) {
    expect(document.documentElement.hasAttribute(attribute)).toBe(false);
  }
  expect(document.body.hasAttribute('data-brawndo-cis-visual')).toBe(false);
  expect(document.body.hasAttribute('data-brawndo-cis-theme')).toBe(false);
});


test('background dashboard chrome is stable while strict portal appearance is withdrawn and concept styling stays route-local',async()=>{
  await render();expect(host.querySelector('.brawndo-workspace-pilot').dataset.cisDashboardConcept).toBe('true');
  mockOrg={...mockOrg,loading:true};await render();
  expect(host.querySelector('.brawndo-workspace-pilot').dataset.visualSurface).toBe('dashboard');
  expect(document.documentElement.dataset.visualSurface).toBeUndefined();
  expect(host.querySelector('.bwp-brand small').textContent).toBe('Turn complexity into clarity.');
  for(const pathname of ['/systems','/reports','/compliance/iso-27001','/admin/clients']){
    mockLocation={pathname,search:''};await render();
    expect(host.querySelector('.brawndo-workspace-pilot').dataset.cisDashboardConcept).toBeUndefined();
    expect(host.querySelector('.brawndo-workspace-pilot').dataset.visualSurface).toBeUndefined();
  }
  mockLocation={pathname:'/dashboard',search:''};mockAuth={...mockAuth,error:'Current identity unavailable'};await render();
  expect(host.querySelector('.brawndo-workspace-pilot').dataset.cisDashboardConcept).toBeUndefined();
  expect(host.querySelector('.brawndo-workspace-pilot').dataset.visualSurface).toBeUndefined();
});
