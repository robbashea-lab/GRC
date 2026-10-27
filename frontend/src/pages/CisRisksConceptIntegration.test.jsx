import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import RiskRegister from './RiskRegister';
import api from '@/lib/api';
import {rememberClient} from '@/lib/clientSelection';
import {cisClient} from '@/testUtils/cisExperience';
import {cisClientProgram} from '@/lib/cisExperience';
import {brawndoFullRecordEligible} from '@/lib/brawndoFullRecord';

let mockAuth, mockOrg, mockSearch;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/lib/api', () => ({
  __esModule: true, API: '/api', PREVIEW_MODE: true,
  default: {get: jest.fn(), post: jest.fn(), patch: jest.fn()},
  formatError: error => error.message,
}));
jest.mock('react-router-dom', () => ({
  Link: ({children, to}) => <a href={to}>{children}</a>,
  useLocation: () => ({pathname: '/risks', search: mockSearch}),
  useNavigate: () => jest.fn(),
  useSearchParams: () => require('react').useState(new URLSearchParams(mockSearch)),
}), {virtual: true});
jest.mock('sonner', () => ({toast: {error: jest.fn(), success: jest.fn(), info: jest.fn()}}));

// Keep both operational drawers real. Existing native workflow suites cover their commands.
let root, host, risks, tasks, actorSequence = 0;
const cases = [1, 2, 3].flatMap(group => ['demo', 'standard'].map(mode => [group, mode]));
const existingClients = {1: 'demo_brawndo', 2: 'demo_initech', 3: 'demo_krusty'};
const render = () => act(async () => root.render(<RiskRegister/>));
const click = node => act(async () => { expect(node).toBeTruthy(); node.click(); });
const concept = () => host.querySelector('[data-testid="cis-risks-concept"]');
const riskDrawer = () => document.querySelector('[data-testid="risks-drawer"]');
const actionDrawer = () => document.querySelector('[data-testid="remediation-ticket-drawer"]');
const rowTitles = () => [...host.querySelectorAll('tbody .risk-title')].map(node => node.textContent);
const noWrites = () => {
  expect(api.post).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
};

function selectClient(client, mode = 'demo') {
  mockAuth = {workspaceMode: mode, loading: false, user: {
    user_id: `risk-concept-actor-${++actorSequence}`, role: 'super_admin', workspace_mode: mode,
  }};
  mockOrg = {currentClientId: client.client_id, currentClient: client, clients: [client], loading: false};
  rememberClient(client.client_id);
}

function risk(overrides = {}) {
  return {
    risk_id: 'risk-native', client_id: mockOrg.currentClientId, display_id: 'RISK-001',
    title: 'Native recovery risk', description: 'Saved native risk description.', category: 'operational',
    status: 'assessed', likelihood_score: 3, impact_score: 4, treatment: 'mitigate',
    source_type: 'manual', review_cadence: 'annual', next_review: '2026-11-05',
    last_reviewed: '2026-09-27', updated_at: '2026-10-20T12:00:00Z', ...overrides,
  };
}

function nativeRead(path) {
  if (path === '/risks') return Promise.resolve({data: risks});
  if (path === '/tasks') return Promise.resolve({data: tasks});
  if (path.startsWith('/risks/') && !path.endsWith('/activity') && !path.endsWith('/review-history')) {
    return Promise.resolve({data: risks.find(record => record.risk_id === path.split('/').at(-1))});
  }
  if (path.startsWith('/tasks/') && !path.endsWith('/activity')) {
    return Promise.resolve({data: tasks.find(record => record.task_id === path.split('/').at(-1))});
  }
  if (path === '/related') return Promise.resolve({data: {tasks: []}});
  if (path === '/onboarding/state') return Promise.resolve({data: {assessments: []}});
  if (path === '/evidence/catalog') return Promise.resolve({data: {items: [], counts: {direct: 0}, total: 0, page_size: 25}});
  if (path.endsWith('/members')) return Promise.resolve({data: [{user_id: 'owner-native', name: 'Native Owner', status: 'active'}]});
  return Promise.resolve({data: []});
}

