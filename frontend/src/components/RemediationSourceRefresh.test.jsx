import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';
import {buildLegacyDemoStore,saveStore} from '../preview/store';

let mockUser={user_id:'demo_admin',role:'super_admin'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/commandTestAdapter').previewAdapter}),formatError:error=>error.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
jest.mock('./ui/dialog',()=>{
  const React=require('react'),Close=React.createContext(()=>{});
  return {
    Dialog:({open,children,onOpenChange})=>open?<Close.Provider value={onOpenChange}>{children}</Close.Provider>:null,
    DialogContent:React.forwardRef(({children,onOpenAutoFocus,onCloseAutoFocus,onEscapeKeyDown,onPointerDownOutside,...props},ref)=>{
      const change=React.useContext(Close);
      return <section ref={ref} {...props}>{children}<button aria-label="Close drawer" onClick={()=>change(false)}>Close</button></section>;
    }),
    DialogTitle:React.forwardRef(({children,...props},ref)=><h2 ref={ref} {...props}>{children}</h2>),
    DialogDescription:({children})=><p>{children}</p>,
  };
});

let container,root,task,finding,assessment,evidence;
const button=(surface,text)=>[...surface.querySelectorAll('button')].find(node=>node.textContent===text);
const click=(surface,text)=>act(async()=>button(surface,text).click());
const close=surface=>act(async()=>surface.querySelector('[aria-label="Close drawer"]').click());
const text=async(surface,label,value)=>act(async()=>{
  const node=surface.querySelector('[aria-label="'+label+'"]');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});

beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(async()=>{
  mockUser={user_id:'demo_admin',role:'super_admin'};
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  // Preserve the fixed v1 source/ticket input while exercising the current native recovery flow.
  saveStore(buildLegacyDemoStore(),{resetFiles:true});
  await api.post('/demo/enter');
  task=(await api.get('/tasks',{params:{client_id:'demo_brawndo'}})).data.find(row=>row.task_id==='demo_brawndo_cis_action_1.1');
  await api.patch('/tasks/'+task.task_id,{status:'done',description:'Synthetic saved corrective plan.',resolution:'Synthetic completed work retained on reopen.'});
  await api.post('/findings/'+task.finding_id+'/validate',{rationale:'Synthetic verified corrective work'});
  task=(await api.get('/tasks/'+task.task_id)).data;
  finding=(await api.get('/findings/'+task.finding_id)).data;
  assessment=(await api.get('/framework_assessments/'+finding.framework_assessment_id)).data;
  evidence=(await api.get('/evidence',{params:{client_id:task.client_id}})).data;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();sessionStorage.clear();localStorage.clear();});

test.each([false,true])('returning from the same source ticket reopen refreshes its Action Items view and preserves parent drafts (%s)',async withDraft=>{
  const onSaved=jest.fn(),onClose=jest.fn();
  await act(async()=>root.render(<RecordDrawer open kind="tasks" record={task} clientId={task.client_id} onSaved={onSaved} onOpenChange={onClose}/>));
  const original=container.querySelector('[data-testid="remediation-ticket-drawer"]');
  expect(original.textContent).toContain('Completed');
  const planned=original.querySelector('[aria-label="Planned action"]'),savedPlan=planned.value;
  if(withDraft)await text(original,'Planned action','Unsaved parent action draft stays here.');
  await click(original,'CIS Controls v8.1 Assessment → Safeguard 1.1');
  const source=container.querySelector('[data-testid="brawndo-cis-assessment"]');
  await click(source,'Findings');
  const sourceTicket=source.querySelector('[data-ticket-id="finding:'+finding.finding_id+'"]');
  await act(async()=>sourceTicket.querySelector('button').click());
  const nested=[...container.querySelectorAll('[data-testid="remediation-ticket-drawer"]')].at(-1);
  expect(onSaved).not.toHaveBeenCalled();
  await click(nested,'Reopen ticket');
  expect(nested.textContent).toContain('Ticket reopened. Previous completed work and decisions are retained.');
  const currentFinding=(await api.get('/findings/'+finding.finding_id)).data;
  const currentTasks=(await api.get('/tasks',{params:{client_id:task.client_id}})).data.filter(row=>row.finding_id===finding.finding_id);
  expect(currentFinding.finding_id).toBe(finding.finding_id);expect(currentFinding.status).toBe('in_remediation');
  expect(currentTasks).toHaveLength(2);expect(currentTasks.find(row=>row.task_id===task.task_id)).toMatchObject({status:'done',resolution:task.resolution});
  await close(nested);await close(source);
  expect(container.querySelectorAll('[data-testid="remediation-ticket-drawer"]')).toHaveLength(1);
  const returned=container.querySelector('[data-testid="remediation-ticket-drawer"]');
  expect(returned.querySelector('h2').nextElementSibling.textContent).toBe('finding:'+finding.finding_id);
  expect(returned.querySelectorAll('[data-ticket-task]')).toHaveLength(2);
  expect(returned.querySelector('[data-ticket-task="'+currentFinding.primary_task_id+'"] [aria-label="Work status"]').value).toBe('open');
  expect(button(returned,'Reopen ticket')).toBeUndefined();expect(onSaved).toHaveBeenCalled();
  expect(returned.querySelector('[data-ticket-task="'+task.task_id+'"] [aria-label="Planned action"]').value).toBe(withDraft?'Unsaved parent action draft stays here.':savedPlan);
  if(withDraft){
    const leaving=new Event('beforeunload',{cancelable:true});window.dispatchEvent(leaving);expect(leaving.defaultPrevented).toBe(true);
  }
  expect(onClose).not.toHaveBeenCalled();
  const after=(await api.get('/framework_assessments/'+finding.framework_assessment_id)).data;
  for(const field of ['status','implementation','verification','last_saved','assessment_history'])expect(after[field]).toEqual(assessment[field]);
  expect((await api.get('/evidence',{params:{client_id:task.client_id}})).data).toEqual(evidence);
  expect(currentTasks.find(row=>row.task_id===task.task_id).description).toBe(savedPlan);
},30000); // Includes the native Source drawer's related-record and return refreshes.

test.each([
  [false,null],
  [true,null],
  [true,'Synthetic source-side planned action.'],
])('same-child Source completion keeps the parent draft, refreshes native lifecycle, and handles actual field conflicts (validated=%s, sourcePlan=%s)',async(validated,sourcePlan)=>{
  await api.post('/findings/'+finding.finding_id+'/reopen',{request_id:'same-child-round-trip',expected_updated_at:finding.updated_at});
  const reopened=(await api.get('/findings/'+finding.finding_id)).data;
  const editing=(await api.get('/tasks/'+reopened.primary_task_id)).data;
  const localPlan='Synthetic QA unsaved parent plan must survive nested source ticket saves.';
  await act(async()=>root.render(<RecordDrawer open kind="tasks" record={editing} clientId={editing.client_id} onOpenChange={()=>{}}/>));
  const original=container.querySelector('[data-testid="remediation-ticket-drawer"]');
  await text(original.querySelector('[data-ticket-task="'+editing.task_id+'"]'),'Planned action',localPlan);
  await click(original,'CIS Controls v8.1 Assessment → Safeguard 1.1');
  const source=container.querySelector('[data-testid="brawndo-cis-assessment"]');
  await click(source,'Findings');
  await act(async()=>source.querySelector('[data-ticket-id="finding:'+finding.finding_id+'"] button').click());
  const nested=[...container.querySelectorAll('[data-testid="remediation-ticket-drawer"]')].at(-1),innerWork=nested.querySelector('[data-ticket-task="'+editing.task_id+'"]');
  if(sourcePlan)await text(innerWork,'Planned action',sourcePlan);
  await text(innerWork,'Actual resolution','Synthetic source-side completed work.');
  await click(innerWork,'Complete work');
  if(validated){await text(nested,'Validation rationale','Synthetic source-side validation.');await click(nested,'Validate and complete');}
  await close(nested);await close(source);
  const returned=container.querySelector('[data-testid="remediation-ticket-drawer"]'),work=returned.querySelector('[data-ticket-task="'+editing.task_id+'"]');
  expect(returned.textContent).toContain(validated?'Completed':'Pending validation');
  expect(returned.querySelectorAll('[data-ticket-task]')).toHaveLength(2);
  expect(work.querySelector('[aria-label="Planned action"]').value).toBe(localPlan);
  expect(work.querySelector('[aria-label="Work status"]').value).toBe('done');
  expect(work.querySelector('[aria-label="Work status"]').disabled).toBe(true);
  expect(work.querySelector('[aria-label="Actual resolution"]').value).toBe('Synthetic source-side completed work.');
  expect(button(work,'Save changes').disabled).toBe(false);
  const leaving=new Event('beforeunload',{cancelable:true});window.dispatchEvent(leaving);expect(leaving.defaultPrevented).toBe(true);
  const current=(await api.get('/tasks/'+editing.task_id)).data,beforeFinding=(await api.get('/findings/'+finding.finding_id)).data;
  expect(current.description??'').toBe(sourcePlan??editing.description??'');
  const saved=jest.spyOn(api,'patch');
  try{
    await click(work,'Save changes');
    expect(saved).toHaveBeenLastCalledWith('/tasks/'+editing.task_id,{description:localPlan,expected_updated_at:sourcePlan?editing.updated_at:current.updated_at},expect.anything());
    const after=(await api.get('/tasks/'+editing.task_id)).data;
    expect(after.status).toBe('done');expect(after.resolution).toBe('Synthetic source-side completed work.');
    if(sourcePlan){expect(after.description).toBe(sourcePlan);expect(work.querySelector('[aria-label="Planned action"]').value).toBe(localPlan);expect(work.querySelector('[role="alert"]').textContent).toMatch(/changed|conflict/i);}
    else {expect(after.description).toBe(localPlan);expect(button(work,'Save changes').disabled).toBe(true);}
  }finally{saved.mockRestore();}
  const afterFinding=(await api.get('/findings/'+finding.finding_id)).data;
  for(const field of ['status','validated_at','decision_history'])expect(afterFinding[field]).toEqual(beforeFinding[field]);
  const retained=(await api.get('/tasks/'+task.task_id)).data;
  expect(retained.status).toBe('done');expect(retained.resolution).toBe(task.resolution);
  const afterAssessment=(await api.get('/framework_assessments/'+finding.framework_assessment_id)).data;
  for(const field of ['status','implementation','verification','last_saved','assessment_history'])expect(afterAssessment[field]).toEqual(assessment[field]);
  expect((await api.get('/evidence',{params:{client_id:editing.client_id}})).data).toEqual(evidence);
},30000);

test('unconfirmed Action recovery retains a newer local plan and uses only its new delta after acknowledging the original request',async()=>{
  await act(async()=>root.render(<RecordDrawer open kind="tasks" record={task} clientId={task.client_id} onOpenChange={()=>{}}/>));
  const work=container.querySelector('[data-ticket-task="'+task.task_id+'"]'),originalPatch=api.patch.bind(api);
  const transport=jest.spyOn(api,'patch').mockImplementationOnce(async(...args)=>{await originalPatch(...args);throw new Error('Synthetic lost response after commit.');});
  try{
    await text(work,'Planned action','Synthetic first planned action.');await click(work,'Save changes');
    expect(button(work,'Retry unconfirmed save')).toBeTruthy();
    const request=transport.mock.calls[0];
    await text(work,'Planned action','Synthetic newer retained planned action.');
    await click(work,'Retry unconfirmed save');
    expect(transport.mock.calls[1][0]).toBe(request[0]);expect(transport.mock.calls[1][1]).toEqual(request[1]);
    expect(transport.mock.calls[1][2].headers['Idempotency-Key']).toBe(request[2].headers['Idempotency-Key']);
    expect(work.querySelector('[aria-label="Planned action"]').value).toBe('Synthetic newer retained planned action.');
    const acknowledged=(await api.get('/tasks/'+task.task_id)).data;
    expect(acknowledged.description).toBe('Synthetic first planned action.');
    expect(button(work,'Retry unconfirmed save')).toBeUndefined();
    await click(work,'Save changes');
    expect(transport).toHaveBeenLastCalledWith('/tasks/'+task.task_id,{description:'Synthetic newer retained planned action.',expected_updated_at:acknowledged.updated_at},expect.anything());
    expect((await api.get('/tasks/'+task.task_id)).data).toMatchObject({status:'done',description:'Synthetic newer retained planned action.',resolution:task.resolution});
    const after=(await api.get('/findings/'+finding.finding_id)).data;
    for(const field of ['status','validated_at','decision_history'])expect(after[field]).toEqual(finding[field]);
  }finally{transport.mockRestore();}
},30000);

test('refreshed Work keeps the existing read-only field and command restrictions',async()=>{
  mockUser={user_id:'demo_admin',role:'client_readonly'};
  const writes=jest.spyOn(api,'patch');
  try{
    await act(async()=>root.render(<RecordDrawer open kind="tasks" record={task} clientId={task.client_id} onOpenChange={()=>{}}/>));
    const work=container.querySelector('[data-ticket-task="'+task.task_id+'"]');
    for(const label of ['Action title','Due date','Priority','Work status','Planned action','Actual resolution'])expect(work.querySelector('[aria-label="'+label+'"]').disabled).toBe(true);
    expect(button(work,'Save changes')).toBeUndefined();expect(button(work,'Complete work')).toBeUndefined();
    expect(writes).not.toHaveBeenCalled();
  }finally{writes.mockRestore();}
},30000);
