import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {OrgProvider, useOrg} from '@/context/OrgContext';
import {clearPendingCommands, createIntent, syncPendingCommandIdentity} from '@/lib/createIntent';
import ClientProfile from './ClientProfile';
import IVentureSetup from '@/components/IVentureSetup';
import api from '@/lib/api';

let mockAuth, mockLocation, org;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  useNavigate:()=>jest.fn(),
  useSearchParams: () => [new URLSearchParams(mockLocation.search), jest.fn()],
  Link: ({children, to, ...props}) => <a href={to} {...props}>{children}</a>,
  Navigate: () => null,
}));
jest.mock('./Onboarding', () => () => <div>Native onboarding</div>);
jest.mock('@/lib/api', () => ({__esModule: true,
  default: {get: jest.fn(), post: jest.fn()}, formatError: error => error.message,
}));

const CLIENT = 'synthetic-recovery-client';
const rejection = (status = 409, ids = [CLIENT]) => ({response: {status, data: {detail: {
  code: 'SHARED_CONTEXT_RECOVERY_REQUIRED', message: 'The original save needs recovery.', client_ids: ids,
}}}});
let root, host, pending;
function Probe() {org = useOrg(); return null;}
const render = child => act(async () => root.render(<OrgProvider><Probe/>{child}</OrgProvider>));
const retry = () => [...host.querySelectorAll('button')].find(node => node.textContent === 'Retry unconfirmed save');

beforeAll(() => Object.defineProperty(global, 'crypto', {configurable: true, value: require('crypto').webcrypto}));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();sessionStorage.clear();clearPendingCommands();
  mockAuth = {user: {user_id: 'synthetic-owner', role: 'super_admin', status: 'active'}, workspaceMode: 'standard'};
  syncPendingCommandIdentity(mockAuth.user.user_id, mockAuth.workspaceMode);
  localStorage.setItem('grc_client_id', CLIENT);
  mockLocation = {pathname: '/client-profile', search: '?client_id=' + CLIENT + '&tab=services'};
  pending = true;api.get.mockReset();api.post.mockReset();
  api.get.mockImplementation(async path => {
    if (path === '/clients') {
      if (pending) throw rejection();
      return {data: [{client_id: CLIENT, name: 'SYNTHETIC recovery client', status: 'active'}]};
    }
    if (path === `/clients/${CLIENT}/services`) return {data: {client_id: CLIENT, updated_at: 'confirmed-A', services: {}, catalog: []}};
    if (path === `/clients/${CLIENT}/iv-setup`) return {data: {client_id: CLIENT, activities: [], outstanding_count: 0}};
    throw new Error('Synthetic unavailable ordinary profile; no substitute data.');
  });
  host = document.createElement('div');document.body.appendChild(host);root = createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount());host.remove();clearPendingCommands();});

test.each(['services', 'iv-setup'])('reload keeps the exact native %s retry reachable without a partial Client', async operation => {
  const path = `/clients/${CLIENT}/${operation}`;
  const body = operation === 'services'
    ? {expected_updated_at: 'original-A', areas: {endpoint: {responsibility: 'iv', tool_ids: []}}, custom_tools: [], preset: null}
    : {expected_updated_at: 'original-A', expected_client_updated_at: 'original-client-A', activity_id: 'synthetic-activity', recurring_ticket_number: '42001'};
  const command = createIntent(api.post, `standard:synthetic-owner:r4-${operation === 'services' ? 'services' : 'setup'}:${CLIENT}`);
  api.post.mockRejectedValueOnce(new Error('Synthetic response A lost'));
  await expect(command(path, body)).rejects.toThrow('Synthetic response A lost');
  const original = api.post.mock.calls[0];
  if (operation === 'iv-setup') mockLocation = {pathname: '/iv-setup', search: '?client_id=' + CLIENT};
  await render(operation === 'services' ? <ClientProfile/> : <IVentureSetup/>);
  expect(org.clients).toEqual([]);expect(org.currentClient).toBeNull();expect(org.currentClientId).toBe('');
  expect(org.recoveryClientId).toBe(CLIENT);
  expect(retry()).toBeTruthy();expect(retry().disabled).toBe(false);
  expect(api.get.mock.calls.map(([url]) => url)).toEqual(['/clients']);
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toContain('SYNTHETIC recovery client');
  api.post.mockImplementationOnce(async () => {pending = false;return {data: {ok: true}};});
  await act(async () => retry().click());
  expect(api.post).toHaveBeenCalledTimes(2);expect(api.post.mock.calls[1]).toEqual(original);
  expect(org.currentClientId).toBe(CLIENT);expect(org.recoveryClientId).toBe('');
  expect(org.currentClient.name).toBe('SYNTHETIC recovery client');
});

test.each([401, 403])('HTTP %s never promotes an identity-only error to recovery authority', async status => {
  api.get.mockRejectedValue(rejection(status));
  await render(<ClientProfile/>);
  expect(org.recoveryClientId).toBe('');expect(org.currentClientId).toBe('');expect(retry()).toBeUndefined();
  expect(api.post).not.toHaveBeenCalled();
});

test('foreign URL selection and a changed actor cannot reuse previous recovery identities', async () => {
  mockLocation.search = '?client_id=foreign&tab=services';
  await render(<ClientProfile/>);
  expect(org.recoveryClientId).toBe('');expect(org.currentClientId).toBe('');
  mockLocation.search = '?client_id=' + CLIENT + '&tab=services';
  await render(<ClientProfile/>);expect(org.recoveryClientId).toBe(CLIENT);
  let resolveNew;
  api.get.mockImplementationOnce(() => new Promise(resolve => {resolveNew = resolve;}));
  mockAuth = {...mockAuth, user: {...mockAuth.user, user_id: 'another-authorized-actor'}};
  await render(<ClientProfile/>);
  expect(org.recoveryClientId).toBe('');expect(retry()).toBeUndefined();
  await act(async () => resolveNew({data: []}));
  expect(org.recoveryClientId).toBe('');expect(api.post).not.toHaveBeenCalled();
});

test('a read-only role has no recovery mutation control even with its own retained intent', async () => {
  mockAuth.user.role = 'client_readonly';
  const command = createIntent(api.post, `standard:synthetic-owner:r4-services:${CLIENT}`);
  api.post.mockRejectedValueOnce(new Error('Synthetic retained response'));
  await expect(command(`/clients/${CLIENT}/services`, {expected_updated_at: null, areas: {}})).rejects.toThrow();
  await render(<ClientProfile/>);
  expect(org.recoveryClientId).toBe(CLIENT);expect(retry()).toBeUndefined();
  expect(api.post).toHaveBeenCalledTimes(1);expect(org.clients).toEqual([]);
});
