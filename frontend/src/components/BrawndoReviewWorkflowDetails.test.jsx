import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import BrawndoReviewWorkflowDetails,{reviewDueHelp} from './BrawndoReviewWorkflowDetails';
import {resolveReviewPresentationSource} from '@/lib/reviewPresentationSource';
import {activePlans,reviewDriver} from '@/lib/frameworks';

jest.mock('./AssigneeSelect',()=>function Assignee({disabled}){return <button type="button" aria-label="Assigned reviewer" disabled={disabled}>Native eligible owner picker</button>;});
const client={client_id:'demo_brawndo'};
const record={client_id:client.client_id,title:'Saved review',review_type:'access',recurrence:'quarterly',due_date:'2026-10-31',notes:'Existing occurrence notes'};
const sourceFor=review=>resolveReviewPresentationSource({record:review,client});
const requiredRecord=()=>({...record,framework_key:'cis-ig1',framework_version:'8.1',framework_plan_key:'account-authorization',framework_drivers:[reviewDriver('cis-ig1',activePlans('cis-ig1').find(plan=>plan.key==='account-authorization'))]});
const picker=label=><span>{label}</span>;

test('custom-day edits retain numeric draft values for immediate source comparison',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.appendChild(container);
  const root=createRoot(container),onChange=jest.fn(),review={...requiredRecord(),recurrence:'custom',custom_recurrence_days:45};
  try{
    await act(async()=>root.render(<BrawndoReviewWorkflowDetails record={review} source={sourceFor(review)} picker={picker} admin onChange={onChange}/>));
    const input=container.querySelector('[data-testid=field-custom_recurrence_days]');
    for(const [value,expected,state] of [['90',90,'meets'],['91',91,'below'],['','','not_comparable']]){
      await act(async()=>{
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
        input.dispatchEvent(new Event('input',{bubbles:true}));
      });
      expect(onChange).toHaveBeenLastCalledWith('custom_recurrence_days',expected);
      expect(sourceFor({...review,custom_recurrence_days:expected}).comparison.state).toBe(state);
    }
  }finally{await act(async()=>root.unmount());container.remove();}
});

test.each([
  [{due_date:'2026-10-19'},new Date(2026,9,19,23,59),'Due today','warning'],
  [{due_date:'2026-11-02'},new Date(2026,9,19,12),'Due in 14 days','warning'],
  [{due_date:'2026-11-03'},new Date(2026,9,19,12),'Due in 15 days','muted'],
  [{due_date:'2026-10-18'},new Date(2026,9,19,12),'Overdue by 1 day','error'],
  [{due_date:'2026-10-05'},new Date(2026,9,19,12),'Overdue by 14 days','error'],
  [{due_date:'2024-03-01'},new Date(2024,1,28,23,30),'Due in 2 days','warning'],
  [{due_date:'2026-03-09'},new Date(2026,2,7,23,30),'Due in 2 days','warning'],
  [{due_date:'2026-11-02'},new Date(2026,9,31,23,30),'Due in 2 days','warning'],
  [{due_date:null},new Date(2026,9,19),'Not scheduled','muted'],
  [{due_date:''},new Date(2026,9,19),'Not scheduled','muted']
])('due helper uses the actual local calendar and scheduling state: %j',(review,now,text,tone)=>{
  expect(reviewDueHelp(review,now)).toEqual({text,tone});
});

test('required source helper follows the actual source and configured frequency',()=>{
  const review=requiredRecord();
  const aligned=renderToStaticMarkup(<BrawndoReviewWorkflowDetails record={review} source={sourceFor(review)} picker={picker}/>);
  expect(aligned).toContain('Meets CIS 5.1: quarterly or more often.');expect(aligned).toContain('is-success');
  const below={...review,recurrence:'annual'};
  const warning=renderToStaticMarkup(<BrawndoReviewWorkflowDetails record={below} source={sourceFor(below)} picker={picker}/>);
  expect(warning).toContain('CIS 5.1 requires quarterly or more often.');expect(warning).toContain('is-warning');
});

test('organization-defined and unresolved sources do not acquire a required safeguard identity',()=>{
  const organizational={...record,governance_context:{category:'organizational',cadence_source:'organization_defined',rationale:'Saved company decision'}};
  const org=renderToStaticMarkup(<BrawndoReviewWorkflowDetails record={organizational} source={sourceFor(organizational)} picker={picker}/>);
  expect(org).toContain('Org-defined');expect(org).not.toContain('Meets CIS');
  const unknown=renderToStaticMarkup(<BrawndoReviewWorkflowDetails record={record} source={sourceFor(record)} picker={picker}/>);
  expect(unknown).toContain('Unresolved');expect(unknown).toContain('Source frequency not recorded.');expect(unknown).not.toContain('No framework minimum');
});

test('a recorded contractual basis is not described as a management-selected cadence',()=>{
  const review={...record,governance_context:{category:'contractual',rationale:'Recorded contract'}};
  const html=renderToStaticMarkup(<BrawndoReviewWorkflowDetails record={review} source={sourceFor(review)} picker={picker}/>);
  expect(html).toContain('Contractual requirement');expect(html).not.toContain('Set by Brawndo.');
});

test('native configuration permissions and read-only source navigation remain distinct from writable notes',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.appendChild(container);
  const root=createRoot(container),onOrigin=jest.fn();
  try{
    await act(async()=>root.render(<BrawndoReviewWorkflowDetails record={record} source={sourceFor(record)} picker={picker} admin={false} writable onOrigin={onOrigin}/>));
    expect(container.querySelector('[data-testid=field-title]').disabled).toBe(true);
    expect(container.querySelector('[data-testid=field-notes]').disabled).toBe(false);
    await act(async()=>container.querySelector('.review-workflow-origin').click());expect(onOrigin).toHaveBeenCalledTimes(1);
    await act(async()=>root.render(<BrawndoReviewWorkflowDetails record={record} source={sourceFor(record)} picker={picker} admin writable frozen/>));
    for(const field of container.querySelectorAll('input,textarea'))expect(field.disabled).toBe(true);
  }finally{await act(async()=>root.unmount());container.remove();}
});
