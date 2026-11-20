import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import ActionSourceChain from './ActionSourceChain';
import api from '@/lib/api';
import {completionHandoff,remediationOrigin} from '@/lib/remediation';
import {buildLegacyDemoStore,readStore,saveStore} from '../preview/store';
import {currentReviewCompletion} from '../testUtils/r4ReviewFixture';

let mockUser={user_id:'demo_admin',role:'super_admin'},mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:'demo',loading:false,error:''})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/commandTestAdapter').previewAdapter}),formatError:e=>e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
jest.mock('@/components/ui/sheet',()=>({Sheet:({open,children})=>open?<div>{children}</div>:null,SheetContent:({children,...props})=><section {...props}>{children}</section>,SheetHeader:({children})=><header>{children}</header>,SheetTitle:({children})=><h2>{children}</h2>}));

jest.mock('@/components/ui/dialog',()=>({Dialog:({open,children})=>open?<div>{children}</div>:null,DialogContent:({children,...props})=><section {...props}>{children}</section>,DialogTitle:({children})=><h2>{children}</h2>,DialogDescription:({children})=><p>{children}</p>}));
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
const setText=async(label,value)=>act(async()=>{const el=container.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
let root,container,client,review,finding,task,members;
const button=(text)=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent===text);
const click=async text=>act(async()=>button(text).click());
const scopedActor=(user_id,client_id)=>({user_id,name:'Synthetic '+user_id,email:user_id+'@example.invalid',role:'platform_admin',status:'active',client_ids:[client_id]});
async function asExternalActor(actor,perform){
  const db=readStore(),original=db.user;db.users.push(actor);db.user=actor;saveStore(db);
  try{return await perform();}finally{const current=readStore();current.user=original;saveStore(current);}
}
beforeEach(async()=>{
  mockUser={user_id:'demo_admin',role:'super_admin'};
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  await api.post('/demo/enter');client=(await api.post('/clients',{name:'Phase 2 component client'})).data;
  mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false,error:''};
  review=(await api.post('/reviews',{client_id:client.client_id,title:'Policy Review and Approval',review_type:'policy',recurrence:'quarterly',due_date:'2026-09-30'})).data;
  finding=(await api.post(`/reviews/${review.review_id}/create-finding`,{occurrence_id:review.current_occurrence_id,request_id:'single',title:'NO ISP',description:'Policy is not documented.',remediation_title:'MAKE AN ISP'})).data;
  task=(await api.get('/tasks',{params:{client_id:client.client_id}})).data[0];
  members=(await api.get(`/clients/${client.client_id}/members`)).data;
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test('Review groups current statuses, refreshes transitions and preserves Q3 origin after Q4 advance',async()=>{
  await act(async()=>root.render(<RecordDrawer open kind="reviews" record={review} clientId={client.client_id} onOpenChange={()=>{}}/>));
  await click('Related');
  expect(container.querySelectorAll('[data-ticket-id]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-ticket-id]')).toHaveLength(1);
  expect(container.textContent).toContain('Q3 2026');
  await api.patch('/tasks/'+task.task_id,{status:'in_progress'});
  await click('Related');
  expect(container.querySelector('[data-ticket-id]').textContent).toContain('in progress');
  const completion=await currentReviewCompletion(api,review.review_id,{expectedOccurrenceId:review.current_occurrence_id,
    resultForStep:step=>({step_id:step.step_id,result:'N/A',reason:'This synthetic status/occurrence walkthrough does not perform the external policy or operational assessment in this question.'}),
    supportingReference:'Native Finding '+finding.finding_id+' records the missing policy and its corrective Action.'});
  completion.outcome='Exceptions noted';
  const next=(await api.post(`/reviews/${review.review_id}/complete`,completion)).data.review;
  await act(async()=>root.render(<RecordDrawer open kind="reviews" record={next} clientId={client.client_id} onOpenChange={()=>{}}/>));
  await click('Related');expect(container.textContent).toContain('Q3 2026');
  await api.patch('/tasks/'+task.task_id,{status:'done'});await click('Related');
  expect(container.querySelector('[data-ticket-id]').textContent).toContain('pending validation');
  // This is another actor's native decision followed by an explicit Related refresh.
  await asExternalActor(scopedActor('related-validator',client.client_id),async()=>{
    const current=(await api.get('/findings/'+finding.finding_id)).data;
    await api.post(`/findings/${finding.finding_id}/validate`,{request_id:'related-independent-validation',expected_updated_at:current.updated_at,rationale:'Policy approval verified'});
  });await click('Related');
  expect(container.querySelectorAll('[data-ticket-id]')).toHaveLength(0);
  await click('Show completed / closed records (1)');
  expect(container.querySelector('[data-ticket-id]').textContent).toContain('completed');
  expect(container.textContent).toContain('Statuses below are current');
});

test('Finding-linked completion and validation remain in the same stable ticket',async()=>{
  const onSaved=jest.fn(),onClose=jest.fn();
  await act(async()=>root.render(<RecordDrawer open kind="tasks" record={task} clientId={client.client_id} onSaved={onSaved} onOpenChange={onClose}/>));
  expect(container.textContent).toContain('Policy is not documented.');
  expect(container.textContent).toContain('Q3 2026');
  expect(container.querySelector('h2').textContent).toBe('MAKE AN ISP');
  const workerTicket=container.querySelector('[data-testid="remediation-ticket-drawer"]');
  await click('Complete work');
  expect(container.textContent).toContain('Pending validation');
  expect(onClose).not.toHaveBeenCalled();expect(onSaved).toHaveBeenCalled();
  expect(container.querySelector('[data-testid="remediation-ticket-drawer"]')).toBe(workerTicket);
  expect(button('Validate and complete').disabled).toBe(true);
  const submitted=(await api.get('/tasks/'+task.task_id)).data;
  expect(submitted.completed_by).toBe(mockUser.user_id);
  // Independent validation starts a fresh authenticated view, never an auth-switched draft.
  await act(async()=>root.render(null));expect(workerTicket.isConnected).toBe(false);
  const validator=scopedActor('ticket-validator',client.client_id),db=readStore();db.users.push(validator);db.user=validator;saveStore(db);mockUser=validator;
  const onValidatedSaved=jest.fn();
  await act(async()=>root.render(<RecordDrawer open kind="tasks" record={submitted} clientId={client.client_id} onSaved={onValidatedSaved} onOpenChange={onClose}/>));
  const validatorTicket=container.querySelector('[data-testid="remediation-ticket-drawer"]');
  await setText('Validation rationale','Policy approval verified');await click('Validate and complete');
  expect((await api.get('/findings/'+finding.finding_id)).data.status).toBe('closed');
  expect((await api.get('/findings/'+finding.finding_id)).data.validated_by).toBe(validator.user_id);
  expect(container.querySelector('[data-testid="remediation-ticket-drawer"]')).toBe(validatorTicket);
  expect(onValidatedSaved).toHaveBeenCalled();expect(onClose).not.toHaveBeenCalled();
  expect(container.querySelectorAll('[data-testid="remediation-ticket-drawer"]')).toHaveLength(1);
  expect(container.textContent).toContain('finding:'+finding.finding_id);
});

test('multiple Actions remain in one ticket and outstanding work prevents validation',async()=>{
  const second=(await api.post('/tasks',{client_id:client.client_id,title:'Second action',source_type:'finding',source_id:finding.finding_id})).data;
  await api.post('/tasks',{client_id:client.client_id,title:'Third action',source_type:'finding',source_id:finding.finding_id});
  await act(async()=>root.render(<RecordDrawer open kind="tasks" record={second} clientId={client.client_id} onOpenChange={()=>{}}/>));
  expect(container.querySelectorAll('[aria-label="Work status"]')).toHaveLength(3);
  await act(async()=>[...container.querySelector('[aria-label="Second action"]').querySelectorAll('button')].find(b=>b.textContent==='Complete work').click());
  expect(button('Validate and complete')).toBeUndefined();
  expect(container.textContent).toContain('Complete outstanding work');
  await act(async()=>root.render(<RecordDrawer open kind="reviews" record={review} clientId={client.client_id} onOpenChange={()=>{}}/>));await click('Related');
  expect(container.querySelectorAll('[data-ticket-id]')).toHaveLength(1);
  expect((await api.get('/tasks',{params:{client_id:client.client_id}})).data).toHaveLength(3);
});

test('seeded framework ticket validates without changing its control conclusion',async()=>{
  // This assertion concerns the retained v1 gap and its exact native ticket.
  saveStore(buildLegacyDemoStore(),{resetFiles:true});await api.post('/demo/enter');
  const seeded=(await api.get('/tasks',{params:{client_id:'demo_brawndo'}})).data.find(t=>t.task_id==='demo_brawndo_cis_action_1.1');
  await asExternalActor(scopedActor('framework-worker','demo_brawndo'),async()=>{
    await api.patch('/tasks/'+seeded.task_id,{status:'done',expected_updated_at:seeded.updated_at});
  });
  const seededClients=(await api.get('/clients')).data,seededClient=seededClients.find(row=>row.client_id==='demo_brawndo');
  expect(seededClient).toBeDefined();
  mockOrg={currentClientId:seededClient.client_id,currentClient:seededClient,clients:seededClients,loading:false,error:''};
  await act(async()=>root.render(<RecordDrawer open kind="tasks" record={seeded} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
  expect(container.textContent).not.toContain('Primary Action unavailable');
  expect(container.textContent).toContain('Pending validation');
  expect((await api.get('/findings/'+seeded.finding_id)).data.status).toBe('remediated');
  await setText('Validation rationale','Synthetic validation of the corrective work');await click('Validate and complete');
  expect(container.textContent).toContain('Ticket completed. Validation saved.');
  const workspace=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data;
  expect(workspace.assessments.find(a=>a.definition_id==='1.1').status).toBe('needs_attention');
});

test('standalone completion stays in the ticket without creating a Finding',async()=>{
  const manual=(await api.post('/tasks',{client_id:client.client_id,title:'Manual work',source_type:'manual'})).data,onClose=jest.fn();
  await act(async()=>root.render(<RecordDrawer open kind="tasks" record={manual} clientId={client.client_id} onOpenChange={onClose}/>));
  await click('Complete work');expect(onClose).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Completed');expect(button('Validate and complete')).toBeUndefined();
  expect((await api.get('/findings',{params:{client_id:client.client_id}})).data).toHaveLength(1);
});

test.each(['risk','vendor'])('%s context stays separate from the Finding source chain',async kind=>{
  const source={client_id:'a',[kind+'_id']:'s',title:'Source '+kind,name:'Source '+kind},onOpen=jest.fn();
  await act(async()=>root.render(<ActionSourceChain record={{client_id:'a',source_type:kind,source_id:'s',title:'Work'}} related={{[kind+'s']:[source]}} onOpen={onOpen}/>));
  expect(container.textContent).not.toContain('Finding');await click('Source '+kind);
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({kind:kind+'s',record:source}));
});

test('cross-client sources and missing historical periods are not guessed',async()=>{
  await act(async()=>root.render(<ActionSourceChain record={task} related={{findings:[{...finding,client_id:'other'}]}} onOpen={jest.fn()}/>));
  expect(container.textContent).not.toContain('NO ISP');
  expect(remediationOrigin({...task,occurrence_id:'missing'},review)).toBe('Not recorded');
  expect(completionHandoff(null)).toContain('could not be loaded');
});

test('assessment source opens through the authorized Related response',async()=>{
  const assessment={assessment_id:'assessment-phase2',client_id:client.client_id,title:'Internal assessment',status:'completed'};
  const sourceTask={...task,finding_id:null,review_id:null,source_type:'audit',source_id:assessment.assessment_id,assessment_id:assessment.assessment_id};
  const originalGet=api.get.bind(api);
  const get=jest.spyOn(api,'get').mockImplementation((path,options)=>path==='/tasks'?Promise.resolve({data:[sourceTask]}):path==='/findings'?Promise.resolve({data:[]}):path==='/onboarding/state'?Promise.resolve({data:{assessments:[assessment]}}):path==='/related'?Promise.resolve({data:{assessments:[assessment]}}):originalGet(path,options));
  try {
    await act(async()=>root.render(<RecordDrawer open kind="tasks" record={sourceTask} clientId={client.client_id} onOpenChange={()=>{}}/>));
    await click('Internal assessment');
    expect(button('Close assessment')).toBeTruthy();
    expect(get.mock.calls.some(([path])=>path.startsWith('/assessments/'))).toBe(false);
  } finally {get.mockRestore();}
});
