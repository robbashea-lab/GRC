import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AssessmentItems from './AssessmentItems';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{patch:jest.fn()},formatError:error=>error.message}));
let root,host,record,createFinding,draft;
const item=(item_id,values={})=>({item_id,question_id:'coverage',kind:'gap',text:item_id,state:'open',resolution:'',history:[],finding_id:null,...values});
const button=(scope,text)=>[...scope.querySelectorAll('button')].find(node=>node.textContent===text);
const section=text=>[...host.querySelectorAll('.assessment-item')].find(node=>node.querySelector('strong')?.textContent===text);
async function click(scope,text){const target=button(scope,text);expect(target).toBeTruthy();expect(target.disabled).toBe(false);await act(async()=>target.click());}
async function editResolution(scope,value){
  const details=scope.querySelector('.sg11-item-resolution');
  if(!details.open)await act(async()=>details.querySelector('summary').click());
  const field=details.querySelector('textarea');expect(field.maxLength).toBe(4000);
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});
}
function Harness({disabled=false,safeguard11=true,recordOverride}){
  const [saved,setSaved]=useState(record);
  return <AssessmentItems record={recordOverride||saved} ctx={{related:{findings:[{finding_id:'linked-finding',title:'Actual linked Finding'}]}}} disabled={disabled} safeguard11={safeguard11} onSaved={setSaved} onCreateFinding={createFinding} onDraftChange={draft}/>;
}
async function render(disabled=false,options={}){await act(async()=>root.render(<Harness disabled={disabled} {...options}/>));}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);createFinding=jest.fn();draft=jest.fn();
  record={client_id:'demo_brawndo',framework_assessment_id:'assessment-11',items_revision:7,status:'needs_attention',verification:'verified',implementation:'Manual saved narrative',items_to_address:[
    item('stable-coverage',{text:'Inventory title cannot determine its group'}),
    item('stable-inventory',{question_id:'inventory',kind:'verification',text:'Asset coverage title cannot determine its group'}),
    item('stable-unknown',{question_id:'inventory',kind:'future_kind',text:'Unknown source kind'}),
    item('stable-resolved',{state:'resolved',text:'Already resolved',resolution:'Existing resolution'}),
    item('stable-old',{state:'superseded',text:'Historical item',history:[{at:'2026-10-01',state:'superseded',resolution:'Old resolution'}]}),
    item('stable-linked',{text:'Linked source item',finding_id:'linked-finding'}),
  ]};
  api.patch.mockImplementation(async(path,body)=>{
    const identity=path.split('/').at(-1);
    record={...record,items_revision:record.items_revision+1,items_to_address:record.items_to_address.map(row=>row.item_id===identity?{...row,state:body.state,resolution:body.resolution}:row)};
    return {data:record};
  });
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});

test('pilot groups actual source metadata and keeps resolved/history/unknown records available',async()=>{
  await render();
  expect(section('Inventory title cannot determine its group').closest('.sg11-item-group').querySelector('h4').textContent).toBe('Asset coverage · 2');
  expect(section('Asset coverage title cannot determine its group').closest('.sg11-item-group').querySelector('h4').textContent).toBe('Inventory · 1');
  expect(section('Unknown source kind').closest('.sg11-item-group').querySelector('h4').textContent).toBe('Other recorded items · 1');
  expect(section('Unknown source kind').textContent).toContain('Recorded item');
  expect(host.textContent).toContain('Resolved items · 1');expect(host.textContent).toContain('Previous items');
  expect(section('Historical item').querySelector('textarea').disabled).toBe(true);
  expect(section('Historical item').querySelectorAll('button')).toHaveLength(0);
  expect(section('Historical item').textContent).toContain('Old resolution');
  expect(button(section('Linked source item'),'Raise finding').disabled).toBe(true);
  expect(section('Linked source item').textContent).toContain('Actual linked Finding');
  expect(api.patch).not.toHaveBeenCalled();
});

test('Mark done and Reopen retain exact Item/revision/resolution and independent assessment judgment',async()=>{
  await render();const text='Inventory title cannot determine its group';
  await editResolution(section(text),'Confirmed the real source coverage.');
  expect(draft).toHaveBeenLastCalledWith(true);
  await click(section(text),'Mark done');
  expect(api.patch).toHaveBeenLastCalledWith('/framework_assessments/assessment-11/items/stable-coverage',{expected_revision:7,state:'resolved',resolution:'Confirmed the real source coverage.'});
  expect(record).toMatchObject({status:'needs_attention',verification:'verified',implementation:'Manual saved narrative'});
  expect(draft).toHaveBeenLastCalledWith(false);
  await click(section(text),'Reopen');
  expect(api.patch).toHaveBeenLastCalledWith('/framework_assessments/assessment-11/items/stable-coverage',{expected_revision:8,state:'open',resolution:'Confirmed the real source coverage.'});
  expect(createFinding).not.toHaveBeenCalled();
});

