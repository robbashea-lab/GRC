import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Workflow,{policyWorkflowApprovals,policyWorkflowDocumentUrl} from './BrawndoPolicyWorkflow';

jest.mock('./ui/sheet',()=>{const React=require('react');return {SheetTitle:React.forwardRef((props,ref)=><h2 ref={ref} {...props}/>)};});
jest.mock('./AssigneeSelect',()=>props=><button type="button" disabled={props.disabled} aria-label={props.label}>{props.value||'Unassigned'}</button>);

const subject={subject_id:'subject-2',title:'Risk Management Policy',version:'2.0',basis:{type:'external',reference:'Controlled policy register',document_version:'Revision 2.0'}};
const record={policy_id:'policy-1',client_id:'demo_brawndo',title:'Risk Management Policy',category:'Core Governance',owner_id:'owner-1',status:'approved',version:'2.0',approval_subject:subject,governance_context:{category:'organizational',rationale:'Recorded purpose',cadence_rationale:'Retained schedule reason'},decision_history:[{action:'external_approval_recorded',subject,reported_approver_id:'owner-1',reported_approved_at:'2026-02-01',recorded_at:'2026-02-02',provenance:'Verified metadata; not an in-app approval'}]};
const users=[{user_id:'owner-1',name:'Business Owner'}];
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test('document links require actual HTTP URLs and never manufacture a location from reference text',()=>{
  expect(policyWorkflowDocumentUrl(subject)).toBeNull();
  expect(policyWorkflowDocumentUrl({...subject,basis:{type:'external',reference:'javascript:alert(1)'}})).toBeNull();
  expect(policyWorkflowDocumentUrl({...subject,basis:{type:'external',reference:'https://example.com/policy-v2'}})).toBe('https://example.com/policy-v2');
  expect(policyWorkflowDocumentUrl({...subject,basis:{type:'evidence',evidence_id:'e1',reference:'https://example.com/unrelated'}})).toBeNull();
});

test('retained approvals come from actual approved snapshots rather than the pending document',()=>{
  const pending={...subject,subject_id:'subject-3',version:'2.1'};
  const value={...record,status:'in_review',approval_subject:pending,approval_history:[{action:'submitted',subject:pending,at:'2026-10-20'}]};
  expect(policyWorkflowApprovals(value)).toHaveLength(1);
  expect(policyWorkflowApprovals(value)[0].subject.version).toBe('2.0');
});

