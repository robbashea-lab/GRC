import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import SocGuidedAssessor from './SocGuidedAssessor';
import {socGuidedCatalog,socGroups} from '@/lib/socGuidedAssessment';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:e=>e.message}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'soc-actor',role:'super_admin'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({clients:[{client_id:'soc-fixture',name:'Agent 2 SOC fixture'}]})}));
const copy=value=>JSON.parse(JSON.stringify(value)),fingerprint='a'.repeat(64);
let root,container,stored,props,failWrite;
const button=name=>[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===name);
async function click(name){const target=button(name);expect(target).toBeTruthy();expect(target.disabled).toBe(false);await act(async()=>target.click());}
async function render(extra={}){props={...props,...extra};await act(async()=>root.render(<SocGuidedAssessor {...props}/>));}
function setup(id){
  const current={client_id:'soc-fixture',framework_key:'soc-2',framework_assessment_id:'soc-'+id,definition_id:id,title:socGuidedCatalog.definitions[id].title,status:'not_assessed',implementation:'',verification:'not_verified',last_saved:null};
  stored={version:socGuidedCatalog.version,answers:{},step:0,completed:false,revision:0,narrative:'',base_assessment_token:null,base_scope_fingerprint:fingerprint,current_assessment_token:null,current_scope_fingerprint:fingerprint,lineage_known:true,lineage_stale:false};
  props={clientId:'soc-fixture',configuration:{categories:['security','availability','confidentiality','processing_integrity','privacy']},record:current,current,form:copy(current),onSaveAssessment:jest.fn(async()=>true),onDraftChange:jest.fn()};
}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();window.history.replaceState({},'', '/');container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);failWrite=false;setup('CC1.1');
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
test('replacement cancellation, native failure and Save & close preserve reviewed work',async()=>{
  props.current={...props.current,status:'in_progress',implementation:'Existing manual SOC text'};props.form=copy(props.current);
  await render();await open();await complete();await click('Update assessment');expect(document.body.textContent).toContain('Agent 2 SOC fixture — Criterion CC1.1');await click('Cancel');expect(props.onSaveAssessment).not.toHaveBeenCalled();
  props.onSaveAssessment.mockResolvedValueOnce(false);await click('Save & close');await click('Yes, update assessment');expect(document.body.textContent).toContain('Your interview and wording are retained');expect(document.querySelector('[aria-label="Omnibot implementation summary"]')).toBeTruthy();
  await click('Save & close');await click('Yes, update assessment');expect(document.querySelector('.omni-workspace-window')).toBeNull();
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