beforeAll(() => Object.defineProperty(global, 'crypto', {configurable: true, value: require('crypto').webcrypto}));
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-24T18:00:00Z'));
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear(); mockSearch = '';
  window.history.replaceState({}, '', '/risks');
  selectClient(cisClient('demo_brawndo'));
  risks = [risk()]; tasks = [];
  api.get.mockImplementation(nativeRead);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); jest.clearAllMocks(); jest.useRealTimers();
});

test.each(['existing', 'new'].flatMap(scenario => cases.map(([group, mode]) => [scenario, group, mode])))('%s saved IG%i %s client receives the same concept and complete client-scoped reads', async (scenario, group, mode) => {
  const id = scenario === 'existing' ? existingClients[group] : `new_risk_client_ig${group}_${mode}`;
  const client = cisClient(id, group);
  selectClient(client, mode); risks = [risk()];
  await render();
  expect(concept()).not.toBeNull();
  expect(rowTitles()).toEqual(['Native recovery risk']);
  for (const path of ['/risks', '/tasks']) {
    expect(api.get).toHaveBeenCalledWith(path, expect.objectContaining({params: expect.objectContaining({client_id: id})}));
  }
  noWrites();
});

test.each(cases)('common presentation survives later IG%i %s enrollment without reseeding existing records', async (group, mode) => {
  const clientId = `later_risk_client_ig${group}_${mode}`;
  selectClient({client_id: clientId, name: 'Later enrolled client', status: 'active'}, mode);
  risks = [risk({risk_id: 'retained-before-enrollment', display_id: 'RISK-019'})];
  const retained = JSON.stringify(risks);
  await render();
  expect(concept()).not.toBeNull();
  expect(cisClientProgram(mockOrg.currentClient)).toBeNull();
  expect(host.querySelector('tbody').textContent).toContain('Native recovery risk');
  const enrolled = cisClient(clientId, group);
  mockOrg = {...mockOrg, currentClient: enrolled, clients: [enrolled]};
  await render();
  expect(cisClientProgram(mockOrg.currentClient).implementationGroup).toBe(group);
  expect(concept()).not.toBeNull();
  expect(rowTitles()).toEqual(['Native recovery risk']);
  await click(host.querySelector('tbody .risk-title'));
  expect(riskDrawer().textContent).toContain('RISK-019');
  expect(riskDrawer().querySelector('[aria-label="Title"]').value).toBe('Native recovery risk');
  expect(JSON.stringify(risks)).toBe(retained);
  noWrites();
});

test('a client without CIS enrollment receives common presentation and keeps native record access', async () => {
  selectClient({client_id: 'demo_dunder', name: 'Non-CIS client', status: 'active'});
  risks = [risk()];
  await render();
  expect(concept()).not.toBeNull();
  expect([...host.querySelectorAll('thead th')].map(node => node.textContent.trim())).toEqual(['Risk', 'Score', 'Owner', 'Status', 'Next review', 'Open risk']);
  expect(host.querySelector('[data-testid="risk-matrix-btn"]').textContent).toContain('Risk scale');
  expect(host.querySelector('.filter-button')).not.toBeNull();
  expect(api.get).toHaveBeenCalledWith('/tasks', expect.objectContaining({params: {client_id: 'demo_dunder'}}));
  expect(cisClientProgram(mockOrg.currentClient)).toBeNull();
  expect(brawndoFullRecordEligible({...mockAuth, ...mockOrg, pathname: '/risks', selectedClientId: 'demo_dunder', clientId: 'demo_dunder', record: risks[0]})).toBe(false);
  expect(host.querySelector('tbody .risk-id').textContent).toBe('RISK-001');
  await click(host.querySelector('tbody .risk-title'));
  // The established non-enrolled drawer shows the saved title, not the full-record ID heading.
  expect(riskDrawer().classList.contains('brawndo-risk-workflow')).toBe(false);
  expect(riskDrawer().querySelector('[aria-label="Title"]').value).toBe('Native recovery risk');
  expect(riskDrawer().querySelector('[aria-label="Description"]').value).toBe('Saved native risk description.');
  expect(api.get).toHaveBeenCalledWith('/risks/risk-native/activity');
  noWrites();
});

