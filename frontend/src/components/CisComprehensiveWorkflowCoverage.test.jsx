import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import cis from '@catalogs/cisIG1.json';
import {catalogForVersion,versionForSafeguard,visibleQuestions} from '@/lib/guidedAssessment';
import {omniGroups} from '@/lib/refinedOmni';
import {omniCisSummary} from '@/lib/omniCisSummary';
import ig1Cases from '../../../docs/omni-cis-rollout/ig1-status-cases.json';
import ig2Cases from '../../../docs/omni-cis-rollout/ig2-status-cases.json';
import ig3Cases from '../../../docs/omni-cis-rollout/ig3-status-cases.json';
import ig2Review from '../../../docs/omni-cis-rollout/ig2-review.json';
import ig3Review from '../../../docs/omni-cis-rollout/ig3-review.json';
import api from '@/lib/api';

let mockClient,mockName,mockRole;
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'qa-workflow-actor',role:mockRole}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClient:{client_id:mockClient,name:mockName},clients:[{client_id:mockClient,name:mockName}]})}));
jest.mock('./AssigneeSelect',()=>()=>null);
// Related-record drawers and assignee selection are outside these assessment writes.
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('./ui/dialog',()=>{
  const R=require('react');
  return {Dialog:({open,children})=>open?<div>{children}</div>:null,DialogContent:({children})=><div>{children}</div>,DialogTitle:R.forwardRef(({children},ref)=><h2 ref={ref}>{children}</h2>),DialogDescription:({children})=><p>{children}</p>};
});

const copy=value=>JSON.parse(JSON.stringify(value)),fingerprint='c'.repeat(64),token='2026-10-09T12:00:00Z';
const sourceCases={1:ig1Cases.cases,2:ig2Cases.cases,3:ig3Cases.cases};
const reviews=[...ig2Review.rows,...ig3Review.rows];
const placements=[1,2,3].flatMap(group=>cis.requirements.filter(row=>row.implementation_group<=group).map(row=>[group,row.id]));
const representatives=['1.1','1.2','1.3','1.4','1.5','2.1','2.2','2.3','2.4','2.5','3.1','3.3','3.6','3.13','4.10','4.12','5.1','6.5','7.5','8.4','8.5','16.2','16.5','17.1','17.5'];

// Accepted inputs come from source-authored cases; evaluator output does not choose them.
function completeAnswers(id){
  const canonical=cis.requirements.find(row=>row.id===id),fixture=sourceCases[canonical.implementation_group].find(row=>row.safeguard_id===id&&(row.id==='IG1-'+id+'-complete'||row.id===id+':complete'));
  if(fixture.answers)return copy(fixture.answers);
  const pack=catalogForVersion(versionForSafeguard(id)),questions=pack.safeguards[id],definition=pack.definitions[id],review=reviews.find(row=>row.id===id),answers={};
  for(const [criterion,value]of Object.entries(fixture.criterion_answers)){
    const mapping=review.atomic_requirements.find(row=>row.requirement_id===criterion).answer_mapping;
    if(mapping.type==='matrix'){
      const q=questions.find(q=>q.criterion_ids?.includes(criterion)),row=q.rows[q.criterion_ids.indexOf(criterion)];answers[q.id]={...answers[q.id],[row]:value};
    }else{
      const q=questions.find(q=>q.id===mapping.field);answers[q.id]=q.choices.includes(value)?value:value==='Yes'?mapping.accepted[0]:value;
    }
  }
  if(definition.root==='practice')answers.practice='Yes';
  if(fixture.aggregate_answer!=null)answers[definition.root]=fixture.aggregate_answer;
  if(fixture.root_answer!=null)answers[definition.root]=fixture.root_answer;
  return answers;
}

