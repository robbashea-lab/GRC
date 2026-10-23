import {cisClient} from '@/testUtils/cisExperience';
import {rememberClient} from '@/lib/clientSelection';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RiskRegister from './RiskRegister';
import api from '@/lib/api';

let mockAuth,mockOrg,mockPath,mockSearch;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:mockPath,search:mockSearch}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams(mockSearch))}),{virtual:true});
// Native drawer behavior is exercised separately by RecordDrawerRiskReview/RiskRecordPanels.
jest.mock('@/components/RecordDrawer',()=>props=><div data-testid="native-dispatch" data-kind={props.kind} data-id={props.record?.risk_id||props.record?.task_id}><button onClick={()=>props.onOpenChange(false)}>Close native record</button><button onClick={props.onSaved}>Refresh native record</button></div>);
let root,container,rows,mockActorSequence=0;
const render=()=>act(async()=>root.render(<RiskRegister/>));
const click=node=>act(async()=>node.click());
const subtitle=()=>container.querySelector('.bpage-subtitle')?.textContent||'';
const openFilters=async()=>{await click(container.querySelector('.bdr-filter-trigger'));return document.querySelector('.bdr-filters-panel');};
beforeEach(()=>{
  // Freeze only the clock; Radix's native scheduling and focus timers remain real.
  jest.useFakeTimers({doNotFake:['nextTick','setImmediate','clearImmediate','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','queueMicrotask','performance']});
  jest.setSystemTime(new Date('2026-10-18T18:00:00.000Z'));
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();rememberClient('demo_brawndo');mockSearch='';mockPath='/risks';
  mockAuth={workspaceMode:'demo',loading:false,user:{user_id:`admin-${++mockActorSequence}`,role:'super_admin',workspace_mode:'demo'}};
  const client={...cisClient('demo_brawndo'),name:'Brawndo'};
  mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false};
  rows=[{risk_id:'risk-high',client_id:'demo_brawndo',display_id:'RISK-101',title:'Native high risk',status:'assessed',likelihood_score:3,impact_score:4,next_review:'2099-01-01'},
    {risk_id:'unrated',client_id:'demo_brawndo',title:'Native unrated',status:'open'},
    {risk_id:'closed',client_id:'demo_brawndo',title:'Native closed',status:'closed',likelihood_score:1,impact_score:2}];
  api.get.mockImplementation(async path=>({data:path==='/risks'?rows:path==='/related'?{tasks:[]}:path.startsWith('/risks/')?rows.find(r=>r.risk_id===path.split('/').at(-1)):[]}));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();jest.useRealTimers();});

