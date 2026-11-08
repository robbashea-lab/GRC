import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import AIGovernance from './AIGovernance';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';
import {frameworkDashboardFixture} from '@/testUtils/frameworkDashboard';
import {sharedProgramProjection} from '@/preview/clientRelationships';

let mockAuth, mockOrg, mockLocation, mockSelectedClient, mockOpenedRecord;
let host, root, records, members, originalRecords, sequence = 0;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/lib/clientSelection', () => ({selectedClient: () => mockSelectedClient}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: true, API: '/api',
  default: {get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn()},
  formatError: error => error.message}));
jest.mock('react-router-dom', () => ({Link: ({children}) => <span>{children}</span>,
  useLocation: () => mockLocation, useNavigate: () => jest.fn(),
  useSearchParams: () => require('react').useState(new URLSearchParams())}), {virtual: true});
// Keep the real page, register, native table controller and Radix menus. The
// editor boundary is observed without exercising unrelated save commands.
jest.mock('@/components/AIRecordView', () => props => {
  mockOpenedRecord = props;
  return <aside data-testid="native-record-boundary"><button onClick={props.onClose}>Close system record</button></aside>;
});
jest.mock('@/components/AIDrawer', () => () => <aside data-testid="legacy-editor-boundary"/>);
jest.mock('@/components/AIOnboardingWizard', () => () => <aside data-testid="guided-create-boundary"/>);
jest.mock('@/components/AIProfileDialog', () => () => null);
jest.mock('@/components/AIIntake', () => ({useAIIntake: () => ({}), AIIntakeView: () => null}));

const menuNames = ['ID', 'AI System / Use Case', 'Owner', 'Provider', 'Purpose / Use',
  'Risk Tier', 'Status', 'Last Review', 'Next Review'];
