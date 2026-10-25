import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import VendorRegister from './VendorRegister';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';

jest.setTimeout(15000);

let mockPath = '/vendors', mockSearch = '';
let mockAuth, mockOrg, mockDrawerProps;
const mockNavigate = jest.fn();
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/context/OrgContext', () => ({ useOrg: () => mockOrg }));
jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPath, search: mockSearch }), useNavigate: () => mockNavigate,
  useSearchParams: () => require('react').useState(new URLSearchParams(mockSearch)),
}), { virtual: true });
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() }, formatError: error => error.message, PREVIEW_MODE: true }));
jest.mock('@/components/RecordDrawer', () => function NativeDrawer(props) {
  mockDrawerProps = props;
  const [draft, setDraft] = require('react').useState('Native draft');
  return props.open && <aside data-testid="native-vendor-drawer"><span>{props.record?.vendor_id}</span><span>{props.initialValues?.vendorTab}</span><input aria-label="Native draft" value={draft} onChange={event => setDraft(event.target.value)} /><button type="button" onClick={props.onSaved}>Refresh native relations</button></aside>;
});

let root, container;
const vendor = { vendor_id: 'v1', client_id: 'demo_brawndo', name: 'Recorded vendor', status: 'active', criticality: 'high', service: 'Actual service', assurance_records: [] };
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('grc_client_id', 'demo_brawndo');
  mockPath = '/vendors'; mockSearch = ''; mockAuth = { workspaceMode: 'demo', user: { user_id: 'demo-actor', role: 'super_admin', workspace_mode: 'demo' } };
  mockOrg = { currentClientId: 'demo_brawndo', currentClient: { ...cisClient('demo_brawndo',1), name: 'Brawndo' }, clients: [cisClient('demo_brawndo',1)] };
  api.get.mockImplementation(async path => ({ data: path === '/vendors' ? [{ ...vendor, client_id: mockOrg.currentClientId }] : [] }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.clearAllMocks(); });
const click = node => act(async () => node.click());

test('canonical target forwards original native record/tab and remains mounted through same-client refresh', async () => {
  await act(async () => root.render(<VendorRegister />));
  expect(container.querySelector('[data-testid="additional-vendors"]')).toBeTruthy();
  await click(container.querySelector('.bav-assurance button'));
  const drawer = container.querySelector('[data-testid="native-vendor-drawer"]');
  expect(drawer.textContent).toContain('v1assurance');
  const input = drawer.querySelector('input');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Unsaved native draft'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await click(drawer.querySelector('button'));
  expect(container.querySelector('[data-testid="native-vendor-drawer"]')).toBe(drawer);
  expect(input.value).toBe('Unsaved native draft');
  api.get.mockImplementationOnce(async () => { throw new Error('Refresh unavailable'); });
  await click(drawer.querySelector('button'));
  expect(container.querySelector('[role="alert"]').textContent).toContain('Refresh unavailable');
  expect([...container.querySelectorAll('.bapv-kcell strong')].map(node => node.textContent)).toEqual(['—', '—', '—', '—']);
  expect(container.querySelector('[data-testid="native-vendor-drawer"]')).toBe(drawer);
  expect(input.value).toBe('Unsaved native draft');
});

test.each(['existing', 'new'])('routine organization refresh preserves a dirty %s vendor editor while appearance withdraws', async editor => {
  await act(async () => root.render(<VendorRegister />));
  await click(container.querySelector(editor === 'existing' ? '.bav-assurance button' : '[data-testid="new-vendor"]'));
  const drawer = container.querySelector('[data-testid="native-vendor-drawer"]');
  const input = drawer.querySelector('input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Unsaved vendor details');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  mockOrg = { ...mockOrg, loading: true };
  await act(async () => root.render(<VendorRegister />));
  expect(container.querySelector('[data-testid="additional-vendors"]')).toBeNull();
  expect(container.querySelector('[data-testid="native-vendor-drawer"]')).toBe(drawer);
  expect(input.value).toBe('Unsaved vendor details');
  mockOrg = { ...mockOrg, loading: false };
  await act(async () => root.render(<VendorRegister />));
  expect(container.querySelector('[data-testid="additional-vendors"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="native-vendor-drawer"]')).toBe(drawer);
  expect(input.value).toBe('Unsaved vendor details');
  mockAuth = { ...mockAuth, user: { ...mockAuth.user, user_id: 'replacement-demo-actor' } };
  await act(async () => root.render(<VendorRegister />));
  expect(container.querySelector('[data-testid="native-vendor-drawer"]')).toBeNull();
});

