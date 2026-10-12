import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import {versionForSafeguard,visibleQuestions} from '@/lib/guidedAssessment';
import {focusedResult} from '@/lib/focusedOmni';
import {localCalendarDate} from '@/lib/calendarView';
import api from '@/lib/api';

// Real parent/guide rendering with controlled read timing and modeled CAS.
// No network, Mongo, hosted authentication or role-enforcement proof.
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'timing-qa',role:'super_admin'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClient:{client_id:'timing-client',name:'Synthetic timing QA'},clients:[{client_id:'timing-client',name:'Synthetic timing QA'}]})}));
jest.mock('./AssigneeSelect',()=>()=>null);
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('./ui/dialog',()=>{
  const R=require('react');
  return {Dialog:({open,children})=>open?<div>{children}</div>:null,DialogContent:({children})=><div>{children}</div>,DialogTitle:R.forwardRef(({children},ref)=><h2 ref={ref}>{children}</h2>),DialogDescription:({children})=><p>{children}</p>};
});

const copy=value=>JSON.parse(JSON.stringify(value));
const tokenA='2026-10-11T12:00:00Z',tokenB='2026-10-11T12:01:00Z',fingerprint='e'.repeat(64);
const detail='SYNTHETIC typed uncertainty. Preserve this exact text.';
let root,container,record,native,interview,nativeHistory,holdRefresh,pending;
const workspace=()=>document.querySelector('.omni-workspace-window');
const readInterview=()=>({...copy(interview),current_assessment_token:native.last_saved,current_scope_fingerprint:fingerprint,lineage_known:true,lineage_stale:interview.base_assessment_token!==native.last_saved});
const readWorkspace=()=>({configuration:{implementation_group:3},assessments:[copy(native)],work:{[native.framework_assessment_id]:{context_complete:true,open_findings:0,open_actions:0,overdue_reviews:0,priority_records:[]}}});
async function click(name,scope=document){const target=[...scope.querySelectorAll('button')].find(button=>button.textContent.trim()===name);expect(target).toBeTruthy();expect(target.disabled).toBe(false);await act(async()=>target.click());}
async function value(selector,next){const target=document.querySelector(selector);expect(target).toBeTruthy();await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(target,next);target.dispatchEvent(new Event('input',{bubbles:true}));});}
async function render(){await act(async()=>root.render(<FrameworkDrawer open record={record} clientId={record.client_id} onOpenChange={()=>{}}/>));}
async function open(){const launcher=document.querySelector('[aria-label="Open Omnibot guide"]');expect(launcher).toBeTruthy();await act(async()=>launcher.click());}
async function typeAndMinimize(){await open();await click('Not sure',workspace());await value('[aria-label="Known gaps or uncertainties"]',detail);await act(async()=>workspace().querySelector('[aria-label="Minimize Omnibot Guide"]').click());expect(workspace()).toBeNull();}
async function nativeSave(){await value('[aria-label="Current implementation"]','SYNTHETIC native receipt B.');await click('Save assessment',container);expect(container.textContent).toContain('Assessment saved.');expect(native.last_saved).toBe(tokenB);}

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();window.history.replaceState({},'','/');
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  native={client_id:'timing-client',framework_key:'cis-ig1',framework_assessment_id:'timing-1.1',definition_id:'1.1',title:'Inventory',status:'not_assessed',verification:'not_verified',implementation:'',technology:'Retained technology',notes:'Retained native notes',owner_id:null,na_rationale:'',last_saved:tokenA,assessment_history:[]};
  record=copy(native);nativeHistory=[];holdRefresh=false;pending=[];
  interview={client_id:native.client_id,assessment_id:native.framework_assessment_id,user_id:'timing-qa',version:versionForSafeguard('1.1'),revision:0,answers:{},step:0,completed:false,narrative:'',result:null,base_assessment_token:tokenA,base_scope_fingerprint:fingerprint};
  api.get.mockImplementation(async path=>{
    if(path.startsWith('/frameworks/')){const data=readWorkspace();if(holdRefresh)return new Promise((resolve,reject)=>pending.push({resolve,reject,data}));return {data};}
    return {data:path.endsWith('/guided-assessment/history')?{items:[],next_before_revision:null}:path.endsWith('/guided-assessment')?readInterview():path.endsWith('/related')?{reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]}:[]};
  });
  api.patch.mockImplementation(async(_path,body)=>{
    if(body.expected_last_assessed!==native.last_saved)throw new Error('Native assessment changed; reload before saving');
    const {expected_last_assessed,...fields}=body;nativeHistory.push(copy(native));native={...native,...copy(fields),last_saved:tokenB,assessment_history:copy(nativeHistory)};return {data:copy(native)};
  });
  api.put.mockImplementation(async(_path,body)=>{
    if(body.expected_revision!==interview.revision)throw new Error('Interview changed; reload before saving');
    if(!interview.revision||body.restart||body.rebase){if(body.base_assessment_token!==native.last_saved||body.base_scope_fingerprint!==fingerprint)throw new Error('Assessment or scope changed before this review started; reload before starting');}
    const {expected_revision,...fields}=body;interview={...interview,...copy(fields),revision:interview.revision+1};return {data:readInterview()};
  });
});
afterEach(async()=>{holdRefresh=false;await act(async()=>root.unmount());container.remove();await act(async()=>{pending.splice(0).forEach(read=>read.resolve({data:read.data}));});jest.clearAllMocks();});

