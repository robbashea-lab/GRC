import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoSafeguard11FindingFields from './BrawndoSafeguard11FindingFields';

jest.mock('./AssigneeSelect',()=>function Assignee({value,onChange,disabled}){
  return <button type="button" aria-label="Finding owner" disabled={disabled} onClick={()=>onChange(null)}>{value||'Unassigned'}</button>;
});

let root,container,props;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');root=createRoot(container);
  props={finding:{request_id:'request-original',item_id:'item-original',title:'Inventory gap',description:'Observed gap',severity:'medium',owner_id:'u1',due_date:'',remediation_title:'Reconcile inventory'},onChange:jest.fn(),record:{client_id:'demo_brawndo',framework_key:'cis-ig1',framework_version:'8.1',definition_id:'1.1',framework_assessment_id:'a1'},current:{client_id:'demo_brawndo',framework_key:'cis-ig1',framework_version:'8.1',definition_id:'1.1',framework_assessment_id:'a1',owner_id:'u1'},definition:{id:'1.1',title:'Native requirement'},users:[{user_id:'u1',name:'Recorded owner'}],disabled:false,clientId:'demo_brawndo',onCancel:jest.fn(),onSubmit:jest.fn()};
});
afterEach(()=>{act(()=>root.unmount());jest.useRealTimers();});
const render=()=>act(()=>root.render(<BrawndoSafeguard11FindingFields {...props}/>));
const button=text=>Array.from(container.querySelectorAll('button')).find(element=>element.textContent===text);
const change=(element,value)=>act(()=>{
  const prototype=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);
  element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));
});

test('native field limits, optional date and nullable owner remain distinct from request identity',()=>{
  render();
  for(const name of ['Finding title','Corrective action']){
    const input=container.querySelector(`[aria-label="${name}"]`);
    expect(input.required).toBe(true);expect(input.maxLength).toBe(500);
  }
  expect(container.querySelector('textarea').maxLength).toBe(20000);
  const due=container.querySelector('[type="date"]');expect(due.required).toBe(false);expect(due.value).toBe('');
  act(()=>container.querySelector('[aria-label="Finding owner"]').click());
  expect(props.onChange).toHaveBeenLastCalledWith('owner_id','');
  expect(props.finding.request_id).toBe('request-original');expect(props.finding.item_id).toBe('item-original');
  expect(props.finding.owner_id).toBe('u1');expect(props.onSubmit).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Recorded owner');expect(container.textContent).toContain('Safeguard 1.1');
  expect(container.querySelector('.sg11-finding-context [title="Native requirement"]')).not.toBeNull();
});

test('shortcuts update only the local date across year rollover; clearing and severity preserve controller ownership',()=>{
  jest.useFakeTimers();jest.setSystemTime(new Date(2026,11,25,12));render();
  for(const [label,date] of [['2 weeks','2027-01-08'],['30 days','2027-01-24'],['60 days','2027-02-23'],['90 days','2027-03-25']]){
    act(()=>button(label).click());expect(props.onChange).toHaveBeenLastCalledWith('due_date',date);
  }
  props.finding={...props.finding,due_date:'2027-01-08'};render();
  change(container.querySelector('[type="date"]'),'');expect(props.onChange).toHaveBeenLastCalledWith('due_date','');
  act(()=>container.querySelector('[data-severity="critical"]').click());expect(props.onChange).toHaveBeenLastCalledWith('severity','critical');
  expect(props.onSubmit).not.toHaveBeenCalled();expect(props.onCancel).not.toHaveBeenCalled();
  expect(props.finding.severity).toBe('medium');expect(props.finding.request_id).toBe('request-original');
});

test('submit and cancel delegate without payload construction; blank optional fields do not block submit',()=>{
  props.finding={...props.finding,owner_id:null,due_date:null};render();
  expect(container.textContent).toContain('Unassigned');
  act(()=>button('Save finding and action').click());expect(props.onSubmit).toHaveBeenCalledTimes(1);
  expect(props.onSubmit.mock.calls[0]).toHaveLength(1); // Native React event, not a mapped payload.
  act(()=>button('Cancel').click());expect(props.onCancel).toHaveBeenCalledTimes(1);
  expect(container.querySelector('form')).toBeNull();expect(props.onChange).not.toHaveBeenCalled();
});

test('required missing values, disabled context and mismatched source cannot submit',()=>{
  props.finding={...props.finding,title:'  '};render();expect(button('Save finding and action').disabled).toBe(true);
  props.finding={...props.finding,title:'Gap'};props.disabled=true;render();
  expect(container.querySelector('fieldset').disabled).toBe(true);expect(button('Cancel').disabled).toBe(true);
  props.disabled=false;props.current={client_id:'other'};render();
  expect(button('Save finding and action').disabled).toBe(true);expect(container.textContent).toContain('Assessment context unavailable');
});

test.each([
  ['framework_assessment_id','other-assessment'],['framework_key','other-framework'],
  ['framework_version','8.0'],['definition_id','1.2'],['client_id','other-client'],
])('source join rejects a changed %s without emitting a command',(key,value)=>{
  props.current={...props.current,[key]:value};render();
  expect(button('Save finding and action').disabled).toBe(true);
  expect(container.textContent).not.toContain('From CIS IG1 assessment');
  expect(props.onSubmit).not.toHaveBeenCalled();expect(props.onChange).not.toHaveBeenCalled();
});

test('summary does not guarantee an inherited historical owner who may no longer be eligible',()=>{
  render();
  const summary=()=>container.querySelector('.sg11-finding-summary').textContent;
  expect(summary()).toContain('Recorded owner (if eligible; otherwise unassigned)');
  props.users.push({user_id:'u2',name:'Selected owner'});props.finding={...props.finding,owner_id:'u2'};render();
  expect(summary()).toContain('Selected owner');expect(summary()).not.toContain('otherwise unassigned');
  props.finding={...props.finding,owner_id:''};render();
  expect(summary()).toContain('action item initially unassigned');expect(props.onChange).not.toHaveBeenCalled();
});
