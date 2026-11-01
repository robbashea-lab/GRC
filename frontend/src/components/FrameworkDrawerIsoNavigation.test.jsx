import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation,useNavigate} from 'react-router-dom';
import FrameworkWorkspace from '@/pages/FrameworkWorkspace';
import {frameworkCatalog} from '@/lib/frameworks';
import api from '@/lib/api';

let mockUser,mockMode,mockClientId,mockFrameworkKey,mockNativeState,mockNativeActions;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:mockMode})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClientId})}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:false,default:{get:jest.fn(),patch:jest.fn(),put:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('./GuidedAssessor',()=>()=>null);
jest.mock('./SocGuidedAssessor',()=>()=>null);
jest.mock('./IsoGuidedAssessor',()=>()=>null);
// Keep the real FrameworkWorkspace, FrameworkDrawer, MemoryRouter and native leave guard.
// The full ISO editor/question presentation is covered by its existing assessment suites.
jest.mock('./FrameworkAssessmentWorkspace',()=>props=>mockSurface(props));
jest.mock('./PrestigeSocAssessment',()=>props=>mockSurface(props));
jest.mock('./ui/alert-dialog',()=>{
  const React=require('react'),Change=React.createContext(null);
  const Close=({children,onClick})=>{
    const change=React.useContext(Change);
    return <button onClick={event=>{onClick?.(event);if(!event.defaultPrevented)change(false);}}>{children}</button>;
  };
  return {
    AlertDialog:({open,onOpenChange,children})=>open?<Change.Provider value={onOpenChange}>{children}</Change.Provider>:null,
    AlertDialogContent:({children})=><section role="alertdialog">{children}</section>,
    AlertDialogTitle:({children})=><h2>{children}</h2>,AlertDialogDescription:({children})=><p>{children}</p>,
    AlertDialogFooter:({children})=><div>{children}</div>,AlertDialogCancel:Close,AlertDialogAction:Close,
  };
});

function mockSurface({state,actions}){
  mockNativeState=state;mockNativeActions=actions;
  return <section data-testid="native-iso-controller" data-assessment={state.record.framework_assessment_id}>
    <textarea aria-label="Native ISO implementation draft" value={state.form.implementation} disabled={!state.writable||state.busy} onChange={event=>actions.put('implementation',event.target.value)}/>
    <button onClick={actions.close}>Native ISO close</button>
  </section>;
}

let root,container,workspace,rawLocation,navigate;
const clientId='iso-navigation-client';
const route=id=>'/compliance/'+mockFrameworkKey+'?iso_view=isms_clause&assessment='+encodeURIComponent(id);
const selected=()=>container.querySelector('[data-testid="native-iso-controller"]');
const button=name=>[...container.querySelectorAll('button')].find(item=>item.textContent===name);
const click=name=>act(async()=>button(name).click());
const travel=direction=>act(async()=>navigate(direction));
const noWrites=()=>{for(const method of ['patch','put','post','delete'])expect(api[method]).not.toHaveBeenCalled();};
const deferred=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
function RoutedWorkspace(){
  rawLocation=useLocation();navigate=useNavigate();
  return <FrameworkWorkspace frameworkKey={mockFrameworkKey} clientId={mockClientId}/>;
}
async function mount(){
  const ids=workspace.assessments.map(row=>row.framework_assessment_id);
  await act(async()=>root.render(<MemoryRouter initialEntries={ids.map(route)} initialIndex={1}><RoutedWorkspace/></MemoryRouter>));
}
async function makeDraft(kind){
  await act(async()=>{
    if(kind==='native')mockNativeActions.put('implementation','Exact unsaved ISO implementation wording.');
    else mockNativeActions.setGuidedDraft(true);
  });
}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();jest.clearAllMocks();
  mockFrameworkKey='iso-27001';mockMode='demo';mockClientId=clientId;mockUser={user_id:'iso-navigation-owner',role:'super_admin',workspace_mode:'demo'};
  const definitions=frameworkCatalog('iso-27001').requirements.filter(definition=>['4.1','4.2','4.3'].includes(definition.id));
  const assessments=definitions.map(definition=>({client_id:clientId,framework_key:'iso-27001',framework_assessment_id:clientId+':'+definition.id,
    definition_id:definition.id,status:'in_progress',implementation:'Saved native '+definition.id,last_saved:'2026-10-31T12:00:00Z',assessment_history:[]}));
  workspace={configured:true,selected:true,definitions,assessments,active_definition_ids:definitions.map(definition=>definition.id),configuration:{},work:{}};
  api.get.mockImplementation(async path=>({data:path.startsWith('/frameworks/')?workspace:path.endsWith('/related')?{reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]}:[]}));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test.each([['native',-1],['native',1],['interview',-1],['interview',1]])('%s ISO draft survives browser history movement %s until the native confirmation resolves',async(kind,direction)=>{
  const before=JSON.stringify(workspace),current=workspace.assessments[1],destination=workspace.assessments[direction===-1?0:2];
  await mount();const editor=selected();expect(editor.dataset.assessment).toBe(current.framework_assessment_id);
  await makeDraft(kind);await travel(direction);
  expect(rawLocation.search).toContain(encodeURIComponent(destination.framework_assessment_id));
  expect(selected()).toBe(editor);expect(selected().dataset.assessment).toBe(current.framework_assessment_id);
  expect(container.querySelector('[role="alertdialog"]').textContent).toContain('Leave unsaved changes?');
  await click('Keep editing');
  expect(rawLocation.search).toContain(encodeURIComponent(current.framework_assessment_id));expect(selected()).toBe(editor);
  if(kind==='native')expect(mockNativeState.form.implementation).toBe('Exact unsaved ISO implementation wording.');
  else expect(mockNativeState.otherDraft).toBe(true);
  expect(JSON.stringify(workspace)).toBe(before);noWrites();
});

