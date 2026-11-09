import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import SocGuidedAssessor from './SocGuidedAssessor';
import SocSequentialInterview from './SocSequentialInterview';
import PrestigeSocAssessment from './PrestigeSocAssessment';
import api from '@/lib/api';
import nativeSoc from '@catalogs/soc2.json';
import {socGuidedCatalog,socRolloutCatalog,socGroups,socExtraQuestions,socGuidedResult,socInlineSummary} from '@/lib/socGuidedAssessment';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'rollout-actor',role:'super_admin'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({clients:[{client_id:'rollout-soc-fixture',name:'Synthetic SOC rollout'}]})}));

const copy=value=>JSON.parse(JSON.stringify(value));
const fingerprint='a'.repeat(64);
let root,container,reviewHost,record,stored,props,failWrite;
const button=(name,scope=document)=>[...scope.querySelectorAll('button')].find(item=>item.textContent.trim()===name);
async function click(name,scope=document){const target=button(name,scope);expect(target).toBeTruthy();expect(target.disabled).toBe(false);await act(async()=>target.click());}
async function render(extra={}){props={...props,...extra};await act(async()=>root.render(<SocGuidedAssessor {...props}/>));}
async function setField(field,value){
  await act(async()=>{
    const prototype=field.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,value);
    field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}));
  });
}
function completeAnswers(){return Object.fromEntries(socGuidedCatalog.definitions['CC1.1'].groups.flatMap(group=>group.questions).map(question=>[
  question.id,question.type==='text'?'':question.type==='context'?'Relevant':'Yes',
]));}
function seedCompleted(extra={}){
  const answers={...completeAnswers(),...extra};
  stored={...stored,answers,revision:1,completed:true,narrative:socInlineSummary('CC1.1',answers,stored.version,'Synthetic SOC rollout','2026-11-09'),
    generated_at:'2026-11-09T12:00:00Z',summary_review:{version:stored.version,answers}};
}
async function openCompleted(){await click('Resume guided assessment');await click('Resume your review');expect(document.querySelector('[aria-label="Implementation draft"]')).toBeTruthy();}

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');reviewHost=document.createElement('div');document.body.append(container,reviewHost);root=createRoot(container);failWrite=false;
  record={client_id:'rollout-soc-fixture',framework_key:'soc-2',framework_assessment_id:'rollout-CC1.1',definition_id:'CC1.1',title:socGuidedCatalog.definitions['CC1.1'].title,
    status:'not_assessed',implementation:'',verification:'not_verified',last_saved:null,assessment_history:[],notes:''};
  stored={version:socGuidedCatalog.version,answers:{},step:0,completed:false,revision:0,narrative:'',base_assessment_token:null,base_scope_fingerprint:fingerprint,
    current_assessment_token:null,current_scope_fingerprint:fingerprint,lineage_known:true,lineage_stale:false};
  props={assessmentRollout:true,inline:true,sequential:true,clientId:record.client_id,configuration:{categories:['security','availability','confidentiality']},
    record,current:record,form:copy(record),onSaveAssessment:jest.fn(async()=>true),onUpdateImplementation:jest.fn(()=>true),onDraftChange:jest.fn(),
    implementationReviewContainer:reviewHost,pilotPortalContainer:container};
  api.get.mockImplementation(async path=>{
    if(path.endsWith('/history'))return {data:{items:[],has_more:false}};
    if(path.endsWith('/guided-assessment'))return {data:copy(stored)};
    throw new Error('Unexpected synthetic read: '+path);
  });
  api.put.mockImplementation(async(_path,body)=>{
    if(failWrite)throw new Error('Synthetic interview save failed');
    if(body.expected_revision!==stored.revision)throw new Error('Stale revision');
    stored={...stored,...copy(body),revision:stored.revision+1,generated_at:body.completed?'2026-11-09T12:00:00Z':null};
    return {data:copy(stored)};
  });
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();reviewHost.remove();jest.clearAllMocks();});