let root,container,native,stored,group,interviewHistory,nativeHistory,opened,configurationExtra;
const workspace=()=>document.querySelector('.omni-workspace-window');
const guideButton=name=>[...(workspace()?.querySelectorAll('button')||[])].find(button=>button.textContent.trim()===name);
const readInterview=()=>({...copy(stored),current_assessment_token:native.last_saved,current_scope_fingerprint:fingerprint,lineage_known:true,lineage_stale:stored.base_assessment_token!==native.last_saved});
function setup(id,implementationGroup,{completed=false,nativeText=''}={}){
  group=implementationGroup;mockClient='synthetic-cis-ig'+group;mockName='Synthetic workflow IG'+group;configurationExtra={};
  const row=cis.requirements.find(row=>row.id===id),version=versionForSafeguard(id),answers=completed?completeAnswers(id):{},result=completed?omniCisSummary(id,answers,version,mockName).result:null;
  native={client_id:mockClient,framework_key:'cis-ig1',framework_assessment_id:'synthetic-'+group+'-'+id,definition_id:id,title:row.title,status:'not_assessed',implementation:nativeText,verification:'not_verified',technology:'Preserved native technology',notes:'Preserved native notes',owner_id:null,na_rationale:'',last_saved:token,assessment_history:[]};
  stored={client_id:mockClient,assessment_id:native.framework_assessment_id,user_id:'qa-workflow-actor',version,answers,result,narrative:result?.narrative||'',completed,step:0,revision:completed?2:0,base_assessment_token:token,base_scope_fingerprint:fingerprint,generated_at:completed?token:null};
  interviewHistory=[];nativeHistory=[];
}
async function render(){await act(async()=>root.render(<FrameworkDrawer open record={copy(native)} clientId={mockClient} onOpenChange={opened}/>));}
async function remount(){await act(async()=>root.unmount());root=createRoot(container);await render();}
async function open(){const launcher=document.querySelector('[aria-label="Open Omnibot guide"]');expect(launcher).toBeTruthy();await act(async()=>launcher.click());}
async function click(name){const element=guideButton(name);expect(element).toBeTruthy();expect(element.disabled).toBe(false);await act(async()=>element.click());}
async function setValue(element,value){
  expect(element).toBeTruthy();const prototype=element.tagName==='SELECT'?HTMLSelectElement.prototype:element.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;
  await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));});
}
async function editSummary(text){await setValue(workspace().querySelector('[aria-label="Omnibot implementation summary"]'),text);}
async function goToQuestion(questionId){
  for(let i=0;i<12;i++){
    const groups=omniGroups(native.definition_id,stored.answers,stored.version),target=groups.findIndex(g=>g.questions.some(q=>q.id===questionId));
    expect(target).toBeGreaterThanOrEqual(0);const current=Number(workspace().querySelector('.omni-group-progress').getAttribute('aria-label').match(/group (\d+)/)[1])-1;
    if(current===target)return;if(current>target)await click('Back');else await click('Save & next');
  }
  throw new Error('Question group was not reached: '+questionId);
}
async function fillQuestion(q,value){
  if(value==null||q.type==='text'&&!value)return;
  let section=[...workspace().querySelectorAll('.omni-question')].find(element=>element.querySelector('#omni-answer-'+q.id));
  if(!section){const renderedSections=[...workspace().querySelectorAll('.omni-question')];section=renderedSections.find(element=>element.textContent.includes(q.prompt));if(!section&&native.definition_id==='1.1')section=renderedSections.find(element=>q.type==='matrix'?q.rows.every(row=>[...element.querySelectorAll('select')].some(select=>select.getAttribute('aria-label')===row)):['inventory','maintenance','reconciled'].includes(q.id)&&element.querySelector('[role="group"]'));}
  expect(section).toBeTruthy();
  if(q.type==='matrix')for(const row of q.rows)await setValue([...section.querySelectorAll('select')].find(select=>select.getAttribute('aria-label')===row),value[row]);
  else if(q.type==='multi')for(const choice of value){const label=[...section.querySelectorAll('label')].find(label=>label.textContent===choice);expect(label).toBeTruthy();await act(async()=>label.querySelector('input').click());}
  else if(q.type==='select'&&section.querySelector('button')){const target=[...section.querySelectorAll('button')].find(button=>button.textContent===value);expect(target).toBeTruthy();await act(async()=>target.click());}
  else await setValue(section.querySelector('select,input,textarea'),value);
}
beforeEach(()=>{
  // Source-authored dated answers use a controlled clock; real UI timers keep their budgets.
  jest.useFakeTimers({now:new Date('2026-10-10T12:00:00Z'),doNotFake:['setTimeout','clearTimeout','setInterval','clearInterval','setImmediate','clearImmediate','nextTick','queueMicrotask','performance']});
  global.IS_REACT_ACT_ENVIRONMENT=true;mockRole='super_admin';localStorage.clear();sessionStorage.clear();window.history.replaceState({},'','/');
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);opened=jest.fn();
  api.get.mockImplementation(async path=>({data:path.endsWith('/guided-assessment/history')?{items:copy(interviewHistory),next_before_revision:null}:path.endsWith('/guided-assessment')?readInterview():path.endsWith('/related')?{reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]}:path.startsWith('/frameworks/')?{configuration:{implementation_group:group,...configurationExtra},assessments:[copy(native)],work:{[native.framework_assessment_id]:{context_complete:true,open_findings:0,open_actions:0,overdue_reviews:0,priority_records:[]}}}:[]}));
  api.put.mockImplementation(async(_path,body)=>{
    if(body.expected_revision!==stored.revision)throw new Error('Interview changed in another window; reload before saving');
    if(stored.completed)interviewHistory.push(copy(stored));
    stored={...stored,...copy(body),revision:stored.revision+1,generated_at:body.completed?token:null};return {data:readInterview()};
  });
  api.patch.mockImplementation(async(_path,body)=>{
    nativeHistory.push(copy(native));native={...native,...copy(body),last_saved:'2026-10-10T12:00:00Z',assessment_history:copy(nativeHistory),guided_assessment_source:{...body.guided_assessment_source,origin:'guided-assessment-pilot',by:'qa-workflow-actor'}};return {data:copy(native)};
  });
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();jest.useRealTimers();});