test('Purpose edits preserve the existing governance context instead of replacing it',async()=>{
  let draft;
  function Harness(){const [form,setForm]=React.useState({...record});draft=form;return <Workflow record={record} form={form} setForm={setForm} users={users} clientId="demo_brawndo" tab="overview" setTab={()=>{}} canWrite dirty={false}/>;}
  await act(async()=>root.render(<Harness/>));
  await act(async()=>{const input=container.querySelector('textarea[aria-label="Purpose"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Updated purpose');input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(draft.governance_context).toEqual({...record.governance_context,rationale:'Updated purpose'});
  await act(async()=>{const input=container.querySelector('textarea[aria-label="Purpose"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(draft.governance_context).toEqual({...record.governance_context,rationale:''});
  expect(container.querySelector('textarea[aria-label="Purpose"]').value).toBe('');
  expect(container.querySelector('.pw-purpose p').textContent).toBe('Purpose not recorded.');
});

test.each([
  ['framework purpose',{framework_purpose:'Retained framework purpose',summary:'Retained summary'},'Retained framework purpose'],
  ['summary',{summary:'Retained summary'},'Retained summary'],
])('clearing the rationale keeps its editor blank while the banner retains native %s fallback',async(_label,retained,expected)=>{
  const value={...record,...retained};
  function Harness(){const [form,setForm]=React.useState(value);return <Workflow record={value} form={form} setForm={setForm} users={users} clientId="demo_brawndo" tab="overview" setTab={()=>{}} canWrite/>;}
  await act(async()=>root.render(<Harness/>));
  await act(async()=>{const input=container.querySelector('textarea[aria-label="Purpose"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(container.querySelector('textarea[aria-label="Purpose"]').value).toBe('');
  expect(container.querySelector('.pw-purpose p').textContent).toBe(expected);
});

test('Document and approval uses the native command slot and truthful recorded metadata',async()=>{
  const approve=jest.fn();
  await act(async()=>root.render(<Workflow record={record} form={record} setForm={()=>{}} users={users} clientId="demo_brawndo" tab="evidence" setTab={()=>{}} canWrite nativeApproval={<button onClick={approve}>Native approve</button>}/>));
  const open=[...container.querySelectorAll('button')].find(button=>button.textContent==='Open document');
  expect(open.disabled).toBe(true);
  expect(container.textContent).toContain('Recorded externally');
  expect(container.textContent).toContain('Verified metadata; not an in-app approval');
  expect(container.querySelector('[aria-label="Approved by"]')).toBeNull();
  expect(container.querySelector('input[type="date"]')).toBeNull();
  await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Native approve').click());
  expect(approve).toHaveBeenCalledTimes(1);
});

test('legacy current approval does not turn a prior snapshot into the current approved document',async()=>{
  const legacy={...record,version:'3.0',approval_subject:null,approved_at:'2026-10-20'};
  await act(async()=>root.render(<Workflow record={legacy} form={legacy} setForm={()=>{}} users={users} clientId="demo_brawndo" tab="overview" setTab={()=>{}}/>));
  expect(container.textContent).toContain('Last approved · v2.0');
  expect(container.textContent).toContain('Current approval basis not recorded');
  expect(container.querySelector('.pw-strip .pw-label').textContent).toBe('Last approved');
});

test('current snapshot metadata is not borrowed from a different historical approval',async()=>{
  const current={...record,version:'3.0',approved_at:'2026-10-20',approval_subject:{...subject,subject_id:'subject-3',version:'3.0'}};
  await act(async()=>root.render(<Workflow record={current} form={current} setForm={()=>{}} users={users} clientId="demo_brawndo" tab="evidence" setTab={()=>{}}/>));
  expect(container.querySelector('.pw-document-meta').textContent).toContain('Oct 20, 2026');
  expect(container.querySelector('.pw-document-meta').textContent).not.toContain('Feb 1, 2026');
  expect(container.querySelector('.pw-document-meta').textContent).not.toContain('Recorded externally');
});

test('external Contact approvers use each recorded version snapshot across all approval summaries',async()=>{
  const current={...subject,named_approver:{contact_id:'business-contact',name:'Bill Lumbergh'}};
  const earlier={...current,subject_id:'subject-1',version:'1.0',named_approver:{contact_id:'business-contact',name:'Earlier recorded approver'}};
  const external={...record.decision_history[0],reported_approver_id:'business-contact'};
  const value={...record,approver_contact_id:'different-current-designation',approval_subject:current,decision_history:[
    {...external,subject:earlier,recorded_at:'2025-02-02',reported_approved_at:'2025-02-01'},
    {...external,subject:current},
  ]};
  const props={record:value,form:value,setForm:()=>{},users,clientId:'demo_brawndo',setTab:()=>{}};
  await act(async()=>root.render(<Workflow {...props} tab="overview"/>));
  expect(container.querySelector('.pw-strip small').textContent).toContain('by Bill Lumbergh');
  await act(async()=>root.render(<Workflow {...props} tab="evidence"/>));
  expect(container.querySelector('.pw-document-meta').children[1].textContent).toBe('ApproverBill Lumbergh');
  expect([...container.querySelectorAll('.pw-section tbody tr')].map(row=>[
    row.querySelectorAll('td')[0].textContent,row.querySelectorAll('td')[3].textContent,
  ])).toEqual([['v2.0','Bill Lumbergh'],['v1.0','Earlier recorded approver']]);
  expect(container.textContent).not.toContain('Former user');
});

test.each([
  ['distinct platform user','owner-1','Business Owner'],
  ['unresolved platform user','deleted-user','Former user'],
  ['unknown identifier','unknown-id','Former user'],
  ['missing reported identifier',null,'Designated business Contact'],
  ['legacy name snapshot','Legacy External Approver','Legacy External Approver'],
])('external summaries preserve the existing %s label',async(_case,reportedId,expected)=>{
  const approved={...subject,named_approver:{contact_id:'business-contact',name:'Designated business Contact'}};
  const value={...record,approval_subject:approved,decision_history:[
    {...record.decision_history[0],subject:approved,reported_approver_id:reportedId},
  ]};
  const props={record:value,form:value,setForm:()=>{},users,clientId:'demo_brawndo',setTab:()=>{}};
  await act(async()=>root.render(<Workflow {...props} tab="overview"/>));
  expect(container.querySelector('.pw-strip small').textContent).toContain('by '+expected);
  await act(async()=>root.render(<Workflow {...props} tab="evidence"/>));
  expect(container.querySelector('.pw-document-meta').children[1].textContent).toBe('Approver'+expected);
  expect(container.querySelector('.pw-section tbody tr').querySelectorAll('td')[3].textContent).toBe(expected);
});

test('in-app approval summaries retain the actual platform actor beside a named business Contact',async()=>{
  const approved={...subject,named_approver:{contact_id:'business-contact',name:'Business designee'}};
  const value={...record,approval_subject:approved,decision_history:[],approval_history:[
    {action:'approved',subject:approved,by:'owner-1',by_name:'Actual platform signer',at:'2026-02-01'},
  ]};
  const props={record:value,form:value,setForm:()=>{},users,clientId:'demo_brawndo',setTab:()=>{}};
  await act(async()=>root.render(<Workflow {...props} tab="overview"/>));
  expect(container.querySelector('.pw-strip small').textContent).toContain('by Actual platform signer');
  await act(async()=>root.render(<Workflow {...props} tab="evidence"/>));
  expect(container.querySelector('.pw-document-meta').children[1].textContent).toBe('ApproverActual platform signer');
  expect(container.querySelector('.pw-section tbody tr').querySelectorAll('td')[3].textContent).toBe('Actual platform signer');
});