test.each([['all', ['Assigned vendor', 'Retained vendor', 'Unassigned vendor']], ['unassigned', ['Unassigned vendor']]])('routine organization refresh retains the native %s URL view and its subset', async (view, expected) => {
  mockSearch = `?view=${view}`;
  const fixtures = [
    { ...vendor, vendor_id: 'assigned', name: 'Assigned vendor', business_owner_id: 'owner-one' },
    { ...vendor, vendor_id: 'unassigned', name: 'Unassigned vendor' },
    { ...vendor, vendor_id: 'retained', name: 'Retained vendor', status: 'inactive' },
  ];
  api.get.mockImplementation(async path => ({ data: path === '/vendors' ? fixtures : [] }));
  await act(async () => root.render(<VendorRegister />));
  const names = () => [...container.querySelectorAll('[data-testid^="vendor-row-"]')].map(row => row.querySelector('button').textContent).sort();
  expect(names()).toEqual(expected);
  const reads = api.get.mock.calls.length;
  for (const loading of [true, false]) {
    mockOrg = { ...mockOrg, loading };
    await act(async () => root.render(<VendorRegister />));
    expect(!!container.querySelector('[data-testid="additional-vendors"]')).toBe(!loading);
    expect(names()).toEqual(loading?[]:expected);
    if(loading)expect(container.querySelector('[data-testid="vendors-navigation-loading"]')).not.toBeNull();
    if (!loading) expect(container.querySelector('[aria-label="Other vendor views"]').value).toBe(view);
  }
  expect(api.get).toHaveBeenCalledTimes(reads);
});

test.each([
  { label: 'generic client', clientId: 'future-client' },
  { label: 'Prestige demo', clientId: 'demo_prestige' },
  { label: 'standard workspace', clientId: 'demo_brawndo', workspaceMode: 'authenticated' },
  { label: 'standard actor', clientId: 'demo_brawndo', actorMode: 'authenticated' },
])('native extended URL views do not broaden $label workflows', async ({ clientId, workspaceMode = 'demo', actorMode = 'demo' }) => {
  mockSearch = '?view=all';
  mockAuth = { ...mockAuth, workspaceMode, user: { ...mockAuth.user, workspace_mode: actorMode } };
  mockOrg = { currentClientId: clientId, currentClient: { client_id: clientId, name: 'Native client', status: 'active' } };
  sessionStorage.setItem('grc_client_id', mockOrg.currentClientId);
  await act(async () => root.render(<VendorRegister />));
  expect(container.querySelector('[data-testid="additional-vendors"]')).toBeNull();
  expect(container.querySelector('[data-testid="vendor-view-all_active"]').getAttribute('aria-pressed')).toBe('true');
});

test.each(['authenticated', 'other-client', 'lookalike', 'other-route', 'archived'])('additional appearance fails closed for %s context', async variant => {
  if (variant === 'authenticated') mockAuth = { workspaceMode: 'authenticated', user: { ...mockAuth.user, workspace_mode: 'authenticated' } };
  if (variant === 'other-client') { mockOrg.currentClientId = 'demo_dunder'; mockOrg.currentClient = { ...mockOrg.currentClient, client_id: 'demo_dunder' }; sessionStorage.setItem('grc_client_id', 'demo_dunder'); }
  if (variant === 'lookalike') mockOrg.currentClient = { ...mockOrg.currentClient, client_id: 'duplicate-name-client' };
  if (variant === 'other-route') mockPath = '/vendors/';
  if (variant === 'archived') mockOrg.currentClient = { ...mockOrg.currentClient, archived_at: '2026-10-01' };
  await act(async () => root.render(<VendorRegister />));
  expect(container.querySelector('[data-testid="additional-vendors"]')).toBeNull();
});

test('late data for a previous actor cannot replace the current actor read scope', async () => {
  let resolveOld;
  api.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await act(async () => root.render(<VendorRegister />));
  mockAuth = { ...mockAuth, user: { ...mockAuth.user, user_id: 'new-demo-actor' } };
  await act(async () => root.render(<VendorRegister />));
  expect(container.querySelector('[data-testid="additional-vendors"]')).toBeTruthy();
  await act(async () => resolveOld({ data: [{ ...vendor, name: 'Old actor response' }] }));
  expect(container.textContent).toContain('Recorded vendor');
  expect(container.textContent).not.toContain('Old actor response');
});

