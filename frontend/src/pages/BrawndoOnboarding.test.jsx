import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import Onboarding from './Onboarding';
import ClientProfile from './ClientProfile';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';
import {rememberClient} from '@/lib/clientSelection';
import catalog from '@catalogs/onboardingCatalog.json';
import {catalog as aiCatalog} from '@/lib/aiGovernance';

let mockAuth, mockOrg, mockLocation, mockState, mockAI, mockRecordVersions, mockDraftVersion;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/context/ComplianceContext', () => ({useCompliance: () => ({refresh: jest.fn()})}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: true,
  default: {get: jest.fn(), post: jest.fn(), patch: jest.fn()}, formatError: error => error.message}));
jest.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  useSearchParams: () => require('react').useState(new URLSearchParams(mockLocation.search)),
  Link: ({to, children, ...props}) => <a href={to} {...props}>{children}</a>, Navigate: () => null,
}), {virtual: true});
jest.mock('@/lib/brawndoAdditionalScope', () => ({useAdditionalSectionsSurface: () => false,useAdditionalSectionsPresentation: () => false}));
jest.mock('./PlatformAdmin', () => ({UsersTable: () => null}));
jest.mock('@/components/ComplianceProfile', () => () => null);
jest.mock('@/components/ClientDialog', () => () => null);

let container, root;
const button = text => [...container.querySelectorAll('button')].find(item => item.textContent === text);
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const change = (element, value) => {
  Object.getOwnPropertyDescriptor(element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', {bubbles: true}));
};
const allPolicies = () => Object.fromEntries(catalog.policies.map(policy => [policy.key, 'unsure']));
const renderWizard = (profileClientId = 'demo_brawndo') => root.render(<Onboarding profileClientId={profileClientId}/>);
const handoff = () => ({client: {client_id: mockOrg.currentClientId, name: 'Brawndo'}, completed: mockState.completed,
  people: {contacts: 0, active_client_users: 0, eligible_assignees_available: true},
  records: {reviews: [], policies: [], requirements: [], framework_assessments: []}});

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(global, 'crypto', {configurable: true, value: require('crypto').webcrypto});
  sessionStorage.clear(); localStorage.clear(); rememberClient('demo_brawndo');
  mockAuth = {workspaceMode: 'demo', user: {user_id: 'demo_actor', role: 'super_admin', workspace_mode: 'demo'}, loading: false, error: ''};
  mockOrg = {currentClientId: 'demo_brawndo', currentClient: {...cisClient(), name: 'Brawndo'},
    clients: [{...cisClient(), name: 'Brawndo'}], loading: false, error: '', refresh: jest.fn()};
  mockLocation = {pathname: '/client-profile', search: ''};
  mockState = {version: 3, step: 0, completed: false, policies: {}, reviews: [], framework_reviews: {},
    requirements: Object.fromEntries(catalog.requirements.map(program => [program.key, 'does_not_apply'])), updated_at: 'draft-initial'};
  mockRecordVersions = {'policies:first': null, 'reviews:retained': {review_id: 'retained', updated_at: 'record-version'}};
  mockAI = {client_id: 'demo_brawndo', usage: 'yes', indicators: [], updated_at: 'ai-initial'};
  mockDraftVersion = 0;
  api.get.mockImplementation(async path => ({data: path === '/onboarding/baseline' ? {catalog, state: mockState, record_versions: mockRecordVersions}
    : path === '/ai-intake' ? mockAI : path.endsWith('/profile') ? {client_id: mockOrg.currentClientId,
      completed: mockState.completed, profile: {}, history: [], baseline: {state: mockState, completed_at: '2026-10-01', completed_by: 'original_actor', policies: 17, reviews: 0}}
      : handoff()}));
  api.post.mockImplementation(async (path, body) => {
    if (path === '/ai-intake') {mockAI = {...body, updated_at: 'ai-saved'}; return {data: mockAI};}
    mockState = {...body.state, completed: !!body.finalize, updated_at: `draft-${++mockDraftVersion}`};
    return {data: mockState};
  });
  api.patch.mockResolvedValue({data: {ok: true}});
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {await act(async () => root.unmount()); container.remove(); jest.clearAllMocks();});

test('appearance waits for the native baseline and matching profile/handoff identities', async () => {
  const loading = deferred(), load = api.get.getMockImplementation();
  api.get.mockImplementation((path, options) => path === '/onboarding/baseline' ? loading.promise : load(path, options));
  await act(async () => renderWizard());
  expect(container.querySelector('.brawndo-onboarding')).toBeNull();
  expect(container.textContent).toContain('Loading onboarding');
  await act(async () => loading.resolve({data: {catalog, state: mockState, record_versions: mockRecordVersions}}));
  expect(container.querySelector('.brawndo-onboarding')).toBeTruthy();
  await act(async () => renderWizard('other'));
  expect(container.querySelector('.brawndo-onboarding')).toBeNull();
});

