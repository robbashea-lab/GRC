import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AssessmentRolloutFrame from './AssessmentRolloutFrame';
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({})}));
// Exercise the Frame's opt-in controls independently of portal, focus-trap and tab internals.
jest.mock('./AssessmentShell',()=>props=><section>{props.navigationActions}{props.children}{props.footer}</section>);
jest.mock('./AssessmentLayout',()=>props=><div>{props.requirement}{props.interview?.({})}{props.children}{props.itemsToAddress}{props.findings}</div>);
jest.mock('./ui/dropdown-menu',()=>({
  DropdownMenu:({children})=><div>{children}</div>,DropdownMenuTrigger:({children})=><>{children}</>,
  DropdownMenuContent:({children})=><div>{children}</div>,
  DropdownMenuItem:({children,disabled,onSelect})=><button disabled={disabled} onClick={onSelect}>{children}</button>}));
let root,host,state,actions;
const button=name=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
async function render(extra={}){await act(async()=>root.render(<AssessmentRolloutFrame {...{state,actions}} frameworkLabel="Synthetic native framework" interview={()=>null} {...extra}/>));}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  const record={client_id:'synthetic-client',framework_assessment_id:'synthetic-assessment',definition_id:'SYNTHETIC-1',status:'not_assessed'};
  state={open:true,record,definition:{id:record.definition_id,title:'Synthetic requirement'},current:record,form:record,ctx:{},busy:false,dirty:true,writable:true};
  actions={close:jest.fn(),save:jest.fn(),saveAndNext:jest.fn(),retry:jest.fn(),put:jest.fn()};
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
test('existing callers keep their footer and history behavior without receiving a manufactured Discard command',async()=>{
  await render();expect(button('Discard')).toBeUndefined();expect(button('Save assessment')).toBeTruthy();expect(button('Save & next')).toBeTruthy();
  expect(button('Interview history').disabled).toBe(false);
});
test('generic callers explicitly disable unsupported interview history while native assessment history remains its own optional destination',async()=>{
  const manageRecord=jest.fn();state={...state,manageRecord};await render({interviewHistoryAvailable:false});
  expect(button('Interview history').disabled).toBe(true);expect(button('Ownership & assessment history').disabled).toBe(false);
  await act(async()=>button('Ownership & assessment history').click());expect(manageRecord).toHaveBeenCalledTimes(1);
});
test('only the caller-owned Discard command runs and its existing busy/context/permission guards stay effective',async()=>{
  const discardAssessment=jest.fn();actions={...actions,discardAssessment};await render();
  await act(async()=>button('Discard').click());expect(discardAssessment).toHaveBeenCalledTimes(1);
  state={...state,interviewActive:true};await render();expect(button('Discard')).toBeUndefined();expect(button('Save assessment')).toBeUndefined();
  state={...state,interviewActive:false,discardDisabled:true};await render();expect(button('Discard').disabled).toBe(true);
  state={...state,discardDisabled:false,busy:true};await render();expect(button('Discard').disabled).toBe(true);
  state={...state,busy:false,ctx:null};await render();expect(button('Discard').disabled).toBe(true);
  state={...state,ctx:{},writable:false};await render();expect(button('Discard')).toBeUndefined();
  expect(discardAssessment).toHaveBeenCalledTimes(1);
});
