import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import PortfolioReferenceChrome from './PortfolioReferenceChrome';

let mockAuth, mockOrg;
const mockNavigate = jest.fn(), mockOpenStorage = jest.fn();
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/lib/api', () => ({PREVIEW_MODE:false}));
jest.mock('@/preview/DemoNotice', () => ({renderTrigger}) => renderTrigger(mockOpenStorage));
jest.mock('./NotificationBell', () => () => <button type="button" data-testid="native-notifications">Notifications</button>);
jest.mock('./ClientIdentityMark', () => ({client}) => <span aria-hidden="true" data-client-mark={client.client_id}/>);
// Route changes are observed here; authentication, organization membership and
// client selection remain the component's native context contracts.
jest.mock('react-router-dom', () => {
  const Link = ({to, children, onClick, ...props}) => <a href={to} {...props} onClick={event => {
    onClick?.(event);
    if (!event.defaultPrevented) {event.preventDefault(); mockNavigate(to);}
  }}>{children}</a>;
  return {Link, NavLink:({end, ...props}) => <Link {...props}/>, useNavigate:() => mockNavigate};
}, {virtual:true});

const ADMIN_ITEMS = [
  {to:'/admin/clients', label:'Client Management', testid:'nav-admin-clients'},
  {to:'/admin/users', label:'Users & Access', testid:'nav-admin-users'},
];
const client = {client_id:'authorized-native-client', name:'Authorized Native Client', status:'active'};
let host, root;
const flushTimers = () => act(async () => jest.runOnlyPendingTimers());
const render = () => act(async () => root.render(<PortfolioReferenceChrome adminItems={ADMIN_ITEMS}><p>Native portfolio content</p></PortfolioReferenceChrome>));
const click = node => act(async () => node.click());
async function openMenu(label) {
  const trigger = host.querySelector(`[aria-label="${label}"]`);
  expect(trigger).not.toBeNull();
  await act(async () => trigger.dispatchEvent(new MouseEvent('pointerdown', {button:0, ctrlKey:false, bubbles:true, cancelable:true})));
  await flushTimers();
  return host.querySelector('[role="menu"]');
}
async function openPalette() {
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', {key:'k', ctrlKey:true, bubbles:true, cancelable:true})));
  await flushTimers();
  return host.querySelector('.palette input');
}
async function inputValue(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles:true}));
  });
}
const key = (node, value) => act(async () => node.dispatchEvent(new KeyboardEvent('keydown', {key:value, bubbles:true, cancelable:true})));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers(); localStorage.clear(); sessionStorage.clear();
  mockNavigate.mockReset(); mockOpenStorage.mockReset();
  mockAuth = {user:{user_id:'native-owner', role:'super_admin', name:'Native Owner', email:'native-owner@example.test'}, workspaceMode:'standard', loading:false, logout:jest.fn().mockResolvedValue(true)};
  mockOrg = {clients:[client], loading:false, error:'', switchClient:jest.fn().mockReturnValue(true), refresh:jest.fn()};
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); await flushTimers(); host.remove();
  jest.useRealTimers(); localStorage.clear(); sessionStorage.clear();
});

test('navigation contains only current authorized active clients and keeps native page actions', async () => {
  mockOrg.clients = [client, {...client},
    {...client,client_id:'archived-native-client',status:'archived'},
    {...client,client_id:'retired-native-client',status:'retired'},
    {...client,client_id:'archived-flag-client',archived:true},
    {...client,client_id:'archived-date-client',archived_at:'2026-11-17T00:00:00Z'}];
  await render();
  const list = host.querySelector('[data-testid="sidebar-client-list"]');
  expect(list.querySelectorAll('button')).toHaveLength(1);
  expect(list.textContent).toBe(client.name);
  expect(host.textContent).toContain('Native portfolio content');
  expect(host.querySelector('[data-testid="native-notifications"]')).not.toBeNull();
  expect(host.querySelector('[data-testid="nav-admin-clients"]').getAttribute('href')).toBe('/admin/clients');
  expect(host.querySelector('[data-testid="nav-admin-users"]').getAttribute('href')).toBe('/admin/users');
  expect(host.textContent).not.toMatch(/Brawndo|Demo Explorer|In the app,/);
  await click(list.querySelector('button'));
  expect(mockOrg.switchClient).toHaveBeenCalledWith(client.client_id);
  expect(mockNavigate).toHaveBeenCalledWith('/dashboard?client_id=authorized-native-client');
});

test('a rejected native client switch does not navigate', async () => {
  mockOrg.switchClient.mockReturnValue(false);
  await render(); await click(host.querySelector('[data-testid="sidebar-open-authorized-native-client"]'));
  expect(mockOrg.switchClient).toHaveBeenCalledTimes(1);
  expect(mockNavigate).not.toHaveBeenCalled();
});