const subtitle = () => container.querySelector('.bapv-page-head p')?.textContent;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const expectNoWrites = () => { expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled(); expect(api.delete).not.toHaveBeenCalled(); };

test.each(['/vendors', '/clients/demo_brawndo/members', '/reviews'])('accepted refresh waits for %s and acknowledges genuine empty success', async pendingPath => {
  const pending = deferred();
  api.get.mockImplementation(path => path === pendingPath ? pending.promise : Promise.resolve({ data: [] }));
  await act(async () => root.render(<VendorRegister />));
  expect(container.textContent).not.toContain('As of');
  await act(async () => pending.resolve({ data: [] }));
  expect(subtitle()).toMatch(/^Third-party register · 0 active vendors · As of .+ ET$/);
  expect(container.querySelectorAll('[data-testid^="vendor-row-"]')).toHaveLength(0);
  expectNoWrites();
});

test('whole all-active count and accepted refresh stay stable across search, views, theme and open/cancel', async () => {
  const fixtures = ['active', 'onboarding', 'offboarding', 'inactive'].map((status, index) => ({ ...vendor, vendor_id: `v${index}`, name: `${status} vendor`, status }));
  api.get.mockImplementation(async path => ({ data: path === '/vendors' ? fixtures : [] }));
  await act(async () => root.render(<VendorRegister />));
  const accepted = subtitle(), reads = api.get.mock.calls.length;
  expect(accepted).toMatch(/^Third-party register · 3 active vendors · As of .+ ET$/);
  const search = container.querySelector('input[type="search"]');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, 'active vendor'); search.dispatchEvent(new Event('input', { bubbles: true })); });
  const otherViews = container.querySelector('[aria-label="Other vendor views"]');
  await act(async () => { otherViews.value = 'all'; otherViews.dispatchEvent(new Event('change', { bubbles: true })); });
  await click([...container.querySelectorAll('.bapv-head-actions button')].find(node => node.textContent === 'Dark'));
  await click(container.querySelector('.bav-assurance button'));
  expect(container.querySelector('[data-testid="native-vendor-drawer"]')).toBeTruthy();
  expect(subtitle()).toBe(accepted);
  await act(async () => mockDrawerProps.onOpenChange(false));
  expect(subtitle()).toBe(accepted);
  expect(api.get).toHaveBeenCalledTimes(reads);
  expectNoWrites();
});

test('failed refresh hides its acknowledgement and retry advances only after all three native reads succeed', async () => {
  const RealDate = Date;
  let instant = '2026-10-18T18:00:00Z';
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return new RealDate(instant).getTime(); }
  };
  try {
    await act(async () => root.render(<VendorRegister />));
    const accepted = subtitle();
    expect(accepted).toContain('As of');
    await click(container.querySelector('.bav-assurance button'));
    const pending = deferred(), original = api.get.getMockImplementation();
    api.get.mockImplementation((path, ...args) => path === '/reviews' ? pending.promise : original(path, ...args));
    await click(container.querySelector('[data-testid="native-vendor-drawer"] button'));
    expect(subtitle()).not.toContain('As of');
    await act(async () => pending.reject(new Error('Review refresh unavailable')));
    expect(subtitle()).not.toContain('As of');
    expect(container.querySelector('[role="alert"]').textContent).toContain('Review refresh unavailable');
    instant = '2026-10-18T19:00:00Z';
    api.get.mockImplementation(original);
    await click([...container.querySelectorAll('button')].find(node => node.textContent === 'Retry'));
    expect(subtitle()).toMatch(/^Third-party register · 1 active vendor · As of .+ ET$/);
    expect(subtitle()).not.toBe(accepted);
    expectNoWrites();
  } finally { global.Date = RealDate; }
});

