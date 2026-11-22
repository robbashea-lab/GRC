import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import FrameworkDrawer from './FrameworkDrawer';
import FrameworkReviewSetup from './FrameworkReviewSetup';
import {frameworkCatalog} from '@/lib/frameworks';
import {clearPendingCommands,syncPendingCommandIdentity} from '@/lib/createIntent';
import {rememberClient} from '@/lib/clientSelection';
import api from '@/lib/api';

let mockAuth,mockOrg,mockState,mockActions,mockSaved,mockReviews;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,API:'/api',
  default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),
  formatError:error=>error.response?.data?.detail||error.message}));
jest.mock('./BrawndoCisSafeguard',()=>props=>mockEditor(props));
jest.mock('./PrestigeSocAssessment',()=>props=>mockEditor(props));
jest.mock('./FrameworkAssessmentWorkspace',()=>props=>mockEditor(props));
jest.mock('./R4AssessmentContext',()=>()=>null);
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn(),info:jest.fn()}}));

// Keep the actual owner, memory intent lease, setup editor and server-like adapter.
// The presentation fixture delegates Next to the actual FrameworkDrawer controller.
function mockEditor({state,actions}){
  mockState=state;mockActions=actions;
  const record=state.current||state.record,catalog=frameworkCatalog(record.framework_key);
  return <section>
    {state.error&&<p role="alert">{state.error}</p>}
    <FrameworkReviewSetup record={record} definition={state.definition} catalog={catalog}
      reviews={mockReviews} users={state.ctx?.users||[]} clientId={record.client_id} writable={state.writable}
      onDraftChange={actions.setReviewDraft} onOpen={()=>{}}
      onSaved={data=>{mockSaved(data);actions.reviewSaved?.();}}/>
  </section>;
}
const CID='demo_dunder';
let root,host,native,beforeAssessment,onNext,reads,releases;
const button=name=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
const field=label=>document.querySelector('[aria-label="'+label+'"]');
async function drainReads(){
  let index=0;
  while(index<reads.length){
    const batch=reads.slice(index);index=reads.length;
    await act(async()=>{await Promise.allSettled(batch);});
  }
}
async function render(){
  const url='/compliance/iso-27001?client_id='+CID+'&assessment='+native.framework_assessment_id;
  window.history.replaceState({},'',url);
  await act(async()=>root.render(<MemoryRouter initialEntries={[url]}>
    <FrameworkDrawer open record={native} clientId={CID} onNext={onNext} onOpenChange={()=>{}}/>
  </MemoryRouter>));await drainReads();
  expect(mockState.ctx).toBeTruthy();expect(mockActions.next).toEqual(expect.any(Function));
}
async function click(node){
  expect(node).toBeTruthy();expect(node.matches(':disabled')).toBe(false);
  await act(async()=>node.click());await drainReads();
}
async function fill(node,value){
  expect(node).toBeTruthy();
  await act(async()=>{
    const prototype=node.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);
    node.dispatchEvent(new Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));
  });
}
function deferred(){
  let resolve;const promise=new Promise(yes=>{resolve=yes;});releases.push(resolve);return {promise,resolve};
}

beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();clearPendingCommands();
  releases=[];reads=[];mockState=null;mockActions=null;mockSaved=jest.fn();onNext=jest.fn();
  mockAuth={user:(await api.post('/demo/enter')).data.user,workspaceMode:'demo',loading:false,error:null};
  syncPendingCommandIdentity(mockAuth.user.user_id,'demo');
  const clients=(await api.get('/clients')).data,client=clients.find(row=>row.client_id===CID);
  mockOrg={currentClientId:CID,currentClient:client,clients,loading:false,error:null};
  native=(await api.get('/frameworks/iso-27001',{params:{client_id:CID}})).data.assessments.find(row=>row.definition_id==='6.1.3');
  expect(native).toBeTruthy();
  beforeAssessment=(await api.get('/framework_assessments/'+native.framework_assessment_id)).data;
  mockReviews=(await api.get('/reviews',{params:{client_id:CID}})).data;
  rememberClient(CID);
  const get=api.get.bind(api);
  jest.spyOn(api,'get').mockImplementation((...args)=>{const response=get(...args);reads.push(response);return response;});
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>{releases.forEach(resolve=>resolve());root.unmount();});
  host.remove();jest.restoreAllMocks();clearPendingCommands();jest.clearAllMocks();
});