test.each(['demo','standard'])('%s untouched no-framework creation retains native choices and no implicit enrollment in the approved frame',async mode=>{
  const clientId='arbitrary-new-onboarding';
  const client={client_id:clientId,name:'New unconfigured organization',status:'onboarding',cis_program:null,shared_programs:[]};
  mockAuth={workspaceMode:mode,user:{user_id:'new-operator',role:'super_admin',...(mode==='demo'?{workspace_mode:'demo'}:{})},loading:false};
  mockOrg={...mockOrg,currentClientId:clientId,currentClient:client,clients:[client]};
  mockAI={...mockAI,client_id:clientId};rememberClient(clientId);
  const before=JSON.stringify(mockState);
  await act(async()=>renderWizard(clientId));
  expect(container.querySelector('.brawndo-onboarding')).not.toBeNull();
  expect(container.textContent).toContain('General GRC only');
  expect(container.querySelectorAll('.fws .fwc')).toHaveLength(catalog.requirements.length);
  expect([...container.querySelectorAll('.fws .fwc select')].every(select=>select.value==='does_not_apply')).toBe(true);
  expect(button('Next')).toBeTruthy();expect(button('Complete onboarding')).toBeUndefined();
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  expect(JSON.stringify(mockState)).toBe(before);
});

test('mounted presentation withdraws immediately on mode, route, selection, authorization or archived context changes', async () => {
  await act(async () => renderWizard());
  const originalAuth = mockAuth, originalOrg = mockOrg, originalLocation = mockLocation;
  const withdraw = [() => {mockAuth = {...originalAuth, workspaceMode: 'standard'};},
    () => {mockLocation = {pathname: '/onboarding', search: ''};},
    () => {mockLocation = {...originalLocation, search: '?client_id=foreign'};},
    () => {sessionStorage.setItem('grc_client_id', 'foreign');},
    () => {mockAuth = {...originalAuth, error: 'Session denied'};},
    () => {mockOrg = {...originalOrg, loading: true};},
    () => {mockOrg = {...originalOrg, error: 'Access denied'};},
    () => {mockOrg = {...originalOrg, clients: []};},
    () => {mockOrg = {...originalOrg, currentClient: {...originalOrg.currentClient, status: 'archived'}};}];
  for (const alter of withdraw) {
    alter(); await act(async () => renderWizard());
    expect(container.querySelector('.brawndo-onboarding')).toBeNull();
    mockAuth = originalAuth; mockOrg = originalOrg; mockLocation = originalLocation;
    rememberClient('demo_brawndo');
    await act(async () => renderWizard());
    expect(container.querySelector('.brawndo-onboarding')).toBeTruthy();
  }
});

test.each(['Back', 'Next'])('temporary organization loading preserves the native review draft and focused %s button', async focusedLabel => {
  mockState = {...mockState, step: 2, policies: allPolicies(), requirements: {...mockState.requirements, 'cis-ig1': 'applies'}};
  const pendingSave = deferred();
  api.post.mockImplementationOnce(() => pendingSave.promise);
  await act(async () => renderWizard());
  const date = container.querySelector('[aria-label="First due date — Enterprise Asset Inventory Review"]');
  await act(async () => change(date, '2028-02-29'));
  const back = button('Back'), next = button('Next'), focused = button(focusedLabel), reads = api.get.mock.calls.length;
  focused.focus();
  expect(document.activeElement).toBe(focused);
  for (const loading of [true, false]) {
    mockOrg = {...mockOrg, loading};
    await act(async () => renderWizard());
    expect(!!container.querySelector('.brawndo-onboarding')).toBe(!loading);
    expect(container.querySelector('[aria-label="First due date — Enterprise Asset Inventory Review"]')).toBe(date);
    expect(date.value).toBe('2028-02-29');
    expect(button('Back')).toBe(back);
    expect(button('Next')).toBe(next);
    expect(document.activeElement).toBe(focused);
    expect(api.get.mock.calls.length).toBe(reads);
    expect(api.post.mock.calls).toHaveLength(1);
  }
  await act(async () => pendingSave.resolve({data: {updated_at: 'draft-after-refresh'}}));
  expect(container.querySelector('[data-save-state="saved"]').textContent).toBe('Progress saved');
});

