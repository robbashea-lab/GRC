import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AssessmentShell from './AssessmentShell';
import GuidedAssessor from './GuidedAssessor';
import IsoGuidedAssessor from './IsoGuidedAssessor';
import SocGuidedAssessor from './SocGuidedAssessor';
import {guidedCatalog,versionForSafeguard} from '@/lib/guidedAssessment';
import {omniCisSummary} from '@/lib/omniCisSummary';
import {isoGuidedCatalog,isoGuidedResult} from '@/lib/isoGuidedAssessment';
import {socGuidedCatalog,socGuidedResult} from '@/lib/socGuidedAssessment';
import {localCalendarDate} from '@/lib/calendarView';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:error=>error.message}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'completion-actor',role:'client_grc_manager'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({clients:[{client_id:'completion-fixture',name:'Completion fixture'}]})}));

const copy=value=>JSON.parse(JSON.stringify(value)),fingerprint='a'.repeat(64);
const families=[['CIS','1.1',1],['ISO','4.1',null],['SOC','CC1.1',null]];
const variants=[...families,['CIS','12.2',2],['CIS','16.13',3],['ISO','A.8.11',null],['SOC','A1.1',null],['SOC','C1.1',null],['SOC','P6.4',null]];
let root,container,stored,base,guideProps,Guide,nativeSave,nativeClose;
const button=name=>[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===name);
const windowElement=()=>document.querySelector('.omni-workspace-window');
const summary=()=>document.querySelector('[aria-label="Omnibot implementation summary"]');
const nativeImplementation=()=>document.querySelector('[aria-label="Native implementation"]');
const nativeStatus=()=>document.querySelector('[data-testid="native-status"]');
async function click(name){const target=button(name);expect(target).toBeTruthy();expect(target.disabled).toBe(false);await act(async()=>target.click());}

function setup(family,id,implementationGroup=1){
  const cis=family==='CIS',iso=family==='ISO',catalog=cis?guidedCatalog:iso?isoGuidedCatalog:socGuidedCatalog;
  const version=cis?versionForSafeguard(id):catalog.version,definition=catalog.definitions[id];
  const questions=cis?guidedCatalog.safeguards[id]:definition.groups.flatMap(group=>group.questions);
  const answers=Object.fromEntries(questions.map(q=>[q.id,q.type==='text'?'':q.type==='date'?localCalendarDate(new Date()):q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='multi'?['Quarantine or isolate']:q.type==='context'?'Relevant':q.id==='sources'?'One source':q.id==='frequency'?'Every six months':q.id==='unresolved'?'No':'Yes']));
  const result=cis?omniCisSummary(id,answers,version,'Completion fixture').result:iso?isoGuidedResult(id,answers,version,'Completion fixture'):socGuidedResult(id,answers,version,'Completion fixture');
  expect(result.status).toBe('addressed');
  const narrative=`OVERVIEW\nReviewed ${family} ${id}.\n\nIMPLEMENTATION BREAKDOWN\n- Keep this exact operator line.\n\nITEMS TO ADDRESS\n- Keep the trailing newline.\n`;
  base={client_id:'completion-fixture',framework_key:cis?'cis-ig1':iso?'iso-27001':'soc-2',framework_assessment_id:'completion-'+id,definition_id:id,title:definition.title,status:'not_assessed',implementation:'',verification:'not_verified',last_saved:null,assessment_history:[],work:{context_complete:true,open_findings:0,open_actions:0,overdue_reviews:0,priority_records:[]},...(iso&&id.startsWith('A.')?{soa_applicability:'included',soa_justification:'Reviewed scoped risk treatment.'}:{})};
  stored={client_id:base.client_id,assessment_id:base.framework_assessment_id,user_id:'completion-actor',version,answers,step:0,completed:true,revision:3,narrative,result:{...result,narrative},summary_review:{version,answers},base_assessment_token:null,current_assessment_token:null,base_scope_fingerprint:fingerprint,current_scope_fingerprint:fingerprint,lineage_known:true,lineage_stale:false,generated_at:'2026-10-12T12:00:00Z'};
  Guide=cis?GuidedAssessor:iso?IsoGuidedAssessor:SocGuidedAssessor;
  guideProps={clientId:base.client_id,framework:base.framework_key,configuration:cis?{implementation_group:implementationGroup}:iso?{__program_active:true}:{categories:['security','availability','confidentiality','processing_integrity','privacy']},record:base,contextComplete:true,onDraftChange:jest.fn()};
}

