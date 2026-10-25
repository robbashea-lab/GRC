import {cisClient} from '@/testUtils/cisExperience';
import {rememberClient} from '@/lib/clientSelection';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RiskRegister from './RiskRegister';
import api from '@/lib/api';
import {useBrawndoTheme} from '@/lib/brawndoTheme';

let mockAuth,mockOrg,mockPath,mockSearch;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:mockPath,search:mockSearch}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams(mockSearch))}),{virtual:true});
// Native drawer behavior is exercised separately by RecordDrawerRiskReview/RiskRecordPanels.
jest.mock('@/components/RecordDrawer',()=>props=><div data-testid="native-dispatch" data-kind={props.kind} data-id={props.kind==='tasks'?props.record?.task_id:props.record?.risk_id} data-status={props.record?.status} data-closed-at={props.record?.closed_at} data-closure-reason={props.record?.closure_reason} data-last-reviewed={props.record?.last_reviewed}><button onClick={()=>props.onOpenChange(false)}>Close native record</button><button onClick={props.onSaved}>Refresh native record</button></div>);
let root,container,rows,mockActorSequence=0;
function RiskPage(){
  const [theme,setTheme]=useBrawndoTheme();
  return <><button data-testid="workspace-theme" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>Change workspace theme</button><RiskRegister/></>;
}
const render=()=>act(async()=>root.render(<RiskPage/>));
const click=node=>act(async()=>{expect(node).toBeTruthy();node.click();});
const subtitle=()=>container.querySelector('.page-heading p,.bpage-subtitle')?.textContent||'';
const openFilters=async()=>{await click(container.querySelector('.filter-button'));return document.querySelector('[aria-label="Risk filters"]');};
const matrixCell=()=>container.querySelector('[aria-label="Likelihood 3, impact 4, score 12, high: 1 risk"]');
const closeList=async()=>{await click(document.querySelector('[aria-label="Close risk list"]'));await act(async()=>jest.advanceTimersByTime(30));};
beforeEach(()=>{
  // Jest 27 freezes the clock and scheduling; focus checks explicitly advance their pending timers.
  jest.useFakeTimers();
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
  expect(container.querySelector('[data-testid="cis-risks-concept"]')).not.toBeNull();
  expect(container.querySelector('tbody').textContent).toContain('Native high risk');
  expect(api.get).toHaveBeenCalledWith('/risks',expect.objectContaining({params:expect.objectContaining({client_id:client.client_id})}));
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('approved matrix member list preserves search, complete register, unrated access and direct native opening',async()=>{
  await render();expect(container.querySelector('[data-testid="cis-risks-concept"]')).not.toBeNull();
  const search=container.querySelector('[data-testid="risk-search"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Native');search.dispatchEvent(new Event('input',{bubbles:true}));});
  const cell=matrixCell();await click(cell);
  expect(document.querySelectorAll('.date-review')).toHaveLength(1);
  expect(document.querySelector('.date-review').textContent).toContain('Native high risk');
  expect(container.querySelectorAll('tbody .risk-title')).toHaveLength(2);
  await closeList();expect(document.activeElement).toBe(cell);
  expect(search.value).toBe('Native');expect(container.querySelectorAll('tbody .risk-title')).toHaveLength(2);
  const unrated=[...container.querySelectorAll('tbody tr')].find(row=>row.textContent.includes('Native unrated'));
  expect(unrated.textContent).toContain('Needs assessment');
  expect(unrated.querySelector('.score-badge')).toBeNull();
  await click(unrated.querySelector('.risk-title'));
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
  await render();expect(container.querySelector('[data-testid="cis-risks-concept"]')).toBeNull();expect(container.querySelector('.matrix-panel')).toBeNull();
  expect(subtitle()).not.toContain('As of');
  expect(api.get.mock.calls.some(([path])=>path==='/tasks')).toBe(false);
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

test('Upcoming agenda opens the canonical Action and discards a pending opener after actor change',async()=>{
  const task={task_id:'native-action',client_id:'demo_brawndo',risk_id:rows[0].risk_id,title:'Saved treatment Action',status:'open',due_date:new Date().toISOString().slice(0,10)};
  const original=api.get.getMockImplementation();let resolveTask;
  api.get.mockImplementation((path,...args)=>path==='/tasks'?Promise.resolve({data:[task]}):path==='/tasks/native-action'?new Promise(resolve=>{resolveTask=resolve;}):original(path,...args));
  await render();await click(container.querySelector('.agenda-entry'));
  await act(async()=>resolveTask({data:task}));
  expect(container.querySelector('[data-testid="native-dispatch"]').dataset).toMatchObject({kind:'tasks',id:'native-action'});
  await click([...container.querySelectorAll('button')].find(b=>b.textContent==='Close native record'));
  await click(container.querySelector('.agenda-entry'));
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'next-actor'}};await render();
  await act(async()=>resolveTask({data:task}));
  expect(container.querySelector('[data-testid="native-dispatch"]')).toBeNull();
});

