import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import SocGuidedAssessor from './SocGuidedAssessor';
import {socGuidedCatalog,socGroups} from '@/lib/socGuidedAssessment';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:e=>e.message}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'soc-actor',role:'super_admin'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
const copy=value=>JSON.parse(JSON.stringify(value)),fingerprint='a'.repeat(64);
let root,container,stored,props,failWrite,mockOrg;
const button=name=>[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===name);
async function click(name){const target=button(name);expect(target).toBeTruthy();expect(target.disabled).toBe(false);await act(async()=>target.click());}
async function render(extra={}){props={...props,...extra};await act(async()=>root.render(<SocGuidedAssessor {...props}/>));}
function setup(id){
  const current={client_id:'soc-fixture',framework_key:'soc-2',framework_assessment_id:'soc-'+id,definition_id:id,title:socGuidedCatalog.definitions[id].title,status:'not_assessed',implementation:'',verification:'not_verified',last_saved:null};
  stored={version:socGuidedCatalog.version,answers:{},step:0,completed:false,revision:0,narrative:'',base_assessment_token:null,base_scope_fingerprint:fingerprint,current_assessment_token:null,current_scope_fingerprint:fingerprint,lineage_known:true,lineage_stale:false};
  props={clientId:'soc-fixture',configuration:{categories:['security','availability','confidentiality','processing_integrity','privacy']},record:current,current,form:copy(current),onSaveAssessment:jest.fn(async()=>true),onDraftChange:jest.fn()};
}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();window.history.replaceState({},'', '/');container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);failWrite=false;mockOrg={clients:[{client_id:'soc-fixture',name:'Agent 2 SOC fixture'}]};setup('CC1.1');
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
test.each(Object.keys(socGuidedCatalog.definitions))('%s fresh interview, complete multiline write-up, explicit native save and resume',async id=>{
  setup(id);await render();await open();await complete();
  expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(stored.completed).toBe(true);
  const text=document.querySelector('[aria-label="Omnibot implementation summary"]').value;
  for(const heading of ['OVERVIEW','IMPLEMENTATION BREAKDOWN','ITEMS TO ADDRESS'])expect(text).toContain(heading);
  expect(text).toContain(id);expect(stored.result.status).toBe('addressed');
  await click('Save assessment');expect(props.onSaveAssessment).toHaveBeenCalledTimes(1);
  expect(props.onSaveAssessment.mock.calls[0][0]).toMatchObject({implementation:text,status:'addressed',guided_assessment_source:{version:socGuidedCatalog.version,revision:stored.revision}});
  await act(async()=>root.unmount());root=createRoot(container);await render();await open();await click('Resume your review');
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(text);
});
test('failed progress save retains answers, group and native values; retry succeeds',async()=>{
  await render();await open();await click('Start');const group=socGroups('CC1.1',{},socGuidedCatalog.version)[0];
  await act(async()=>document.querySelectorAll('.omni-answer-choices button').forEach(item=>{if(item.textContent==='Yes')item.click();}));
  failWrite=true;await click('Save & next');expect(document.body.textContent).toContain('Synthetic save unavailable');expect(document.body.textContent).toContain(group.title);expect(stored.revision).toBe(0);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  failWrite=false;await click('Save & next');expect(stored.revision).toBe(1);
});
test('same-client display-name refresh retains unsaved answers without rehydration',async()=>{
  await render();await open();await click('Start');
  await act(async()=>document.querySelectorAll('.omni-answer-choices button').forEach(item=>{if(item.textContent==='No')item.click();}));
  const reads=api.get.mock.calls.length;
  mockOrg={clients:[{client_id:'soc-fixture',name:'Renamed SOC fixture'}]};await render();
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
  mockOrg={clients:[{client_id:'soc-fixture',name:'Renamed SOC fixture'}]};await render();
  expect(api.get.mock.calls.length).toBe(reads);
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe('Reviewed manual wording\nwith a retained second line.');
  expect(document.body.textContent).toContain('Interview edits are not saved yet');
  await click('Update assessment');expect(document.body.textContent).toContain('Renamed SOC fixture — Criterion CC1.1');
  await click('Cancel');expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
test('replacement cancellation, native failure and Save & close preserve reviewed work',async()=>{
  props.current={...props.current,status:'in_progress',implementation:'Existing manual SOC text'};props.form=copy(props.current);
  await render();await open();await complete();await click('Update assessment');expect(document.body.textContent).toContain('Agent 2 SOC fixture — Criterion CC1.1');await click('Cancel');expect(props.onSaveAssessment).not.toHaveBeenCalled();
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
test('wrong-client and deselected-category entry have no launcher or fetch',async()=>{
  await render({clientId:'other-client'});expect(document.querySelector('[data-testid="soc-guided-assessment"]')).toBeNull();expect(api.get).not.toHaveBeenCalled();
  setup('P1.1');await render({configuration:{categories:['security']}});expect(document.querySelector('[data-testid="soc-guided-assessment"]')).toBeNull();expect(api.get).not.toHaveBeenCalled();
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
  stored={...stored,revision:3,version:'soc2-omni-future',narrative:'Retained reviewer wording',answers:{'future-answer':'Retained answer'}};
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
  const nextCurrent={...props.current,last_saved:'2026-10-10T13:00:00Z',implementation:stored.narrative,status:stored.result.status,guided_assessment_source:{version:stored.version,revision,by:'soc-actor'}};
  stored={...stored,current_assessment_token:nextCurrent.last_saved,lineage_stale:true};
  await render({current:nextCurrent,form:copy(nextCurrent)});await click('Back to questions');await click('Save & next');
  expect(api.put.mock.calls.some(([,body])=>body.rebase===true&&body.base_assessment_token===nextCurrent.last_saved)).toBe(true);
});

test('own native source never bypasses a changed scope',async()=>{
  await render();await open();await complete();const revision=stored.revision;
  const nextCurrent={...props.current,last_saved:'2026-10-10T13:00:00Z',implementation:stored.narrative,status:stored.result.status,guided_assessment_source:{version:stored.version,revision,by:'soc-actor'}};
  stored={...stored,current_scope_fingerprint:'b'.repeat(64),current_assessment_token:nextCurrent.last_saved,lineage_stale:true};
  await render({current:nextCurrent,form:copy(nextCurrent)});await click('Back to questions');const writes=api.put.mock.calls.length;await click('Save & next');
  expect(document.body.textContent).toContain('scope changed');expect(api.put.mock.calls.length).toBe(writes);expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test.each(['compare','restart'])('%s requires explicit discard of unsaved answers and exact multiline wording',async action=>{
  await render();await open();await complete();
  stored={...stored,narrative:'SAVED MANUAL WORDING\nsecond saved line',result:{...stored.result,narrative:'SAVED MANUAL WORDING\nsecond saved line'},lineage_stale:true,current_assessment_token:'own-save'};
  const savedInterview=copy(stored),ownCurrent={...props.current,last_saved:'own-save',implementation:stored.narrative,status:stored.result.status,guided_assessment_source:{version:stored.version,revision:stored.revision,by:'soc-actor'}};
  await act(async()=>root.unmount());root=createRoot(container);await render({current:ownCurrent,form:copy(ownCurrent)});await open();await click('Resume your review');
  const wording='UNSAVED EXACT WORDING\nsecond line\n\nKeep these line breaks.',detail='UNSAVED ANSWER DETAIL\nsecond answer line';
  async function changeInput(target,value){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(target,value);target.dispatchEvent(new Event('input',{bubbles:true}));});}
  await changeInput(document.querySelector('[aria-label="Omnibot implementation summary"]'),wording);await click('Back to questions');
  const question=socGroups('CC1.1',stored.answers,stored.version).at(-1).questions.find(q=>!q.type||q.type==='select');expect(question).toBeTruthy();
  const choices=()=>[...document.querySelectorAll('.omni-answer-choices')].find(group=>group.getAttribute('aria-label')===question.prompt);
  const partial=[...choices().querySelectorAll('button')].find(item=>item.textContent==='Partially');expect(partial.closest('fieldset').disabled).toBe(false);
  await act(async()=>partial.click());await changeInput(document.getElementById('soc-detail-'+question.id),detail);
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
  await click('Back to questions');expect(document.getElementById('soc-detail-'+question.id).value).toBe(detail);
  expect(choices().querySelector('[aria-pressed="true"]').textContent).toBe('Partially');expect(stored.answers).toEqual(savedInterview.answers);expect(stored.narrative).toBe(savedInterview.narrative);
  await request();await click(action==='compare'?'Discard unsaved edits & continue':'Discard unsaved edits & begin new review');
  expect(api.get.mock.calls.length).toBe(reads+1);expect(api.put.mock.calls.length).toBe(writes+1);
  expect(api.put.mock.calls.at(-1)[1]).toMatchObject(action==='compare'?{rebase:true,answers:savedInterview.answers,narrative:savedInterview.narrative}:{restart:true,answers:{},narrative:'',summary_review:null});
  expect(api.put.mock.calls.at(-1)[1].expected_revision).toBe(savedInterview.revision);
  expect(props.current).toEqual(nativeBefore);expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(document.querySelector('.omni-refined-close')).toBeNull();
});


async function openInline(){await render({inline:true,inlineOpen:true,onInlineClose:jest.fn(()=>{props={...props,inlineOpen:false};root.render(<SocGuidedAssessor {...props}/>);})});}

test.each(['CC1.1','A1.1','C1.1','PI1.1','P1.1'])('%s inline completion reuses category questions and saves a controls-only narrative',async id=>{
 setup(id);await render();await openInline();
 expect(document.querySelector('.omni-character,.omni-launch-button,.omni-workspace-window')).toBeNull();
 await complete();expect(props.onSaveAssessment).not.toHaveBeenCalled();
 const text=document.querySelector('[aria-label="Assessment implementation summary"]').value;
 expect(text).toContain('\n\nControls in place\n');expect(text).not.toMatch(/OVERVIEW|IMPLEMENTATION BREAKDOWN|ITEMS TO ADDRESS/);
 await click('Save assessment');expect(props.onSaveAssessment).toHaveBeenCalledWith(expect.objectContaining({implementation:text,status:'addressed'}),expect.any(String));
 expect(document.querySelector('section[aria-label="SOC 2 interview"]').hidden).toBe(true);
 await act(async()=>root.unmount());root=createRoot(container);await render();await openInline();await click('Resume your review');
 expect(document.querySelector('[aria-label="Assessment implementation summary"]').value).toBe(text);
});

test('inline partial progress, Back and Save & close preserve answers without native application',async()=>{
 await render();await openInline();await click('Start');
 await act(async()=>document.querySelectorAll('.omni-answer-choices button').forEach(item=>{if(item.textContent==='Yes')item.click();}));
 await click('Save & next');expect(stored.step).toBe(1);await click('Back');
 expect(document.querySelector('.omni-answer-choices [aria-pressed="true"]').textContent).toBe('Yes');
 await click('Save & close');expect(props.onSaveAssessment).not.toHaveBeenCalled();
 expect(document.querySelector('section[aria-label="SOC 2 interview"]').hidden).toBe(true);
 const answers=copy(stored.answers);await act(async()=>root.unmount());root=createRoot(container);await render();await openInline();await click('Resume your review');
 expect(stored.answers).toEqual(answers);expect(document.querySelector('.omni-answer-choices [aria-pressed="true"]').textContent).toBe('Yes');
});

test('collapsing and re-expanding the inline interview retains unsaved answers',async()=>{
 await render();await openInline();await click('Start');
 await act(async()=>document.querySelectorAll('.omni-answer-choices button').forEach(item=>{if(item.textContent==='No')item.click();}));
 const reads=api.get.mock.calls.length;await render({inlineOpen:false});
 expect(document.querySelector('section[aria-label="SOC 2 interview"]').hidden).toBe(true);
 await render({inlineOpen:true});expect(document.querySelector('.omni-answer-choices [aria-pressed="true"]').textContent).toBe('No');
 expect(api.get.mock.calls.length).toBe(reads);expect(api.put).not.toHaveBeenCalled();
});

test('inline read-only, native drafts and related drafts preserve write boundaries',async()=>{
 await render({disabled:true});await openInline();expect(button('Start').disabled).toBe(true);expect(api.put).not.toHaveBeenCalled();
 await render({disabled:false,relatedDraft:true});await complete();expect(stored.completed).toBe(true);expect(button('Save assessment').disabled).toBe(true);
 await render({relatedDraft:false,assessmentDirty:true});expect(button('Save assessment').disabled).toBe(true);expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('inline failed application retains exact reviewed wording and independent native values',async()=>{
 await render();await openInline();await complete();
 const textarea=document.querySelector('[aria-label="Assessment implementation summary"]'),wording='Manual report paragraph.\n\nControls in place\n• Reported practice.';
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,wording);textarea.dispatchEvent(new Event('input',{bubbles:true}));});
 props.onSaveAssessment.mockResolvedValueOnce(false);await click('Save & close');
 expect(document.body.textContent).toContain('The assessment save could not be confirmed');
 expect(document.querySelector('section[aria-label="SOC 2 interview"]').hidden).toBe(false);
 expect(document.querySelector('[aria-label="Assessment implementation summary"]').value).toBe(wording);expect(stored.narrative).toBe(wording);
 expect(props.current.implementation).toBe('');expect(props.current.verification).toBe('not_verified');
});

test('program recommendations retain the Omnibot launcher and native open navigation',async()=>{
 const onSelect=jest.fn(),row={client_id:'soc-fixture',framework_key:'soc-2',definition_id:'CC1.1',title:'Control environment',status:'not_assessed'};
 await render({record:null,rows:[row],contextComplete:true,onSelect});
 const launcher=document.querySelector('[aria-label="Open Omnibot guide"]');expect(launcher).toBeTruthy();
 await act(async()=>launcher.click());expect(document.body.textContent).toContain('Omnibot’s recommended next steps');
 await click('Open criterion CC1.1');expect(onSelect).toHaveBeenCalledWith(row);
});


test('configured SOC program guide uses local circular presentation and keeps native category destinations',async()=>{
  localStorage.setItem('omnisciente:brawndo-dashboard-theme','dark');
  const onSelect=jest.fn(),rows=[
    {client_id:'soc-fixture',framework_key:'soc-2',definition_id:'CC1.1',title:'Control environment',category:'security',status:'not_assessed'},
    {client_id:'soc-fixture',framework_key:'soc-2',definition_id:'A1.1',title:'Available capacity',category:'availability',status:'not_assessed'},
    {client_id:'soc-fixture',framework_key:'soc-2',definition_id:'C1.1',title:'Confidential information',category:'confidentiality',status:'not_assessed'},
  ];
  await render({record:null,current:null,rows,contextComplete:true,onSelect});
  const guide=document.querySelector('[data-testid="soc-guided-assessment"]');
  expect(guide.classList.contains('shared-program-omni')).toBe(true);
  expect(guide.dataset.theme).toBe('dark');
  expect(guide.querySelector('.omni-launch-button .cis-omni-owl')).toBeTruthy();
  expect(document.documentElement.hasAttribute('data-brawndo-cis-visual')).toBe(false);
  await open();
  const panel=guide.querySelector('.omni-workspace-window');
  expect(panel.classList.contains('cis-omni-program-window')).toBe(true);
  expect(parseFloat(panel.style.width)).toBe(360);
  expect(document.body.textContent).toContain('3 criteria in the configured SOC 2 scope');
  await act(async()=>guide.querySelector('[aria-label="Minimize Omnibot Guide"]').click());
  expect(guide.querySelector('.omni-workspace-window')).toBeNull();
  await open();await click('Open criterion C1.1');
  expect(onSelect).toHaveBeenCalledWith(rows[2]);
  expect(api.get).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('native inline SOC criterion editor remains outside the floating guide presentation',async()=>{
  await render({inline:true,inlineOpen:true});
  const guide=document.querySelector('[data-testid="soc-guided-assessment"]');
  expect(guide.classList.contains('shared-program-omni')).toBe(false);
  expect(guide.hasAttribute('data-theme')).toBe(false);
  expect(guide.querySelector('.cis-omni-owl')).toBeNull();
  expect(guide.querySelector('section[aria-label="SOC 2 interview"]')).toBeTruthy();
});

async function openSequential(){
  await render({inline:true,sequential:true,inlineOpen:true});
  await click(stored.revision?'Resume guided assessment':'Begin guided assessment');
}
async function answerSequential(value){
  const fieldset=document.querySelector('.cis-sequential-interview fieldset'),select=fieldset?.querySelector('select');
  if(!select)return;
  if(!value&&select.value)return;
  const key=fieldset.dataset.questionId,choice=value||(key==='additional_gap'||key==='additional_confirmation'?'No':[...select.options].find(option=>['Yes','Relevant'].includes(option.value))?.value);
  if(choice)await act(async()=>{select.value=choice;select.dispatchEvent(new Event('change',{bubbles:true}));});
}
async function completeSequential(){
  for(let guard=0;guard<80&&!document.body.textContent.includes('Review your assessment summary');guard++){
    await answerSequential();
    await click(button('Review summary')?'Review summary':button('Review answers')?'Review answers':'Continue');
  }
  expect(document.body.textContent).toContain('Review your assessment summary');
}
test.each(['CC1.1','A1.1','C1.1','PI1.1','P1.1'])('%s sequential inline questions retain group checkpoints and require the separate native assessment save',async id=>{
  setup(id);await openSequential();await completeSequential();
  const groups=socGroups(id,stored.answers,stored.version),steps=[...groups.slice(1).map((_,index)=>index+1),groups.length-1];
  expect(api.put.mock.calls.map(([,body])=>body.step)).toEqual(steps);expect(stored.completed).toBe(true);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  expect(props.current.implementation).toBe('');expect(props.current.status).toBe('not_assessed');expect(props.current.verification).toBe('not_verified');
  const text=document.querySelector('[aria-label="Assessment implementation summary"]').value;expect(text).toContain('\n\nControls in place\n');
  await click('Save assessment');expect(props.onSaveAssessment).toHaveBeenCalledWith(expect.objectContaining({implementation:text,status:'addressed',guided_assessment_source:{version:stored.version,revision:stored.revision,generated_at:stored.generated_at}}),expect.any(String));
  expect(document.querySelector('section[aria-label="SOC 2 interview"]').hidden).toBe(true);
  await act(async()=>root.unmount());root=createRoot(container);await openSequential();expect(document.querySelector('[aria-label="Assessment implementation summary"]').value).toBe(text);
});
test('sequential Pause retains unsaved answers and cursor without checkpoint or native writes',async()=>{
  setup('P6.1');await openSequential();await answerSequential();await click('Continue');await answerSequential('Outside the selected system');
  const question=document.querySelector('.cis-sequential-interview fieldset').dataset.questionId,reads=api.get.mock.calls.length;
  await click('Pause & return');expect(document.querySelector('section[aria-label="SOC 2 interview"]').hidden).toBe(true);
  expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(props.onDraftChange).toHaveBeenLastCalledWith(true);
  expect(document.activeElement).toBe(button('Resume guided assessment'));await click('Resume guided assessment');
  expect(document.activeElement).toBe(document.querySelector('.cis-sequential-interview h3'));
  expect(document.querySelector('.cis-sequential-interview fieldset').dataset.questionId).toBe(question);expect(document.querySelector('.cis-sequential-interview select').value).toBe('Outside the selected system');
  expect(api.get.mock.calls.length).toBe(reads);expect(stored.answers).toEqual({});
  await click('Save & close');expect(stored.completed).toBe(false);expect(stored.step).toBe(0);expect(stored.answers[question]).toBe('Outside the selected system');expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
test('sequential required scope explanation and failed checkpoint retain the same native question and answers',async()=>{
  setup('P6.1');await openSequential();await answerSequential();await click('Continue');await answerSequential('Outside the selected system');
  await click('Continue');await answerSequential();await click('Continue');await answerSequential();await click('Review answers');await click('Review summary');
  expect(document.body.textContent).toContain('Explain why this context is outside the selected system.');expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await click('Edit answer 2');const detail=document.getElementById('soc-detail-P6.1-disclosure-context');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(detail,'Recorded scope decision.');detail.dispatchEvent(new Event('input',{bubbles:true}));});
  await answerSequential('Relevant');failWrite=true;await click('Continue');expect(document.body.textContent).toContain('Synthetic save unavailable');
  expect(document.querySelector('.cis-sequential-interview fieldset').dataset.questionId).toBe('P6.1-disclosure-context');expect(detail.value).toBe('Recorded scope decision.');expect(stored.answers).toEqual({});
  failWrite=false;await click('Continue');expect(stored.step).toBe(1);expect(stored.answers['P6.1-disclosure-context_detail']).toBe('Recorded scope decision.');expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
test('sequential answer review preserves manual wording and replacement cancellation before a guarded native update',async()=>{
  props.current={...props.current,implementation:'Existing saved native wording.',status:'addressed'};props.form=copy(props.current);
  await openSequential();await completeSequential();const reviewed='Exact manual wording.\n\nRetained second paragraph.';
  const summary=document.querySelector('[aria-label="Assessment implementation summary"]');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(summary,reviewed);summary.dispatchEvent(new Event('input',{bubbles:true}));});
  await click('Back to questions');await answerSequential('Partially');await completeSequential();
  expect(document.querySelector('[aria-label="Assessment implementation summary"]').value).toBe(reviewed);expect(button('Update assessment').disabled).toBe(true);
  await click('Keep my wording after review');await click('Update assessment');await click('Cancel');expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(props.current.implementation).toBe('Existing saved native wording.');
  await click('Update assessment');await click('Yes, update assessment');expect(props.onSaveAssessment).toHaveBeenCalledWith(expect.objectContaining({implementation:reviewed,status:'in_progress'}),expect.any(String));
});
test('sequential read-only and related drafts retain their separate write boundaries',async()=>{
  await render({disabled:true});await openSequential();expect(button('Start').disabled).toBe(true);expect(api.put).not.toHaveBeenCalled();
  await render({disabled:false,relatedDraft:true});await click('Start');await completeSequential();expect(stored.completed).toBe(true);expect(button('Save assessment').disabled).toBe(true);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await render({relatedDraft:false,assessmentDirty:true});expect(button('Save assessment').disabled).toBe(true);expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