test.each(cis.requirements.map(row=>[row.id,row.implementation_group]))('fresh %s current interview visits every applicable group and requires explicit native save (IG%s)',async(id,minimumGroup)=>{
  setup(id,minimumGroup);const expected=completeAnswers(id);await render();await open();
  const visited=[];
  for(let i=0;i<12&&!workspace().querySelector('[aria-label="Omnibot implementation summary"]');i++){
    const label=workspace().querySelector('.omni-group-progress').getAttribute('aria-label');
    const currentGroups=omniGroups(id,stored.answers,stored.version),index=Number(label.match(/group (\d+)/)[1])-1;
    // Read the rendered group's production questions; source fixtures supply the inputs.
    for(const q of currentGroups[index].questions)await fillQuestion(q,expected[q.id]);
    visited.push(workspace().querySelector('.omni-group-progress').getAttribute('aria-label'));
    await click('Save & next');expect(api.patch).not.toHaveBeenCalled();
  }
  const summary=workspace().querySelector('[aria-label="Omnibot implementation summary"]');expect(summary).toBeTruthy();
  const expectedGroups=omniGroups(id,expected,stored.version).map((g,index)=>g.questions.length?'Question group '+(index+1)+' of '+omniGroups(id,expected,stored.version).length:null).filter(Boolean);
  expect(visited).toEqual(expectedGroups);expect(stored.completed).toBe(true);expect(stored.result.status).toBe('addressed');
  expect(summary.value).toContain('OVERVIEW\n\n');expect(summary.value).toContain('\n\nIMPLEMENTATION BREAKDOWN\n\n');expect(summary.value).toContain('\n\nITEMS TO ADDRESS\n\n');
  for(const [key,value]of Object.entries(expected))expect(stored.answers[key]).toEqual(value);
  expect(api.put.mock.calls.every(([path,body])=>path.endsWith('/guided-assessment')&&!('implementation'in body))).toBe(true);
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
});

