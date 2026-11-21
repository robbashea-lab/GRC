import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import {catalogForVersion,visibleQuestions} from '@/lib/guidedAssessment';
import {omniCisSummary} from '@/lib/omniCisSummary';
import {buildLegacyDemoStore,saveStore,STORE_KEY} from '../preview/store';

let mockAuth,mockOrg,mockState,mockActions;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,API:'/api',
  default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),
  formatError:error=>error.response?.data?.detail||error.message}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));
// Observe the real controller state; keep its native adapter and actual saved-Item controls.
jest.mock('./BrawndoCisSafeguard',()=>props=>{
  mockState=props.state;mockActions=props.actions;
  const Items=jest.requireActual('./AssessmentItems').default;
  const Findings=jest.requireActual('./BrawndoCisFindings').default;
  return <section data-testid="guided-items-controller">
    <Items controls={props.state.itemControls} record={props.state.current} ctx={props.state.ctx}
      disabled={!props.state.writable||props.state.busy}
      workDisabled={props.state.itemWorkDisabled} proposedItems={props.state.guidedItemsDraft}
      onSaved={props.actions.itemsSaved} onCreateFinding={props.actions.createItemFinding}
      onDraftChange={props.actions.setItemsDraft}/>
    <Findings record={props.state.record} definition={props.state.definition} current={props.state.current}
      ctx={props.state.ctx} related={props.state.related} writable={props.state.writable}
      busy={props.state.busy} finding={props.state.finding} workDisabled={props.state.itemWorkDisabled}
      setFinding={props.actions.setFinding} run={props.actions.run} setNested={props.actions.setNested}
      setFeedback={props.actions.setFeedback}/>
  </section>;
});

