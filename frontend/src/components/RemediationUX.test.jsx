import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import ActionSourceChain from './ActionSourceChain';
import api from '@/lib/api';
import {completionHandoff,remediationOrigin} from '@/lib/remediation';

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'demo_admin',role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),formatError:e=>e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
jest.mock('@/components/ui/sheet',()=>({Sheet:({open,children})=>open?<div>{children}</div>:null,SheetContent:({children,...props})=><section {...props}>{children}</section>,SheetHeader:({children})=><header>{children}</header>,SheetTitle:({children})=><h2>{children}</h2>}));

let root,container,client,review,finding,task,members;
const button=(text)=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent===text);
const click=async text=>act(async()=>button(text).click());
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  await api.post('/demo/enter');client=(await api.post('/clients',{name:'Phase 2 component client'})).data;
  review=(await api.post('/reviews',{client_id:client.client_id,title:'Policy Review and Approval',review_type:'policy',recurrence:'quarterly',due_date:'2026-09-30'})).data;
  finding=(await api.post(`/reviews/${review.review_id}/create-finding`,{occurrence_id:review.current_occurrence_id,request_id:'single',title:'NO ISP',description:'Policy is not documented.',remediation_title:'MAKE AN ISP'})).data;
  task=(await api.get('/tasks',{params:{client_id:client.client_id}})).data[0];
  members=(await api.get(`/clients/${client.client_id}/members`)).data;
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test('Review groups current statuses, refreshes transitions and preserves Q3 origin after Q4 advance',async()=>{
  await act(async()=>root.render(<RecordDrawer open kind="reviews" record={review} clientId={client.client_id} onOpenChange={()=>{}}/>));
  await click('Related');
  expect(container.querySelectorAll('[data-testid="review-remediation-group"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-testid="review-corrective-action"]')).toHaveLength(1);
  expect(container.textContent).toContain('Origin: Q3 2026');
  await api.patch('/tasks/'+task.task_id,{status:'in_progress'});
  await click('Related');
  expect(container.querySelector('[data-testid="review-corrective-action"] [data-status="in_progress"]')).toBeTruthy();
  const next=(await api.post(`/reviews/${review.review_id}/complete`,{occurrence_id:review.current_occurrence_id})).data.review;
  await act(async()=>root.render(<RecordDrawer open kind="reviews" record={next} clientId={client.client_id} onOpenChange={()=>{}}/>));
  await click('Related');expect(container.textContent).toContain('Origin: Q3 2026');
  await api.patch('/tasks/'+task.task_id,{status:'done'});await click('Related');
  expect(container.querySelector('[data-status="remediated"]')).toBeTruthy();
  expect(container.querySelector('[data-status="completed"]')).toBeTruthy();
  expect(container.textContent).toContain('Current Finding Status');
  await api.post(`/findings/${finding.finding_id}/validate`,{rationale:'Policy approval verified'});await click('Related');
  expect(container.querySelectorAll('[data-testid="review-remediation-group"]')).toHaveLength(0);
  await click('Show completed / closed records (1)');
  expect(container.querySelector('[data-status="closed"]')).toBeTruthy();
  expect(container.textContent).toContain('Statuses below are current');
});

test('Finding-linked completion acknowledges current readiness without forcing navigation',async()=>{
  const onSaved=jest.fn(),onClose=jest.fn();
  await act(async()=>root.render(<RecordDrawer open kind="tasks" record={task} clientId={client.client_id} users={members} onSaved={onSaved} onOpenChange={onClose}/>));
  const chain=container.querySelector('[aria-label="Action context"]');
  expect(chain.textContent).toContain('NO ISP');expect(chain.textContent).toContain('Origin: Q3 2026');
  expect(chain.textContent.match(/Policy Review and Approval/g)).toHaveLength(1);
  await click('Complete Action Item');
  expect(container.querySelector('[data-testid="action-completion-handoff"]').textContent).toContain('is now awaiting validation');
  expect(onClose).not.toHaveBeenCalled();expect(onSaved).toHaveBeenCalled();
  await click('View Finding');
  expect(container.querySelector('[data-testid="finding-validate"]')).toBeTruthy();
  await click('Validate and close');
  const context=container.querySelector('[aria-label="Validation context"]');
  expect(context.textContent).toContain('Policy is not documented.');
  expect(context.textContent).toContain('MAKE AN ISP');expect(context.textContent).toContain('Completed');expect(context.textContent).toContain('By ');
});

test('multiple Actions keep one group and unfinished work prevents a false validation handoff',async()=>{
  const second=(await api.post('/tasks',{client_id:client.client_id,title:'Second action',source_type:'finding',source_id:finding.finding_id})).data;
  await api.post('/tasks',{client_id:client.client_id,title:'Third action',source_type:'finding',source_id:finding.finding_id});
  await act(async()=>root.render(<RecordDrawer open kind="tasks" record={second} clientId={client.client_id} users={members} onOpenChange={()=>{}}/>));
  await click('Complete Action Item');expect(container.textContent).toContain('other corrective work is still outstanding');
  await act(async()=>root.render(<RecordDrawer open kind="reviews" record={review} clientId={client.client_id} onOpenChange={()=>{}}/>));await click('Related');
  expect(container.querySelectorAll('[data-testid="review-remediation-group"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-testid="review-corrective-action"]')).toHaveLength(3);
});

test('standalone completion closes normally without Finding handoff or creation',async()=>{
  const manual=(await api.post('/tasks',{client_id:client.client_id,title:'Manual work',source_type:'manual'})).data,onClose=jest.fn();
  await act(async()=>root.render(<RecordDrawer open kind="tasks" record={manual} clientId={client.client_id} onOpenChange={onClose}/>));
  await click('Complete Action Item');expect(onClose).toHaveBeenCalledWith(false);
  expect(container.querySelector('[data-testid="action-completion-handoff"]')).toBeNull();
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
  const get=jest.spyOn(api,'get').mockImplementation((path,options)=>path==='/related'?Promise.resolve({data:{assessments:[assessment]}}):originalGet(path,options));
  try {
    await act(async()=>root.render(<RecordDrawer open kind="tasks" record={sourceTask} clientId={client.client_id} onOpenChange={()=>{}}/>));
    await click('Internal assessment');
    expect(button('Close assessment')).toBeTruthy();
    expect(get.mock.calls.some(([path])=>path.startsWith('/assessments/'))).toBe(false);
  } finally {get.mockRestore();}
});
