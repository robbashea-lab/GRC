import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Layout from '@/components/Layout';
import MockComplianceWorkspace from './ComplianceWorkspace';
import MockRecordListPage from './RecordListPage';
import {THEME_KEY} from '@/lib/brawndoTheme';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';
import {FRAMEWORKS,frameworkCatalog} from '@/lib/frameworks';
let mockClient, mockPath, mockKey, mockAuth;
jest.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentClientId: mockClient.client_id, currentClient: mockClient, clients: [mockClient] }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/components/NotificationBell', () => () => null);
jest.mock('@/preview/DemoNotice', () => () => null);
jest.mock('@/lib/api', () => ({ __esModule: true, PREVIEW_MODE:true, default: { get: jest.fn() }, formatError: e => e.message }));
jest.mock('react-router-dom', () => ({
  useSearchParams: () => require('react').useState(new URLSearchParams()),
  useLocation: () => ({ pathname: mockPath }), useParams: () => ({ requirementKey: mockKey }), useNavigate: () => jest.fn(),
  Outlet: () => mockPath==='/reviews'?<MockRecordListPage kind="reviews"/>:<MockComplianceWorkspace />,
  NavLink: ({ children, to, ...props }) => <a href={to} data-testid={props['data-testid']}>{children}</a>,
  Link: ({children,to}) => <a href={to}>{children}</a>,
}), { virtual: true });
let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.removeItem(THEME_KEY);
  mockClient = { client_id: 'a', name: 'Client A' }; mockKey = 'hipaa'; mockPath = '/compliance/hipaa';
  mockAuth={user:{role:'super_admin',name:'Alex Morgan',workspace_mode:'demo'}};
  api.get.mockImplementation(async (path, config) => ({ data: path === '/onboarding/baseline' ? { state: { completed: true } }
    : path.startsWith('/frameworks/') ? {configured:false,selected:mockClient.client_id==='a',assessments:[],definitions:[]}
    : path.endsWith('/members') ? []
    : config?.params?.client_id === 'a' ? ['hipaa','iso-27001','cmmc'].map(key => ({client_id:'a',baseline_key:key,baseline_response:'applies'})) : [] }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.removeItem(THEME_KEY); });
const render = async key => { await act(async () => root.render(<Layout key={key}/>)); };

function socWorkspace(configured=true){
  const catalog=frameworkCatalog('soc-2'),definitions=catalog.requirements,categories=['security','availability','confidentiality'];
  return {framework:FRAMEWORKS.find(framework=>framework.key==='soc-2'),configured,selected:true,
    configuration:{categories},active_definition_ids:definitions.filter(definition=>categories.includes(definition.category)).map(definition=>definition.id),
    definitions:configured?definitions:[],assessments:configured?definitions.map(definition=>({client_id:mockClient.client_id,framework_key:'soc-2',framework_assessment_id:`${mockClient.client_id}:${definition.id}`,definition_id:definition.id,status:'not_assessed'})):[],work:{}};
}
function serveSoc(response){
  api.get.mockImplementation(async path=>({data:path==='/onboarding/baseline'?{state:{completed:true,requirements:{'soc-2':'applies'}}}
    :path==='/requirements'?[{client_id:mockClient.client_id,baseline_key:'soc-2',baseline_response:'applies'}]
    :path==='/frameworks/soc-2'?response:[]}));
}

test('loaded SOC uses one native header and exact edition without the duplicate outer client heading',async()=>{
  mockKey='soc-2';mockPath='/compliance/soc-2';serveSoc(socWorkspace());
  await render();
  const main=container.querySelector('main');
  expect(main.querySelectorAll('h1')).toHaveLength(1);expect(main.querySelector('h1').textContent).toBe('SOC 2');
  expect(main.querySelector('.bpage-eyebrow')).toBeNull();
  expect(main.textContent).not.toContain('Assessment workspace ·');
  expect(main.querySelector('.soc-program-heading p').textContent).toContain(frameworkCatalog('soc-2').version);
  expect(main.querySelector('.soc-program-heading p').textContent).toContain('SOC 2 Type 2');
  expect(main.querySelectorAll('.soc-program-heading p')).toHaveLength(1);
  expect(main.querySelectorAll('[aria-labelledby="bcis-summary-heading"]')).toHaveLength(1);
});

