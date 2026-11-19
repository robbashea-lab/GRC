import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewDrawer from './ReviewDrawer';
import api from '@/lib/api';
import {ids,readStore,saveStore} from '@/preview/store';
import {rememberClient} from '@/lib/clientSelection';
import {toast} from 'sonner';

let mockAuth,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,
  default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),
  formatError:error=>error.response?.data?.detail||error.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('@/lib/recordUuid',()=>({recordUuid:()=>require('crypto').randomUUID()}));
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{configurable:true,value:require('crypto').webcrypto}));
const originalScroll=Element.prototype.scrollIntoView;
beforeAll(()=>{if(!originalScroll)Element.prototype.scrollIntoView=jest.fn();});
afterAll(()=>{if(!originalScroll)delete Element.prototype.scrollIntoView;});

const cid='synthetic-guide-revision-client';
const results=[
  {step_id:'risk_rec:record:1',result:'Pass',reason:''},
  {step_id:'risk_rec:record:2',result:'Pass',reason:''},
  {step_id:'risk_rec:record:3',result:'N/A',reason:'SYNTHETIC: no treatment Actions exist for this fixture.'},
  {step_id:'risk_rec:record:4',result:'N/A',reason:'SYNTHETIC: no acceptance or closure decision is being made.'},
  {step_id:'risk_rec:record:5',result:'Pass',reason:''},
];
const support='SYNTHETIC completed-result record RISK-CYCLE-001 — checked by the fixture operator.';
let root,host,review,risk,onSaved,put,get,nativeGet,guideLoads;
const node=id=>document.querySelector(`[data-testid="${id}"]`);
const button=label=>[...document.querySelectorAll('button')].find(item=>item.textContent===label);
const guide=()=>document.querySelector('[aria-label="Review guide"]');
const readReview=async()=>(await api.get('/reviews/'+review.review_id)).data;
async function click(element){expect(element).toBeTruthy();expect(element.disabled).not.toBe(true);await act(async()=>element.click());}
async function input(element,value){expect(element).toBeTruthy();await act(async()=>{
  Object.getOwnPropertyDescriptor(element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(element,value);
  element.dispatchEvent(new Event('input',{bubbles:true}));
});}
async function render(record=review){
  const start=guideLoads.length;
  await act(async()=>root.render(<ReviewDrawer open record={record} clientId={record.client_id} onOpenChange={()=>{}} onSaved={onSaved}/>));
  await act(async()=>{await Promise.all(guideLoads.slice(start));});
}
async function saveProgress(label='Save checklist progress'){
  const start=put.mock.results.length;await click(button(label));
  expect(put.mock.results.length).toBeGreaterThan(start);
  await act(async()=>{await Promise.allSettled(put.mock.results.slice(start).map(result=>result.value));});
}
async function fill(values=results,reference=support){
  for(const value of values){
    const field=[...guide().querySelectorAll('fieldset')].find(item=>item.querySelector(`input[name="${value.step_id}"]`));
    expect(field).toBeTruthy();
    const label=value.result==='N/A'?'Not applicable':value.result;
    await click([...field.querySelectorAll('label')].find(item=>item.textContent.trim()===label)?.querySelector('input'));
    if(value.result!=='Pass')await input(field.querySelector('textarea'),value.reason);
  }
  await input([...guide().querySelectorAll('label')].find(item=>item.textContent.startsWith('Supporting result reference'))?.querySelector('textarea'),reference);
}
async function metadata(notes='SYNTHETIC own metadata — café Ω'){
  await input(node('field-due_date'),'2026-11-19');await input(node('field-notes'),notes);await click(node('drawer-save'));
}
function expectDraft(reference=support,values=results){
  expect([...guide().querySelectorAll('textarea')].at(-1).value).toBe(reference);
  for(const value of values){
    const field=[...guide().querySelectorAll('fieldset')].find(item=>item.querySelector(`input[name="${value.step_id}"]`));
    const label=value.result==='N/A'?'Not applicable':value.result;
    expect([...field.querySelectorAll('label')].find(item=>item.textContent.trim()===label)?.querySelector('input').checked).toBe(true);
    if(value.result!=='Pass')expect(field.querySelector('textarea').value).toBe(value.reason);
  }
}
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();
  const db=Object.fromEntries(Object.keys(ids).map(kind=>[kind,[]]));
  db.clients=[{client_id:cid,name:'SYNTHETIC General GRC client',status:'active'}];
  db.user={user_id:'synthetic-guide-revision-admin',name:'Synthetic operator',email:'operator@example.test',role:'platform_admin',status:'active',workspace_mode:'demo',client_ids:[cid]};
  db.users=[db.user];Object.assign(db,{logs:[],notifications:[],drafts:{},baselines:{}});saveStore(db,{resetFiles:true});
  mockAuth={user:(await api.post('/demo/enter')).data.user,workspaceMode:'demo',error:''};
  rememberClient(cid);window.history.replaceState({},'',`/reviews?client_id=${cid}`);
  const clients=(await api.get('/clients')).data;mockOrg={currentClientId:cid,currentClient:clients[0],clients,loading:false,error:''};
  risk=(await api.post('/risks',{client_id:cid,title:'SYNTHETIC Risk own-revision regression',source_type:'manual',category:'operational',review_cadence:'annual',next_review:'2027-11-19'})).data;
  review=(await api.post('/risks/'+risk.risk_id+'/review')).data.review;
  put=jest.spyOn(api,'put');
  guideLoads=[];nativeGet=api.get.bind(api);
  get=jest.spyOn(api,'get').mockImplementation((path,...args)=>{
    const response=nativeGet(path,...args);if(path.endsWith('/completion-guide'))guideLoads.push(response);return response;
  });
  onSaved=jest.fn();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.restoreAllMocks();jest.clearAllMocks();});

