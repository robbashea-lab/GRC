import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import {cmmcRequirementPresentation} from '@/lib/cmmcScope';
import {EMPTY_CSF_PROFILE} from '@/lib/csfProfile';
import {operatorStatuses} from '@/lib/frameworkOperator';
import {genericGuidedVersion} from '@/lib/genericGuidedAssessment';

let mockAuth,mockOrg,mockDefinition,mockFrame,mockGuide,mockProfile,mockReview,mockSource,mockNested;
let mockGuideMounts,mockUnconfirmed,mockContextCommand;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,API:'/api',
  default:{get:jest.fn(),patch:jest.fn(),put:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('@/lib/frameworks',()=>({...jest.requireActual('@/lib/frameworks'),
  frameworkDefinition:()=>mockDefinition,frameworkWorkspace:()=> 'generic',
  frameworkCatalog:()=>({labels:{item:'Requirement'},requirements:[mockDefinition],policy_mappings:[],review_plans:[]})}));
jest.mock('@/lib/frameworkContextIntent',()=>({...jest.requireActual('@/lib/frameworkContextIntent'),useFrameworkContextIntent:()=>mockContextCommand}));
jest.mock('@/lib/cmmcScope',()=>({...jest.requireActual('@/lib/cmmcScope'),
  cmmcRequirementPresentation:jest.fn(definition=>({...definition,id:'SYNTHETIC qualified L1 id',title:'SYNTHETIC qualified source title'}))}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));
// Controller tests observe composition and actual native fields; separate Guide tests exercise real questions.
jest.mock('./AssessmentRolloutFrame',()=>props=>{mockFrame=props;return <section>{props.requirement}{props.interview?.({})}{props.children}</section>;});
jest.mock('./GenericGuidedAssessor',()=>function Guide(props){
  const React=require('react'),[value,setValue]=React.useState('SYNTHETIC unsaved personal marker');mockGuide=props;
  React.useEffect(()=>{mockGuideMounts++;},[]);
  return <input aria-label="SYNTHETIC personal marker" value={value} onChange={event=>setValue(event.target.value)}/>;
});
jest.mock('./FrameworkContext',()=>props=><section data-testid="native-framework-context">{props.definition.id}</section>);
jest.mock('./R4FrameworkSource',()=>props=>{mockSource=props;return null;});
jest.mock('./R4AssessmentContext',()=>()=>null);
jest.mock('./FrameworkReviewSetup',()=>props=>{mockReview=props;return null;});
jest.mock('./CsfProfile',()=>props=>{mockProfile=props;return null;});
jest.mock('./AssigneeSelect',()=>props=><select aria-label={props.label} value={props.value||''} disabled={props.disabled} onChange={event=>props.onChange(event.target.value)}><option value="">Unassigned</option><option value="synthetic-owner">Synthetic owner</option></select>);
jest.mock('./FrameworkMappings',()=>()=>null);
jest.mock('./RemediationTickets',()=>()=>null);
jest.mock('./BrawndoCisFindings',()=>()=>null);
jest.mock('./AssessmentItems',()=>()=>null);
jest.mock('./RecordDrawer',()=>props=>{mockNested=props;return <section data-testid="synthetic-related-record"/>;});

const copy=value=>JSON.parse(JSON.stringify(value));
let root,host,record,nativeRecord,onNext,onOpenChange;
const related={reviews:[],findings:[],tasks:[],risks:[{risk_id:'synthetic-risk',client_id:'synthetic-client',title:'SYNTHETIC linked risk',status:'open'}],
  policies:[],vendors:[],requirements:[],evidence:[{evidence_id:'synthetic-evidence',filename:'SYNTHETIC file.txt',created_at:'2026-11-20',linked_type:'framework_assessment'}]};
const button=name=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
async function click(name){expect(button(name)).toBeTruthy();await act(async()=>button(name).click());}
async function render(extra={}){
  await act(async()=>root.render(<FrameworkDrawer open {...{record,onNext,onOpenChange}} clientId={record.client_id} {...extra}/>));
}
async function fixture(frameworkKey){
  mockDefinition={id:'SYNTHETIC-1',title:'Synthetic native requirement',specification:frameworkKey==='hipaa'?'addressable':'outcome',decision_guidance:'SYNTHETIC native addressable guidance'};
  record={client_id:'synthetic-client',framework_key:frameworkKey,framework_version:'synthetic-version',definition_id:mockDefinition.id,
    framework_assessment_id:'synthetic-assessment',status:'not_assessed',implementation:'SYNTHETIC saved implementation',technology:'SYNTHETIC product',
    owner_id:'synthetic-owner',process_owner_id:null,addressable_decision:'as_written',addressable_rationale:'SYNTHETIC saved decision',
    notes:'SYNTHETIC retained notes',na_rationale:'',last_saved:null,last_assessed:null,items_to_address:[],items_revision:0,
    assessment_history:[{status:'not_assessed',implementation:'SYNTHETIC retained history',at:'2026-11-19',by:'synthetic-owner'}],
    ...(frameworkKey==='nist-csf-2'?{csf_profile:{...EMPTY_CSF_PROFILE,target_selected:true,target_outcome:'SYNTHETIC target',gap_notes:'SYNTHETIC profile note'}}:{})};
  nativeRecord=copy(record);
  window.history.replaceState({},'','/compliance/'+frameworkKey+'?client_id='+record.client_id);
  sessionStorage.setItem('grc_client_id',record.client_id);
  api.get.mockImplementation(async path=>{
    if(path==='/frameworks/'+frameworkKey)return {data:{selected:true,configured:true,framework:{key:frameworkKey},configuration:{level:1},assessments:[copy(nativeRecord)],work:{}}};
    if(path.endsWith('/related'))return {data:copy(related)};
    if(path.endsWith('/members'))return {data:[{user_id:'synthetic-owner',name:'Synthetic owner'}]};
    return {data:[]};
  });
  api.patch.mockImplementation(async(_path,body)=>{nativeRecord={...nativeRecord,...copy(body),last_saved:'2026-11-20T00:00:00Z'};return {data:copy(nativeRecord)};});
  await render();expect(mockFrame.state.ctx.current.framework_assessment_id).toBe(record.framework_assessment_id);
}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();mockFrame=mockGuide=mockProfile=mockReview=mockSource=mockNested=null;mockGuideMounts=0;mockUnconfirmed=false;
  cmmcRequirementPresentation.mockImplementation(definition=>({...definition,id:'SYNTHETIC qualified L1 id',title:'SYNTHETIC qualified source title'}));
  mockContextCommand=Object.assign(jest.fn(),{unconfirmed:()=>mockUnconfirmed,pendingRequest:()=>null,retry:jest.fn()});
  mockAuth={user:{user_id:'synthetic-operator',role:'super_admin',status:'active',workspace_mode:'demo'},workspaceMode:'demo',loading:false};
  mockOrg={currentClientId:'synthetic-client',currentClient:{client_id:'synthetic-client',name:'Synthetic client'},clients:[],loading:false};
  onNext=jest.fn();onOpenChange=jest.fn();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});

