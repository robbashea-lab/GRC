import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Layout from '@/components/Layout';
import MockComplianceWorkspace from './ComplianceWorkspace';
import api from '@/lib/api';
let mockClient, mockPath, mockKey;
jest.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentClientId: mockClient.client_id, currentClient: mockClient, clients: [mockClient] }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'super_admin', name: 'Alex Morgan' } }) }));
jest.mock('@/components/NotificationBell', () => () => null);
jest.mock('@/preview/DemoNotice', () => () => null);
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn() }, formatError: e => e.message }));
jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPath }), useParams: () => ({ requirementKey: mockKey }), useNavigate: () => jest.fn(),
  Outlet: () => <MockComplianceWorkspace />,
  NavLink: ({ children, to, ...props }) => <a href={to} data-testid={props['data-testid']}>{children}</a>,
}), { virtual: true });
let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockClient = { client_id: 'a', name: 'Client A' }; mockKey = 'hipaa'; mockPath = '/compliance/hipaa';
  api.get.mockImplementation(async (path, config) => ({ data: path === '/onboarding/baseline' ? { state: { completed: true } }
    : config.params.client_id === 'a' ? ['hipaa','iso-27001','cmmc'].map(key => ({client_id:'a',baseline_key:key,baseline_response:'applies'})) : [] }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const render = async () => { await act(async () => root.render(<Layout />)); };
test('direct compliance routes render client empty states and preserve existing sidebar links', async () => {
  for (const [key, label] of [['hipaa','HIPAA'],['iso-27001','ISO 27001'],['cmmc','CMMC']]) {
    mockKey = key; mockPath = `/compliance/${key}`; await render();
    expect(container.querySelector('main').textContent).toContain(`No ${label} content has been configured for this client yet.`);
    expect(container.querySelector('main').textContent).toContain('Client A');
    expect(container.querySelectorAll('[data-testid^="nav-compliance-"]')).toHaveLength(3);
  }
  for (const route of ['dashboard','calendar','reviews','action-items','risks','policies','vendors','contacts','evidence','onboarding','client-settings']) {
    expect(container.querySelector(`a[href="/${route}"]`)).toBeTruthy();
  }
  expect(container.querySelector('a[href="/compliance/cis-ig1"]')).toBeNull();
  mockClient = {client_id:'b',name:'Client B'}; await render();
  expect(container.querySelectorAll('[data-testid^="nav-compliance-"]')).toHaveLength(0);
  expect(container.querySelector('main').textContent).toContain('not enabled');
  expect(container.querySelector('main').textContent).not.toContain('Client A');
});
test('failed loads show a safe error instead of a blank page', async () => {
  api.get.mockRejectedValue(new Error('Unable to retrieve requirements'));
  await render();
  expect(container.querySelector('[role="alert"]').textContent).toContain('Unable to retrieve requirements');
  expect(container.querySelectorAll('[data-testid^="nav-compliance-"]')).toHaveLength(0);
});
