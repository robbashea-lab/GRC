import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import NativeStandardShell from './NativeStandardShell';
import api from '@/lib/api';

let mockAuth, mockOrg, mockPath;
const mockNavigate = jest.fn();
jest.mock('@/context/AuthContext', () => ({useAuth:() => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg:() => mockOrg}));
jest.mock('@/context/ComplianceContext', () => ({useCompliance:() => ({items:[{to:'/compliance/hipaa', label:'HIPAA', key:'hipaa'}, {to:'/compliance/cmmc', label:'CMMC Level 2', key:'cmmc'}]})}));
jest.mock('@/lib/api', () => ({__esModule:true, default:{get:jest.fn()}, formatError:error => error.message}));
jest.mock('@/preview/DemoNotice', () => ({renderTrigger}) => renderTrigger(null));
jest.mock('./NotificationBell', () => () => <button type="button">Native notifications</button>);
jest.mock('./ClientIdentityMark', () => ({client}) => <span>{client?.name?.[0]}</span>);
jest.mock('react-router-dom', () => {
  const Link = ({to, children, ...props}) => <a href={to} {...props} onClick={event => {event.preventDefault(); mockNavigate(to);}}>{children}</a>;
  return {Link, NavLink:({end, ...props}) => <Link {...props}/>, useNavigate:() => mockNavigate, useLocation:() => ({pathname:mockPath})};
}, {virtual:true});

const client = {client_id:'unfamiliar-native-id', name:'Acorn Audit', status:'active'};
let host, root, previousTitle;
const render = () => act(async () => root.render(<NativeStandardShell><p>Native record controller</p></NativeStandardShell>));
const click = element => act(async () => element.click());
const key = (element, value) => act(async () => element.dispatchEvent(new KeyboardEvent('keydown', {key:value, bubbles:true, cancelable:true})));
async function search(value) {
  await click(host.querySelector('.search-btn'));
  const input = host.querySelector('.palette input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  return input;
}
beforeEach(() => {
  previousTitle = document.title;
  global.IS_REACT_ACT_ENVIRONMENT = true; jest.useFakeTimers(); localStorage.clear(); mockNavigate.mockReset();
  mockPath = '/clients';
  mockAuth = {user:{user_id:'native-owner', role:'super_admin', name:'Native Owner'}, logout:jest.fn().mockResolvedValue(true)};
  mockOrg = {clients:[client], currentClient:client, currentClientId:client.client_id, loading:false, error:'', switchClient:jest.fn().mockReturnValue(true), refresh:jest.fn()};
  api.get.mockReset(); api.get.mockImplementation(path => Promise.resolve({data:path === '/dashboard' ? {client_id:client.client_id, kpis:{overdue_reviews:2}, items:[{key:'review:actual', kind:'reviews', id:'actual', title:'Asset review', occurrence_id:'current-cycle'}]} : path.endsWith('/iv-setup') ? {outstanding_count:3} : []}));
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); jest.useRealTimers(); localStorage.clear(); document.title = previousTitle;});

test('protected route titles use native labels and only the resolved current client', async () => {
  document.title = 'Omnisciente | Prestige Worldwide';
  await render(); expect(document.title).toBe('Portfolio | GoverNara');
  mockPath = '/dashboard'; await render(); expect(document.title).toBe('Dashboard · Acorn Audit | GoverNara');
  mockOrg.loading = true; await render(); expect(document.title).toBe('Dashboard | GoverNara');
  mockOrg.loading = false; mockOrg.currentClient = {...client,client_id:'next-client',name:'Current native client'}; mockOrg.currentClientId = 'next-client';
  mockPath = '/compliance/cmmc'; await render(); expect(document.title).toBe('CMMC Level 2 · Current native client | GoverNara');
  mockPath = '/admin/users'; await render(); expect(document.title).toBe('Users & Access | GoverNara');
  mockPath = '/account'; mockAuth.user.role = 'client_readonly'; await render(); expect(document.title).toBe('My Account | GoverNara');
});

test('protected title cleanup cannot overwrite the public Login title owner', async () => {
  mockPath = '/dashboard'; await render();
  document.title = 'GoverNara Sign In';
  await act(async () => root.render(null));
  expect(document.title).toBe('GoverNara Sign In');
});

test('ending a protected workspace clears its client title instead of restoring legacy HTML branding', async () => {
  document.title = 'Omnisciente | Prestige Worldwide'; mockPath = '/dashboard'; await render();
  await act(async () => root.render(null)); expect(document.title).toBe('GoverNara');
});

test('one protected shell serves unfamiliar clients and every configured framework without changing native children', async () => {
  mockPath = '/dashboard'; await render();
  expect(host.textContent).toContain('Native record controller');
  const nav = host.querySelector('[aria-label="Client workspace"]');
  for (const label of ['HIPAA','CMMC Level 2','iVenture Setup','AI Governance','Systems & Scope','Findings','Requirements','Exceptions']) expect(nav.textContent).toContain(label);
  expect(nav.querySelector('[data-testid="nav-iv-setup"]').getAttribute('href')).toBe('/iv-setup?client_id=unfamiliar-native-id');
  expect(nav.querySelector('[data-testid="nav-reviews"]').textContent).toContain('2');
  expect(nav.querySelector('[data-testid="nav-iv-setup"]').textContent).toContain('3');
  expect(document.documentElement.dataset.nativeStandard).toBe('light');
  expect(document.documentElement.dataset.previewTheme).toBe('glass07');
  expect(api.get.mock.calls.every(([, options]) => !options?.params?.client_id || options.params.client_id === client.client_id)).toBe(true);
});