test('immediate context refresh retains minimized fresh input and saves progress against native receipt B',async()=>{
  await render();await typeAndMinimize();await nativeSave();const savedNative=copy(native);await open();expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(detail);
  await click('Save & close',workspace());expect(interview.revision).toBe(1);expect(interview.base_assessment_token).toBe(tokenB);expect(interview.answers.inventory_detail).toBe(detail);expect(native).toEqual(savedNative);expect(nativeHistory).toHaveLength(1);
});

test('pending context refresh must not leave the first minimized-guide progress write on superseded native token A',async()=>{
  await render();await typeAndMinimize();holdRefresh=true;await nativeSave();expect(pending).toHaveLength(1);const savedNative=copy(native);
  await open();expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(detail);await click('Save & close',workspace());
  expect(api.put.mock.calls.at(-1)[1].base_assessment_token).toBe(tokenB);expect(interview.revision).toBe(1);expect(interview.answers.inventory_detail).toBe(detail);expect(native).toEqual(savedNative);expect(nativeHistory).toHaveLength(1);
});

test('pending context refresh must retain persisted manual interview and require explicit comparison after native receipt B',async()=>{
  interview={...interview,revision:1,answers:{inventory:'No',inventory_detail:'Previously saved note'},narrative:'Previously reviewed manual wording.\nExact retained second line.'};const original=copy(interview);
  await render();await typeAndMinimize();holdRefresh=true;await nativeSave();expect(pending).toHaveLength(1);const savedNative=copy(native);await open();await click('Save & close',workspace());
  expect(api.put).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="Compare saved assessment"]')).toBeTruthy();expect(interview).toEqual(original);expect(native).toEqual(savedNative);expect(nativeHistory).toHaveLength(1);expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(detail);
});

test('failed context refresh after confirmed native save reports its error and retry without discarding minimized unsaved input',async()=>{
  await render();await typeAndMinimize();holdRefresh=true;await nativeSave();expect(pending).toHaveLength(1);const savedNative=copy(native);
  await act(async()=>pending.splice(0).forEach(read=>read.reject(new Error('Synthetic joined context refresh failed'))));
  expect(container.textContent).toContain('Synthetic joined context refresh failed');expect(native).toEqual(savedNative);expect(api.put).not.toHaveBeenCalled();await open();expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(detail);
  const saveClose=[...workspace().querySelectorAll('button')].find(button=>button.textContent.trim()==='Save & close');expect(saveClose.disabled).toBe(true);await act(async()=>saveClose.click());expect(api.put).not.toHaveBeenCalled();expect(api.patch).toHaveBeenCalledTimes(1);expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
  holdRefresh=false;await click('Retry',container);expect(native).toEqual(savedNative);expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(detail);
  await click('Save & close',workspace());expect(interview.revision).toBe(1);expect(interview.base_assessment_token).toBe(tokenB);expect(interview.answers.inventory_detail).toBe(detail);expect(native).toEqual(savedNative);expect(nativeHistory).toHaveLength(1);
});

test.each(['client','assessment'])('unavailable context never reuses cached guide eligibility after a %s identity switch',async kind=>{
  await render();await typeAndMinimize();holdRefresh=true;await nativeSave();await act(async()=>pending.splice(0).forEach(read=>read.reject(new Error('Synthetic joined context refresh failed'))));
  const nextRecord={...record,framework_assessment_id:'timing-next',...(kind==='client'?{client_id:'timing-other-client'}:{})};
  await act(async()=>root.render(<FrameworkDrawer open record={nextRecord} clientId={nextRecord.client_id} onOpenChange={()=>{}}/>));
  expect(document.querySelector('[aria-label="Open Omnibot guide"]')).toBeNull();expect(workspace()).toBeNull();expect(api.put).not.toHaveBeenCalled();expect(api.patch).toHaveBeenCalledTimes(1);expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
});

