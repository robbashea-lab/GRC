import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import Layout from './Layout';
import Brand, {ApplicationBrand} from './Brand';
import api from '@/lib/api';
import {frameworkCatalog} from '@/lib/frameworks';
import {THEME_KEY} from '@/lib/brawndoTheme';

let mockAuth, mockOrg, mockLocation, mockPreviewMode;
const mockNavigate = jest.fn();

jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/context/ComplianceContext', () => ({
  ComplianceProvider: ({children}) => children,
  useCompliance: () => ({items: []}),
}));
jest.mock('@/lib/api', () => ({
  __esModule: true,
  get PREVIEW_MODE() { return mockPreviewMode; },
  default: {get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn()},
  formatError: error => error.message,
}));
jest.mock('@/preview/DemoNotice', () => ({renderTrigger}) => renderTrigger ? renderTrigger() : null);
jest.mock('./NotificationBell', () => () => <button type="button" aria-label="Notifications"/>);
// Page controllers are outside this chrome regression; keep an existing native draft
// mounted so a shell change cannot silently discard it.
jest.mock('./ClientSurface', () => ({children}) => <section>{children}</section>);
jest.mock('./AdminSurface', () => ({children}) => <section>{children}</section>);
jest.mock('react-router-dom', () => {
  const Link = ({to, children, onClick, ...props}) => <a href={to} {...props} onClick={event => {
    onClick?.(event);
    if (!event.defaultPrevented) {
      event.preventDefault();
      mockNavigate(to);
    }
  }}>{children}</a>;
  return {
    Link,
    NavLink: ({className, end, ...props}) => <Link {...props} className={typeof className === 'function'
      ? className({isActive: mockLocation.pathname === props.to}) : className}/>,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
    Outlet: () => <label>Existing record draft<input data-testid="native-record-draft" defaultValue="Original draft"/></label>,
  };
}, {virtual: true});

const CLIENTS = [
  {id: 'demo_brawndo', name: 'Brawndo', framework: 'cis-ig1', group: 1},
  {id: 'demo_initech', name: 'Initech', framework: 'cis-ig1', group: 2},
  {id: 'demo_krusty_krab', name: 'The Krusty Krab', framework: 'cis-ig1', group: 3},
  {id: 'demo_dunder', name: 'Dunder Mifflin', framework: 'iso-27001'},
  {id: 'demo_prestige', name: 'Prestige Worldwide', framework: 'soc-2'},
  {id: 'synthetic-new-cis', name: 'QA new CIS client', framework: 'cis-ig1', group: 3},
  {id: 'synthetic-new-iso', name: 'QA new ISO client', framework: 'iso-27001'},
  {id: 'synthetic-new-soc', name: 'QA new SOC client', framework: 'soc-2'},
  {id: 'synthetic-new-unenrolled', name: 'QA new unenrolled client'},
];

function clientFixture({id, name, framework, group}) {
  const client = {client_id: id, name, status: 'active', environment: 'Demo'};
  if (!framework) return client;
  const program = {
    client_id: id, program_id: `${id}:${framework}`, framework_key: framework,
    version: frameworkCatalog(framework).version, selected: true,
  };
  if (framework === 'cis-ig1') {
    client.framework_settings = {[framework]: {implementation_group: group}};
    client.cis_program = {...program, implementation_group: group};
  } else client.shared_programs = [program];
  return client;
}

function selectClient(specification, mode = 'demo') {
  mockPreviewMode = mode === 'demo';
  mockAuth = {workspaceMode: mode, loading: false, user: {
    user_id: 'synthetic-shell-owner', name: 'QA shell owner', role: 'super_admin', workspace_mode: mode,
  }};
  const clients = CLIENTS.map(clientFixture);
  const currentClient = clients.find(client => client.client_id === specification.id);
  mockOrg = {currentClientId: currentClient.client_id, currentClient, clients,
    loading: false, switchClient: jest.fn(), refresh: jest.fn()};
  sessionStorage.setItem('grc_client_id', currentClient.client_id);
  mockLocation = {pathname: '/dashboard', search: `?client_id=${currentClient.client_id}`, key: 'shell-fixture'};
}

let host, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  mockNavigate.mockClear();
  selectClient(CLIENTS[0]);
  api.get.mockImplementation(async path => ({data: path === '/dashboard'
    ? {client_id: mockOrg.currentClientId, kpis: {}, items: []} : []}));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const renderLayout = () => act(async () => root.render(<Layout/>));

function expectStaticApplicationBrand(node) {
  expect(node).not.toBeNull();
  expect(node.textContent).toContain('GoverNara');
  expect(node.textContent).toContain('Turn complexity into clarity.');
  expect(node.textContent).not.toMatch(/by prestige worldwide|clarity for a stronger tomorrow/i);
  expect(node.closest('a,button,[role="button"],[role="link"]')).toBeNull();
  expect(node.hasAttribute('tabindex')).toBe(false);
  expect(node.querySelector('a,button,[href],[tabindex],[role="button"],[role="link"]')).toBeNull();
  expect(node.querySelector('img.governara-feather')).not.toBeNull();
}