test.each(['hipaa','nist-csf-2','cmmc'])('generic %s keeps native domain fields, source qualification and the ordinary save payload',async frameworkKey=>{
  await fixture(frameworkKey);
  expect(mockFrame.interviewHistoryAvailable).toBe(true);expect(mockGuide.inline).toBe(true);expect(mockSource.framework).toBe(frameworkKey);
  expect(host.querySelector('[role="radiogroup"][aria-label="Implementation status"]')).toBeTruthy();expect(host.querySelector('[aria-label="Current implementation"]')).toBeTruthy();
  expect(host.querySelector('[aria-label="Assessment Owner"]')).toBeTruthy();expect(host.querySelector('[aria-label="Process Owner (Contact)"]')).toBeTruthy();
  expect(host.querySelector('[aria-label="Verification"]')).toBeNull();expect(record).not.toHaveProperty('verification');
  if(frameworkKey==='hipaa'){
    expect(host.querySelector('[aria-label="Addressability decision"]').value).toBe('as_written');
    await act(async()=>mockFrame.actions.put('addressable_rationale','SYNTHETIC reviewed native rationale'));
  }
  if(frameworkKey==='nist-csf-2'){
    expect(mockProfile.value).toEqual(record.csf_profile);await act(async()=>mockProfile.onChange({...mockProfile.value,target_outcome:'SYNTHETIC revised target'}));
  }
  if(frameworkKey==='cmmc'){
    expect(cmmcRequirementPresentation).toHaveBeenLastCalledWith(mockDefinition,expect.objectContaining({level:1}));
    expect(mockFrame.state.definition).toMatchObject({id:'SYNTHETIC qualified L1 id',title:'SYNTHETIC qualified source title'});
  }
  await act(async()=>{expect(await mockFrame.actions.save()).toBe(true);});
  const body=api.patch.mock.calls.at(-1)[1];expect(body).not.toHaveProperty('verification');expect(body.status).toBe(record.status);
  expect(body.owner_id).toBe(record.owner_id);expect(body.process_owner_id).toBeNull();
  if(frameworkKey==='hipaa')expect(body.addressable_rationale).toBe('SYNTHETIC reviewed native rationale');
  if(frameworkKey==='nist-csf-2')expect(body.csf_profile.target_outcome).toBe('SYNTHETIC revised target');
  expect(nativeRecord.assessment_history).toEqual(record.assessment_history);expect(api.post).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('assessment-only Discard confirms, restores the native baseline and retains the mounted personal Guide and saved history',async()=>{
  await fixture('hipaa');const initial=copy(nativeRecord);
  await act(async()=>{mockFrame.actions.put('implementation','SYNTHETIC unsaved native edit');mockGuide.onDraftChange(true);});
  expect(mockFrame.state.discardDisabled).toBe(false);
  await act(async()=>mockFrame.actions.discardAssessment());await click('Keep editing');
  expect(mockFrame.state.form.implementation).toBe('SYNTHETIC unsaved native edit');
  await act(async()=>mockFrame.actions.discardAssessment());await click('Discard changes');
  expect(mockFrame.state.form).toEqual(initial);expect(mockFrame.state.otherDraft).toBe(true);
  expect(mockGuideMounts).toBe(1);expect(host.querySelector('[aria-label="SYNTHETIC personal marker"]').value).toBe('SYNTHETIC unsaved personal marker');
  expect(nativeRecord).toEqual(initial);expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('Discard remains blocked by native Review or unconfirmed shared-context work, and an old-owner confirmation cannot reset current state',async()=>{
  await fixture('hipaa');await act(async()=>mockFrame.actions.put('implementation','SYNTHETIC keep this native edit'));
  await act(async()=>mockReview.onDraftChange(true));expect(mockFrame.state.discardDisabled).toBe(true);
  await act(async()=>mockFrame.actions.discardAssessment());expect(button('Discard changes')).toBeUndefined();
  await act(async()=>mockReview.onDraftChange(false));mockUnconfirmed=true;await render();expect(mockFrame.state.discardDisabled).toBe(true);
  await act(async()=>mockFrame.actions.discardAssessment());expect(button('Discard changes')).toBeUndefined();
  mockUnconfirmed=false;await render();await act(async()=>mockFrame.actions.discardAssessment());
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_readonly'}};await render();await click('Discard changes');
  expect(mockFrame.state.form.implementation).toBe('SYNTHETIC keep this native edit');expect(mockFrame.state.writable).toBe(false);
  expect(host.querySelector('[aria-label="Current implementation"]').matches(':disabled')).toBe(true);expect(mockGuide.disabled).toBe(true);
  expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('native evidence, related-record and history views remain reachable and same-owner refresh does not remount the Guide',async()=>{
  await fixture('hipaa');await click('Activity / History');expect(host.textContent).toContain('SYNTHETIC retained history');
  await click('Evidence 1');expect(host.textContent).toContain('SYNTHETIC file.txt');
  await click('Risks 1');await click('SYNTHETIC linked risk');
  expect(mockNested).toMatchObject({clientId:record.client_id,kind:'risks',record:related.risks[0]});
  await act(async()=>mockNested.onOpenChange(false));
  expect(mockGuideMounts).toBe(1);expect(host.querySelector('[aria-label="SYNTHETIC personal marker"]').value).toBe('SYNTHETIC unsaved personal marker');
  expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('Save & next advances only after native save success and does not bypass another native draft',async()=>{
  await fixture('hipaa');await act(async()=>mockFrame.actions.put('implementation','SYNTHETIC native revision'));
  api.patch.mockRejectedValueOnce(new Error('SYNTHETIC native save rejection'));
  await act(async()=>mockFrame.actions.saveAndNext());expect(onNext).not.toHaveBeenCalled();expect(mockFrame.state.error).toContain('SYNTHETIC native save rejection');
  await act(async()=>mockReview.onDraftChange(true));await act(async()=>mockFrame.actions.saveAndNext());
  expect(api.patch).toHaveBeenCalledTimes(1);expect(onNext).not.toHaveBeenCalled();
  await act(async()=>mockReview.onDraftChange(false));await act(async()=>mockFrame.actions.saveAndNext());
  expect(api.patch).toHaveBeenCalledTimes(2);expect(onNext).toHaveBeenCalledTimes(1);expect(api.put).not.toHaveBeenCalled();
});

test.each(['hipaa','nist-csf-2','cmmc'])('approved native %s choices keep framework labels and remain a manual assessment draft',async frameworkKey=>{
  await fixture(frameworkKey);
  const statuses=operatorStatuses(frameworkKey),group=host.querySelector('[role="radiogroup"][aria-label="Implementation status"]'),
    choices=[...group.querySelectorAll('input[type="radio"]')],narrative=host.querySelector('textarea[aria-label="Current implementation"]');
  expect(host.querySelector('select[aria-label="Assessment Status"]')).toBeNull();
  expect(new Set(choices.map(choice=>choice.value))).toEqual(new Set(Object.keys(statuses)));
  expect(choices[0].value).toBe('addressed');expect(choices.find(choice=>choice.value==='not_assessed').checked).toBe(true);
  for(const choice of choices)expect(choice.closest('label').textContent).toContain(statuses[choice.value]);
  expect(narrative.rows).toBe(6);expect(narrative.maxLength).toBe(20000);
  const changed='SYNTHETIC manually reviewed implementation γ';
  await act(async()=>{
    choices.find(choice=>choice.value==='in_progress').click();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(narrative,changed);
    narrative.dispatchEvent(new Event('input',{bubbles:true}));
  });
  expect(mockFrame.state.form.status).toBe('in_progress');expect(mockFrame.state.form.implementation).toBe(changed);
  expect(mockFrame.state.current.status).toBe(record.status);expect(nativeRecord).toEqual(record);
  expect(document.getElementById(group.getAttribute('aria-describedby')).textContent).toContain('Current implementation');
  expect(document.getElementById(group.getAttribute('aria-describedby')).textContent).not.toContain('Assessment notes');
  expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
  await act(async()=>{expect(await mockFrame.actions.save()).toBe(true);});
  expect(api.patch.mock.calls.at(-1)[1]).toMatchObject({status:'in_progress',implementation:changed});
  expect(api.patch.mock.calls.at(-1)[1]).not.toHaveProperty('verification');
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_readonly'}};await render();
  const withdrawn=host.querySelector('[role="radiogroup"][aria-label="Implementation status"]');
  expect([...withdrawn.querySelectorAll('input')].every(choice=>choice.matches(':disabled'))).toBe(true);
  expect(host.querySelector('textarea[aria-label="Current implementation"]').matches(':disabled')).toBe(true);
  expect(host.querySelector('[aria-label="Verification"]')).toBeNull();
});

test('two native editors of the same assessment keep their status radio groups independent',async()=>{
  await fixture('hipaa');
  await act(async()=>root.render(<><FrameworkDrawer open {...{record,onNext,onOpenChange}} clientId={record.client_id}/><FrameworkDrawer open {...{record,onNext,onOpenChange}} clientId={record.client_id}/></>));
  const groups=[...host.querySelectorAll('[role="radiogroup"][aria-label="Implementation status"]')];expect(groups).toHaveLength(2);
  const first=[...groups[0].querySelectorAll('input')],second=[...groups[1].querySelectorAll('input')];
  expect(first[0].name).not.toBe(second[0].name);
  expect(groups[0].getAttribute('aria-describedby')).not.toBe(groups[1].getAttribute('aria-describedby'));
  await act(async()=>first.find(choice=>choice.value==='in_progress').click());
  expect(first.find(choice=>choice.value==='in_progress').checked).toBe(true);
  expect(second.find(choice=>choice.value==='not_assessed').checked).toBe(true);
  expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('generic Interview history forwards the native Frame callbacks, portal and exact current owner scope',async()=>{
  await fixture('hipaa');const owner=mockGuide.historyScope,onHistoryOpenChange=jest.fn(),onHistoryCloseAutoFocus=jest.fn(),pilotPortalContainer=document.createElement('section');
  expect(owner).toBeTruthy();expect(mockFrame.interviewHistoryAvailable).toBe(true);
  const guide=mockFrame.interview({historyOpen:true,onHistoryOpenChange,onHistoryCloseAutoFocus,pilotPortalContainer});
  expect(guide.props.historyScope).toBe(owner);expect(guide.props.interviewHistoryOpen).toBe(true);
  expect(guide.props.onInterviewHistoryOpenChange).toBe(onHistoryOpenChange);
  expect(guide.props.onInterviewHistoryCloseAutoFocus).toBe(onHistoryCloseAutoFocus);
  expect(guide.props.pilotPortalContainer).toBe(pilotPortalContainer);
  expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('two acknowledged pending Item edits in one input turn are both retained without a native write',async()=>{
  await fixture('nist-csf-2');
  const narrative='SYNTHETIC reviewed method and genuine pending follow-ups';
  const proposal={client_id:record.client_id,assessment_id:record.framework_assessment_id,actor_id:mockAuth.user.user_id,
    version:genericGuidedVersion('nist-csf-2'),revision:1,generated_at:'2026-11-20T00:00:00Z',completed:true,narrative,
    answers:{practice:'Not sure',implementation:'SYNTHETIC reported method',gap:'Not sure',unknown:'Yes',unknown_reason:'SYNTHETIC actual uncertainty'}};
  await act(async()=>{expect(mockGuide.onUpdateImplementation(narrative,record.implementation,proposal)).toBe(true);});
  const commands=mockFrame.itemsToAddress.props.controls,first={operation:'add',request_id:'synthetic_pending_item_first',item_type:'confirmation',text:'SYNTHETIC first acknowledged edit'},
    second={operation:'add',request_id:'synthetic_pending_item_second',item_type:'evidence',text:'SYNTHETIC second acknowledged edit'};
  await act(async()=>{expect(commands.onOperation(first)).toBe(true);expect(commands.onOperation(second)).toBe(true);});
  expect(mockFrame.itemsToAddress.props.controls.operations).toEqual([first,second]);
  expect(nativeRecord).toEqual(record);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_readonly'}};await render();
  expect(commands.onOperation({...first,request_id:'synthetic_retired_owner_edit'})).toBe(false);
  expect(mockFrame.itemsToAddress.props.controls.operations).toEqual([]);
});