test('mixed client-wide risks remain available with stable identities and Risk ID ordering', async () => {
  risks = [
    risk({risk_id: 'manual-risk', display_id: 'RISK-004', title: 'Manual operational risk'}),
    risk({risk_id: 'ai-risk', display_id: 'RISK-002', title: 'AI model risk', category: 'ai_governance', ai_system_id: 'native-ai'}),
    risk({risk_id: 'vendor-risk', display_id: 'RISK-003', title: 'Vendor supply risk', category: 'vendor', vendor_id: 'native-vendor'}),
    risk({risk_id: 'org-risk', display_id: 'RISK-001', title: 'Organization-wide risk', framework_key: 'iso27001'}),
  ];
  await render();
  expect(rowTitles()).toEqual(['Organization-wide risk', 'AI model risk', 'Vendor supply risk', 'Manual operational risk']);
  await click([...host.querySelectorAll('tbody .risk-title')].find(node => node.textContent === 'AI model risk'));
  expect(riskDrawer().textContent).toContain('RISK-002');
  expect(riskDrawer().querySelector('[aria-label="Title"]').value).toBe('AI model risk');
  expect(riskDrawer().querySelector('[aria-label="Category"]').value).toBe('ai_governance');
  noWrites();
});

test.each(['unconfigured','general','hipaa','nist-csf-2','cmmc'])('%s retains native severity/score order while explicit common sorting still works',async framework=>{
  const client={client_id:`native-risk-order-${framework}`,name:'Synthetic common client',status:'active',shared_programs:[],
    onboarding_baseline:{completed:framework!=='unconfigured',requirements:['unconfigured','general'].includes(framework)?{}:{[framework]:'applies'}}};
  selectClient(client);risks=[risk({risk_id:'low-native',display_id:'RISK-001',title:'A low score',risk_level:'low',risk_score:3,likelihood_score:1,impact_score:3}),
    risk({risk_id:'high-native',display_id:'RISK-009',title:'Z high score',risk_level:'high',risk_score:15,likelihood_score:3,impact_score:5})];
  const before=JSON.stringify(risks);await render();
  expect(concept()).toBeTruthy();expect(cisClientProgram(client)).toBeNull();
  expect(rowTitles()).toEqual(['Z high score','A low score']);
  await click(host.querySelector('.filter-button'));
  const sort=host.querySelector('[aria-label="Sort risks"]');expect(sort.value).toBe('native');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(sort,'title:asc');sort.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(rowTitles()).toEqual(['A low score','Z high score']);
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(sort,'native');sort.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(rowTitles()).toEqual(['Z high score','A low score']);expect(JSON.stringify(risks)).toBe(before);noWrites();
});

test('Owner name sorting uses displayed names for CIS and common client presentation', async () => {
  risks = [risk({risk_id: 'risk-zoe', display_id: 'RISK-001', title: 'Risk owned by Zoe', owner_id: 'owner-a'}),
    risk({risk_id: 'risk-ada', display_id: 'RISK-002', title: 'Risk owned by Ada', owner_id: 'owner-z'})];
  const owners = [{user_id: 'owner-a', name: 'Zoe Native', status: 'active'},
    {user_id: 'owner-z', name: 'Ada Native', status: 'active'}];
  api.get.mockImplementation(path => path.endsWith('/members') ? Promise.resolve({data: owners}) : nativeRead(path));
  await render();
  expect(rowTitles()).toEqual(['Risk owned by Zoe', 'Risk owned by Ada']);
  await click(host.querySelector('.filter-button'));
  const sort = host.querySelector('[aria-label="Sort risks"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sort, 'owner_id:asc');
    sort.dispatchEvent(new Event('change', {bubbles: true}));
  });
  expect(rowTitles()).toEqual(['Risk owned by Ada', 'Risk owned by Zoe']);
  expect([...host.querySelectorAll('tbody .risk-owner')].map(node => node.textContent)).toEqual(['Ada Native', 'Zoe Native']);
  const ownerControl = host.querySelector('[aria-label="Owner: sort and filter"]');
  expect(ownerControl).not.toBeNull();
  await act(async () => ownerControl.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true, button: 0, ctrlKey: false})));
  await click([...document.querySelectorAll('[role="menuitemcheckbox"]')].find(node => node.textContent === 'Z → A'));
  expect(rowTitles()).toEqual(['Risk owned by Zoe', 'Risk owned by Ada']);
  selectClient({client_id: 'non-cis-owners', name: 'Non-CIS owners', status: 'active'});
  risks = risks.map(record => ({...record, client_id: mockOrg.currentClientId}));
  await render();
  expect(concept()).not.toBeNull();
  expect(cisClientProgram(mockOrg.currentClient)).toBeNull();
  await click(host.querySelector('.filter-button'));
  expect(host.querySelector('[aria-label="Assigned Owner: filter"]')).toBeNull();
  expect(host.querySelector('[aria-label="Owner: sort and filter"]')).not.toBeNull();
  expect([...host.querySelectorAll('tbody .risk-owner')].map(node => node.textContent)).toEqual(['Zoe Native', 'Ada Native']);
  const commonSort = host.querySelector('[aria-label="Sort risks"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(commonSort, 'owner_id:asc');
    commonSort.dispatchEvent(new Event('change', {bubbles: true}));
  });
  expect(rowTitles()).toEqual(['Risk owned by Ada', 'Risk owned by Zoe']);
  expect([...host.querySelectorAll('tbody .risk-owner')].map(node => node.textContent)).toEqual(['Ada Native', 'Zoe Native']);
  noWrites();
});