test('discarding an ISO draft accepts the exact requested Back destination without a write or extra history movement',async()=>{
  const before=JSON.stringify(workspace),destination=workspace.assessments[0];
  await mount();await makeDraft('native');await travel(-1);const requestedKey=rawLocation.key;
  expect(container.querySelector('[role="alertdialog"]').textContent).toContain('Leave unsaved changes?');
  await click('Discard changes');
  expect(rawLocation.key).toBe(requestedKey);expect(selected().dataset.assessment).toBe(destination.framework_assessment_id);
  expect(mockNativeState.form.implementation).toBe(destination.implementation);expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  expect(JSON.stringify(workspace)).toBe(before);noWrites();
});

test.each([false,true])('ISO Save & next keeps a newer Back destination and the original native payload; failure=%s',async failure=>{
  const before=JSON.stringify(workspace),current=workspace.assessments[1],destination=workspace.assessments[0],write=deferred();
  api.patch.mockImplementation(async(path,body)=>{
    await write.promise;
    const {expected_last_assessed,...fields}=body;
    const saved={...current,...fields,last_saved:'2026-11-01T12:00:00Z'};
    workspace={...workspace,assessments:workspace.assessments.map(row=>row.framework_assessment_id===current.framework_assessment_id?saved:row)};
    return {data:saved};
  });
  await mount();const editor=selected();await makeDraft('native');
  let saving;await act(async()=>{saving=mockNativeActions.saveAndNext();});
  const busyAtNavigation=mockNativeState.busy;
  await travel(-1);const requestedKey=rawLocation.key,heldDuringSave=selected()===editor,confirmationDuringSave=container.querySelector('[role="alertdialog"]');
  // Settle the controlled request before asserting, so a baseline failure leaves no pending test work.
  await act(async()=>{if(failure)write.reject(new Error('Native ISO save failed'));else write.resolve();await saving;});
  expect(busyAtNavigation).toBe(true);expect(api.patch).toHaveBeenCalledTimes(1);
  expect(api.patch).toHaveBeenCalledWith('/framework_assessments/'+current.framework_assessment_id,{
    status:'in_progress',implementation:'Exact unsaved ISO implementation wording.',technology:'',notes:'',na_rationale:'',owner_id:null,process_owner_id:null,
    addressable_decision:'',addressable_rationale:'',iso_assessment_checks:[],expected_last_assessed:'2026-10-31T12:00:00Z',
  });
  expect(heldDuringSave).toBe(true);expect(confirmationDuringSave).toBeNull();
  expect(api.patch).toHaveBeenCalledTimes(1);for(const method of ['put','post','delete'])expect(api[method]).not.toHaveBeenCalled();
  if(failure){
    expect(selected()).toBe(editor);expect(mockNativeState.form.implementation).toBe('Exact unsaved ISO implementation wording.');
    expect(mockNativeState.error).toBe('Native ISO save failed');expect(JSON.stringify(workspace)).toBe(before);
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();await click('Keep editing');
    expect(selected()).toBe(editor);expect(rawLocation.search).toContain(encodeURIComponent(current.framework_assessment_id));
  }else{
    expect(rawLocation.key).toBe(requestedKey);expect(selected().dataset.assessment).toBe(destination.framework_assessment_id);
    expect(workspace.assessments[1].implementation).toBe('Exact unsaved ISO implementation wording.');
  }
});