test('a pending agenda response cannot replace or revive a subsequently opened native draft',async()=>{
  rows[0].next_review=new Date().toISOString().slice(0,10);
  const original=api.get.getMockImplementation();let resolveRisk;
  api.get.mockImplementation((path,...args)=>path==='/risks/risk-high'?new Promise(resolve=>{resolveRisk=resolve;}):original(path,...args));
  await render();await click(container.querySelector('.agenda-entry'));
  await click([...container.querySelectorAll('tbody .risk-title')].find(b=>b.textContent==='Native unrated'));
  await act(async()=>resolveRisk({data:rows[0]}));
  expect(container.querySelector('[data-testid="native-dispatch"]').dataset.id).toBe('unrated');
  await click([...container.querySelectorAll('button')].find(b=>b.textContent==='Close native record'));
  await click(container.querySelector('.agenda-entry'));
  await click([...container.querySelectorAll('tbody .risk-title')].find(b=>b.textContent==='Native unrated'));
  await click([...container.querySelectorAll('button')].find(b=>b.textContent==='Close native record'));
  await act(async()=>resolveRisk({data:rows[0]}));
  expect(container.querySelector('[data-testid="native-dispatch"]')).toBeNull();
});

test.each(['new-risk','risk-matrix-btn'])('pending agenda cannot overlay native %s',async testId=>{
  rows[0].next_review=new Date().toISOString().slice(0,10);
  const original=api.get.getMockImplementation();let resolveRisk;
  api.get.mockImplementation((path,...args)=>path==='/risks/risk-high'?new Promise(resolve=>{resolveRisk=resolve;}):original(path,...args));
  await render();await click(container.querySelector('.agenda-entry'));
  await click(container.querySelector(`[data-testid="${testId}"]`));
  await act(async()=>resolveRisk({data:rows[0]}));
  expect(container.querySelector('[data-testid="native-dispatch"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});

test('quarter/year, selector and chart-data controls preserve native Risk cards, all matrix cells and the complete register',async()=>{
  rows[0].next_review='2026-11-05';
  const chartButton=name=>[...container.querySelectorAll('.quarter-card button')].find(node=>node.textContent===name||node.getAttribute('aria-label')===name);
  const protectedMarkup=()=>({
    cards:container.querySelector('[aria-label="Risk summaries"]').outerHTML,
    matrix:container.querySelector('.matrix-panel').outerHTML,
    toolbar:container.querySelector('.register-toolbar').outerHTML,
    controls:container.querySelector('.register-heading').outerHTML,
    register:container.querySelector('.risk-table').outerHTML,
  });
  await render();const baseline=protectedMarkup(),reads=api.get.mock.calls.length;
  expect(container.querySelectorAll('.matrix-cell')).toHaveLength(25);
  expect(container.querySelectorAll('tbody .risk-title')).toHaveLength(2);
  for(const control of ['Next quarter','Previous quarter','Q1','Q4','This quarter']){
    await click(chartButton(control));expect(protectedMarkup()).toEqual(baseline);
  }
  const year=container.querySelector('[aria-label="Year"]');
  for(const value of ['2027','2026']){
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(year,value);year.dispatchEvent(new Event('change',{bubbles:true}));});
    expect(protectedMarkup()).toEqual(baseline);
  }
  for(const mode of ['overdue','upcoming']){
    await click(container.querySelector(`[data-mode="${mode}"]`));expect(protectedMarkup()).toEqual(baseline);
  }
  const viewData=chartButton('View data');await click(viewData);
  expect(document.querySelectorAll('.date-review')).toHaveLength(1);
  expect(document.querySelector('.date-review').textContent).toContain('Native high risk');
  expect(protectedMarkup()).toEqual(baseline);
  await closeList();expect(document.activeElement).toBe(viewData);
  const marker=container.querySelector('.review-dot');expect(marker).not.toBeNull();await click(marker);
  expect(document.querySelectorAll('.date-review')).toHaveLength(1);
  expect(document.querySelector('.date-review.highlight').textContent).toContain('Native high risk');
  expect(container.querySelector('[data-testid="native-dispatch"]')).toBeNull();
  await closeList();
  expect(protectedMarkup()).toEqual(baseline);expect(document.activeElement).toBe(marker);
  expect(api.get.mock.calls).toHaveLength(reads);
  const cell=matrixCell();await click(cell);
  expect(document.querySelectorAll('.date-review')).toHaveLength(1);
  expect(container.querySelectorAll('tbody .risk-title')).toHaveLength(2);
  await closeList();expect(document.activeElement).toBe(cell);
  expect(container.querySelectorAll('tbody .risk-title')).toHaveLength(2);
  await click([...container.querySelectorAll('[aria-label="Risk summaries"] button')].find(node=>node.textContent.startsWith('Accepted')));
  expect(container.querySelectorAll('tbody .risk-title')).toHaveLength(0);
  await click([...container.querySelectorAll('[aria-label="Risk summaries"] button')].find(node=>node.textContent.startsWith('Active risks')));
  expect(container.querySelectorAll('tbody .risk-title')).toHaveLength(2);
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('presentation-only treatment filter preserves native column controls and closed record access',async()=>{
  rows=[{...rows[0],status:'in_progress',owner_id:'owner',last_reviewed:'2026-09-18'},
    {...rows[1],status:'treated'},
    {...rows[2],status:'retired',closed_at:'2026-10-01',closure_reason:'other',last_reviewed:'2026-09-01'}];
  const original=api.get.getMockImplementation();
  api.get.mockImplementation((path,...args)=>path.endsWith('/members')?Promise.resolve({data:[{user_id:'owner',name:'Joe Bowers',status:'active'}]}):original(path,...args));
  await render();const panel=await openFilters();await click(panel.querySelector('[data-testid="risk-view-treatment"]'));
  expect([...container.querySelectorAll('tbody tr')].map(row=>row.dataset.testid)).toHaveLength(2);
  const treatedRow=container.querySelector('[data-risk-row="risk-high"]');
  expect(treatedRow.querySelector('.risk-owner').textContent).toBe('Joe Bowers');
  const next=treatedRow.querySelector('.next-review-cell time');
  expect(next.textContent).toBe('Jan 1, 2099');expect(next.getAttribute('datetime')).toBe('2099-01-01');
  expect(treatedRow.querySelector('.review-relative').textContent).toContain('Last Sep 18');
  expect(panel.textContent).toContain('Last Review');
  expect(panel.querySelectorAll('.cr-native-columns .column-control')).toHaveLength(8);
  for(const key of ['all_active','significant','treatment','accepted','upcoming','critical','high','review_due'])expect(panel.querySelector(`[data-testid="risk-view-${key}"]`)).not.toBeNull();
  expect(container.querySelector('.cr-native-columns')).toBe(panel.querySelector('.cr-native-columns'));expect(container.querySelector('.brisk-filters')).toBeNull();
  expect(container.querySelector('.register-toolbar .column-control')).toBeNull();
  await click(container.querySelector('.filter-button'));
  await click(container.querySelector('[data-testid="risk-view-closed"]'));
  expect(container.querySelector('tbody').textContent).toContain('Retired (legacy)');
  expect(container.querySelector('tbody .review-relative').textContent).toContain('Last Sep 1');
  await click(container.querySelector('tbody .risk-title'));
  expect(container.querySelector('[data-testid="native-dispatch"]').dataset).toMatchObject({kind:'risks',id:'closed',status:'retired',closedAt:'2026-10-01',closureReason:'other',lastReviewed:'2026-09-01'});
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

 test.each(['selection','route'])('shared appearance boundary excludes mismatched %s identity',async mismatch=>{
 if(mismatch==='selection')rememberClient('another-client');else mockSearch='?client_id=another-client';
 await render();expect(container.querySelector('[data-testid="cis-risks-concept"]')).toBeNull();
 expect(container.querySelector('.approved-risk-register')).not.toBeNull();
 });

test('accepted refresh stamps once; render, search, matrix, theme and immediate Filters preserve that instant',async()=>{
  await render();const initial=subtitle();expect(initial).toBe('Risk register · current assessed likelihood × impact · As of Oct 18, 2026, 2:00 PM ET');
  const nativeReads=api.get.mock.calls.filter(([path])=>path==='/risks').length;
  jest.setSystemTime(new Date('2026-10-18T18:10:00.000Z'));await render();expect(subtitle()).toBe(initial);
  const search=container.querySelector('[data-testid="risk-search"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Native');search.dispatchEvent(new Event('input',{bubbles:true}));});
  await click(matrixCell());await closeList();
  await click(container.querySelector('[data-testid="workspace-theme"]'));
  expect(container.querySelector('[data-testid="cis-risks-concept"]').dataset.theme).toBe('dark');
  const controls=container.querySelector('[aria-label="Records"]');
  expect([...controls.querySelectorAll(':scope > button')].map(b=>b.childNodes[0].textContent.trim())).toEqual(['Active','Accepted','Closed']);
  let panel=await openFilters();expect(panel).not.toBeNull();expect(container.querySelector('.filter-button').getAttribute('aria-expanded')).toBe('true');
  await click(panel.querySelector('[data-testid="risk-view-significant"]'));
  expect(container.querySelectorAll('tbody .risk-title')).toHaveLength(1);
  expect(panel.querySelector('[data-testid="risk-view-significant"]').getAttribute('aria-pressed')).toBe('true');
  await act(async()=>panel.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true})));
  expect(document.querySelector('[aria-label="Risk filters"]')).toBeNull();
  panel=await openFilters();expect(panel.querySelector('[data-testid="risk-view-significant"]').getAttribute('aria-pressed')).toBe('true');
  await click(container.querySelector('.filter-button'));
  expect(search.value).toBe('Native');expect(subtitle()).toBe(initial);
  expect(api.get.mock.calls.filter(([path])=>path==='/risks')).toHaveLength(nativeReads);
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('successful native onSaved refresh advances the acknowledged instant and failure hides it',async()=>{
  await render();await click(container.querySelector('tbody .risk-title'));
  jest.setSystemTime(new Date('2026-10-18T18:12:00.000Z'));
  await click(container.querySelector('[data-testid="native-dispatch"] button:last-child'));
  expect(subtitle()).toContain('As of Oct 18, 2026, 2:12 PM ET');
  const original=api.get.getMockImplementation();api.get.mockImplementation((path,...args)=>path==='/risks'?Promise.reject(new Error('Refresh failed')):original(path,...args));
  jest.setSystemTime(new Date('2026-10-18T18:20:00.000Z'));
  await click(container.querySelector('[data-testid="native-dispatch"] button:last-child'));
  expect(subtitle()).not.toContain('As of');expect(container.textContent).toContain('Refresh failed');
  expect(container.querySelectorAll('tbody .risk-title')).toHaveLength(0);
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('a genuinely successful empty register receives a refresh timestamp',async()=>{
  rows=[];await render();expect(subtitle()).toContain('As of Oct 18, 2026, 2:00 PM ET');
  expect(container.querySelectorAll('tbody .risk-title')).toHaveLength(0);
  expect(container.textContent).toContain('No risks have been added yet.');
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test.each(['actor','route','mode','mixed-client'])('pending refresh cannot retain or publish an old timestamp after %s change',async change=>{
  await render();expect(subtitle()).toContain('2:00 PM ET');
  await click(container.querySelector('tbody .risk-title'));
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
  if(change==='actor'){
    expect(container.querySelector('[data-testid="risks-navigation-loading"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Native high risk');
  }
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
