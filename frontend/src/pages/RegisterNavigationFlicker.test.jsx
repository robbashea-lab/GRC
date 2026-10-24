import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import RiskRegister from './RiskRegister';
import VendorRegister from './VendorRegister';
import RecordListPage from './RecordListPage';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';

let mockAuth, mockOrg, mockPath, mockDrawerProps;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('react-router-dom', () => ({
  Link: ({children}) => <span>{children}</span>,
  useLocation: () => ({pathname: mockPath, search: ''}),
  useNavigate: () => jest.fn(),
  useSearchParams: () => require('react').useState(new URLSearchParams()),
}), {virtual: true});
jest.mock('@/lib/api', () => ({__esModule: true,
  default: {get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn()},
  formatError: error => error.message, API: '/api', PREVIEW_MODE: true,
}));
jest.mock('@/components/RecordDrawer', () => props => {mockDrawerProps=props;return null;});

let root, container, pending;
const pages = [
  ['risks', RiskRegister, 'Brawndo Risks', 'demo-risks-overview'],
  ['policies', () => <RecordListPage kind="policies"/>, 'Brawndo Policies', 'additional-policies'],
  ['vendors', VendorRegister, 'Brawndo Vendors', 'additional-vendors'],
];
beforeAll(() => Object.defineProperty(global, 'crypto', {configurable: true, value: require('crypto').webcrypto}));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('grc_client_id', 'demo_brawndo');
  mockAuth = {workspaceMode: 'demo', user: {user_id: 'navigation-actor', role: 'super_admin', workspace_mode: 'demo'}};
  const client = {...cisClient('demo_brawndo'), name: 'Brawndo'};
  mockOrg = {currentClientId: client.client_id, currentClient: client, clients: [client]};
  pending = [];mockDrawerProps=null;
  api.get.mockImplementation(path => new Promise((resolve, reject) => pending.push({path, resolve, reject})));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {await act(async () => root.unmount()); container.remove(); jest.clearAllMocks();});
const render = Page => act(async () => root.render(<Page/>));
async function finishReads(overrides = {}) {
  // Policies starts its review read after its policy read; resolve each native batch.
  for (let batch = 0; batch < 4 && pending.length; batch++) {
    const reads = pending.splice(0);
    await act(async () => reads.forEach(({path, resolve}) => resolve({data: Object.hasOwn(overrides,path) ? overrides[path] :
      path === '/frameworks/summary' ? {client_id: mockOrg.currentClientId, items: []} : []})));
  }
}

test.each(pages)('%s keeps the approved heading while native reads are pending, without fabricated records or actions', async (route, Page, heading, loadedMarker) => {
  mockPath = `/${route}`;
  await render(Page);
  expect(container.querySelector('h1')?.textContent).toBe(heading);
  expect(container.querySelector(`[data-testid="${route}-navigation-loading"] [role="status"]`)?.textContent).toMatch(/Loading/);
  expect(container.querySelector(`[data-testid="${loadedMarker}"]`)).toBeNull();
  expect(container.querySelector('[data-testid^="new-"],[data-testid="create-policies-button"],[data-testid$="-export"]')).toBeNull();
  expect(container.querySelector('table,[role="table"]')).toBeNull();
  await finishReads();
  expect(container.querySelector('h1')?.textContent).toBe(heading);
  expect(container.querySelector(`[data-testid="${route}-navigation-loading"]`)).toBeNull();
  expect(container.querySelector(`[data-testid="${loadedMarker}"]`)).not.toBeNull();
  expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled();
});

test.each(pages)('%s does not show the qualified loading frame after mode or selected-client mismatch', async (route, Page) => {
  mockPath = `/${route}`; mockAuth.workspaceMode = 'standard';
  await render(Page);
  expect(container.querySelector(`[data-testid="${route}-navigation-loading"]`)).toBeNull();
  mockAuth.workspaceMode = 'demo'; sessionStorage.setItem('grc_client_id', 'another-client');
  await render(Page);
  expect(container.querySelector(`[data-testid="${route}-navigation-loading"]`)).toBeNull();
});

test.each(pages)('%s retains a useful failure and Retry without switching to an empty register', async (route, Page, heading, loadedMarker) => {
  mockPath = `/${route}`;
  await render(Page);
  const reads = pending.splice(0);
  await act(async () => reads.forEach(({reject}) => reject(new Error('Read temporarily unavailable'))));
  const frame = container.querySelector(`[data-testid="${route}-navigation-loading"]`);
  expect(frame?.getAttribute('aria-busy')).toBe('false');
  expect(frame?.querySelector('[role="alert"]')?.textContent).toContain('Read temporarily unavailable');
  expect(container.querySelector('h1')?.textContent).toBe(heading);
  expect(container.querySelector('table,[role="table"]')).toBeNull();
  await act(async () => [...frame.querySelectorAll('button')].find(button => button.textContent.startsWith('Retry')).click());
  await finishReads();
  expect(container.querySelector(`[data-testid="${loadedMarker}"]`)).not.toBeNull();
});

