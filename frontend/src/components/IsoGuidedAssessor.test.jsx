import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import IsoGuidedAssessor from './IsoGuidedAssessor';
import AssessmentShell from './AssessmentShell';
import {isoGuidedCatalog,isoGroups,isoGuidedResult,isoInlineNarrative} from '@/lib/isoGuidedAssessment';
import api from '@/lib/api';
import axios from 'axios';
import {previewAdapter} from '@/preview/commandTestAdapter';
import {ids,saveStore} from '@/preview/store';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:e=>e.message}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'iso-actor',role:'super_admin'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
const copy=value=>JSON.parse(JSON.stringify(value)),fingerprint='a'.repeat(64);
let root,container,stored,props,failWrite,mockOrg,nestedShell,nativeClose;
const button=name=>[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===name);
async function click(name){const target=button(name);expect(target).toBeTruthy();expect(target.disabled).toBe(false);await act(async()=>target.click());}
async function render(extra={}){props={...props,...extra};await act(async()=>root.render(nestedShell?
  <AssessmentShell title="Native ISO assessment" description="Review the current implementation." close={nativeClose}
    onEscapeKeyDown={e=>{if(document.activeElement?.closest('[data-testid="iso-guided-assessment"] .omni-workspace-window'))e.preventDefault();}}>
    <label>Native implementation<textarea aria-label="Nested native implementation" defaultValue="Retained native draft"/></label><IsoGuidedAssessor {...props}/>
  </AssessmentShell>:<IsoGuidedAssessor {...props}/>));}
function setup(id){
  const current={client_id:'iso-fixture',framework_key:'iso-27001',framework_assessment_id:'iso-'+id,definition_id:id,title:isoGuidedCatalog.definitions[id].title,soa_applicability:id.startsWith('A.')?'included':'',soa_justification:id.startsWith('A.')?'Necessary for scoped risk treatment.':'',status:'not_assessed',implementation:'',verification:'not_verified',last_saved:null};
  stored={version:isoGuidedCatalog.version,answers:{},step:0,completed:false,revision:0,narrative:'',base_assessment_token:null,base_scope_fingerprint:fingerprint,current_assessment_token:null,current_scope_fingerprint:fingerprint,lineage_known:true,lineage_stale:false};
  props={clientId:'iso-fixture',configuration:{__program_active:true},record:current,current,form:copy(current),onSaveAssessment:jest.fn(async()=>true),onDraftChange:jest.fn()};
}
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();window.history.replaceState({},'', '/');container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);failWrite=false;nestedShell=false;nativeClose=jest.fn();mockOrg={clients:[{client_id:'iso-fixture',name:'Agent 2 ISO fixture'}]};setup('4.1');
  api.get.mockImplementation(async path=>({data:path.endsWith('/history')?{items:[],has_more:false}:copy(stored)}));
  api.put.mockImplementation(async (_path,body)=>{if(failWrite)throw new Error('Synthetic save unavailable');if(body.expected_revision!==stored.revision)throw new Error('Stale revision');stored={...stored,...copy(body),revision:stored.revision+1,generated_at:body.completed?'2026-10-10T12:00:00Z':null};return {data:copy(stored)};});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
