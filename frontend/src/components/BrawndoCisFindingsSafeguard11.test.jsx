import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import api from '@/lib/api';
import BrawndoCisFindings from './BrawndoCisFindings';

jest.mock('@/lib/api',()=>({__esModule:true,default:{post:jest.fn()}}));
jest.mock('./AssigneeSelect',()=>function Assignee({value,onChange,disabled}){
  return <button type="button" aria-label="Finding owner" disabled={disabled} onClick={()=>onChange(null)}>{value||'Unassigned'}</button>;
});

const record={client_id:'demo_brawndo',framework_key:'cis-ig1',framework_version:'8.1',definition_id:'1.1',framework_assessment_id:'assessment-native-11',owner_id:'saved-owner',related_links:[]};
const itemDraft={request_id:'stable-item-request',item_id:'exact-native-item',title:'Coverage gap',description:'Saved source resolution',severity:'medium',owner_id:'saved-owner',due_date:'',remediation_title:'Complete coverage'};
let container,root,lastDraft,renderProps,feedback;
function Harness({initial=null,busy=false,writable=true,safeguard11=true,sourceRecord=record}){
  const [finding,setFinding]=useState(initial),[error,setError]=useState('');
  lastDraft=finding;
  const run=async operation=>{try{await operation();setError('');}catch(failure){setError(failure.message);}};
  return <><p data-testid="parent-draft">Untouched parent implementation</p><p role="status">{error}</p><BrawndoCisFindings record={sourceRecord} current={sourceRecord} definition={{id:'1.1',title:'Native asset inventory requirement'}} ctx={{users:[{user_id:'saved-owner',name:'Saved owner'}],configuration:{implementation_group:1}}} related={{findings:[],tasks:[]}} {...{finding,setFinding,run,busy,writable,error,safeguard11}} setNested={jest.fn()} setFeedback={feedback}/></>;
}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;api.post.mockReset();api.post.mockResolvedValue({data:{finding_id:'real-finding'}});feedback=jest.fn();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);renderProps={};
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const render=async()=>act(async()=>root.render(<Harness {...renderProps}/>));
const findButton=text=>Array.from(document.querySelectorAll('button')).find(element=>element.textContent===text);
const click=async text=>act(async()=>findButton(text).click());
const input=async(label,value)=>act(async()=>{
  const element=document.querySelector(`[aria-label="${label}"]`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,value);
  element.dispatchEvent(new Event('input',{bubbles:true}));
});

test('direct opening retains native medium and saved owner, then sends only the assessment Finding command',async()=>{
  await render();await click('Raise finding');
  expect(document.querySelector('[role="dialog"].sg11-finding-sheet')).not.toBeNull();
  expect(lastDraft).toEqual(expect.objectContaining({severity:'medium',owner_id:'saved-owner',due_date:'',title:'',remediation_title:''}));
  const requestId=lastDraft.request_id;expect(requestId).toBeTruthy();
  await input('Finding title','Actual observed gap');await input('Corrective action','Reconcile actual inventory');
  await click('Save finding and action');
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/framework_assessments/assessment-native-11/findings',{
    request_id:requestId,title:'Actual observed gap',description:'',severity:'medium',due_date:null,remediation_title:'Reconcile actual inventory',
  });
  expect(api.post.mock.calls[0][1]).not.toHaveProperty('owner_id');expect(api.post.mock.calls[0][1]).not.toHaveProperty('remediation_plan');
  expect(lastDraft).toBeNull();expect(document.querySelector('.sg11-finding-sheet')).toBeNull();
  expect(feedback).toHaveBeenCalledTimes(1);expect(container.textContent).toContain('Untouched parent implementation');
});

test('item origin preserves exact IDs through error and retry; explicitly clearing the saved owner sends null',async()=>{
  renderProps={initial:{...itemDraft}};api.post.mockRejectedValueOnce(new Error('Native save unavailable'));
  await render();await act(async()=>document.querySelector('[aria-label="Finding owner"]').click());
  await click('Save finding and action');
  expect(lastDraft).toEqual({...itemDraft,owner_id:''});expect(container.textContent).toContain('Native save unavailable');
  expect(document.querySelector('.sg11-finding-sheet [role=alert]').textContent).toContain('Native save unavailable');expect(feedback).not.toHaveBeenCalled();
  const expected={...itemDraft,owner_id:null,due_date:null};
  expect(api.post).toHaveBeenNthCalledWith(1,'/framework_assessments/assessment-native-11/findings',expected);
  await click('Save finding and action');
  expect(api.post).toHaveBeenCalledTimes(2);expect(api.post).toHaveBeenNthCalledWith(2,'/framework_assessments/assessment-native-11/findings',expected);
  expect(lastDraft).toBeNull();expect(feedback).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Untouched parent implementation');
});