test.each(placements)('IG%s placement %s real guide and native adapter preserve exact reviewed text and separate status',async(implementationGroup,id)=>{
  setup(id,implementationGroup,{completed:true});await render();await open();
  const baseline=copy(native),reviewed=workspace().querySelector('[aria-label="Omnibot implementation summary"]').value+'\n\nOPERATOR REVIEW\n\n- Exact synthetic line: α → β\n- Preserve trailing newline\n';
  await editSummary(reviewed);expect(api.patch).not.toHaveBeenCalled();await click('Save & close');
  expect(workspace()).toBeNull();expect(api.patch).toHaveBeenCalledTimes(1);
  const [path,body]=api.patch.mock.calls[0];expect(path).toBe('/framework_assessments/'+baseline.framework_assessment_id);
  expect(body).toEqual(expect.objectContaining({implementation:reviewed,status:'addressed',verification:baseline.verification,technology:baseline.technology,notes:baseline.notes,expected_last_assessed:token,guided_assessment_source:expect.objectContaining({version:stored.version,revision:stored.revision})}));
  expect(native.implementation).toBe(reviewed);expect(stored.narrative).toBe(reviewed);expect(nativeHistory).toHaveLength(1);expect(nativeHistory[0]).toEqual(baseline);expect(native.last_saved).not.toBe(token);
  expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
  await remount();await open();expect(workspace().querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(reviewed);expect(api.patch).toHaveBeenCalledTimes(1);
});

test.each(representatives)('design %s summary cancel, native failure/retry and pending duplicate keep exact manual text',async id=>{
  setup(id,3,{completed:true,nativeText:'Existing synthetic operator narrative'});await render();await open();
  const reviewed='OVERVIEW\n\nManually reviewed synthetic implementation for '+id+'.\n\nIMPLEMENTATION BREAKDOWN\n\n- Keep α and multiline operator edits.\n\nITEMS TO ADDRESS\n\n- Confirm synthetic context.\n';
  await editSummary(reviewed);await click('Save & close');await click('Cancel');expect(api.patch).not.toHaveBeenCalled();expect(workspace().querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(reviewed);
  api.patch.mockRejectedValueOnce(new Error('Synthetic native save unavailable'));await click('Save & close');await click('Yes, update assessment');expect(workspace()).toBeTruthy();expect(document.body.textContent).toContain('Synthetic native save unavailable');expect(native.implementation).toBe('Existing synthetic operator narrative');
  const patch=api.patch.getMockImplementation();let finish;api.patch.mockImplementationOnce((...args)=>new Promise(resolve=>{finish=async()=>resolve(await patch(...args));}));
  await click('Save & close');const confirm=guideButton('Yes, update assessment');await act(async()=>{confirm.click();confirm.click();});expect(api.patch).toHaveBeenCalledTimes(2);expect(workspace()).toBeTruthy();
  await act(async()=>finish());expect(workspace()).toBeNull();expect(native.implementation).toBe(reviewed);expect(stored.narrative).toBe(reviewed);expect(nativeHistory).toHaveLength(1);expect(nativeHistory[0].implementation).toBe('Existing synthetic operator narrative');
});

test.each(representatives)('design %s incomplete checkpoint retries and remounts answers/notes without native mutation',async id=>{
  setup(id,3);const baseline=copy(native),rootQuestion=catalogForVersion(stored.version).safeguards[id].find(q=>q.id===catalogForVersion(stored.version).definitions[id].root);
  await render();await open();await fillQuestion(rootQuestion,'Yes');
  const note='SYNTHETIC QA checkpoint for '+id+'\nRetain exact progress context.';
  await setValue(workspace().querySelector('[aria-label="Known gaps or uncertainties"]'),note);
  api.put.mockRejectedValueOnce(new Error('Synthetic interview save unavailable'));await click('Save & close');
  expect(workspace()).toBeTruthy();expect(document.body.textContent).toContain('Synthetic interview save unavailable');expect(stored.revision).toBe(0);expect(native).toEqual(baseline);
  await click('Save & close');expect(workspace()).toBeNull();expect(stored.completed).toBe(false);expect(stored.answers[rootQuestion.id]).toBe('Yes');expect(stored.answers[rootQuestion.id+'_detail']).toBe(note);
  const savedAnswers=copy(stored.answers),writes=api.put.mock.calls.length;await remount();await open();
  while(guideButton('Back')&&!guideButton('Back').disabled)await click('Back');
  expect(workspace().querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(note);expect(stored.answers).toEqual(savedAnswers);expect(api.put).toHaveBeenCalledTimes(writes);
  expect(native).toEqual(baseline);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
});

const conditionalRows=cis.requirements.flatMap(row=>{
  const questions=catalogForVersion(versionForSafeguard(row.id)).safeguards[row.id];
  return questions.filter(q=>q.type==='matrix'&&q.choices.includes('Not applicable')).map(q=>[row.id,q.id,q.rows.find(label=>(q.row_choices?.[label]||q.choices).includes('Not applicable'))]);
}).filter(([, ,row])=>row);
test.each(conditionalRows)('conditional %s %s requires rationale and safely hides/reveals retained scope context',async(id,questionId,row)=>{
  setup(id,3,{completed:true});const baseline=copy(native),approvedNarrative=stored.narrative;
  await render();await open();await click('Back to questions');
  const rowSelect=()=>[...workspace().querySelectorAll('.omni-question select')].find(element=>element.getAttribute('aria-label')===row);
  await goToQuestion(questionId);expect(rowSelect()).toBeTruthy();
  await setValue(rowSelect(),'Not applicable');await click('Save & close');expect(stored.answers[questionId][row]).toBe('Not applicable');expect(stored.narrative).toBe(approvedNarrative);expect(native).toEqual(baseline);
  expect(omniCisSummary(id,stored.answers,stored.version,mockName).result.status).not.toBe('addressed');expect(omniCisSummary(id,stored.answers,stored.version,mockName).result.status).not.toBe('not_applicable');
  await remount();await open();
  await goToQuestion('scope_reason');
  expect(workspace().querySelector('#omni-answer-scope_reason')).toBeTruthy();
  const rationale='SYNTHETIC QA: source-conditioned scope review for '+id+'.';await setValue(workspace().querySelector('#omni-answer-scope_reason'),rationale);await click('Save & close');
  expect(stored.answers.scope_reason).toBe(rationale);expect(native).toEqual(baseline);
  await remount();await open();await goToQuestion(questionId);await setValue(rowSelect(),'Yes');await click('Save & close');
  expect(stored.answers.scope_reason).toBe(rationale);expect(visibleQuestions(id,stored.answers,stored.version).some(q=>q.id==='scope_reason')).toBe(false);
  expect(omniCisSummary(id,stored.answers,stored.version,mockName).result.narrative).not.toContain(rationale);expect(stored.answers[questionId][row]).toBe('Yes');expect(native).toEqual(baseline);expect(api.patch).not.toHaveBeenCalled();
});

test.each(['1.3','1.4','1.5'])('control1 %s root transitions retain inactive historical details while excluding them from guidance',async id=>{
  setup(id,3,{completed:true});const rootId=catalogForVersion(stored.version).definitions[id].root;
  stored.answers.system='SYNTHETIC retained inactive discovery system';const original=copy(stored.answers);
  await render();await open();await click('Back to questions');while(guideButton('Back')&&!guideButton('Back').disabled)await click('Back');
  const rootQuestion=catalogForVersion(stored.version).safeguards[id].find(q=>q.id===rootId);await fillQuestion(rootQuestion,'No');
  expect(workspace().querySelector('[aria-label="Question group 1 of 2"]')).toBeTruthy();await click('Save & close');
  expect(stored.answers.system).toBe(original.system);expect(stored.answers.coverage).toBe(original.coverage);
  const proposal=omniCisSummary(id,stored.answers,stored.version,mockName).result;expect(proposal.status).toBe('needs_attention');expect(proposal.narrative).not.toContain(original.system);expect(api.patch).not.toHaveBeenCalled();
  await remount();await open();while(guideButton('Back')&&!guideButton('Back').disabled)await click('Back');await fillQuestion(rootQuestion,'Yes');
  expect(workspace().querySelector('#omni-answer-system').value).toBe(original.system);await click('Save & close');expect(stored.answers.coverage).toBe(original.coverage);expect(api.patch).not.toHaveBeenCalled();
});

test.each(['2.1','2.3','4.12','16.2'])('program %s root unknown or No never hides active atomic requirement questions',async id=>{
  setup(id,3);await render();await open();const rootQuestion=catalogForVersion(stored.version).safeguards[id].find(q=>q.id==='practice');
  for(const value of ['Not sure','No']){
    await fillQuestion(rootQuestion,value);await click('Save & next');expect(workspace().querySelector('.omni-matrix')).toBeTruthy();
    expect(visibleQuestions(id,stored.answers,stored.version).some(q=>q.critical&&q.type==='matrix')).toBe(true);await click('Back');
  }
  expect(api.patch).not.toHaveBeenCalled();expect(native.status).toBe('not_assessed');
});

test.each(representatives)('design %s stale interview rejection retains unsaved checkpoint notes and native values',async id=>{
  setup(id,3);const baseline=copy(native),rootQuestion=catalogForVersion(stored.version).safeguards[id].find(q=>q.id===catalogForVersion(stored.version).definitions[id].root);
  await render();await open();await fillQuestion(rootQuestion,'Yes');const note='SYNTHETIC unsaved loser notes for '+id;await setValue(workspace().querySelector('[aria-label="Known gaps or uncertainties"]'),note);
  stored={...stored,revision:5,answers:{[rootQuestion.id]:'No',[rootQuestion.id+'_detail']:'Preserved synthetic winner'}};await click('Save & close');
  expect(document.body.textContent).toContain('Interview changed in another window');expect(workspace().querySelector('[aria-label="Known gaps or uncertainties"]').value).toBe(note);
  expect(stored.revision).toBe(5);expect(stored.answers[rootQuestion.id]).toBe('No');expect(native).toEqual(baseline);expect(api.patch).not.toHaveBeenCalled();
});

test.each(['1.1','4.12','16.2'])('real native draft edit during %s summary persistence prevents stale application',async id=>{
  setup(id,3,{completed:true});const baseline=copy(native);await render();await open();
  const write=api.put.getMockImplementation();let finish;api.put.mockImplementationOnce((...args)=>new Promise(resolve=>{finish=async()=>resolve(await write(...args));}));await click('Save assessment');
  const nativeField=document.querySelector('[aria-label="Current implementation"]');expect(nativeField.disabled).toBe(false);await setValue(nativeField,'SYNTHETIC concurrent native draft; keep this exact text.');
  await act(async()=>finish());expect(document.body.textContent).toContain('native assessment changed while saving');expect(nativeField.value).toBe('SYNTHETIC concurrent native draft; keep this exact text.');expect(native).toEqual(baseline);expect(api.patch).not.toHaveBeenCalled();expect(workspace()).toBeTruthy();
});

test.each([[1,'1.1'],[2,'16.2'],[3,'4.12']])('IG%s %s read-only component context preserves current/native record and disables writes',async(implementationGroup,id)=>{
  setup(id,implementationGroup,{completed:true});mockRole='client_readonly';const baseline=copy(native);await render();await open();
  expect(guideButton('Save assessment').disabled).toBe(true);expect(guideButton('Save & close').disabled).toBe(true);expect(document.querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
  await click('Back to questions');expect(workspace().querySelector('.omni-question-group').disabled).toBe(true);expect(guideButton('Save & next').disabled).toBe(true);
  expect(native).toEqual(baseline);expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test.each(['scope-disabled','group-inapplicable','foreign-client','soc-2','iso-27001'])('excluded context %s cannot mount or write a CIS guide through the native parent',async kind=>{
  setup(kind==='group-inapplicable'?'1.3':'1.1',1,{completed:true});if(kind==='scope-disabled')configurationExtra.guided_assessment_enabled=false;
  if(kind==='foreign-client')native.client_id='synthetic-foreign';
  if(kind==='soc-2'){native.framework_key='soc-2';native.definition_id='CC1.1';}
  if(kind==='iso-27001'){native.framework_key='iso-27001';native.definition_id='A.5.1';}
  const baseline=copy(native);await render();expect(document.querySelector('[aria-label="Open Omnibot guide"]')).toBeNull();expect(native).toEqual(baseline);expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
});