test.each([1,2,3].flatMap(group=>['demo','standard'].map(mode=>[group,mode])))('configured IG%i %s client receives the approved overview through its client-scoped request without writes',async(group,mode)=>{
  const client=cisClient(`synthetic_risks_ig${group}_${mode}`,group);
  mockAuth={...mockAuth,workspaceMode:mode,user:{...mockAuth.user,workspace_mode:mode}};
  mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false};
  rows=rows.map(row=>({...row,client_id:client.client_id}));rememberClient(client.client_id);
  await render();
  expect(container.querySelector('[data-testid="demo-risks-overview"]')).not.toBeNull();
  expect(container.querySelector('tbody').textContent).toContain('Native high risk');
  expect(api.get).toHaveBeenCalledWith('/risks',expect.objectContaining({params:expect.objectContaining({client_id:client.client_id})}));
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('exact demo overview preserves current search, cell clear, unrated access and direct native opening',async()=>{
  await render();expect(container.querySelector('[data-testid="demo-risks-overview"]')).not.toBeNull();
  const search=container.querySelector('[data-testid="risk-search"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Native');search.dispatchEvent(new Event('input',{bubbles:true}));});
  await click(container.querySelector('[aria-label="Likelihood 3, impact 4, score 12, band high: 1 risk"]'));
  expect(container.querySelectorAll('tbody .register-record-link')).toHaveLength(1);
  await click([...container.querySelectorAll('button')].find(b=>b.textContent==='Clear matrix selection'));
  expect(search.value).toBe('Native');expect(container.querySelectorAll('tbody .register-record-link')).toHaveLength(2);
  await click([...container.querySelectorAll('button')].find(b=>b.textContent==='View unrated risks'));
  expect(container.querySelector('tbody').textContent).toContain('Native unrated');
  expect(container.querySelector('tbody .bdr-scorebar')).toBeNull();
  await click(container.querySelector('tbody .register-record-link'));
  expect(container.querySelector('[data-testid="native-dispatch"]').dataset).toMatchObject({kind:'risks',id:'unrated'});
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test.each(['mode-mismatch','other-demo','wrong-route','unresolved','archived','mismatch','denied'])('new presentation stays off for %s',async condition=>{
  if(condition==='mode-mismatch')mockAuth.workspaceMode='standard';
  if(condition==='other-demo'){mockOrg.currentClientId='demo_dunder';mockOrg.currentClient={client_id:'demo_dunder',name:'Brawndo',status:'active'};rows=rows.map(r=>({...r,client_id:'demo_dunder'}));}
  if(condition==='wrong-route')mockPath='/dashboard';
  if(condition==='unresolved')mockOrg.loading=true;
  if(condition==='archived')mockOrg.currentClient.status='archived';
  if(condition==='mismatch')mockOrg.currentClient.client_id='other';
  if(condition==='denied')mockOrg.error='Access denied';
  await render();expect(container.querySelector('[data-testid="demo-risks-overview"]')).toBeNull();expect(container.querySelector('.bdr-scorebar')).toBeNull();
  expect(subtitle()).not.toContain('As of');
  expect(api.get.mock.calls.some(([path])=>path==='/related')).toBe(false);
});

test('deep link uses exact native ID/client and dispatches the full existing Risk drawer',async()=>{
  mockSearch='?id=risk-high&client_id=demo_brawndo';await render();
  expect(api.get).toHaveBeenCalledWith('/risks/risk-high',expect.any(Object));
  expect(container.querySelector('[data-testid="native-dispatch"]').dataset).toMatchObject({kind:'risks',id:'risk-high'});
});

test('old actor response cannot activate the new presentation or publish old records',async()=>{
  let resolveOld;api.get.mockImplementation(path=>path==='/risks'?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve({data:[]}));
  await render();mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'next-actor'}};
  api.get.mockImplementation(async path=>({data:path==='/risks'?[]:path==='/related'?{tasks:[]}:[]}));await render();
  await act(async()=>resolveOld({data:rows}));
  expect(container.querySelector('tbody').textContent).not.toContain('Native high risk');
  expect(container.querySelector('[aria-label="Risk summaries"]').textContent).toContain('Active risks0');
});

test('Coming up opens the canonical Action and discards a pending opener after actor change',async()=>{
  const task={task_id:'native-action',client_id:'demo_brawndo',title:'Saved treatment Action',status:'open',due_date:new Date().toISOString().slice(0,10)};
  const original=api.get.getMockImplementation();let resolveTask;
  api.get.mockImplementation((path,...args)=>path==='/related'?Promise.resolve({data:{tasks:[task]}}):path==='/tasks/native-action'?new Promise(resolve=>{resolveTask=resolve;}):original(path,...args));
  await render();await click(container.querySelector('.compact-program-coming button'));
  await act(async()=>resolveTask({data:task}));
  expect(container.querySelector('[data-testid="native-dispatch"]').dataset).toMatchObject({kind:'tasks',id:'native-action'});
  await click([...container.querySelectorAll('button')].find(b=>b.textContent==='Close native record'));
  await click(container.querySelector('.compact-program-coming button'));
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'next-actor'}};await render();
  await act(async()=>resolveTask({data:task}));
  expect(container.querySelector('[data-testid="native-dispatch"]')).toBeNull();
});

