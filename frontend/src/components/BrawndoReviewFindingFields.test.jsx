import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoReviewFindingFields,{findingQuickDueDate} from './BrawndoReviewFindingFields';

jest.mock('./AssigneeSelect',()=>function MockAssignee({value,onChange,disabled}) {return <button type="button" aria-label="Owner" disabled={disabled} onClick={()=>onChange(null)}>{value||'Unassigned'}</button>;});
let root,container;
const draft={request_id:'retained-request',title:'Existing draft',description:'Finding description',severity:'medium',remediation_title:'Corrective action',owner_id:null,due_date:'',remediation_plan:'Action description'};
const record={review_id:'actual-review',title:'Actual review source',client_id:'a'};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});
const render=async(props={})=>{const onChange=jest.fn(),onCancel=jest.fn();await act(async()=>root.render(<BrawndoReviewFindingFields finding={draft} record={record} occurrenceId="actual-occurrence" clientId="a" onChange={onChange} onCancel={onCancel} {...props}/>));return {onChange,onCancel};};
const changeDate=(input,value)=>act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
});

test.each([
  [new Date(2026,11,25,23,30),14,'2027-01-08'],
  [new Date(2024,1,20,12),14,'2024-03-05'],
  [new Date(2026,2,7,23,30),14,'2026-03-21'],
  [new Date(2026,9,31,23,30),14,'2026-11-14']
])('date shortcuts follow local calendar days across year/leap/DST boundaries', (anchor,days,expected)=>{
  const before=anchor.getTime();expect(findingQuickDueDate(days,anchor)).toBe(expected);expect(anchor.getTime()).toBe(before);
});

test('default Medium, optional blank date and truthful draft context render without creating records',async()=>{
  const before=JSON.stringify(draft),{onChange}=await render();
  expect(container.querySelector('[data-severity=medium]').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('input[type=date]').required).toBe(false);
  expect(container.textContent).toContain('Pending draft: Medium');expect(container.textContent).toContain('Unassigned');expect(container.textContent).toContain('No due date');
  expect(container.textContent).toContain('Actual review source');expect(container.textContent).toContain('actual-occurrence');expect(container.textContent).toContain('Basis not recorded');
  expect(container.querySelector('form')).toBeNull();expect(onChange).not.toHaveBeenCalled();expect(JSON.stringify(draft)).toBe(before);
});

test('all severity buttons change only the native severity in the same draft',async()=>{
  const {onChange}=await render();
  for(const severity of ['low','medium','high','critical']){
    await act(async()=>container.querySelector(`[data-severity=${severity}]`).click());
    expect(onChange).toHaveBeenLastCalledWith({...draft,severity});
  }
});

test('all date shortcuts change only the optional date draft and preserve request identity',async()=>{
  jest.useFakeTimers().setSystemTime(new Date(2026,9,19,23,30));
  const {onChange}=await render();
  for(const [index,days] of [14,30,60,90].entries()){
    await act(async()=>container.querySelectorAll('.review-finding-quick-dates button')[index].click());
    expect(onChange).toHaveBeenLastCalledWith({...draft,due_date:findingQuickDueDate(days)});
  }
});

test('manual date entry and clearing retain the native optional field contract',async()=>{
  const {onChange}=await render({finding:{...draft,due_date:'2026-11-18'}}),input=container.querySelector('input[type=date]');
  await changeDate(input,'2027-01-02');
  expect(onChange).toHaveBeenLastCalledWith({...draft,due_date:'2027-01-02'});
  await changeDate(input,'');
  expect(onChange).toHaveBeenLastCalledWith({...draft,due_date:''});
});

test('Cancel delegates to native guard; busy disables controls without clearing the draft',async()=>{
  const {onCancel,onChange}=await render();
  await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Cancel').click());
  expect(onCancel).toHaveBeenCalledTimes(1);expect(onChange).not.toHaveBeenCalled();
  await render({busy:true});
  for(const control of container.querySelectorAll('input,textarea,button'))expect(control.disabled).toBe(true);
  expect(container.querySelector('[data-testid=finding-title]').value).toBe(draft.title);
});
