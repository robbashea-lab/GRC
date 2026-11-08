import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AssessmentItems from './AssessmentItems';
import api from '@/lib/api';
jest.mock('@/lib/api',()=>({__esModule:true,default:{patch:jest.fn()},formatError:error=>error.message}));
let container,root,create,draft,record;
const button=text=>[...container.querySelectorAll('button')].find(element=>element.textContent===text);
const item={item_id:'item-a',text:'Confirm asset coverage.',state:'open',resolution:'',history:[],finding_id:null};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);create=jest.fn();draft=jest.fn();record={framework_assessment_id:'assessment-a',client_id:'client-a',status:'in_progress',implementation:'Manual text',verification:'verified',items_revision:3,items_to_address:[{...item}]};});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
function Example({disabled=false}){const [saved,setSaved]=useState(record);return <AssessmentItems record={saved} ctx={{}} disabled={disabled} onSaved={setSaved} onDraftChange={draft} onCreateFinding={create}/>;}
async function render(disabled=false){await act(async()=>root.render(<Example disabled={disabled}/>));}
async function note(value){const field=container.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});}
test('resolve, refine, reopen use only the item revision; finding creation is explicit',async()=>{
  api.patch.mockImplementation(async(_path,body)=>{record={...record,items_revision:record.items_revision+1,items_to_address:[{...record.items_to_address[0],state:body.state,resolution:body.resolution}]};return {data:record};});
  await render();await note('Reviewed coverage with owner.');
  expect(draft).toHaveBeenLastCalledWith(true);expect(api.patch).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
  await act(async()=>container.querySelector('input[type=checkbox]').click());
  expect(api.patch).toHaveBeenLastCalledWith('/framework_assessments/assessment-a/items/item-a',{expected_revision:3,state:'resolved',resolution:'Reviewed coverage with owner.'});
  expect(record.status).toBe('in_progress');expect(record.implementation).toBe('Manual text');expect(record.verification).toBe('verified');expect(draft).toHaveBeenLastCalledWith(false);
  await act(async()=>container.querySelector('input[type=checkbox]').click());expect(api.patch.mock.calls[1][1].state).toBe('open');
  await act(async()=>button('Create finding').click());expect(create).toHaveBeenCalledWith(expect.objectContaining({item_id:'item-a',state:'open'}));
});
test('failed resolution preserves notes and displays the conflict',async()=>{
  api.patch.mockRejectedValue(new Error('Items changed; refresh before saving'));await render();await note('Preserve this note.');
  await act(async()=>button('Save resolution').click());expect(container.querySelector('textarea').value).toBe('Preserve this note.');expect(container.querySelector('[role=alert]').textContent).toContain('Items changed');expect(draft).toHaveBeenLastCalledWith(true);
});
test('read-only items and linked findings cannot issue another write',async()=>{
  record.items_to_address[0].finding_id='finding-a';await render(true);
  expect(container.querySelector('textarea').disabled).toBe(true);expect(button('Create finding').disabled).toBe(true);await act(async()=>container.querySelector('input[type=checkbox]').click());expect(api.patch).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
});