test.each(['soc2-omni-1','soc2-omni-2','soc2-assessment-rollout-1'])('%s active old draft remains preserved until an explicit empty current-version restart; archived history stays read-only',async savedVersion=>{
  const first=socGroups(record.definition_id,{},savedVersion)[0].questions[0];
  const oldAnswers={[first.id]:'Partially',[first.id+'_detail']:'Exact old-version context — preserve this custom text.'};
  record={...record,status:'in_progress',implementation:'Native saved assessment text remains independent.',last_saved:'2026-11-09T11:00:00Z'};
  stored={...stored,version:savedVersion,answers:oldAnswers,revision:3,narrative:'Exact active old interview wording.\nRetain this second line — unchanged.',
    base_assessment_token:'2026-11-08T11:00:00Z',current_assessment_token:record.last_saved,
    base_scope_fingerprint:'b'.repeat(64),lineage_stale:true,updated_at:'2026-11-08T12:00:00Z'};
  props={...props,record,current:record,form:copy(record)};
  const before=copy(stored),native=copy(record),prior={...copy(stored),revision:1,narrative:'Earlier existing archived checkpoint.',answers:{[first.id]:'Not sure'}};
  const history=[copy(prior)],write=api.put.getMockImplementation();
  api.get.mockImplementation(async path=>({data:path.endsWith('/history')?{items:copy([...history].sort((a,b)=>b.revision-a.revision)),has_more:false}:copy(stored)}));
  api.put.mockImplementation(async(path,body)=>{
    const previous=copy(stored),response=await write(path,body);
    // Model only the native explicit-restart archive boundary; not a persistence claim.
    if(body.restart){history.push(previous);stored={...stored,lineage_stale:false};return {data:copy(stored)};}
    return response;
  });
  await render();await click('Resume guided assessment');
  const panel=container.querySelector('[aria-label="SOC 2 interview"]');
  expect(panel.hidden).toBe(false);expect(panel.textContent).toContain('Begin a new current-version review before updating the assessment.');
  expect(button('Resume your review').disabled).toBe(true);expect(button('Review implementation',reviewHost).disabled).toBe(true);
  expect(panel.querySelector('.cis-sequential-interview')).toBeNull();expect(button('Save progress')).toBeUndefined();expect(button('Apply draft')).toBeUndefined();
  expect(stored).toEqual(before);expect(history).toEqual([prior]);expect(record).toEqual(native);
  expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  await click('Begin a new review',panel);
  const confirmation=()=>[...document.querySelectorAll('[role="dialog"]')].find(dialog=>dialog.textContent.includes('Begin a new review?'));
  expect(confirmation()).toBeTruthy();await click('Cancel',confirmation());
  expect(stored).toEqual(before);expect(history).toEqual([prior]);expect(api.put).not.toHaveBeenCalled();
  await click('Begin a new review',panel);await click('Begin a new review',confirmation());
  expect(api.put).toHaveBeenCalledTimes(1);
  expect(api.put.mock.calls[0][1]).toMatchObject({version:socGuidedCatalog.version,answers:{},narrative:'',summary_review:null,result:null,
    completed:false,step:0,restart:true,expected_revision:before.revision,base_assessment_token:before.current_assessment_token,
    base_scope_fingerprint:before.current_scope_fingerprint});
  expect(socGuidedCatalog.version).toBe('soc2-assessment-rollout-2');expect(stored.version).toBe(socGuidedCatalog.version);
  expect(stored.answers).toEqual({});expect(stored.narrative).toBe('');expect(stored.result).toBeNull();
  expect(history).toEqual([prior,before]);expect(record).toEqual(native);
  const optional=socGroups(record.definition_id,{},socGuidedCatalog.version).find(group=>group.id==='implementation_context').questions;
  expect(optional).toHaveLength(3);for(const question of optional)expect(stored.answers[question.id]).toBeUndefined();
  expect(panel.querySelector('fieldset select').value).toBe('');
  // Explicit user answers reach the new optional questions; restart supplied none.
  for(let guard=0;guard<10&&panel.querySelector('fieldset').dataset.questionId!==optional[0].id;guard++){
    const select=panel.querySelector('fieldset select');expect(select).toBeTruthy();expect(select.value).toBe('');
    await setField(select,'Yes');await click('Continue',panel.querySelector('.cis-sequential-interview'));
  }
  for(const question of optional){
    const fieldset=panel.querySelector('fieldset');expect(fieldset.dataset.questionId).toBe(question.id);expect(fieldset.querySelector('textarea').value).toBe('');
    await click('Continue',panel.querySelector('.cis-sequential-interview'));
  }
  expect(history).toEqual([prior,before]);expect(record).toEqual(native);
  const writes=api.put.mock.calls.length;
  await render({interviewHistoryOpen:true,onInterviewHistoryOpenChange:jest.fn()});
  const dialog=[...document.querySelectorAll('[role="dialog"]')].find(item=>item.textContent.includes('Interview history'));
  const archived=[...dialog.querySelectorAll('details')].find(item=>item.querySelector('summary').textContent.includes('Revision 3'));
  expect(archived.querySelector('summary').textContent).toContain(savedVersion);
  await act(async()=>archived.querySelector('summary').click());expect(archived.open).toBe(true);
  expect(archived.querySelector('p').textContent).toBe(before.narrative);expect(JSON.parse(archived.querySelector('pre').textContent)).toEqual(oldAnswers);
  expect(dialog.querySelector('input,textarea,select')).toBeNull();expect(dialog.textContent).toContain(prior.narrative);
  expect(api.put).toHaveBeenCalledTimes(writes);expect(api.patch).not.toHaveBeenCalled();
  expect(props.onUpdateImplementation).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('the lower implementation entry opens the actual first incomplete group and exposes validation on a fresh interview without writes',async()=>{
  const before=copy(stored),native=copy(record);await render();
  const panel=container.querySelector('[aria-label="SOC 2 interview"]');expect(panel.hidden).toBe(true);
  await click('Review implementation',reviewHost);
  expect(panel.hidden).toBe(false);expect(panel.textContent).toContain('Answer each applicable SOC question before reviewing the summary.');
  const fieldset=panel.querySelector('.cis-sequential-interview fieldset');
  expect(fieldset.dataset.questionId).toBe(socGroups(record.definition_id,{},stored.version)[0].questions[0].id);
  expect(fieldset.querySelector('select').value).toBe('');expect(document.activeElement).toBe(fieldset.querySelector('legend'));
  expect(document.querySelector('[aria-label="Implementation draft"]')).toBeNull();
  expect(stored).toEqual(before);expect(record).toEqual(native);
  expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  expect(props.onUpdateImplementation).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('the lower implementation entry returns retained missing scope detail to its native group without auto-answering or saving',async()=>{
  const id='P6.1';record={...record,definition_id:id,framework_assessment_id:'rollout-'+id,title:socGuidedCatalog.definitions[id].title};
  const answers={'P6.1-responsibility':'Yes','P6.1-disclosure-context':'Outside the selected system'};
  stored={...stored,answers,revision:2,step:socGroups(id,answers,stored.version).length-1};
  props={...props,record,current:record,form:copy(record),configuration:{categories:['security','privacy']}};
  const before=copy(stored),native=copy(record);await render();
  const panel=container.querySelector('[aria-label="SOC 2 interview"]');expect(panel.hidden).toBe(true);
  await click('Review implementation',reviewHost);
  expect(panel.hidden).toBe(false);expect(panel.textContent).toContain('Explain why the selected context is outside the system before reviewing the summary.');
  expect(panel.querySelector('fieldset').dataset.questionId).toBe('P6.1-responsibility');
  expect(document.activeElement).toBe(panel.querySelector('fieldset legend'));
  await click('Continue',panel.querySelector('.cis-sequential-interview'));
  const fieldset=panel.querySelector('fieldset');expect(fieldset.dataset.questionId).toBe('P6.1-disclosure-context');
  expect(fieldset.querySelector('select').value).toBe('Outside the selected system');
  expect(fieldset.querySelector('textarea').value).toBe('');expect(document.activeElement).toBe(fieldset.querySelector('legend'));
  expect(stored).toEqual(before);expect(record).toEqual(native);
  expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  expect(props.onUpdateImplementation).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('rollout keeps native group checkpoints, every shared question and explicit narrative-only Apply',async()=>{
  const before=copy(record);await render();await click('Begin guided assessment');await click('Start');
  const visited=[];
  for(let limit=0;limit<20&&!container.querySelector('.gn-review-list');limit++){
    const fieldset=container.querySelector('.cis-sequential-interview fieldset');expect(fieldset).toBeTruthy();
    visited.push(fieldset.dataset.questionId);
    const select=fieldset.querySelector('select');
    if(select){const values=[...select.options].map(option=>option.value);await setField(select,values.includes('Relevant')?'Relevant':values.includes('Partially')?'Yes':'No');}
    await click(visited.at(-1)==='evidence'?'Review responses':'Continue',container.querySelector('.cis-sequential-interview'));
  }
  expect(visited).toEqual([...Object.keys(completeAnswers()),'additional_gap','additional_confirmation','evidence']);
  expect(container.querySelector('.gn-review-list').textContent).toContain('Reported supporting records');
  await click('Review implementation',container.querySelector('.cis-sequential-interview'));
  const nativeGroups=socGroups('CC1.1',stored.answers,stored.version);
  expect(api.put.mock.calls.map(([,body])=>[body.step,body.completed])).toEqual([
    ...nativeGroups.slice(1).map((_,index)=>[index+1,false]),[nativeGroups.length-1,true],
  ]);
  const wording=document.querySelector('[aria-label="Implementation draft"]').value;
  expect(props.onUpdateImplementation).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await click('Apply draft');
  expect(props.onUpdateImplementation).toHaveBeenCalledWith(wording,'');
  expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  expect(record).toEqual(before);expect(stored.completed).toBe(true);
  expect(document.activeElement).toBe(button('Resume guided assessment'));
});

test('Pause preserves unsaved answers and restores focus; Save progress stays interview-only and failures retain state',async()=>{
  await render();await click('Begin guided assessment');await click('Start');
  const fieldset=container.querySelector('fieldset'),questionId=fieldset.dataset.questionId;
  await setField(fieldset.querySelector('select'),'No');await click('Pause & return');
  expect(api.put).not.toHaveBeenCalled();expect(document.activeElement).toBe(button('Resume guided assessment'));
  await click('Resume guided assessment');
  expect(container.querySelector('fieldset').dataset.questionId).toBe(questionId);
  expect(container.querySelector('fieldset select').value).toBe('No');
  expect(document.activeElement).toBe(container.querySelector('fieldset legend'));
  failWrite=true;await click('Save progress');
  expect(container.textContent).toContain('Synthetic interview save failed');expect(stored.revision).toBe(0);
  expect(container.querySelector('fieldset select').value).toBe('No');
  failWrite=false;await click('Save progress');
  expect(stored.answers[questionId]).toBe('No');expect(stored.completed).toBe(false);
  expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(props.onUpdateImplementation).not.toHaveBeenCalled();expect(record.status).toBe('not_assessed');
});

test('reviewed wording requires explicit replacement and rejects a changed native implementation',async()=>{
  props.current={...record,status:'in_progress',implementation:'Existing manual SOC wording.'};props.form=copy(props.current);seedCompleted();
  await render();await openCompleted();
  expect(button('Apply draft').disabled).toBe(true);
  await setField(document.querySelector('[aria-label="Implementation draft"]'),'Reviewed manual wording with a retained second paragraph.');
  const replacement=document.querySelector('.guided-replacement input');await act(async()=>replacement.click());
  await render({form:{...props.form,implementation:'Concurrent native wording.'}});
  await click('Apply draft');
  expect(document.body.textContent).toContain('The native implementation changed.');
  expect(props.onUpdateImplementation).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
  expect(document.querySelector('[aria-label="Implementation draft"]').value).toBe('Reviewed manual wording with a retained second paragraph.');
});

test('permission withdrawal, native and related drafts block Apply without discarding the saved review',async()=>{
  seedCompleted();await render();await openCompleted();
  for(const blocked of [{disabled:true},{disabled:false,relatedDraft:true},{relatedDraft:false,assessmentDirty:true}]){
    await render(blocked);expect(button('Apply draft').disabled).toBe(true);
  }
  await render({assessmentDirty:false});
  expect(button('Apply draft').disabled).toBe(false);
  expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(props.onUpdateImplementation).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('editing retained manual wording after answers change still requires explicit wording review before Apply',async()=>{
  seedCompleted();stored.narrative='Retained reviewer wording, deliberately different from generated text.';
  await render();await openCompleted();
  await setField(document.querySelector('[aria-label="Implementation draft"]'),'First manually reviewed wording.');
  await click('Edit responses');
  for(let limit=0;limit<10&&!button('Back').disabled;limit++)await click('Back');
  const fieldset=container.querySelector('.cis-sequential-interview fieldset');
  expect(fieldset.dataset.questionId).toBe(Object.keys(completeAnswers())[0]);
  await setField(fieldset.querySelector('select'),'Partially');
  await click('Review implementation',reviewHost);
  expect(button('Apply draft').disabled).toBe(true);
  const writes=api.put.mock.calls.length;
  await setField(document.querySelector('[aria-label="Implementation draft"]'),'Second manual edit while the changed answers still require review.');
  expect(document.body.textContent).toContain('Your answers changed after you edited this draft.');
  expect(button('Apply draft').disabled).toBe(true);
  expect(props.onUpdateImplementation).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
  expect(api.put).toHaveBeenCalledTimes(writes);
  await click('Keep my wording after review');expect(button('Apply draft').disabled).toBe(false);
  await click('Apply draft');
  expect(props.onUpdateImplementation).toHaveBeenCalledWith('Second manual edit while the changed answers still require review.','');
  expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(api.put).toHaveBeenCalledTimes(writes);
});

test.each([
  {additional_gap:'Yes',gaps:'A substantive scoped practice is missing.'},
  {additional_confirmation:'Yes',unknowns:'Confirm the unresolved coverage.'},
])('prospective NATIVE01/02 keeps reported substantive context and stages no readiness decision: %j',async extra=>{
  seedCompleted(extra);const before=copy(record);await render();await openCompleted();
  const text=document.querySelector('[aria-label="Implementation draft"]').value;
  expect(text).toContain(extra.gaps||extra.unknowns);expect(document.body.textContent).toContain('Proposed SOC 2 status:');
  const questionId=extra.gaps?'gaps':'unknowns',kind=extra.gaps?'gap':'verification',reported=extra[questionId];
  const result=socGuidedResult('CC1.1',stored.answers,stored.version,'Synthetic SOC rollout');
  const historicalResult=socGuidedResult('CC1.1',stored.answers,socRolloutCatalog.version,'Synthetic SOC rollout');
  expect(historicalResult.status).toBe('addressed');expect(historicalResult.signals).toEqual([{questionId,kind,text:reported}]);
  expect(result.status).toBe(kind==='gap'?'needs_attention':'not_assessed');expect(result.signals).toEqual([{questionId,kind,text:reported}]);
  expect(document.body.textContent).toContain('Proposed SOC 2 status: '+(kind==='gap'?'Needs Remediation / Validation':'Not Assessed')+'.');
  expect(text).toContain((kind==='gap'?'Reported gap: ':'Requires confirmation: ')+reported);
  expect(text).not.toContain((kind==='gap'?'Requires confirmation: ':'Reported gap: ')+reported);
  await click('Apply draft');expect(props.onUpdateImplementation).toHaveBeenCalledWith(text,'');
  expect(record).toEqual(before);expect(record.status).toBe('not_assessed');
  expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('prospective combined concerns constrain the proposal without changing an existing manual status on Apply',async()=>{
  const extra={additional_gap:'Yes',gaps:'A confirmed scoped deficiency.',additional_confirmation:'Yes',unknowns:'Confirm the unresolved scope.'};
  record={...record,status:'addressed'};props={...props,record,current:record,form:copy(record)};
  seedCompleted(extra);const before=copy(record),answers=copy(stored.answers);await render();await openCompleted();
  expect(document.body.textContent).toContain('Proposed SOC 2 status: Needs Remediation / Validation.');
  const text=document.querySelector('[aria-label="Implementation draft"]').value;
  expect(text).toContain('Reported gap: '+extra.gaps);expect(text).toContain('Requires confirmation: '+extra.unknowns);
  await click('Apply draft');expect(props.onUpdateImplementation).toHaveBeenCalledWith(text,'');
  expect(record).toEqual(before);expect(record.status).toBe('addressed');expect(stored.answers).toEqual(answers);
  expect(props.onSaveAssessment).not.toHaveBeenCalled();
  for(const method of ['put','patch','post','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test('a retained completed rollout-1 proposal remains exact and read-only rather than adopting the prospective rule',async()=>{
  const answers={...completeAnswers(),additional_gap:'Yes',gaps:'Exact retained reported gap.'};
  const result=socGuidedResult('CC1.1',answers,socRolloutCatalog.version,'Synthetic SOC rollout');
  stored={...stored,version:socRolloutCatalog.version,answers,revision:4,completed:true,result,
    narrative:'Exact reviewer-authored rollout-1 summary.\nPreserve this line.',summary_review:{version:socRolloutCatalog.version,answers}};
  const before=copy(stored),native=copy(record);await render();await click('Resume guided assessment');
  expect(result.status).toBe('addressed');expect(socGuidedResult('CC1.1',answers).status).toBe('needs_attention');
  expect(document.body.textContent).toContain('Begin a new current-version review before updating the assessment.');
  expect(button('Resume your review').disabled).toBe(true);expect(button('Review implementation',reviewHost).disabled).toBe(true);
  expect(stored).toEqual(before);expect(record).toEqual(native);
  expect(props.onUpdateImplementation).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
  for(const method of ['put','patch','post','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test.each(['soc2-assessment-rollout-1','soc2-assessment-rollout-2'])('%s sequential reported-work help retains the correct saved-version meaning',async version=>{
  const answers={additional_gap:'No',additional_confirmation:'No'},groups=socGroups('CC1.1',answers,version),put=jest.fn();
  await act(async()=>root.render(<SocSequentialInterview id="CC1.1" {...{version,answers,groups,put}} extras={socExtraQuestions(answers,version)}
    step={groups.length-1} setStep={jest.fn()} onNext={jest.fn()} onSaveProgress={jest.fn()}/>));
  for(let index=0;index<3;index++)await click('Continue');
  expect(container.querySelector('fieldset').dataset.questionId).toBe('additional_gap');
  const oldHelp='Use the question choices for substantive gaps or uncertainty. These optional notes add context; they do not decide readiness.';
  const newHelp='Affirmative reported gaps or confirmation needs can constrain the proposed readiness. Saved assessment status still requires your explicit decision.';
  expect(container.textContent).toContain(version==='soc2-assessment-rollout-2'?newHelp:oldHelp);
  expect(container.textContent).not.toContain(version==='soc2-assessment-rollout-2'?oldHelp:newHelp);
  expect(put).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('prospective grouped interview explains the proposal constraint without saving or changing native actions',async()=>{
  const answers=completeAnswers(),groups=socGroups('CC1.1',answers,stored.version);
  stored={...stored,answers,revision:1,step:groups.length-1};
  await render({assessmentRollout:false,sequential:false,inlineOpen:true});await click('Resume your review');
  expect(container.textContent).toContain('Affirmative reported gaps or confirmation needs can constrain the proposed readiness. Saved assessment status still requires your explicit decision.');
  expect(container.textContent).not.toContain('These optional notes add context; they do not decide readiness.');
  expect(button('Save & next')).toBeTruthy();expect(button('Save & close')).toBeTruthy();
  expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('controlled personal history is read-only, preserves historical answers and paginates the native route',async()=>{
  const first={revision:2,version:'soc2-omni-2',completed:false,updated_at:'2026-11-08T12:00:00Z',answers:{'CC1.1-expectations':'Partially'},narrative:'Current retained wording.'};
  const older={revision:1,version:'soc2-omni-1',completed:true,updated_at:'2026-10-01T12:00:00Z',answers:{'CC1.1-expectations_detail':'Exact legacy custom string.'},narrative:'Historical manual wording.'};
  api.get.mockImplementation(async(path,options)=>({data:path.endsWith('/history')?options?.params?.before_revision?{items:[older],has_more:false}:{items:[first],has_more:true,next_before_revision:2}:copy(stored)}));
  const onOpenChange=jest.fn();await render({disabled:true,interviewHistoryOpen:true,onInterviewHistoryOpenChange:onOpenChange});
  expect(document.body.textContent).toContain('Current retained wording.');
  await click('Load earlier interviews');expect(document.body.textContent).toContain('Historical manual wording.');expect(document.body.textContent).toContain('Exact legacy custom string.');
  expect(api.get).toHaveBeenLastCalledWith('/framework_assessments/rollout-CC1.1/guided-assessment/history',{params:{before_revision:2}});
  expect(document.querySelector('[role="dialog"] textarea')).toBeNull();
  await click('Close');expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(props.onUpdateImplementation).not.toHaveBeenCalled();
});

test('the rollout frame preserves native status, narrative, explicit assessment judgment and save controls',async()=>{
  const definition=nativeSoc.requirements.find(row=>row.id===record.definition_id),before=copy(record);
  const actions=Object.fromEntries(['put','save','saveAndNext','close','retry','itemsSaved','createItemFinding','setItemsDraft','setGuidedDraft','saveGuidedAssessment','stageGuidedImplementation','setFinding','run','setNested','setFeedback'].map(name=>[name,jest.fn()]));
  const state={assessmentRollout:true,open:true,record,definition,current:record,form:copy(record),ctx:{configuration:props.configuration},writable:true,busy:false,dirty:false,relatedDraft:false,otherDraft:false,related:{findings:[],reviews:[],tasks:[],evidence:[]},manageRecord:jest.fn()};
  await act(async()=>root.render(<PrestigeSocAssessment state={state} actions={actions}/>));
  const shell=document.querySelector('[data-testid="prestige-soc-assessment"]');expect(shell.classList.contains('gn-window')).toBe(true);
  expect(button('Assessment details')).toBeTruthy();expect(shell.querySelector('.gn-requirement')).toBeTruthy();
  expect(shell.textContent).toContain('Requirement summary · Omnisciente');
  expect(shell.querySelector('.gn-requirement-foot').textContent).toContain('management determines');
  expect(button('Record assessment').disabled).toBe(true);
  const implemented=shell.querySelector('input[name="psoc-status"][value="addressed"]');await act(async()=>implemented.click());
  expect(actions.put).toHaveBeenCalledWith('status','addressed');
  await setField(shell.querySelector('[aria-label="Current implementation"]'),'Reviewed native draft.');
  expect(actions.put).toHaveBeenCalledWith('implementation','Reviewed native draft.');
  await click('Save assessment');expect(actions.save).toHaveBeenCalledTimes(1);
  await act(async()=>root.render(<PrestigeSocAssessment state={{...state,form:{...state.form,status:'addressed'}}} actions={actions}/>));
  await click('Record assessment');expect(actions.save).toHaveBeenLastCalledWith({recordAssessment:true});
  expect(actions.saveGuidedAssessment).not.toHaveBeenCalled();expect(record).toEqual(before);
});

test('the details history destination is disabled when the existing native SOC gate is unavailable',async()=>{
  const definition=nativeSoc.requirements.find(row=>row.id===record.definition_id);
  const state={assessmentRollout:true,open:true,record,definition,current:record,form:copy(record),ctx:{configuration:{categories:['security'],__program_active:false}},
    writable:true,busy:false,dirty:false,relatedDraft:false,related:{findings:[],reviews:[],tasks:[],evidence:[]}};
  const actions=Object.fromEntries(['put','save','close','retry','setGuidedDraft','setItemsDraft'].map(name=>[name,jest.fn()]));
  await act(async()=>root.render(<PrestigeSocAssessment state={state} actions={actions}/>));
  expect(document.querySelector('[data-testid="soc-guided-assessment"]')).toBeNull();
  await act(async()=>button('Assessment details').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  const history=[...document.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent==='Interview history');
  expect(history).toBeTruthy();expect(history.getAttribute('aria-disabled')).toBe('true');
  expect(api.get).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('new-version tool context uses only its exact allowlist and preserves literal custom values',async()=>{
  const id='CC6.1',version=socRolloutCatalog.version,answers={[id+'-tool-1']:'Retained combination of identity sources.',additional_gap:'No',additional_confirmation:'No'};
  const groups=socGroups(id,answers,version),put=jest.fn(),onNext=jest.fn(),onSaveProgress=jest.fn();
  const sequential={assessmentRollout:true,guideOpen:true,id,version,answers,groups,extras:socExtraQuestions(answers,version),step:groups.length-1,setStep:jest.fn(),put,onNext,onSaveProgress};
  await act(async()=>root.render(<SocSequentialInterview {...sequential}/>));
  for(let index=0;index<3;index++)await click('Continue');
  const fieldset=container.querySelector('fieldset');expect(fieldset.dataset.questionId).toBe('CC6.1-tool-1');
  expect([...fieldset.querySelector('select').options].map(option=>option.value)).toEqual(['','Microsoft Entra ID','Active Directory Domain Services','JumpCloud','__other__','Not sure']);
  expect(fieldset.querySelector('textarea').value).toBe('Retained combination of identity sources.');
  expect(put).not.toHaveBeenCalled();
  await setField(fieldset.querySelector('select'),'Microsoft Entra ID');
  expect(put).toHaveBeenLastCalledWith('CC6.1-tool-1','Microsoft Entra ID');
  expect(onNext).not.toHaveBeenCalled();expect(onSaveProgress).not.toHaveBeenCalled();
  await act(async()=>root.render(<SocSequentialInterview {...sequential} blocked/>));
  expect(container.querySelector('fieldset').disabled).toBe(true);expect(button('Save progress').disabled).toBe(true);expect(button('Continue').disabled).toBe(true);
});

test.each(['CC6.7','P4.2'])('%s manual-only optional tool context retains a text field instead of an empty product selector',async id=>{
  const version=socRolloutCatalog.version,answers={[id+'-tool-1']:'Exact manual mechanism and scope.'},groups=socGroups(id,answers,version),put=jest.fn();
  await act(async()=>root.render(<SocSequentialInterview assessmentRollout guideOpen {...{id,version,answers,groups,put}} extras={socExtraQuestions(answers,version)} step={groups.length-1} setStep={jest.fn()} onNext={jest.fn()} onSaveProgress={jest.fn()}/>));
  for(let index=0;index<3;index++)await click('Continue');
  const fieldset=container.querySelector('fieldset');expect(fieldset.dataset.questionId).toBe(id+'-tool-1');
  expect(fieldset.querySelector('select')).toBeNull();expect(fieldset.querySelector('textarea').value).toBe('Exact manual mechanism and scope.');
  expect(put).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});
