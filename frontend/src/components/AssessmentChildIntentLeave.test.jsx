import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import FrameworkDrawer from './FrameworkDrawer';
import ReviewDrawer from './ReviewDrawer';
import api from '@/lib/api';
import {clearPendingCommands,syncPendingCommandIdentity} from '@/lib/createIntent';
import {rememberClient} from '@/lib/clientSelection';

let mockAuth,mockOrg,mockState,mockActions,mockChildRecord,mockChildClose,mockChildSaved;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>false}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,API:'/api',
  default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),
  formatError:error=>error.response?.data?.detail||error.message}));
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn(),info:jest.fn()}}));
// Keep the actual owner controller, scoped API/hooks and actual child Review.
// Only unopened views and the assessment's presentation boundary are replaced.
jest.mock('./BrawndoCisSafeguard',()=>props=>mockEditor(props));
jest.mock('./PrestigeSocAssessment',()=>props=>mockEditor(props));
jest.mock('./FrameworkAssessmentWorkspace',()=>props=>mockEditor(props));
jest.mock('./R4AssessmentContext',()=>()=>null);
jest.mock('./RecordDrawer',()=>()=>null);

function mockEditor({state,actions}){
  mockState=state;mockActions=actions;
  return <section data-testid="native-parent-controller">
    <button onClick={actions.next}>Parent Next</button>
    {state.error&&<p role="alert">{state.error}</p>}
    <ReviewDrawer open record={mockChildRecord} clientId={state.record.client_id}
      onOpenChange={mockChildClose} onSaved={mockChildSaved}/>
  </section>;
}
const CID='demo_prestige';
let root,host,native,targetB,onNext,reads,heldResponses;
const query=id=>document.querySelector('[data-testid="'+id+'"]');
const button=(name,scope=document)=>[...scope.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
function deferred(){
  let resolve;const promise=new Promise(yes=>{resolve=yes;});
  const response={promise,resolve};heldResponses.push(response);return response;
}
async function drainReads(){
  let index=0;
  while(index<reads.length){
    const batch=reads.slice(index);index=reads.length;
    await act(async()=>{await Promise.allSettled(batch);});
  }
}
async function click(node){
  expect(node).toBeTruthy();expect(node.getAttribute('aria-disabled')).not.toBe('true');
  if(node.matches('button,input,select,textarea,option,optgroup,fieldset'))expect(node.disabled).toBe(false);
  await act(async()=>node.click());await drainReads();
}
async function fill(node,value){
  expect(node).toBeTruthy();
  await act(async()=>{
    const prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);
    node.dispatchEvent(new Event('input',{bubbles:true}));
  });
}
async function render(record=native){
  const url='/compliance/soc-2?client_id='+CID+'&assessment='+record.framework_assessment_id;
  window.history.replaceState({},'',url);
  await act(async()=>root.render(<MemoryRouter initialEntries={[url]}>
    <FrameworkDrawer open record={record} clientId={CID} onNext={onNext} onOpenChange={()=>{}}/>
  </MemoryRouter>));await drainReads();
  expect(mockState.ctx).toBeTruthy();expect(mockActions.next).toEqual(expect.any(Function));
  expect(query('reviews-drawer')).toBeTruthy();
}
function memoryStorageKeys(){
  return Object.keys(sessionStorage).filter(key=>key.startsWith('grc_pending_command_v1:'));
}
function loseFirstCommittedResponse(path){
  const post=api.post.bind(api),started=deferred(),release=deferred(),requests=[];
  const spy=jest.spyOn(api,'post').mockImplementation(async(route,body,config)=>{
    const response=await post(route,body,config);
    if(route===path){
      requests.push([route,body,config,response.data]);
      if(requests.length===1){
        started.resolve();await release.promise;
        throw Object.assign(new Error('SYNTHETIC committed response lost'),{response:{status:503,headers:{},data:{detail:'SYNTHETIC committed response lost'}}});
      }
    }
    return response;
  });
  return {spy,requests,started,release};
}
async function settleLost(wire){
  await act(async()=>{wire.release.resolve();await Promise.allSettled(wire.spy.mock.results.map(result=>result.value));});
  await drainReads();
}
function expectSameOriginalRequest(wire){
  expect(wire.requests).toHaveLength(2);
  const [first,retry]=wire.requests;
  expect(retry[0]).toBe(first[0]);expect(JSON.stringify(retry[1])).toBe(JSON.stringify(first[1]));
  expect(first[2].headers['Idempotency-Key']).toEqual(expect.any(String));
  expect(retry[2].headers['Idempotency-Key']).toBe(first[2].headers['Idempotency-Key']);
}

beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
const nativeScrollIntoView=Element.prototype.scrollIntoView;
beforeAll(()=>{if(!nativeScrollIntoView)Element.prototype.scrollIntoView=jest.fn();});
afterAll(()=>{if(!nativeScrollIntoView)delete Element.prototype.scrollIntoView;});
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();clearPendingCommands();
  heldResponses=[];reads=[];mockState=null;mockActions=null;mockChildRecord=null;
  mockAuth={user:(await api.post('/demo/enter')).data.user,workspaceMode:'demo',loading:false,error:null};
  syncPendingCommandIdentity(mockAuth.user.user_id,'demo');
  const clients=(await api.get('/clients')).data,client=clients.find(row=>row.client_id===CID);
  mockOrg={currentClientId:CID,currentClient:client,clients,loading:false,error:null};
  const assessments=(await api.get('/frameworks/soc-2',{params:{client_id:CID}})).data.assessments;
  native=assessments.find(row=>row.definition_id==='CC1.1');
  targetB=assessments.find(row=>row.framework_assessment_id!==native?.framework_assessment_id);
  expect(native).toBeTruthy();expect(targetB).toBeTruthy();rememberClient(CID);
  mockChildClose=jest.fn();mockChildSaved=jest.fn();onNext=jest.fn();
  const get=api.get.bind(api);
  jest.spyOn(api,'get').mockImplementation((...args)=>{const response=get(...args);reads.push(response);return response;});
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>{heldResponses.forEach(response=>response.resolve());await root.unmount();});
  host.remove();jest.restoreAllMocks();clearPendingCommands();jest.clearAllMocks();
});

test('a Review create with a lost 503 response blocks native Discard and actual parent Next until explicit original Retry confirms one canonical Review',async()=>{
  await render();
  const title='SYNTHETIC uncertain child Review';
  await fill(query('field-title'),title);
  await click(query('field-review_type'));
  await click([...document.querySelectorAll('[role="option"]')].find(node=>node.textContent==='Access'));
  const create=query('drawer-save');
  expect(create.textContent).toBe('Create');
  const wire=loseFirstCommittedResponse('/reviews');
  await click(button('Close',query('reviews-drawer').querySelector('.review-workflow-footer')));
  expect(button('Discard changes')).toBeTruthy();
  // A queued native create callback can settle after the discard confirmation opened.
  await act(async()=>{create.click();await wire.started.promise;});
  await act(async()=>mockActions.next());
  expect(onNext).not.toHaveBeenCalled();
  await settleLost(wire);
  expect(wire.requests).toHaveLength(1);expect(memoryStorageKeys()).toEqual([]);
  expect(query('field-title').value).toBe(title);
  await click(button('Discard changes'));
  expect(mockChildClose).not.toHaveBeenCalled();
  expect(button('Discard changes')).toBeTruthy();
  await act(async()=>mockActions.next());
  expect(onNext).not.toHaveBeenCalled();expect(wire.requests).toHaveLength(1);

  await click(button('Keep editing'));
  await render(targetB);
  expect(mockState.record.framework_assessment_id).toBe(native.framework_assessment_id);
  expect(mockState.current.framework_assessment_id).toBe(native.framework_assessment_id);
  expect(query('field-title').value).toBe(title);
  expect(button('Retry unconfirmed create').disabled).toBe(false);
  expect(mockChildClose).not.toHaveBeenCalled();expect(wire.requests).toHaveLength(1);
  await act(async()=>mockActions.next());expect(onNext).not.toHaveBeenCalled();
  expect(wire.requests).toHaveLength(1);
  await fill(query('field-title'),'SYNTHETIC newer unsaved title must not change the original retry');
  await click(button('Close',query('reviews-drawer').querySelector('.review-workflow-footer')));
  expect(mockChildClose).not.toHaveBeenCalled();expect(button('Discard changes')).toBeUndefined();
  await click(button('Retry unconfirmed create'));
  expectSameOriginalRequest(wire);
  expect(wire.requests[1][3].review_id).toBe(wire.requests[0][3].review_id);
  const saved=(await api.get('/reviews',{params:{client_id:CID}})).data.filter(row=>row.title===title);
  expect(saved).toHaveLength(1);
  expect(saved[0].review_id).toBe(wire.requests[0][3].review_id);
  expect((await api.get('/reviews/'+saved[0].review_id)).data.title).toBe(title);
  expect(mockChildSaved).toHaveBeenCalledTimes(1);
  await act(async()=>mockActions.next());expect(onNext).toHaveBeenCalledTimes(1);
  await click(button('Close',query('reviews-drawer').querySelector('.review-workflow-footer')));
  expect(mockChildClose).toHaveBeenCalledWith(false);
});