const copy=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const CID='demo_brawndo';
let root,host,record,base,baseline,getSpy,patchSpy,postSpy,deleteSpy,onSaved;
const button=name=>[...host.querySelectorAll('button')].find(node=>node.textContent===name);
async function render(){
  let start=getSpy.mock.results.length;
  await act(async()=>root.render(<FrameworkDrawer open visualReference record={record}
    clientId={CID} onOpenChange={()=>{}} onSaved={onSaved}/>));
  while(start<getSpy.mock.results.length){
    const reads=getSpy.mock.results.slice(start).map(result=>result.value);
    start=getSpy.mock.results.length;
    await act(async()=>{await Promise.allSettled(reads);});
  }
  expect(mockState.ctx?.current).toMatchObject({client_id:CID,framework_assessment_id:record.framework_assessment_id});
}
async function refreshBaseline(){record=(await api.get(base)).data;baseline=copy(record);}
async function savedGapFixture(){
  const current=(await api.get(base)).data;
  await api.post(base+'/items',{expected_revision:current.items_revision||0,request_id:'synthetic_controller_gap_0001',
    item_type:'gap',text:'SYNTHETIC confirmed implementation gap for explicit Finding work.'});
  await refreshBaseline();patchSpy.mockClear();postSpy.mockClear();deleteSpy.mockClear();
  const item=baseline.items_to_address.find(row=>row.request_id==='synthetic_controller_gap_0001');
  expect(baseline.item_controls[item.item_id].can_create_finding).toBe(true);
  return item;
}
async function completedProposal(narrative){
  const initial=(await api.get(base+'/guided-assessment')).data,version=initial.version;
  const reported=Object.fromEntries(catalogForVersion(version).safeguards['2.1'].map(question=>{
    if(question.type==='matrix')return [question.id,Object.fromEntries(question.rows.map(row=>[row,'Not sure']))];
    if(question.id==='additional_gap')return [question.id,'No'];
    if(question.id==='additional_confirmation')return [question.id,'Yes'];
    if(question.type==='text')return [question.id,'SYNTHETIC QA: the responsible team must confirm this reported detail.'];
    return [question.id,'Not sure'];
  }));
  const answers=Object.fromEntries(visibleQuestions('2.1',reported,version).map(question=>[question.id,reported[question.id]]));
  const result=omniCisSummary('2.1',answers,version,'Brawndo',new Date()).result;
  expect(result.status).toBe('not_assessed');expect(result.gaps).toEqual([]);
  const personal=(await api.put(base+'/guided-assessment',{version,answers,step:0,completed:true,
    result,narrative:narrative??result.narrative,expected_revision:initial.revision,
    base_assessment_token:initial.revision?initial.base_assessment_token:initial.current_assessment_token,
    base_scope_fingerprint:initial.revision?initial.base_scope_fingerprint:initial.current_scope_fingerprint})).data;
  return {...personal,client_id:CID,assessment_id:record.framework_assessment_id,actor_id:mockAuth.user.user_id};
}
async function comparePersonalWithSavedAssessment(){
  const prior=(await api.get(base+'/guided-assessment')).data;
  expect(prior.revision).toBeGreaterThan(0);
  const compared=(await api.put(base+'/guided-assessment',{version:prior.version,answers:prior.answers,
    step:prior.step,completed:false,narrative:prior.narrative,result:null,expected_revision:prior.revision,
    rebase:true,base_assessment_token:prior.current_assessment_token,
    base_scope_fingerprint:prior.current_scope_fingerprint})).data;
  expect(compared).toMatchObject({answers:prior.answers,narrative:prior.narrative,completed:false,
    base_assessment_token:prior.current_assessment_token,base_scope_fingerprint:prior.current_scope_fingerprint});
  expect(compared.revision).toBeGreaterThan(prior.revision);
}
async function stage(proposal){
  let staged;
  await act(async()=>{staged=mockActions.stageGuidedImplementation(proposal.narrative,mockState.form.implementation||'',proposal);});
  expect(staged).toBe(true);expect(mockState.guidedItemsDraft).toEqual(expect.any(Array));
}
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();
  saveStore(buildLegacyDemoStore(),{resetFiles:true});
  const user=(await api.post('/demo/enter')).data.user;
  mockAuth={user,workspaceMode:'demo',loading:false,error:null};
  const clients=(await api.get('/clients')).data,currentClient=clients.find(client=>client.client_id===CID);
  mockOrg={currentClientId:CID,currentClient,clients,loading:false,error:null};
  sessionStorage.setItem('grc_client_id',CID);window.history.replaceState({},'','/compliance/cis-ig1?client_id='+CID);
  record=(await api.get('/frameworks/cis-ig1',{params:{client_id:CID}})).data.assessments.find(row=>row.definition_id==='2.1');
  base='/framework_assessments/'+record.framework_assessment_id;await refreshBaseline();
  getSpy=jest.spyOn(api,'get');patchSpy=jest.spyOn(api,'patch');postSpy=jest.spyOn(api,'post');deleteSpy=jest.spyOn(api,'delete');
  onSaved=jest.fn();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.restoreAllMocks();});

test.each([true,false])('guided adoption mirrors native operating confirmation withdrawal only when method changes: %s',async changed=>{
  const savedOperation={provider:'SYNTHETIC QA internal operating team',confirmed:true};
  await api.patch(base,{owner_id:baseline.owner_id||mockAuth.user.user_id,cis_operation:savedOperation,
    expected_last_assessed:baseline.last_saved??baseline.last_assessed??null});
  await refreshBaseline();expect(baseline.cis_operation).toEqual(savedOperation);
  const proposal=await completedProposal(changed?undefined:baseline.implementation);
  expect(proposal.narrative===baseline.implementation).toBe(!changed);
  await render();await stage(proposal);
  expect(mockState.form.cis_operation).toEqual({...savedOperation,confirmed:!changed});
  expect((await api.get(base)).data).toEqual(baseline);
  patchSpy.mockClear();await act(async()=>{expect(await mockActions.save()).toBe(true);});
  expect(patchSpy).toHaveBeenCalledTimes(1);
  expect(Object.keys(patchSpy.mock.calls[0][1]).sort()).toEqual(['expected_last_assessed','guided_assessment_source','implementation']);
  const saved=(await api.get(base)).data;
  expect(saved.cis_operation).toEqual({...savedOperation,confirmed:!changed});
  expect(saved.status).toBe(baseline.status);expect(saved.verification).toBe(baseline.verification);
  expect(saved.assessment_history.slice(0,baseline.assessment_history.length)).toEqual(baseline.assessment_history);
  expect(postSpy).not.toHaveBeenCalled();expect(deleteSpy).not.toHaveBeenCalled();
});

