import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import RiskRegister from './RiskRegister';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';
import {rememberClient} from '@/lib/clientSelection';
import {toast} from 'sonner';

let mockAuth, mockOrg;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('react-router-dom', () => ({
  useLocation: () => ({pathname: '/risks', search: ''}), useNavigate: () => jest.fn(),
  useSearchParams: () => require('react').useState(new URLSearchParams()),
}), {virtual: true});
jest.mock('@/components/RecordDrawer', () => () => null);
jest.mock('sonner', () => ({toast: {error: jest.fn(), success: jest.fn()}}));

let root, host, savedAdapter, requests, records, loseResponse;
const click = node => act(async () => {expect(node).toBeTruthy(); node.click();});
const change = (node, value) => act(async () => {
  const prototype = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
  node.dispatchEvent(new Event('input', {bubbles: true}));
});
async function fill() {
  await click(host.querySelector('[data-testid="new-risk"]'));
  const dialog = document.querySelector('[data-testid="new-risk-dialog"]');
  await change(dialog.querySelector('[aria-label="Risk title"]'), 'SYNTHETIC response-loss risk');
  await change(dialog.querySelector('[aria-label="Risk description"]'), 'Disposable transport recovery fixture.');
  await click(dialog.querySelectorAll('.rw-scale')[0].querySelectorAll('button')[2]);
  await click(dialog.querySelectorAll('.rw-scale')[1].querySelectorAll('button')[2]);
  return dialog;
}

beforeAll(() => Object.defineProperty(global, 'crypto', {configurable: true, value: require('crypto').webcrypto}));
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear(); rememberClient('qa-risk-client');
  window.history.replaceState({}, '', '/risks');
  mockAuth = {workspaceMode: 'standard', loading: false, user: {user_id: 'synthetic-risk-admin', role: 'super_admin'}};
  const client = {...cisClient('qa-risk-client'), name: 'SYNTHETIC Risk recovery'};
  mockOrg = {currentClientId: client.client_id, currentClient: client, clients: [client], loading: false};
  requests = []; records = new Map(); loseResponse = true;
  savedAdapter = api.defaults.adapter;
  // In-memory transport only. Match the server's existing key-based replay contract;
  // this tests the actual Axios interceptor, not real HTTP/Mongo persistence.
  api.defaults.adapter = async config => {
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    if (config.method === 'post' && config.url === '/risks') {
      const key = config.headers.get('Idempotency-Key');
      requests.push({key, body});
      if (!records.has(key)) records.set(key, {...body, risk_id: `synthetic-risk-${records.size + 1}`, status: 'open'});
      if (loseResponse) {loseResponse = false; throw Object.assign(new Error('SYNTHETIC response lost after commit'), {config});}
      return {data: records.get(key), config, status: 200, statusText: 'OK', headers: {}};
    }
    return {data: config.url === '/risks' ? [...records.values()].filter(row => row.client_id === config.params.client_id) : [], config, status: 200, statusText: 'OK', headers: {}};
  };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await act(async () => root.render(<RiskRegister/>));
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); api.defaults.adapter = savedAdapter; jest.clearAllMocks();
});

test('native Risk retry after an uncertain response keeps one command and one record', async () => {
  const dialog = await fill();
  await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  expect(records.size).toBe(1);
  expect(document.querySelector('[aria-label="Risk title"]').value).toBe('SYNTHETIC response-loss risk');
  expect(toast.error).toHaveBeenCalledWith('SYNTHETIC response lost after commit');
  expect(dialog.querySelector('[data-testid="new-risk-save"]').disabled).toBe(false);
  expect(toast.success).not.toHaveBeenCalled();
  await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  expect(requests).toHaveLength(2);
  expect(requests[1].body).toEqual(requests[0].body);
  expect(requests[1].key).toBe(requests[0].key);
  expect(records.size).toBe(1);
  expect(document.querySelector('[data-testid="new-risk-dialog"]')).toBeNull();
  await act(async () => root.unmount()); root = createRoot(host);
  await act(async () => root.render(<RiskRegister/>));
  expect(host.textContent.match(/SYNTHETIC response-loss risk/g)).toHaveLength(1);
});

