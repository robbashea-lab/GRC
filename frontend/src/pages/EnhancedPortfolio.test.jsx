import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import EnhancedPortfolioBoundary, { EnhancedPortfolio } from './EnhancedPortfolio';
import EnhancedPortfolioHistory from '@/components/EnhancedPortfolioHistory';
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
  current = program,
  currentWork;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = jest.fn();
  jest.clearAllMocks();
  current = program;
  currentWork = {past_due: [item], due_30d: [], due_31_90d: []};
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
        metric_items: currentWork
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
const workDisclosure = (title, dialog = document.querySelector('[data-testid="enhanced-portfolio-history"]')) => {
  const button = [...dialog.querySelectorAll('button[aria-expanded][aria-controls]')]
    .find(node => node.textContent.trim().startsWith(title));
  expect(button).toBeTruthy();
  return button;
};
const workDetails = button => document.getElementById(button.getAttribute('aria-controls'));
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
  expect(dialog.querySelector('[aria-label="Recorded work facts"]')).toBeNull();
  expect(dialog.textContent).not.toMatch(/Latest retained completion|Native completed review|Scheduled recurring reviews|Retained completion history is partial/);
  expect(workDisclosure('Overdue').getAttribute('aria-expanded')).toBe('false');
  await act(async () => workDisclosure('Overdue').click());
  expect(workDetails(workDisclosure('Overdue')).textContent).toContain('Real native action');
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
  expect(dialog.querySelector('[aria-label="Recorded work facts"]')).toBeNull();
  expect(workDisclosure('Overdue').getAttribute('aria-expanded')).toBe('false');
  expect(workDisclosure('Next 30 days').getAttribute('aria-expanded')).toBe('false');
  await act(async () => workDisclosure('Overdue').click());
  expect(workDetails(workDisclosure('Overdue')).textContent).toContain('Real native action');
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

