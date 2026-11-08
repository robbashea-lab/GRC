import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter, useLocation, useNavigate} from 'react-router-dom';
import {OrgProvider, useOrg} from './OrgContext';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({__esModule: true, default: {get: jest.fn()}}));

let root, host, org, observed;
function NativeWorkspace() {
  org = useOrg();
  const location = useLocation(), navigate = useNavigate();
  observed.push({search: location.search, clientId: org.currentClientId});
  return <>
    <output aria-label="Current client">{org.currentClient?.name || 'Unavailable'}</output>
    <button onClick={() => navigate('/compliance/cis-ig1?client_id=a')}>Open Alpha</button>
    <button onClick={() => navigate('/compliance/iso-27001?client_id=foreign')}>Open foreign client</button>
  </>;
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem('grc_client_id', 'a');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  observed = [];
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  jest.clearAllMocks();
  localStorage.clear();
});

test('the installed router resolves native URL clients without falling back to another authorized client', async () => {
  api.get.mockResolvedValue({data: [{client_id: 'a', name: 'Alpha'}, {client_id: 'b', name: 'Beta'}]});
  await act(async () => root.render(
    <MemoryRouter initialEntries={['/compliance/iso-27001?client_id=b']}>
      <OrgProvider><NativeWorkspace /></OrgProvider>
    </MemoryRouter>
  ));
  expect(org.currentClientId).toBe('b');
  expect(host.querySelector('output').textContent).toBe('Beta');
  expect(observed.filter(value => value.search === '?client_id=b').every(value => ['', 'b'].includes(value.clientId))).toBe(true);

  await act(async () => host.querySelectorAll('button')[0].click());
  expect(org.currentClientId).toBe('a');
  expect(host.querySelector('output').textContent).toBe('Alpha');

  await act(async () => host.querySelectorAll('button')[1].click());
  expect(org.currentClientId).toBe('');
  expect(host.querySelector('output').textContent).toBe('Unavailable');
  expect(org.error).toMatch(/outside your current access/);
  expect(observed.filter(value => value.search === '?client_id=foreign').every(value => value.clientId === '')).toBe(true);
});