test.each(['loading', 'error'])('an organization %s hides retained clients in sidebar, workspace menu and palette', async state => {
  mockOrg = {...mockOrg, loading:state === 'loading', error:state === 'error' ? 'Current membership unavailable' : ''};
  await render();
  expect(host.querySelector('[data-testid="sidebar-client-list"]').textContent).not.toContain(client.name);
  const menu = await openMenu('Switch workspace');
  expect(menu).not.toBeNull(); expect(menu.textContent).not.toContain(client.name);
  expect(menu.textContent).toContain(state === 'loading' ? 'Loading clients.' : 'Clients could not be loaded.');
  await key(menu, 'Escape'); await flushTimers();
  await openPalette();
  expect(host.querySelector('.pal-list').textContent).not.toContain(client.name);
  expect(mockOrg.switchClient).not.toHaveBeenCalled(); expect(mockNavigate).not.toHaveBeenCalled();
});

test('the workspace menu switches only its authorized native client', async () => {
  await render(); const menu = await openMenu('Switch workspace');
  expect(menu).not.toBeNull();
  const choices = [...menu.querySelectorAll('button')];
  expect(choices.map(button => button.textContent)).toEqual([client.name]);
  await click(choices[0]);
  expect(mockOrg.switchClient).toHaveBeenCalledWith(client.client_id);
  expect(mockNavigate).toHaveBeenCalledWith('/dashboard?client_id=authorized-native-client');
});

test('account and storage entries invoke the native destinations and storage callback', async () => {
  await render();
  let menu = await openMenu('Account menu for Native Owner');
  expect(menu.textContent).toContain('Native Owner'); expect(menu.textContent).toContain('native-owner@example.test');
  expect(menu.textContent).not.toContain('Demo Explorer');
  await click(menu.querySelector('[data-testid="profile-menu-account"]'));
  expect(mockNavigate).toHaveBeenCalledWith('/account');
  await flushTimers(); menu = await openMenu('Account menu for Native Owner');
  await click(menu.querySelector('[data-testid="profile-menu-storage"]'));
  expect(mockOpenStorage).toHaveBeenCalledTimes(1);
});

test.each([true, false])('sign-out navigates to login only after native confirmation=%s', async confirmed => {
  mockAuth.logout.mockResolvedValue(confirmed);
  await render(); const menu = await openMenu('Account menu for Native Owner');
  await click(menu.querySelector('[data-testid="logout-button"]'));
  expect(mockAuth.logout).toHaveBeenCalledTimes(1);
  if (confirmed) expect(mockNavigate).toHaveBeenCalledWith('/login');
  else expect(mockNavigate).not.toHaveBeenCalled();
});

test('Ctrl-K focuses the real palette and Escape closes it and returns focus to search', async () => {
  await render();
  const trigger = host.querySelector('[aria-label="Search pages and active work"]'); trigger.focus();
  const input = await openPalette();
  expect(input).not.toBeNull(); expect(document.activeElement).toBe(input);
  expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  await key(input, 'Escape'); await flushTimers();
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
  expect(mockNavigate).not.toHaveBeenCalled();
});

test('the palette filters native page routes and ArrowDown/Enter opens the selected route', async () => {
  await render(); const input = await openPalette();
  await inputValue(input, 'Client');
  expect([...host.querySelectorAll('.pal-list [role="option"]')].map(option => option.textContent)).toEqual(['Client Management', client.name]);
  await key(input, 'ArrowDown');
  expect(host.querySelector('.pal-list [aria-selected="true"]').textContent).toBe(client.name);
  await key(input, 'ArrowUp'); await key(input, 'Enter');
  expect(mockNavigate).toHaveBeenCalledWith('/admin/clients');
  expect(mockOrg.switchClient).not.toHaveBeenCalled(); expect(host.querySelector('[role="dialog"]')).toBeNull();
});

test('Enter on a matching client runs the same guarded native switch', async () => {
  await render(); let input = await openPalette();
  await inputValue(input, client.name); await key(input, 'Enter');
  expect(mockOrg.switchClient).toHaveBeenCalledWith(client.client_id);
  expect(mockNavigate).toHaveBeenCalledWith('/dashboard?client_id=authorized-native-client');
  await flushTimers(); mockOrg.switchClient.mockReturnValue(false); mockNavigate.mockClear();
  input = await openPalette(); await inputValue(input, client.name); await key(input, 'Enter');
  expect(mockNavigate).not.toHaveBeenCalled(); expect(host.querySelector('[role="dialog"]')).not.toBeNull();
});
