import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import BrawndoActionItems from '@/pages/BrawndoActionItems';
import BrawndoDemoActionItems from '@/pages/BrawndoDemoActionItems';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';
import {rememberClient} from '@/lib/clientSelection';

let mockAuth,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({
  Link:({children,to})=><a href={to}>{children}</a>,Navigate:({to})=><div>{to}</div>,useNavigate:()=>jest.fn(),
  useLocation:()=>({pathname:globalThis.window.location.pathname,search:globalThis.window.location.search,state:null}),
  useNavigationType:()=> 'REPLACE',useSearchParams:()=>require('react').useState(new URLSearchParams(globalThis.window.location.search)),
}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn(),info:jest.fn()}}));
jest.mock('./EvidencePanel',()=>()=> <div>Native evidence retained</div>);
jest.mock('./AssigneeSelect',()=>()=> <div>Native owner retained</div>);

let root,container,props,finding,task,risk,serial=0;
const drawer=()=>document.querySelector('[data-testid="remediation-ticket-drawer"]');
const button=(text,scope=document)=>[...scope.querySelectorAll('button')].find(n=>n.textContent===text);
const render=extra=>act(async()=>root.render(<RecordDrawer {...props} {...extra}/>));
const click=node=>act(async()=>node.click());
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const input=(node,value)=>act(async()=>{
  Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
const confirm=async()=>{await click(button('Raise as risk'));return button('Confirm raise as risk',document.querySelector('[role="alertdialog"]'));};
const calls=()=>api.post.mock.calls.filter(([path])=>path.endsWith('/raise-risk'));
const link=()=>{finding={...finding,risk_id:risk.risk_id,updated_at:'2026-10-24T23:00:00Z'};};

beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;serial++;
  sessionStorage.clear();localStorage.clear();rememberClient('demo_brawndo');
  window.history.replaceState({},'','/action-items?client_id=demo_brawndo');
  mockAuth={workspaceMode:'demo',loading:false,user:{user_id:'finding-risk-actor-'+serial,role:'super_admin',workspace_mode:'demo'}};
  const client=cisClient('demo_brawndo');mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false};
  finding={finding_id:'finding-'+serial,client_id:'demo_brawndo',title:'Synthetic Finding',description:'Original issue',severity:'high',status:'open',updated_at:'2026-10-01T00:00:00Z'};
  task={task_id:'task-'+serial,client_id:'demo_brawndo',finding_id:finding.finding_id,title:'Retained native work',description:'Original plan',status:'open',priority:'medium',updated_at:'2026-10-01T00:00:00Z'};
  risk={risk_id:'risk-'+serial,client_id:'demo_brawndo',title:'Synthetic unassessed Risk',status:'identified',category:'compliance',source_type:'finding',source_id:finding.finding_id,finding_id:finding.finding_id,related_finding_ids:[finding.finding_id],likelihood_score:null,impact_score:null,risk_score:null,risk_level:null};
  api.get.mockImplementation(async path=>({data:path==='/findings'?[finding]:path==='/tasks'?[task]:path==='/risks'?(finding.risk_id?[risk]:[]):path==='/findings/'+finding.finding_id?finding:path==='/risks/'+risk.risk_id?risk:path==='/onboarding/state'?{assessments:[]}:path==='/related'?{}:[]}));
  api.post.mockImplementation(async path=>{if(path.endsWith('/raise-risk')){link();return {data:{risk}};}return {data:{}};});
  props={open:true,kind:'findings',record:{...finding},clientId:'demo_brawndo',presentation:'brawndo-demo-actions',onOpenChange:jest.fn(),onSaved:jest.fn()};
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('real existing-Finding RecordDrawer exposes native confirmation and cancellation writes nothing',async()=>{
  await render();expect(drawer()).not.toBeNull();await confirm();
  expect(document.querySelector('[role="alertdialog"]').textContent).toContain('likelihood and impact');
  await click(button('Cancel',document.querySelector('[role="alertdialog"]')));
  expect(calls()).toHaveLength(0);expect(props.onSaved).not.toHaveBeenCalled();
});

test.each(['cancel','escape'])('confirmation %s returns focus to the current native opener without writing',async method=>{
  await render();const opener=button('Raise as risk');await act(async()=>opener.focus());await confirm();
  const confirmation=document.querySelector('[role="alertdialog"]');
  if(method==='cancel')await click(button('Cancel',confirmation));
  else await act(async()=>confirmation.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await act(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();expect(document.activeElement).toBe(opener);expect(calls()).toHaveLength(0);
});

test('a stale confirmation cannot restore the earlier actor opener or write',async()=>{
  await render();const opener=button('Raise as risk');await act(async()=>opener.focus());await confirm();
  mockAuth.user={...mockAuth.user,user_id:'replacement'};await render();
  await act(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();expect(document.activeElement).not.toBe(opener);expect(calls()).toHaveLength(0);
});

test('the optional strict parent callback is used only by the new Risk command',async()=>{
  props.onRiskLinked=jest.fn().mockResolvedValue(undefined);await render();await click(await confirm());
  expect(props.onRiskLinked).toHaveBeenCalledTimes(1);expect(props.onSaved).not.toHaveBeenCalled();
});

test('a returned parent refresh failure stays unconfirmed without another creation',async()=>{
  props.onSaved.mockResolvedValue({ok:false,error:'Register unavailable'});await render();await click(await confirm());
  expect(button('Open linked Risk')).toBeUndefined();expect(button('Check linked Risk')).toBeDefined();
  expect(document.body.textContent).not.toContain('Risk linked and verified');expect(calls()).toHaveLength(1);
});

test('the real Action register returning a failed load cannot publish native Risk success',async()=>{
  await act(async()=>root.render(<BrawndoActionItems/>));
  const row=[...container.querySelectorAll('[data-testid^="ai-row-"]')].find(node=>node.textContent.includes(task.title));
  await click(row.querySelector('.register-record-link'));
  const get=api.get.getMockImplementation();let verified=false,taskReads=0;
  api.get.mockImplementation(async(path,...args)=>{
    if(path==='/risks/'+risk.risk_id)verified=true;
    if(verified&&path==='/tasks'&&++taskReads===2)throw new Error('Register projection unavailable');
    return get(path,...args);
  });
  await click(await confirm());expect(taskReads).toBe(2);
  expect(container.textContent).toContain('Register projection unavailable');expect(button('Check linked Risk')).toBeDefined();
  expect(document.body.textContent).not.toContain('Risk linked and verified');expect(calls()).toHaveLength(1);
});

test('the real Demo register requires an accepted parent read after Risk creation',async()=>{
  await act(async()=>root.render(<BrawndoDemoActionItems/>));
  await click(container.querySelector('[data-ticket-id="finding:'+finding.finding_id+'"] .bda-title'));
  const get=api.get.getMockImplementation();let verified=false,taskReads=0;
  api.get.mockImplementation(async(path,...args)=>{
    if(path==='/risks/'+risk.risk_id)verified=true;
    if(verified&&path==='/tasks'&&++taskReads===2)throw new Error('Demo register projection unavailable');
    return get(path,...args);
  });
  await click(await confirm());
  expect(taskReads).toBe(2);expect(document.body.textContent).toContain('Demo register projection unavailable');
  expect(document.body.textContent).not.toContain('record was saved');expect(document.body.textContent).not.toContain('Risk linked and verified');
  expect(document.querySelector('[data-testid="risks-drawer"]')).toBeNull();expect(calls()).toHaveLength(1);
});

test('the real Demo register opens an existing Risk with no mutation callbacks, save events or second parent read',async()=>{
  link();await act(async()=>root.render(<BrawndoDemoActionItems/>));
  await click(container.querySelector('[data-ticket-id="finding:'+finding.finding_id+'"] .bda-title'));
  const get=api.get.getMockImplementation();let verified=false,taskReads=0;const saved=jest.fn();window.addEventListener('grc:ticket-saved',saved);
  api.get.mockImplementation(async(path,...args)=>{
    if(path==='/risks/'+risk.risk_id)verified=true;
    if(verified&&path==='/tasks'&&++taskReads===2)throw new Error('A read-only opener must not refresh its parent as a save');
    return get(path,...args);
  });
  try{
    await click(button('Open linked Risk'));expect(document.querySelector('[data-testid="risks-drawer"]')).not.toBeNull();
    expect(taskReads).toBe(1);expect(saved).not.toHaveBeenCalled();expect(calls()).toHaveLength(0);expect(api.patch).not.toHaveBeenCalled();
  }finally{window.removeEventListener('grc:ticket-saved',saved);}
});

test.each(['platform_admin','super_admin'])('%s raises once, verifies exact records and opens the real native Risk drawer without changing work',async role=>{
  mockAuth.user.role=role;const originalTask={...task};await render();
  const pending=deferred();api.post.mockImplementationOnce(()=>pending.promise);
  const complete=button('Complete work'),action=await confirm();await act(async()=>{action.click();action.click();complete.click();});
  expect(calls()).toEqual([['/findings/'+finding.finding_id+'/raise-risk']]);
  expect(api.patch).not.toHaveBeenCalled();
  expect(drawer().querySelector('[aria-label="Planned action"]').disabled).toBe(true);
  expect(button('Complete work')).toBeUndefined();
  link();await act(async()=>pending.resolve({data:{risk}}));
  expect(api.get).toHaveBeenCalledWith('/findings/'+finding.finding_id);
  expect(api.get).toHaveBeenCalledWith('/risks/'+risk.risk_id);
  expect(props.onSaved).toHaveBeenCalledTimes(1);expect(finding.status).toBe('open');expect(task).toEqual(originalTask);
  await click(button('Open linked Risk'));
  expect(document.querySelector('[data-testid="risks-drawer"]')).not.toBeNull();
  expect(calls()).toHaveLength(1);
});

test.each(['client_grc_manager','client_contributor','client_readonly','client_viewer'])('%s cannot invoke creation',async role=>{
  mockAuth.user.role=role;await render();expect(button('Raise as risk')).toBeUndefined();expect(calls()).toHaveLength(0);
});

test.each(['standard','user-mode','auth-loading','org-loading','auth-error','org-error','unauthorized','selected-client','route-client','loaded-client','record-client','other-client'])('%s fails closed',async boundary=>{
  if(boundary==='standard'){mockAuth.workspaceMode='standard';mockAuth.user.workspace_mode='standard';}
  if(boundary==='user-mode')mockAuth.user.workspace_mode='standard';
  if(boundary==='auth-loading')mockAuth.loading=true;
  if(boundary==='org-loading')mockOrg.loading=true;
  if(boundary==='auth-error')mockAuth.error='Failed';
  if(boundary==='org-error')mockOrg.error='Failed';
  if(boundary==='unauthorized')mockOrg.clients=[];
  if(boundary==='selected-client')rememberClient('other');
  if(boundary==='route-client')window.history.replaceState({},'','/action-items?client_id=other');
  if(boundary==='loaded-client')mockOrg.currentClient={...mockOrg.currentClient,client_id:'other'};
  if(boundary==='record-client')props.record={...finding,client_id:'other'};
  if(boundary==='other-client'){
    const client=cisClient('other');mockOrg={...mockOrg,currentClientId:'other',currentClient:client,clients:[client]};
    props.clientId='other';props.record={...finding,client_id:'other'};rememberClient('other');window.history.replaceState({},'','/action-items?client_id=other');
  }
  await render();expect(button('Raise as risk')).toBeUndefined();expect(calls()).toHaveLength(0);
});

test.each(['Planned action','Ticket comment','Acceptance rationale'])('unfinished %s blocks the command and preserves text',async label=>{
  await render();const field=drawer().querySelector('[aria-label="'+label+'"]');await input(field,'Keep this unfinished draft');
  await click(button('Raise as risk'));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();expect(drawer().textContent).toContain('Save, post or discard');
  expect(field.value).toBe('Keep this unfinished draft');expect(calls()).toHaveLength(0);expect(api.patch).not.toHaveBeenCalled();
});

test.each(['wrong-finding','wrong-client','wrong-source','wrong-backlink','failed-read','malformed-response'])('%s cannot claim success or open an unverified Risk',async fault=>{
  await render();const get=api.get.getMockImplementation();
  api.post.mockImplementationOnce(async()=>{
    link();
    if(fault==='wrong-finding')finding.finding_id='foreign';
    if(fault==='wrong-client')risk.client_id='foreign';
    if(fault==='wrong-source')risk.source_id='foreign';
    if(fault==='wrong-backlink')risk.related_finding_ids=[];
    if(fault==='failed-read')api.get.mockImplementation(async(path,...args)=>{if(path.startsWith('/findings/'))throw new Error('Read unavailable');return get(path,...args);});
    return {data:fault==='malformed-response'?{}:{risk}};
  });
  await click(await confirm());expect(button('Open linked Risk')).toBeUndefined();expect(props.onSaved).not.toHaveBeenCalled();
  expect(drawer().textContent).toContain('unconfirmed');expect(calls()).toHaveLength(1);
});

test('lost POST response plus empty reconciliation never rearms creation, including remount',async()=>{
  await render();api.post.mockRejectedValueOnce(new Error('Response lost'));await click(await confirm());
  await click(button('Check linked Risk'));await click(button('Check linked Risk'));
  expect(button('Raise as risk')).toBeUndefined();expect(calls()).toHaveLength(1);
  await act(async()=>root.render(null));await render();
  expect(button('Raise as risk')).toBeUndefined();await click(button('Check linked Risk'));expect(calls()).toHaveLength(1);
  await act(async()=>root.render(null));mockAuth.user={...mockAuth.user,user_id:'another-admin'};await render();
  expect(button('Raise as risk')).toBeUndefined();await click(button('Check linked Risk'));expect(calls()).toHaveLength(1);
  link();await click(button('Check linked Risk'));expect(button('Open linked Risk')).toBeDefined();expect(calls()).toHaveLength(1);
});

test('an existing link is read and verified before the actual native Risk drawer opens',async()=>{
  link();props.record={...finding};await render();expect(button('Raise as risk')).toBeUndefined();
  await click(button('Open linked Risk'));expect(document.querySelector('[data-testid="risks-drawer"]')).not.toBeNull();expect(calls()).toHaveLength(0);
});

test('an already opened Risk disappears immediately when its actor changes',async()=>{
  link();props.record={...finding};await render();await click(button('Open linked Risk'));
  expect(document.querySelector('[data-testid="risks-drawer"]')).not.toBeNull();
  mockAuth.user={...mockAuth.user,user_id:'replacement'};await render();
  expect(document.querySelector('[data-testid="risks-drawer"]')).toBeNull();
});

test('late native Risk save after actor leaves and returns cannot invoke the earlier command callback',async()=>{
  link();props.record={...finding};await render();await click(button('Open linked Risk'));
  const riskDrawer=document.querySelector('[data-testid="risks-drawer"]');
  await input(riskDrawer.querySelector('[aria-label="Title"]'),'Updated native Risk');
  const pending=deferred();api.patch.mockImplementationOnce(()=>pending.promise);await click(button('Save changes',riskDrawer));
  expect(api.patch).toHaveBeenCalledTimes(1);const actor=mockAuth.user;
  mockAuth.user={...actor,user_id:'replacement'};await render();mockAuth.user=actor;await render();
  api.get.mockClear();props.onSaved.mockClear();
  await act(async()=>pending.resolve({data:{...risk,title:'Updated native Risk'}}));
  expect(api.get).not.toHaveBeenCalledWith('/findings/'+finding.finding_id);expect(props.onSaved).not.toHaveBeenCalled();
  expect(document.querySelector('[data-testid="risks-drawer"]')).toBeNull();
});

test('React strict effect replay retains a usable current command',async()=>{
  await act(async()=>root.render(<React.StrictMode><RecordDrawer {...props}/></React.StrictMode>));
  await click(await confirm());expect(calls()).toHaveLength(1);expect(button('Open linked Risk')).toBeDefined();
});

test('two actual drawers cannot both POST after concurrent preflight reads',async()=>{
  await act(async()=>root.render(<><RecordDrawer {...props}/><RecordDrawer {...props}/></>));
  const drawers=[...document.querySelectorAll('[data-testid="remediation-ticket-drawer"]')],first=deferred(),second=deferred(),post=deferred(),get=api.get.getMockImplementation();let reads=0;
  api.get.mockImplementation((path,...args)=>path==='/findings/'+finding.finding_id?(++reads===1?first.promise:reads===2?second.promise:get(path,...args)):get(path,...args));
  api.post.mockImplementationOnce(()=>post.promise);
  for(const item of drawers){await click(button('Raise as risk',item));await click(button('Confirm raise as risk',document.querySelector('[role="alertdialog"]')));}
  await act(async()=>{first.resolve({data:finding});second.resolve({data:finding});});
  expect(calls()).toHaveLength(1);link();await act(async()=>post.resolve({data:{risk}}));
  expect(calls()).toHaveLength(1);
});

test('a loaded Risk backlink without a Finding link holds creation for administrator repair',async()=>{
  const get=api.get.getMockImplementation();api.get.mockImplementation(async(path,...args)=>path==='/risks'?{data:[risk]}:get(path,...args));
  await render();await click(await confirm());expect(calls()).toHaveLength(0);
  expect(drawer().textContent).toContain('Administrator repair');expect(button('Check linked Risk')).toBeDefined();
});

test.each(['ticket','parent'])('%s refresh failure cannot claim verified success',async failure=>{
  await render();
  if(failure==='parent')props.onSaved.mockRejectedValueOnce(new Error('Parent unavailable'));
  else {
    const get=api.get.getMockImplementation();api.post.mockImplementationOnce(async()=>{link();api.get.mockImplementation(async(path,...args)=>{if(path==='/tasks')throw new Error('Ticket unavailable');return get(path,...args);});return {data:{risk}};});
  }
  await click(await confirm());expect(button('Open linked Risk')).toBeUndefined();expect(document.body.textContent).not.toContain('Risk linked and verified');
  expect(button('Check linked Risk')).toBeDefined();expect(calls()).toHaveLength(1);
});

test.each(['preflight','finding','risk'])('late %s GET after actor change cannot post, refresh or navigate',async phase=>{
  await render();const pending=deferred(),get=api.get.getMockImplementation();let findingReads=0;
  api.get.mockImplementation(async(path,...args)=>{
    if(path==='/findings/'+finding.finding_id){findingReads++;if(phase==='preflight'&&findingReads===1||phase==='finding'&&findingReads===2)return pending.promise;}
    if(phase==='risk'&&path==='/risks/'+risk.risk_id)return pending.promise;
    return get(path,...args);
  });
  await click(await confirm());mockAuth.user={...mockAuth.user,user_id:'replacement'};await render();
  await act(async()=>pending.resolve({data:phase==='risk'?risk:finding}));
  expect(props.onSaved).not.toHaveBeenCalled();expect(document.querySelector('[data-testid="risks-drawer"]')).toBeNull();
  if(phase==='preflight')expect(calls()).toHaveLength(0);else expect(calls()).toHaveLength(1);
});

test.each(['actor','role','mode','client','finding','loading','unmount'])('late POST after %s change cannot refresh, navigate or publish success',async change=>{
  await render();const pending=deferred();api.post.mockImplementationOnce(()=>pending.promise);await click(await confirm());
  if(change==='actor')mockAuth.user={...mockAuth.user,user_id:'replacement'};
  if(change==='role')mockAuth.user={...mockAuth.user,role:'client_viewer'};
  if(change==='mode')mockAuth.workspaceMode='standard';
  if(change==='client')mockOrg.currentClientId='other';
  if(change==='finding')props.record={...finding,finding_id:'replacement'};
  if(change==='loading')mockOrg.loading=true;
  if(change==='unmount')await act(async()=>root.render(null));else await render();
  await act(async()=>pending.resolve({data:{risk}}));
  expect(props.onSaved).not.toHaveBeenCalled();expect(document.querySelector('[data-testid="risks-drawer"]')).toBeNull();
  expect(document.body.textContent).not.toContain('Risk linked and verified');
});