test('Create Finding passes the stable native Item and unsaved resolution without resolving it',async()=>{
  await render();const text='Inventory title cannot determine its group';
  await editResolution(section(text),'Local resolution context retained separately.');
  await click(section(text),'Raise finding');
  expect(createFinding).toHaveBeenCalledWith({...record.items_to_address[0],resolution:'Local resolution context retained separately.'});
  expect(record.items_to_address[0].state).toBe('open');
  expect(api.patch).not.toHaveBeenCalled();expect(draft).toHaveBeenLastCalledWith(true);
});

test('failed Item save retains resolution/error/draft and read-only disables native commands',async()=>{
  await render();const text='Inventory title cannot determine its group';
  await editResolution(section(text),'Do not discard on conflict.');
  api.patch.mockRejectedValueOnce(new Error('Actual Item revision conflict'));
  await click(section(text),'Save resolution');
  expect(host.querySelector('[role="alert"]').textContent).toBe('Actual Item revision conflict');
  expect(section(text).querySelector('textarea').value).toBe('Do not discard on conflict.');
  expect(draft).toHaveBeenLastCalledWith(true);expect(record.items_revision).toBe(7);
  await render(true);const calls=api.patch.mock.calls.length;
  expect(section(text).querySelector('textarea').disabled).toBe(true);
  for(const name of ['Mark done','Raise finding','Save resolution']){
    const target=button(section(text),name);expect(target.disabled).toBe(true);await act(async()=>target.click());
  }
  expect(api.patch).toHaveBeenCalledTimes(calls);expect(createFinding).not.toHaveBeenCalled();
});


const nativeResolution=text=>[...host.querySelectorAll('textarea')].find(node=>node.getAttribute('aria-label')===`Resolution: ${text}`);

test('same editable Item keeps resolution focus and caret through a pilot round trip',async()=>{
  await render();const text='Inventory title cannot determine its group';
  await editResolution(section(text),'Retain this unsaved resolution.');
  const before=nativeResolution(text);
  await act(async()=>{before.focus();before.setSelectionRange(3,12,'backward');});
  await render(false,{safeguard11:false});
  const after=nativeResolution(text);
  expect(after.value).toBe('Retain this unsaved resolution.');
  expect(document.activeElement).toBe(after);
  expect([after.selectionStart,after.selectionEnd,after.selectionDirection]).toEqual([3,12,'backward']);
  await render(false,{safeguard11:true});
  const returned=nativeResolution(text);
  expect(returned.value).toBe('Retain this unsaved resolution.');
  expect(document.activeElement).toBe(returned);
  expect([returned.selectionStart,returned.selectionEnd,returned.selectionDirection]).toEqual([3,12,'backward']);
  expect(returned.closest('details').open).toBe(true);
  expect(record.items_revision).toBe(7);expect(api.patch).not.toHaveBeenCalled();
  expect(createFinding).not.toHaveBeenCalled();expect(draft).toHaveBeenLastCalledWith(true);
});

test.each(['client','assessment','item','blocked'])('withdrawal does not transfer Item focus after %s changes',async(change)=>{
  await render();const text='Inventory title cannot determine its group';
  await editResolution(section(text),'Retain only within the native record.');
  await act(async()=>nativeResolution(text).focus());
  const next={...record,
    ...(change==='client'?{client_id:'other-client'}:{}),
    ...(change==='assessment'?{framework_assessment_id:'other-assessment'}:{}),
    ...(change==='item'?{items_to_address:record.items_to_address.map((row,index)=>index===0?{...row,item_id:'other-item'}:row)}:{})};
  await render(change==='blocked',{safeguard11:false,recordOverride:next});
  expect(document.activeElement).not.toBe(nativeResolution(text));
  expect(api.patch).not.toHaveBeenCalled();expect(createFinding).not.toHaveBeenCalled();
});


test.each(['client','assessment','item','blocked'])('return does not transfer Item focus after %s changes',async(change)=>{
  await render(false,{safeguard11:false});const text='Inventory title cannot determine its group';
  const field=nativeResolution(text);
  await act(async()=>field.focus());
  const next={...record,
    ...(change==='client'?{client_id:'other-client'}:{}),
    ...(change==='assessment'?{framework_assessment_id:'other-assessment'}:{}),
    ...(change==='item'?{items_to_address:record.items_to_address.map((row,index)=>index===0?{...row,item_id:'other-item'}:row)}:{})};
  await render(change==='blocked',{safeguard11:true,recordOverride:next});
  expect(document.activeElement).not.toBe(nativeResolution(text));
  expect(api.patch).not.toHaveBeenCalled();expect(createFinding).not.toHaveBeenCalled();
});
