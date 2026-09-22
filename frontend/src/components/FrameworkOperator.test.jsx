import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';

let mockRole='super_admin';
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'u',role:mockRole}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:e=>e.message}));
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('./AssigneeSelect',()=>()=>null);
jest.mock('./ui/sheet',()=>({Sheet:({children})=><div>{children}</div>,SheetContent:({children,...props})=><section {...props}>{children}</section>,SheetHeader:({children})=><header>{children}</header>,SheetTitle:({children})=><h2>{children}</h2>,SheetDescription:({children})=><p>{children}</p>}));
let root,container,record;
beforeEach(()=>{
  mockRole='super_admin';
  global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  record={framework_assessment_id:'a',framework_key:'cis-ig1',definition_id:'1.1',client_id:'client',status:'not_assessed',implementation:'',notes:'Legacy narrative retained',assessment_history:[]};
  api.get.mockImplementation(async path=>({data:path.endsWith('/related')?{reviews:[],evidence:[]}:path==='/frameworks/cis-ig1'?{assessments:[record]}:[]}));
  api.patch.mockImplementation(async(path,body)=>{record={...record,...body,last_assessed:'2026-09-22',assessment_history:[{...body,at:'2026-09-22',by:'u'}]};return {data:record};});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
const button=name=>[...container.querySelectorAll('button')].find(b=>b.textContent===name);
async function render(){await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="client" onOpenChange={()=>{}}/>));}
test('default assessment combines source context, narrative and status with progressive guidance',async()=>{
  await render();expect(container.textContent).toContain('Reference · CIS IG1 · 1.1');expect(container.textContent).toContain('What this means');
  expect(container.querySelector('[aria-label="Assessment notes"]')).toBeTruthy();expect(container.querySelector('[aria-label="Assessment Status"]')).toBeTruthy();
  expect(container.textContent).not.toContain('What to ask the client');expect(container.querySelector('details').open).toBe(false);
  expect(container.querySelector('[aria-label="Additional notes (previously recorded)"]').value).toBe('Legacy narrative retained');
});
test('notes save once, confirm success and remain readable in history including legacy notes',async()=>{
  await render();const field=container.querySelector('[aria-label="Assessment notes"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Inventory omits remote devices.');field.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(container.textContent).toContain('Unsaved assessment changes');
  await act(async()=>button('Save assessment').click());
  expect(api.patch).toHaveBeenCalledWith('/framework_assessments/a',expect.objectContaining({implementation:'Inventory omits remote devices.',notes:'Legacy narrative retained'}));
  expect(container.textContent).toContain('Assessment saved.');
  await act(async()=>{button('History').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));button('History').focus();});
  expect(container.textContent).toContain('Inventory omits remote devices.');expect(container.textContent).toContain('Additional notes: Legacy narrative retained');
});
test('read-only users retain context but cannot save an assessment',async()=>{
  mockRole='client_viewer';await render();
  expect(container.querySelector('fieldset').disabled).toBe(true);expect(button('Save assessment')).toBeUndefined();
  expect(api.patch).not.toHaveBeenCalled();
});
test('a failed context load is visible and does not enable a successful-looking save',async()=>{
  api.get.mockRejectedValue(new Error('Unable to load related records'));await render();
  expect(container.querySelector('[role="alert"]').textContent).toContain('Unable to load related records');
  expect(button('Save assessment').disabled).toBe(true);expect(api.patch).not.toHaveBeenCalled();
});
test('a failed save preserves the draft and reports failure without a success message',async()=>{
  await render();api.patch.mockRejectedValue(new Error('Assessment update denied'));
  await act(async()=>button('Save assessment').click());
  expect(container.querySelector('[role="alert"]').textContent).toBe('Assessment update denied');
  expect(container.textContent).not.toContain('Assessment saved.');
});