test('unknown setup retains its exact original request through Cancel, selector edits, parent leave and current-authority withdrawal, then canonical Retry keeps its undated schedule',async()=>{
  await render();await click(button('Create or link recurring Review'));
  if(field('Governance activity'))await fill(field('Governance activity'),'');
  const title='SYNTHETIC undated setup awaiting confirmation';
  await fill(field('Review title'),title);
  expect(field('Review cadence').value).toBe('quarterly');expect(field('Next due').value).toBe('');
  const path='/framework_assessments/'+native.framework_assessment_id+'/reviews',post=api.post.bind(api);
  const started=deferred(),release=deferred(),requests=[];
  const spy=jest.spyOn(api,'post').mockImplementation(async(route,body,config)=>{
    const response=await post(route,body,config);
    if(route===path){
      requests.push([route,body,config,response.data]);
      if(requests.length===1){started.resolve();await release.promise;
        throw Object.assign(new Error('SYNTHETIC setup response lost'),{response:{status:503,headers:{},data:{detail:'SYNTHETIC setup response lost'}}});}
    }
    return response;
  });
  await act(async()=>{button('Save Review').click();await started.promise;});
  await act(async()=>mockActions.next());expect(onNext).not.toHaveBeenCalled();
  await act(async()=>{release.resolve();await Promise.allSettled(spy.mock.results.map(result=>result.value));});
  await drainReads();
  expect(requests).toHaveLength(1);
  expect(requests[0][1]).toEqual({plan_key:null,title,owner_id:native.owner_id||null,recurrence:'quarterly',
    custom_recurrence_days:null,due_date:'',review_id:null});
  await click(button('Cancel Review setup'));
  expect(field('Review title').value).toBe(title);
  await fill(field('Review title'),'SYNTHETIC forbidden replacement title');
  await fill(field('Review cadence'),'annual');
  expect(field('Review title').value).toBe(title);expect(field('Review cadence').value).toBe('quarterly');
  await act(async()=>mockActions.next());expect(onNext).not.toHaveBeenCalled();
  expect(button('Discard changes')).toBeUndefined();expect(requests).toHaveLength(1);
  expect(Object.keys(sessionStorage).filter(key=>key.startsWith('grc_pending_command_v1:'))).toEqual([]);

  const operator=mockAuth.user;
  mockAuth={...mockAuth,user:{...operator,role:'client_readonly'}};
  await render();
  const blockedRetry=button('Retry unconfirmed Review setup');
  expect(blockedRetry.matches(':disabled')).toBe(true);
  await act(async()=>blockedRetry.click());
  expect(requests).toHaveLength(1);expect(field('Review title').value).toBe(title);
  mockAuth={...mockAuth,user:operator};await render();
  expect(button('Retry unconfirmed Review setup').matches(':disabled')).toBe(false);
  expect(requests).toHaveLength(1);
  await click(button('Retry unconfirmed Review setup'));
  expect(requests).toHaveLength(2);
  expect(JSON.stringify(requests[1][1])).toBe(JSON.stringify(requests[0][1]));
  expect(requests[0][2].headers['Idempotency-Key']).toEqual(expect.any(String));
  expect(requests[1][2].headers['Idempotency-Key']).toBe(requests[0][2].headers['Idempotency-Key']);
  expect(requests[1][3].review_id).toBe(requests[0][3].review_id);
  expect(mockSaved).toHaveBeenCalledTimes(1);
  expect(field('Review title')).toBeNull();

  const review=(await api.get('/reviews/'+requests[0][3].review_id)).data;
  expect(review).toMatchObject({title,recurrence:'quarterly',due_date:null,status:'needs_scheduling'});
  expect((await api.get('/reviews',{params:{client_id:CID}})).data.filter(row=>row.review_id===review.review_id)).toHaveLength(1);
  const after=(await api.get('/framework_assessments/'+native.framework_assessment_id)).data;
  expect(after.related_links.filter(link=>link.kind==='reviews'&&link.id===review.review_id)).toHaveLength(1);
  for(const key of ['status','last_saved','last_assessed','assessment_history','implementation','verification'])
    expect(after[key]).toEqual(beforeAssessment[key]);
  await act(async()=>mockActions.next());expect(onNext).toHaveBeenCalledTimes(1);
});

test('ordinary unsaved setup Cancel still clears the form without posting or blocking the native parent leave',async()=>{
  await render();
  const post=jest.spyOn(api,'post');
  await click(button('Create or link recurring Review'));
  if(field('Governance activity'))await fill(field('Governance activity'),'');
  await fill(field('Review title'),'SYNTHETIC ordinary unsaved setup');
  await click(button('Cancel Review setup'));
  expect(field('Review title')).toBeNull();expect(post).not.toHaveBeenCalled();
  await act(async()=>mockActions.next());expect(onNext).toHaveBeenCalledTimes(1);
  expect(mockSaved).not.toHaveBeenCalled();
});