test('general Review disclosure keeps the user choice through temporary appearance withdrawal without API work', async () => {
  mockState = {...mockState, step: 2, policies: allPolicies()};
  await act(async () => renderWizard());
  const disclosure = [...container.querySelectorAll('details')].find(details => details.querySelector('summary')?.textContent.startsWith('Optional general GRC Reviews'));
  expect(disclosure.open).toBe(true);
  await act(async () => {disclosure.open = false; disclosure.dispatchEvent(new Event('toggle'));});
  expect(disclosure.open).toBe(false);
  const reads = api.get.mock.calls.length;
  for (const loading of [true, false]) {
    mockOrg = {...mockOrg, loading};
    await act(async () => renderWizard());
    expect([...container.querySelectorAll('details')].find(details => details.querySelector('summary')?.textContent.startsWith('Optional general GRC Reviews'))).toBe(disclosure);
    expect(disclosure.open).toBe(false);
    expect(disclosure.classList.contains('general-review-card')).toBe(!loading);
    expect(api.get.mock.calls.length).toBe(reads);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  }
});

test('styled native programs retain three applicability values, cumulative CIS scope and individual required policy responses', async () => {
  mockState.requirements['cis-ig1'] = 'applies';
  mockState.framework_settings = {'cis-ig1': {implementation_group: 2}};
  await act(async () => renderWizard());
  const applicability = container.querySelector('select[aria-label="CIS Controls v8.1 IG2"]');
  expect([...applicability.options].map(option => [option.value, option.textContent])).toEqual([
    ['applies', 'Applies'], ['does_not_apply', 'Does Not Apply'], ['unsure', 'Undetermined']]);
  await act(async () => change(container.querySelector('[aria-label="CIS implementation group"]'), '3'));
  expect(api.post.mock.calls.at(-1)[1].state.framework_settings).toEqual({'cis-ig1': {implementation_group: 3}});
  await act(async () => button('Next').click());
  expect(container.querySelectorAll('[role="group"]')).toHaveLength(catalog.policies.length);
  expect(container.textContent).not.toContain('Mark all');
  const first = container.querySelector('[role="group"]'), key = catalog.policies.find(policy => policy.name === first.getAttribute('aria-label')).key;
  await act(async () => first.querySelector('[data-v="yes"]').click());
  expect(api.post.mock.calls.at(-1)[1].state.policies).toEqual({[key]: 'yes'});
  await act(async () => button('Next').click());
  expect(container.querySelector('h2').textContent).toBe('Policies & governance documents');
  expect(container.querySelector('[role="alert"]').textContent).toContain('each unanswered Policy');
  expect(document.activeElement).toBe(container.querySelector('[role="group"][aria-describedby] button'));
  expect(document.activeElement.textContent).toBe('Have it');
});

test('native saving/failed status and queued draft retry drain before versioned finalization', async () => {
  mockState = {...mockState, step: 2, policies: allPolicies()};
  const first = deferred(), retry = deferred(), save = api.post.getMockImplementation(); let attempts = 0;
  api.post.mockImplementation((path, body, options) => path === '/onboarding/baseline' && !body.finalize
    ? (++attempts === 1 ? first.promise : retry.promise) : save(path, body, options));
  await act(async () => renderWizard());
  await act(async () => button('Next').click());
  expect(container.querySelector('[data-save-state="saving"]').textContent).toBe('Saving progress…');
  await act(async () => first.reject(new Error('Draft unavailable')));
  expect(container.querySelector('[data-save-state="failed"]').textContent).toBe('Progress could not be saved');
  expect(button('Back').disabled).toBe(false);
  await act(async () => button('Complete onboarding').click());
  expect(api.post.mock.calls.filter(([, body]) => body.finalize)).toHaveLength(0);
  expect(attempts).toBe(2);
  expect(container.textContent).not.toContain('Completion has not been confirmed');
  await act(async () => retry.resolve({data: {updated_at: 'retried-draft-version'}}));
  const final = api.post.mock.calls.find(([, body]) => body.finalize);
  expect(final[1]).toMatchObject({client_id: 'demo_brawndo', finalize: true,
    expected_updated_at: 'retried-draft-version', expected_records: mockRecordVersions});
  expect(final[2].headers['Idempotency-Key']).toBeTruthy();
  expect(container.querySelector('[data-testid="onboarding-handoff"]')).toBeTruthy();
});

test('uncertain themed completion freezes its native fields and retries the identical body and intent', async () => {
  mockState = {...mockState, step: 3, policies: allPolicies()};
  await act(async () => renderWizard());
  api.post.mockRejectedValueOnce(new Error('Response lost'));
  await act(async () => button('Complete onboarding').click());
  const first = api.post.mock.calls.at(-1);
  expect(first[1]).toMatchObject({finalize: true, expected_updated_at: 'draft-initial', expected_records: mockRecordVersions});
  expect(container.querySelector('fieldset.native-step-body').disabled).toBe(true);
  expect(button('Back').disabled).toBe(true);
  expect(container.querySelector('[role="alert"]').textContent).toContain('keep this page open');
  await act(async () => button('Retry completion').click());
  expect(api.post.mock.calls.at(-1)).toEqual(first);
  expect(container.querySelector('[data-testid="onboarding-handoff"]')).toBeTruthy();
});

