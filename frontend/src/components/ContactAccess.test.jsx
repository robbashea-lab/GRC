import { act } from 'react';
import { createRoot } from 'react-dom/client';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ContactAccessDetails } from './ContactAccess';

jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, auth, requests;
const contact = { client_id: 'a', linked_user_id: 'alex', role: 'Security Lead' };
const member = { user_id: 'alex', role: 'client_contributor', client_ids: ['a'], status: 'active' };
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  auth = { user: { user_id: 'viewer' }, workspaceMode: 'demo' }; useAuth.mockImplementation(() => auth);
  requests = [];
  api.get.mockImplementation((url, config) => new Promise((resolve, reject) => requests.push({ url, config, resolve, reject })));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.clearAllMocks(); });
const render = (row = contact, open = true) => act(async () => root.render(<ContactAccessDetails contact={row} clientId={row.client_id} open={open} />));
const resolve = (request, data) => act(async () => request.resolve({ data }));
test('uses scoped read-only endpoint and shared status, without account actions or IDs', async () => {
  await render(); expect(requests[0].url).toBe('/clients/a/members');
  await resolve(requests[0], [member]);
  expect(container.textContent).toContain('Active account');
  expect(container.textContent).toContain('Security Lead');
  expect(container.textContent).not.toContain('alex');
  expect(container.querySelector('button')).toBeNull();
});
test('client switch aborts old request and ignores late completion', async () => {
  await render(); const first = requests[0];
  await render({ ...contact, client_id: 'b' }); expect(first.config.signal.aborted).toBe(true);
  await resolve(first, [member]); expect(container.textContent).not.toContain('Active account');
  await resolve(requests[1], []); expect(container.textContent).toContain('Access not verified');
});
test('account/session change clears prior active state', async () => {
  await render(); await resolve(requests[0], [member]);
  auth = { user: { user_id: 'other-viewer' }, workspaceMode: 'standard' };
  await render(); expect(container.textContent).not.toContain('Active account');
  await act(async () => requests[1].reject(new Error('Forbidden')));
  expect(container.textContent).toContain('Access not verified');
});
test('closed detail cancels request and unmount is safe', async () => {
  await render(); const first = requests[0]; await render(contact, false);
  expect(first.config.signal.aborted).toBe(true);
  await resolve(first, [member]); expect(container.textContent).not.toContain('Active account');
});
test('missing membership response and network failure fail closed', async () => {
  await render(); await resolve(requests[0], null);
  expect(container.textContent).toContain('Access not verified');
});
test('empty/new Contact stays valid and does not claim account absence', async () => {
  await render({ client_id: 'a' }); expect(container.textContent).toContain('Account not linked');
  expect(container.textContent).toContain('Not specified');
});