test('platform navigation retains only current authorized active clients and native administration routes', async () => {
  mockOrg.clients = [client, client, {...client,client_id:'archived',status:'archived'}]; await render();
  expect(host.querySelector('[data-testid="sidebar-client-list"]').querySelectorAll('button')).toHaveLength(1);
  expect(host.querySelector('[data-testid="nav-admin-tools"]').getAttribute('href')).toBe('/admin/tools');
  await click(host.querySelector('[data-testid="sidebar-open-unfamiliar-native-id"]'));
  expect(mockOrg.switchClient).toHaveBeenCalledWith(client.client_id);
  expect(mockNavigate).toHaveBeenCalledWith('/dashboard?client_id=unfamiliar-native-id');
});

test('failed authorized client switch leaves search open and does not navigate', async () => {
  mockOrg.switchClient.mockReturnValue(false); await render(); const input = await search(client.name); await key(input,'Enter');
  expect(mockNavigate).not.toHaveBeenCalled(); expect(host.querySelector('.palette')).not.toBeNull();
});

test('search activates a tab-focused result, preserves record occurrence context, and restores focus on Escape', async () => {
  mockPath = '/dashboard'; await render(); const input = await search('Asset review');
  await act(async () => jest.advanceTimersByTime(250));
  const result = [...host.querySelectorAll('[role="option"]')].find(node => node.textContent === 'Asset review');
  expect(result).not.toBeUndefined(); await act(async () => result.focus()); await key(result,'Enter');
  expect(mockNavigate).toHaveBeenCalledWith('/reviews?id=actual&client_id=unfamiliar-native-id&occurrence=current-cycle');
  await click(host.querySelector('.search-btn')); await key(host.querySelector('.palette input'),'Escape');
  await act(async () => jest.runOnlyPendingTimers());
  expect(host.querySelector('.palette')).toBeNull(); expect(document.activeElement).toBe(host.querySelector('.search-btn'));
  expect(input.isConnected).toBe(false);
});

test('client users see their native workspaces without administration and unavailable organization reads hide client choices', async () => {
  mockAuth.user.role = 'client_readonly'; mockPath = '/dashboard'; await render();
  expect(host.querySelector('a[href="/admin/users"]')).toBeNull();
  expect(host.querySelector('a[href="/reports?client_id=unfamiliar-native-id"]')).not.toBeNull();
  mockPath = '/clients'; mockAuth.user.role = 'super_admin'; mockOrg.error = 'Membership unavailable'; await render();
  expect(host.querySelector('[data-testid="sidebar-client-list"]').textContent).not.toContain(client.name);
  expect(host.querySelector('[role="alert"]').textContent).toContain('Clients could not be loaded');
});

test('unmount removes the protected theme marker so public login retains its own styling', async () => {
  await render(); expect(document.documentElement.hasAttribute('data-native-standard')).toBe(true);
  await act(async () => root.render(null)); expect(document.documentElement.hasAttribute('data-native-standard')).toBe(false);
  expect(document.documentElement.hasAttribute('data-preview-theme')).toBe(false);
  expect(document.documentElement.hasAttribute('data-theme-fixed-mode')).toBe(false);
});

test('mobile navigation Escape closes and returns focus without dismissing foreground work or stealing desktop focus', async () => {
  mockPath = '/dashboard'; await render();
  const toggle = host.querySelector('[aria-label="Toggle client navigation"]');
  const reviewLink = host.querySelector('[data-testid="nav-reviews"]');
  // JSDOM has no layout; only the toggle's rendered visibility is supplied.
  const visible = jest.spyOn(toggle,'getClientRects').mockReturnValue([{width:32,height:32}]);
  try {
    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.native-nav-scrim')).not.toBeNull();
    await act(async () => reviewLink.focus());
    reviewLink.addEventListener('keydown',event => event.preventDefault(),{once:true});
    await key(reviewLink,'Escape');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(reviewLink);

    await click(host.querySelector('.search-btn'));
    await key(host.querySelector('.palette input'),'Escape');
    await act(async () => jest.runOnlyPendingTimers());
    expect(host.querySelector('.palette')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(host.querySelector('.search-btn'));

    await act(async () => reviewLink.focus());
    await key(reviewLink,'Escape');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.native-standard').dataset.nativeNavigation).toBe('closed');
    expect(host.querySelector('.native-nav-scrim')).toBeNull();
    expect(document.activeElement).toBe(toggle);
    expect(mockNavigate).not.toHaveBeenCalled();

    await click(toggle);
    visible.mockReturnValue([]); // A desktop resize can hide an already-open toggle.
    const desktopFocus = host.querySelector('.search-btn');
    await act(async () => desktopFocus.focus());
    await key(desktopFocus,'Escape');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(desktopFocus);
    expect(mockNavigate).not.toHaveBeenCalled();
  } finally {visible.mockRestore();}
});
