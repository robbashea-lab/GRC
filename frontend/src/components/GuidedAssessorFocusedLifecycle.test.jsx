import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import GuidedAssessor from './GuidedAssessor';
import {versionForSafeguard,visibleQuestions} from '@/lib/guidedAssessment';
import {focusedResult} from '@/lib/focusedOmni';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:error=>error.message}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'focused-actor',workspace_mode:'demo'}})}));

const token='2026-10-01T12:00:00Z',newToken='2026-10-02T12:00:00Z',generated='2026-10-01T13:00:00Z',fingerprint='a'.repeat(64);
let root,container,stored,history,props,scopeFingerprint;
const copy=value=>JSON.parse(JSON.stringify(value));
const button=name=>[...document.querySelectorAll('button')].find(element=>element.textContent.trim()===name);
const work=()=>({context_complete:true,finding_ids:[],review_ids:[],task_ids:[],open_findings:0,open_actions:0,overdue_reviews:0,overdue_actions:0,priority_records:[]});
const record=id=>({client_id:'demo_brawndo',framework_key:'cis-ig1',framework_assessment_id:'focused-'+id,definition_id:id,title:'Synthetic lifecycle safeguard '+id,status:'not_assessed',verification:'not_verified',implementation:'',last_saved:token,assessment_history:[],work:work()});
const interview=id=>({client_id:'demo_brawndo',assessment_id:'focused-'+id,user_id:'focused-actor',version:versionForSafeguard(id,true),revision:0,answers:{},step:0,completed:false,narrative:'',result:null,base_assessment_token:token,base_scope_fingerprint:fingerprint,current_scope_fingerprint:fingerprint,lineage_known:true});
function completeAnswers(id){
  const version=versionForSafeguard(id,true),rootAnswer={[id==='1.1'?'inventory':'process']:'Yes'},today=new Date(),day=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  return Object.fromEntries(visibleQuestions(id,rootAnswer,version).map(question=>[question.id,question.type==='matrix'?Object.fromEntries(question.rows.map(row=>[row,'Yes'])):question.type==='text'?question.id==='system'?'OriginalTool':question.id==='owner'?'Synthetic IT team':'':question.type==='date'?day:question.type==='multi'?['Quarantine or isolate']:question.id==='frequency'?(id==='1.1'?'Every six months':'Weekly'):question.id==='sources'?'One source':question.id==='unresolved'?'No':'Yes']));
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
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  const current=record('1.1');stored=interview('1.1');history=[];scopeFingerprint=fingerprint;
  props={clientId:'demo_brawndo',framework:'cis-ig1',configuration:{implementation_group:1},record:current,current,form:copy(current),contextComplete:true,related:{},onApply:jest.fn(),onSaveAssessment:jest.fn(async()=>true),onDraftChange:jest.fn(),onUpdateImplementation:jest.fn(()=>true)};
  api.get.mockImplementation(async path=>({data:path.endsWith('/history')?{items:copy(history),next_before_revision:null}:readStored()}));
  api.put.mockImplementation(async (_path,body)=>{
    if(body.expected_revision!==stored.revision)throw new Error('Interview changed in another window; reload before saving');
    if(stored.revision&&(stored.completed||body.restart)&&!history.some(item=>item.revision===stored.revision))history.push(copy(stored));
    const base=body.restart||!stored.revision?{base_assessment_token:body.base_assessment_token,base_scope_fingerprint:body.base_scope_fingerprint}:{base_assessment_token:stored.base_assessment_token,base_scope_fingerprint:stored.base_scope_fingerprint};
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

test.each(['1.2'])('Use summary for %s stages native fields only after durable save',async id=>{
  const current=record(id);props={...props,record:current,current,form:copy(current)};const answers=completeAnswers(id),result=focusedResult(id,answers,versionForSafeguard(id,true));
  stored={...interview(id),revision:2,answers,completed:true,result,narrative:result.narrative,generated_at:generated};
  await render();await open();await click('Use summary');
  expect(props.onApply).toHaveBeenCalledTimes(1);const applied=props.onApply.mock.calls[0][0];expect(applied.guided_assessment_source.revision).toBe(stored.revision);expect(applied.implementation).toBe(stored.narrative);expect(props.current.status).toBe('not_assessed');expect(props.current.verification).toBe('not_verified');expect(props.current.last_saved).toBe(token);
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
  expect(document.body.textContent).toContain('Assessment saved.');expect(props.current.verification).toBe('not_verified');
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
  await click('Save assessment');expect(props.onSaveAssessment).toHaveBeenCalledTimes(2);expect(document.body.textContent).toContain('Assessment saved.');
});

test('duplicate clicks cannot submit two authoritative writes',async()=>{
  readySummary();let finish;props.onSaveAssessment.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await render();await open();
  const target=button('Save assessment');await act(async()=>{target.click();target.click();});expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);
  await act(async()=>finish(true));expect(document.body.textContent).toContain('Assessment saved.');
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
