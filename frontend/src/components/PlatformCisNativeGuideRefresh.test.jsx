import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import {versionForSafeguard} from '@/lib/guidedAssessment';
import api from '@/lib/api';

// API responses model the existing server's revision/base checks; this is
// rendered integration evidence, not Mongo durability or hosted authentication.
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'native-guide-qa',role:'super_admin'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClient:{client_id:'synthetic-native-guide',name:'Synthetic native guide QA'},clients:[{client_id:'synthetic-native-guide',name:'Synthetic native guide QA'}]})}));
jest.mock('./AssigneeSelect',()=>()=>null);
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('./ui/dialog',()=>{
  const R=require('react');
  return {Dialog:({open,children})=>open?<div>{children}</div>:null,DialogContent:({children})=><div>{children}</div>,DialogTitle:R.forwardRef(({children},ref)=><h2 ref={ref}>{children}</h2>),DialogDescription:({children})=><p>{children}</p>};
});

const copy=value=>JSON.parse(JSON.stringify(value));
const tokenA='2026-10-11T12:00:00Z',tokenB='2026-10-11T12:01:00Z',tokenC='2026-10-11T12:02:00Z',fingerprint='e'.repeat(64);
const conflict='Assessment or scope changed before this review started; reload before starting';
let root,container,native,record,interview,nativeHistory,interviewHistory,liveFingerprint,implementationGroup;
const workspace=()=>document.querySelector('[aria-label="CIS assessment interview"]:not([hidden])');
const readInterview=()=>({...copy(interview),current_assessment_token:native.last_saved,current_scope_fingerprint:liveFingerprint,lineage_known:true,lineage_stale:interview.base_assessment_token!==native.last_saved});
async function click(name,scope=document){
  const target=[...scope.querySelectorAll('button')].find(button=>button.textContent.trim()===name);
  expect(target).toBeTruthy();expect(target.disabled).toBe(false);await act(async()=>target.click());
}
async function value(selector,next){
  const target=document.querySelector(selector);expect(target).toBeTruthy();
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(target,next);target.dispatchEvent(new Event('input',{bubbles:true}));});
}
async function render(){await act(async()=>root.render(<FrameworkDrawer open record={record} clientId={record.client_id} onOpenChange={()=>{}}/>));}
async function open(){
  const summary=document.querySelector('details.assessment-summary');expect(summary).toBeTruthy();
  await act(async()=>{summary.open=true;summary.dispatchEvent(new Event('toggle'));});
  expect(workspace()).toBeTruthy();
}
async function answer(){await click('Not sure',workspace());await value('[aria-label="Known gaps or uncertainties"]','Synthetic uncertainty retained through native save.');}
async function nativeSave(){await value('[aria-label="Current implementation"]','SYNTHETIC QA native preservation marker.');await click('Save assessment',container);expect(container.textContent).toContain('Assessment saved.');expect(native.last_saved).toBe(tokenB);}

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();window.history.replaceState({},'','/');
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  native={client_id:'synthetic-native-guide',framework_key:'cis-ig1',framework_assessment_id:'synthetic-native-1.1',definition_id:'1.1',title:'Inventory',status:'not_assessed',verification:'not_verified',implementation:'',technology:'Preserved native technology',notes:'Preserved native notes',owner_id:null,na_rationale:'',last_saved:tokenA,assessment_history:[]};
  record=copy(native);nativeHistory=[];interviewHistory=[];liveFingerprint=fingerprint;implementationGroup=1;
  interview={client_id:native.client_id,assessment_id:native.framework_assessment_id,user_id:'native-guide-qa',version:versionForSafeguard('1.1'),revision:0,answers:{},step:0,completed:false,narrative:'',result:null,base_assessment_token:tokenA,base_scope_fingerprint:fingerprint};
  api.get.mockImplementation(async path=>({data:path.endsWith('/guided-assessment/history')?{items:copy(interviewHistory),next_before_revision:null}:path.endsWith('/guided-assessment')?readInterview():path.endsWith('/related')?{reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]}:path.startsWith('/frameworks/')?{configuration:{implementation_group:implementationGroup},assessments:[copy(native)],work:{[native.framework_assessment_id]:{context_complete:true,open_findings:0,open_actions:0,overdue_reviews:0,priority_records:[]}}}:[]}));
  api.patch.mockImplementation(async(_path,body)=>{
    if(body.expected_last_assessed!==native.last_saved)throw new Error('Assessment changed since it was opened; reload before saving');
    const {expected_last_assessed,...fields}=body;
    nativeHistory.push(copy(native));native={...native,...copy(fields),last_saved:tokenB,assessment_history:copy(nativeHistory)};
    return {data:copy(native)};
  });
  api.put.mockImplementation(async(_path,body)=>{
    if(body.expected_revision!==interview.revision)throw new Error('Interview changed in another window; reload before saving');
    if(!interview.revision||body.restart||body.rebase){
      if(body.base_assessment_token!==native.last_saved||body.base_scope_fingerprint!==liveFingerprint)throw new Error(conflict);
    }
    if(interview.revision&&(interview.completed||body.restart||body.rebase))interviewHistory.push(copy(interview));
    const {expected_revision,...fields}=body;
    interview={...interview,...copy(fields),revision:interview.revision+1};return {data:readInterview()};
  });
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('fresh native snapshot saves only question progress and retains all native fields',async()=>{
  await render();const before=copy(native);await open();await answer();await click('Save & close',workspace());
  expect(interview.revision).toBe(1);expect(interview.answers.inventory).toBe('Not sure');expect(interview.answers.inventory_detail).toContain('Synthetic uncertainty');
  expect(interview.base_assessment_token).toBe(tokenA);expect(native).toEqual(before);expect(nativeHistory).toEqual([]);expect(api.patch).not.toHaveBeenCalled();
  expect(api.get.mock.calls.filter(([path])=>path.endsWith('/guided-assessment'))).toHaveLength(1);
  await open();expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toContain('Synthetic uncertainty');
});