test('confirmed completion rejection preserves an editable native form', async () => {
  mockState = {...mockState, step: 3, policies: allPolicies()};
  await act(async () => renderWizard());
  api.post.mockRejectedValueOnce(Object.assign(new Error('Rejected before writing'), {response: {headers: {'x-create-rejected': 'true'}}}));
  await act(async () => button('Complete onboarding').click());
  expect(container.querySelector('fieldset.native-step-body').disabled).toBe(false);
  expect(button('Back').disabled).toBe(false);
  expect(button('Complete onboarding')).toBeTruthy();
  expect(button('Retry completion')).toBeUndefined();
});

test('full AI intake retains every indicator and its own versioned save/error/retry lifecycle', async () => {
  await act(async () => renderWizard());
  const intake = container.querySelector('[data-testid="ai-intake"]');
  expect(intake.querySelectorAll('input[type="checkbox"]')).toHaveLength(aiCatalog.intake_indicators.length);
  for (const indicator of aiCatalog.intake_indicators) expect(intake.textContent).toContain(indicator);
  const indicator = [...intake.querySelectorAll('label')].find(label => label.textContent === 'Autonomous/agentic AI').querySelector('input');
  await act(async () => indicator.click());
  api.post.mockRejectedValueOnce(new Error('AI intake unavailable'));
  await act(async () => button('Save AI intake').click());
  expect(intake.querySelector('[role="alert"]').textContent).toBe('AI intake unavailable');
  expect(indicator.checked).toBe(true);
  await act(async () => button('Save AI intake').click());
  expect(api.post.mock.calls.every(([path]) => path === '/ai-intake')).toBe(true);
  expect(api.post).toHaveBeenLastCalledWith('/ai-intake', expect.objectContaining({client_id: 'demo_brawndo',
    usage: 'yes', indicators: ['Autonomous/agentic AI'], expected_updated_at: 'ai-initial'}));
  expect(intake.querySelector('[role="alert"]')).toBeNull();
});

test('completed native profile preserves handoff/configuration/history without reopening or replaying intake', async () => {
  mockState = {...mockState, step: 3, policies: allPolicies(), completed: true}; mockLocation.search = '?tab=program';
  await act(async () => root.render(<ClientProfile/>));
  expect(container.querySelector('.onboarding-completed')).toBeTruthy();
  expect(container.querySelector('[aria-label="Program configuration"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="onboarding-handoff"]')).toBeTruthy();
  expect(container.querySelector('[aria-label="Historical onboarding answers"]')).toBeTruthy();
  expect(container.textContent).toContain('View onboarding baseline');
  expect(container.textContent).toContain('Recent profile & program changes');
  expect(container.querySelector('[data-testid="onboarding-stepper"]')).toBeNull();
  expect(api.get.mock.calls.some(([path]) => path === '/onboarding/baseline')).toBe(false);
  expect(api.post).not.toHaveBeenCalled();
});

test('completed native program draft survives temporary appearance withdrawal and resets on actor identity change', async () => {
  mockState = {...mockState, policies: allPolicies(), completed: true}; mockLocation.search = '?tab=program';
  await act(async () => root.render(<ClientProfile/>));
  await act(async () => change(container.querySelector('select[aria-label*="CMMC"]'), 'retired'));
  const reason = [...document.querySelectorAll('[role="dialog"] label')].find(label => label.textContent === 'Retirement reason').querySelector('input');
  await act(async () => change(reason, 'Native draft retained through organization refresh'));
  const reads = api.get.mock.calls.length;
  mockOrg = {...mockOrg, loading: true}; await act(async () => root.render(<ClientProfile/>));
  expect(container.querySelector('.onboarding-completed')).toBeNull();
  expect(document.querySelector('[role="dialog"] input')).toBe(reason);
  expect(reason.value).toBe('Native draft retained through organization refresh');
  mockOrg = {...mockOrg, loading: false}; await act(async () => root.render(<ClientProfile/>));
  expect(container.querySelector('.onboarding-completed')).toBeTruthy();
  expect(document.querySelector('[role="dialog"] input')).toBe(reason);
  expect(api.get.mock.calls.length).toBe(reads);
  mockAuth = {...mockAuth, user: {...mockAuth.user, user_id: 'next_actor'}};
  await act(async () => root.render(<ClientProfile/>));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(api.get.mock.calls.length).toBeGreaterThan(reads);
  expect(api.patch).not.toHaveBeenCalled();
});