function NativeFixture(){
  const [current,setCurrent]=useState(base);
  async function save(values,expected){
    const confirmed=await nativeSave(values,expected);
    if(confirmed)setCurrent(previous=>({...previous,...values,last_saved:'2026-10-12T13:00:00Z'}));
    return confirmed;
  }
  return <AssessmentShell title="Native assessment fixture" description="Controlled completion test." close={nativeClose}>
    <textarea aria-label="Native implementation" readOnly value={current.implementation}/>
    <span data-testid="native-status">{current.status}</span>
    <Guide {...guideProps} current={current} form={current} onSaveAssessment={save}/>
  </AssessmentShell>;
}
async function render(){await act(async()=>root.render(<NativeFixture/>));}
async function openSummary(family){
  await act(async()=>document.querySelector('[aria-label="Open Omnibot guide"]').click());
  if(family!=='CIS')await click('Resume your review');
  expect(summary().value).toBe(stored.narrative);
}
async function editSummary(text){await act(async()=>{const target=summary();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(target,text);target.dispatchEvent(new Event('input',{bubbles:true}));});}

beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();window.history.replaceState({},'', '/');
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  nativeSave=jest.fn(async()=>true);nativeClose=jest.fn();
  api.get.mockImplementation(async()=>({data:copy(stored)}));
  api.put.mockImplementation(async(_path,body)=>{
    if(body.expected_revision!==stored.revision)throw new Error('Stale interview revision');
    stored={...stored,...copy(body),revision:stored.revision+1,generated_at:body.completed?'2026-10-12T12:30:00Z':null};
    return {data:copy(stored)};
  });
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each(variants)('%s %s final Save waits for one authoritative success then closes only the guide',async(family,id,group)=>{
  setup(family,id,group);await render();await openSummary(family);
  const native=document.querySelector('[data-assessment-shell]'),reviewed=stored.narrative+'Manual edit retained exactly.\n';
  await editSummary(reviewed);let finish;
  nativeSave.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  await act(async()=>{const save=button('Save assessment');save.click();save.click();});
  expect(api.put).toHaveBeenCalledTimes(1);expect(nativeSave).toHaveBeenCalledTimes(1);
  expect(windowElement()).toBeTruthy();expect(nativeImplementation().value).toBe('');
  expect(nativeSave).toHaveBeenCalledWith({implementation:reviewed,status:'addressed',guided_assessment_source:{version:stored.version,revision:stored.revision,generated_at:stored.generated_at}},JSON.stringify(base));
  await act(async()=>finish({saved:true}));
  expect(windowElement()).toBeNull();expect(document.querySelector('[data-assessment-shell]')).toBe(native);
  expect(nativeImplementation().value).toBe(reviewed);expect(nativeStatus().textContent).toBe('addressed');
  expect(nativeClose).not.toHaveBeenCalled();expect(base.verification).toBe('not_verified');
});

test.each(families)('%s Update cancellation and native failure retain exact wording; confirmed retry closes only guide',async(family,id,group)=>{
  setup(family,id,group);base={...base,status:'in_progress',implementation:'Existing native wording.'};guideProps.record=base;
  await render();await openSummary(family);const reviewed=stored.narrative+'Additional manual wording.\n';await editSummary(reviewed);
  await click('Update assessment');await click('Cancel');
  expect(api.put).not.toHaveBeenCalled();expect(nativeSave).not.toHaveBeenCalled();expect(summary().value).toBe(reviewed);
  nativeSave.mockResolvedValueOnce(false);await click('Update assessment');await click('Yes, update assessment');
  expect(windowElement()).toBeTruthy();expect(summary().value).toBe(reviewed);expect(nativeImplementation().value).toBe('Existing native wording.');
  expect(nativeStatus().textContent).toBe('in_progress');expect(document.body.textContent).not.toContain('Assessment saved.');
  await click('Update assessment');await click('Yes, update assessment');
  expect(nativeSave).toHaveBeenCalledTimes(2);expect(windowElement()).toBeNull();expect(nativeClose).not.toHaveBeenCalled();
  expect(nativeImplementation().value).toBe(reviewed);expect(nativeStatus().textContent).toBe('addressed');
});