test('failed-context retry retains persisted manual wording and still requires explicit comparison',async()=>{
  interview={...interview,revision:1,answers:{inventory:'No',inventory_detail:'Previously saved note'},narrative:'Previously reviewed manual wording.\nExact retained second line.'};const original=copy(interview);
  await render();await typeAndMinimize();holdRefresh=true;await nativeSave();const savedNative=copy(native);await act(async()=>pending.splice(0).forEach(read=>read.reject(new Error('Synthetic joined context refresh failed'))));
  await open();expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(detail);const saveClose=[...workspace().querySelectorAll('button')].find(button=>button.textContent.trim()==='Save & close');expect(saveClose.disabled).toBe(true);expect(api.put).not.toHaveBeenCalled();
  holdRefresh=false;await click('Retry',container);await click('Save & close',workspace());expect(document.querySelector('[aria-label="Compare saved assessment"]')).toBeTruthy();expect(api.put).not.toHaveBeenCalled();expect(interview).toEqual(original);expect(native).toEqual(savedNative);expect(nativeHistory).toHaveLength(1);expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(detail);
});

test('a successful context refresh omitting the selected assessment cannot reactivate earlier cached guide eligibility',async()=>{
  await render();await typeAndMinimize();holdRefresh=true;await nativeSave();expect(pending).toHaveLength(1);const savedNative=copy(native);
  await act(async()=>pending.splice(0).forEach(read=>read.resolve({data:{...read.data,assessments:[]}})));
  expect(document.querySelector('[aria-label="Open Omnibot guide"]')).toBeNull();expect(workspace()).toBeNull();expect(native).toEqual(savedNative);expect(nativeHistory).toHaveLength(1);expect(api.put).not.toHaveBeenCalled();expect(api.patch).toHaveBeenCalledTimes(1);expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
});

test('in-flight first progress rechecks unavailable context before PUT and resumes only after retry',async()=>{
  await render();await typeAndMinimize();holdRefresh=true;await nativeSave();expect(pending).toHaveLength(1);const savedNative=copy(native);await open();const read=api.get.getMockImplementation();let finishMetadata;
  api.get.mockImplementationOnce((...args)=>new Promise(resolve=>{expect(args[0]).toMatch(/\/guided-assessment$/);finishMetadata=async()=>resolve(await read(...args));}));
  await click('Save & close',workspace());expect(finishMetadata).toBeDefined();expect(api.put).not.toHaveBeenCalled();
  await act(async()=>pending.splice(0).forEach(response=>response.reject(new Error('Synthetic context failed while progress awaits'))));
  expect(container.textContent).toContain('Synthetic context failed while progress awaits');const saveClose=[...workspace().querySelectorAll('button')].find(button=>button.textContent.trim()==='Save & close');expect(saveClose.disabled).toBe(true);expect(native).toEqual(savedNative);
  await act(async()=>finishMetadata());expect(api.put).not.toHaveBeenCalled();expect(interview.revision).toBe(0);expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(detail);expect(container.textContent).toContain('Synthetic context failed while progress awaits');expect(api.patch).toHaveBeenCalledTimes(1);expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
  holdRefresh=false;await click('Retry',container);expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(detail);await click('Save & close',workspace());expect(interview.revision).toBe(1);expect(interview.base_assessment_token).toBe(tokenB);expect(interview.answers.inventory_detail).toBe(detail);expect(native).toEqual(savedNative);expect(nativeHistory).toHaveLength(1);
});

test('in-flight deliberate comparison rechecks unavailable context before rebase PUT',async()=>{
  interview={...interview,revision:1,answers:{inventory:'No',inventory_detail:'Previously saved note'},narrative:'Previously reviewed manual wording.\nExact retained second line.'};const original=copy(interview);
  await render();await typeAndMinimize();holdRefresh=true;await nativeSave();const savedNative=copy(native);await open();await click('Save & close',workspace());
  const comparison=document.querySelector('[aria-label="Compare saved assessment"]');expect(comparison).toBeTruthy();await act(async()=>comparison.querySelector('input').click());
  const read=api.get.getMockImplementation();let finishMetadata;
  api.get.mockImplementationOnce((...args)=>new Promise(resolve=>{expect(args[0]).toMatch(/\/guided-assessment$/);finishMetadata=async()=>resolve(await read(...args));}));
  await click('Retain answers & continue',comparison);expect(finishMetadata).toBeDefined();expect(api.put).not.toHaveBeenCalled();
  await act(async()=>pending.splice(0).forEach(response=>response.reject(new Error('Synthetic context failed while comparison awaits'))));
  expect(container.textContent).toContain('Synthetic context failed while comparison awaits');expect([...workspace().querySelectorAll('button')].find(button=>button.textContent.trim()==='Retain answers & continue').disabled).toBe(true);expect(native).toEqual(savedNative);
  await act(async()=>finishMetadata());expect(api.put).not.toHaveBeenCalled();expect(interview).toEqual(original);expect(native).toEqual(savedNative);expect(nativeHistory).toHaveLength(1);expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(detail);expect(container.textContent).toContain('Synthetic context failed while comparison awaits');expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
});

