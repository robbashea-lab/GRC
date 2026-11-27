import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import IVentureSetup from './IVentureSetup';
import api from '@/lib/api';

let mockUser, mockClient, mockSetup;
jest.mock('@/context/AuthContext', () => ({useAuth: () => ({user: mockUser, workspaceMode: 'demo'})}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => ({currentClientId: mockClient.client_id, currentClient: mockClient})}));
jest.mock('react-router-dom', () => ({Link: ({to, children, ...props}) => <a href={to} {...props}>{children}</a>}));
jest.mock('@/lib/api', () => ({__esModule: true, default: {get: jest.fn(), post: jest.fn()}, formatError: error => error.message}));

const CLIENT = 'r4_setup_owned', ACTIVITY = 'review:r4_setup_owned_review';
const CLIENT_VERSION = '2026-11-19T08:00:00+00:00', REVIEW_VERSION = '2026-11-19T08:01:00+00:00';
const EXCLUSION_PATH = '/clients/' + CLIENT + '/iv-setup/exclusion/' + encodeURIComponent(ACTIVITY);
let host, root;
const dialog = () => document.querySelector('[role="dialog"]');
const button = (scope, label) => [...scope.querySelectorAll('button')].find(node => node.textContent === label || (label === 'Set up / edit' && node.getAttribute('aria-label')?.startsWith('Set up / edit ')));
const click = async node => {expect(node).toBeTruthy(); await act(async () => node.click());};
const writeNote = async text => {
  const node = dialog().querySelector('textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(node, text);
    node.dispatchEvent(new Event('input', {bubbles: true}));
  });
};
const render = async () => {await act(async () => root.render(<IVentureSetup />));};
const configuredSetup = () => Object.assign(mockSetup.activities[0], {
  responsibility: 'iv', cadence: 'annual', setup: {recurring_ticket_number: '74231', notes: 'Initial owned setup notes'}
});

test('initial setup groups only the selected client’s provider activities and keeps completed tickets and reviews linked',async()=>{
  const open=mockSetup.activities[0];
  mockSetup.activities.push({...open,activity_id:'saved-configured',title:'Configured inventory',state:'done',setup:{recurring_ticket_number:'84729'},review_id:'saved-review'},
    {...open,activity_id:'governance',title:'Policy attestation',internal:true},{...open,activity_id:'other',title:'Customer-managed scan',provider_relevant:false});
  await render();
  expect(host.querySelector('.ivs-panel h2').textContent).toBe('Initial setup');
  const groups=[...host.querySelectorAll('.ivs-section')];
  expect(groups).toHaveLength(2);
  expect(groups[0].textContent).toContain('To set up');expect(groups[1].textContent).toContain('Ticket #84729');
  expect(groups[1].querySelector('a').getAttribute('href')).toContain('review_id=saved-review');
  expect(host.querySelector('.ivs-note').textContent).toContain('Policy attestation');
  expect(host.querySelector('.ivs-note').textContent).toContain('Customer-managed scan');
  expect(host.querySelectorAll('.ivs-row')).toHaveLength(2);
});

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  mockUser = {user_id: 'r4_setup_owner', role: 'super_admin', status: 'active'};
  mockClient = {client_id: CLIENT, name: 'Owned synthetic client', status: 'active'};
  mockSetup = {client_id: CLIENT, expected_client_updated_at: CLIENT_VERSION, outstanding_count: 1,
    activities: [{activity_id: ACTIVITY, review_id: 'r4_setup_owned_review', title: 'Owned synthetic endpoint Review',
      drivers: [{framework_key: 'cis-ig1'}], area_id: 'endpoint', state: 'todo', internal: false, provider_relevant: true,
      expected_updated_at: REVIEW_VERSION, setup: {}, first_next_due: '2027-01-31'}]};
  api.get.mockReset(); api.post.mockReset();
  api.get.mockImplementation(async () => ({data: mockSetup}));
  api.post.mockResolvedValue({data: {ok: true}});
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); sessionStorage.clear();});