test('native Cancel dismisses only the Finding draft without saving the parent',async()=>{
  renderProps={initial:{...itemDraft}};await render();await click('Cancel');
  expect(lastDraft).toBeNull();expect(document.querySelector('.sg11-finding-sheet')).toBeNull();
  expect(api.post).not.toHaveBeenCalled();expect(feedback).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Untouched parent implementation');
});

test('busy prevents native Sheet Close and Escape; read-only fields and submit remain disabled',async()=>{
  renderProps={initial:{...itemDraft},busy:true};await render();
  expect(findButton('Cancel').disabled).toBe(true);expect(findButton('Save finding and action').disabled).toBe(true);
  await click('Close');expect(lastDraft).toEqual(itemDraft);expect(document.querySelector('.sg11-finding-sheet')).not.toBeNull();
  await act(async()=>document.querySelector('.sg11-finding-sheet').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(lastDraft).toEqual(itemDraft);expect(api.post).not.toHaveBeenCalled();
  renderProps={initial:{...itemDraft},busy:false,writable:false};await render();
  expect(document.querySelector('.sg11-finding-inputs').disabled).toBe(true);expect(findButton('Save finding and action').disabled).toBe(true);
  expect(document.querySelector('[aria-label="Finding owner"]').disabled).toBe(true);
});

test('withdrawing only appearance preserves the native Finding draft and focused field selection',async()=>{
  renderProps={initial:{...itemDraft}};await render();
  await input('Finding title','Retained edited coverage gap');
  const title=document.querySelector('.sg11-finding-sheet [aria-label="Finding title"]');
  await act(async()=>{title.focus();title.setSelectionRange(2,9);});
  expect(document.activeElement).toBe(title);
  const retained={...lastDraft};
  renderProps={...renderProps,safeguard11:false};await render();
  expect(document.querySelector('.sg11-finding-sheet')).toBeNull();
  const nativeTitle=container.querySelector('.bcsg-finding-form [aria-label="Finding title"]');
  expect(nativeTitle).not.toBeNull();expect(nativeTitle.value).toBe('Retained edited coverage gap');
  expect(container.querySelector('[aria-label="Corrective action"]').value).toBe(itemDraft.remediation_title);
  expect(lastDraft).toEqual(retained);expect(lastDraft.request_id).toBe(itemDraft.request_id);expect(lastDraft.item_id).toBe(itemDraft.item_id);
  expect(api.post).not.toHaveBeenCalled();expect(feedback).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(nativeTitle);
  expect(nativeTitle.selectionStart).toBe(2);expect(nativeTitle.selectionEnd).toBe(9);
  // Radix dispatches its unmount autofocus in the next task.
  await act(async()=>new Promise(resolve=>setTimeout(resolve,0)));
  expect(document.activeElement).toBe(nativeTitle);
  expect(nativeTitle.selectionStart).toBe(2);expect(nativeTitle.selectionEnd).toBe(9);
  expect(container.textContent).toContain('Untouched parent implementation');
});

test.each(['assessment','permission'])('withdrawal does not move stale focus into a changed %s scope',async change=>{
  renderProps={initial:{...itemDraft}};await render();
  await act(async()=>document.querySelector('.sg11-finding-sheet [aria-label="Finding title"]').focus());
  renderProps={...renderProps,safeguard11:false,...(change==='assessment'?{sourceRecord:{...record,framework_assessment_id:'other-assessment'}}:{writable:false})};
  await render();await act(async()=>new Promise(resolve=>setTimeout(resolve,0)));
  const nativeTitle=container.querySelector('.bcsg-finding-form [aria-label="Finding title"]');
  expect(nativeTitle).not.toBeNull();expect(document.activeElement).not.toBe(nativeTitle);
  if(change==='permission')expect(container.querySelector('.bcsg-finding-form').disabled).toBe(true);
  expect(lastDraft).toEqual(itemDraft);expect(api.post).not.toHaveBeenCalled();expect(feedback).not.toHaveBeenCalled();
});

test('closing the parent immediately after withdrawal keeps the ordinary native opener fallback',async()=>{
  const opener=document.createElement('button');opener.textContent='Native parent opener';document.body.appendChild(opener);opener.focus();
  try{
    renderProps={initial:{...itemDraft}};await render();
    await act(async()=>document.querySelector('.sg11-finding-sheet [aria-label="Finding title"]').focus());
    renderProps={...renderProps,safeguard11:false};
    act(()=>root.render(<Harness {...renderProps}/>));
    expect(document.activeElement).toBe(container.querySelector('.bcsg-finding-form [aria-label="Finding title"]'));
    act(()=>root.render(null));
    await act(async()=>new Promise(resolve=>setTimeout(resolve,0)));
    expect(document.activeElement).toBe(opener);expect(api.post).not.toHaveBeenCalled();
  }finally{opener.remove();}
});
