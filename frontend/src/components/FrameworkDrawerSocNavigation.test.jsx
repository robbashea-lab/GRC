import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation,useNavigate,useSearchParams} from 'react-router-dom';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import {useSocWorkspaceNavigation} from '@/lib/useSocWorkspaceNavigation';

let mockUser,mockNativeState,mockNativeActions;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:'demo'})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'soc-navigation-client'})}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:false,default:{get:jest.fn(),patch:jest.fn(),put:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('./RecordDrawer',()=>()=>null);
// Exercise the real native controller and leave confirmation; editor rendering has its own suites.
jest.mock('./PrestigeSocAssessment',()=>props=>mockSurface(props));
jest.mock('./FrameworkAssessmentWorkspace',()=>props=>mockSurface(props));
jest.mock('./BrawndoCisSafeguard',()=>props=>mockSurface(props));
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
  return <section data-testid="native-controller">
    <textarea aria-label="Native implementation draft" value={state.form.implementation} disabled={!state.writable||state.busy} onChange={event=>actions.put('implementation',event.target.value)}/>
    <button onClick={actions.close}>Native close</button>
  </section>;
}

let root,container,record,props;
const deferred=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
const button=name=>[...container.querySelectorAll('button')].find(item=>item.textContent===name);
const click=name=>act(async()=>button(name).click());
const render=async updates=>{
  props={...props,...updates};
  await act(async()=>root.render(<FrameworkDrawer {...props}/>));
};
const noWrites=()=>{for(const method of ['patch','put','post','delete'])expect(api[method]).not.toHaveBeenCalled();};

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();jest.clearAllMocks();
  mockUser={user_id:'soc-navigation-owner',role:'super_admin',workspace_mode:'demo'};
  record={client_id:'soc-navigation-client',framework_key:'soc-2',framework_assessment_id:'soc-navigation-assessment',definition_id:'CC1.1',status:'in_progress',implementation:'Saved native implementation',last_saved:'2026-10-31T12:00:00Z',assessment_history:[]};
  props={open:true,record,clientId:record.client_id,onOpenChange:jest.fn(),onCloseCancelled:jest.fn(),closeRequest:0};
  api.get.mockImplementation(async path=>({data:path.startsWith('/frameworks/')?{selected:true,configured:true,configuration:{categories:['security']},assessments:[record],work:{}}:path.endsWith('/related')?{reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]}:[]}));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test('a clean SOC external close request closes once without cancellation or native writes',async()=>{
  await render();await render({closeRequest:1});
  expect(props.onOpenChange).toHaveBeenCalledTimes(1);expect(props.onOpenChange).toHaveBeenCalledWith(false);
  expect(props.onCloseCancelled).not.toHaveBeenCalled();expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  await render({closeRequest:1});expect(props.onOpenChange).toHaveBeenCalledTimes(1);noWrites();
});

test('a newly mounted SOC editor adopts the current token instead of replaying a previous close',async()=>{
  await render({closeRequest:7});expect(props.onOpenChange).not.toHaveBeenCalled();
  await render({closeRequest:8});expect(props.onOpenChange).toHaveBeenCalledTimes(1);noWrites();
});

test.each(['native','interview','items','finding'])('%s draft uses the existing confirmation and Keep editing retains the open SOC identity',async kind=>{
  await render();const before=JSON.stringify(record),surface=container.querySelector('[data-testid="native-controller"]');
  await act(async()=>{
    if(kind==='native')mockNativeActions.put('implementation','Unsaved exact native wording.');
    if(kind==='interview')mockNativeActions.setGuidedDraft(true);
    if(kind==='items')mockNativeActions.setItemsDraft(true);
    if(kind==='finding')mockNativeActions.setFinding({title:'Unfinished finding',request_id:'unchanged-finding-request'});
  });
  await render({closeRequest:1});
  expect(container.querySelector('[role="alertdialog"]').textContent).toContain('Leave unsaved changes?');
  expect(props.onOpenChange).not.toHaveBeenCalled();await click('Keep editing');
  expect(props.onCloseCancelled).toHaveBeenCalledTimes(1);expect(props.onOpenChange).not.toHaveBeenCalled();
  expect(container.querySelector('[data-testid="native-controller"]')).toBe(surface);expect(JSON.stringify(record)).toBe(before);
  if(kind==='native')expect(mockNativeState.form.implementation).toBe('Unsaved exact native wording.');
  if(kind==='finding')expect(mockNativeState.finding).toEqual({title:'Unfinished finding',request_id:'unchanged-finding-request'});
  await render({closeRequest:2});expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
  noWrites();
});