test('a successful independent Risk form gets its own command identity', async () => {
  loseResponse = false;
  let dialog = await fill(); await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  dialog = await fill(); await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  expect(requests).toHaveLength(2);
  expect(requests[1].key).not.toBe(requests[0].key);
  expect(records.size).toBe(2);
});

test('uncertain Risk recovery cannot silently turn edited values into a second command', async () => {
  const dialog = await fill();
  await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  await change(dialog.querySelector('[aria-label="Risk title"]'), 'Changed while outcome is unknown');
  await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  expect(requests).toHaveLength(1); expect(records.size).toBe(1);
  expect(toast.error).toHaveBeenLastCalledWith(expect.stringContaining('Restore its original values'));
  expect(dialog.querySelector('[data-testid="new-risk-save"]').disabled).toBe(false);
  await change(dialog.querySelector('[aria-label="Risk title"]'), 'SYNTHETIC response-loss risk');
  await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  expect(requests).toHaveLength(2); expect(records.size).toBe(1);
  expect(requests[1].key).toBe(requests[0].key);
});

test('an explicit server rejection before any write allows correcting the native Risk draft', async () => {
  loseResponse = false;
  const transport = api.defaults.adapter;
  let rejectedKey;
  api.defaults.adapter = async config => {
    if (config.method === 'post' && !rejectedKey) {
      rejectedKey = config.headers.get('Idempotency-Key');
      throw Object.assign(new Error('SYNTHETIC rejected before write'),
        {config, response: {status: 422, headers: {'x-create-rejected': 'true'}}});
    }
    return transport(config);
  };
  const dialog = await fill();
  await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  expect(records.size).toBe(0);
  await change(dialog.querySelector('[aria-label="Risk title"]'), 'Corrected valid Risk');
  await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  expect(records.size).toBe(1); expect(requests).toHaveLength(1);
  expect(requests[0].key).not.toBe(rejectedKey);
  expect(requests[0].body.title).toBe('Corrected valid Risk');
});

test.each([false, true])('a previous client save cannot close a later draft (return to original client: %s)', async returnToOriginal => {
  loseResponse = false;
  let release;
  const delayed = new Promise(resolve => {release = resolve;});
  const transport = api.defaults.adapter;
  const reads = [];
  api.defaults.adapter = async config => {
    if (config.method === 'get' && config.url === '/risks') reads.push(config.params.client_id);
    const response = await transport(config);
    if (config.method === 'post') await delayed;
    return response;
  };
  const firstDialog = await fill();
  await click(firstDialog.querySelector('[data-testid="new-risk-save"]'));
  expect(records.size).toBe(1);
  const original = mockOrg;
  const client = {...cisClient('qa-risk-client-b'), name: 'SYNTHETIC second client'};
  mockOrg = {currentClientId: client.client_id, currentClient: client, clients: [client], loading: false};
  rememberClient(client.client_id);
  await act(async () => root.render(<RiskRegister/>));
  if (returnToOriginal) {
    mockOrg = original; rememberClient(original.currentClientId);
    await act(async () => root.render(<RiskRegister/>));
  }
  const nextDialog = await fill();
  const before = [...reads];
  await act(async () => release());
  expect(document.querySelector('[data-testid="new-risk-dialog"]')).toBe(nextDialog);
  expect(nextDialog.querySelector('[aria-label="Risk title"]').value).toBe('SYNTHETIC response-loss risk');
  expect(nextDialog.querySelector('[data-testid="new-risk-save"]').disabled).toBe(false);
  expect(reads).toEqual(before);
  expect(requests).toHaveLength(1);
});