const headings = ['AI system', 'Screening', 'Approval', 'Owner', 'Risk register', 'Expand'];
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const click = node => act(async () => {expect(node).toBeTruthy(); node.click();});
const render = () => act(async () => root.render(<AIGovernance/>));
const names = () => [...host.querySelectorAll('.system-name strong')].map(node => node.textContent);
const rowIds = () => [...host.querySelectorAll('.system-name')].map(node => node.dataset.expand);
const view = name => host.querySelector(`[data-testid="ai-system-view-${name}"]`);
const search = value => act(async () => {
  const input = host.querySelector('[data-testid="ai-system-search"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', {bubbles: true}));
});
async function closeMenu() {
  const menu = document.querySelector('[role="menu"]');
  if (menu) await act(async () => menu.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
  // Radix restores the old trigger's focus in a zero-delay task after unmount.
  // Finish that native close before opening the next menu, as a user would.
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 0));});
  expect(document.querySelector('[role="menu"]')).toBeNull();
}
async function openMenu(name) {
  await closeMenu();
  const trigger = [...host.querySelectorAll('.column-control')].find(node => node.textContent === name);
  expect(trigger).toBeTruthy();
  await act(async () => trigger.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true, button: 0, ctrlKey: false})));
  const menu = document.querySelector(`[role="menu"][aria-label="${name} options"]`);
  expect(menu?.getAttribute('aria-label')).toBe(`${name} options`);
  return menu;
}
async function choose(name, option) {
  const menu = await openMenu(name);
  await click([...menu.querySelectorAll('[role="menuitemcheckbox"], [role="menuitem"]')]
    .find(node => node.textContent === option));
  await closeMenu();
}
function context(mode = 'standard', framework = null, clientId = `native-ai-${++sequence}`, actor = `actor-${sequence}`, role = 'super_admin') {
  mockAuth = {workspaceMode: mode, user: {user_id: actor, role,
    ...(mode === 'demo' ? {workspace_mode: 'demo'} : {})}, loading: false};
  let client = {client_id: clientId, name: 'Synthetic native controls client', status: framework ? 'active' : 'onboarding',
    cis_program: null, shared_programs: [], onboarding_baseline: {completed: !!framework,
      requirements: framework && framework !== 'general' ? {[framework]: 'applies'} : {}}};
  if (typeof framework === 'number') client = cisClient(clientId, framework);
  if (['iso-27001', 'soc-2'].includes(framework)) {
    const fixture = frameworkDashboardFixture(framework, undefined, clientId);
    client = {...fixture.client, shared_programs: sharedProgramProjection(fixture.db, fixture.client)};
  }
  mockOrg = {currentClientId: clientId, currentClient: client, clients: [client], loading: false};
  mockSelectedClient = clientId;
  mockLocation = {pathname: '/ai-governance', search: `?client_id=${clientId}`};
  window.history.replaceState({}, '', `/ai-governance?client_id=${clientId}`);
  return clientId;
}
function fixtures(clientId, suffix = '') {
  members[clientId] = [{user_id: 'ada', name: `Ada${suffix}`}, {user_id: 'bea', name: `Bea${suffix}`}];
  const row = (id, name, extra) => ({ai_system_id: id, client_id: clientId, display_id: id,
    name, status: 'active', description: 'Internal workflow', provider: 'Native provider', ...extra});
  records[clientId] = [
    row('AI-003', 'Zulu internal draft', {owner_id: 'ada', purposes: ['Document Drafting'], risk_tier: 'high', last_review: day(-7), next_review: day(-2)}),
    row('AI-001', 'Alpha internal customer', {owner_id: 'ada', purposes: ['Customer-Facing'], risk_tier: 'high'}),
    row('AI-002', 'Beta internal draft', {owner_id: 'bea', purposes: ['Document Drafting'], risk_tier: 'low', last_review: day(-40), next_review: day(10)}),
    row('AI-004', 'Gamma external draft', {owner_id: 'ada', purposes: ['Document Drafting'], risk_tier: 'high', description: 'External workflow', last_review: day(-500), next_review: day(45)}),
    row('AI-005', 'Unassigned internal draft', {owner_id: null, purposes: [], risk_tier: null, status: 'draft'}),
    row('AI-006', 'Retired internal draft', {owner_id: 'ada', purposes: ['Document Drafting'], risk_tier: 'high', status: 'retired', next_review: day(-20)}),
    row('AI-007', 'Suspended internal draft', {owner_id: 'bea', purposes: ['Document Drafting'], risk_tier: 'low', status: 'suspended'}),
  ];
  originalRecords = JSON.stringify(records);
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  records = {}; members = {}; mockOpenedRecord = null;
  const clientId = context(); fixtures(clientId);
  api.get.mockImplementation(async (path, options) => ({data: path === '/ai_systems'
    ? records[options.params.client_id] || []
    : path === '/ai-intake' ? {client_id: options.params.client_id, usage: 'yes', indicators: []}
      : members[path.split('/')[2]] || []}));
  api.post.mockReset(); api.patch.mockReset(); api.delete.mockReset();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  expect(JSON.stringify(records)).toBe(originalRecords);
  expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled(); expect(api.delete).not.toHaveBeenCalled();
  jest.clearAllMocks();
});

test.each(['demo', 'standard'])('%s exposes all nine real native menus in the approved visible header row', async mode => {
  const id = context(mode); fixtures(id); await render();
  const header = host.querySelector('.table-scroll thead');
  expect([...header.querySelectorAll('.column-control')].map(node => node.textContent)).toEqual(menuNames);
  const rows = [...header.querySelectorAll('tr')];
  expect(rows[0].querySelectorAll('.column-control')).toHaveLength(9);
  expect([...rows[1].querySelectorAll('th')].map(node => node.textContent)).toEqual(headings);
  expect(host.querySelector('details')).toBeNull(); expect(host.textContent).not.toContain('More controls');
  const expected = {
    ID: ['A → Z', 'Z → A'], 'AI System / Use Case': ['A → Z', 'Z → A'], Provider: ['A → Z', 'Z → A'],
    Owner: ['A → Z', 'Z → A', 'Ada', 'Bea', 'Unassigned'],
    'Purpose / Use': ['A → Z', 'Z → A', 'Customer-Facing', 'Document Drafting'],
    'Risk Tier': ['Lowest First', 'Highest First', 'High', 'Low', 'Not Screened'],
    Status: ['A → Z', 'Z → A', 'Active', 'Draft', 'Retired', 'Suspended'],
    'Last Review': ['Oldest', 'Most Recent', 'Last 30 Days', 'Last 90 Days', 'Last 12 Months', 'Older than 12 Months', 'Never Reviewed'],
    'Next Review': ['Soonest', 'Furthest', 'Overdue', 'Next 30 Days', 'Next 31–90 Days', 'No Review Scheduled'],
  };
  for (const name of menuNames) {
    const menu = await openMenu(name);
    expect([...menu.querySelectorAll('[role="menuitemcheckbox"]')].map(node => node.textContent)).toEqual(expected[name]);
    await closeMenu();
    expect(document.activeElement).toBe([...host.querySelectorAll('.column-control')].find(node => node.textContent === name));
  }
});