test('Discard closes the pending SOC request before the confirmation emits its close event',async()=>{
  await render();await act(async()=>mockNativeActions.put('implementation','Unsaved draft'));
  props.onOpenChange.mockImplementation(()=>expect(props.onCloseCancelled).not.toHaveBeenCalled());
  await render({closeRequest:1});await click('Discard changes');
  expect(props.onOpenChange).toHaveBeenCalledTimes(1);expect(props.onOpenChange).toHaveBeenCalledWith(false);
  expect(props.onCloseCancelled).not.toHaveBeenCalled();expect(record.implementation).toBe('Saved native implementation');noWrites();
});

test.each([false,true])('a SOC request waits until native work is idle and retains dirty work after failure=%s',async failure=>{
  await render();await act(async()=>mockNativeActions.put('implementation','Retain this draft while work completes'));
  const read=deferred();let operation;
  await act(async()=>{operation=mockNativeActions.run(()=>read.promise);});
  expect(mockNativeState.busy).toBe(true);await render({closeRequest:1});
  expect(props.onOpenChange).not.toHaveBeenCalled();expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  await act(async()=>{if(failure)read.reject(new Error('Existing operation failed'));else read.resolve();await operation;});
  expect(mockNativeState.busy).toBe(false);expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(mockNativeState.form.implementation).toBe('Retain this draft while work completes');
  if(failure)expect(mockNativeState.error).toBe('Existing operation failed');
  await click('Keep editing');expect(props.onCloseCancelled).toHaveBeenCalledTimes(1);expect(props.onOpenChange).not.toHaveBeenCalled();noWrites();
});

test('ordinary SOC close cancellation does not report an external navigation cancellation',async()=>{
  await render();await act(async()=>mockNativeActions.put('implementation','Ordinary unsaved draft'));
  await click('Native close');await click('Keep editing');
  expect(props.onCloseCancelled).not.toHaveBeenCalled();expect(props.onOpenChange).not.toHaveBeenCalled();noWrites();
});

test.each([['cis-ig1','1.1'],['iso-27001','4.1']])('%s ignores the optional SOC request and retains its ordinary close behavior',async(framework,id)=>{
  record={...record,framework_key:framework,definition_id:id};await render({record});await render({closeRequest:1});
  expect(props.onOpenChange).not.toHaveBeenCalled();expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  await act(async()=>mockNativeActions.put('implementation','Unaffected native draft'));
  await click('Native close');await click('Keep editing');expect(props.onCloseCancelled).not.toHaveBeenCalled();
  await click('Native close');await click('Discard changes');expect(props.onOpenChange).toHaveBeenCalledWith(false);noWrites();
});

test('read-only SOC can honor a clean close request without a write',async()=>{
  mockUser={...mockUser,role:'client_readonly'};await render();
  expect(container.querySelector('textarea').disabled).toBe(true);await render({closeRequest:1});
  expect(props.onOpenChange).toHaveBeenCalledWith(false);expect(props.onCloseCancelled).not.toHaveBeenCalled();noWrites();
});

let navigationBoundary;
function NavigationBoundary({onNextAttempt,onOrdinaryNext}){
  const [params,setParams]=useSearchParams(),location=useLocation(),navigate=useNavigate();
  const [,refresh]=useState(0);
  const nextRecord={...record,definition_id:'CC1.2',framework_assessment_id:'soc-navigation-next'};
  const records=[record,nextRecord];
  const navigation=useSocWorkspaceNavigation({enabled:true,origin:'actor:client:soc',location,params,setParams,records});
  navigationBoundary={location,navigate,navigation};
  const selected=records.find(row=>row.framework_assessment_id===navigation.params.get('assessment'));
  // This boundary mirrors the parent's pending-first callback; full workspace routing has its own suite.
  const onNext=()=>{
    onNextAttempt();
    if(navigation.acceptPending()){refresh(value=>value+1);return;}
    onOrdinaryNext();
    const next=new URLSearchParams(navigation.params);next.set('assessment',nextRecord.framework_assessment_id);
    navigation.setParams(next,{replace:true});
  };
  const close=()=>{
    if(navigation.acceptPending()){refresh(value=>value+1);return;}
    navigation.allowNextLocation();navigate(-1);
  };
  return selected?<FrameworkDrawer key={selected.framework_assessment_id} open record={selected} clientId={selected.client_id}
    closeRequest={navigation.closeRequest} onCloseCancelled={navigation.keepEditing} onNext={onNext}
    onSaved={()=>refresh(value=>value+1)} onOpenChange={value=>{if(!value)close();}}/>:<p>Accepted browser destination</p>;
}