test.each([1,2,3].flatMap(group=>[false,true].map(typedFirst=>[group,typedFirst])))('IG%s native save before first interview save refreshes its empty base while retaining input (typed before native save=%s)',async(group,typedFirst)=>{
  implementationGroup=group;
  await render();
  if(typedFirst){await open();await answer();}
  await nativeSave();const beforeProgress=copy(native);
  if(!typedFirst){await open();await answer();}
  expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toContain('Synthetic uncertainty');
  await click('Save & close',workspace());
  expect(document.querySelector('[role="alert"]')?.textContent||'').toBe('');
  expect(interview.revision).toBe(1);expect(interview.base_assessment_token).toBe(tokenB);expect(interview.answers.inventory).toBe('Not sure');
  expect(interview.answers.inventory_detail).toContain('Synthetic uncertainty');expect(native).toEqual(beforeProgress);expect(nativeHistory).toHaveLength(1);expect(interviewHistory).toEqual([]);expect(api.patch).toHaveBeenCalledTimes(1);
});

test('a persisted interview after a native save still requires explicit comparison and keeps its original base',async()=>{
  interview={...interview,revision:1,answers:{inventory:'Not sure',inventory_detail:'Previously saved uncertainty'}};const original=copy(interview);
  await render();await nativeSave();const savedNative=copy(native);await open();await click('Save & close',workspace());
  expect(document.querySelector('[aria-label="Compare saved assessment"]')).toBeTruthy();expect(api.put).not.toHaveBeenCalled();expect(interview).toEqual(original);
  expect(interviewHistory).toEqual([]);expect(native).toEqual(savedNative);expect(api.patch).toHaveBeenCalledTimes(1);
});

test('an unseen external native writer rejects first progress without losing the typed draft',async()=>{
  await render();await open();await answer();native={...native,implementation:'External synthetic winner',last_saved:tokenB};const winner=copy(native);
  await click('Save & close',workspace());expect(document.querySelector('[role="alert"]')).toBeTruthy();
  expect(interview.revision).toBe(0);expect(native).toEqual(winner);expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toContain('Synthetic uncertainty');
  expect([...workspace().querySelectorAll('button')].find(button=>button.textContent==='Not sure').getAttribute('aria-pressed')).toBe('true');expect(api.patch).not.toHaveBeenCalled();
});

test('a competing persisted interview is not adopted by the first-write refresh',async()=>{
  await render();await nativeSave();await open();await answer();interview={...interview,revision:1,answers:{inventory:'No',inventory_detail:'Other window saved this uncertainty'}};const winner=copy(interview),beforeNative=copy(native);
  await click('Save & close',workspace());expect(document.querySelector('[role="alert"]')).toBeTruthy();expect(api.put).not.toHaveBeenCalled();
  expect(interview).toEqual(winner);expect(native).toEqual(beforeNative);expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toContain('Synthetic uncertainty');expect(interviewHistory).toEqual([]);
});

test('a scope change is not silently adopted by the first-write refresh',async()=>{
  await render();await nativeSave();await open();await answer();liveFingerprint='f'.repeat(64);const beforeNative=copy(native),beforeInterview=copy(interview);
  await click('Save & close',workspace());expect(document.querySelector('[role="alert"]')).toBeTruthy();expect(api.put).not.toHaveBeenCalled();
  expect(interview).toEqual(beforeInterview);expect(native).toEqual(beforeNative);expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toContain('Synthetic uncertainty');
});

test('a native writer after the refresh read remains protected by the server base guard',async()=>{
  await render();await nativeSave();await open();await answer();const read=api.get.getMockImplementation();
  api.get.mockImplementationOnce(async(...args)=>{const response=await read(...args);native={...native,implementation:'Winner after refresh read',last_saved:tokenC};return response;});
  await click('Save & close',workspace());expect(document.querySelector('[role="alert"]')?.textContent).toBe(conflict);expect(interview.revision).toBe(0);
  expect(native.implementation).toBe('Winner after refresh read');expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toContain('Synthetic uncertainty');expect(api.patch).toHaveBeenCalledTimes(1);
});

test('leaving the assessment identity while its first-write refresh is pending cannot write the old interview',async()=>{
  await render();await nativeSave();await open();await answer();const read=api.get.getMockImplementation();let finish;
  api.get.mockImplementationOnce((...args)=>new Promise(resolve=>{finish=async()=>resolve(await read(...args));}));
  await click('Save & close',workspace());expect(finish).toBeDefined();
  const nextRecord={...record,framework_assessment_id:'synthetic-native-other'};
  await act(async()=>root.render(<FrameworkDrawer key="different-assessment" open record={nextRecord} clientId={nextRecord.client_id} onOpenChange={()=>{}}/>));
  await act(async()=>finish());expect(api.put).not.toHaveBeenCalled();expect(api.patch).toHaveBeenCalledTimes(1);expect(interview.revision).toBe(0);expect(native.implementation).toBe('SYNTHETIC QA native preservation marker.');
});
