import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import GuidedAssessor from './GuidedAssessor';
import {versionForSafeguard,visibleQuestions,catalogForVersion,legacyVersionForSafeguard} from '@/lib/guidedAssessment';
import control1V4 from '@catalogs/guidedControl1V4.json';
import control1V5 from '@catalogs/guidedControl1V5.json';
import {focusedResult} from '@/lib/focusedOmni';
import api from '@/lib/api';

let mockAuth,mockOrg,mockTrustedDemo;
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:error=>error.message,get PREVIEW_MODE(){return mockTrustedDemo;}}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));

const token='2026-10-01T12:00:00Z',newToken='2026-10-02T12:00:00Z',generated='2026-10-01T13:00:00Z',fingerprint='a'.repeat(64);
let root,container,stored,history,props,scopeFingerprint;
const copy=value=>JSON.parse(JSON.stringify(value));
const button=name=>[...document.querySelectorAll('button')].find(element=>element.textContent.trim()===name);
const work=()=>({context_complete:true,finding_ids:[],review_ids:[],task_ids:[],open_findings:0,open_actions:0,overdue_reviews:0,overdue_actions:0,priority_records:[]});
const record=id=>({client_id:'demo_brawndo',framework_key:'cis-ig1',framework_version:'8.1',framework_assessment_id:'focused-'+id,definition_id:id,title:'Synthetic lifecycle safeguard '+id,status:'not_assessed',verification:'not_verified',implementation:'',last_saved:token,assessment_history:[],work:work()});
const interview=id=>({client_id:'demo_brawndo',assessment_id:'focused-'+id,user_id:'focused-actor',version:versionForSafeguard(id,true),revision:0,answers:{},step:0,completed:false,narrative:'',result:null,base_assessment_token:token,base_scope_fingerprint:fingerprint,current_scope_fingerprint:fingerprint,lineage_known:true});
function completeAnswers(id){
  const version=versionForSafeguard(id,true),rootAnswer={[id==='1.1'?'inventory':'process']:'Yes'},today=new Date(),day=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  return Object.fromEntries(visibleQuestions(id,rootAnswer,version).map(question=>[question.id,question.optional?'No':question.type==='matrix'?Object.fromEntries(question.rows.map(row=>[row,'Yes'])):question.type==='text'?question.id==='system'?'OriginalTool':question.id==='owner'?'Synthetic IT team':'':question.type==='date'?day:question.type==='multi'?['Quarantine or isolate']:question.id==='frequency'?(id==='1.1'?'Every six months':'Weekly'):question.id==='sources'?'One source':question.id==='unresolved'?'No':'Yes']));
}
function completedSaved(id){
  const answers=completeAnswers(id),result=focusedResult(id,answers,versionForSafeguard(id,true));
  expect(result.status).toBe('addressed');
  stored={...interview(id),revision:3,answers,completed:true,result,narrative:result.narrative,generated_at:generated,updated_at:generated};
  const current={...record(id),status:'addressed',last_saved:newToken,implementation:result.narrative,guided_assessment_source:{origin:'guided-assessment-pilot',by:'focused-actor',version:stored.version,revision:stored.revision,generated_at:generated}};
  props={...props,record:current,current,form:copy(current)};
}
const readStored=()=>({...copy(stored),current_assessment_token:props.current.last_saved,current_scope_fingerprint:scopeFingerprint,lineage_stale:stored.base_assessment_token!==props.current.last_saved||stored.base_scope_fingerprint!==scopeFingerprint});
async function render(extra={}){props={...props,...extra};await act(async()=>root.render(<GuidedAssessor {...props}/>));}
async function remount(){await act(async()=>root.unmount());root=createRoot(container);await render();}
async function open(){await act(async()=>document.querySelector('[aria-label="Open Omnibot guide"]').click());}
async function click(name){const target=button(name);expect(target).toBeTruthy();expect(target.disabled).toBe(false);await act(async()=>target.click());}
async function value(selector,next){const target=document.querySelector(selector);expect(target).toBeTruthy();const prototype=target.tagName==='SELECT'?HTMLSelectElement.prototype:target.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(target,next);target.dispatchEvent(new Event(target.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
async function confirmComparison(){const group=document.querySelector('[aria-label="Compare saved assessment"]');expect(group).toBeTruthy();expect(button('Retain answers & continue').disabled).toBe(true);await act(async()=>group.querySelector('input').click());await click('Retain answers & continue');}

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();window.history.replaceState({},'', '/');
  mockAuth={user:{user_id:'focused-actor',workspace_mode:'demo'}};mockOrg=null;mockTrustedDemo=false;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  const current=record('1.1');stored=interview('1.1');history=[];scopeFingerprint=fingerprint;
  props={clientId:'demo_brawndo',framework:'cis-ig1',configuration:{implementation_group:1},record:current,current,form:copy(current),contextComplete:true,related:{},onApply:jest.fn(),onSaveAssessment:jest.fn(async()=>true),onDraftChange:jest.fn(),onUpdateImplementation:jest.fn(()=>true)};
  api.get.mockImplementation(async path=>({data:path.endsWith('/history')?{items:copy(history),next_before_revision:null}:readStored()}));
  api.put.mockImplementation(async (_path,body)=>{
    if(body.expected_revision!==stored.revision)throw new Error('Interview changed in another window; reload before saving');
    if(stored.revision&&(stored.completed||body.restart||body.rebase)&&!history.some(item=>item.revision===stored.revision))history.push(copy(stored));
    const base=body.restart||body.rebase||!stored.revision?{base_assessment_token:body.base_assessment_token,base_scope_fingerprint:body.base_scope_fingerprint}:{base_assessment_token:stored.base_assessment_token,base_scope_fingerprint:stored.base_scope_fingerprint};
    stored={...stored,...copy(body),...base,revision:stored.revision+1,updated_at:generated,generated_at:body.completed?generated:null};
    return {data:readStored()};
  });
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each(['1.1','1.2'])('incomplete %s saves only the interview and reopens its context',async id=>{
  stored=interview(id);const current=record(id);props={...props,record:current,current,form:copy(current)};
  await render();await open();await click('No');await value('[aria-label="Known gaps or uncertainties"]','Synthetic context awaiting confirmation');
  await click('Save & close');expect(stored.answers[id==='1.1'?'inventory':'process']).toBe('No');expect(props.onApply).not.toHaveBeenCalled();
  await remount();await open();expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toContain('Synthetic context');expect(button('No').getAttribute('aria-pressed')).toBe('true');
});

test('failed Save & next retains the group and permits retry',async()=>{
  await render();await open();await click('No');api.put.mockRejectedValueOnce(new Error('Synthetic save failure'));
  await click('Save & next');expect(document.body.textContent).toContain('Synthetic save failure');expect(document.querySelector('[aria-label="Question group 1 of 5"]')).toBeTruthy();expect(stored.revision).toBe(0);
  await click('Save & next');expect(stored.revision).toBe(1);expect(props.onApply).not.toHaveBeenCalled();
});

test('failed Save & close keeps the window open',async()=>{
  await render();await open();await click('Not sure');api.put.mockRejectedValueOnce(new Error('Synthetic persistence failure'));
  await click('Save & close');expect(document.body.textContent).toContain('Synthetic persistence failure');expect(button('Save & close')).toBeTruthy();expect(stored.revision).toBe(0);
});

test('unanswered root is not silently defaulted',async()=>{
  await render();await open();expect(button('Yes').getAttribute('aria-pressed')).toBe('false');await click('Save & next');expect(api.put).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Choose an answer before continuing');
});

test('concurrency rejection retains local input',async()=>{
  await render();await open();await click('Partially');stored.revision=7;await click('Save & close');expect(document.body.textContent).toContain('Interview changed in another window');expect(button('Partially').getAttribute('aria-pressed')).toBe('true');expect(props.onApply).not.toHaveBeenCalled();
});

test('edited summary survives an incomplete checkpoint and requires fresh review',async()=>{
  stored={...interview('1.1'),revision:2,answers:completeAnswers('1.1'),completed:true,result:focusedResult('1.1',completeAnswers('1.1'),versionForSafeguard('1.1',true)),narrative:'Original reviewed summary',generated_at:generated};
  await render();await open();await value('[aria-label="Omnibot implementation summary"]','Operator reviewed synthetic wording');await click('Back to questions');expect(document.body.textContent).toContain('Question group 5 of 5');for(let i=0;i<4;i++)await click('Back');
  await value('[aria-label="Who keeps it up to date?"]','Changed synthetic owner');await click('Save & close');
  expect(stored.completed).toBe(false);expect(stored.narrative).toBe('Operator reviewed synthetic wording');expect(history[0].narrative).toBe('Original reviewed summary');
  await remount();await open();expect(stored.narrative).toBe('Operator reviewed synthetic wording');expect(props.onApply).not.toHaveBeenCalled();
});

test.each(['1.2'])('%s saves the exact reviewed summary through the authoritative native adapter',async id=>{
  const current=record(id);props={...props,record:current,current,form:copy(current)};const answers=completeAnswers(id),result=focusedResult(id,answers,versionForSafeguard(id,true));
  stored={...interview(id),revision:2,answers,completed:true,result,narrative:result.narrative,generated_at:generated};
  await render();await open();await click('Save assessment');
  expect(props.onApply).not.toHaveBeenCalled();expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);const applied=props.onSaveAssessment.mock.calls[0][0];expect(applied.guided_assessment_source.revision).toBe(stored.revision);expect(applied.implementation).toBe(stored.narrative);expect(props.current.status).toBe('not_assessed');expect(props.current.verification).toBe('not_verified');expect(props.current.last_saved).toBe(token);
});

test('failed completed-summary persistence does not apply native fields',async()=>{
  const answers=completeAnswers('1.1'),result=focusedResult('1.1',answers,versionForSafeguard('1.1',true));stored={...interview('1.1'),revision:2,answers,completed:true,result,narrative:result.narrative,generated_at:generated};
  await render();await open();api.put.mockRejectedValueOnce(new Error('Synthetic completed save failure'));await click('Save assessment');expect(props.onApply).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Synthetic completed save failure');
});

test('a native draft edit during summary persistence prevents stale application',async()=>{
  const answers=completeAnswers('1.1'),result=focusedResult('1.1',answers,versionForSafeguard('1.1',true));stored={...interview('1.1'),revision:2,answers,completed:true,result,narrative:result.narrative,generated_at:generated};
  await render();await open();let resolveWrite;const write=api.put.getMockImplementation();api.put.mockImplementationOnce((...args)=>new Promise(resolve=>{resolveWrite=()=>resolve(write(...args));}));
  await click('Save assessment');await render({form:{...props.form,implementation:'Concurrent synthetic native draft'},assessmentDirty:true});await act(async()=>resolveWrite());
  expect(props.onApply).not.toHaveBeenCalled();expect(document.body.textContent).toContain('native assessment changed while saving');expect(props.form.implementation).toBe('Concurrent synthetic native draft');
});

test('Back does not remove close protection for unsaved summary wording',async()=>{
  const answers=completeAnswers('1.1'),result=focusedResult('1.1',answers,versionForSafeguard('1.1',true));stored={...interview('1.1'),revision:2,answers,completed:true,result,narrative:result.narrative,generated_at:generated};
  await render();await open();await value('[aria-label="Omnibot implementation summary"]','Unsaved operator summary');await click('Back to questions');
  await act(async()=>document.querySelector('[aria-label="Close Omnibot Guide"]').click());expect(document.body.textContent).toContain('Save your progress');expect(stored.narrative).toBe(result.narrative);expect(props.onApply).not.toHaveBeenCalled();
});

test('read-only pilot disables interview mutations',async()=>{
  await render({disabled:true});await open();expect(document.querySelector('.omni-question-group').disabled).toBe(true);expect(button('Save & next').disabled).toBe(true);expect(button('Save & close').disabled).toBe(true);expect(api.put).not.toHaveBeenCalled();
});

test('focused invitation has only X and window has no position menu',async()=>{
  await render();expect(document.querySelectorAll('.guided-context-prompt button')).toHaveLength(1);expect(document.querySelector('.guided-context-prompt button').getAttribute('aria-label')).toBe('Close invitation');
  await open();expect(document.querySelector('.omni-window-controls details')).toBeNull();expect(document.querySelectorAll('.omni-window-controls button')).toHaveLength(3);
});

test('source explanation survives option changes, Back, save and reopening',async()=>{
  await render();await open();await click('Yes');const selector='[aria-label="Do you use one inventory or combine several sources?"]';
  await value(selector,'Multiple reconciled sources');await value('#omni-source-details','Synthetic endpoint and network records');await value('[aria-label="Known gaps or uncertainties"]','Synthetic inventory contact');
  await value(selector,'One source');expect(document.querySelector('#omni-source-details')).toBeNull();await value(selector,'Multiple unreconciled sources');expect(document.querySelector('#omni-source-details').value).toContain('Synthetic endpoint');
  await click('Save & next');await click('Back');expect(document.querySelector('#omni-source-details').value).toContain('Synthetic endpoint');expect(document.querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe('Synthetic inventory contact');
  await click('Save & close');expect(stored.answers.sources_detail).toBe('Synthetic endpoint and network records');expect(stored.answers.sources).toBe('Multiple unreconciled sources');await remount();await open();
  if(!document.querySelector('#omni-source-details'))await click('Back');
  expect(document.querySelector('#omni-source-details').value).toContain('Synthetic endpoint');expect(stored.answers.inventory).toBe('Yes');expect(props.onApply).not.toHaveBeenCalled();
});

test('date input survives a following edit and persists through the interview save',async()=>{
  const answers=completeAnswers('1.1');delete answers.last_review;stored={...interview('1.1'),revision:2,answers};
  await render();await open();await value('[aria-label="When was the last complete review?"]','2026-10-09');await value('[aria-label="Known gaps or uncertainties"]','Synthetic date-entry check');
  expect(document.querySelector('[aria-label="When was the last complete review?"]').value).toBe('2026-10-09');await click('Save & close');expect(stored.answers.last_review).toBe('2026-10-09');
});

test('maintenance context does not overwrite the recorded update process',async()=>{
  const answers=completeAnswers('1.1');delete answers.maintenance;stored={...interview('1.1'),revision:2,answers};
  await render();await open();await click('Yes');await value('[aria-label="How are those changes handled?"]','Synthetic update process');await value('[aria-label="Known gaps or uncertainties"]','Synthetic contact needs confirmation');await click('Save & close');
  expect(stored.answers.maintenance_detail).toBe('Synthetic update process');expect(stored.answers.maintenance_detail_detail).toBe('Synthetic contact needs confirmation');
});

test('existing native wording goes directly to summary and edited wording survives later answers',async()=>{
  const answers=completeAnswers('1.1');delete answers.frequency;stored={...interview('1.1'),revision:2,answers};const current={...record('1.1'),implementation:'Retained synthetic manual context'};props={...props,record:current,current,form:copy(current)};
  await render();await open();await value('[aria-label="How often is the complete inventory reviewed?"]','Every six months');await click('Save & next');
  expect(document.querySelector('[aria-label="Reconcile implementation narrative"]')).toBeNull();expect(document.body.textContent).toContain('Review your assessment summary');
  await value('[aria-label="Omnibot implementation summary"]','Reviewed synthetic wording retains the manual context.');
  await click('Back to questions');for(let i=0;i<4;i++)await click('Back');await value('[aria-label="Who keeps it up to date?"]','Changed synthetic team');await click('Save & close');
  expect(stored.narrative).toBe('Reviewed synthetic wording retains the manual context.');expect(props.current.implementation).toBe('Retained synthetic manual context');expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('own applied interview continues without acknowledgment; a CAS rejection preserves history and answers',async()=>{
  completedSaved('1.1');const original=copy(stored);history=[{...original,revision:1,narrative:'Earlier preserved snapshot'}];const previousHistory=copy(history);
  await render();await open();await click('Back to questions');for(let i=0;i<4;i++)await click('Back');
  await value('[aria-label="Where do you maintain your inventory?"]','ChangedTool');
  api.put.mockRejectedValueOnce(new Error('Interview changed in another window; reload before saving'));await click('Save & next');
  expect(stored).toEqual(original);expect(history).toEqual(previousHistory);expect(document.body.textContent).toContain('Interview changed in another window');expect(document.querySelector('[aria-label="Where do you maintain your inventory?"]').value).toBe('ChangedTool');
  expect(document.querySelector('[aria-label="Compare saved assessment"]')).toBeNull();expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await click('Save & next');expect(stored.answers.system).toBe('ChangedTool');expect(stored.answers.owner).toBe(original.answers.owner);expect(stored.base_assessment_token).toBe(newToken);expect(history.some(item=>item.revision===original.revision)).toBe(true);
});

test('a later scope change still requires comparison even when the native record retains the current guided source',async()=>{
  completedSaved('1.1');scopeFingerprint='b'.repeat(64);await render();
  expect(document.querySelector('.guided-context-prompt').textContent).toContain('compare your saved answers');
  expect(document.querySelector('.guided-context-prompt').textContent).not.toContain('Your implementation is saved');
  await open();expect(button('Compare & continue from saved assessment')).toBeTruthy();
  expect(api.put).not.toHaveBeenCalled();expect(props.onApply).not.toHaveBeenCalled();
});

function readySummary(){
  const answers=completeAnswers('1.1'),result=focusedResult('1.1',answers,versionForSafeguard('1.1',true));
  stored={...interview('1.1'),revision:2,answers,completed:true,result,narrative:'Reviewed Brawndo inventory narrative',generated_at:generated};
}

test('first-time summary save calls the native save once with durable interview linkage',async()=>{
  readySummary();await render();await open();await click('Save assessment');
  expect(props.onApply).not.toHaveBeenCalled();expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);
  expect(props.onSaveAssessment).toHaveBeenCalledWith({implementation:stored.narrative,status:'addressed',guided_assessment_source:{version:stored.version,revision:stored.revision,generated_at:generated}},JSON.stringify(props.form));
  expect(document.querySelector('.omni-workspace-window')).toBeNull();expect(props.current.verification).toBe('not_verified');
});

test('one complete editable write-up and actual title are saved byte-for-byte',async()=>{
  readySummary();props.record.title='Establish and Maintain Detailed Enterprise Asset Inventory';await render();await open();
  expect(document.body.textContent).toContain('Safeguard 1.1 — Establish and Maintain Detailed Enterprise Asset Inventory');expect(document.body.textContent).not.toContain('Safeguard 1.1 · Brawndo — CIS IG1');
  expect(document.querySelectorAll('[aria-label="Omnibot implementation summary"]')).toHaveLength(1);
  expect([...document.querySelectorAll('h3')].some(e=>e.textContent==='IMPLEMENTATION BREAKDOWN'||e.textContent==='ITEMS TO ADDRESS')).toBe(false);
  const reviewed='OVERVIEW\n\nReviewed organization prose.\n\nIMPLEMENTATION BREAKDOWN\n\nIn place\n- Operator-edited coverage.\n\nITEMS TO ADDRESS\n\n- Operator-edited next step.\n';
  await value('[aria-label="Omnibot implementation summary"]',reviewed);await click('Save assessment');expect(stored.narrative).toBe(reviewed);expect(props.onSaveAssessment.mock.calls[0][0].implementation).toBe(reviewed);
});
test('summary Save & close closes only after successful native save, and retains all text on failure',async()=>{
  readySummary();props.onSaveAssessment.mockResolvedValueOnce(false);await render();await open();const reviewed='OVERVIEW\n\nSynthetic overview.\n\nIMPLEMENTATION BREAKDOWN\n\n- Synthetic coverage.\n\nITEMS TO ADDRESS\n\n- Synthetic next step.';
  await value('[aria-label="Omnibot implementation summary"]',reviewed);await click('Save & close');expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(reviewed);expect(document.body.textContent).toContain('The assessment was not saved.');
  await click('Save & close');expect(props.onSaveAssessment).toHaveBeenCalledTimes(2);expect(props.onSaveAssessment.mock.calls[1][0].implementation).toBe(reviewed);expect(document.querySelector('[aria-label="Omnibot implementation summary"]')).toBeNull();
});
test('summary Save & close confirms replacement, cancellation retains work and native success closes',async()=>{
  readySummary();const current={...props.current,implementation:'Existing manual inventory',status:'in_progress'};props={...props,current,record:current,form:copy(current)};
  await render();await open();await click('Save & close');await click('Cancel');expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe('Reviewed Brawndo inventory narrative');
  await click('Save & close');await click('Yes, update assessment');expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);expect(document.querySelector('[aria-label="Omnibot implementation summary"]')).toBeNull();
});

test('replacement requires confirmation, cancel preserves native and interview work, confirm saves both',async()=>{
  readySummary();const current={...props.current,implementation:'Existing manual inventory',status:'in_progress'};props={...props,current,record:current,form:copy(current)};
  await render();await open();const original=copy(stored);await click('Update assessment');
  expect(document.body.textContent).toContain('Update this assessment?');await click('Cancel');
  expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(stored).toEqual(original);expect(props.current.implementation).toBe('Existing manual inventory');
  await click('Update assessment');await click('Yes, update assessment');expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);expect(props.onSaveAssessment.mock.calls[0][0].status).toBe('addressed');
});

test('native failure retains the reviewed summary and safely retries without success claim',async()=>{
  readySummary();props.onSaveAssessment.mockResolvedValueOnce(false);await render();await open();await click('Save assessment');
  expect(document.body.textContent).toContain('The assessment was not saved.');expect(document.body.textContent).not.toContain('Assessment saved.');
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe('Reviewed Brawndo inventory narrative');
  await click('Save assessment');expect(props.onSaveAssessment).toHaveBeenCalledTimes(2);expect(document.querySelector('.omni-workspace-window')).toBeNull();
});

test('duplicate clicks cannot submit two authoritative writes',async()=>{
  readySummary();let finish;props.onSaveAssessment.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await render();await open();
  const target=button('Save assessment');await act(async()=>{target.click();target.click();});expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.omni-workspace-window')).toBeTruthy();
  await act(async()=>finish(true));expect(document.querySelector('.omni-workspace-window')).toBeNull();
});

test('read-only and unsaved native edits disable summary saving',async()=>{
  readySummary();await render({disabled:true});await open();expect(button('Save assessment').disabled).toBe(true);expect(document.querySelector('[aria-label="Omnibot implementation summary"]').disabled).toBe(true);
  await render({disabled:false,assessmentDirty:true});expect(button('Save assessment').disabled).toBe(true);expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('changed answers refresh derived conclusions while explicitly preserving reviewed wording',async()=>{
  readySummary();await render();await open();await click('Back to questions');for(let i=0;i<4;i++)await click('Back');await click('No');
  while(button('Save & next'))await click('Save & next');
  expect(document.body.textContent).toContain('Review your assessment summary');expect(document.body.textContent).toContain('Not Implemented');
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe('Reviewed Brawndo inventory narrative');expect(button('Save assessment').disabled).toBe(true);
  await click('Refresh from answers');expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toContain('not currently in place');expect(button('Save assessment').disabled).toBe(false);
  expect(stored.answers.system).toBe('OriginalTool');expect(stored.result.narrative).not.toContain('OriginalTool');expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('inline completion saves the reviewed multiline report without mounting an Omni window',async()=>{
  stored={...interview('1.1'),revision:1,answers:completeAnswers('1.1')};
  const onInlineClose=jest.fn();await render({inline:true,inlineOpen:true,onInlineClose});
  expect(document.querySelector('.omni-launch-button')).toBeNull();expect(document.querySelector('.omni-workspace-window')).toBeNull();
  for(let count=0;button('Save & next')&&count<12;count++)await click('Save & next');
  expect(document.body.textContent).toContain('Review your assessment summary');
  const summary=document.querySelector('[aria-label="Omnibot implementation summary"]');
  expect(summary.value).toContain('\n\nControls in place\n• ');expect(summary.value).not.toMatch(/OVERVIEW|IMPLEMENTATION BREAKDOWN|ITEMS TO ADDRESS/);
  expect(props.onSaveAssessment).not.toHaveBeenCalled();await click('Save & close');
  expect(props.onSaveAssessment).toHaveBeenCalledWith(expect.objectContaining({implementation:summary.value,status:'addressed'}),expect.any(String));expect(onInlineClose).toHaveBeenCalledTimes(1);
});

test('inline reload retains reviewed wording, and changed-answer refresh keeps the approved format',async()=>{
  readySummary();await render({inline:true,inlineOpen:true});
  const section=document.querySelector('[aria-label="CIS assessment interview"]');
  await render({inlineOpen:false});expect(document.querySelector('[aria-label="CIS assessment interview"]')).toBe(section);expect(section.hidden).toBe(true);
  await render({inlineOpen:true});expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe('Reviewed Brawndo inventory narrative');
  await click('Back to questions');for(let i=0;i<4;i++)await click('Back');await click('No');
  for(let count=0;button('Save & next')&&count<12;count++)await click('Save & next');
  expect(button('Save assessment').disabled).toBe(true);await click('Refresh from answers');
  const text=document.querySelector('[aria-label="Omnibot implementation summary"]').value;
  expect(text).toContain('not currently in place');expect(text).toContain('Establish or complete the enterprise asset inventory.');
  expect(text).not.toContain('Controls in place');expect(text).not.toMatch(/OVERVIEW|IMPLEMENTATION BREAKDOWN|ITEMS TO ADDRESS/);expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test.each([['additional_gap','gaps'],['additional_confirmation','unknowns']])('a resumed checkpoint can reach an unfinished later %s without bypassing final validation',async(parent,detail)=>{
  enableBoundedDemoContext();
  const answers=completeAnswers('1.1');
  answers.coverage.Servers='Not sure';
  Object.assign(answers,{[parent]:'Yes',[detail]:'',coverage_detail:'Retain the reported coverage context.'});
  stored={...interview('1.1'),revision:2,answers};
  const nativeBefore=copy(props.current),version=stored.version,answersBefore=copy(answers);
  await render();await open();
  expect(document.querySelector('[aria-label="Question group 2 of 5"]')).toBeTruthy();

  await click('Save & next');
  expect(document.querySelector('[aria-label="Question group 3 of 5"]')).toBeTruthy();
  expect(api.put).toHaveBeenLastCalledWith('/framework_assessments/focused-1.1/guided-assessment',expect.objectContaining({
    version,expected_revision:2,completed:false,result:null,answers:answersBefore,
  }));
  expect(stored.version).toBe(version);expect(stored.answers).toEqual(answersBefore);
  await click('Save & next');await click('Save & next');
  expect(document.querySelector('[aria-label="Question group 5 of 5"]')).toBeTruthy();
  const checkpointWrites=api.put.mock.calls.length;
  await click('Save & next');
  expect(document.body.textContent).toContain('Describe the additional reported work before reviewing the summary.');
  expect(api.put).toHaveBeenCalledTimes(checkpointWrites);
  expect(stored.completed).toBe(false);
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]')).toBeNull();

  await value('#omni-answer-'+detail,'   ');await click('Save & next');
  expect(api.put).toHaveBeenCalledTimes(checkpointWrites);
  expect(document.body.textContent).toContain('Describe the additional reported work before reviewing the summary.');

  await value('#omni-answer-'+detail,'Synthetic requirement detail supplied after resuming.');
  await click('Save & next');
  expect(stored.completed).toBe(true);
  expect(stored.answers[detail]).toBe('Synthetic requirement detail supplied after resuming.');
  expect(stored.version).toBe(version);
  expect(stored.answers.coverage_detail).toBe(answersBefore.coverage_detail);
  expect(api.put.mock.calls.every(([,body])=>body.version===version)).toBe(true);
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]')).toBeTruthy();
  expectNativeUnchanged(nativeBefore);
});

function expectNativeUnchanged(nativeBefore){
  expect(props.current).toEqual(nativeBefore);expect(props.form).toEqual(nativeBefore);
  expect(props.onApply).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
  expect(props.onUpdateImplementation).not.toHaveBeenCalled();
}

function enableBoundedDemoContext(){
  mockTrustedDemo=true;mockAuth={user:{user_id:'focused-actor',role:'super_admin',workspace_mode:'demo'},workspaceMode:'demo',loading:false};
  const client={client_id:'demo_brawndo',status:'active'};
  mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false};
  sessionStorage.setItem('grc_client_id',client.client_id);
  window.history.replaceState({},'', '/compliance/cis-ig1?client_id=demo_brawndo');
}

const responseChoice=label=>[...document.querySelectorAll('.omni-response-choices label')]
  .find(element=>element.textContent.trim()===label)?.querySelector('input');
async function toggleResponse(label){
  const target=responseChoice(label);expect(target).toBeTruthy();expect(target.disabled).toBe(false);
  await act(async()=>target.click());
}
function expectResponses(labels){
  expect([...document.querySelectorAll('.omni-response-choices input:checked')]
    .map(input=>input.closest('label').textContent.trim())).toEqual(labels);
  expect(document.querySelector('[aria-label="Question group 3 of 5"]')).toBeTruthy();
}
async function openResponseCheckpoint(version){
  enableBoundedDemoContext();
  const current=record('1.2'),answers={process:'Yes',frequency:'Weekly',actions:[],actions_detail:'Preserve the reported response context.'};
  // Older question sets require earlier handling answers before resuming at response actions.
  for(const question of visibleQuestions('1.2',{process:'Yes'},version))if(question.critical&&answers[question.id]===undefined){
    answers[question.id]=question.type==='matrix'?Object.fromEntries(question.rows.map(row=>[row,'Yes']))
      :question.id==='unresolved'?'No':question.choices.includes('Yes')?'Yes':question.choices[0];
  }
  if(catalogForVersion(version).safeguards['1.2'].some(question=>question.id==='additional_confirmation')){
    Object.assign(answers,{additional_confirmation:'Yes',unknowns:''});
  }
  stored={...interview('1.2'),version,revision:2,answers};
  props={...props,record:current,current,form:copy(current)};
  await render();await open();
}

test.each([control1V4.version,control1V5.version])('%s response choices remain valid through ordinary clicks and checkpoint resume',async version=>{
  await openResponseCheckpoint(version);
  const nativeBefore=copy(props.current);
  await toggleResponse('Remove from network');expectResponses(['Remove from network']);
  await toggleResponse('Deny remote connection');expectResponses(['Remove from network','Deny remote connection']);
  await toggleResponse('Remove from network');expectResponses(['Deny remote connection']);
  await toggleResponse('None');expectResponses(['None']);
  await toggleResponse('Not sure');expectResponses(['Not sure']);
  await toggleResponse('None');expectResponses(['None']);
  await toggleResponse('Quarantine or isolate');expectResponses(['Quarantine or isolate']);
  await toggleResponse('Quarantine or isolate');expectResponses([]);
  await toggleResponse('Not sure');expectResponses(['Not sure']);
  await toggleResponse('Remove from network');expectResponses(['Remove from network']);
  await toggleResponse('None');expectResponses(['None']);
  expect(api.put).not.toHaveBeenCalled();

  await click('Save & close');
  expect(stored.completed).toBe(false);expect(stored.answers.actions).toEqual(['None']);
  expect(stored.version).toBe(version);expect(stored.answers.frequency).toBe('Weekly');
  expect(stored.answers.actions_detail).toBe('Preserve the reported response context.');
  expect(api.put).toHaveBeenLastCalledWith('/framework_assessments/focused-1.2/guided-assessment',expect.objectContaining({version,expected_revision:2,completed:false}));
  if(version===control1V5.version){
    expect(stored.answers.additional_confirmation).toBe('Yes');expect(stored.answers.unknowns).toBe('');
  }
  await remount();await open();expectResponses(['None']);
  expect(stored.version).toBe(version);expect(stored.answers.actions_detail).toBe('Preserve the reported response context.');
  expectNativeUnchanged(nativeBefore);
});

test('legacy response combinations retain their saved-version semantics',async()=>{
  const version=legacyVersionForSafeguard('1.2');await openResponseCheckpoint(version);
  const nativeBefore=copy(props.current);
  await toggleResponse('Remove from network');await toggleResponse('None');await toggleResponse('Not sure');
  expectResponses(['Remove from network','None','Not sure']);
  await click('Save & close');
  expect(stored.completed).toBe(false);
  expect(stored.answers.actions).toEqual(['Remove from network','None','Not sure']);
  expect(stored.version).toBe(version);expect(stored.answers.frequency).toBe('Weekly');
  expect(stored.answers.actions_detail).toBe('Preserve the reported response context.');
  expect(api.put).toHaveBeenLastCalledWith('/framework_assessments/focused-1.2/guided-assessment',expect.objectContaining({version,expected_revision:2,completed:false}));
  await remount();await open();expectResponses(['Remove from network','None','Not sure']);
  expect(stored.version).toBe(version);expectNativeUnchanged(nativeBefore);
});

test('partial progress still requires the current group source explanation',async()=>{
  enableBoundedDemoContext();
  const answers={...completeAnswers('1.1'),sources:'Multiple reconciled sources',sources_detail:'',additional_confirmation:'Yes',unknowns:''};
  stored={...interview('1.1'),revision:2,answers};
  const nativeBefore=copy(props.current);
  await render();await open();
  for(let steps=0;!document.querySelector('[aria-label="Question group 1 of 5"]')&&steps<5;steps++)await click('Back');
  expect(document.querySelector('[aria-label="Question group 1 of 5"]')).toBeTruthy();
  await click('Save & next');
  expect(document.body.textContent).toContain('List each source and what it covers, or record what still needs confirmation.');
  expect(api.put).not.toHaveBeenCalled();expect(stored.answers).toEqual(answers);
  expectNativeUnchanged(nativeBefore);
});

test('clearing and reselecting the enabled inventory frequency preserves a partial checkpoint',async()=>{
  enableBoundedDemoContext();
  const answers={...completeAnswers('1.1'),frequency:'Not sure',frequency_detail:'Retain the review timing explanation.'};
  stored={...interview('1.1'),revision:2,answers};
  const version=stored.version,nativeBefore=copy(props.current),expected=copy(answers);delete expected.frequency;
  await render();await open();
  expect(document.querySelector('#omni-answer-frequency').value).toBe('Not sure');
  await value('#omni-answer-frequency','');
  expect(document.querySelector('#omni-answer-frequency').value).toBe('');
  expect(api.put).not.toHaveBeenCalled();expectNativeUnchanged(nativeBefore);
  await click('Save & close');
  expect(api.put).toHaveBeenLastCalledWith('/framework_assessments/focused-1.1/guided-assessment',expect.objectContaining({version,expected_revision:2,completed:false,answers:expected}));
  expect(Object.prototype.hasOwnProperty.call(stored.answers,'frequency')).toBe(false);
  expect(stored.version).toBe(version);expect(stored.answers).toEqual(expected);
  await remount();await open();expect(document.querySelector('#omni-answer-frequency').value).toBe('');
  await value('#omni-answer-frequency','Every six months');await click('Save & close');
  expect(stored.answers).toEqual({...expected,frequency:'Every six months'});expect(stored.version).toBe(version);
  expect(api.put.mock.calls.every(([,body])=>body.version===version&&body.completed===false)).toBe(true);
  expectNativeUnchanged(nativeBefore);
});

test('clearing and reselecting a software requirement removes only that matrix row from progress',async()=>{
  enableBoundedDemoContext();
  const id='2.1',version=versionForSafeguard(id,true),questions=visibleQuestions(id,{practice:'Yes'},version);
  const answers=Object.fromEntries(questions.map(question=>[question.id,question.optional?'No':question.type==='matrix'?Object.fromEntries(question.rows.map(row=>[row,'Yes'])):question.type==='text'?'':question.id==='practice'?'Yes':question.choices[0]]));
  const matrix=questions.find(question=>question.type==='matrix'),row=matrix.rows.find(label=>label.includes('publisher'));
  expect(row).toBeTruthy();answers[matrix.id][row]='Not sure';answers[matrix.id+'_detail']='Retain the software requirement context.';
  const current=record(id);props={...props,record:current,current,form:copy(current)};
  stored={...interview(id),revision:2,answers};
  const nativeBefore=copy(current),expected=copy(answers);delete expected[matrix.id][row];
  const selector='select[aria-label="'+row+'"]';
  await render();await open();expect(document.querySelector(selector).value).toBe('Not sure');
  await value(selector,'');expect(document.querySelector(selector).value).toBe('');
  expect(api.put).not.toHaveBeenCalled();expectNativeUnchanged(nativeBefore);
  await click('Save & close');
  expect(api.put).toHaveBeenLastCalledWith('/framework_assessments/focused-2.1/guided-assessment',expect.objectContaining({version,expected_revision:2,completed:false,answers:expected}));
  expect(Object.prototype.hasOwnProperty.call(stored.answers[matrix.id],row)).toBe(false);
  expect(stored.answers).toEqual(expected);expect(stored.version).toBe(version);
  await remount();await open();expect(document.querySelector(selector).value).toBe('');
  await value(selector,'Yes');await click('Save & close');
  expect(stored.answers).toEqual({...expected,[matrix.id]:{...expected[matrix.id],[row]:'Yes'}});
  expect(stored.version).toBe(version);expect(api.put.mock.calls.every(([,body])=>body.version===version&&body.completed===false)).toBe(true);
  expectNativeUnchanged(nativeBefore);
});

const boundedContextNegatives=[
  ['untrusted preview',()=>{mockTrustedDemo=false;}],
  ['ordinary authenticated mode',()=>{mockAuth.workspaceMode='standard';mockAuth.user.workspace_mode='standard';}],
  ['auth mode mismatch',()=>{mockAuth.workspaceMode='standard';}],
  ['other client',()=>{
    const current={...props.current,client_id:'demo_dunder'};
    props={...props,clientId:'demo_dunder',record:current,current,form:copy(current)};
    const client={client_id:'demo_dunder',status:'active'};
    mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false};
    sessionStorage.setItem('grc_client_id',client.client_id);stored.client_id=client.client_id;
  }],
  ['IG2',()=>{props.configuration={implementation_group:2};}],
  ['IG3',()=>{props.configuration={implementation_group:3};}],
  ['other route',()=>{window.history.replaceState({},'', '/dashboard?client_id=demo_brawndo');}],
  ['route client mismatch',()=>{window.history.replaceState({},'', '/compliance/cis-ig1?client_id=demo_dunder');}],
  ['selection mismatch',()=>{sessionStorage.setItem('grc_client_id','demo_dunder');}],
  ['archived client',()=>{mockOrg.currentClient.archived=true;}],
  ['incomplete native context',()=>{props.contextComplete=false;}],
  ['other framework version',()=>{props.record={...props.record,framework_version:'8.0'};}],
];
test.each(boundedContextNegatives)('the bounded progress correction does not change %s',async(_label,changeContext)=>{
  enableBoundedDemoContext();
  const answers={...completeAnswers('1.1'),additional_confirmation:'Yes',unknowns:''};answers.coverage.Servers='Not sure';
  stored={...interview('1.1'),revision:2,answers};props.visualReference=true;changeContext();
  const nativeBefore=copy(props.current);
  await render();await open();expect(document.querySelector('[aria-label="Question group 2 of 5"]')).toBeTruthy();
  await click('Save & next');
  expect(document.body.textContent).toContain('Describe the additional reported work before reviewing the summary.');
  expect(document.querySelector('[aria-label="Question group 2 of 5"]')).toBeTruthy();
  expect(api.put).not.toHaveBeenCalled();expectNativeUnchanged(nativeBefore);
});

test.each(boundedContextNegatives)('fresh interview visibility does not widen %s',async(_label,changeContext)=>{
  enableBoundedDemoContext();changeContext();
  const reveal=jest.fn(),nativeBefore=copy(props.current);
  await render({inline:true,visualReference:true,onFreshInterviewReady:reveal});
  expect(reveal).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expectNativeUnchanged(nativeBefore);
});

test('fresh personal entry can reveal questions alongside a saved manual assessment only once',async()=>{
  enableBoundedDemoContext();
  const current={...record('1.1'),status:'needs_attention',verification:'gap_identified',implementation:'Retain this exact manual wording.',last_assessed:token,assessment_history:[{implementation:'Earlier manual wording.'}]};
  const reveal=jest.fn();props={...props,record:current,current,form:copy(current)};
  await render({inline:true,visualReference:true,onFreshInterviewReady:reveal});
  expect(reveal).toHaveBeenCalledTimes(1);expect(api.put).not.toHaveBeenCalled();expectNativeUnchanged(current);
  // A later callback identity or explicit close must not undo the user's choice.
  const laterReveal=jest.fn();await render({inlineOpen:false,onFreshInterviewReady:laterReveal});
  expect(laterReveal).not.toHaveBeenCalled();expectNativeUnchanged(current);
});

test.each([
  ['saved checkpoint',()=>{stored={...stored,revision:1,answers:{inventory:'Not sure',inventory_detail:'Previously reported uncertainty.'}};}],
  ['completed interview',()=>completedSaved('1.1')],
  ['historical question version',()=>{stored.version=legacyVersionForSafeguard('1.1');}],
  ['native dirty draft',()=>{props.assessmentDirty=true;props.form={...props.form,implementation:'Unsaved native wording.'};}],
  ['read-only assessment',()=>{props.disabled=true;}],
  ['recorded Not Applicable position',()=>{props.current={...props.current,status:'not_applicable',na_rationale:'Retain the recorded scope decision.'};}],
  ['failed interview read',()=>{api.get.mockRejectedValueOnce(new Error('Synthetic read unavailable'));}],
])('fresh entry preserves the existing %s',async(_label,prepare)=>{
  enableBoundedDemoContext();prepare();
  const reveal=jest.fn(),nativeBefore=copy(props.current),formBefore=copy(props.form),interviewBefore=copy(stored);
  await render({inline:true,visualReference:true,onFreshInterviewReady:reveal});
  expect(reveal).not.toHaveBeenCalled();expect(stored).toEqual(interviewBefore);
  expect(api.put).not.toHaveBeenCalled();expect(props.current).toEqual(nativeBefore);expect(props.form).toEqual(formBefore);
  expect(props.onApply).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(props.onUpdateImplementation).not.toHaveBeenCalled();
});