test.each(families)('%s final interview conflict does not close or call native writer',async(family,id,group)=>{
  setup(family,id,group);await render();await openSummary(family);const text=summary().value;
  api.put.mockRejectedValueOnce(new Error('Stale interview revision'));
  await click('Save assessment');expect(summary().value).toBe(text);expect(windowElement()).toBeTruthy();
  expect(document.body.textContent).toContain('Stale interview revision');expect(nativeSave).not.toHaveBeenCalled();expect(nativeClose).not.toHaveBeenCalled();
});

test.each(families)('%s native draft change during interview save prevents stale completion',async(family,id,group)=>{
  setup(family,id,group);await render();await openSummary(family);const text=summary().value,write=api.put.getMockImplementation();let finish;
  api.put.mockImplementationOnce((path,body)=>new Promise(resolve=>{finish=async()=>resolve(await write(path,body));}));
  await click('Save assessment');guideProps={...guideProps,assessmentDirty:true};await render();await act(async()=>finish());
  expect(windowElement()).toBeTruthy();expect(summary().value).toBe(text);expect(nativeSave).not.toHaveBeenCalled();expect(nativeClose).not.toHaveBeenCalled();
});

test.each(families)('%s group Save & next and early Save & close remain interview-only',async(family,id,group)=>{
  setup(family,id,group);stored={...stored,completed:false,answers:{},step:0,narrative:'',result:null,summary_review:null};
  await render();await act(async()=>document.querySelector('[aria-label="Open Omnibot guide"]').click());
  if(family!=='CIS')await click('Resume your review');
  await act(async()=>document.querySelectorAll('.omni-answer-choices').forEach(choices=>[...choices.querySelectorAll('button')].find(item=>['Yes','Relevant'].includes(item.textContent))?.click()));
  await click('Save & next');expect(api.put).toHaveBeenCalledTimes(1);expect(windowElement()).toBeTruthy();expect(stored.completed).toBe(false);expect(nativeSave).not.toHaveBeenCalled();
  await click('Save & close');expect(windowElement()).toBeNull();expect(nativeSave).not.toHaveBeenCalled();expect(nativeClose).not.toHaveBeenCalled();
  expect(nativeImplementation().value).toBe('');expect(nativeStatus().textContent).toBe('not_assessed');
});

test.each(families)('%s confirmation Escape dismisses only replacement confirmation and retains guide/native',async(family,id,group)=>{
  setup(family,id,group);base={...base,status:'in_progress',implementation:'Existing native wording.'};guideProps.record=base;
  await render();await openSummary(family);const text=summary().value;
  await click('Update assessment');
  await act(async()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  expect(document.body.textContent).not.toContain('Update this assessment?');expect(windowElement()).toBeTruthy();expect(summary().value).toBe(text);
  expect(nativeImplementation().value).toBe('Existing native wording.');expect(nativeClose).not.toHaveBeenCalled();
  expect(api.put).not.toHaveBeenCalled();expect(nativeSave).not.toHaveBeenCalled();
});

test('ISO final completion stays blocked until the saved Annex A prerequisite is satisfied',async()=>{
  setup('ISO','A.8.11');base={...base,soa_applicability:'',soa_justification:''};guideProps.record=base;
  await render();await openSummary('ISO');expect(button('Save assessment').disabled).toBe(true);
  expect(windowElement()).toBeTruthy();expect(nativeSave).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});