test.each([false,true])('native Save & next with a newer POP preserves the pending destination and failed draft; failure=%s',async failure=>{
  const source=JSON.parse(JSON.stringify(record)),write=deferred(),onNextAttempt=jest.fn(),onOrdinaryNext=jest.fn();
  const destination='/compliance/soc-2?soc_category=availability';
  const current='/compliance/soc-2?soc_category=security&assessment='+record.framework_assessment_id;
  api.patch.mockImplementation(async(_path,body)=>{
    await write.promise;
    const {expected_last_assessed,...fields}=body;
    record={...record,...fields,last_saved:'2026-11-01T12:00:00Z'};
    return {data:record};
  });
  await act(async()=>root.render(<MemoryRouter initialEntries={[destination,{pathname:'/compliance/soc-2',search:current.slice(current.indexOf('?')),state:{fromWorkspace:true}}]} initialIndex={1}>
    <NavigationBoundary {...{onNextAttempt,onOrdinaryNext}}/>
  </MemoryRouter>));
  const editor=container.querySelector('[data-testid="native-controller"]');
  await act(async()=>mockNativeActions.put('implementation','Exact reviewed native wording before the browser navigation.'));
  let saving;await act(async()=>{saving=mockNativeActions.saveAndNext();});
  expect(mockNativeState.busy).toBe(true);expect(api.patch).toHaveBeenCalledTimes(1);
  expect(api.patch).toHaveBeenCalledWith('/framework_assessments/'+source.framework_assessment_id,expect.objectContaining({
    implementation:'Exact reviewed native wording before the browser navigation.',status:source.status,expected_last_assessed:source.last_saved,
  }));
  await act(async()=>navigationBoundary.navigate(-1));
  const requestedKey=navigationBoundary.location.key;
  expect(navigationBoundary.location.search).toBe('?soc_category=availability');
  expect(navigationBoundary.navigation.params.get('assessment')).toBe(source.framework_assessment_id);
  expect(container.querySelector('[data-testid="native-controller"]')).toBe(editor);
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();expect(onNextAttempt).not.toHaveBeenCalled();
  await act(async()=>{if(failure)write.reject(new Error('Native save failed'));else write.resolve();await saving;});
  expect(onOrdinaryNext).not.toHaveBeenCalled();expect(api.patch).toHaveBeenCalledTimes(1);
  for(const method of ['put','post','delete'])expect(api[method]).not.toHaveBeenCalled();
  if(failure){
    expect(onNextAttempt).not.toHaveBeenCalled();expect(record).toEqual(source);
    expect(container.querySelector('[data-testid="native-controller"]')).toBe(editor);
    expect(mockNativeState.form.implementation).toBe('Exact reviewed native wording before the browser navigation.');
    expect(mockNativeState.error).toBe('Native save failed');expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    await click('Keep editing');
    expect(navigationBoundary.location.search).toContain('assessment='+source.framework_assessment_id);
    expect(container.querySelector('[data-testid="native-controller"]')).toBe(editor);
  }else{
    expect(onNextAttempt).toHaveBeenCalledTimes(1);expect(record.implementation).toBe('Exact reviewed native wording before the browser navigation.');
    expect(navigationBoundary.location.key).toBe(requestedKey);expect(navigationBoundary.location.search).toBe('?soc_category=availability');
    expect(navigationBoundary.navigation.params.has('assessment')).toBe(false);
    expect(container.querySelector('[data-testid="native-controller"]')).toBeNull();
    expect(container.textContent).toContain('Accepted browser destination');
  }
});
