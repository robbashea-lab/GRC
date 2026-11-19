import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import ToolCatalog from './ToolCatalog';
import api from '@/lib/api';

jest.mock('@/context/AuthContext', () => ({useAuth: () => ({
  user: {user_id: 'catalog-owner', role: 'super_admin'}, workspaceMode: 'demo'
})}));
jest.mock('@/lib/api', () => ({__esModule: true, default: {get: jest.fn(), post: jest.fn()}, formatError: error => error.message}));
jest.mock('./ServicesTools', () => ({ToolDetails: () => <p>Saved tool details</p>, ToolSources: () => <p>Saved tool sources</p>}));

let host, root, tools;
const dialog = () => [...document.querySelectorAll('[role="dialog"]')].at(-1);
const button = (scope, text) => [...scope.querySelectorAll('button')].find(node => node.textContent === text);
const field = (scope, label) => [...scope.querySelectorAll('label')].find(node => node.textContent.startsWith(label))?.querySelector('input, select, textarea');
const click = async node => {expect(node).toBeTruthy(); await act(async () => node.click());};
const change = async (node, value) => {
  expect(node).toBeTruthy();
  await act(async () => {
    const prototype = node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', {bubbles: true}));
  });
};
const render = async () => {await act(async () => root.render(<MemoryRouter><ToolCatalog /></MemoryRouter>));};
const pendingRequest = () => {
  const key = Object.keys(sessionStorage).find(value => value.startsWith('grc_pending_command_v1:'));
  return key ? JSON.parse(sessionStorage.getItem(key)) : null;
};

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  tools = [
    {tool_id: 'owned-a', name: 'Owned tool A', vendor: 'Owned vendor', category: 'org', area_ids: ['endpoint'], description: '', retired: false, updated_at: 'version-a1'},
    {tool_id: 'owned-b', name: 'Owned tool B', vendor: 'Owned vendor', category: 'org', area_ids: ['endpoint'], description: '', retired: false, updated_at: 'version-b1'}
  ];
  api.get.mockReset(); api.post.mockReset();
  api.get.mockImplementation(async path => {
    if (path.endsWith('/usage')) {
      const tool=tools.find(value=>path==='/tool-catalog/'+value.tool_id+'/usage');
      return {data:{tool_id:tool.tool_id,expected_updated_at:tool.updated_at??null,scope:'authorized_clients',
        client_count:1,selection_count:1,clients:[{client_id:'catalog-client',name:'Synthetic catalog client',status:'active',
          expected_updated_at:'client-v1',areas:[{area_id:'endpoint',name:'Endpoint management and inventory'}]}]}};
    }
    return {data:{tools}};
  });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); sessionStorage.clear();});

test('an uncertain edit retains locked A and retries its exact native request before new edits reenable', async () => {
  let rejectSave;
  api.post.mockImplementationOnce(() => new Promise((resolve, reject) => {rejectSave = reject;}));
  await render(); await click(button(host, 'Owned tool A'));
  await change(field(dialog(), 'Tool name'), 'Saved draft A');
  await click(button(dialog(), 'Save changes'));
  const requestA = JSON.parse(JSON.stringify(api.post.mock.calls[0]));
  expect(requestA[0]).toBe('/tool-catalog/save');
  expect(requestA[1].tool.name).toBe('Saved draft A');
  expect(requestA[1].expected_updated_at).toBe('version-a1');
  expect(requestA[2].headers['Idempotency-Key']).toEqual(expect.any(String));
  expect([...dialog().querySelectorAll('input, select, textarea')].every(node => node.disabled)).toBe(true);
  expect(button(dialog(), 'Replace everywhere').disabled).toBe(true);
  expect(button(dialog(), 'Cancel').disabled).toBe(true);
  await act(async () => rejectSave(new Error('Synthetic response lost')));
  expect(field(dialog(), 'Tool name').value).toBe('Saved draft A');
  expect(field(dialog(), 'Tool name').disabled).toBe(true);
  expect(JSON.parse(pendingRequest().snapshot)).toEqual(requestA.slice(0, 2));
  expect(button(host, 'Add tool').disabled).toBe(true);
  await click(button(dialog(), 'Replace everywhere'));
  await click(button(dialog(), 'Cancel'));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  api.post.mockImplementationOnce(async () => {
    tools = [{...tools[0], name: 'Saved draft A', updated_at: 'version-a2'}, tools[1]];
    return {data: tools[0]};
  });
  expect(button(dialog(), 'Retry unconfirmed save').type).toBe('button');
  await click(button(dialog(), 'Retry unconfirmed save'));
  expect(api.post.mock.calls[1]).toEqual(requestA);
  expect(pendingRequest()).toBeNull(); expect(dialog()).toBeUndefined();
  await click(button(host, 'Saved draft A'));
  expect(field(dialog(), 'Tool name').disabled).toBe(false);
  await change(field(dialog(), 'Tool name'), 'Explicit new draft B');
  api.post.mockResolvedValueOnce({data: {ok: true}});
  await click(button(dialog(), 'Save changes'));
  expect(api.post.mock.calls[2][1].tool.name).toBe('Explicit new draft B');
  expect(api.post.mock.calls[2][1].expected_updated_at).toBe('version-a2');
  expect(api.post.mock.calls[2][2].headers['Idempotency-Key']).not.toBe(requestA[2].headers['Idempotency-Key']);
});

