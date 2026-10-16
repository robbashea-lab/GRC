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
let root,container,rows;
const render=()=>act(async()=>root.render(<RiskRegister/>));
const click=node=>act(async()=>node.click());
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();localStorage.setItem('grc_client_id','demo_brawndo');mockSearch='';mockPath='/risks';
  mockAuth={workspaceMode:'demo',loading:false,user:{user_id:'admin',role:'super_admin',workspace_mode:'demo'}};
  mockOrg={currentClientId:'demo_brawndo',currentClient:{client_id:'demo_brawndo',name:'Brawndo',status:'active'},loading:false};
  rows=[{risk_id:'risk-high',client_id:'demo_brawndo',display_id:'RISK-101',title:'Native high risk',status:'assessed',likelihood_score:3,impact_score:4,next_review:'2099-01-01'},
    {risk_id:'unrated',client_id:'demo_brawndo',title:'Native unrated',status:'open'},
    {risk_id:'closed',client_id:'demo_brawndo',title:'Native closed',status:'closed',likelihood_score:1,impact_score:2}];
  api.get.mockImplementation(async path=>({data:path==='/risks'?rows:path==='/related'?{tasks:[]}:path.startsWith('/risks/')?rows.find(r=>r.risk_id===path.split('/').at(-1)):[]}));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('exact demo overview preserves current search, cell clear, unrated access and direct native opening',async()=>{
  await render();expect(container.querySelector('[data-testid="demo-risks-overview"]')).not.toBeNull();
  const search=container.querySelector('[data-testid="risk-search"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Native');search.dispatchEvent(new Event('input',{bubbles:true}));});
  await click(container.querySelector('[aria-label="Likelihood 3, impact 4, high: 1 risks"]'));
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

test.each(['standard','other-demo','wrong-route','unresolved','archived','mismatch','denied'])('new presentation stays off for %s',async condition=>{
  if(condition==='standard')mockAuth.workspaceMode='standard';
  if(condition==='other-demo'){mockOrg.currentClientId='demo_dunder';mockOrg.currentClient={client_id:'demo_dunder',name:'Brawndo',status:'active'};rows=rows.map(r=>({...r,client_id:'demo_dunder'}));}
  if(condition==='wrong-route')mockPath='/dashboard';
  if(condition==='unresolved')mockOrg.loading=true;
  if(condition==='archived')mockOrg.currentClient.status='archived';
  if(condition==='mismatch')mockOrg.currentClient.client_id='other';
  if(condition==='denied')mockOrg.error='Access denied';
  await render();expect(container.querySelector('[data-testid="demo-risks-overview"]')).toBeNull();expect(container.querySelector('.bdr-scorebar')).toBeNull();
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
  await render();await click(container.querySelector('.bdr-event button'));
  await act(async()=>resolveTask({data:task}));
  expect(container.querySelector('[data-testid="native-dispatch"]').dataset).toMatchObject({kind:'tasks',id:'native-action'});
  await click([...container.querySelectorAll('button')].find(b=>b.textContent==='Close native record'));
  await click(container.querySelector('.bdr-event button'));
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'next-actor'}};await render();
  await act(async()=>resolveTask({data:task}));
  expect(container.querySelector('[data-testid="native-dispatch"]')).toBeNull();
});

test('a pending Coming up response cannot replace or revive a subsequently opened native draft',async()=>{
  rows[0].next_review=new Date().toISOString().slice(0,10);
  const original=api.get.getMockImplementation();let resolveRisk;
  api.get.mockImplementation((path,...args)=>path==='/risks/risk-high'?new Promise(resolve=>{resolveRisk=resolve;}):original(path,...args));
  await render();await click(container.querySelector('.bdr-event button'));
  await click([...container.querySelectorAll('tbody .register-record-link')].find(b=>b.textContent==='Native unrated'));
  await act(async()=>resolveRisk({data:rows[0]}));
  expect(container.querySelector('[data-testid="native-dispatch"]').dataset.id).toBe('unrated');
  await click([...container.querySelectorAll('button')].find(b=>b.textContent==='Close native record'));
  await click(container.querySelector('.bdr-event button'));
  await click([...container.querySelectorAll('tbody .register-record-link')].find(b=>b.textContent==='Native unrated'));
  await click([...container.querySelectorAll('button')].find(b=>b.textContent==='Close native record'));
  await act(async()=>resolveRisk({data:rows[0]}));
  expect(container.querySelector('[data-testid="native-dispatch"]')).toBeNull();
});

test.each(['new-risk','risk-matrix-btn'])('pending Coming up cannot overlay native %s',async testId=>{
  rows[0].next_review=new Date().toISOString().slice(0,10);
  const original=api.get.getMockImplementation();let resolveRisk;
  api.get.mockImplementation((path,...args)=>path==='/risks/risk-high'?new Promise(resolve=>{resolveRisk=resolve;}):original(path,...args));
  await render();await click(container.querySelector('.bdr-event button'));
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
  await render();await click(container.querySelector('[data-testid="risk-view-treatment"]'));
  expect([...container.querySelectorAll('tbody tr')].map(row=>row.dataset.testid)).toHaveLength(2);
  expect(container.querySelector('tbody .bdr-avatar').textContent).toBe('JB');
  expect(container.querySelector('tbody .bdr-row-review').textContent).toContain('Sep 18, 2026');
  const more=container.querySelector('.bdr-more');more.open=true;
  expect(more.textContent).toContain('Last Review');
  for(const key of ['critical','high','review_due'])expect(more.querySelector(`[data-testid="risk-view-${key}"]`)).not.toBeNull();
  await click(container.querySelector('[data-testid="risk-view-closed"]'));
  expect(container.querySelector('tbody').textContent).toContain('Closed Oct 1');
  expect(container.querySelector('tbody').textContent).toContain('Sep 1, 2026');
  await click(container.querySelector('tbody .register-record-link'));
  expect(container.querySelector('[data-testid="native-dispatch"]').dataset).toMatchObject({kind:'risks',id:'closed'});
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

 test.each(['selection','route'])('shared appearance boundary excludes mismatched %s identity',async mismatch=>{
 if(mismatch==='selection')localStorage.setItem('grc_client_id','another-client');else mockSearch='?client_id=another-client';
 await render();expect(container.querySelector('[data-testid="demo-risks-overview"]')).toBeNull();
 expect(container.querySelector('.approved-risk-register')).not.toBeNull();
 });