test('a pending Coming up response cannot replace or revive a subsequently opened native draft',async()=>{
  rows[0].next_review=new Date().toISOString().slice(0,10);
  const original=api.get.getMockImplementation();let resolveRisk;
  api.get.mockImplementation((path,...args)=>path==='/risks/risk-high'?new Promise(resolve=>{resolveRisk=resolve;}):original(path,...args));
  await render();await click(container.querySelector('.compact-program-coming button'));
  await click([...container.querySelectorAll('tbody .register-record-link')].find(b=>b.textContent==='Native unrated'));
  await act(async()=>resolveRisk({data:rows[0]}));
  expect(container.querySelector('[data-testid="native-dispatch"]').dataset.id).toBe('unrated');
  await click([...container.querySelectorAll('button')].find(b=>b.textContent==='Close native record'));
  await click(container.querySelector('.compact-program-coming button'));
  await click([...container.querySelectorAll('tbody .register-record-link')].find(b=>b.textContent==='Native unrated'));
  await click([...container.querySelectorAll('button')].find(b=>b.textContent==='Close native record'));
  await act(async()=>resolveRisk({data:rows[0]}));
  expect(container.querySelector('[data-testid="native-dispatch"]')).toBeNull();
});

test.each(['new-risk','risk-matrix-btn'])('pending Coming up cannot overlay native %s',async testId=>{
  rows[0].next_review=new Date().toISOString().slice(0,10);
  const original=api.get.getMockImplementation();let resolveRisk;
  api.get.mockImplementation((path,...args)=>path==='/risks/risk-high'?new Promise(resolve=>{resolveRisk=resolve;}):original(path,...args));
  await render();await click(container.querySelector('.compact-program-coming button'));
  await click(container.querySelector(`[data-testid="${testId}"]`));
  await act(async()=>resolveRisk({data:rows[0]}));
  expect(container.querySelector('[data-testid="native-dispatch"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});

test('presentation-only treatment filter preserves native column controls and closed record access',async()=>{
  rows=[{...rows[0],status:'in_progress',owner_id:'owner',last_reviewed:'2026-09-18'},
    {...rows[1],status:'treated'},
    {...rows[2],status:'retired',closed_at:'2026-10-01',closure_reason:'other',last_reviewed:'2026-09-01'}];
  const original=api.get.getMockImplementation();
  api.get.mockImplementation((path,...args)=>path.endsWith('/members')?Promise.resolve({data:[{user_id:'owner',name:'Joe Bowers',status:'active'}]}):original(path,...args));
  await render();const panel=await openFilters();await click(panel.querySelector('[data-testid="risk-view-treatment"]'));
  expect([...container.querySelectorAll('tbody tr')].map(row=>row.dataset.testid)).toHaveLength(2);
  expect(container.querySelector('tbody .bdr-avatar').textContent).toBe('JB');
  const last=container.querySelector('tbody .bdr-row-review time');
  expect(last.textContent).toBe('Sep 18');expect(last.getAttribute('aria-label')).toBe('Sep 18, 2026');expect(last.title).toBe('Sep 18, 2026');
  expect(panel.textContent).toContain('Last Review');
  expect(panel.querySelectorAll('.bdr-filter-columns .column-control')).toHaveLength(8);
  for(const key of ['all_active','significant','treatment','accepted','upcoming','critical','high','review_due'])expect(panel.querySelector(`[data-testid="risk-view-${key}"]`)).not.toBeNull();
  expect(container.querySelector('.bdr-more')).toBeNull();expect(container.querySelector('.brisk-filters')).toBeNull();
  expect(container.querySelector('.register-toolbar .column-control')).toBeNull();
  await click(container.querySelector('.bdr-filter-trigger'));
  await click(container.querySelector('[data-testid="risk-view-closed"]'));
  expect(container.querySelector('tbody').textContent).toContain('Closed Oct 1');
  expect(container.querySelector('tbody').textContent).toContain('Sep 1, 2026');
  await click(container.querySelector('tbody .register-record-link'));
  expect(container.querySelector('[data-testid="native-dispatch"]').dataset).toMatchObject({kind:'risks',id:'closed'});
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

 test.each(['selection','route'])('shared appearance boundary excludes mismatched %s identity',async mismatch=>{
 if(mismatch==='selection')rememberClient('another-client');else mockSearch='?client_id=another-client';
 await render();expect(container.querySelector('[data-testid="demo-risks-overview"]')).toBeNull();
 expect(container.querySelector('.approved-risk-register')).not.toBeNull();
 });

test('accepted refresh stamps once; render, search, matrix, theme and immediate Filters preserve that instant',async()=>{
  await render();const initial=subtitle();expect(initial).toBe('Risk register · current assessed likelihood × impact · As of Oct 18, 2026, 2:00 PM ET');
  const nativeReads=api.get.mock.calls.filter(([path])=>path==='/risks').length;
  jest.setSystemTime(new Date('2026-10-18T18:10:00.000Z'));await render();expect(subtitle()).toBe(initial);
  const search=container.querySelector('[data-testid="risk-search"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Native');search.dispatchEvent(new Event('input',{bubbles:true}));});
  await click(container.querySelector('[aria-label="Likelihood 3, impact 4, score 12, band high: 1 risk"]'));
  await click([...container.querySelectorAll('button')].find(b=>b.textContent==='Clear matrix selection'));
  await click(container.querySelector('.surface-theme-action'));
  const controls=container.querySelector('[aria-label="Records"]');
  expect([...controls.querySelectorAll(':scope > button')].map(b=>b.textContent)).toEqual(['Active','Closed','Filters ▾']);
  let panel=await openFilters();expect(panel).not.toBeNull();expect(container.querySelector('.bdr-filter-trigger').getAttribute('aria-expanded')).toBe('true');
  await click(panel.querySelector('[data-testid="risk-view-significant"]'));
  expect(container.querySelectorAll('tbody .register-record-link')).toHaveLength(1);
  expect(panel.querySelector('[data-testid="risk-view-significant"]').getAttribute('aria-pressed')).toBe('true');
  await act(async()=>panel.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true})));
  expect(document.querySelector('.bdr-filters-panel')).toBeNull();
  panel=await openFilters();expect(panel.querySelector('[data-testid="risk-view-significant"]').getAttribute('aria-pressed')).toBe('true');
  await click(container.querySelector('.bdr-filter-trigger'));
  expect(search.value).toBe('Native');expect(subtitle()).toBe(initial);
  expect(api.get.mock.calls.filter(([path])=>path==='/risks')).toHaveLength(nativeReads);
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('successful native onSaved refresh advances the acknowledged instant and failure hides it',async()=>{
  await render();await click(container.querySelector('tbody .register-record-link'));
  jest.setSystemTime(new Date('2026-10-18T18:12:00.000Z'));
  await click(container.querySelector('[data-testid="native-dispatch"] button:last-child'));
  expect(subtitle()).toContain('As of Oct 18, 2026, 2:12 PM ET');
  const original=api.get.getMockImplementation();api.get.mockImplementation((path,...args)=>path==='/risks'?Promise.reject(new Error('Refresh failed')):original(path,...args));
  jest.setSystemTime(new Date('2026-10-18T18:20:00.000Z'));
  await click(container.querySelector('[data-testid="native-dispatch"] button:last-child'));
  expect(subtitle()).not.toContain('As of');expect(container.textContent).toContain('Refresh failed');
  expect(container.querySelectorAll('tbody .register-record-link')).toHaveLength(0);
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('a genuinely successful empty register receives a refresh timestamp',async()=>{
  rows=[];await render();expect(subtitle()).toContain('As of Oct 18, 2026, 2:00 PM ET');
  expect(container.querySelectorAll('tbody .register-record-link')).toHaveLength(0);
  expect(container.textContent).toContain('No risks have been added yet.');
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test.each(['actor','route','mode','mixed-client'])('pending refresh cannot retain or publish an old timestamp after %s change',async change=>{
  await render();expect(subtitle()).toContain('2:00 PM ET');
  await click(container.querySelector('tbody .register-record-link'));
  const original=api.get.getMockImplementation(),pending=[];
  api.get.mockImplementation((path,...args)=>path==='/risks'?new Promise(resolve=>pending.push(resolve)):original(path,...args));
  await click(container.querySelector('[data-testid="native-dispatch"] button:last-child'));
  expect(subtitle()).not.toContain('As of');
  if(change==='actor')mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'next-actor'}};
  if(change==='route')mockPath='/dashboard';
  if(change==='mode')mockAuth={...mockAuth,workspaceMode:'standard'};
  await render();jest.setSystemTime(new Date('2026-10-18T18:25:00.000Z'));
  await act(async()=>pending[0]({data:change==='mixed-client'?[...rows,{...rows[0],risk_id:'foreign',client_id:'demo_dunder'}]:rows}));
  expect(subtitle()).not.toContain('As of');
  if(change==='actor')expect(container.querySelector('tbody').textContent).not.toContain('Native high risk');
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
