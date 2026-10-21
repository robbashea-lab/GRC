import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import EnhancedPortfolioBoundary, { EnhancedPortfolio } from './EnhancedPortfolio';
import api from '@/lib/api';
import { PORTFOLIO_CHANGED } from '@/lib/usePortfolioRefresh';
import { usePortfolioView } from '@/lib/usePortfolioView';
let mockAuth, mockLocation;
const mockNavigate = jest.fn(),
  mockSwitch = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation
}));
jest.mock('@/context/OrgContext', () => ({
  useOrg: () => ({
    switchClient: mockSwitch
  })
}));
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/lib/api', () => ({
  __esModule: true,
  PREVIEW_MODE: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn()
  },
  formatError: error => error.message
}));
const AT = '2026-10-20T12:00:00Z',
  CID = 'demo_brawndo';
const position = (implemented = 2) => ({
  availability: 'available',
  implemented,
  denominator: 10,
  source_revision: 'rev',
  measure_version: 'v1',
  scope_signature: 'scope',
  captured_at: AT,
  effective_at: AT,
  scope: {
    framework_key: 'cis-ig1',
    catalog_version: '8.1',
    configuration: {
      implementation_group: 1
    }
  },
  included_counts: ['addressed', 'in_progress', 'needs_attention', 'not_assessed'].map((key, index) => ({
    key,
    label: ['Implemented', 'Partially implemented', 'Not implemented', 'Not assessed'][index],
    count: [implemented, 1, 1, 8 - implemented][index]
  }))
});
const client = {
  client_id: CID,
  name: 'Brawndo',
  industry: 'Beverage',
  status: 'active',
  grc_lead_id: 'u',
  assigned_owner_id: 'u',
  grc_lead: {
    name: 'Morgan Ellis'
  },
  monitoring: {
    onboarding: 'complete',
    latest_completion: {at:'2026-10-19T12:00:00Z',label:'Native completed review'},
    recurring_scheduled: 2,
    completion_history_coverage: 'partial'
  }
};
const program = {
  client_id: CID,
  program_id: CID + ':cis-ig1',
  program_key: 'cis-ig1',
  framework_key: 'cis-ig1',
  program_label: 'CIS IG1',
  to: '/compliance/cis-ig1',
  current: position(),
  snapshots_90d: [],
  comparison_90d: {
    comparable: false
  }
};
const item = {
  key: 'task1',
  entity_type: 'task',
  entity_id: 'task1',
  client_id: CID,
  title: 'Real native action',
  due_date: '2026-10-17',
  owner_name: 'Frito',
  overdue: true,
  type: 'Action item'
};
let root,
  host,
  current = program;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = jest.fn();
  jest.clearAllMocks();
  current = program;
  mockAuth={user:{user_id:'u',role:'super_admin',workspace_mode:'demo'},workspaceMode:'demo'};
  mockLocation={pathname:'/clients',search:''};
  sessionStorage.clear();
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  api.get.mockImplementation(async (path, {
    params
  } = {}) => ({
    data: path.endsWith('/overview') ? {
      as_of: AT,
      clients: [client],
      programs: [current]
    } : path === '/clients/directory' ? {
      clients: [{
        ...client,
        metric_items: {
          past_due: [item],
          due_30d: [], due_31_90d: []
        }
      }]
    } : {
      client_id: CID,
      program_key: 'cis-ig1',
      as_of: AT,
      current: current.current,
      snapshots: [{
        ...current.current,
        snapshot_id: 'saved1',
        observation_kind: 'committed_event'
      }],
      forecast_snapshots: [],
      scope_changes: [],
      comparison: {
        comparable: false
      },
      range: params.range
    }
  }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const click = async label => act(async () => {
  const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label);
  expect(button).toBeTruthy();
  button.click();
});
test('native work, consistent lead/KPI filters and exact navigation survive missing lead and programs', async () => {
  await act(async () => root.render(<EnhancedPortfolio user={{
    user_id: 'u'
  }} />));
  expect(host.querySelector('[data-client-id="demo_brawndo"]')).toBeTruthy();
  await click('By lead');
  expect(host.textContent).toContain('Morgan Ellis');
  expect(host.textContent).toContain('Brawndo');
  await click('Clients');
  await click('Brawndo');
  expect(mockSwitch).toHaveBeenCalledWith(CID);
  expect(mockNavigate).toHaveBeenCalledWith('/dashboard?client_id=demo_brawndo');
  await act(async()=>host.querySelector('.ep-framework').click());
  expect(document.querySelector('[data-testid="enhanced-portfolio-history"]')).toBeTruthy();
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  await click('Open CIS IG1 workspace →');
  expect(mockNavigate).toHaveBeenLastCalledWith('/compliance/cis-ig1?client_id=demo_brawndo');
  await act(async()=>document.querySelector('[aria-label="Close implementation preview"]').click());
  const preview = host.querySelector('[aria-label="Preview Brawndo implementation"]');
  await act(async () => preview.click());
  const dialog = document.querySelector('[data-testid="enhanced-portfolio-history"]');
  expect(dialog).toBeTruthy();
  expect(dialog.textContent).toContain('Real native action');
  expect(dialog.textContent).toContain('Latest retained completion');
  expect(dialog.textContent).toContain('Native completed review');
  expect(dialog.textContent).toContain('Scheduled recurring reviews · 2');
  expect(dialog.textContent).toContain('Retained completion history is partial.');
  expect(document.body.textContent).not.toMatch(/gone quiet|scheduling gap|monitoring policy/i);
  await act(async () => dialog.querySelector('.ep-work-item').click());
  expect(mockNavigate).toHaveBeenLastCalledWith('/action-items?id=task1&client_id=demo_brawndo');
  expect(api.post).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
});
test('all four native history ranges, status view, genuine table and live current refresh agree', async () => {
  await act(async () => root.render(<EnhancedPortfolio user={{
    user_id: 'u'
  }} />));
  await act(async () => host.querySelector('.ep-progress').click());
  expect(api.get.mock.calls.filter(([path]) => path.endsWith('/history')).map(([, options]) => options.params.range).sort()).toEqual(['12m', '1m', '3m', '6m']);
  await click('View data');
  await click('All statuses');
  const dialog = document.querySelector('[data-testid="enhanced-portfolio-history"]');
  expect(dialog.querySelector('.ep-history-data').textContent).toContain('20.0%');
  expect(dialog.textContent).not.toContain('NaN');
  expect(dialog.querySelector('.ep-history-actions [aria-pressed]').getAttribute('aria-pressed')).toBe('true');
  current = {
    ...program,
    current: position(3)
  };
  await act(async () => {
    window.dispatchEvent(new Event(PORTFOLIO_CHANGED));
    await new Promise(resolve => setTimeout(resolve, 5));
  });
  expect(dialog.querySelector('.ep-current strong').textContent).toBe('30.0%');
  expect(dialog.querySelector('.ep-periods [aria-pressed="true"]').textContent).toContain('3 months');
  expect(dialog.querySelector('.ep-history-data').textContent).toContain('30.0%');
});
test('incomplete or foreign operational payload fails visibly without retaining old records', async () => {
  api.get.mockRejectedValueOnce(new Error('Reporting unavailable'));
  await act(async () => root.render(<EnhancedPortfolio user={{
    user_id: 'u'
  }} />));
  expect(host.querySelector('[role="alert"]').textContent).toContain('Reporting unavailable');
  await click('Retry');
  expect(host.textContent).toContain('Brawndo');
  api.get.mockImplementation(async () => ({
    data: {
      as_of: AT,
      clients: [],
      programs: []
    }
  }));
  await act(async () => {
    window.dispatchEvent(new Event(PORTFOLIO_CHANGED));
    await new Promise(resolve => setTimeout(resolve, 5));
  });
  expect(host.querySelector('[data-client-id]')).toBeNull();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.textContent).toContain('0 clients · 0 programs');
});
test.each([[],[{...client,metric_items:{past_due:[],due_30d:[]}}],[{...client,metric_items:{past_due:[],due_30d:[],due_31_90d:{}}}]].map(clients=>({clients})))('incomplete native work coverage fails without false zero counts',async ({clients:operations})=>{
  api.get.mockImplementation(async path=>({data:path.endsWith('/overview')?{as_of:AT,clients:[client],programs:[program]}:{clients:operations}}));
  await act(async()=>root.render(<EnhancedPortfolio user={{user_id:'u'}}/>));
  expect(host.querySelector('[role="alert"]').textContent).toContain('operational portfolio response is incomplete');
  expect(host.querySelector('[data-client-id]')).toBeNull();
  expect(host.textContent).not.toContain('Nothing overdue');
});