test('a lost Finding create keeps its mounted original request and both canonical linked identities through native leave attempts and Retry',async()=>{
  mockChildRecord=(await api.post('/reviews',{client_id:CID,title:'SYNTHETIC parent of uncertain Finding',review_type:'access',recurrence:'annual',due_date:'2099-09-30'})).data;
  await render();await click(query('quick-create-finding'));
  const title='SYNTHETIC uncertain child Finding';
  await fill(query('finding-title'),title);
  await fill(query('finding-remediation-title'),'SYNTHETIC original corrective action');
  const form=query('review-finding-form').querySelector('form');
  const path='/reviews/'+mockChildRecord.review_id+'/create-finding',wire=loseFirstCommittedResponse(path);
  await click(button('Cancel',query('review-finding-form')));
  expect(button('Discard changes')).toBeTruthy();
  await act(async()=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wire.started.promise;});
  await act(async()=>mockActions.next());expect(onNext).not.toHaveBeenCalled();
  await settleLost(wire);
  const first=(await api.get('/findings',{params:{client_id:CID}})).data.filter(row=>row.title===title);
  expect(first).toHaveLength(1);expect(memoryStorageKeys()).toEqual([]);
  await click(button('Discard changes'));
  expect(query('review-finding-form')).toBeTruthy();expect(query('finding-title').value).toBe(title);
  expect(mockChildClose).not.toHaveBeenCalled();
  await act(async()=>mockActions.next());expect(onNext).not.toHaveBeenCalled();
  await click(button('Keep editing'));
  await fill(query('finding-title'),'SYNTHETIC newer title outside the original request');
  await click(button('Cancel',query('review-finding-form')));
  expect(query('review-finding-form')).toBeTruthy();expect(button('Discard changes')).toBeUndefined();
  await click(button('Retry unconfirmed finding'));
  expectSameOriginalRequest(wire);
  expect(query('review-finding-form')).toBeNull();
  const findings=(await api.get('/findings',{params:{client_id:CID}})).data.filter(row=>row.title===title);
  const actions=(await api.get('/tasks',{params:{client_id:CID}})).data.filter(row=>row.finding_id===first[0].finding_id);
  expect(findings).toHaveLength(1);expect(findings[0].finding_id).toBe(first[0].finding_id);
  expect(actions).toHaveLength(1);expect(actions[0].title).toBe('SYNTHETIC original corrective action');
  expect(findings[0].review_id).toBe(mockChildRecord.review_id);expect(actions[0].review_id).toBe(mockChildRecord.review_id);
  expect(findings[0].occurrence_id).toBe(mockChildRecord.current_occurrence_id);
  expect(actions[0].occurrence_id).toBe(mockChildRecord.current_occurrence_id);
  expect(mockChildSaved).toHaveBeenCalledTimes(1);
  await act(async()=>mockActions.next());expect(onNext).toHaveBeenCalledTimes(1);
  await click(button('Close',query('reviews-drawer').querySelector('.review-workflow-footer')));
  expect(mockChildClose).toHaveBeenCalledWith(false);
});