test.each(['ordinary assessment','proposed Items'])('dirty %s blocks formal work; pending Item edits wait for manual assessment Save',async draftKind=>{
  const first=await completedProposal();
  await api.patch(base,{implementation:first.narrative,guided_assessment_source:{version:first.version,revision:first.revision,generated_at:first.generated_at},
    expected_last_assessed:baseline.last_saved??baseline.last_assessed??null});
  const item=await savedGapFixture();await render();
  expect(item).toBeTruthy();
  expect(button('Create finding').disabled).toBe(false);
  if(draftKind==='ordinary assessment')await act(async()=>mockActions.put('notes',(baseline.notes||'')+'\nSYNTHETIC unsaved native note.'));
  else{
    await comparePersonalWithSavedAssessment();
    await stage(await completedProposal(first.narrative+'\nSYNTHETIC newly reviewed wording.'));
  }
  const draft=copy(mockState.form);expect(mockState.itemWorkDisabled).toBe(true);patchSpy.mockClear();
  expect(button('Create finding').disabled).toBe(true);
  await act(async()=>{button('Create finding').click();mockActions.createItemFinding(item);});
  expect(mockState.finding).toBeNull();expect(postSpy).not.toHaveBeenCalled();
  const resolution=[...host.querySelectorAll('textarea')].find(field=>field.getAttribute('aria-label')==='Resolution: '+item.text);
  expect(resolution).toBeTruthy();expect(resolution.disabled).toBe(false);
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(resolution,'SYNTHETIC separately recorded follow-up note.');
    resolution.dispatchEvent(new Event('input',{bubbles:true}));
  });
  const saveResolution=[...resolution.closest('.assessment-item').querySelectorAll('button')].find(node=>node.textContent==='Save resolution');
  expect(saveResolution.disabled).toBe(false);
  await act(async()=>{saveResolution.click();await Promise.allSettled(patchSpy.mock.results.map(result=>result.value));});
  const saved=(await api.get(base)).data;
  expect(saved.items_to_address.find(row=>row.item_id===item.item_id).resolution).toBe(draftKind==='proposed Items'?item.resolution:'SYNTHETIC separately recorded follow-up note.');
  if(draftKind==='proposed Items')expect(patchSpy).not.toHaveBeenCalled();
  else expect(patchSpy).toHaveBeenCalledTimes(1);
  expect(saved.implementation).toBe(baseline.implementation);expect(saved.status).toBe(baseline.status);
  expect(mockState.form.notes).toBe(draft.notes);expect(mockState.form.implementation).toBe(draft.implementation);
  if(draftKind==='proposed Items'){
    await act(async()=>{expect(await mockActions.save()).toBe(true);});
    const adopted=(await api.get(base)).data;
    expect(adopted.implementation).toBe(draft.implementation);
    expect(adopted.items_to_address.find(row=>row.item_id===item.item_id).resolution).toBe('SYNTHETIC separately recorded follow-up note.');
  }
  expect(postSpy).not.toHaveBeenCalled();expect(deleteSpy).not.toHaveBeenCalled();
});