test('SOC requirement loading and errors retain the outer metadata heading',async()=>{
  mockKey='soc-2';mockPath='/compliance/soc-2';
  let rejectRequirements;const requirements=new Promise((resolve,reject)=>{rejectRequirements=reject;});
  api.get.mockImplementation(path=>path==='/requirements'?requirements:Promise.resolve({data:{state:{completed:true}}}));
  await render();
  expect(container.querySelectorAll('main h1')).toHaveLength(1);
  expect(container.querySelector('main h1').textContent).toBe('SOC 2');
  expect(container.querySelector('main .bpage-eyebrow').textContent).toBe('Client A');
  expect(container.querySelector('main').textContent).toContain('Loading client requirement');
  await act(async()=>rejectRequirements(new Error('SOC requirement unavailable')));
  expect(container.querySelectorAll('main h1')).toHaveLength(1);
  expect(container.querySelector('main [role="alert"]').textContent).toContain('SOC requirement unavailable');
  expect(container.querySelector('main').textContent).toContain(frameworkCatalog('soc-2').version);
  expect(container.querySelector('[aria-labelledby="bcis-summary-heading"]')).toBeNull();
});

test('SOC framework empty and error states retain a single metadata heading without assessment actions',async()=>{
  mockKey='soc-2';mockPath='/compliance/soc-2';serveSoc(socWorkspace(false));
  await render();
  expect(container.querySelectorAll('main h1')).toHaveLength(1);
  expect(container.querySelector('main h1').textContent).toBe('SOC 2');
  expect(container.querySelector('main').textContent).toContain(frameworkCatalog('soc-2').version);
  expect(container.querySelector('main').textContent).toContain('Select Applies in Client Profile to initialize this program after onboarding.');
  expect(container.querySelector('[aria-labelledby="bcis-summary-heading"]')).toBeNull();
  expect(container.querySelector('[aria-label^="Continue assessment"]')).toBeNull();
  const serve=api.get.getMockImplementation();
  api.get.mockImplementation((path,...args)=>path==='/frameworks/soc-2'?Promise.reject(new Error('SOC framework unavailable')):serve(path,...args));
  await render('soc-framework-error');
  expect(container.querySelectorAll('main h1')).toHaveLength(1);
  expect(container.querySelector('main [role="alert"]').textContent).toContain('SOC framework unavailable');
  expect(container.querySelector('main').textContent).toContain(frameworkCatalog('soc-2').version);
  expect(container.querySelector('[aria-label^="Continue assessment"]')).toBeNull();
});

