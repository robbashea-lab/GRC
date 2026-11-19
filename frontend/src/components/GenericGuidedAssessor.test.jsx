import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import GenericGuidedAssessor from './GenericGuidedAssessor';
import api from '@/lib/api';
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
let root,host;
const button=name=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
async function click(name){expect(button(name)).toBeTruthy();expect(button(name).disabled).toBe(false);await act(async()=>button(name).click());}
async function choose(name){const label=[...host.querySelectorAll('label')].find(node=>node.textContent.trim()===name);expect(label).toBeTruthy();await act(async()=>label.querySelector('input').click());}
async function text(value){const node=host.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
test('an unfamiliar client records unknowns in a checkpoint and Apply stages without saving an assessment',async()=>{
  const record={client_id:'unfamiliar-client',framework_key:'nist-csf-2',definition_id:'GV.OC-01',framework_assessment_id:'native-assessment'},onApply=jest.fn(),onDraftChange=jest.fn();
  const draft={version:'r4-guided-v1:nist-csf-2',answers:{},step:0,revision:0,base_assessment_token:null,base_scope_fingerprint:'a'.repeat(64)};
  api.get.mockResolvedValue({data:draft});
  api.put.mockImplementation(async(_path,body)=>({data:{...body,revision:body.expected_revision+1,generated_at:body.completed?'2026-11-19T00:00:00Z':null}}));
  await act(async()=>root.render(<GenericGuidedAssessor {...{record,onApply,onDraftChange}}/>));
  await click('Start guided assessment');await choose('Not sure');await click('Next');
  await text('The actual scoped practice needs confirmation.');
  await click('Minimize guide');expect(host.querySelector('textarea')).toBeNull();
  await click('Start guided assessment');expect(host.querySelector('textarea').value).toBe('The actual scoped practice needs confirmation.');
  await click('Save progress');
  expect(api.put.mock.calls[0][1].completed).toBe(false);expect(onApply).not.toHaveBeenCalled();
  await click('Next');for(let i=0;i<3;i++)await click('Next');
  await choose('Not sure');await click('Next');await choose('No');await click('Review implementation');
  expect(host.querySelector('[aria-label="Review implementation draft"]')).toBeTruthy();
  const completed=api.put.mock.calls.at(-1)[1];
  expect(completed.result.status).toBe('not_assessed');expect(completed.result.gaps).toEqual([]);
  expect(completed.result.unknowns.length).toBeGreaterThan(0);expect(api.patch).not.toHaveBeenCalled();
  await click('Apply draft');expect(onApply).toHaveBeenCalled();
  expect(onApply.mock.calls[0][0]).toMatchObject({status:'not_assessed',guided_assessment_source:{version:draft.version}});
  expect(api.patch).not.toHaveBeenCalled();
});
