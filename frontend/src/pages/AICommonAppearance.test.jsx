import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import AIGovernance from './AIGovernance';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';
import {frameworkDashboardFixture} from '@/testUtils/frameworkDashboard';
import {sharedProgramProjection} from '@/preview/clientRelationships';

let mockAuth, mockOrg, mockNativeProps, host, root;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/lib/clientSelection', () => ({selectedClient: () => mockOrg.currentClientId}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: true, API: '/api',
  default: {get: jest.fn(), post: jest.fn(), patch: jest.fn()}, formatError: error => error.message}));
jest.mock('react-router-dom', () => ({Link: ({children}) => <span>{children}</span>,
  useLocation: () => ({pathname: '/ai-governance', search: ''}), useNavigate: () => jest.fn(),
  useSearchParams: () => require('react').useState(new URLSearchParams())}), {virtual: true});
// Verify real page/register dispatch; complete native editor commands have their own retained suites.
jest.mock('@/components/AIDrawer', () => function NativeEditor(props) {
  mockNativeProps = props;
  const [value, setValue] = require('react').useState('Original native draft');
  return <input aria-label="Native AI editor" value={value} onChange={event => setValue(event.target.value)}/>;
});
jest.mock('@/components/AIOnboardingWizard', () => () => <aside data-testid="guided-AI-create"/>);
jest.mock('@/components/AIRecordView', () => () => <aside data-testid="guided-AI-record"/>);
jest.mock('@/components/AIProfileDialog', () => () => <aside data-testid="guided-AI-profile"/>);
jest.mock('@/components/AIIntake', () => ({useAIIntake: () => ({}), AIIntakeView: () => <aside data-testid="native-intake-editor"/>}));

const id = 'arbitrary-common-AI-client';
const row = {ai_system_id: 'existing-system', client_id: id, name: 'Existing native AI system', status: 'active'};
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockAuth = {workspaceMode: 'standard', user: {user_id: 'operator', role: 'super_admin'}, loading: false};
  mockNativeProps = null;
  api.get.mockImplementation(async path => ({data: path === '/ai_systems' ? [row]
    : path === '/ai-intake' ? {client_id: id, usage: 'yes', indicators: []} : []}));
  api.post.mockReset(); api.patch.mockReset();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); jest.clearAllMocks();});
const render = () => act(async () => root.render(<AIGovernance/>));
const click = node => act(async () => node.click());
function context(mode, framework, role = 'super_admin') {
  mockAuth = {workspaceMode: mode, user: {user_id: 'operator', role, ...(mode === 'demo' ? {workspace_mode: 'demo'} : {})}, loading: false};
  const nativeFramework=framework==='general'?null:framework;
  let client = {client_id: id, name: 'Arbitrary organization', status: framework ? 'active' : 'onboarding',
    cis_program: null, shared_programs: [], onboarding_baseline: {completed: !!framework, requirements: nativeFramework ? {[nativeFramework]: 'applies'} : {}}};
  if (framework === 'cis-ig1') client = cisClient(id, 1);
  if (['iso-27001', 'soc-2'].includes(framework)) {
    const fixture = frameworkDashboardFixture(framework, undefined, id);
    client = {...fixture.client, shared_programs: sharedProgramProjection(fixture.db, fixture.client)};
  }
  mockOrg = {currentClientId: id, currentClient: client, clients: [client], loading: false};
}

test.each(['demo', 'standard'].flatMap(mode => [null, 'general', 'hipaa', 'nist-csf-2', 'cmmc'].map(key => [mode, key])))(
  '%s %s common AI appearance keeps native create/edit instead of enabling guided commands', async (mode, framework) => {
    context(mode, framework); await render();
    expect(host.querySelector('[data-testid=ai-register-first]')).not.toBeNull();
    expect(host.querySelector('.profile-button')).toBeNull();
    expect(host.textContent).toContain('Approval not recorded');
    await click(host.querySelector('[data-testid=new-ai-system]'));
    expect(host.querySelector('[aria-label="Native AI editor"]')).not.toBeNull();
    expect(mockNativeProps).toMatchObject({clientId: id, record: null, contextAvailable: true, conceptPresentation: false});
    expect(host.querySelector('[data-testid=guided-AI-create], [data-testid=guided-AI-record], [data-testid=guided-AI-profile]')).toBeNull();
    await act(async () => mockNativeProps.onOpenChange(false));
    await click(host.querySelector('.system-name'));
    await click(host.querySelector('.inline-actions .button'));
    expect(mockNativeProps.record).toBe(row);
    expect(mockNativeProps.conceptPresentation).toBe(false);
    expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled();
  });

test.each(['demo', 'standard'].flatMap(mode => ['cis-ig1', 'iso-27001', 'soc-2'].map(key => [mode, key])))(
  '%s %s retained native enrollment keeps the original guided creation path', async (mode, framework) => {
    context(mode, framework); await render();
    expect(host.querySelector('.profile-button')).not.toBeNull();
    await click(host.querySelector('[data-testid=new-ai-system]'));
    expect(host.querySelector('[data-testid=guided-AI-create]')).not.toBeNull();
    expect(mockNativeProps).toBeNull(); expect(api.post).not.toHaveBeenCalled();
  });

test('common appearance retains no-usage intake and read-only creation denial', async () => {
  context('standard', null, 'client_readonly');
  const get = api.get.getMockImplementation();
  api.get.mockImplementation(path => path === '/ai-intake'
    ? Promise.resolve({data: {client_id: id, usage: 'no', indicators: []}}) : get(path));
  await render();
  expect(host.querySelector('[data-testid=new-ai-system]')).toBeNull();
  expect(host.querySelector('[data-testid=native-intake-editor]')).not.toBeNull();
  expect(host.textContent).toContain('Historical records remain accessible');
  expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled();
});
