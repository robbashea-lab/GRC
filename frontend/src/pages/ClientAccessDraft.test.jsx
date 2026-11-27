import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {EditClientsItem} from './PlatformAdmin';

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem:({onSelect,children}) => <button type="button" onClick={event => onSelect?.(event)}>{children}</button>,
}));
jest.mock('@/lib/api', () => ({__esModule:true,default:{},formatError:error => error.message}));
const user = {user_id:'provider-account',role:'platform_admin',client_ids:['one'],all_clients:false,updated_at:'saved-version'};
const clients = [{client_id:'one',name:'First client'},{client_id:'two',name:'Second client'}];
let host, root, save;
const click = node => act(async () => node.click());
const dialog = () => document.querySelector('[role="dialog"]');
const button = text => [...dialog().querySelectorAll('button')].find(node => node.textContent === text);
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;save = jest.fn().mockResolvedValue(true);
  host = document.createElement('div'); document.body.appendChild(host);root = createRoot(host);
  await act(async () => root.render(<EditClientsItem u={user} clients={clients} canGrantAll onSave={save}/>));
  await click(host.querySelector('button'));
});
afterEach(async () => {await act(async () => root.unmount());host.remove();});

test('all-client entitlement and selected clients remain a draft until one native Save', async () => {
  const choices = dialog().querySelectorAll('input[type="checkbox"]');
  await click(choices[0]); await click(choices[2]);
  expect(save).not.toHaveBeenCalled();expect(user.all_clients).toBe(false);expect(user.client_ids).toEqual(['one']);
  await click(button('Save'));
  expect(save).toHaveBeenCalledTimes(1);expect(save).toHaveBeenCalledWith({client_ids:['one','two'],all_clients:true});
  expect(dialog()).toBeNull();
});

test('Cancel discards both access drafts and reopening shows authoritative account values', async () => {
  const choices = dialog().querySelectorAll('input[type="checkbox"]');
  await click(choices[0]);await click(choices[2]);await click(button('Cancel'));
  expect(save).not.toHaveBeenCalled();await click(host.querySelector('button'));
  expect([...dialog().querySelectorAll('input')].map(node => node.checked)).toEqual([false,true,false]);
});

test('a stale or denied Save leaves the dialog and choices available without false success', async () => {
  save.mockResolvedValue(false);const choices = dialog().querySelectorAll('input');await click(choices[0]);await click(choices[2]);
  await click(button('Save'));
  expect(dialog()).not.toBeNull();expect(dialog().querySelector('[role="alert"]').textContent).toContain('Changes were not saved');
  expect([...dialog().querySelectorAll('input')].map(node => node.checked)).toEqual([true,true,true]);
  expect(user.all_clients).toBe(false);expect(user.client_ids).toEqual(['one']);
});