test('standard enhanced route preserves assessed zero, missing source and independent verification counts',async()=>{
  mockAuth={user:{user_id:'operator',role:'platform_admin',workspace_mode:'standard'},workspaceMode:'standard'};
  const counts=values=>['addressed','in_progress','needs_attention','not_assessed'].map((key,index)=>({key,label:key,count:values[index]}));
  const native=(values,extra={})=>({availability:'available',implemented:values[0],denominator:values.reduce((sum,value)=>sum+value,0),counts:counts(values),...extra});
  const cases=[
    ['assessed-zero',native([0,2,3,5])],['new',native([0,0,0,10],{not_started:true})],
    ['reset',native([0,0,0,10])],['empty-scope',native([0,0,0,0])],
    ['invalid',native([0,0,0,10],{denominator:12})],
    ['missing-native-source',native([0,0,0,0],{availability:'partial',assessed:0})],
    ['unverified-implemented',native([10,0,0,0],{verification:'not_verified'})]
  ];
  const programs=cases.map(([key,current])=>({...program,program_id:CID+':'+key,program_key:key,program_label:key,current}));
  api.get.mockImplementation(async path=>({data:path.endsWith('/overview')?{as_of:AT,clients:[client],programs}:{clients:[{...client,metric_items:{past_due:[],due_30d:[],due_31_90d:[]}}]}}));
  await act(async()=>root.render(<EnhancedPortfolioBoundary><p>Legacy Portfolio</p></EnhancedPortfolioBoundary>));
  const tile=key=>[...host.querySelectorAll('.ep-program')].find(node=>node.querySelector('.ep-framework').textContent===key);
  expect(host.textContent).not.toContain('Legacy Portfolio');
  expect(tile('assessed-zero').textContent).toContain('0.0%');
  expect(tile('assessed-zero').textContent).toContain('Assessed 5 of 10');
  for(const key of ['new','reset']){
    expect(tile(key).textContent).toContain('0.0%');
    expect(tile(key).textContent).toContain('Assessed 0 of 10');
  }
  expect(tile('empty-scope').querySelector('.ep-progress').textContent).not.toContain('%');
  for(const key of ['invalid','missing-native-source']){
    expect(tile(key).textContent).toContain('Implementation unavailable');
    expect(tile(key).textContent).not.toContain('0.0%');
    expect(tile(key).textContent).not.toContain('Assessed 0 of 0');
    expect(tile(key).getAttribute('aria-label')).toContain('Assessment unavailable');
  }
  expect(tile('unverified-implemented').textContent).toContain('100.0%');
  expect(host.querySelectorAll('.ep-program')).toHaveLength(7);
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

test('work disclosures start collapsed, expand independently and retain exact native Review occurrence navigation', async () => {
  const review = {...item, key: 'review:annual', entity_type: 'review', entity_id: 'annual-review',
    occurrence_id: 'occurrence-2026-10-22', title: 'Exact scheduled review', due_date: '2026-10-22',
    overdue: false, type: 'Review'};
  currentWork.due_30d = [review];
  await act(async () => root.render(<EnhancedPortfolio user={{user_id: 'u'}} />));
  await act(async () => host.querySelector('.ep-program').click());
  const dialog = document.querySelector('[data-testid="enhanced-portfolio-history"]');
  const overdue = workDisclosure('Overdue'), upcoming = workDisclosure('Next 30 days');
  const overdueDetails = workDetails(overdue), upcomingDetails = workDetails(upcoming);
  expect(dialog.querySelector('.ep-history-body').firstElementChild.contains(overdue)).toBe(true);
  expect(overdue.getAttribute('aria-controls')).not.toBe(upcoming.getAttribute('aria-controls'));
  expect(overdue.classList.contains('ep-red')).toBe(true);
  expect(upcoming.classList.contains('ep-amber')).toBe(true);
  for (const button of [overdue, upcoming]) {
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(workDetails(button).hidden).toBe(true);
    expect(button.textContent).toContain('1');
    expect(button.querySelector('button,a,input,select,textarea')).toBeNull();
  }
  // jsdom checks the native button and hidden subtree contract; browser QA covers actual key activation/tab order.
  overdue.focus();
  expect(document.activeElement).toBe(overdue);
  await act(async () => overdue.click());
  expect(overdue.getAttribute('aria-expanded')).toBe('true');
  expect(overdueDetails.hidden).toBe(false);
  expect(upcoming.getAttribute('aria-expanded')).toBe('false');
  expect(upcomingDetails.hidden).toBe(true);
  expect(overdueDetails.textContent).toContain('Real native action');
  expect(overdueDetails.textContent).toContain('Frito');
  expect(overdueDetails.textContent).toContain('3 days overdue');
  await act(async () => upcoming.click());
  expect(overdueDetails.hidden).toBe(false);
  expect(upcomingDetails.hidden).toBe(false);
  await act(async () => overdue.click());
  expect(overdueDetails.hidden).toBe(true);
  expect(upcomingDetails.hidden).toBe(false);
  expect(upcomingDetails.textContent).toContain('Exact scheduled review');
  expect(upcomingDetails.textContent).toContain('in 2 days');
  await act(async () => upcomingDetails.querySelector('.ep-work-item').click());
  expect(mockSwitch).toHaveBeenLastCalledWith(CID);
  expect(mockNavigate).toHaveBeenLastCalledWith('/reviews?id=annual-review&client_id=demo_brawndo&occurrence=occurrence-2026-10-22');
  expect(api.post).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
});

test('closing and reopening the same program resets both disclosures and restores its existing opener', async () => {
  await act(async () => root.render(<EnhancedPortfolio user={{user_id: 'u'}} />));
  const opener = host.querySelector('.ep-program');
  opener.focus();
  await act(async () => opener.click());
  await act(async () => workDisclosure('Overdue').click());
  await act(async () => workDisclosure('Next 30 days').click());
  expect(workDisclosure('Overdue').getAttribute('aria-expanded')).toBe('true');
  expect(workDisclosure('Next 30 days').getAttribute('aria-expanded')).toBe('true');
  await closedPreview();
  expect(document.querySelector('[data-testid="enhanced-portfolio-history"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
  await act(async () => opener.click());
  for (const title of ['Overdue', 'Next 30 days']) {
    expect(workDisclosure(title).getAttribute('aria-expanded')).toBe('false');
    expect(workDetails(workDisclosure(title)).hidden).toBe(true);
  }
});

test('a normal native refresh updates counts and implementation data without resetting current expansion choices', async () => {
  await act(async () => root.render(<EnhancedPortfolio user={{user_id: 'u'}} />));
  await act(async () => host.querySelector('.ep-program').click());
  const overdue = workDisclosure('Overdue');
  const detailsId = overdue.getAttribute('aria-controls');
  await act(async () => overdue.click());
  currentWork = {...currentWork, past_due: [item, {...item, key: 'task2', entity_id: 'task2', title: 'Another native action'}]};
  current = {...program, current: position(3)};
  await act(async () => {
    window.dispatchEvent(new Event(PORTFOLIO_CHANGED));
    await new Promise(resolve => setTimeout(resolve, 5));
  });
  expect(workDisclosure('Overdue')).toBe(overdue);
  expect(overdue.getAttribute('aria-controls')).toBe(detailsId);
  expect(overdue.getAttribute('aria-expanded')).toBe('true');
  expect(overdue.textContent).toContain('2');
  expect(workDetails(overdue).hidden).toBe(false);
  expect(workDetails(overdue).querySelectorAll('.ep-work-item')).toHaveLength(2);
  expect(workDetails(overdue).textContent).toContain('Another native action');
  expect(workDisclosure('Next 30 days').getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector('.ep-current strong').textContent).toBe('30.0%');
  expect(api.post).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
});

test('changing actual program or client identity resets disclosures and never retains the previous client work', async () => {
  const first = {...client, metric_items: {past_due: [item], due_30d: [], due_31_90d: []}};
  const other = {...client, client_id: 'new_authorized', name: 'New authorized client',
    metric_items: {past_due: [{...item, client_id: 'new_authorized', key: 'other-task', entity_id: 'other-task', title: 'Other client native work'}], due_30d: [], due_31_90d: []}};
  const soc = {...program, program_id: CID + ':soc-2', program_key: 'soc-2', framework_key: 'soc-2',
    program_label: 'SOC 2', to: '/compliance/soc-2',
    current: {...position(), scope: {framework_key: 'soc-2', catalog_version: '2017', configuration: {}}}};
  const otherSoc = {...soc, client_id: other.client_id, program_id: other.client_id + ':soc-2'};
  const contexts = [[first, program], [first, soc], [other, otherSoc]];
  api.get.mockImplementation(async (_path, {params}) => ({data: {
    client_id: params.client_id, program_key: params.program_key, as_of: AT,
    current: contexts.find(([row, candidate]) => row.client_id === params.client_id && candidate.program_key === params.program_key)[1].current,
    snapshots: [], forecast_snapshots: [], scope_changes: [], comparison: {comparable: false}
  }}));
  const renderPreview = ([row, selectedProgram]) => root.render(<EnhancedPortfolioHistory client={row}
    programs={[selectedProgram]} selected={selectedProgram.program_id} onSelect={jest.fn()} asOf={AT}
    refreshToken={0} onClose={jest.fn()} onNavigate={mockNavigate} theme="light" />);
  let previousId;
  for (const context of contexts) {
    await act(async () => renderPreview(context));
    const overdue = workDisclosure('Overdue');
    expect(overdue.getAttribute('aria-expanded')).toBe('false');
    expect(workDisclosure('Next 30 days').getAttribute('aria-expanded')).toBe('false');
    expect(overdue.getAttribute('aria-controls')).not.toBe(previousId);
    previousId = overdue.getAttribute('aria-controls');
    await act(async () => overdue.click());
    await act(async () => workDisclosure('Next 30 days').click());
    expect(workDetails(overdue).textContent).toContain(context[0] === other ? 'Other client native work' : 'Real native action');
    if (context[0] === other) {
      expect(document.querySelector('[data-testid="enhanced-portfolio-history"]').textContent).not.toContain('Real native action');
      await act(async () => workDetails(overdue).querySelector('.ep-work-item').click());
      expect(mockNavigate).toHaveBeenLastCalledWith('/action-items?id=other-task&client_id=new_authorized');
    }
  }
  expect(api.post).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
});

test('collapsed counts and expanded lists preserve every native item and the existing inclusive 30-day boundary', async () => {
  const many = Array.from({length: 100}, (_, index) => ({...item,
    key: 'task:' + index, entity_id: 'task-' + index, title: 'Native action ' + (index + 1)}));
  const upcoming = (key, due_date) => ({...item, key, entity_id: key, title: key, due_date, overdue: false});
  currentWork = {
    past_due: [...many, many[0], {...item, key: 'foreign', client_id: 'foreign'}],
    due_30d: [upcoming('due today', '2026-10-20'), upcoming('due day 30', '2026-11-19'),
      upcoming('outside day 31', '2026-11-20'), upcoming('already past due', '2026-10-19')],
    due_31_90d: [upcoming('later native work', '2026-12-01')]
  };
  await act(async () => root.render(<EnhancedPortfolio user={{user_id: 'u'}} />));
  await act(async () => host.querySelector('.ep-program').click());
  expect(workDisclosure('Overdue').textContent).toContain('100');
  expect(workDisclosure('Next 30 days').textContent).toContain('2');
  await act(async () => workDisclosure('Overdue').click());
  await act(async () => workDisclosure('Next 30 days').click());
  const actions = [...workDetails(workDisclosure('Overdue')).querySelectorAll('.ep-work-item')];
  expect(actions).toHaveLength(100);
  expect(actions.map(button => button.querySelector('span:nth-child(2)').firstChild.textContent)).toEqual(many.map(row => row.title));
  const due = workDetails(workDisclosure('Next 30 days'));
  expect(due.querySelectorAll('.ep-work-item')).toHaveLength(2);
  expect(due.textContent).toContain('due today');
  expect(due.textContent).toContain('due day 30');
  expect(due.textContent).not.toMatch(/outside day 31|already past due|later native work/);
  expect(api.post).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
});

test.each(['demo', 'standard'])('a newly authorized non-CIS program uses compact zero rows and exact workspace identity in %s mode', async mode => {
  const row = {...client, client_id: 'new_authorized', name: 'New authorized client',
    metric_items: {past_due: [], due_30d: [], due_31_90d: []}};
  const nativeProgram = {...program, client_id: row.client_id, program_id: row.client_id + ':soc-2',
    program_key: 'soc-2', framework_key: 'soc-2', program_label: 'SOC 2', to: '/compliance/soc-2',
    current: {...position(), scope: {framework_key: 'soc-2', catalog_version: '2017', configuration: {}}}};
  mockAuth = {user: {user_id: 'operator', role: 'platform_admin', workspace_mode: mode}, workspaceMode: mode};
  api.get.mockImplementation(async path => ({data: path.endsWith('/overview') ? {
    as_of: AT, clients: [row], programs: [nativeProgram]
  } : path === '/clients/directory' ? {clients: [row]} : {
    client_id: row.client_id, program_key: nativeProgram.program_key, as_of: AT,
    current: nativeProgram.current, snapshots: [], forecast_snapshots: [], scope_changes: [], comparison: {comparable: false}
  }}));
  await act(async () => root.render(<EnhancedPortfolioBoundary><p>Legacy Portfolio</p></EnhancedPortfolioBoundary>));
  await act(async () => host.querySelector('.ep-program').click());
  const dialog = document.querySelector('[data-testid="enhanced-portfolio-history"]');
  expect(dialog.querySelector('[role="alert"]')).toBeNull();
  expect(dialog.querySelector('[aria-label="Recorded work facts"]')).toBeNull();
  for (const title of ['Overdue', 'Next 30 days']) {
    const button = workDisclosure(title);
    expect(button.textContent).toContain('0');
    expect(button.classList.contains('ep-red')).toBe(false);
    expect(button.classList.contains('ep-amber')).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(workDetails(button).hidden).toBe(true);
    await act(async () => button.click());
    expect(workDetails(button).querySelectorAll('.ep-work-item')).toHaveLength(0);
    expect(workDetails(button).textContent).toContain(title === 'Overdue' ? 'Nothing overdue.' : 'Nothing due.');
  }
  await click('Open SOC 2 workspace →');
  expect(mockSwitch).toHaveBeenLastCalledWith(row.client_id);
  expect(mockNavigate).toHaveBeenLastCalledWith('/compliance/soc-2?client_id=new_authorized');
  expect(api.get.mock.calls.filter(([path]) => path.endsWith('/history')).every(([, options]) =>
    options.params.client_id === row.client_id && options.params.program_key === 'soc-2' && options.params.demo_scenario === undefined)).toBe(true);
  expect(api.post).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
});

test('pending native work coverage stays loading rather than showing compact false-zero counts', async () => {
  const original = api.get.getMockImplementation();
  let resolveOperations;
  api.get.mockImplementation((path, options) => path === '/clients/directory'
    ? new Promise(resolve => {resolveOperations = resolve;}) : original(path, options));
  await act(async () => root.render(<EnhancedPortfolio user={{user_id: 'u'}} />));
  expect(host.querySelector('[role="status"]').textContent).toContain('Loading client portfolio');
  expect(host.querySelector('.ep-program')).toBeNull();
  expect(document.querySelector('[data-testid="enhanced-portfolio-history"]')).toBeNull();
  expect(host.textContent).not.toMatch(/Nothing overdue|Nothing due/);
  await act(async () => resolveOperations({data: {clients: [{...client, metric_items: currentWork}]}}));
  await act(async () => host.querySelector('.ep-program').click());
  expect(workDisclosure('Overdue').textContent).toContain('1');
  expect(workDisclosure('Overdue').getAttribute('aria-expanded')).toBe('false');
});