test.each(pages)('%s awaits the new actor read and discards a late previous actor response', async (route, Page) => {
  mockPath = `/${route}`;
  await render(Page);
  const previous = pending.splice(0);
  mockAuth = {...mockAuth, user: {...mockAuth.user, user_id: 'replacement-actor'}};
  await render(Page);
  await act(async () => previous.forEach(({path, resolve}) => resolve({data:
    path === '/frameworks/summary' ? {client_id: 'late-foreign-client', items: []} : []})));
  expect(container.querySelector(`[data-testid="${route}-navigation-loading"]`)).not.toBeNull();
  expect(container.querySelector('table,[role="table"]')).toBeNull();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  await finishReads();
  expect(container.querySelector(`[data-testid="${route}-navigation-loading"]`)).toBeNull();
});

test.each(pages)('%s retains only the record-free presentation during a background organization refresh', async (route, Page, heading, loadedMarker) => {
  mockPath = `/${route}`;
  await render(Page); await finishReads();
  expect(container.querySelector(`[data-testid="${loadedMarker}"]`)).not.toBeNull();
  mockOrg = {...mockOrg, loading: true};
  await render(Page);
  expect(container.querySelector('h1')?.textContent).toBe(heading);
  expect(container.querySelector(`[data-testid="${route}-navigation-loading"]`)).not.toBeNull();
  expect(container.querySelector('table,[role="table"]')).toBeNull();
  expect(container.querySelector(`[data-testid="${loadedMarker}"]`)).toBeNull();
  mockOrg = {...mockOrg, loading: false, error: 'Current client verification failed'};
  await render(Page);
  expect(container.querySelector(`[data-testid="${route}-navigation-loading"]`)).toBeNull();
  expect(container.querySelector(`[data-testid="${loadedMarker}"]`)).toBeNull();
});

test('a mismatched current Policy summary fails visibly and Retry requests a fresh scoped summary', async () => {
  mockPath = '/policies';
  const Page = pages[1][1];
  await render(Page);
  const summary = pending.find(read => read.path === '/frameworks/summary');
  pending = pending.filter(read => read !== summary);
  await act(async () => summary.resolve({data: {client_id: 'another-client', items: []}}));
  await finishReads();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Policy alignment could not be verified for this client.');
  expect(container.querySelector('table,[role="table"]')).toBeNull();
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent.startsWith('Retry')).click());
  await finishReads();
  expect(api.get.mock.calls.filter(([path]) => path === '/frameworks/summary')).toHaveLength(2);
  expect(container.querySelector('[data-testid="additional-policies"]')).not.toBeNull();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test('a mixed-client Risk response cannot switch to a generic register or expose either record', async () => {
  mockPath = '/risks';
  await render(RiskRegister);
  const read = pending.find(request => request.path === '/risks');
  pending = pending.filter(request => request !== read);
  await act(async () => read.resolve({data: [
    {risk_id: 'own', client_id: 'demo_brawndo', title: 'Current native risk', status: 'open'},
    {risk_id: 'foreign', client_id: 'another-client', title: 'Foreign native risk', status: 'open'},
  ]}));
  await finishReads();
  const frame = container.querySelector('[data-testid="risks-navigation-loading"]');
  expect(frame?.getAttribute('aria-busy')).toBe('false');
  expect(frame?.querySelector('[role="alert"]')?.textContent).toContain('Risks could not be verified for this client.');
  expect(container.querySelector('h1')?.textContent).toBe('Brawndo Risks');
  expect(container.querySelector('table,[role="table"]')).toBeNull();
  expect(container.textContent).not.toContain('Current native risk');
  expect(container.textContent).not.toContain('Foreign native risk');
  await act(async () => [...frame.querySelectorAll('button')].find(button => button.textContent.startsWith('Retry')).click());
  await finishReads();
  expect(container.querySelector('[data-testid="demo-risks-overview"]')).not.toBeNull();
});