test('own Due/Unicode Notes save advances the five-check Risk guide without a reload or implicit completion',async()=>{
  const initial=(await api.get('/reviews/'+review.review_id+'/completion-guide')).data;
  expect(initial.steps.map(step=>step.step_id)).toEqual(results.map(result=>result.step_id));
  get.mockClear();const post=jest.spyOn(api,'post');await render();
  await metadata();const saved=await readReview();
  expect(saved.updated_at).not.toBe(initial.expected_updated_at);
  expect(saved.notes).toBe('SYNTHETIC own metadata — café Ω');
  expect((await api.get('/risks/'+risk.risk_id)).data.next_review.slice(0,10)).toBe('2026-11-19');
  await click(node('review-complete'));if(node('review-complete-confirmed'))await click(node('review-complete-confirmed'));
  expect(post.mock.calls.filter(([path])=>path.endsWith('/complete'))).toHaveLength(0);
  expect(toast.error).toHaveBeenCalledWith('Record a result for every checklist step');
  await fill();await saveProgress();
  expect(put.mock.calls[0][1]).toEqual({occurrence_id:review.current_occurrence_id,expected_updated_at:saved.updated_at,
    checklist:{contract_token:initial.contract_token,results},supporting_reference:support});
  expect(get.mock.calls.filter(([path])=>path.endsWith('/completion-guide'))).toHaveLength(1);
  expect((await readReview()).r4_current_checklist).toMatchObject({results,supporting_reference:support});expectDraft();
  expect(toast.error.mock.calls).toEqual([['Record a result for every checklist step']]);
});

test('own metadata acknowledgment retains unsaved checklist answers and their dirty baseline',async()=>{
  await render();await fill();await metadata();expectDraft();
  expect(document.querySelector('.review-workflow-feedback').textContent).toBe('Unsaved changes');
  const saved=await readReview();await saveProgress();
  expect(put.mock.calls[0][1].expected_updated_at).toBe(saved.updated_at);expectDraft();
  expect(document.querySelector('.review-workflow-feedback').textContent).toBe('No unsaved changes');
});

