import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { OrgProvider, useOrg } from './OrgContext';
import api from '@/lib/api';
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
let root, host, org;
function Probe() { org = useOrg(); return null; }
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); root = createRoot(host); localStorage.clear();
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