test('the application brand is static while the excluded public Brand keeps its existing presentation', async () => {
  await act(async () => root.render(<ApplicationBrand/>));
  expectStaticApplicationBrand(host.firstElementChild);
  await act(async () => root.render(<Brand/>));
  expect(host.querySelector('.brand-lockup').getAttribute('aria-label')).toBe('GoverNara by Prestige Worldwide');
  expect(host.querySelector('.brand-owner').textContent).toBe('BY PRESTIGE WORLDWIDE');
});

test.each(['demo', 'standard'].flatMap(mode => CLIENTS.map(client => [mode, client.name, client])))(
  '%s chrome for %s uses the application shell without a client or framework allowlist',
  async (mode, clientName, client) => {
    selectClient(client, mode);
    const programRoute = client.framework ? `/compliance/${client.framework}` : '/systems';
    for (const pathname of ['/clients', '/admin/clients', '/dashboard', programRoute]) {
      mockLocation = {...mockLocation, pathname};
      await renderLayout();
      const shell = host.querySelector('.brawndo-workspace-pilot');
      expect(shell.dataset.applicationShell).toBe('true');
      expect(host.querySelector('.bwp-topbar')).not.toBeNull();
      expect(host.querySelector('aside.bsb')).not.toBeNull();
      expectStaticApplicationBrand(host.querySelector('.bwp-brand'));
      expectStaticApplicationBrand(host.querySelector('.bsb-brand'));
      expect(host.querySelector('[data-testid="native-record-draft"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="Toggle client navigation"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="Search workspace pages and active work"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="profile-menu-trigger"]')).not.toBeNull();
      if (pathname === '/dashboard') {
        expect(host.querySelector('[data-testid="context-header-client"]').textContent).toContain(clientName);
        expect(host.querySelector('.bwp-client').textContent).toContain(clientName);
      }
    }
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  },
);

test('brand clicks do not navigate while Portfolio, directory, menu and workspace search remain operational', async () => {
  selectClient(CLIENTS[8], 'standard');
  await renderLayout();
  for (const brand of host.querySelectorAll('.bwp-brand,.bsb-brand')) {
    await act(async () => {brand.click(); brand.querySelector('img').click();});
  }
  expect(mockNavigate).not.toHaveBeenCalled();

  const mobile = host.querySelector('[aria-label="Toggle client navigation"]');
  expect(mobile.getAttribute('aria-expanded')).toBe('false');
  await act(async () => mobile.click());
  expect(mobile.getAttribute('aria-expanded')).toBe('true');
  await act(async () => host.querySelector('[aria-label="Close client navigation"]').click());
  expect(mobile.getAttribute('aria-expanded')).toBe('false');

  await act(async () => host.querySelector('[data-testid="return-to-portfolio"]').click());
  expect(mockNavigate).toHaveBeenLastCalledWith('/clients');
  await act(async () => host.querySelector('.bwp-client').click());
  expect(mockNavigate).toHaveBeenLastCalledWith('/clients');

  const search = host.querySelector('[aria-label="Search workspace pages and active work"]');
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', {key: 'k', ctrlKey: true, bubbles: true})));
  expect(document.activeElement).toBe(search);
  expect(search.getAttribute('aria-expanded')).toBe('true');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, 'Reviews');
    search.dispatchEvent(new Event('input', {bubbles: true}));
  });
  const results = host.querySelector('#bwp-search-results');
  expect(results.querySelector('a[href="/reviews"]')).not.toBeNull();
  expect(results.querySelector('a[href="/calendar"]')).toBeNull();
  await act(async () => results.querySelector('a[href="/reviews"]').click());
  expect(mockNavigate).toHaveBeenLastCalledWith('/reviews');
  expect(search.getAttribute('aria-expanded')).toBe('false');
});

test('theme and navigation changes preserve the mounted native draft and saved theme preference', async () => {
  localStorage.setItem(THEME_KEY, 'dark');
  await renderLayout();
  const shell = host.querySelector('.brawndo-workspace-pilot');
  const draft = host.querySelector('[data-testid="native-record-draft"]');
  draft.value = 'Unsaved native record detail';
  expect(shell.dataset.theme).toBe('dark');
  await act(async () => host.querySelector('[aria-label="Use light workspace theme"]').click());
  expect(localStorage.getItem(THEME_KEY)).toBe('light');
  expect(shell.dataset.theme).toBe('light');
  await act(async () => host.querySelector('[aria-label="Toggle client navigation"]').click());
  expect(host.querySelector('[data-testid="native-record-draft"]')).toBe(draft);
  expect(draft.value).toBe('Unsaved native record detail');
  expectStaticApplicationBrand(host.querySelector('.bwp-brand'));
  expect(api.post).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
});

test.each(['super_admin', 'platform_admin', 'client_readonly'])('%s retains its native client-directory control', async role => {
  mockAuth = {...mockAuth, user: {...mockAuth.user, role}};
  await renderLayout();
  expectStaticApplicationBrand(host.querySelector('.bwp-brand'));
  const directory = host.querySelector('.bwp-client');
  const internal = role === 'super_admin' || role === 'platform_admin';
  expect(directory.tagName).toBe(internal ? 'BUTTON' : 'SPAN');
  expect(!!host.querySelector('[data-testid="return-to-portfolio"]')).toBe(internal);
  if (internal) {
    await act(async () => directory.click());
    expect(mockNavigate).toHaveBeenLastCalledWith('/clients');
  } else expect(mockNavigate).not.toHaveBeenCalled();
});