test.each([false,true])('Start acknowledgment advances the Guide after an optional preceding metadata save (%s)',async edited=>{
  await render();await fill();
  if(edited)await input(node('field-notes'),'SYNTHETIC Notes saved before Start');
  await click(button('In progress'));const started=await readReview();
  expect(started.status).toBe('in_progress');expectDraft();await saveProgress();
  expect(put.mock.calls[0][1].expected_updated_at).toBe(started.updated_at);
  expect((await readReview()).r4_current_checklist.results).toEqual(results);expect(toast.error).not.toHaveBeenCalled();
});

test('explicit uncertain metadata retry sends exact A and advances only its confirmed Guide version while retaining draft B',async()=>{
  await render();const patch=api.patch.bind(api);
  const calls=jest.spyOn(api,'patch').mockImplementationOnce(async(...args)=>{await patch(...args);throw new Error('SYNTHETIC metadata response was lost');});
  await metadata();expect(button('Retry unconfirmed save')).toBeTruthy();expect(put).not.toHaveBeenCalled();
  await fill();await click(button('Retry unconfirmed save'));expect(calls.mock.calls[1]).toEqual(calls.mock.calls[0]);expectDraft();
  const saved=await readReview();await saveProgress();
  expect(put.mock.calls[0][1].expected_updated_at).toBe(saved.updated_at);
  expect((await readReview()).r4_current_checklist.results).toEqual(results);
});

test('a later external revision still rejects the local checkpoint and preserves its complete draft',async()=>{
  await render();await metadata();const saved=await readReview();
  await api.patch('/reviews/'+review.review_id,{notes:'SYNTHETIC other editor',expected_occurrence_id:review.current_occurrence_id,expected_updated_at:saved.updated_at});
  const foreign=await readReview(),before=JSON.stringify(readStore());await fill();await saveProgress();
  expect(put.mock.calls[0][1].expected_updated_at).toBe(saved.updated_at);expectDraft();
  expect(JSON.stringify(readStore())).toBe(before);expect((await readReview()).updated_at).toBe(foreign.updated_at);
  expect((await readReview()).r4_current_checklist).toBeUndefined();expect(guide().querySelector('[role="alert"]')).toBeTruthy();
});

test('an unconfirmed checkpoint keeps its exact original request through a later own metadata acknowledgment',async()=>{
  await render();await fill();put.mockRejectedValueOnce(new Error('SYNTHETIC checkpoint did not receive a response'));
  await saveProgress();const original=put.mock.calls[0];
  await metadata();const saved=await readReview();await saveProgress('Retry unconfirmed checklist save');
  expect(put.mock.calls[1]).toEqual(original);expect(put.mock.calls[1][1].expected_updated_at).not.toBe(saved.updated_at);
  expect((await readReview()).r4_current_checklist).toBeUndefined();expectDraft();expect(guide().querySelector('[role="alert"]')).toBeTruthy();
});

test('an own metadata acknowledgment received during a pending checkpoint remains usable after its native CAS rejection',async()=>{
  await render();await fill();const initial=await readReview(),nativePut=put.getMockImplementation();let release;
  put.mockImplementationOnce((...args)=>new Promise((resolve,reject)=>{release=()=>nativePut(...args).then(resolve,reject);}));
  const saveButton=button('Save checklist progress');await click(saveButton);expect(release).toBeDefined();expect(put).toHaveBeenCalledTimes(1);
  expect(put.mock.calls[0][1].expected_updated_at).toBe(initial.updated_at??null);
  expect(saveButton.isConnected).toBe(true);expect(button('Saving…')).toBe(saveButton);expect(saveButton.disabled).toBe(true);
  await metadata('SYNTHETIC metadata wins while checkpoint A is pending — café Ω');
  const saved=await readReview();expect(saved.updated_at).not.toBe(initial.updated_at??null);expectDraft();
  let rejected;
  await act(async()=>{release();[rejected]=await Promise.allSettled([put.mock.results[0].value]);});
  expect(rejected.status).toBe('rejected');expect(rejected.reason.response.status).toBe(409);
  expect((await readReview()).r4_current_checklist).toBeUndefined();expectDraft();
  expect(button('Retry unconfirmed checklist save')).toBeUndefined();expect(button('Save checklist progress').disabled).toBe(false);
  await saveProgress();
  expect(put).toHaveBeenCalledTimes(2);expect(put.mock.calls[1][1]).toEqual({occurrence_id:review.current_occurrence_id,
    expected_updated_at:saved.updated_at,checklist:{contract_token:put.mock.calls[0][1].checklist.contract_token,results},supporting_reference:support});
  const completed=await readReview();expect(completed.notes).toBe(saved.notes);expect(completed.due_date).toBe(saved.due_date);
  expect(completed.r4_current_checklist).toMatchObject({results,supporting_reference:support});expectDraft();
  expect(get.mock.calls.filter(([path])=>path.endsWith('/completion-guide'))).toHaveLength(1);
});