test('native status filters retain grouped Open and In Treatment while Retired stays distinct', async () => {
  const statuses = ['identified', 'assessed', 'open', 'in_progress', 'treated', 'retired', 'closed'];
  risks = statuses.map((status, index) => risk({risk_id: `status-${status}`, display_id: `RISK-00${index + 1}`,
    title: `Native ${status} record`, status}));
  await render();
  expect(rowTitles()).toHaveLength(5);
  await click(host.querySelector('.filter-button'));
  const statusControl = host.querySelector('[aria-label="Status: filter"]');
  expect(statusControl).not.toBeNull();
  await act(async () => statusControl.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true, button: 0, ctrlKey: false})));
  const choices = () => [...document.querySelectorAll('[role="menuitemcheckbox"]')];
  const choice = label => choices().find(node => node.textContent === label);
  for (const label of ['Open', 'In Treatment', 'Retired (legacy)']) {
    expect(choices().filter(node => node.textContent === label)).toHaveLength(1);
  }
  await click(choice('Open'));
  expect(rowTitles()).toEqual(['Native identified record', 'Native assessed record', 'Native open record']);
  expect(choice('Open').getAttribute('aria-checked')).toBe('true');
  await click(choice('Open'));
  await click(choice('In Treatment'));
  expect(rowTitles()).toEqual(['Native in_progress record', 'Native treated record']);
  expect(choice('In Treatment').getAttribute('aria-checked')).toBe('true');
  await click(choice('In Treatment'));
  await click(choice('Retired (legacy)'));
  expect(rowTitles()).toEqual(['Native retired record']);
  expect(host.querySelector('tbody .risk-status').textContent).toBe('Retired (legacy)');
  expect(host.querySelector('tbody tr').dataset.riskRow).toBe('status-retired');
  expect(host.querySelector('[data-testid="risk-view-active"]').getAttribute('aria-pressed')).toBe('false');
  expect(host.querySelector('[data-testid="risk-count"]').textContent).toBe('1 risk matching this selection');
  await click(choice('Retired (legacy)'));
  await click(choice('Closed'));
  expect(rowTitles()).toEqual(['Native closed record']);
  expect(host.querySelector('[data-testid="risk-view-active"]').getAttribute('aria-pressed')).toBe('false');
  expect(host.querySelector('[data-testid="risk-count"]').textContent).toBe('1 risk matching this selection');
  noWrites();
});