test.each(['actor','role','client','mode'])('an ISO %s origin change withdraws the previous assessment draft without retaining it across authorization scope',async kind=>{
  await mount();const before=JSON.stringify(workspace),editor=selected();await makeDraft('native');
  if(kind==='actor')mockUser={...mockUser,user_id:'another-authorized-owner'};
  if(kind==='role')mockUser={...mockUser,role:'client_readonly'};
  if(kind==='client')mockClientId='another-iso-navigation-client';
  if(kind==='mode')mockMode='authenticated';
  await mount();expect(editor.isConnected).toBe(false);expect(selected()).not.toBe(editor);expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  if(kind==='client')expect(selected()).toBeNull();else expect(mockNativeState.form.implementation).toBe(workspace.assessments[1].implementation);
  expect(JSON.stringify(workspace)).toBe(before);noWrites();
});

test.each([false,true])('SOC retains its existing dirty guard when same-client query presence changes across Back; currentHasClient=%s',async currentHasClient=>{
  mockFrameworkKey='soc-2';
  const definitions=frameworkCatalog('soc-2').requirements.filter(definition=>['CC1.1','CC1.2'].includes(definition.id));
  workspace={configured:true,selected:true,definitions,configuration:{categories:['security']},active_definition_ids:definitions.map(definition=>definition.id),work:{},
    assessments:definitions.map(definition=>({client_id:clientId,framework_key:'soc-2',framework_assessment_id:clientId+':'+definition.id,definition_id:definition.id,
      status:'in_progress',implementation:'Saved SOC '+definition.id,last_saved:'2026-10-31T12:00:00Z',assessment_history:[]}))};
  const url=(record,withClient)=>'/compliance/soc-2?'+new URLSearchParams({soc_category:'security',assessment:record.framework_assessment_id,...(withClient?{client_id:clientId}:{})});
  const destination=url(workspace.assessments[0],!currentHasClient),current=url(workspace.assessments[1],currentHasClient),before=JSON.stringify(workspace);
  await act(async()=>root.render(<MemoryRouter initialEntries={[destination,current]} initialIndex={1}><RoutedWorkspace/></MemoryRouter>));
  const editor=selected();await act(async()=>mockNativeActions.put('implementation','Exact retained SOC implementation draft.'));
  await travel(-1);expect(rawLocation.pathname+rawLocation.search).toBe(destination);expect(selected()).toBe(editor);
  expect(container.querySelector('[role="alertdialog"]').textContent).toContain('Leave unsaved changes?');
  await click('Keep editing');expect(rawLocation.pathname+rawLocation.search).toBe(current);expect(selected()).toBe(editor);
  expect(mockNativeState.form.implementation).toBe('Exact retained SOC implementation draft.');expect(JSON.stringify(workspace)).toBe(before);noWrites();
});