test('a Guide already diverged from the metadata command revision is never rebased onto its acknowledgment',async()=>{
  const oldGuide=(await api.get('/reviews/'+review.review_id+'/completion-guide')).data;
  const newer=(await api.patch('/reviews/'+review.review_id,{notes:'SYNTHETIC earlier external save',
    expected_occurrence_id:review.current_occurrence_id,expected_updated_at:review.updated_at??null})).data;
  get.mockImplementation((path,...args)=>{
    const response=path.endsWith('/completion-guide')?Promise.resolve({data:oldGuide}):nativeGet(path,...args);
    if(path.endsWith('/completion-guide'))guideLoads.push(response);return response;
  });
  await render(newer);await metadata();const saved=await readReview();
  await fill();await saveProgress();
  expect(put.mock.calls[0][1].expected_updated_at).toBe(oldGuide.expected_updated_at);
  expect(put.mock.calls[0][1].expected_updated_at).not.toBe(saved.updated_at);
  expect((await readReview()).r4_current_checklist).toBeUndefined();expectDraft();expect(guide().querySelector('[role="alert"]')).toBeTruthy();
});

test.each(['client','record','occurrence'])('a mismatched %s metadata response cannot rebase the Guide or replace its owner',async field=>{
  await render();const old=await readReview(),data={...old,updated_at:'untrusted-response-revision'};
  data[{client:'client_id',record:'review_id',occurrence:'current_occurrence_id'}[field]]='different-owner';
  jest.spyOn(api,'patch').mockResolvedValueOnce({data});await metadata();expect(onSaved).not.toHaveBeenCalled();
  await fill();await saveProgress();
  expect(put.mock.calls[0][1].expected_updated_at).toBe(old.updated_at??null);expect((await readReview()).client_id).toBe(cid);
  expect(toast.error).toHaveBeenCalledWith('The saved Review identity or revision could not be confirmed. Reopen this Review before continuing.');
});

test.each(['actor','mode','client','unmount'])('a late own-save acknowledgment cannot reach a changed %s owner',async change=>{
  await render();let finish;const old=await readReview();jest.spyOn(api,'patch').mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  await input(node('field-notes'),'SYNTHETIC outgoing draft');await click(node('drawer-save'));
  if(change==='unmount')await act(async()=>root.render(<div>Closed owner</div>));
  else{
    if(change==='actor')mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'different-actor'}};
    if(change==='mode')mockAuth={...mockAuth,workspaceMode:'standard'};
    if(change==='client')mockOrg={...mockOrg,currentClientId:'different-client',currentClient:{client_id:'different-client'}};
    await render();
  }
  const replacementNotes=change==='unmount'?null:node('field-notes').value;
  await act(async()=>finish({data:{...old,notes:'SYNTHETIC outgoing draft',updated_at:'late-response-revision'}}));
  expect(onSaved).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();
  expect(await readReview()).toEqual(old);
  if(change==='unmount')expect(host.textContent).toBe('Closed owner');
  else expect(node('field-notes').value).toBe(replacementNotes);
});