async function open(){await act(async()=>document.querySelector('[aria-label="Open Omnibot guide"]').click());}
async function complete(){
  await click('Start');
  for(let guard=0;guard<12&&!document.body.textContent.includes('Review your assessment summary');guard++){
    await act(async()=>{for(const group of document.querySelectorAll('.omni-answer-choices')){const yes=[...group.querySelectorAll('button')].find(item=>['Yes','Relevant'].includes(item.textContent));yes?.click();}});
    await click('Save & next');
  }
  expect(document.body.textContent).toContain('Review your assessment summary');
}
async function changeInput(selector,value){
  const target=typeof selector==='string'?document.querySelector(selector):selector;expect(target).toBeTruthy();
  await act(async()=>{Object.getOwnPropertyDescriptor(target.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLTextAreaElement.prototype,'value').set.call(target,value);target.dispatchEvent(new Event(target.tagName==='SELECT'?'change':'input',{bubbles:true}));});
}
async function escapeFocused(){await act(async()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));}
test('real parent Radix Escape closes only the clean ISO guide, then allows native Escape',async()=>{
  nestedShell=true;await render();await open();await escapeFocused();
  expect(document.querySelector('.omni-workspace-window')).toBeNull();expect(nativeClose).not.toHaveBeenCalled();
  expect(document.querySelector('[aria-label="Nested native implementation"]').value).toBe('Retained native draft');
  expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
  document.querySelector('[aria-label="Nested native implementation"]').focus();await escapeFocused();expect(nativeClose).toHaveBeenCalledTimes(1);
});
test('real parent Escape preserves dirty guide and native drafts, including confirmation Escape',async()=>{
  nestedShell=true;await render();await open();await click('Start');
  await act(async()=>document.querySelector('.omni-answer-choices button').click());await render({assessmentDirty:true});
  document.querySelector('.omni-panel-header [tabindex]').focus();await escapeFocused();
  expect(document.body.textContent).toContain('Unsaved guide changes');expect(nativeClose).not.toHaveBeenCalled();
  expect(document.querySelector('.omni-answer-choices button[aria-pressed="true"]')).toBeTruthy();
  await escapeFocused();expect(document.body.textContent).not.toContain('Unsaved guide changes');expect(nativeClose).not.toHaveBeenCalled();
  expect(document.querySelector('.omni-workspace-window')).toBeTruthy();expect(document.querySelector('[aria-label="Nested native implementation"]').value).toBe('Retained native draft');
  expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
test('real parent Escape cannot dismiss a busy ISO guide or write while a progress save is pending',async()=>{
  nestedShell=true;await render();await open();await click('Start');let finish;
  await act(async()=>document.querySelectorAll('.omni-answer-choices').forEach(group=>[...group.querySelectorAll('button')].find(item=>item.textContent==='Yes')?.click()));
  const original=api.put.getMockImplementation();api.put.mockImplementationOnce((path,body)=>new Promise(resolve=>{finish=async()=>resolve(await original(path,body));}));
  await click('Save & next');document.querySelector('.omni-panel-header [tabindex]').focus();await escapeFocused();
  expect(nativeClose).not.toHaveBeenCalled();expect(document.querySelector('.omni-workspace-window')).toBeTruthy();expect(api.put).toHaveBeenCalledTimes(1);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await act(async()=>finish());
});
function nativeDecisionWriter(){
  props.onSaveAssessment.mockImplementation(async(values,expected)=>{
    expect(expected).toBe(JSON.stringify(props.form));
    const current={...props.current,...values,last_saved:'2026-10-11T14:00:00Z'};
    stored={...stored,current_assessment_token:current.last_saved,current_scope_fingerprint:'b'.repeat(64),lineage_stale:stored.revision>0};
    props={...props,current,form:copy(current)};root.render(<IsoGuidedAssessor {...props}/>);return true;
  });
}

test.each([['Yes','addressed'],['Partially','in_progress'],['No','needs_attention'],['Not sure','not_assessed']])('ISMS %s answers propose %s without native saving',async(choice,status)=>{
  await render();await open();await click('Start');
  for(let guard=0;guard<20&&!document.querySelector('[aria-label="Omnibot implementation summary"]');guard++){
    await act(async()=>document.querySelectorAll('.omni-answer-choices').forEach(group=>[...group.querySelectorAll('button')].find(item=>item.textContent==='Relevant'||item.textContent===choice)?.click()));
    await click('Save & next');
  }
  expect(stored.result.status).toBe(status);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  expect(document.querySelector('[aria-label="Omnibot SoA applicability"]')).toBeNull();
  expect([...document.querySelectorAll('button')].some(item=>item.textContent==='N/A'||item.textContent==='Not applicable')).toBe(false);
});

test.each(['included','excluded'])('explicit SoA %s saves only structured fields and preserves implementation',async decision=>{
  setup('A.5.1');props.current={...props.current,implementation:'Retained native implementation\nsecond line.',status:'in_progress',soa_applicability:'',soa_justification:''};props.form=copy(props.current);
  nativeDecisionWriter();await render();await open();
  expect(button('Save applicability decision').disabled).toBe(true);
  await changeInput('[aria-label="Omnibot SoA applicability"]',decision);
  expect(button('Save applicability decision').disabled).toBe(true);
  const reason='Scoped risk treatment and contractual obligations.\nReviewed by the responsible team.';
  await changeInput('[aria-label="Omnibot SoA justification"]',reason);
  await click('Save applicability decision');
  expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);
  expect(props.onSaveAssessment.mock.calls[0][0]).toEqual({soa_applicability:decision,soa_justification:reason});
  expect(props.current.implementation).toBe('Retained native implementation\nsecond line.');expect(props.current.status).toBe('in_progress');
  expect(api.put).not.toHaveBeenCalled();expect(api.get).toHaveBeenCalledTimes(2);
  expect(document.body.textContent).toContain(decision==='included'?'Saved decision: Included':'Saved decision: Excluded');
});

test('excluded control retains its implementation and can deliberately reassess applicability',async()=>{
  setup('A.5.1');props.current={...props.current,implementation:'Earlier implementation remains.',status:'needs_attention',soa_applicability:'excluded',soa_justification:'Outside the documented scope.'};props.form=copy(props.current);
  await render();await open();expect(document.body.textContent).toContain('Implementation and interview history are retained');
  await click('Reassess applicability');await changeInput('[aria-label="Omnibot SoA applicability"]','included');await changeInput('[aria-label="Omnibot SoA justification"]','New scope needs this control.');
  await click('Cancel decision');expect(document.body.textContent).toContain('Saved decision: Excluded');expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await complete();expect(button('Update assessment').disabled).toBe(true);expect(props.current.implementation).toBe('Earlier implementation remains.');
});

test('unsaved SoA choice cannot close without a decision and unconfirmed native save retains the reason',async()=>{
  setup('A.5.1');props.current={...props.current,soa_applicability:'',soa_justification:''};props.form=copy(props.current);
  await render();await open();await changeInput('[aria-label="Omnibot SoA applicability"]','included');
  await act(async()=>document.querySelector('[aria-label="Close Omnibot Guide"]').click());
  expect(button('Save & close').disabled).toBe(true);await click('Keep editing');
  const reason='Risk justification\nwith exact manual detail.';await changeInput('[aria-label="Omnibot SoA justification"]',reason);
  props.onSaveAssessment.mockResolvedValueOnce(false);await click('Save applicability decision');
  expect(document.body.textContent).toContain('applicability save could not be confirmed');expect(document.body.textContent).not.toContain('Applicability decision saved.');
  expect(document.querySelector('[aria-label="Omnibot SoA justification"]').value).toBe(reason);
  await act(async()=>document.querySelector('[aria-label="Close Omnibot Guide"]').click());await click('Keep editing');expect(document.querySelector('.omni-workspace-window')).toBeTruthy();
  await act(async()=>document.querySelector('[aria-label="Close Omnibot Guide"]').click());await click('Discard changes');
  expect(document.querySelector('.omni-workspace-window')).toBeNull();await open();expect(document.querySelector('[aria-label="Omnibot SoA justification"]').value).toBe('');
});

test('native and related drafts plus read-only mode prevent SoA writes',async()=>{
  setup('A.5.1');await render();await open();await click('Reassess applicability');
  await changeInput('[aria-label="Omnibot SoA justification"]','Updated scope justification.');
  for(const guard of [{assessmentDirty:true},{relatedDraft:true},{disabled:true}]){
    await render({assessmentDirty:false,relatedDraft:false,disabled:false,...guard});expect(button('Save applicability decision').disabled).toBe(true);
  }
  expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('changed applicability refreshes retained lineage and requires comparison even with an own summary source',async()=>{
  setup('A.5.1');await render();await open();await complete();
  const before=copy(stored);props.current={...props.current,implementation:stored.narrative,status:stored.result.status,guided_assessment_source:{version:stored.version,revision:stored.revision,by:'iso-actor'}};props.form=copy(props.current);
  nativeDecisionWriter();await render();await click('Current position');await click('Reassess applicability');
  await changeInput('[aria-label="Omnibot SoA justification"]','Changed obligations require a fresh comparison.');await click('Save applicability decision');
  expect(stored.answers).toEqual(before.answers);expect(stored.narrative).toBe(before.narrative);expect(stored.revision).toBe(before.revision);
  expect(document.body.textContent).toContain('saved assessment or scope changed');expect(button('Compare & continue')).toBeTruthy();
  expect(props.current.implementation).toBe(before.narrative);expect(props.onSaveAssessment.mock.calls[0][0]).not.toHaveProperty('implementation');
});

test('native form changing during progress save stops summary application',async()=>{
  await render();await open();await complete();const original=api.put.getMockImplementation();
  let finish;api.put.mockImplementationOnce((path,body)=>new Promise(resolve=>{finish=async()=>resolve(await original(path,body));}));
  await click('Save assessment');await render({assessmentDirty:true,form:{...props.form,implementation:'A concurrent native draft.'}});
  await act(async()=>finish());expect(document.body.textContent).toContain('draft changed while the interview was saving');expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('program mode renders the supplied priority content once without loading an interview',async()=>{
  await render({record:null,current:null,programContent:<div data-testid="iso-program-content">Main-owned ISO priorities</div>});await open();
  expect(document.querySelectorAll('[data-testid="iso-program-content"]').length).toBe(1);expect(document.querySelectorAll('.omni-workspace-window').length).toBe(1);expect(api.get).not.toHaveBeenCalled();
});

test('audit program content can close the approved window before opening a native Review',async()=>{
  const onOpen=jest.fn();
  await render({record:null,current:null,programLabel:'Internal audit with Omnibot',programContent:({close})=><button onClick={()=>{close();onOpen();}}>Open existing Review</button>});
  await open();expect(document.body.textContent).toContain('Internal audit with Omnibot');
  await click('Open existing Review');expect(document.querySelector('.omni-workspace-window')).toBeNull();
  expect(onOpen).toHaveBeenCalledTimes(1);expect(api.get).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('launcher and window keep approved focus, keyboard movement and return behavior',async()=>{
  await render();await open();const panel=document.querySelector('.omni-workspace-window'),heading=document.getElementById(panel.getAttribute('aria-labelledby'));
  expect(document.activeElement).toBe(heading);expect(panel.getAttribute('aria-modal')).toBe('false');
  const x=parseFloat(panel.style.left);await act(async()=>heading.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  expect(parseFloat(panel.style.left)).toBeGreaterThanOrEqual(x);
  await act(async()=>panel.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(document.querySelector('.omni-workspace-window')).toBeNull();expect(document.activeElement.getAttribute('aria-label')).toBe('Open Omnibot guide');
});

test('wrong framework or current-record identity never renders or reads an interview',async()=>{
  const current=copy(props.current);await render({record:{...current,framework_key:'soc-2'}});expect(document.querySelector('[data-testid="iso-guided-assessment"]')).toBeNull();
  await render({record:current,current:{...current,framework_assessment_id:'another-record'}});expect(document.querySelector('[data-testid="iso-guided-assessment"]')).toBeNull();expect(api.get).not.toHaveBeenCalled();
});

test('interview-only Save & close preserves partial progress and resumes the saved group',async()=>{
  await render();await open();await click('Start');await act(async()=>document.querySelectorAll('.omni-answer-choices button').forEach(item=>{if(item.textContent==='Yes'||item.textContent==='Relevant')item.click();}));
  await click('Save & close');expect(stored.revision).toBe(1);expect(stored.completed).toBe(false);expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(document.querySelector('.omni-workspace-window')).toBeNull();
  await act(async()=>root.unmount());root=createRoot(container);await render();
  await open();await click('Resume your review');expect(document.querySelector('.omni-answer-choices [aria-pressed="true"]')).toBeTruthy();
});

test('duplicate clicks during a native SoA save issue one write and retain the pending decision',async()=>{
  setup('A.5.1');await render();await open();await click('Reassess applicability');await changeInput('[aria-label="Omnibot SoA justification"]','A deliberate revised justification.');
  let resolve;props.onSaveAssessment.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  await act(async()=>{const save=button('Save applicability decision');save.click();save.click();});expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);expect(button('Save applicability decision').disabled).toBe(true);
  await act(async()=>resolve(false));expect(document.querySelector('[aria-label="Omnibot SoA justification"]').value).toBe('A deliberate revised justification.');
});

test('unsaved interview wording independently blocks a structured SoA save',async()=>{
  setup('A.5.1');await render();await open();await complete();await changeInput('[aria-label="Omnibot implementation summary"]','Exact unsaved wording\nretained through the position view.');
  await click('Current position');expect(button('Reassess applicability').disabled).toBe(true);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await click('Resume your review');expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe('Exact unsaved wording\nretained through the position view.');
});

test('a context answer requires explanation without becoming an SoA exclusion',async()=>{
  const id=Object.keys(isoGuidedCatalog.definitions).find(key=>isoGroups(key,{},isoGuidedCatalog.version).some(group=>group.questions.some(q=>q.type==='context')));
  expect(id).toBeTruthy();setup(id);await render();await open();await click('Start');
  let question;
  for(let guard=0;guard<20;guard++){
    const group=isoGroups(id,stored.answers,stored.version)[stored.step];question=group.questions.find(q=>q.type==='context');
    await act(async()=>document.querySelectorAll('.omni-answer-choices').forEach(choices=>[...choices.querySelectorAll('button')].find(item=>item.textContent==='Relevant'||item.textContent==='Yes')?.click()));
    if(question)break;await click('Save & next');
  }
  expect(question).toBeTruthy();const choices=[...document.querySelectorAll('.omni-answer-choices')].find(group=>group.getAttribute('aria-label')===question.prompt);
  await act(async()=>[...choices.querySelectorAll('button')].find(item=>item.textContent==='Not relevant here').click());
  const writes=api.put.mock.calls.length;await click('Save & next');expect(api.put.mock.calls.length).toBe(writes);expect(document.body.textContent).toContain('not relevant here');
  await changeInput(document.getElementById('iso-detail-'+question.id),'This context is outside the documented system boundary.');await click('Save & next');
  expect(stored.answers[question.id]).toBe('Not relevant here');expect(isoGuidedResult(id,stored.answers,stored.version).status).not.toBe('not_applicable');expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('confirmed SoA save closes only after the refreshed interview is available',async()=>{
  setup('A.5.1');nativeDecisionWriter();await render();await open();await click('Reassess applicability');await changeInput('[aria-label="Omnibot SoA justification"]','Reviewed updated risk-treatment basis.');
  await act(async()=>document.querySelector('[aria-label="Close Omnibot Guide"]').click());await click('Save & close');
  expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);expect(document.querySelector('.omni-workspace-window')).toBeNull();expect(api.put).not.toHaveBeenCalled();
});

test('confirmed SoA save with a failed refresh retains the window and reports the actual limitation',async()=>{
  setup('A.5.1');nativeDecisionWriter();await render();await open();await click('Reassess applicability');await changeInput('[aria-label="Omnibot SoA justification"]','Reviewed justification retained on the native record.');
  api.get.mockRejectedValueOnce(new Error('Synthetic refresh unavailable'));await click('Save applicability decision');
  expect(document.body.textContent).toContain('Applicability decision saved, but interview refresh failed');expect(document.querySelector('.omni-workspace-window')).toBeTruthy();
  expect(props.current.soa_justification).toBe('Reviewed justification retained on the native record.');expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);expect(api.put).not.toHaveBeenCalled();
});

test('included controls with missing justification cannot apply an implementation proposal',async()=>{
  setup('A.5.1');props.current={...props.current,soa_justification:''};props.form=copy(props.current);
  await render();await open();await complete();expect(button('Save assessment').disabled).toBe(true);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Save an included SoA decision and its justification');
});
test.each(['4.1','A.5.1'])('%s fresh interview, complete multiline write-up, explicit native save and resume',async id=>{
  setup(id);await render();await open();await complete();
  expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(stored.completed).toBe(true);
  const text=document.querySelector('[aria-label="Omnibot implementation summary"]').value;
  for(const heading of ['OVERVIEW','IMPLEMENTATION BREAKDOWN','ITEMS TO ADDRESS'])expect(text).toContain(heading);
  expect(text).toContain(id);expect(stored.result.status).toBe('addressed');
  await click('Save assessment');expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);
  expect(props.onSaveAssessment.mock.calls[0][0]).toMatchObject({implementation:text,status:'addressed',guided_assessment_source:{version:isoGuidedCatalog.version,revision:stored.revision}});
  await act(async()=>root.unmount());root=createRoot(container);await render();await open();await click('Resume your review');
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(text);
});
test('failed progress save retains answers, group and native values; retry succeeds',async()=>{
  await render();await open();await click('Start');const group=isoGroups('4.1',{},isoGuidedCatalog.version)[0];
  await act(async()=>document.querySelectorAll('.omni-answer-choices button').forEach(item=>{if(item.textContent==='Yes')item.click();}));
  failWrite=true;await click('Save & next');expect(document.body.textContent).toContain('Synthetic save unavailable');expect(document.body.textContent).toContain(group.title);expect(stored.revision).toBe(0);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  failWrite=false;await click('Save & next');expect(stored.revision).toBe(1);
});
test('same-client display-name refresh retains unsaved answers without rehydration',async()=>{
  await render();await open();await click('Start');
  await act(async()=>document.querySelectorAll('.omni-answer-choices button').forEach(item=>{if(item.textContent==='No')item.click();}));
  const reads=api.get.mock.calls.length;
  mockOrg={clients:[{client_id:'iso-fixture',name:'Renamed ISO fixture'}]};await render();
  expect(api.get.mock.calls.length).toBe(reads);
  expect(document.querySelector('.omni-answer-choices [aria-pressed="true"]').textContent).toBe('No');
  expect(document.body.textContent).toContain('Interview edits are not saved yet');
  expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
test('same-client display-name refresh retains unsaved manual write-up and uses current confirmation name',async()=>{
  props.current={...props.current,implementation:'Existing native wording',status:'in_progress'};props.form=copy(props.current);
  await render();await open();await complete();
  const textarea=document.querySelector('[aria-label="Omnibot implementation summary"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,'Reviewed manual wording\nwith a retained second line.');textarea.dispatchEvent(new Event('input',{bubbles:true}));});
  const reads=api.get.mock.calls.length;
  mockOrg={clients:[{client_id:'iso-fixture',name:'Renamed ISO fixture'}]};await render();
  expect(api.get.mock.calls.length).toBe(reads);
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe('Reviewed manual wording\nwith a retained second line.');
  expect(document.body.textContent).toContain('Interview edits are not saved yet');
  await click('Update assessment');expect(document.body.textContent).toContain('Renamed ISO fixture — Requirement 4.1');
  await click('Cancel');expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
test('replacement cancellation, native failure and Save & close preserve reviewed work',async()=>{
  props.current={...props.current,status:'in_progress',implementation:'Existing manual ISO text'};props.form=copy(props.current);
  await render();await open();await complete();await click('Update assessment');expect(document.body.textContent).toContain('Agent 2 ISO fixture — Requirement 4.1');await click('Cancel');expect(props.onSaveAssessment).not.toHaveBeenCalled();
  props.onSaveAssessment.mockResolvedValueOnce(false);await click('Save & close');await click('Yes, update assessment');expect(document.body.textContent).toContain('Your interview and wording are retained');expect(document.querySelector('[aria-label="Omnibot implementation summary"]')).toBeTruthy();
  await click('Save & close');await click('Yes, update assessment');expect(document.querySelector('.omni-workspace-window')).toBeNull();
});
test('unconfirmed native save retains exact wording and does not claim rejection or success',async()=>{
  await render();await open();await complete();
  const textarea=document.querySelector('[aria-label="Omnibot implementation summary"]'),reviewed='OVERVIEW\nReviewed synthetic practice.\n\nIMPLEMENTATION BREAKDOWN\n- Retained wording.\n\nITEMS TO ADDRESS\n- Confirm saved state.';
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,reviewed);textarea.dispatchEvent(new Event('input',{bubbles:true}));});
  props.onSaveAssessment.mockResolvedValueOnce(false);await click('Save & close');
  expect(document.body.textContent).toContain('The assessment save could not be confirmed');
  expect(document.body.textContent).toContain('Reload the saved assessment before retrying');
  expect(document.body.textContent).not.toContain('The assessment was not saved');
  expect(document.body.textContent).not.toContain('Assessment saved.');
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(reviewed);
  expect(stored.narrative).toBe(reviewed);expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);
  expect(props.current.implementation).toBe('');expect(document.querySelector('.omni-workspace-window')).toBeTruthy();
});
test.each(['native','interview'])('new %s failure clears the prior success notice without closing or retrying',async stage=>{
  await render();await open();await complete();await click('Save assessment');
  expect(document.querySelector('.omni-workspace-window')).toBeNull();
  await open();expect(document.body.textContent).toContain('Assessment saved.');
  const wording=document.querySelector('[aria-label="Omnibot implementation summary"]').value;
  if(stage==='native')props.onSaveAssessment.mockResolvedValueOnce(false);else failWrite=true;
  await click('Save & close');
  expect(document.body.textContent).not.toContain('Assessment saved.');
  expect(document.body.textContent).toContain(stage==='native'?'The assessment save could not be confirmed':'Synthetic save unavailable');
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(wording);
  expect(document.querySelector('.omni-workspace-window')).toBeTruthy();
  expect(props.onSaveAssessment).toHaveBeenCalledTimes(stage==='native'?2:1);
});
test('native drafts block summary application and read-only mode blocks progress writes',async()=>{
  await render({disabled:true});await open();expect(button('Start').disabled).toBe(true);expect(api.put).not.toHaveBeenCalled();
  await render({disabled:false});await complete();await render({assessmentDirty:true});expect(button('Save assessment').disabled).toBe(true);expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
test('unfinished related-record draft blocks native summary but not interview progress',async()=>{
  await render({relatedDraft:true});await open();await complete();expect(stored.completed).toBe(true);
  expect(button('Save assessment').disabled).toBe(true);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await render({relatedDraft:false});await click('Save assessment');expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);
});
test('reload after a failed save requires explicit discard and cancellation retains answers',async()=>{
  await render();await open();await click('Start');
  await act(async()=>document.querySelectorAll('.omni-answer-choices button').forEach(item=>{if(item.textContent==='Yes')item.click();}));
  failWrite=true;await click('Save & next');const reads=api.get.mock.calls.length;
  await click('Reload saved interview');expect(api.get.mock.calls.length).toBe(reads);expect(document.body.textContent).toContain('Reload saved interview?');
  await click('Keep editing');expect(document.querySelector('[aria-pressed="true"]').textContent).toBe('Yes');
  await click('Reload saved interview');await click('Discard unsaved edits & reload');expect(api.get.mock.calls.length).toBe(reads+1);expect(document.querySelector('.omni-answer-choices [aria-pressed="true"]')).toBeNull();
});
test('wrong-client and disabled-program entry have no launcher or fetch',async()=>{
  await render({clientId:'other-client'});expect(document.querySelector('[data-testid="iso-guided-assessment"]')).toBeNull();expect(api.get).not.toHaveBeenCalled();
  setup('4.1');await render({configuration:{__program_active:false}});expect(document.querySelector('[data-testid="iso-guided-assessment"]')).toBeNull();expect(api.get).not.toHaveBeenCalled();
});
test('restored manual wording survives revised answers and requires explicit review',async()=>{
  await render();await open();await complete();
  const reviewed='OVERVIEW\nManual reviewer wording.\n\nIMPLEMENTATION BREAKDOWN\n- Actual reported practice.\n\nITEMS TO ADDRESS\n- Confirm the changed topic.';
  stored={...stored,narrative:reviewed,result:{...stored.result,narrative:reviewed}};
  await act(async()=>root.unmount());root=createRoot(container);await render();await open();await click('Resume your review');await click('Back to questions');
  await act(async()=>document.querySelectorAll('.omni-answer-choices button').forEach(item=>{if(item.textContent==='Partially')item.click();}));
  await click('Save & next');expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(reviewed);
  expect(button('Save assessment').disabled).toBe(true);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await act(async()=>root.unmount());root=createRoot(container);await render();await open();await click('Resume your review');
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(reviewed);expect(button('Save assessment').disabled).toBe(true);
  await click('Keep my wording after review');await click('Save assessment');expect(props.onSaveAssessment.mock.calls[0][0]).toMatchObject({implementation:reviewed,status:'in_progress'});
});
test('unsupported retained version produces a bounded error without erasing or applying its draft',async()=>{
  stored={...stored,revision:3,version:'iso27001-omni-future',narrative:'Retained reviewer wording',answers:{'future-answer':'Retained answer'}};
  await render();await open();expect(document.body.textContent).toContain('Saved answers and wording are retained');expect(button('Resume your review').disabled).toBe(true);
  expect(stored.narrative).toBe('Retained reviewer wording');expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('history pagination requests the first page without treating the click event as a cursor',async()=>{
  await render();await open();await complete();
  api.get.mockImplementation(async(path,options)=>({data:path.endsWith('/history')?options.params.before_revision?{items:[{revision:1,version:stored.version,narrative:'Earlier wording'}],has_more:false}:{items:[{revision:2,version:stored.version,narrative:'Recent wording'}],has_more:true,next_before_revision:2}:copy(stored)}));
  await click('Interview history');expect(api.get).toHaveBeenLastCalledWith(expect.stringContaining('/history'),{params:{}});
  await click('Load earlier snapshots');expect(api.get).toHaveBeenLastCalledWith(expect.stringContaining('/history'),{params:{before_revision:2}});
  expect(document.body.textContent).toContain('Recent wording');expect(document.body.textContent).toContain('Earlier wording');
});

test('restart clears only the current interview and wording-review basis',async()=>{
  await render();await open();await complete();expect(stored.summary_review).toBeTruthy();
  await click('Current position');await click('Begin a new review');
  await act(async()=>[...document.querySelector('.omni-refined-close').querySelectorAll('button')].find(item=>item.textContent==='Begin a new review').click());
  expect(stored.answers).toEqual({});expect(stored.summary_review).toBeNull();expect(stored.narrative).toBe('');expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('own native application rebases a freshly read base even when the local draft looked current',async()=>{
  await render();await open();await complete();const revision=stored.revision;
  const nextCurrent={...props.current,last_saved:'2026-10-10T13:00:00Z',implementation:stored.narrative,status:stored.result.status,guided_assessment_source:{version:stored.version,revision,by:'iso-actor'}};
  stored={...stored,current_assessment_token:nextCurrent.last_saved,lineage_stale:true};
  await render({current:nextCurrent,form:copy(nextCurrent)});await click('Back to questions');await click('Save & next');
  expect(api.put.mock.calls.some(([,body])=>body.rebase===true&&body.base_assessment_token===nextCurrent.last_saved)).toBe(true);
});

test('own native source never bypasses a changed scope',async()=>{
  await render();await open();await complete();const revision=stored.revision;
  const nextCurrent={...props.current,last_saved:'2026-10-10T13:00:00Z',implementation:stored.narrative,status:stored.result.status,guided_assessment_source:{version:stored.version,revision,by:'iso-actor'}};
  stored={...stored,current_scope_fingerprint:'b'.repeat(64),current_assessment_token:nextCurrent.last_saved,lineage_stale:true};
  await render({current:nextCurrent,form:copy(nextCurrent)});await click('Back to questions');const writes=api.put.mock.calls.length;await click('Save & next');
  expect(document.body.textContent).toContain('scope changed');expect(api.put.mock.calls.length).toBe(writes);expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test.each(['compare','restart'])('%s requires explicit discard of unsaved answers and exact multiline wording',async action=>{
  await render();await open();await complete();
  stored={...stored,narrative:'SAVED MANUAL WORDING\nsecond saved line',result:{...stored.result,narrative:'SAVED MANUAL WORDING\nsecond saved line'},lineage_stale:true,current_assessment_token:'own-save'};
  const savedInterview=copy(stored),ownCurrent={...props.current,last_saved:'own-save',implementation:stored.narrative,status:stored.result.status,guided_assessment_source:{version:stored.version,revision:stored.revision,by:'iso-actor'}};
  await act(async()=>root.unmount());root=createRoot(container);await render({current:ownCurrent,form:copy(ownCurrent)});await open();await click('Resume your review');
  const wording='UNSAVED EXACT WORDING\nsecond line\n\nKeep these line breaks.',detail='UNSAVED ANSWER DETAIL\nsecond answer line';
  await changeInput('[aria-label="Omnibot implementation summary"]',wording);await click('Back to questions');
  const question=isoGroups('4.1',stored.answers,stored.version).at(-1).questions.find(q=>q.type==='select');expect(question).toBeTruthy();
  const choices=()=>[...document.querySelectorAll('.omni-answer-choices')].find(group=>group.getAttribute('aria-label')===question.prompt);
  const partial=[...choices().querySelectorAll('button')].find(item=>item.textContent==='Partially');expect(partial.closest('fieldset').disabled).toBe(false);
  await act(async()=>partial.click());await changeInput(document.getElementById('iso-detail-'+question.id),detail);
  const changedCurrent={...ownCurrent,last_saved:'external-save',implementation:'Native record changed elsewhere.\nRetain this saved position.',guided_assessment_source:null};
  stored={...stored,current_assessment_token:changedCurrent.last_saved};await render({current:changedCurrent,form:copy(changedCurrent)});
  expect(document.body.textContent).toContain('saved assessment or scope changed');
  const reads=api.get.mock.calls.length,writes=api.put.mock.calls.length,nativeBefore=copy(props.current);
  async function request(){
    if(action==='compare'){
      await click('Compare & continue');const check=document.querySelector('input[type="checkbox"]');if(!check.checked)await act(async()=>check.click());await click('Retain answers & continue');
    }else{
      await click('Current position');await click('Begin a new review');
      const confirmation=[...document.querySelector('.omni-refined-close').querySelectorAll('button')].find(item=>item.textContent==='Begin a new review');
      if(confirmation)await act(async()=>confirmation.click());
    }
  }
  await request();expect(api.get.mock.calls.length).toBe(reads);expect(api.put.mock.calls.length).toBe(writes);
  expect(document.querySelector('.omni-refined-close').textContent).toContain('unsaved');await click('Keep editing');
  await click('Current position');await click('Resume your review');expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(wording);
  await click('Back to questions');expect(document.getElementById('iso-detail-'+question.id).value).toBe(detail);
  expect(choices().querySelector('[aria-pressed="true"]').textContent).toBe('Partially');expect(stored.answers).toEqual(savedInterview.answers);expect(stored.narrative).toBe(savedInterview.narrative);
  await request();await click(action==='compare'?'Discard unsaved edits & continue':'Discard unsaved edits & begin new review');
  expect(api.get.mock.calls.length).toBe(reads+1);expect(api.put.mock.calls.length).toBe(writes+1);
  expect(api.put.mock.calls.at(-1)[1]).toMatchObject(action==='compare'?{rebase:true,answers:savedInterview.answers,narrative:savedInterview.narrative}:{restart:true,answers:{},narrative:'',summary_review:null});
  expect(api.put.mock.calls.at(-1)[1].expected_revision).toBe(savedInterview.revision);
  expect(props.current).toEqual(nativeBefore);expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(document.querySelector('.omni-refined-close')).toBeNull();
});

test.each(['4.1','A.5.1','A.8.13'])('%s inline interview preserves progress without floating Omni and applies only after reviewed native save',async id=>{
  setup(id);const onInlineClose=jest.fn();await render({inline:true,inlineOpen:false,onInlineClose});
  const panel=document.querySelector('.assessment-inline-interview');expect(panel.hidden).toBe(true);
  expect(document.querySelector('[aria-label="Open Omnibot guide"]')).toBeNull();expect(document.querySelector('.omni-workspace-window')).toBeNull();
  await render({inlineOpen:true});await complete();
  const summary=document.querySelector('[aria-label="Omnibot implementation summary"]');
  expect(summary.value).toContain('\n\nControls in place\n• ');expect(summary.value).not.toContain('IMPLEMENTATION BREAKDOWN');expect(summary.value).not.toContain('\n\nITEMS TO ADDRESS');
  expect(stored.result).toEqual({...isoGuidedResult(id,stored.answers,stored.version,'Agent 2 ISO fixture'),narrative:summary.value});expect(props.onSaveAssessment).not.toHaveBeenCalled();
  const reviewed=summary.value+'\nExact operator wording.\n';await changeInput(summary,reviewed);
  await render({inlineOpen:false});await render({inlineOpen:true});expect(document.querySelector('.assessment-inline-interview')).toBe(panel);expect(summary.value).toBe(reviewed);
  await click('Save assessment');expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);expect(props.onSaveAssessment.mock.calls[0][0]).toMatchObject({implementation:reviewed,status:'addressed'});expect(onInlineClose).toHaveBeenCalledTimes(1);
  expect(props.current.verification).toBe('not_verified');expect(stored.narrative).toBe(reviewed);
});

test.each(['4.1','A.5.1','A.8.13'])('%s inline component binds reviewed text through the actual preview completion and native-save routes',async id=>{
  setup(id);sessionStorage.clear();const previewApi=axios.create({adapter:previewAdapter});
  const db=Object.fromEntries(Object.keys(ids).map(kind=>[kind,[]])),row={...props.current,technology:'',notes:'',na_rationale:'',owner_id:null,process_owner_id:null,iso_assessment_checks:[],assessment_history:[]};
  db.user={user_id:'iso-actor',name:'SYNTHETIC ISO reviewer',role:'super_admin',status:'active',client_ids:['iso-fixture']};db.logs=[];
  db.users.push(db.user);db.clients.push({client_id:'iso-fixture',name:'SYNTHETIC ISO contract',status:'active'});
  db.framework_assessments.push(row);db.requirements.push({client_id:'iso-fixture',baseline_key:'iso-27001',baseline_response:'applies'});
  saveStore(db);await previewApi.post('/demo/enter');props={...props,current:row,record:row,form:copy(row)};
  const path='/framework_assessments/'+row.framework_assessment_id;
  const requests=new Set(),track=request=>{requests.add(request);request.then(()=>requests.delete(request),()=>requests.delete(request));return request;};
  const settle=()=>act(async()=>{while(requests.size)await Promise.all([...requests]);});
  api.get.mockImplementation(url=>track(previewApi.get(url)));
  api.put.mockImplementation((url,body)=>track(previewApi.put(url,body).then(response=>{stored=copy(response.data);return response;})));
  props.onSaveAssessment.mockImplementation(async(values,expected)=>{
    expect(expected).toBe(JSON.stringify(props.form));
    const saved=(await track(previewApi.patch(path,{...values,expected_last_assessed:props.current.last_saved??props.current.last_assessed??null}))).data;
    props={...props,current:saved,form:copy(saved)};return true;
  });
  const onInlineClose=jest.fn();await render({inline:true,inlineOpen:true,onInlineClose});await settle();await click('Start');
  for(let guard=0;guard<12&&!document.body.textContent.includes('Review your assessment summary');guard++){
    await act(async()=>document.querySelectorAll('.omni-answer-choices').forEach(group=>[...group.querySelectorAll('button')].find(item=>['Yes','Relevant'].includes(item.textContent))?.click()));
    await click('Save & next');await settle();
  }
  expect(document.body.textContent).toContain('Review your assessment summary');
  const summary=document.querySelector('[aria-label="Omnibot implementation summary"]'),reported=summary.value;
  expect(reported).toContain('\n\nControls in place\n• ');
  expect(stored.result.narrative).toBe(stored.narrative);expect(stored.narrative).toBe(reported);
  expect((await previewApi.get(path)).data).toEqual(row);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  const reviewed=reported+'\nExact separately reviewed wording.\n';await changeInput(summary,reviewed);await click('Save assessment');await settle();
  expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);expect(onInlineClose).toHaveBeenCalledTimes(1);
  const saved=(await previewApi.get(path)).data,interview=(await previewApi.get(path+'/guided-assessment')).data;
  expect(interview.narrative).toBe(reviewed);expect(interview.result.narrative).toBe(reviewed);
  expect(saved.implementation).toBe(reviewed);expect(saved.status).toBe('addressed');expect(saved.assessment_history.at(-1).implementation).toBe(reviewed);
  for(const key of ['verification','soa_applicability','soa_justification','owner_id','process_owner_id','iso_assessment_checks','technology','notes'])expect(saved[key]).toEqual(row[key]);
});

test('inline saved early progress survives remount and uses the persisted group',async()=>{
  const onInlineClose=jest.fn();await render({inline:true,inlineOpen:true,onInlineClose});await click('Start');
  await act(async()=>document.querySelectorAll('.omni-answer-choices').forEach(group=>[...group.querySelectorAll('button')].find(item=>item.textContent==='Yes')?.click()));
  await click('Save & next');const step=stored.step,answers=copy(stored.answers);expect(step).toBe(1);await click('Save & close');
  expect(onInlineClose).toHaveBeenCalledTimes(1);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await act(async()=>root.unmount());root=createRoot(container);await render({inlineOpen:true});await click('Resume your review');
  expect(document.querySelector('.omni-group-progress').getAttribute('aria-label')).toContain('Question group '+(step+1));expect(stored.answers).toEqual(answers);
});

test('inline summary conflict and concurrent native draft preserve wording without stale native write',async()=>{
  await render({inline:true,inlineOpen:true,onInlineClose:jest.fn()});await complete();const summary=document.querySelector('[aria-label="Omnibot implementation summary"]'),text=summary.value;
  failWrite=true;await click('Save assessment');expect(summary.value).toBe(text);expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(props.onInlineClose).not.toHaveBeenCalled();
  failWrite=false;const original=api.put.getMockImplementation();let finish;api.put.mockImplementationOnce((path,body)=>new Promise(resolve=>{finish=async()=>resolve(await original(path,body));}));
  await click('Save assessment');await render({assessmentDirty:true,form:{...props.form,implementation:'Concurrent native draft'}});await act(async()=>finish());
  expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(props.onInlineClose).not.toHaveBeenCalled();expect(summary.value).toBe(text);
});

test('inline restored legacy manual summary remains exact until explicit refresh from revised answers',async()=>{
  const answers=Object.fromEntries(isoGuidedCatalog.definitions['4.1'].groups.flatMap(group=>group.questions).map(q=>[q.id,q.type==='text'?'':q.type==='context'?'Relevant':'Yes']));
  stored={...stored,answers,completed:true,revision:2,narrative:'Legacy manual wording\n\nIMPLEMENTATION BREAKDOWN\nRetain this exact text.\n',summary_review:{version:stored.version,answers},result:isoGuidedResult('4.1',answers)};
  await render({inline:true,inlineOpen:true});await click('Resume your review');expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(stored.narrative);
  await click('Back to questions');await act(async()=>[...document.querySelector('.omni-answer-choices').querySelectorAll('button')].find(item=>item.textContent==='No').click());await click('Save & next');
  expect(button('Refresh from answers')).toBeTruthy();await click('Refresh from answers');expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(isoInlineNarrative('4.1',stored.answers,stored.version,'Agent 2 ISO fixture'));
  expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('inline excluded control and read-only session retain mandatory SoA and permission guards',async()=>{
  setup('A.5.1');props.current={...props.current,soa_applicability:'excluded',soa_justification:'Outside reviewed scope'};props.form=copy(props.current);
  await render({inline:true,inlineOpen:true});await complete();expect(button('Save assessment').disabled).toBe(true);
  await render({disabled:true});expect(button('Save assessment').disabled).toBe(true);await click('Back to questions');expect(button('Save & next').disabled).toBe(true);
  expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
