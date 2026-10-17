import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import VendorRegister from './VendorRegister';
import api from '@/lib/api';

jest.setTimeout(15000);

let mockPath = '/vendors', mockSearch = '';
let mockAuth, mockOrg;
const mockNavigate = jest.fn();
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/context/OrgContext', () => ({ useOrg: () => mockOrg }));
jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPath, search: mockSearch }), useNavigate: () => mockNavigate,
  useSearchParams: () => require('react').useState(new URLSearchParams(mockSearch)),
}), { virtual: true });
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn() }, formatError: error => error.message, PREVIEW_MODE: true }));
jest.mock('@/components/RecordDrawer', () => function NativeDrawer(props) {
  const [draft, setDraft] = require('react').useState('Native draft');
  return props.open && <aside data-testid="native-vendor-drawer"><span>{props.record?.vendor_id}</span><span>{props.initialValues?.vendorTab}</span><input aria-label="Native draft" value={draft} onChange={event => setDraft(event.target.value)} /><button type="button" onClick={props.onSaved}>Refresh native relations</button></aside>;
});

let root, container;
const vendor = { vendor_id: 'v1', client_id: 'demo_brawndo', name: 'Recorded vendor', status: 'active', criticality: 'high', service: 'Actual service', assurance_records: [] };
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('grc_client_id', 'demo_brawndo');
  mockPath = '/vendors'; mockSearch = ''; mockAuth = { workspaceMode: 'demo', user: { user_id: 'demo-actor', role: 'super_admin', workspace_mode: 'demo' } };
  mockOrg = { currentClientId: 'demo_brawndo', currentClient: { client_id: 'demo_brawndo', name: 'Brawndo', status: 'active' } };
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
    expect(names()).toEqual(expected);
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