test('in-flight summary progress response cannot initiate native PATCH after context failure',async()=>{
  // This supported completed fixture isolates save ordering, not status-rule proof.
  const answers=Object.fromEntries(visibleQuestions('1.1',{inventory:'Yes'},interview.version).map(question=>[question.id,question.type==='matrix'?Object.fromEntries(question.rows.map(row=>[row,'Yes'])):question.type==='text'?'':question.type==='date'?localCalendarDate(new Date()):question.type==='multi'?['Quarantine or isolate']:question.id==='frequency'?'Every six months':question.id==='sources'?'One source':question.id==='unresolved'?'No':'Yes']));
  const result=focusedResult('1.1',answers,interview.version);expect(result.status).toBe('addressed');
  interview={...interview,revision:2,answers,completed:true,result,narrative:result.narrative,generated_at:'2026-10-11T12:00:30Z'};
  await render();await open();const manual='OVERVIEW\nSynthetic reviewer wording.\n\nIMPLEMENTATION BREAKDOWN\n- Retain this exact bullet.\n\nITEMS TO ADDRESS\n- Confirm synthetic notes.';
  await value('[aria-label="Omnibot implementation summary"]',manual);
  // A rejected ordinary save supplies the existing Retry control without changing
  // the persisted native record/token. Reverting its draft restores a clean form.
  api.patch.mockRejectedValueOnce(new Error('Synthetic preparatory native save rejected'));
  await value('[aria-label="Current implementation"]','SYNTHETIC rejected native draft.');await click('Save assessment',container);expect(container.textContent).toContain('Synthetic preparatory native save rejected');await value('[aria-label="Current implementation"]','');
  const savedNative=copy(native);holdRefresh=true;await click('Retry',container);expect(pending).toHaveLength(1);expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(manual);
  const write=api.put.getMockImplementation();let finishProgress;
  api.put.mockImplementationOnce((...args)=>new Promise(resolve=>{finishProgress=async()=>resolve(await write(...args));}));
  await click('Save assessment',workspace());expect(finishProgress).toBeDefined();expect(api.put).toHaveBeenCalledTimes(1);expect(api.patch).toHaveBeenCalledTimes(1);
  await act(async()=>pending.splice(0).forEach(response=>response.reject(new Error('Synthetic context failed while summary awaits'))));
  expect(container.textContent).toContain('Synthetic context failed while summary awaits');expect([...workspace().querySelectorAll('button')].find(button=>button.textContent.trim()==='Save assessment').disabled).toBe(true);expect(native).toEqual(savedNative);
  await act(async()=>finishProgress());expect(api.patch).toHaveBeenCalledTimes(1);expect(native).toEqual(savedNative);expect(nativeHistory).toHaveLength(0);expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(manual);expect(container.textContent).toContain('Synthetic context failed while summary awaits');expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
});

test('queued older joined context response cannot supersede the later confirmed native receipt',async()=>{
  const tokenC='2026-10-11T12:02:00Z';
  await render();await typeAndMinimize();holdRefresh=true;await nativeSave();expect(pending).toHaveLength(1);const older=pending.shift();
  let finishNative;
  api.patch.mockImplementationOnce((_path,body)=>new Promise(resolve=>{
    expect(body.expected_last_assessed).toBe(tokenB);
    finishNative=()=>{const {expected_last_assessed,...fields}=body;nativeHistory.push(copy(native));native={...native,...copy(fields),last_saved:tokenC,assessment_history:copy(nativeHistory)};resolve({data:copy(native)});queueMicrotask(()=>older.resolve({data:older.data}));};
  }));
  await value('[aria-label="Current implementation"]','SYNTHETIC native receipt C.');await click('Save assessment',container);expect(finishNative).toBeDefined();await act(async()=>finishNative());expect(native.last_saved).toBe(tokenC);expect(pending).toHaveLength(1);const savedNative=copy(native);
  await open();expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(detail);await click('Save & close',workspace());expect(interview.revision).toBe(1);expect(interview.base_assessment_token).toBe(tokenC);expect(native).toEqual(savedNative);expect(nativeHistory).toHaveLength(2);expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
});