test('SOC framework loading keeps one metadata heading after the outer requirement load completes',async()=>{
  mockKey='soc-2';mockPath='/compliance/soc-2';serveSoc(socWorkspace());
  const serve=api.get.getMockImplementation();let resolveFramework;
  const framework=new Promise(resolve=>{resolveFramework=resolve;});
  api.get.mockImplementation((path,...args)=>path==='/frameworks/soc-2'?framework:serve(path,...args));
  await render();
  expect(container.querySelectorAll('main h1')).toHaveLength(1);
  expect(container.querySelector('main h1').textContent).toBe('SOC 2');
  expect(container.querySelector('main').textContent).toContain(frameworkCatalog('soc-2').version);
  expect(container.querySelector('main').textContent).toContain('Loading program workspace');
  expect(container.querySelector('[aria-labelledby="bcis-summary-heading"]')).toBeNull();
  await act(async()=>resolveFramework({data:socWorkspace()}));
  expect(container.querySelectorAll('main h1')).toHaveLength(1);
  expect(container.querySelectorAll('[aria-labelledby="bcis-summary-heading"]')).toHaveLength(1);
});
test('direct compliance routes render client empty states and preserve existing sidebar links', async () => {
  for (const [key, label] of [['hipaa','HIPAA'],['iso-27001','ISO 27001'],['cmmc','CMMC']]) {
    mockKey = key; mockPath = `/compliance/${key}`; await render();
    expect(container.querySelector('main').textContent).toContain(key!=='cmmc'?'Select Applies in Client Profile to initialize this program after onboarding.':'Program selected for this client. Detailed requirement assessment and mapping have not yet been configured in Omnisciente.');
    expect(container.querySelector('main').textContent).toContain(label);
    // The shared header names the client and retains the framework edition.
    expect(container.querySelector('main').textContent).toContain(key!=='cmmc'?'Assessment workspace · ':'Applicability only; no assessment catalog');
    expect(container.querySelector('main .bpage-eyebrow').textContent).toBe('Client A');
    if(key!=='cmmc')expect(api.get.mock.calls.some(([path,config])=>path===`/frameworks/${key}`&&config?.params?.client_id==='a')).toBe(true);
    expect(container.querySelectorAll('[data-testid^="nav-compliance-"]')).toHaveLength(3);
  }
  for (const route of ['dashboard','calendar','reviews','action-items','risks','policies','vendors','contacts','evidence','client-profile']) {
    expect(container.querySelector(`a[href="/${route}"]`)).toBeTruthy();
  }
  expect(container.querySelector('a[href="/onboarding"]')).toBeNull();
  expect(container.querySelector('a[href="/client-settings"]')).toBeNull();
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

test('enrolled CIS keeps one scoped loading header across requirement and framework reads without exposing assessments',async()=>{
  mockClient={...cisClient('demo_brawndo',1),name:'Brawndo'};mockKey='cis-ig1';mockPath='/compliance/cis-ig1';
  mockAuth={user:{user_id:'loading-demo',role:'super_admin',workspace_mode:'demo'},workspaceMode:'demo',loading:false};
  sessionStorage.setItem('grc_client_id','demo_brawndo');
  let resolveRequirements,rejectFramework;
  const requirements=new Promise(resolve=>{resolveRequirements=resolve;});
  const framework=new Promise((resolve,reject)=>{rejectFramework=reject;});
  api.get.mockImplementation(path=>path==='/requirements'?requirements:path.startsWith('/frameworks/')?framework
    :Promise.resolve({data:{state:{completed:true,requirements:{'cis-ig1':'applies'}},framework_settings:mockClient.framework_settings}}));
  try{
    await render();
    expect(container.querySelectorAll('main h1')).toHaveLength(1);
    expect(container.querySelector('main h1').textContent).toBe('CIS IG1');
    expect(container.querySelector('[data-testid="cis-workspace-loading"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cis-workspace"]')).toBeNull();
    expect(document.body.dataset.brawndoCisVisual).toBeUndefined();
    await act(async()=>resolveRequirements({data:[{client_id:'demo_brawndo',baseline_key:'cis-ig1',baseline_response:'applies'}]}));
    expect(api.get.mock.calls.some(([path])=>path==='/frameworks/cis-ig1')).toBe(true);
    expect(container.querySelectorAll('main h1')).toHaveLength(1);
    expect(container.querySelector('[data-testid="cis-workspace-loading"]')).toBeTruthy();
    expect(container.querySelector('main').textContent).not.toContain('0 safeguards');
    await act(async()=>rejectFramework(new Error('Framework unavailable')));
    expect(container.querySelector('[role="alert"]').textContent).toContain('Framework unavailable');
    expect(container.querySelector('[data-testid="cis-workspace-loading"]')).toBeNull();
  }finally{sessionStorage.removeItem('grc_client_id');}
});

test.each(['demo_brawndo','demo_dunder','demo_prestige','new-client'])('%s Reviews inherits shared header, theme and portal surface from Layout',async clientId=>{
  mockClient={client_id:clientId,name:'Review client'};mockPath='/reviews';
  await render();
  expect(container.querySelector('main .client-surface').dataset.theme).toBe('light');
  expect(container.querySelector('main h1').textContent).toBe('Reviews');
  expect(container.querySelector('main .bpage-eyebrow').textContent).toBe('Review client');
  await act(async()=>container.querySelector('main [aria-label="Switch to dark mode"]').click());
  expect(container.querySelector('main .client-surface').dataset.theme).toBe('dark');
  expect(document.documentElement.dataset.brawndoPortal).toBe('dark');
  expect(container.querySelector('main [aria-label="Switch to light mode"]')).toBeTruthy();
});