test.each(['success','transport failure'])('an ended guided Save cannot change the returned A owner after a late %s',async deliveryKind=>{
  const proposal=await completedProposal();await render();await stage(proposal);
  const actualPatch=patchSpy.getMockImplementation(),delivery=deferred(),committed=deferred(),currentOperation=deferred();
  let saving,currentRun;
  patchSpy.mockImplementationOnce(async(...args)=>{
    const response=await actualPatch(...args);committed.resolve();await delivery.promise;
    if(deliveryKind==='transport failure')throw new Error('SYNTHETIC retired owner delivery failed');
    return response;
  });
  try{
    await act(async()=>{saving=mockActions.save();await committed.promise;});
    expect(mockState.busy).toBe(true);
    const ownerA=mockAuth;
    mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_readonly'}};await render();
    mockAuth=ownerA;await render();
    expect(mockState.guidedItemsDraft).toBeNull();expect(mockState.busy).toBe(false);
    const currentForm=copy(mockState.form),currentFeedback=mockState.feedback;
    const getCount=getSpy.mock.calls.length,savedBytes=sessionStorage.getItem(STORE_KEY);
    await act(async()=>{currentRun=mockActions.run(()=>currentOperation.promise,mockState.detailsOwner);});
    expect(mockState.busy).toBe(true);
    await act(async()=>{delivery.resolve();expect(await saving).toBe(false);});
    expect(mockState.form).toEqual(currentForm);expect(mockState.feedback).toBe(currentFeedback);
    expect(mockState.error).toBe('');expect(mockState.busy).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();expect(getSpy).toHaveBeenCalledTimes(getCount);
    expect(sessionStorage.getItem(STORE_KEY)).toBe(savedBytes);
    expect((await api.get(base)).data.guided_assessment_source).toMatchObject({version:proposal.version,revision:proposal.revision,generated_at:proposal.generated_at});
    expect(postSpy).not.toHaveBeenCalled();expect(deleteSpy).not.toHaveBeenCalled();
  }finally{
    delivery.resolve();currentOperation.resolve();
    await act(async()=>{await Promise.allSettled([saving,currentRun].filter(Boolean));});
  }
});

test('an already opened Item-origin Finding cannot submit dirty assessment work while standalone native Findings remain available',async()=>{
  const proposal=await completedProposal();
  await api.patch(base,{implementation:proposal.narrative,
    guided_assessment_source:{version:proposal.version,revision:proposal.revision,generated_at:proposal.generated_at},
    expected_last_assessed:baseline.last_saved??baseline.last_assessed??null});
  const item=await savedGapFixture();await render();
  expect(item).toBeTruthy();
  await act(async()=>mockActions.createItemFinding(item));
  expect(mockState.finding.item_id).toBe(item.item_id);
  expect(button('Create Finding & Action').disabled).toBe(false);
  await act(async()=>mockActions.put('notes',(baseline.notes||'')+'\nSYNTHETIC unsaved assessment note.'));
  expect(button('Create Finding & Action').disabled).toBe(true);
  await act(async()=>button('Create Finding & Action').click());
  expect(postSpy).not.toHaveBeenCalled();
  await act(async()=>button('Cancel').click());
  expect(mockState.finding).toBeNull();expect(button('Raise Finding').disabled).toBe(false);
  await act(async()=>button('Raise Finding').click());
  expect(mockState.finding).not.toHaveProperty('item_id');
  expect(button('Create Finding & Action').disabled).toBe(true);
  await act(async()=>{
    for(const [label,value] of [['Finding title','SYNTHETIC standalone gap'],['Corrective action','SYNTHETIC native corrective work']]){
      const field=host.querySelector(`[aria-label="${label}"]`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,value);
      field.dispatchEvent(new Event('input',{bubbles:true}));
    }
  });
  expect(button('Create Finding & Action').disabled).toBe(false);
  expect((await api.get(base)).data).toEqual(baseline);
  expect(postSpy).not.toHaveBeenCalled();expect(deleteSpy).not.toHaveBeenCalled();
});
