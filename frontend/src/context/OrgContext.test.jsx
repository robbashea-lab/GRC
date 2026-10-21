import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { OrgProvider, useOrg } from './OrgContext';
import api from '@/lib/api';
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
let root, host, org;
let mockLocation;
jest.mock('react-router-dom', () => ({useLocation: () => mockLocation}), {virtual: true});
function Probe() { org = useOrg(); return null; }
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); root = createRoot(host); localStorage.clear();
  mockLocation = {search: ''};
});

test('URL tenant identity resolves before child reads and never falls back to another authorized tenant', async () => {
  api.get.mockResolvedValue({data: [{client_id: 'a', name: 'Alpha'}, {client_id: 'b', name: 'Beta'}]});
  localStorage.setItem('grc_client_id', 'a');
  mockLocation = {search: '?client_id=b'};
  await act(async () => root.render(<OrgProvider><Probe /></OrgProvider>));
  expect(org.currentClientId).toBe('b');
  mockLocation = {search: '?client_id=a'};
  await act(async () => root.render(<OrgProvider><Probe /></OrgProvider>));
  expect(org.currentClientId).toBe('a');
  mockLocation = {search: '?client_id=forbidden'};
  await act(async () => root.render(<OrgProvider><Probe /></OrgProvider>));
  expect(org.currentClientId).toBe('');
  expect(org.error).toMatch(/outside your current access/);
  expect(org.switchClient('forbidden')).toBe(false);
});

test('retained create-toast callbacks use the latest authorized client list',async()=>{
  api.get.mockResolvedValueOnce({data:[{client_id:'a',name:'Alpha'}]}).mockResolvedValueOnce({data:[{client_id:'a',name:'Alpha'},{client_id:'new',name:'Created client'}]});
  await act(async()=>root.render(<OrgProvider><Probe/></OrgProvider>));
  const retainedSwitch=org.switchClient;
  await act(async()=>org.refresh());
  await act(async()=>{expect(retainedSwitch('new')).toBe(true);});
  expect(org.currentClientId).toBe('new');
});
afterEach(async () => { await act(async () => root.unmount()); jest.clearAllMocks(); });
test('an older client response cannot restore access removed by a newer refresh', async () => {
  let older;
  api.get.mockImplementationOnce(() => new Promise(resolve => { older = resolve; }))
    .mockResolvedValueOnce({ data: [] });
  await act(async () => root.render(<OrgProvider><Probe /></OrgProvider>));
  await act(async () => org.refresh());
  await act(async () => older({ data: [{ client_id: 'removed', name: 'Removed access', status: 'active' }] }));
  expect(org.clients).toEqual([]);
  expect(org.currentClientId).toBe('');
});