test.each([
  ['spm', 'The Security Program Manager performs it'],
  ['client', 'The client or another provider does it'],
  ['na', 'Doesn’t apply to this client']
])('removal records the approved %s choice with an optional empty note', async (kind, label) => {
  await render();
  await click(button(host, 'Remove from setup'));
  expect(dialog().textContent).toContain('Remove from iVenture Setup');
  expect(dialog().querySelector('legend').textContent).toBe('Why it doesn’t need a recurring iVenture ticket');
  expect([...dialog().querySelectorAll('input[type="radio"]')].map(node => node.value)).toEqual(['spm', 'client', 'na']);
  expect(dialog().querySelector('input[value="spm"]').checked).toBe(true);
  expect(dialog().querySelector('textarea').required).toBe(false);
  expect(dialog().querySelector('textarea').maxLength).toBe(2000);
  expect(dialog().querySelector('textarea').placeholder).toBe('Anything the team should know, for example where the work is tracked');
  expect(dialog().textContent).toContain('Note (optional)');
  await click([...dialog().querySelectorAll('label')].find(node => node.textContent === label).querySelector('input'));
  await click(button(dialog(), 'Remove from setup'));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls[0][0]).toBe(EXCLUSION_PATH);
  expect(api.post.mock.calls[0][1]).toEqual({expected_updated_at: REVIEW_VERSION,
    expected_client_updated_at: CLIENT_VERSION, excluded: true, kind, note: ''});
  expect(api.post.mock.calls[0][2].headers['Idempotency-Key']).toEqual(expect.any(String));
  expect(api.get.mock.calls.map(([path]) => path)).toEqual(['/clients/' + CLIENT + '/iv-setup', '/clients/' + CLIENT + '/iv-setup']);
  expect(dialog()).toBeNull();
});

test('removal sends the optional note as input without inventing a canonical reason', async () => {
  await render(); await click(button(host, 'Remove from setup'));
  await writeNote('Owned result location — 合成 QA\nRetain the existing Review.');
  await click(button(dialog(), 'Remove from setup'));
  expect(api.post.mock.calls[0][1]).toEqual({expected_updated_at: REVIEW_VERSION,
    expected_client_updated_at: CLIENT_VERSION, excluded: true, kind: 'spm',
    note: 'Owned result location — 合成 QA\nRetain the existing Review.'});
  expect(api.post.mock.calls[0][1]).not.toHaveProperty('reason');
});

test.each(['Cancel', 'Escape'])('%s dismisses the removal without a native write', async action => {
  await render(); await click(button(host, 'Remove from setup')); await writeNote('Uncommitted owned note');
  if (action === 'Cancel') await click(button(dialog(), 'Cancel'));
  else await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
  expect(dialog()).toBeNull(); expect(api.post).not.toHaveBeenCalled();
  expect(api.get).toHaveBeenCalledTimes(1);
});

test('Restore uses the same native exclusion route with explicit false and no new removal fields', async () => {
  mockSetup.activities[0].state = 'removed'; mockSetup.outstanding_count = 0;
  mockSetup.activities[0].exclusion = {kind: 'spm', reason: 'Retained original removal'};
  await render(); await click(host.querySelector('.ivs-removed summary')); await click(button(host, 'Restore'));
  expect(dialog().textContent).toContain('Restore activity to setup');
  expect(dialog().querySelectorAll('input[type="radio"], textarea')).toHaveLength(0);
  await click(button(dialog(), 'Save decision'));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls[0][0]).toBe(EXCLUSION_PATH);
  expect(api.post.mock.calls[0][1]).toEqual({expected_updated_at: REVIEW_VERSION,
    expected_client_updated_at: CLIENT_VERSION, excluded: false});
  expect(dialog()).toBeNull();
});

test.each(['client_contributor', 'client_grc_manager', 'client_readonly'])('%s retains read access without setup mutation controls', async role => {
  mockUser.role = role; await render();
  expect(host.textContent).toContain('Owned synthetic endpoint Review');
  expect(button(host, 'Remove from setup')).toBeUndefined(); expect(button(host, 'Set up / edit')).toBeUndefined();
  expect(api.post).not.toHaveBeenCalled();
});

test('an archived client retains its read-only setup presentation', async () => {
  mockClient.status = 'archived'; await render();
  expect(button(host, 'Remove from setup')).toBeUndefined(); expect(button(host, 'Set up / edit')).toBeUndefined();
  expect(api.post).not.toHaveBeenCalled();
});