test.each(['new-risk', 'risk-matrix-btn'])('keyboard activation of native %s suspends Filters and retains native Escape behavior', async testId => {
  await render();
  const filterButton = host.querySelector('.filter-button');
  await click(filterButton);
  expect(host.querySelector('[aria-label="Risk filters"]')).not.toBeNull();
  expect(filterButton.getAttribute('aria-expanded')).toBe('true');
  const nativeButton = host.querySelector(`[data-testid="${testId}"]`);
  // Keyboard activation has no pointerdown to dismiss Filters on the way to the native opener.
  await act(async () => { nativeButton.focus(); nativeButton.click(); });
  await act(async () => jest.advanceTimersByTime(30));
  expect(host.querySelector('[aria-label="Risk filters"]')).toBeNull();
  expect(filterButton.getAttribute('aria-expanded')).toBe('false');
  const modal = testId === 'new-risk' ? document.querySelector('[data-testid="new-risk-dialog"]')
    : [...document.querySelectorAll('[role="dialog"]')].find(node => node.textContent.includes('Risk Scale & 5×5 Matrix'));
  expect(modal).toBeTruthy();
  expect(modal.contains(document.activeElement)).toBe(true);
  if (testId === 'new-risk') {
    const title = modal.querySelector('[data-testid="new-risk-title"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(title, 'Keep this unfinished native Risk');
      title.dispatchEvent(new Event('input', {bubbles: true}));
    });
  }
  await act(async () => modal.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape', bubbles: true, cancelable: true})));
  await act(async () => jest.advanceTimersByTime(30));
  expect(host.querySelector('[aria-label="Risk filters"]')).toBeNull();
  expect(filterButton.getAttribute('aria-expanded')).toBe('false');
  if (testId === 'new-risk') {
    const discard = document.querySelector('[role="alertdialog"]');
    expect(discard).not.toBeNull();
    expect(discard.textContent).toContain('Discard new Risk?');
    expect(discard.contains(document.activeElement)).toBe(true);
    expect(document.querySelector('[data-testid="new-risk-dialog"]')).toBe(modal);
  } else {
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).not.toBe(filterButton);
  }
  noWrites();
});

test.each(['row', 'matrix'])('%s selection opens the complete existing native Risk editor', async entry => {
  await render();
  if (entry === 'matrix') {
    await click(host.querySelector('.matrix-cell.occupied'));
    expect(riskDrawer()).toBeNull();
    await click(document.querySelector('.date-review'));
  } else await click(host.querySelector('tbody .risk-title'));
  const drawer = riskDrawer();
  expect(drawer).not.toBeNull();
  expect(drawer.querySelector('[aria-label="Title"]').value).toBe(risks[0].title);
  expect(drawer.querySelector('[aria-label="Risk description"]').value).toBe(risks[0].description);
  expect([...drawer.querySelectorAll('[role="tab"]')].map(node => node.textContent.replace(/\d+$/, ''))).toEqual(['Overview', 'Assessment', 'Treatment', 'Review history', 'Activity']);
  for (const label of ['Review risk', 'Accept risk', 'Close risk', 'Save changes']) {
    expect([...drawer.querySelectorAll('button')].some(node => node.textContent === label)).toBe(true);
  }
  noWrites();
});

test('a saved treatment event opens its exact full native Action despite a matching Risk title', async () => {
  risks = [risk({title: 'Shared native title', next_review: '2027-01-05'})];
  tasks = [{task_id: 'native-treatment', client_id: mockOrg.currentClientId, risk_id: risks[0].risk_id,
    title: risks[0].title, status: 'open', priority: 'high', due_date: '2026-11-03',
    description: 'Actual saved treatment plan.', resolution: '', source_type: 'risk', source_id: risks[0].risk_id}];
  await render();
  await click(host.querySelector('[data-event-id="demo_brawndo:action:native-treatment"]'));
  await click(document.querySelector('.date-review.highlight'));
  expect(api.get).toHaveBeenCalledWith('/tasks/native-treatment');
  const drawer = actionDrawer();
  expect(drawer).not.toBeNull();
  expect(drawer.querySelector('[data-ticket-task="native-treatment"]')).not.toBeNull();
  expect(drawer.querySelector('[aria-label="Action title"]').value).toBe('Shared native title');
  expect(drawer.querySelector('[aria-label="Planned action"]').value).toBe('Actual saved treatment plan.');
  expect(drawer.querySelector('[aria-label="Due date"]').value).toBe('2026-11-03');
  expect(drawer.querySelector('[aria-label="Actual resolution"]')).not.toBeNull();
  expect(riskDrawer()).toBeNull();
  noWrites();
});

