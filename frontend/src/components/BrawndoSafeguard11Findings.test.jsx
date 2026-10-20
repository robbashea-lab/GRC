import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoSafeguard11Findings from './BrawndoSafeguard11Findings';

let container,root,onOpen;
const finding={finding_id:'finding-a',client_id:'demo_brawndo',title:'Actual deficiency',description:'Recorded issue',severity:'medium',status:'open',framework_assessment_id:'assessment-a',created_at:'2026-10-19T01:00:00+05:00'};
const action={task_id:'task-a',finding_id:'finding-a',client_id:'demo_brawndo',title:'Actual corrective action',status:'in_progress',assignee_id:'owner-a',due_date:'2026-12-31'};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);onOpen=jest.fn();});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function render(records,disabled=false){await act(async()=>root.render(<BrawndoSafeguard11Findings records={records} clientId="demo_brawndo" users={[{user_id:'owner-a',name:'Actual owner'}]} onOpen={onOpen} disabled={disabled}/>));}
const button=text=>[...container.querySelectorAll('button')].find(node=>node.textContent===text);

test('opens actual Finding and primary Action identities and displays literal dates',async()=>{
  await render({findings:[finding],tasks:[action],framework_assessments:[{client_id:'demo_brawndo',framework_assessment_id:'assessment-a',framework_key:'cis-ig1',definition_id:'1.1'}]});
  expect(container.textContent).toContain('Raised Oct 19, 2026');
  expect(container.textContent).toContain('Due Dec 31, 2026');
  expect(container.textContent).toContain('Actual owner');
  expect(container.textContent).toContain('In Progress');
  expect(container.querySelector('.sg11-finding-meta .sg11-severity').textContent).toBe('Medium finding');
  expect(container.querySelector('.sg11-action-title').textContent).toBe('Action: Actual corrective action');
  expect(container.querySelector('.sg11-finding-action .sg11-chip').textContent).toBe('In Progress');
  expect(container.querySelector('header').textContent).not.toContain('Source:');
  expect(container.querySelector('.sg11-finding-details').textContent).toContain('Source: cis-ig1 · 1.1');
  await act(async()=>button('Actual deficiency').click());
  expect(onOpen).toHaveBeenLastCalledWith({kind:'findings',record:finding});
  await act(async()=>button('Open action item').click());
  expect(onOpen).toHaveBeenLastCalledWith({kind:'tasks',record:action});
});

test('filters other-client Findings/Actions and never selects an arbitrary primary',async()=>{
  await render({findings:[finding,{...finding,client_id:'other',finding_id:'foreign',title:'Foreign issue'}],tasks:[action,{...action,task_id:'task-b'},{...action,client_id:'other',task_id:'foreign-task'}]});
  expect(container.querySelectorAll('[data-ticket-id]')).toHaveLength(1);
  expect(container.textContent).not.toContain('Foreign issue');
  expect(container.textContent).toContain('Multiple Actions — primary not recorded');
  expect(button('Open action item')).toBeUndefined();
  await act(async()=>button('Actual deficiency').click());
  expect(onOpen).toHaveBeenCalledWith({kind:'findings',record:finding});
});

test('missing primary and absent dates stay honest; disabled native opening cannot navigate',async()=>{
  await render({findings:[{...finding,primary_task_id:'missing',created_at:null}],tasks:[{...action,due_date:null}]});
  expect(container.textContent).toContain('Primary Action unavailable');
  expect(container.textContent).not.toContain('Raised');
  expect(container.textContent).not.toContain('Due');
  expect(button('Open action item')).toBeUndefined();
  await render({findings:[finding],tasks:[{...action,due_date:null}]},true);
  expect(container.textContent).not.toContain('Due');
  await act(async()=>button('Open action item').click());
  expect(onOpen).not.toHaveBeenCalled();
});

test('an explicit native primary wins among multiple Actions; an unlinked task is not a Finding card',async()=>{
  const primary={...action,task_id:'task-primary',title:'Explicit primary'};
  await render({findings:[{...finding,primary_task_id:primary.task_id}],tasks:[action,primary,{...action,task_id:'unlinked',finding_id:null}]});
  expect(container.querySelectorAll('[data-ticket-id]')).toHaveLength(1);
  expect(container.textContent).toContain('Explicit primary');
  await act(async()=>button('Open action item').click());
  expect(onOpen).toHaveBeenCalledWith({kind:'tasks',record:primary});
});


test('overdue treatment reuses native Action rules and preserves the actual due date',async()=>{
  const late={...action,due_date:'2000-01-01'};
  await render({findings:[finding],tasks:[late]});
  const chip=container.querySelector('.sg11-finding-action .sg11-chip.crit');
  expect(chip.textContent).toBe('Overdue · Due Jan 1, 2000');
  for(const status of ['done','cancelled']){
    await render({findings:[finding],tasks:[{...late,status}]});
    expect(container.querySelector('.sg11-finding-action .sg11-chip.crit')).toBeNull();
    expect(container.textContent).toContain('Due Jan 1, 2000');
  }
  await render({findings:[finding],tasks:[{...action,due_date:'invalid'}]});
  expect(container.querySelector('.sg11-finding-action .sg11-chip.crit')).toBeNull();
  expect(container.textContent).not.toContain('Overdue');
});