test('an uncertain removal retries its exact choice, note and identity before dismissing', async () => {
  api.post.mockRejectedValueOnce(new Error('Synthetic acknowledgement lost')).mockResolvedValueOnce({data: {ok: true}});
  await render(); await click(button(host, 'Remove from setup'));
  await click(dialog().querySelector('input[value="client"]')); await writeNote('Original retained removal note');
  await click(button(dialog(), 'Remove from setup'));
  const original = JSON.parse(JSON.stringify(api.post.mock.calls[0]));
  expect(dialog().textContent).toContain('Synthetic acknowledgement lost');
  expect(dialog().querySelector('fieldset').disabled).toBe(true);
  expect(dialog().querySelector('textarea').value).toBe('Original retained removal note');
  expect(button(dialog(), 'Cancel').disabled).toBe(true);
  await click(button(dialog(), 'Retry unconfirmed save'));
  expect(api.post).toHaveBeenCalledTimes(2); expect(api.post.mock.calls[1]).toEqual(original);
  expect(original[1]).toEqual({expected_updated_at: REVIEW_VERSION, expected_client_updated_at: CLIENT_VERSION,
    excluded: true, kind: 'client', note: 'Original retained removal note'});
  expect(dialog()).toBeNull();
});

test('an uncertain setup locks every field and mutation trigger until explicit exact retry acknowledges A', async () => {
  configuredSetup();
  api.post.mockRejectedValueOnce(new Error('Synthetic setup acknowledgement lost')).mockResolvedValueOnce({data: {ok: true}});
  await render(); await click(button(host, 'Set up / edit')); await writeNote('Original setup A');
  await click(button(dialog(), 'Save setup'));
  const original = JSON.parse(JSON.stringify(api.post.mock.calls[0]));
  expect(original[0]).toBe('/clients/' + CLIENT + '/iv-setup');
  expect(original[1]).toMatchObject({activity_id: ACTIVITY, review_id: 'r4_setup_owned_review', notes: 'Original setup A'});
  expect(dialog().querySelector('fieldset').disabled).toBe(true);
  expect([...dialog().querySelectorAll('input, select, textarea')].every(node => node.matches(':disabled'))).toBe(true);
  expect(button(host, 'Set up / edit').disabled).toBe(true); expect(button(host, 'Remove from setup').disabled).toBe(true);
  expect(button(dialog(), 'Cancel').disabled).toBe(true);
  expect(dialog().querySelector('textarea').value).toBe('Original setup A');
  await click(button(dialog(), 'Retry unconfirmed save'));
  expect(api.post).toHaveBeenCalledTimes(2); expect(api.post.mock.calls[1]).toEqual(original);
  expect(dialog()).toBeNull();
  expect(button(host, 'Set up / edit').disabled).toBe(false); expect(button(host, 'Remove from setup').disabled).toBe(false);
  await click(button(host, 'Set up / edit')); await writeNote('A later explicit local setup draft B');
  expect(dialog().querySelector('fieldset').disabled).toBe(false);
  expect(dialog().querySelector('textarea').value).toBe('A later explicit local setup draft B');
  expect(api.post).toHaveBeenCalledTimes(2);
});

test.each(['acknowledged', 'failed'])('a delayed %s retry for client A cannot clear or disable client B’s setup draft', async result => {
  configuredSetup(); let acknowledge, reject;
  api.post.mockRejectedValueOnce(new Error('Synthetic original response lost')).mockImplementationOnce(() =>
    new Promise((resolve, fail) => {acknowledge = resolve; reject = fail;}));
  await render(); await click(button(host, 'Set up / edit')); await writeNote('Retained client A setup');
  await click(button(dialog(), 'Save setup'));
  const original = JSON.parse(JSON.stringify(api.post.mock.calls[0]));
  await click(button(dialog(), 'Retry unconfirmed save'));
  expect(api.post.mock.calls[1]).toEqual(original);
  mockClient = {client_id: 'r4_setup_second', name: 'Second owned synthetic client', status: 'active'};
  mockSetup = {...mockSetup, client_id: mockClient.client_id, activities: [{...mockSetup.activities[0],
    activity_id: 'review:r4_setup_second_review', review_id: 'r4_setup_second_review', title: 'Second owned setup Review'}]};
  await render();
  expect(button(host, 'Set up / edit').disabled).toBe(false);
  await click(button(host, 'Set up / edit')); await writeNote('Client B draft must survive the old response');
  expect(dialog().querySelector('fieldset').disabled).toBe(false);
  await act(async () => {
    if (result === 'acknowledged') acknowledge({data: {ok: true}});
    else reject(new Error('Late client A retry failure'));
  });
  expect(dialog().textContent).toContain('Second owned setup Review');
  expect(dialog().querySelector('textarea').value).toBe('Client B draft must survive the old response');
  expect(dialog().querySelector('fieldset').disabled).toBe(false); expect(button(dialog(), 'Save setup').disabled).toBe(false);
  expect(host.textContent).not.toContain('Late client A retry failure');
  expect(api.post).toHaveBeenCalledTimes(2);
});
