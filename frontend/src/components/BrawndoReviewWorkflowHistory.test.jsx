import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoReviewWorkflowHistory from './BrawndoReviewWorkflowHistory';

jest.mock('./RemediationTickets',()=>function Tickets({records,onOpen}){const {actionOrigin}=jest.requireActual('@/lib/brawndoActions');const origin=actionOrigin(records.findings[0],records,records.findings[0]);return <div data-testid="native-remediation-records">{records.findings.map(finding=><p key={finding.finding_id}>{finding.title}</p>)}{records.tasks.map(task=><p key={task.task_id}>{task.title}</p>)}{origin.target&&<button data-testid="native-origin" onClick={()=>onOpen({kind:origin.kind,record:origin.target,initialValues:origin.initialValues})}>{origin.detail}</button>}</div>;});
let root,container;
const record={review_id:'actual-review',client_id:'demo_brawndo',current_occurrence_id:'occ-current',period:'Q4 2026',due_date:'2026-12-31',recurrence:'quarterly',status:'in_progress',owner_id:'assignee'};
const completed={review_id:record.review_id,client_id:record.client_id,occurrence_id:'occ-old',period:'Q3 2026',due_date:'2026-09-30',completed_at:'2026-09-29T12:00:00Z',completed_by:'actual-completer',completed_by_name:'Actual completion actor',status:'completed',finding_count:2};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const render=async(props={})=>{const onSelect=jest.fn();await act(async()=>root.render(<BrawndoReviewWorkflowHistory record={record} history={[completed]} related={{findings:[],tasks:[]}} users={[{user_id:'assignee',name:'Assigned reviewer'}]} onSelect={onSelect} {...props}/>));return {onSelect};};

test('current and actual completed occurrences preserve actors, periods and native history selection',async()=>{
  const {onSelect}=await render();
  const rows=container.querySelectorAll('tbody tr');expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toContain('Q4 2026');expect(rows[0].textContent).toContain('In progress');expect(rows[0].cells[3].textContent).toBe('—');
  expect(rows[1].textContent).toContain('Actual completion actor');expect(rows[1].textContent).not.toContain('Assigned reviewer');
  expect(rows[1].querySelector('.is-critical').textContent).toBe('2 findings');
  await act(async()=>rows[1].querySelector('button').click());expect(onSelect).toHaveBeenCalledWith(completed);
});

test('only an explicit numeric zero earns the green No findings chip; missing counts are neutral',async()=>{
  await render({history:[{...completed,finding_count:0},{...completed,occurrence_id:'missing-count',period:'Q2 2026',finding_count:undefined}]});
  const rows=container.querySelectorAll('tbody tr');
  expect(rows[1].querySelector('.is-success').textContent).toBe('No findings');
  expect(rows[1].textContent).not.toContain('No issues');
  expect(rows[2].textContent).toContain('Finding count unavailable');expect(rows[2].querySelector('.is-success')).toBeNull();
});

test('history header counts actual completions separately from cancellations and shows native cadence',async()=>{
  await render({history:[completed,{...completed,occurrence_id:'cancelled',status:'cancelled'}]});
  expect(container.querySelector('h3').textContent).toContain('1 completed · 1 cancelled · quarterly');
  expect(container.querySelector('h3').textContent).not.toContain('2 completed');
});

test.each([{loading:true},{error:'Native history request failed'}])('loading/error never masquerades as empty history or a zero Finding conclusion: %j',async state=>{
  await render({...state,history:[],related:{}});
  expect(container.textContent).not.toContain('No completed occurrences yet');expect(container.textContent).not.toContain('No findings');
  expect(container.textContent).toContain(state.loading?'Loading…':'History unavailable');
  if(state.error)expect(container.querySelector('[role=alert]')).not.toBeNull();
});

test('Finding popovers contain only the selected occurrence and Actions for its actual Findings',async()=>{
  await render({related:{findings:[
    {client_id:record.client_id,finding_id:'old-finding',review_id:record.review_id,occurrence_id:'occ-old',title:'Selected occurrence finding'},
    {client_id:record.client_id,finding_id:'current-finding',review_id:record.review_id,occurrence_id:'occ-current',title:'Different occurrence finding'},
    {client_id:record.client_id,finding_id:'foreign-finding',review_id:'different-review',occurrence_id:'occ-old',title:'Different review finding'}
  ],tasks:[{client_id:record.client_id,task_id:'old-action',finding_id:'old-finding',title:'Selected corrective action'},{client_id:record.client_id,task_id:'other-action',finding_id:'current-finding',title:'Different corrective action'}]}});
  const old=container.querySelectorAll('tbody tr')[1];
  await act(async()=>old.querySelector('button.is-critical').click());
  const popover=document.querySelector('[data-testid=native-remediation-records]');
  expect(popover.textContent).toContain('Selected occurrence finding');expect(popover.textContent).toContain('Selected corrective action');
  expect(popover.textContent).not.toContain('Different occurrence finding');expect(popover.textContent).not.toContain('Different review finding');expect(popover.textContent).not.toContain('Different corrective action');
});

test('legacy untagged native Findings belong to the initial occurrence only',async()=>{
  const related={findings:[{client_id:record.client_id,finding_id:'legacy',review_id:record.review_id,title:'Legacy initial finding'}]};
  await render({record:{...record,current_occurrence_id:'occ_'+record.review_id},history:[],related});
  expect(container.querySelector('tbody tr').textContent).toContain('1 finding raised');
  await render({history:[],related});
  expect(container.querySelector('tbody tr').textContent).not.toContain('1 finding raised');
});

test('native historical origin retains current Review identity and the actual historical occurrence',async()=>{
  const onOpen=jest.fn();
  await render({onOpen,related:{findings:[{client_id:record.client_id,finding_id:'linked',review_id:record.review_id,occurrence_id:completed.occurrence_id,title:'Linked finding'}],tasks:[]}});
  await act(async()=>container.querySelectorAll('tbody tr')[1].querySelector('button.is-critical').click());
  const origin=document.querySelector('[data-testid=native-origin]');expect(origin.textContent).toBe('Q3 2026');
  await act(async()=>origin.click());
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({kind:'reviews',record:expect.objectContaining({review_id:record.review_id}),initialValues:{occurrence:completed}}));
});

test('missing historical counts retain loaded Finding and Action navigation without inventing a count',async()=>{
  const onOpen=jest.fn();
  await render({onOpen,history:[{...completed,finding_count:undefined}],related:{findings:[{client_id:record.client_id,finding_id:'linked',review_id:record.review_id,occurrence_id:completed.occurrence_id,title:'Actual historical finding'}],tasks:[{client_id:record.client_id,task_id:'linked-action',finding_id:'linked',title:'Actual historical action'}]}});
  const row=container.querySelectorAll('tbody tr')[1],trigger=row.querySelector('button.is-plain');
  expect(trigger.textContent).toBe('Finding count unavailable');
  await act(async()=>trigger.click());
  const links=document.querySelector('[data-testid=native-remediation-records]');
  expect(links.textContent).toContain('Actual historical finding');expect(links.textContent).toContain('Actual historical action');
  await act(async()=>links.querySelector('button').click());
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({kind:'reviews',initialValues:{occurrence:{...completed,finding_count:undefined}}}));
});

test('foreign-client Findings never enter current counts or occurrence links',async()=>{
  await render({history:[],related:{findings:[{client_id:'other',review_id:record.review_id,occurrence_id:record.current_occurrence_id,finding_id:'foreign'}]}});
  expect(container.querySelector('tbody tr').textContent).not.toContain('finding raised');
  expect(container.querySelector('button.is-critical')).toBeNull();
});