test.each(['demo', 'standard'])('%s intersects native search, quick view, filters and sort; resets preserve separate context', async mode => {
  const id = context(mode); fixtures(id); await render();
  await search('internal'); await click(view('high'));
  expect(rowIds()).toEqual(['AI-003', 'AI-001']);
  await choose('AI System / Use Case', 'A → Z');
  expect(rowIds()).toEqual(['AI-001', 'AI-003']);
  await choose('Owner', 'Ada'); await choose('Purpose / Use', 'Document Drafting');
  expect(rowIds()).toEqual(['AI-003']);
  const chips = host.querySelector('[aria-label="Active table filters"]');
  expect(chips).toBeTruthy();
  expect(chips.compareDocumentPosition(host.querySelector('.table-scroll')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await click(host.querySelector('[aria-label="Remove Purpose / Use: Document Drafting"]'));
  expect(rowIds()).toEqual(['AI-001', 'AI-003']);
  expect(host.querySelector('[aria-label="Remove Owner: Ada"]')).toBeTruthy();
  await choose('AI System / Use Case', 'Reset sort');
  expect(rowIds()).toEqual(['AI-003', 'AI-001']);
  expect(host.querySelector('[aria-label="Remove Owner: Ada"]')).toBeTruthy();
  await choose('AI System / Use Case', 'A → Z');
  await choose('Owner', 'Bea');
  await click(host.querySelector('[aria-label="Remove Owner: Ada"]'));
  expect(rowIds()).toEqual([]); expect(host.textContent).toContain('No AI systems match');
  await click([...host.querySelectorAll('button')].find(node => node.textContent === 'Clear all'));
  expect(rowIds()).toEqual(['AI-003', 'AI-001']);
  expect(host.querySelector('[data-testid="ai-system-search"]').value).toBe('internal');
  expect(view('high').getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelector('[aria-label="Active table filters"]')).toBeNull();
  const menu = await openMenu('AI System / Use Case');
  expect(menu.textContent).not.toContain('Reset sort'); await closeMenu();
});

test.each(['demo', 'standard'])('%s retains native nullable member, screening and date filters without changing records', async mode => {
  const id = context(mode); fixtures(id); await render();
  await choose('Owner', 'Unassigned'); expect(rowIds()).toEqual(['AI-005']);
  await choose('Owner', 'Clear Owner'); expect(rowIds()).toHaveLength(5);
  await choose('Risk Tier', 'Not Screened'); expect(rowIds()).toEqual(['AI-005']);
  await choose('Risk Tier', 'Clear Risk Tier');
  await choose('Last Review', 'Never Reviewed'); expect(rowIds()).toEqual(['AI-001', 'AI-005']);
  await choose('Last Review', 'Clear Last Review');
  await choose('Next Review', 'No Review Scheduled'); expect(rowIds()).toEqual(['AI-001', 'AI-005']);
  await choose('Next Review', 'Clear Next Review');
  await choose('Next Review', 'Overdue'); expect(rowIds()).toEqual(['AI-003']);
  await choose('Next Review', 'Clear Next Review');
  await choose('Next Review', 'Next 30 Days'); expect(rowIds()).toEqual(['AI-002']);
  await choose('Next Review', 'Clear Next Review');
  await choose('Next Review', 'Next 31–90 Days'); expect(rowIds()).toEqual(['AI-004']);
  await choose('Next Review', 'Clear Next Review');
  await choose('Risk Tier', 'Highest First'); expect(rowIds()).toEqual(['AI-003', 'AI-001', 'AI-004', 'AI-002', 'AI-005']);
  await choose('Status', 'Draft'); expect(rowIds()).toEqual(['AI-005']);
});

test.each(['demo', 'standard'].flatMap(mode => [null, 'general', 'hipaa', 'nist-csf-2', 'cmmc'].map(framework => [mode, framework])))(
  '%s %s restores only the generic inactive population and keeps table/search constraints', async (mode, framework) => {
    const id = context(mode, framework); fixtures(id); await render();
    expect(host.querySelector('.archive-toggle input[type="checkbox"]')).toBeNull();
    expect(view('inactive')).toBeTruthy();
    await search('internal'); await choose('AI System / Use Case', 'A → Z');
    await click(view('inactive'));
    expect(rowIds()).toEqual(['AI-006', 'AI-007']);
    expect(view('inactive').getAttribute('aria-pressed')).toBe('true');
    await choose('Owner', 'Ada'); expect(rowIds()).toEqual(['AI-006']);
    await click(view('active'));
    expect(rowIds()).toEqual(['AI-001', 'AI-003']);
    expect(host.querySelector('[data-testid="ai-system-search"]').value).toBe('internal');
    expect(host.querySelector('[aria-label="Remove Owner: Ada"]')).toBeTruthy();
  });

test.each(['demo', 'standard'].flatMap(mode => [1, 2, 3, 'iso-27001', 'soc-2'].map(framework => [mode, framework])))(
  '%s %s keeps enrolled include-inactive behavior with the same native table constraints', async (mode, framework) => {
    const id = context(mode, framework); fixtures(id); await render();
    expect(view('inactive')).toBeNull();
    const checkbox = host.querySelector('.archive-toggle input[type="checkbox"]');
    expect(checkbox).toBeTruthy(); expect(checkbox.checked).toBe(false);
    await choose('Owner', 'Ada');
    expect(rowIds()).toEqual(['AI-003', 'AI-001', 'AI-004']);
    await click(checkbox);
    expect(rowIds()).toEqual(['AI-003', 'AI-001', 'AI-004', 'AI-006']);
    await click(checkbox);
    expect(rowIds()).toEqual(['AI-003', 'AI-001', 'AI-004']);
    expect([...host.querySelectorAll('.filter-chip')].map(node => node.dataset.testid)).toEqual(
      ['active', 'due', 'high', 'third', 'customer', 'pending'].map(name => `ai-system-view-${name}`));
  });

test('same actor/client remount retains native table state; record close preserves filters and exact identity', async () => {
  const id = mockOrg.currentClientId; await render();
  await choose('Owner', 'Ada'); await choose('AI System / Use Case', 'A → Z');
  expect(rowIds()).toEqual(['AI-001', 'AI-004', 'AI-003']);
  await click(host.querySelector('.system-name[data-expand="AI-004"]'));
  await click([...host.querySelectorAll('.inline-actions button')].find(node => node.textContent === 'Open system record'));
  expect(mockOpenedRecord.record.ai_system_id).toBe('AI-004'); expect(mockOpenedRecord.clientId).toBe(id);
  expect(mockOpenedRecord.canWrite).toBe(true);
  await click(host.querySelector('[data-testid="native-record-boundary"] button'));
  expect(rowIds()).toEqual(['AI-001', 'AI-004', 'AI-003']);
  expect(host.querySelector('[aria-label="Remove Owner: Ada"]')).toBeTruthy();
  await act(async () => root.render(null)); await render();
  expect(rowIds()).toEqual(['AI-001', 'AI-004', 'AI-003']);
  expect(host.querySelector('[aria-label="Remove Owner: Ada"]')).toBeTruthy();
});

test.each(['client', 'actor'])('%s change clears native table state and member choices before a different scope is shown', async change => {
  await render(); await choose('Owner', 'Ada'); await choose('AI System / Use Case', 'A → Z');
  const priorId = mockOrg.currentClientId, priorActor = mockAuth.user.user_id;
  const id = change === 'client' ? `${priorId}-other` : priorId;
  context('standard', null, id, change === 'actor' ? 'different-actor' : priorActor);
  fixtures(id, ' second scope'); await render();
  expect(host.querySelector('[aria-label="Active table filters"]')).toBeNull();
  expect(rowIds()).toEqual(['AI-003', 'AI-001', 'AI-002', 'AI-004', 'AI-005']);
  const menu = await openMenu('Owner');
  expect(menu.textContent).toContain('Ada second scope'); expect(menu.textContent).not.toContain('Reset sort');
  expect([...menu.querySelectorAll('[role="menuitemcheckbox"]')].map(node => node.textContent)).not.toContain('Ada');
  await closeMenu();
});

test.each(['demo', 'standard'].flatMap(mode => [1, 'iso-27001', 'soc-2'].map(framework => [mode, framework])))(
  '%s later %s enrollment replaces only the obsolete inactive view after verified context returns', async (mode, framework) => {
    const id = context(mode), actor = mockAuth.user.user_id; fixtures(id); await render();
    await search('internal'); await choose('Owner', 'Ada'); await click(view('inactive'));
    expect(rowIds()).toEqual(['AI-006']);
    mockOrg = {...mockOrg, loading: true}; await render();
    expect(host.querySelector('.column-control')).toBeNull(); expect(host.querySelector('.system-row')).toBeNull();
    mockOrg = {...mockOrg, loading: false}; await render();
    expect(view('inactive').getAttribute('aria-pressed')).toBe('true'); expect(rowIds()).toEqual(['AI-006']);
    // Same actor/client identity and saved inventory; only verified native enrollment changes.
    context(mode, framework, id, actor); await render();
    expect(view('inactive')).toBeNull(); expect(view('active').getAttribute('aria-pressed')).toBe('true');
    const checkbox = host.querySelector('.archive-toggle input[type="checkbox"]');
    expect(checkbox).toBeTruthy(); expect(checkbox.checked).toBe(false);
    expect(host.querySelector('[data-testid="ai-system-search"]').value).toBe('internal');
    expect(host.querySelector('[aria-label="Remove Owner: Ada"]')).toBeTruthy();
    expect(rowIds()).toEqual(['AI-003', 'AI-001']);
  });

test('late prior-client reads cannot populate current controls or member options', async () => {
  const oldId = mockOrg.currentClientId, oldGet = api.get.getMockImplementation();
  let resolveOldRows;
  api.get.mockImplementation((path, options) => path === '/ai_systems' && options.params.client_id === oldId
    ? new Promise(resolve => {resolveOldRows = resolve;}) : oldGet(path, options));
  await render(); expect(host.querySelector('.column-control')).toBeNull();
  const newId = context('standard', null, `${oldId}-new`); fixtures(newId, ' current'); await render();
  expect(rowIds()).toHaveLength(5);
  await act(async () => resolveOldRows({data: [{...records[oldId][0], name: 'Stale client record'}]}));
  expect(host.textContent).not.toContain('Stale client record');
  const menu = await openMenu('Owner');
  expect(menu.textContent).toContain('Ada current');
  expect([...menu.querySelectorAll('[role="menuitemcheckbox"]')].map(node => node.textContent)).not.toContain('Ada');
  await closeMenu();
});

test('mixed-client data fails closed instead of exposing a healthy native control row', async () => {
  const get = api.get.getMockImplementation();
  api.get.mockImplementation((path, options) => path === '/ai_systems'
    ? Promise.resolve({data: [{...records[mockOrg.currentClientId][0], client_id: 'unrelated-client'}]}) : get(path, options));
  await render();
  expect(host.textContent).toContain('Client data mismatch');
  expect(host.querySelector('.column-control')).toBeNull(); expect(host.querySelector('.system-row')).toBeNull();
});

test('read-only clients retain read controls but gain no creation or record-write authority', async () => {
  const id = context('standard', null, undefined, undefined, 'client_readonly'); fixtures(id); await render();
  expect(host.querySelectorAll('.table-scroll .column-control')).toHaveLength(9);
  expect(host.querySelector('[data-testid="new-ai-system"]')).toBeNull();
  await choose('Owner', 'Ada');
  await click(host.querySelector('.system-name'));
  await click([...host.querySelectorAll('.inline-actions button')].find(node => node.textContent === 'Open system record'));
  expect(mockOpenedRecord.record.ai_system_id).toBe('AI-003'); expect(mockOpenedRecord.clientId).toBe(id);
  expect(mockOpenedRecord.canWrite).toBe(false);
});