test('missing program retains operational preview and native record navigation', async () => {
  api.get.mockImplementation(async path => ({
    data: path.endsWith('/overview') ? {
      as_of: AT,
      clients: [{
        ...client,
        grc_lead_id: null,
        assigned_owner_id: null
      }],
      programs: []
    } : {
      clients: [{
        ...client,
        grc_lead_id: null,
        assigned_owner_id: null,
        metric_items: {
          past_due: [item],
          due_30d: [], due_31_90d: []
        }
      }]
    }
  }));
  await act(async () => root.render(<EnhancedPortfolio user={{
    user_id: 'u'
  }} />));
  expect(host.textContent).toContain('No enabled programs');
  await click('View existing work');
  const dialog = document.querySelector('[data-testid="enhanced-portfolio-history"]');
  expect(dialog.textContent).toContain('Real native action');
  expect(dialog.textContent).toContain('No enabled program is recorded');
  await act(async () => dialog.querySelector('.ep-work-item').click());
  expect(mockNavigate).toHaveBeenLastCalledWith('/action-items?id=task1&client_id=demo_brawndo');
  expect(api.get.mock.calls.some(([path]) => path.endsWith('/history'))).toBe(false);
});

test('no assignments has a working recovery distinct from no matching filters',async()=>{
  await act(async()=>root.render(<EnhancedPortfolio user={{user_id:'different-owner'}}/>));
  await click('Assigned to me');
  expect(host.textContent).toContain('No clients are currently assigned to you.');
  await click('Show all clients');
  expect(host.querySelector('[data-client-id="demo_brawndo"]')).toBeTruthy();
});