test('readonly access keeps native record opening while withholding creation and editing', async () => {
  mockAuth = {...mockAuth, user: {...mockAuth.user, role: 'client_viewer', client_ids: [mockOrg.currentClientId]}};
  await render();
  expect(concept()).not.toBeNull();
  expect(host.querySelector('[data-testid="new-risk"]')).toBeNull();
  await click(host.querySelector('tbody .risk-title'));
  expect(riskDrawer().querySelector('[aria-label="Title"]').disabled).toBe(true);
  expect([...riskDrawer().querySelectorAll('button')].find(node => node.textContent === 'Save changes').disabled).toBe(true);
  expect([...riskDrawer().querySelectorAll('button')].some(node => node.textContent === 'Review risk')).toBe(false);
  noWrites();
});

test('native Closed membership retains distinctly labelled retired records and their full history access', async () => {
  risks = [risk(), risk({risk_id: 'legacy-retired', display_id: 'RISK-008', title: 'Historical retired risk', status: 'retired'}),
    risk({risk_id: 'native-closed', display_id: 'RISK-009', title: 'Historical closed risk', status: 'closed'})];
  await render();
  expect(rowTitles()).toEqual(['Native recovery risk']);
  await click(host.querySelector('[data-testid="risk-view-closed"]'));
  expect(rowTitles()).toEqual(['Historical retired risk', 'Historical closed risk']);
  expect(host.querySelector('tbody').textContent).toContain('Retired (legacy)');
  await click(host.querySelector('tbody .risk-title'));
  expect(riskDrawer().textContent).toContain('RISK-008');
  expect(riskDrawer().querySelector('[aria-label="Title"]').disabled).toBe(true);
  expect([...riskDrawer().querySelectorAll('[role="tab"]')].some(node => node.textContent.startsWith('Review history'))).toBe(true);
  noWrites();
});

test('an empty eligible register still requests linked Actions for the actual client', async () => {
  risks = [];
  await render();
  expect(concept()).not.toBeNull();
  expect(api.get).toHaveBeenCalledWith('/tasks', expect.objectContaining({params: {client_id: mockOrg.currentClientId}}));
  expect(host.textContent).toContain('No risks have been added yet.');
  noWrites();
});

test('a foreign Risk in the collection cannot enter the concept or a native drawer', async () => {
  risks = [risk(), risk({risk_id: 'foreign-risk', client_id: 'another-client', title: 'Foreign private risk'})];
  await render();
  expect(concept()).toBeNull();
  expect(host.textContent).not.toContain('Foreign private risk');
  expect(riskDrawer()).toBeNull();
  noWrites();
});

test('an individual foreign linked response is refused before a native record opens', async () => {
  mockSearch = '?id=risk-native&client_id=demo_brawndo';
  api.get.mockImplementation(path => path === '/risks/risk-native'
    ? Promise.resolve({data: {...risks[0], client_id: 'another-client'}}) : nativeRead(path));
  await render();
  expect(riskDrawer()).toBeNull();
  expect(host.textContent).toContain('Record belongs to another client');
  noWrites();
});

test.each(['actor', 'client', 'mode'])('a pending treatment opener cannot publish its previous %s context', async boundary => {
  risks[0].next_review = '2027-01-05';
  const previousTask = {task_id: 'pending-treatment', client_id: mockOrg.currentClientId, risk_id: risks[0].risk_id,
    title: 'Pending native Action', status: 'open', due_date: '2026-11-03'};
  tasks = [previousTask];
  let finishOpen;
  api.get.mockImplementation(path => path === '/tasks/pending-treatment'
    ? new Promise(resolve => { finishOpen = resolve; }) : nativeRead(path));
  await render();
  await click(host.querySelector('.agenda-entry'));
  expect(finishOpen).toBeDefined();
  if (boundary === 'actor') mockAuth = {...mockAuth, user: {...mockAuth.user, user_id: 'replacement-actor'}};
  if (boundary === 'mode') mockAuth = {...mockAuth, workspaceMode: 'standard', user: {...mockAuth.user, workspace_mode: 'standard'}};
  if (boundary === 'client') {
    selectClient(cisClient('replacement-client'));
    risks = [risk({risk_id: 'replacement-risk', title: 'Replacement client risk'})]; tasks = [];
  }
  await render();
  await act(async () => finishOpen({data: previousTask}));
  expect(actionDrawer()).toBeNull();
  expect(riskDrawer()).toBeNull();
  noWrites();
});