test('new actor waits for its own refresh and ignores late former-actor success', async () => {
  const former = deferred(), current = deferred();
  let reads = 0;
  const original = api.get.getMockImplementation();
  api.get.mockImplementation((path, ...args) => path === '/vendors' ? (++reads === 1 ? former.promise : current.promise) : original(path, ...args));
  await act(async () => root.render(<VendorRegister />));
  expect(container.textContent).not.toContain('As of');
  mockAuth = { ...mockAuth, user: { ...mockAuth.user, user_id: 'replacement-actor' } };
  await act(async () => root.render(<VendorRegister />));
  await act(async () => former.resolve({ data: [{ ...vendor, name: 'Former actor vendor' }] }));
  expect(container.textContent).not.toContain('As of');
  expect(container.textContent).not.toContain('Former actor vendor');
  await act(async () => current.resolve({ data: [vendor] }));
  const accepted = subtitle();
  expect(accepted).toMatch(/^Third-party register · 1 active vendor · As of .+ ET$/);
  expectNoWrites();
});


test('configured CIS standard client retains appearance while invalid group is denied',async()=>{
  mockAuth={...mockAuth,workspaceMode:'standard',user:{...mockAuth.user,workspace_mode:'standard'}};
  await act(async()=>root.render(<VendorRegister/>));
  expect(container.querySelector('[data-testid="additional-vendors"]')).toBeTruthy();
  mockOrg={...mockOrg,currentClient:cisClient('demo_brawndo',4)};
  await act(async()=>root.render(<VendorRegister/>));
  expect(container.querySelector('[data-testid="additional-vendors"]')).toBeNull();
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('later CIS enrollment withholds work totals until the exact Tasks read succeeds', async () => {
  const ordinary={client_id:'demo_brawndo',name:'Brawndo'};
  mockOrg={currentClientId:'demo_brawndo',currentClient:ordinary,clients:[ordinary]};
  await act(async()=>root.render(<VendorRegister/>));
  expect(api.get.mock.calls.some(([path])=>path==='/tasks')).toBe(false);
  let resolveTasks;
  api.get.mockImplementation(async path=>({data:path==='/vendors'?[vendor]:path==='/tasks'?await new Promise(resolve=>{resolveTasks=resolve;}):[]}));
  mockOrg={currentClientId:'demo_brawndo',currentClient:{...cisClient('demo_brawndo',1),name:'Brawndo'},clients:[cisClient('demo_brawndo',1)]};
  await act(async()=>root.render(<VendorRegister/>));
  const pending=container.querySelector('[data-testid="additional-vendor-metric-due30"] strong');
  expect(pending?.textContent||'—').toBe('—');
  expect(resolveTasks).toBeInstanceOf(Function);
  await act(async()=>resolveTasks([{client_id:'demo_brawndo',vendor_id:'v1',task_id:'owned-action',source_type:'vendor',source_id:'v1',status:'open',due_date:new Date().toISOString().slice(0,10)}]));
  expect(container.querySelector('[data-testid="additional-vendor-metric-due30"] strong').textContent).toBe('1');
  await click(container.querySelector('[data-testid="additional-vendor-metric-due30"]'));
  await click(document.querySelector('.cv-list-items>button'));
  expect(mockDrawerProps.kind).toBe('tasks');expect(mockDrawerProps.record.task_id).toBe('owned-action');
});

test('failed or foreign Tasks reads cannot publish a successful zero work total', async()=>{
  api.get.mockImplementation(async path=>{if(path==='/tasks')throw new Error('Task population unavailable');return {data:path==='/vendors'?[vendor]:[]};});
  await act(async()=>root.render(<VendorRegister/>));
  expect(container.textContent).toContain('Task population unavailable');
  expect(container.querySelector('[data-testid="additional-vendor-metric-due30"] strong')).toBeNull();
  expect(container.querySelector('[data-testid="native-vendor-drawer"]')).toBeNull();
});
test('Review list navigation binds the exact current occurrence, not only the recurring parent',async()=>{
  const review={client_id:'demo_brawndo',vendor_id:'v1',review_id:'review/exact',current_occurrence_id:'occ:actual',status:'upcoming',vendor_purpose:'vendor',due_date:new Date().toISOString().slice(0,10)};
  api.get.mockImplementation(async path=>({data:path==='/vendors'?[vendor]:path==='/reviews'?[review]:[]}));
  await act(async()=>root.render(<VendorRegister/>));
  await click(container.querySelector('[data-testid="additional-vendor-metric-due30"]'));
  await click(document.querySelector('.cv-list-items>button'));
  expect(mockNavigate).toHaveBeenCalledWith('/reviews?id=review%2Fexact&client_id=demo_brawndo&occurrence=occ%3Aactual');
});