const recordPages = pages.filter(([route]) => route !== 'risks');
const ownRecord = {vendor_id:'own-vendor',policy_id:'own-policy',client_id:'demo_brawndo',name:'Current native record',title:'Current native record',status:'active'};
const foreignRecord = {...ownRecord,vendor_id:'foreign-vendor',policy_id:'foreign-policy',client_id:'another-client',name:'Unverified foreign record',title:'Unverified foreign record'};
const invalidLists = [
  ['foreign-only',[foreignRecord]], ['mixed-client',[ownRecord,foreignRecord]],
  ['null',null], ['non-array',{}], ['missing identity',[{name:'Unverified record',title:'Unverified record'}]], ['null row',[null]],
];
describe.each(recordPages)('%s current response identity', (route,Page,heading,loadedMarker) => {
  test.each(invalidLists)('rejects a %s list without approved empty counts and recovers with Retry',async(_kind,payload)=>{
    mockPath=`/${route}`;await render(Page);await finishReads({['/'+route]:payload});
    const frame=container.querySelector(`[data-testid="${route}-navigation-loading"]`);
    expect(frame).not.toBeNull();expect(frame.getAttribute('aria-busy')).toBe('false');
    expect(frame.querySelector('[role="alert"]').textContent).toContain('could not be verified for this client');
    expect(container.querySelector('h1').textContent).toBe(heading);
    expect(container.querySelector(`[data-testid="${loadedMarker}"],table,[role="table"]`)).toBeNull();
    expect(container.textContent).not.toMatch(/Unverified|Current native record|0 active|No policies|No vendors/);
    await act(async()=>[...frame.querySelectorAll('button')].find(button=>button.textContent.startsWith('Retry')).click());await finishReads();
    expect(container.querySelector(`[data-testid="${loadedMarker}"]`)).not.toBeNull();expect(container.querySelector('[role="alert"]')).toBeNull();
    for(const method of ['post','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
  });
  test.each([['foreign',[{review_id:'foreign-review',client_id:'another-client',title:'Unverified foreign review'}]],['malformed',null]])('rejects %s linked Reviews without accepting the primary register',async(_kind,reviews)=>{
    mockPath=`/${route}`;await render(Page);await finishReads({'/reviews':reviews});
    const frame=container.querySelector(`[data-testid="${route}-navigation-loading"]`);
    expect(frame?.querySelector('[role="alert"]')?.textContent).toContain('could not be verified for this client');
    expect(container.querySelector(`[data-testid="${loadedMarker}"],table,[role="table"]`)).toBeNull();expect(container.textContent).not.toContain('Unverified foreign review');
    await act(async()=>[...frame.querySelectorAll('button')].find(button=>button.textContent.startsWith('Retry')).click());await finishReads();
    expect(container.querySelector(`[data-testid="${loadedMarker}"]`)).not.toBeNull();
  });
  test('accepts the native verified empty array without treating it as a failed read',async()=>{
    mockPath=`/${route}`;await render(Page);await finishReads();
    expect(container.querySelector(`[data-testid="${loadedMarker}"]`)).not.toBeNull();expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

test.each(invalidLists)('Reviews rejects a %s current list without successful zero counts',async(_kind,payload)=>{
  mockPath='/reviews';await render(()=> <RecordListPage kind="reviews"/>);await finishReads({'/reviews':payload});
  expect(container.querySelector('[data-testid="register-load-error"]')?.textContent).toContain('could not be verified for this client');
  expect([...container.querySelectorAll('.bdr-kcell strong')].map(node=>node.textContent)).toEqual(['—','—','—','—']);
  expect(container.querySelector('[data-testid="export-reviews-button"]').disabled).toBe(true);
  expect(container.querySelector('[data-testid^="reviews-row-"]')).toBeNull();expect(container.textContent).not.toMatch(/Unverified|Current native record/);
  await act(async()=>container.querySelector('[data-testid="register-load-error"] button').click());await finishReads();
  expect(container.querySelector('[data-testid="register-load-error"]')).toBeNull();
  expect([...container.querySelectorAll('.bdr-kcell strong')].map(node=>node.textContent)).toEqual(['0','0','0','0']);
});

test.each([
  ...recordPages,
  ['reviews',()=> <RecordListPage kind="reviews"/>, 'Brawndo Reviews',null],
])('%s invalid refresh withdraws its earlier accepted receipt while retaining the native editor',async(route,Page,_heading,loadedMarker)=>{
  mockPath=`/${route}`;await render(Page);await finishReads(route==='vendors'?{'/vendors':[ownRecord]}:{});
  const openEditor=container.querySelector(route==='vendors'?'[data-testid="vendor-row-0"] .bapv-name':`[data-testid="create-${route}-button"]`);
  await act(async()=>openEditor.click());expect(mockDrawerProps.open).toBe(true);
  await act(async()=>{mockDrawerProps.onSaved();});await finishReads({['/'+route]:[foreignRecord]});
  expect(mockDrawerProps.open).toBe(true);
  expect(container.querySelector('[data-testid="register-load-error"]')?.textContent).toContain('could not be verified for this client');
  if(loadedMarker)expect(container.querySelector(`[data-testid="${loadedMarker}"]`)).toBeNull();
  else expect([...container.querySelectorAll('.bdr-kcell strong')].map(node=>node.textContent)).toEqual(['—','—','—','—']);
  expect(container.querySelector('[data-testid^="reviews-row-"],[data-testid^="policies-row-"],[data-testid^="vendor-row-"]')).toBeNull();
  for(const method of ['post','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});
