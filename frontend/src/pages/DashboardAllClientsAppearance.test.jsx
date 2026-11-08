import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import Dashboard from './Dashboard';
import {useOrg} from '@/context/OrgContext';
import {loadClientDashboard} from '@/lib/loadClientDashboard';
import {frameworkDashboardFixture} from '@/testUtils/frameworkDashboard';
import {FRAMEWORKS, frameworkCatalog} from '@/lib/frameworks';
import {sharedProgramProjection} from '@/preview/clientRelationships';
import api from '@/lib/api';

jest.mock('@/context/OrgContext', () => ({useOrg: jest.fn()}));
let mockMode = 'standard';
const mockUsers = {
  standard: {user_id: 'synthetic-operator', role: 'super_admin'},
  demo: {user_id: 'synthetic-operator', role: 'super_admin', workspace_mode: 'demo'},
};
jest.mock('@/context/AuthContext', () => ({useAuth: () => ({workspaceMode: mockMode,
  user: mockUsers[mockMode],
})}));
jest.mock('@/lib/loadClientDashboard', () => ({loadClientDashboard: jest.fn()}));
jest.mock('@/lib/api', () => ({__esModule: true,
  default: {get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn()}, formatError: error => error.message,
}));
jest.mock('@/components/BrawndoDemoProgram', () => ({program}) =>
  <section data-testid="verified-native-program">{program.program_label}</section>);

let host, root;
const clientId = 'arbitrary-unconfigured-organization';
const queue = {as_of: '2026-10-27', groups: Object.fromEntries(
  ['all', 'pastDue', 'due30', 'unassigned'].map(key => [key, {total: 0, items: []}]))};
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  mockMode = 'standard';
  Object.values(api).forEach(mock => mock.mockReset()); loadClientDashboard.mockReset();
  localStorage.setItem('grc_client_id', clientId); sessionStorage.setItem('grc_client_id', clientId);
  api.get.mockImplementation(async (_path, {params}) => ({data: {
    client_id: clientId, items: [], total: 0, offset: params.offset, limit: params.limit, has_more: false,
  }}));
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); localStorage.clear(); sessionStorage.clear();});

function prepare({completed = false, framework} = {}) {
  const client = {client_id: clientId, name: 'Unconfigured native organization', status: completed ? 'active' : 'onboarding',
    cis_program: null, shared_programs: [],
    onboarding_baseline: {completed, requirements: framework ? {[framework]: 'applies'} : {}},
  };
  const definition = FRAMEWORKS.find(value => value.key === framework);
  const programs = definition ? [{...definition, id: `${clientId}:${framework}`, to: `/compliance/${framework}`,
    trackingAvailable: definition.implemented, explanation: 'Program workspace only. Detailed assessment and mapping are not yet implemented.'}] : [];
  const rows = (frameworkCatalog(framework)?.requirements || []).map(value => ({...value,
    client_id: clientId, framework_key: framework, status: 'not_assessed',
  }));
  const snapshot = {members: [], programs, programRows: definition?.implemented ? {[framework]: rows} : {}, queue};
  useOrg.mockReturnValue({currentClientId: clientId, currentClient: client, clients: [client], loading: false});
  loadClientDashboard.mockResolvedValue(snapshot);
  return {client, snapshot};
}
const render = () => act(async () => root.render(<MemoryRouter initialEntries={[
  `/dashboard?client_id=${clientId}`]}><Dashboard/></MemoryRouter>));
function expectNoWrites() {expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled(); expect(api.delete).not.toHaveBeenCalled();}

test.each(['demo', 'standard'].flatMap(mode => [[mode, false], [mode, true]]))(
  '%s unconfigured completed=%s uses approved common composition with honest native empty state', async (mode, completed) => {
    mockMode = mode; const {client, snapshot} = prepare({completed}); const before = JSON.stringify({client, snapshot});
    await render();
    expect(host.querySelector('.brawndo-demo-dashboard[data-cis-dashboard-concept=true]')).not.toBeNull();
    expect(host.querySelector('h1').textContent).toBe('Unconfigured native organization Dashboard');
    expect(host.querySelector('#bdd-work-heading').textContent).toBe('Priority work');
    expect(host.textContent).toContain('No frameworks configured.');
    expect(host.querySelector('a[href="/client-profile"]').textContent).toBe('Review client configuration');
    expect(host.textContent).not.toMatch(/CIS|A clearer view|Priority overview|program is unavailable/);
    expect(host.querySelector('[data-testid=verified-native-program], [role=progressbar]')).toBeNull();
    expect(loadClientDashboard.mock.calls.every(([, options]) => options.includeProgramMetadata === false)).toBe(true);
    expect(api.get.mock.calls.every(([path]) => path === '/dashboard')).toBe(true);
    expect(api.get.mock.calls.every(([, options]) => options.params.client_id === clientId && options.params.work_metadata === true)).toBe(true);
    expect(JSON.stringify({client, snapshot})).toBe(before); expectNoWrites();
  });

test.each(['hipaa', 'nist-csf-2', 'cmmc'])('%s retains its native program vocabulary and destination in common composition', async framework => {
  const {snapshot} = prepare({completed: true, framework}); await render();
  expect(host.querySelector('#bdd-work-heading')?.textContent).toBe('Priority work');
  expect(host.textContent).toContain(FRAMEWORKS.find(value => value.key === framework).label);
  expect(host.querySelector(`a[href="/compliance/${framework}"]`)).not.toBeNull();
  expect(host.querySelector('[data-testid=verified-native-program]')).toBeNull();
  expect(host.textContent).not.toMatch(/CIS IG|CIS program|safeguards|SoA/);
  if (framework === 'cmmc') expect(host.textContent).toContain(snapshot.programs[0].explanation);
  expectNoWrites();
});

test('later real ISO enrollment activates only its verified native program without changing the organization', async () => {
  prepare(); await render(); expect(host.querySelector('[data-testid=verified-native-program]')).toBeNull();
  const {client, source, db} = frameworkDashboardFixture('iso-27001', undefined, clientId);
  client.shared_programs = sharedProgramProjection(db, client);
  useOrg.mockReturnValue({currentClientId: clientId, currentClient: client, clients: [client], loading: false});
  loadClientDashboard.mockResolvedValue({members: [], queue,
    programs: [{id: `${clientId}:iso-27001`, key: 'iso-27001', label: 'ISO 27001', implementation_position: source.implementation_position}],
    programMetadata: {'iso-27001': source}, programSources: {'iso-27001': source},
  });
  await render();
  expect(host.querySelector('[data-testid=verified-native-program]').textContent).toBe('ISO 27001');
  expect(host.textContent).not.toContain('No frameworks configured.');
  expect(loadClientDashboard.mock.calls.at(-1)[1].includeProgramMetadata).toBe(true);
  expectNoWrites();
});

test('an unverified tracked program remains unavailable rather than gaining a framework adapter from appearance',async()=>{
  const {snapshot}=prepare({completed:true});
  snapshot.programs=[{id:`${clientId}:cis-ig1`,key:'cis-ig1',label:'CIS IG1'}];
  await render();
  expect(host.querySelector('[aria-label="Program Status"]').textContent).toContain('is unavailable');
  expect(host.querySelector('[data-testid=verified-native-program]')).toBeNull();
  expect(host.textContent).not.toContain('No frameworks configured.');
  expect(loadClientDashboard.mock.calls[0][1].includeProgramMetadata).toBe(false);
  expectNoWrites();
});