test('an uncertain bulk operation locks selections and other mutations while read filters and exact retry remain available', async () => {
  api.post.mockRejectedValueOnce(new Error('Synthetic bulk response lost'));
  await render(); await click(host.querySelector('[aria-label="Select Owned tool A for bulk changes"]'));
  await click(button(host, 'Retire'));
  const requestA = JSON.parse(JSON.stringify(api.post.mock.calls[0]));
  expect(requestA[0]).toBe('/tool-catalog/bulk');
  expect(requestA[1]).toEqual({tool_ids: ['owned-a'], expected_versions: {'owned-a': 'version-a1'}, retired: true});
  expect(host.querySelector('[aria-label="Select Owned tool A for bulk changes"]').checked).toBe(true);
  expect([...host.querySelectorAll('input[type="checkbox"]')].every(node => node.disabled)).toBe(true);
  expect(host.querySelector('[aria-label="Change selected tool category"]').disabled).toBe(true);
  expect(host.querySelector('[aria-label="Add selected tool service area"]').disabled).toBe(true);
  for (const text of ['Restore', 'Clear selection', 'Add tool']) expect(button(host, text).disabled).toBe(true);
  await click(button(host, 'Restore'));
  expect(api.post).toHaveBeenCalledTimes(1);
  const search = host.querySelector('[aria-label="Search tools"]');
  expect(search.disabled).toBe(false); expect(host.querySelector('#r4-tool-area').disabled).toBe(false);
  await change(search, 'Owned tool B');
  expect(button(host, 'Owned tool B')).toBeTruthy();
  expect(host.querySelector('[aria-label="Select Owned tool B for bulk changes"]').disabled).toBe(true);
  api.post.mockResolvedValueOnce({data: {ok: true}});
  await click(button(host, 'Retry unconfirmed save'));
  expect(api.post.mock.calls[1]).toEqual(requestA);
  expect(pendingRequest()).toBeNull(); expect(search.value).toBe('Owned tool B');
  expect(button(host, 'Clear selection')).toBeUndefined();
  await click(host.querySelector('[aria-label="Select Owned tool B for bulk changes"]'));
  api.post.mockResolvedValueOnce({data: {ok: true}});
  await click(button(host, 'Restore'));
  expect(api.post.mock.calls[2][1]).toEqual({tool_ids: ['owned-b'], expected_versions: {'owned-b': 'version-b1'}, retired: false});
  expect(api.post.mock.calls[2][2].headers['Idempotency-Key']).not.toBe(requestA[2].headers['Idempotency-Key']);
});

test('an uncertain replacement freezes target and retirement choice and retries its original path/body/key', async () => {
  api.post.mockRejectedValueOnce(new Error('Synthetic replacement response lost'));
  await render(); await click(button(host, 'Owned tool A'));
  await click(button(dialog(), 'Replace everywhere'));
  await change(field(dialog(), 'Replace with'), 'owned-b');
  await click(dialog().querySelector('input[type="checkbox"]'));
  await click(button(dialog(), 'Replace everywhere'));
  const requestA = JSON.parse(JSON.stringify(api.post.mock.calls[0]));
  expect(requestA[0]).toBe('/tool-catalog/owned-a/replace');
  expect(requestA[1]).toEqual({replacement_id: 'owned-b', expected_updated_at: 'version-a1', retire: false});
  expect(field(dialog(), 'Replace with').value).toBe('owned-b');
  expect(field(dialog(), 'Replace with').disabled).toBe(true);
  expect(dialog().querySelector('input[type="checkbox"]').disabled).toBe(true);
  expect(dialog().querySelector('input[type="checkbox"]').checked).toBe(false);
  expect(button(dialog(), 'Cancel').disabled).toBe(true);
  expect(button(dialog(), 'Retry unconfirmed save').type).toBe('button');
  api.post.mockResolvedValueOnce({data: {ok: true}});
  await click(button(dialog(), 'Retry unconfirmed save'));
  expect(api.post.mock.calls[1]).toEqual(requestA);
  expect(dialog()).toBeUndefined(); expect(button(host, 'Add tool').disabled).toBe(false);
});

test('a confirmed no-write refusal unlocks the retained draft and Cancel performs no further command', async () => {
  const refusal = Object.assign(new Error('Synthetic confirmed refusal'), {response: {headers: {'x-create-rejected': 'true'}}});
  api.post.mockRejectedValueOnce(refusal);
  await render(); await click(button(host, 'Owned tool A'));
  await change(field(dialog(), 'Tool name'), 'Uncommitted retained draft');
  await click(button(dialog(), 'Save changes'));
  expect(field(dialog(), 'Tool name').value).toBe('Uncommitted retained draft');
  expect(field(dialog(), 'Tool name').disabled).toBe(false);
  expect(pendingRequest()).toBeNull();
  expect(button(dialog(), 'Retry unconfirmed save')).toBeUndefined();
  await click(button(dialog(), 'Cancel'));
  expect(dialog()).toBeUndefined(); expect(api.post).toHaveBeenCalledTimes(1);
});