test('native portfolio preferences retain search and view after record navigation remount',async()=>{
  const actor={user_id:'u',role:'super_admin',workspace_mode:'demo'};
  await act(async()=>root.render(<EnhancedPortfolio user={actor}/>));
  await act(async()=>{
    const input=host.querySelector('input[aria-label="Search clients"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Brawndo');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await click('By lead');
  await act(async()=>root.render(<div/>));
  await act(async()=>root.render(<EnhancedPortfolio user={actor}/>));
  expect(host.querySelector('input[aria-label="Search clients"]').value).toBe('Brawndo');
  expect([...host.querySelectorAll('button')].find(button=>button.textContent==='By lead').getAttribute('aria-pressed')).toBe('true');
});

test('a removed attention filter cannot hide clients through retained preferences',async()=>{
  const actor={user_id:'removed-filter-owner',role:'super_admin',workspace_mode:'demo'};
  function SavedFilter() {
    const [,update]=usePortfolioView(actor);
    React.useEffect(()=>update({enhancedKpi:'quiet'}),[update]);
    return null;
  }
  await act(async()=>root.render(<SavedFilter/>));
  await act(async()=>root.render(<EnhancedPortfolio user={actor}/>));
  expect(host.querySelector('[data-client-id="demo_brawndo"]')).toBeTruthy();
  expect(host.querySelectorAll('.ep-kpi')).toHaveLength(4);
  expect(host.textContent).not.toMatch(/gone quiet|scheduling gap|monitoring policy/i);
});

const closedPreview = async () => {
  await act(async()=>document.querySelector('[aria-label="Close implementation preview"]').click());
  await act(async()=>new Promise(resolve=>setTimeout(resolve,0)));
};

test.each(['demo','standard'])('standard Portfolio boundary renders an empty and new no-Brawndo cohort in %s mode',async mode=>{
  mockAuth={user:{user_id:'operator',role:'platform_admin',workspace_mode:mode},workspaceMode:mode};
  let cohort=[];
  api.get.mockImplementation(async path=>({data:path.endsWith('/overview')?{as_of:AT,clients:cohort,programs:[]}:{clients:cohort.map(row=>({...row,metric_items:{past_due:[],due_30d:[],due_31_90d:[]}}))}}));
  const renderBoundary=()=>root.render(<EnhancedPortfolioBoundary><p>Legacy Portfolio</p></EnhancedPortfolioBoundary>);
  await act(async()=>renderBoundary());
  expect(host.textContent).toContain('0 clients · 0 programs');
  expect(host.textContent).not.toContain('Legacy Portfolio');
  cohort=[{...client,client_id:'new_authorized',name:'New authorized client',monitoring:{onboarding:'not_started'}}];
  await act(async()=>{window.dispatchEvent(new Event(PORTFOLIO_CHANGED));await new Promise(resolve=>setTimeout(resolve,5));});
  expect(host.querySelector('[data-client-id="new_authorized"]')).toBeTruthy();
  expect(host.querySelector('[data-client-id="demo_brawndo"]')).toBeNull();
  await act(async()=>{root.render(<div/>);});
  mockLocation={pathname:'/clients',search:'?client_id=another_selection'};
  await act(async()=>renderBoundary());
  expect(host.querySelector('[data-client-id="new_authorized"]')).toBeTruthy();
  expect(host.textContent).not.toContain('Legacy Portfolio');
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('every program tile region opens only its exact client/program preview and restores the native button',async()=>{
  const otherClient={...client,client_id:'other_client',name:'Another client'};
  const soc={...program,program_id:CID+':soc-2',program_key:'soc-2',framework_key:'soc-2',program_label:'SOC 2',to:'/compliance/soc-2'};
  const otherProgram={...soc,client_id:otherClient.client_id,program_id:otherClient.client_id+':soc-2'};
  const programs=[program,soc,otherProgram],clients=[client,otherClient];
  api.get.mockImplementation(async (path,options={})=>({data:path.endsWith('/overview')?{as_of:AT,clients,programs}:path==='/clients/directory'?{clients:clients.map(row=>({...row,metric_items:{past_due:[],due_30d:[],due_31_90d:[]}}))}:{as_of:AT,current:position(),snapshots:[],forecast_snapshots:[],scope_changes:[],comparison:{comparable:false},client_id:options.params.client_id,program_key:options.params.program_key}}));
  await act(async()=>root.render(<EnhancedPortfolio user={{user_id:'u'}}/>));
  for(const selected of programs){
    const tile=host.querySelector('[data-client-id="'+selected.client_id+'"] button[aria-label^="'+clients.find(row=>row.client_id===selected.client_id).name+' '+selected.program_label+' implementation history;"]');
    expect(tile.tagName).toBe('BUTTON');expect(tile.type).toBe('button');expect(tile.getAttribute('aria-haspopup')).toBe('dialog');
    expect(tile.querySelector('button,a,input,select,textarea,div')).toBeNull();
    for(const selector of ['.ep-framework','.ep-progress','.gp-statusbar','.ep-assessed',null]){
      tile.focus();
      await act(async()=> (selector?tile.querySelector(selector):tile).click());
      expect(document.querySelectorAll('[data-testid="enhanced-portfolio-history"]')).toHaveLength(1);
      const dialog=document.querySelector('[data-testid="enhanced-portfolio-history"]');
      expect(dialog.querySelector('[aria-label="Select program"] [aria-pressed="true"]').textContent).toBe(selected.program_label);
      expect(api.get.mock.calls.filter(([path])=>path.endsWith('/history')).slice(-4).every(([,options])=>options.params.client_id===selected.client_id&&options.params.program_key===selected.program_key)).toBe(true);
      expect(mockNavigate).not.toHaveBeenCalled();
      await closedPreview();expect(document.activeElement).toBe(tile);
    }
  }
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('pending or failed authentication never fetches or falls back to legacy Portfolio',async()=>{
  for(const state of [{loading:true},{error:'Session unavailable'}]){
    mockAuth={user:{user_id:'operator',role:'platform_admin'},...state};
    await act(async()=>root.render(<EnhancedPortfolioBoundary><p>Legacy Portfolio</p></EnhancedPortfolioBoundary>));
    expect(host.textContent).not.toContain('Legacy Portfolio');
    expect(host.querySelector(state.error?'[role="alert"]':'[role="status"]')).toBeTruthy();
    expect(api.get).not.toHaveBeenCalled();
  }
  mockAuth={user:{user_id:'operator',role:'platform_admin'},loading:false};
  await act(async()=>root.render(<EnhancedPortfolioBoundary><p>Legacy Portfolio</p></EnhancedPortfolioBoundary>));
  expect(host.querySelector('[data-client-id="demo_brawndo"]')).toBeTruthy();
  expect(host.textContent).not.toContain('Legacy Portfolio');
});

test('Brawndo configured IG2 history follows its actual selected scope in normal sign-in',async()=>{
  mockAuth={user:{user_id:'operator',role:'platform_admin'},workspaceMode:'standard'};
  current={...program,program_label:'CIS IG2',current:{...position(),scope:{framework_key:'cis-ig1',catalog_version:'8.1',configuration:{implementation_group:2}}}};
  await act(async()=>root.render(<EnhancedPortfolioBoundary><p>Legacy Portfolio</p></EnhancedPortfolioBoundary>));
  await act(async()=>host.querySelector('.ep-program').click());
  const dialog=document.querySelector('[data-testid="enhanced-portfolio-history"]');
  expect(dialog.querySelector('[role="alert"]')).toBeNull();
  expect(dialog.querySelector('.ep-current').textContent).toContain('CIS IG2');
  expect(api.get.mock.calls.filter(([path])=>path.endsWith('/history')).every(([,options])=>options.params.program_key==='cis-ig1'&&options.params.demo_scenario===undefined)).toBe(true);
});

test.each([
  ['group', {scope:{framework_key:'cis-ig1',catalog_version:'8.1',configuration:{implementation_group:2}}}],
  ['catalog', {scope:{framework_key:'cis-ig1',catalog_version:'9.0',configuration:{implementation_group:1}}}],
  ['framework', {scope:{framework_key:'soc-2',catalog_version:'8.1',configuration:{implementation_group:1}}}],
  ['missing scope', {scope:undefined}],
])('history rejects mismatched %s even when the returned client/program IDs match',async(_name,changed)=>{
  const original=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,options)=>{const result=await original(path,options);if(path.endsWith('/history'))result.data.current={...position(),...changed};return result;});
  await act(async()=>root.render(<EnhancedPortfolio user={{user_id:'u'}}/>));
  await act(async()=>host.querySelector('.ep-program').click());
  const dialog=document.querySelector('[data-testid="enhanced-portfolio-history"]');
  expect(dialog.querySelector('[role="alert"]').textContent).toContain('history scope does not match the selected program');
  expect(dialog.querySelector('.ph-chart')).toBeNull();
});

test('foreign overview programs are excluded and foreign returned history never renders',async()=>{
  const original=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,options)=>{
    const result=await original(path,options);
    if(path.endsWith('/overview'))result.data.programs.push({...program,client_id:'foreign',program_id:'foreign:cis-ig1',program_label:'Foreign private program'});
    if(path.endsWith('/history'))result.data.client_id='foreign';
    return result;
  });
  await act(async()=>root.render(<EnhancedPortfolio user={{user_id:'u'}}/>));
  expect(host.textContent).not.toContain('Foreign private program');
  expect(host.querySelectorAll('.ep-program')).toHaveLength(1);
  await act(async()=>host.querySelector('.ep-program').click());
  const dialog=document.querySelector('[data-testid="enhanced-portfolio-history"]');
  expect(dialog.querySelector('[role="alert"]').textContent).toContain('does not belong to the selected client program');
  expect(dialog.querySelector('.ph-chart')).toBeNull();
});

test.each(['selected program removed','client removed','client archived'])('refresh closes stale exact preview and restores its opener: %s',async change=>{
  const soc={...program,program_id:CID+':soc-2',program_key:'soc-2',framework_key:'soc-2',program_label:'SOC 2',to:'/compliance/soc-2'};
  let clients=[client],programs=[program,soc];
  api.get.mockImplementation(async(path,options={})=>({data:path.endsWith('/overview')?{as_of:AT,clients,programs}:path==='/clients/directory'?{clients:clients.map(row=>({...row,metric_items:{past_due:[],due_30d:[],due_31_90d:[]}}))}:{as_of:AT,current:position(),snapshots:[],forecast_snapshots:[],scope_changes:[],comparison:{comparable:false},client_id:CID,program_key:options.params.program_key}}));
  await act(async()=>root.render(<EnhancedPortfolio user={{user_id:'u'}}/>));
  const tile=[...host.querySelectorAll('.ep-program')].find(node=>node.querySelector('.ep-framework').textContent==='SOC 2');
  tile.focus();await act(async()=>tile.click());
  expect(document.querySelector('[data-testid="enhanced-portfolio-history"]')).toBeTruthy();
  api.get.mockClear();
  if(change==='selected program removed') programs=[program];
  if(change==='client removed'){clients=[];programs=[];}
  if(change==='client archived')clients=[{...client,status:'archived',archived:true}];
  await act(async()=>{window.dispatchEvent(new Event(PORTFOLIO_CHANGED));await new Promise(resolve=>setTimeout(resolve,5));});
  await act(async()=>new Promise(resolve=>setTimeout(resolve,0)));
  expect(document.querySelector('[data-testid="enhanced-portfolio-history"]')).toBeNull();
  expect(document.activeElement).toBe(change==='client archived'?tile:host.querySelector('[aria-label="Search clients"]'));
  expect(api.get.mock.calls.filter(([path])=>path.endsWith('/history'))).toHaveLength(0);
  clients=[client];programs=[program,soc];
  await act(async()=>{window.dispatchEvent(new Event(PORTFOLIO_CHANGED));await new Promise(resolve=>setTimeout(resolve,5));});
  expect(document.querySelector('[data-testid="enhanced-portfolio-history"]')).toBeNull();
});

test('the whole tile accessible name retains percentage, implemented/assessed and status facts',async()=>{
  await act(async()=>root.render(<EnhancedPortfolio user={{user_id:'u'}}/>));
  const name=host.querySelector('.ep-program').getAttribute('aria-label');
  expect(name).toContain('Brawndo CIS IG1 implementation history');
  expect(name).toContain('20.0%, 2 of 10 implemented');
  expect(name).toContain('Assessed 4 of 10');
  for(const count of position().included_counts)expect(name).toContain(count.count+' '+count.label);
});
