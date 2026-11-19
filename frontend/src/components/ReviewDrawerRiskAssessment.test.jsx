import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewDrawer from './ReviewDrawer';
import api from '@/lib/api';
import {ids,readStore,saveStore} from '@/preview/store';
import {rememberClient} from '@/lib/clientSelection';
import {reviewExecutions} from '@/lib/brawndoDemoReviews';
import {toast} from 'sonner';
import {currentReviewCompletion} from '@/testUtils/r4ReviewFixture';
import {riskTreatments} from '@/lib/brawndoRisks';

let mockAuth,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,
  default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),
  formatError:error=>error.response?.data?.detail||error.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('@/lib/recordUuid',()=>({recordUuid:()=>require('crypto').randomUUID()}));
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));

const clients=Object.fromEntries(['cis-ig1','iso-27001','soc-2'].map(key=>[key,`synthetic-qa005-${key}`]));
const node=id=>document.querySelector(`[data-testid="${id}"]`);
const button=label=>[...document.querySelectorAll('button')].find(value=>value.textContent===label);
let root,host,onOpenChange,activeReview,guideReads,basisReads;
const nativeScroll=Element.prototype.scrollIntoView;
beforeAll(()=>{if(!nativeScroll)Element.prototype.scrollIntoView=jest.fn();});
afterAll(()=>{if(!nativeScroll)delete Element.prototype.scrollIntoView;});
async function click(value){expect(value).toBeTruthy();expect(value.disabled).not.toBe(true);await act(async()=>value.click());}
async function input(value){const field=document.querySelector('[aria-label="Review assessment rationale"]');expect(field).toBeTruthy();await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,value);
  field.dispatchEvent(new Event('input',{bubbles:true}));
});}
async function choose(label,value){const shown=label==='Risk treatment'?(riskTreatments[value]||value):value;await click(document.querySelector(`[aria-label="${label}"]`));await click([...document.querySelectorAll('[role="option"]')].find(option=>option.textContent===shown));}
const riskRow=async risk=>(await api.get('/risks/'+risk.risk_id)).data;
const reviewRow=async review=>(await api.get('/reviews/'+review.review_id)).data;
const riskHistory=async risk=>(await api.get('/risks/'+risk.risk_id+'/review-history')).data;
async function fixture(framework='iso-27001',overrides={}){
  const clientId=clients[framework];rememberClient(clientId);window.history.replaceState({},'',`/reviews?client_id=${clientId}`);
  const authorized=(await api.get('/clients')).data;
  mockOrg={currentClientId:clientId,currentClient:authorized.find(row=>row.client_id===clientId),clients:authorized,loading:false,error:''};
  // Matches native NewRiskDialog: the manual creation payload has no rationale.
  const risk=(await api.post('/risks',{client_id:clientId,title:'QA005 manual Risk',category:'cybersecurity',description:'Disposable native command regression',
    likelihood_score:3,impact_score:2,owner_id:mockAuth.user.user_id,treatment:'',review_cadence:'annual',next_review:'2099-10-27',...overrides})).data;
  const review=(await api.post('/risks/'+risk.risk_id+'/review')).data.review;
  return {risk,review,framework};
}
async function renderReview({review},props={}){
  activeReview=review;const start=guideReads.length,basisStart=basisReads.length;
  await act(async()=>root.render(<ReviewDrawer open record={review} clientId={review.client_id} reviewsPilot onOpenChange={onOpenChange} {...props}/>));
  const current=!mockOrg.loading&&!mockOrg.error&&mockOrg.currentClientId===review.client_id&&mockOrg.currentClient?.client_id===review.client_id;
  await act(async()=>{await Promise.all([...guideReads.slice(start),...(current?basisReads.slice(basisStart):[])].map(read=>read.response));});
}
const riskStepIds=[1,2,3,4,5].map(number=>`risk_rec:record:${number}`);
const riskCompletion=review=>currentReviewCompletion(api,review.review_id,{
  expectedOccurrenceId:review.current_occurrence_id,
  supportingReference:`SYNTHETIC Risk input-preservation run ${review.review_id}/${review.current_occurrence_id}: current scheduled next date inspected; no new approval, closure or treatment-performance attestation.`,
  resultForStep:(step,{review:current})=>{
    const unperformed={
      'risk_rec:record:1':'SYNTHETIC input-preservation fixture does not assess business relevance or Risk description accuracy.',
      'risk_rec:record:2':'SYNTHETIC fixture exercises explicit field input and retention; it does not attest a substantive likelihood/impact reassessment.',
      'risk_rec:record:3':'SYNTHETIC fixture does not perform treatment Action progress checks.',
      'risk_rec:record:4':'SYNTHETIC fixture makes no new acceptance or closure decision; existing decision metadata is retained.',
    };
    if(step.step_id==='risk_rec:record:5'){expect(current.next_review_date).toBeTruthy();return {step_id:step.step_id,result:'Pass',reason:''};}
    if(!Object.hasOwn(unperformed,step.step_id))throw new Error('Unexpected Risk preservation fixture step '+step.step_id);
    return {step_id:step.step_id,result:'N/A',reason:unperformed[step.step_id]};
  },
});
async function complete(framework){
  expect(Object.keys(clients)).toContain(framework);
  const body=await riskCompletion(activeReview),guide=document.querySelector('[aria-label="Review guide"]');
  expect(body.checklist.results.map(result=>result.step_id)).toEqual(riskStepIds);expect(guide).toBeTruthy();
  for(const result of body.checklist.results){
    const field=[...guide.querySelectorAll('fieldset')].find(value=>value.querySelector(`input[name="${result.step_id}"]`));
    expect(field).toBeTruthy();
    const label=result.result==='N/A'?'Not applicable':result.result;
    await click([...field.querySelectorAll('label')].find(value=>value.textContent.trim()===label)?.querySelector('input'));
    if(result.reason)await act(async()=>{const reason=field.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(reason,result.reason);reason.dispatchEvent(new Event('input',{bubbles:true}));});
  }
  await act(async()=>{const reference=[...guide.querySelectorAll('label')].find(value=>value.textContent.startsWith('Supporting result reference')).querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(reference,body.supporting_reference);reference.dispatchEvent(new Event('input',{bubbles:true}));});
  const post=jest.spyOn(api,'post'),start=post.mock.results.length;
  await click(node('review-complete'));expect(node('review-complete-confirm')).toBeTruthy();expect(post.mock.calls.slice(start)).toEqual([]);await click(node('review-complete-confirmed'));
  expect(post.mock.calls.slice(start).filter(([path])=>path===`/reviews/${activeReview.review_id}/complete`)).toHaveLength(1);
  await act(async()=>{await Promise.allSettled(post.mock.results.slice(start).map(result=>result.value));});
}
function completion(post,review){return post.mock.calls.find(([path])=>path===`/reviews/${review.review_id}/complete`)?.[1];}
function expectUnchanged(before,after){
  for(const key of ['risk_id','client_id','display_id','created_at','created_by','date_identified','owner_id','status','likelihood_score','impact_score','risk_score','risk_level'])expect(after[key]).toEqual(before[key]);
  for(const key of ['treatment','assessment_rationale','acceptance_date','accepted_by','acceptance_rationale','acceptance_expires_at'])expect(after[key]??null).toEqual(before[key]??null);
}

beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  // Isolated unit fixture: real Preview commands, without unrelated seed/history.
  const db=Object.fromEntries(Object.keys(ids).map(kind=>[kind,[]]));
  db.clients=Object.entries(clients).map(([key,client_id])=>({client_id,name:'Synthetic '+key,status:'active',framework_settings:key==='soc-2'?{'soc-2':{categories:['security']}}:{}}));
  db.requirements=Object.entries(clients).map(([baseline_key,client_id])=>({requirement_id:client_id+'-enrollment',client_id,baseline_key,baseline_response:'applies'}));
  db.user={user_id:'synthetic-qa005-admin',name:'Synthetic reviewer',email:'reviewer@example.test',role:'platform_admin',status:'active',workspace_mode:'demo',client_ids:Object.values(clients)};
  db.users=[{...db.user}];Object.assign(db,{logs:[],notifications:[],drafts:{},baselines:{}});saveStore(db,{resetFiles:true});
  mockAuth={user:(await api.post('/demo/enter')).data.user,workspaceMode:'demo',loading:false,error:''};
  guideReads=[];basisReads=[];activeReview=null;const get=api.get.bind(api);
  jest.spyOn(api,'get').mockImplementation((path,...args)=>{
    const response=get(path,...args),params=args[0]?.params;
    if(path.endsWith('/completion-guide'))guideReads.push({path,response});
    if(activeReview&&(path===`/reviews/${activeReview.review_id}/history`||path===`/reviews/${activeReview.review_id}/activity`
      ||['/related','/comments'].includes(path)&&params?.entity_type==='reviews'&&params.entity_id===activeReview.review_id))basisReads.push({path,response});
    return response;
  });
  onOpenChange=jest.fn();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.restoreAllMocks();jest.clearAllMocks();});

test.each(['iso-27001','soc-2','cis-ig1'])('untouched manual %s Risk completes as No Change without implicit treatment or rationale writes',async framework=>{
  const target=await fixture(framework);expect(target.risk).not.toHaveProperty('assessment_rationale');
  const post=jest.spyOn(api,'post');await renderReview(target);await complete(framework);
  const history=await riskHistory(target.risk);
  // Before the correction this exact native Preview path reported Assessment Updated.
  expect(history[0].outcome).toBe('Reviewed — No Change');
  expect(completion(post,target.review)).toMatchObject({occurrence_id:target.review.current_occurrence_id,risk_outcome:'Reviewed — No Change'});
  expect(completion(post,target.review).risk_assessment).toEqual({});
  const after=await riskRow(target.risk);expectUnchanged(target.risk,after);
  expect(after.treatment).toBe('');expect(after.last_reviewed).toBe(history[0].completed_at);
  expect(after.next_review.slice(0,10)).toBe('2100-10-27');
  expect(history[0].risk_after).toEqual(history[0].risk_before);
  expect(post.mock.calls.filter(([path])=>path.endsWith('/complete'))).toHaveLength(1);
  expect(post.mock.calls.some(([path])=>path.endsWith('/accept')||path.endsWith('/close'))).toBe(false);
});

test.each([['missing',{treatment:undefined}], ['null',{treatment:null,assessment_rationale:null}], ['blank',{treatment:'',assessment_rationale:''}]])('an undecided legacy treatment is labeled honestly and remains untouched (%s)',async(label,fields)=>{
  const target=await fixture('iso-27001',fields),post=jest.spyOn(api,'post');await renderReview(target);
  expect(document.querySelector('[aria-label="Risk treatment"]').textContent).toBe('Not Yet Decided');
  await complete(target.framework);expect(completion(post,target.review).risk_assessment).toEqual({});
  expectUnchanged(target.risk,await riskRow(target.risk));expect((await riskHistory(target.risk))[0].outcome).toBe('Reviewed — No Change');
});

test('saved legacy Monitor remains a decision and is not replaced on No Change',async()=>{
  const target=await fixture('iso-27001',{treatment:'monitor'}),post=jest.spyOn(api,'post');await renderReview(target);
  expect(document.querySelector('[aria-label="Risk treatment"]').textContent).toBe('Monitoring (legacy treatment)');
  await complete(target.framework);expect(completion(post,target.review).risk_assessment).toEqual({});
  expect((await riskRow(target.risk)).treatment).toBe('monitor');expect((await riskHistory(target.risk))[0].outcome).toBe('Reviewed — No Change');
});

test('unchanged accepted Risk metadata is preserved without an acceptance command',async()=>{
  const target=await fixture();await api.post('/risks/'+target.risk.risk_id+'/accept',{rationale:'Synthetic retained acceptance',expiry_date:'2099-12-31'});
  target.risk=await riskRow(target.risk);target.review=await reviewRow(target.review);
  const post=jest.spyOn(api,'post');await renderReview(target);await complete(target.framework);
  expect(completion(post,target.review).risk_assessment).toEqual({});expectUnchanged(target.risk,await riskRow(target.risk));
  expect(post.mock.calls.some(([path])=>path.endsWith('/accept'))).toBe(false);
});

test.each([['treatment','mitigate','Treatment Updated'],['likelihood_score',4,'Assessment Updated'],['assessment_rationale','Explicit human reassessment','Assessment Updated']])('only the explicitly edited %s is submitted and its true outcome is retained',async(key,value,outcome)=>{
  const target=await fixture(),post=jest.spyOn(api,'post');await renderReview(target);
  if(key==='assessment_rationale')await input(value);else await choose(key==='treatment'?'Risk treatment':'Risk likelihood',String(value));
  await complete(target.framework);expect(completion(post,target.review).risk_assessment).toEqual({[key]:value});
  const after=await riskRow(target.risk);expect(after[key]).toBe(value);expect((await riskHistory(target.risk))[0].outcome).toBe(outcome);
  for(const field of ['created_at','created_by','date_identified','owner_id'])expect(after[field]).toEqual(target.risk[field]);
  expect(after.risk_score).toBe(key==='likelihood_score'?8:6);
});

test.each([['treatment','','Treatment Updated'],['likelihood_score',null,'Assessment Updated'],['assessment_rationale','','Assessment Updated']])('explicitly clearing saved %s is retained as an intentional edit',async(key,value,outcome)=>{
  const target=await fixture('iso-27001',{treatment:'monitor',assessment_rationale:'Existing assessment'}),post=jest.spyOn(api,'post');await renderReview(target);
  if(key==='assessment_rationale')await input('');else await choose(key==='treatment'?'Risk treatment':'Risk likelihood',key==='treatment'?'Not Yet Decided':'Select…');
  await complete(target.framework);expect(completion(post,target.review).risk_assessment).toEqual({[key]:value});
  const after=await riskRow(target.risk);expect(after[key]).toBe(value);expect((await riskHistory(target.risk))[0].outcome).toBe(outcome);
  for(const field of ['treatment','assessment_rationale','likelihood_score','impact_score','created_at','created_by','date_identified','owner_id'])if(field!==key)expect(after[field]).toEqual(target.risk[field]);
  expect(after.risk_score).toBe(key==='likelihood_score'?null:6);
});

test('reverting draft choices to their loaded values sends no implicit reassessment',async()=>{
  const target=await fixture(),post=jest.spyOn(api,'post');await renderReview(target);
  await choose('Risk treatment','mitigate');await choose('Risk treatment','Not Yet Decided');
  await choose('Risk likelihood','4');await choose('Risk likelihood','3');await input('Temporary rationale');await input('');
  await complete(target.framework);expect(completion(post,target.review).risk_assessment).toEqual({});
  expect((await riskHistory(target.risk))[0].outcome).toBe('Reviewed — No Change');expectUnchanged(target.risk,await riskRow(target.risk));
});

test('cancelling a reassessment draft keeps the saved Risk and occurrence untouched',async()=>{
  const target=await fixture(),post=jest.spyOn(api,'post');await renderReview(target);await input('Unsaved rationale');
  await click(button('Close'));expect(document.body.textContent).toContain('Leave unsaved changes?');
  await click(button('Keep editing'));expect(document.querySelector('[aria-label="Review assessment rationale"]').value).toBe('Unsaved rationale');
  await click(button('Close'));await click(button('Discard changes'));expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(post).not.toHaveBeenCalled();expectUnchanged(target.risk,await riskRow(target.risk));expect(await riskHistory(target.risk)).toHaveLength(0);
});

test('a rejected completion retains the draft and retries the same occurrence only once successfully',async()=>{
  const target=await fixture();await renderReview(target);await input('Retained after rejected completion');
  const post=jest.spyOn(api,'post');post.mockRejectedValueOnce(Object.assign(new Error('Synthetic conflict'),{response:{status:409}}));
  await complete(target.framework);expect(toast.error).toHaveBeenCalled();expect(await riskHistory(target.risk)).toHaveLength(0);
  expect(document.querySelector('[aria-label="Review assessment rationale"]').value).toBe('Retained after rejected completion');
  await complete(target.framework);const history=await riskHistory(target.risk);expect(history).toHaveLength(1);
  expect(history[0].outcome).toBe('Assessment Updated');expect(history[0].occurrence_id).toBe(target.review.current_occurrence_id);
  const body=completion(post,target.review),replay=(await api.post('/reviews/'+target.review.review_id+'/complete',body)).data;
  expect(replay.occurrence).toEqual(history[0]);expect(await riskHistory(target.risk)).toHaveLength(1);
});

test('a retained completed occurrence stays frozen without mutating history',async()=>{
  const target=await fixture();await renderReview(target);await complete(target.framework);
  const occurrence=(await riskHistory(target.risk))[0],post=jest.spyOn(api,'post');post.mockClear();
  await renderReview(target,{initialValues:{occurrence}});
  expect(node('review-complete')).toBeNull();expect(document.querySelector('[aria-label="Risk treatment"]')).toBeNull();
  expect(await riskHistory(target.risk)).toEqual([occurrence]);expect(post).not.toHaveBeenCalled();
});

test('late authorized CIS context reloads saved Risk details and history without changing the native occurrence',async()=>{
  const target=await fixture('cis-ig1',{assessment_rationale:'Retained native assessment',treatment:'monitor'});
  const completed=(await api.post('/reviews/'+target.review.review_id+'/complete',{...await riskCompletion(target.review),risk_assessment:{},risk_outcome:'Reviewed — No Change'})).data;
  target.review=completed.review;target.risk=await riskRow(target.risk);
  const authorized=mockOrg,post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
  const beforeUnavailable=await riskRow(target.risk);
  mockOrg={...authorized,currentClient:null,loading:true};await renderReview(target);
  expect(document.querySelector('[aria-label="Review assessment rationale"]')).toBeNull();
  expect(document.body.textContent).not.toContain('Retained native assessment');
  expect(await riskRow(target.risk)).toEqual(beforeUnavailable);expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
  mockOrg=authorized;await renderReview(target);
  expect(document.querySelector('[aria-label="Review assessment rationale"]')).toBeTruthy();
  expect(document.querySelector('[aria-label="Review assessment rationale"]').value).toBe('Retained native assessment');
  expect(document.querySelector('[aria-label="Risk treatment"]').textContent).toBe('Monitoring (legacy treatment)');
  expect(document.body.textContent).toContain('Reviewed — No Change');expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
  await complete(target.framework);expect(completion(post,target.review).risk_assessment).toEqual({});
  expectUnchanged(target.risk,await riskRow(target.risk));expect(await riskHistory(target.risk)).toHaveLength(2);
});

test('late scope resolution loads current Risk information and ignores the prior in-flight related response',async()=>{
  const target=await fixture('cis-ig1',{assessment_rationale:'Old saved assessment',treatment:'monitor'}),authorized=mockOrg;
  const originalGet=api.get.getMockImplementation(),pendingOld=[],currentReads=[];let phase='old';
  jest.spyOn(api,'get').mockImplementation(async(path,options)=>{
    const responsePromise=originalGet(path,options);if(phase==='current')currentReads.push({path,response:responsePromise});
    const response=await responsePromise;
    if(path==='/related'&&phase==='old')return new Promise(resolve=>pendingOld.push(()=>resolve(response)));
    return response;
  });
  mockOrg={...authorized,currentClient:null,loading:true};await renderReview(target);expect(pendingOld.length).toBeGreaterThan(0);
  target.risk=(await api.patch('/risks/'+target.risk.risk_id,{assessment_rationale:'Current saved assessment',expected_updated_at:target.risk.updated_at??null})).data;
  const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');phase='current';mockOrg=authorized;await renderReview(target);
  expect(currentReads.some(read=>read.path==='/related')).toBe(true);
  await act(async()=>{await Promise.all(currentReads.map(read=>read.response));});
  expect(document.querySelector('[aria-label="Review assessment rationale"]')).toBeTruthy();
  expect(document.querySelector('[aria-label="Review assessment rationale"]').value).toBe('Current saved assessment');
  await act(async()=>{for(const resolve of pendingOld.splice(0))resolve();});
  expect(document.querySelector('[aria-label="Review assessment rationale"]').value).toBe('Current saved assessment');
  expect(document.querySelector('[aria-label="Risk treatment"]').textContent).toBe('Monitoring (legacy treatment)');
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
  await complete(target.framework);expect(completion(post,target.review).risk_assessment).toEqual({});
  expectUnchanged(target.risk,await riskRow(target.risk));expect((await riskHistory(target.risk))[0].outcome).toBe('Reviewed — No Change');
});

test('older native members and Policies receipts cannot publish after current client scope is denied',async()=>{
  const owner=await fixture('cis-ig1'),cid=owner.review.client_id;
  const policy=(await api.post('/policies',{client_id:cid,title:'SYNTHETIC private old-scope policy',status:'draft',presence:'needs_confirmation',version:'1'})).data;
  const review=(await api.post('/reviews',{client_id:cid,title:'SYNTHETIC scope-guard Review',review_type:'policy',policy_id:policy.policy_id,
    owner_id:mockAuth.user.user_id,recurrence:'annual',due_date:'2099-10-27'})).data;
  const target={review,framework:'cis-ig1'},get=api.get.getMockImplementation(),held=[],denied=[];let phase='initial';
  jest.spyOn(api,'get').mockImplementation((path,options)=>{
    const ownerPhase=phase,response=get(path,options);
    const adjacent=path===`/clients/${cid}/members`?'members':path==='/policies'&&options?.params?.client_id===cid?'policies':null;
    if(ownerPhase==='denied'){denied.push({path,adjacent,response});return response;}
    if(!adjacent)return response;
    return response.then(value=>new Promise(resolve=>held.push({name:adjacent,value,release:()=>resolve(value)})));
  });
  await renderReview(target);expect(held.map(read=>read.name).sort()).toEqual(['members','policies']);
  expect(held.find(read=>read.name==='members').value.data).toContainEqual(expect.objectContaining({user_id:mockAuth.user.user_id,name:mockAuth.user.name}));
  expect(held.find(read=>read.name==='policies').value.data).toContainEqual(expect.objectContaining({policy_id:policy.policy_id,title:policy.title}));
  const draft='SYNTHETIC unsaved metadata retained through read-scope withdrawal';
  await act(async()=>{const notes=node('field-notes');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(notes,draft);notes.dispatchEvent(new Event('input',{bubbles:true}));});
  const db=readStore();db.user.client_ids=[];db.user.all_clients=false;
  db.users=db.users.map(user=>user.user_id===db.user.user_id?{...user,client_ids:[],all_clients:false}:user);saveStore(db);
  mockAuth={...mockAuth,user:{...db.user}};phase='denied';
  const permitted=(await api.get('/clients')).data;expect(permitted).toEqual([]);
  mockOrg={...mockOrg,currentClient:null,clients:permitted,loading:false,error:'SYNTHETIC current client is outside the authorized scope'};
  const before=JSON.stringify(readStore()),post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
  await renderReview(target);
  expect(denied.filter(read=>read.adjacent).map(read=>read.adjacent)).toEqual(['members','policies']);
  let failures;
  await act(async()=>{failures=await Promise.allSettled(denied.filter(read=>read.adjacent).map(read=>read.response));});
  expect(failures.map(result=>[result.status,result.reason?.response?.status])).toEqual([['rejected',403],['rejected',403]]);
  const errors=toast.error.mock.calls.length;
  await act(async()=>{held.forEach(read=>read.release());});
  expect(node('field-owner_id')).toBeTruthy();expect(node('field-owner_id').textContent).not.toContain(mockAuth.user.name);
  expect(node('field-notes').value).toBe(draft);
  await click(node('tab-requirements'));expect(node('reviews-drawer').textContent).not.toContain(policy.title);
  expect(toast.error).toHaveBeenCalledTimes(errors);expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
  expect(JSON.stringify(readStore())).toBe(before);
});

test('a captured Activity reload cannot dispatch after its native grant owner changes',async()=>{
  const target=await fixture('cis-ig1');await renderReview(target);
  const draft='SYNTHETIC draft retained across a queued old Activity reload';
  await act(async()=>{const notes=node('field-notes');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(notes,draft);notes.dispatchEvent(new Event('input',{bubbles:true}));});
  const interval=window.setInterval.bind(window),callbacks=[];
  jest.spyOn(window,'setInterval').mockImplementation((callback,...args)=>{if(args[0]===10000)callbacks.push(callback);return interval(callback,...args);});
  const activityStart=basisReads.length;await click(node('tab-activity'));
  await act(async()=>{await Promise.all(basisReads.slice(activityStart).map(read=>read.response));});
  expect(callbacks).toHaveLength(1);const oldReload=callbacks[0];expect(typeof oldReload).toBe('function');
  const db=readStore();db.user.all_clients=true;
  db.users=db.users.map(user=>user.user_id===db.user.user_id?{...user,all_clients:true}:user);saveStore(db);
  mockAuth={...mockAuth,user:{...db.user}};
  const currentStart=basisReads.length;await renderReview(target);
  expect(basisReads.slice(currentStart).map(read=>read.path)).toEqual([`/reviews/${target.review.review_id}/history`,'/related','/comments',`/reviews/${target.review.review_id}/activity`]);
  expect(callbacks).toHaveLength(2);expect(callbacks[1]).not.toBe(oldReload);
  const before=JSON.stringify(readStore()),getCount=api.get.mock.calls.length,post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');let result;
  // Invoke the real callback captured from the native interval; do not advance a clock.
  await act(async()=>{result=await oldReload();});
  expect(result).toEqual({ok:false});expect(api.get).toHaveBeenCalledTimes(getCount);
  await click(node('tab-overview'));expect(node('field-notes').value).toBe(draft);
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();expect(JSON.stringify(readStore())).toBe(before);
});

test('an older A related reply cannot replace fresh Risk facts after an A to B to A client-read round trip',async()=>{
  const original='SYNTHETIC old A native Risk rationale',fresh='SYNTHETIC current native Risk rationale after the round trip';
  const target=await fixture('cis-ig1',{assessment_rationale:original});await renderReview(target);
  const authorized=mockOrg,draft='SYNTHETIC metadata draft retained across the read-owner round trip';
  await act(async()=>{const notes=node('field-notes');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(notes,draft);notes.dispatchEvent(new Event('input',{bubbles:true}));});
  const get=api.get.getMockImplementation();let holdNext=true,release,captured,oldRequest;
  jest.spyOn(api,'get').mockImplementation((path,options)=>{
    const response=get(path,options);
    if(holdNext&&path==='/related'&&options?.params?.entity_type==='reviews'&&options.params.entity_id===target.review.review_id){
      holdNext=false;oldRequest=response.then(value=>{captured=value;return new Promise(resolve=>{release=()=>resolve(value);});});return oldRequest;
    }
    return response;
  });
  const oldStart=basisReads.length;await click(node('tab-activity'));
  await act(async()=>{await Promise.all(basisReads.slice(oldStart).map(read=>read.response));});
  expect(release).toBeDefined();expect(captured.data.risks.find(risk=>risk.risk_id===target.risk.risk_id).assessment_rationale).toBe(original);
  // The opener Review and native generation stay unchanged; only its current
  // client-read owner leaves A for unavailable B and then returns to exact A.
  const unavailableStart=basisReads.length;mockOrg={...authorized,loading:true};await renderReview(target);
  await act(async()=>{await Promise.all(basisReads.slice(unavailableStart).map(read=>read.response));});
  target.risk=(await api.patch('/risks/'+target.risk.risk_id,{assessment_rationale:fresh,expected_updated_at:target.risk.updated_at??null})).data;
  const currentStart=basisReads.length;mockOrg=authorized;await renderReview(target);
  expect(basisReads.slice(currentStart).map(read=>read.path)).toEqual([`/reviews/${target.review.review_id}/history`,'/related','/comments',`/reviews/${target.review.review_id}/activity`]);
  await click(node('tab-overview'));expect(document.querySelector('[aria-label="Review assessment rationale"]').value).toBe(fresh);
  expect(node('field-notes').value).toBe(draft);
  const before=JSON.stringify(readStore()),post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
  await act(async()=>{release();await oldRequest;});
  expect(document.querySelector('[aria-label="Review assessment rationale"]').value).toBe(fresh);expect(node('field-notes').value).toBe(draft);
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();expect(JSON.stringify(readStore())).toBe(before);
  expect(await riskRow(target.risk)).toEqual(target.risk);
});

const historicalSummary=()=>[...document.querySelectorAll('.review-workflow-body > p.text-sm')].find(value=>value.textContent.startsWith('Completed ')||value.textContent==='Cancelled');
async function closedRiskReview(){
  const target=await fixture('cis-ig1');await api.post('/risks/'+target.risk.risk_id+'/close',{reason:'remediated'});
  target.risk=await riskRow(target.risk);target.review=await reviewRow(target.review);
  expect(target.risk.status).toBe('closed');expect(target.review.status).toBe('cancelled');return target;
}
function expectFrozenReview(){
  expect(node('review-complete')).toBeNull();expect(node('review-start')).toBeNull();expect(node('drawer-save')).toBeNull();
  expect(document.querySelector('[aria-label="Review recommendation"]')).toBeNull();
  expect(document.querySelector('[aria-label="Review assessment rationale"]').disabled).toBe(true);
}

test.each(['recorded cancellation','missing cancellation metadata'])('a cancelled native Risk Review history entry never claims completion (%s)',async mode=>{
  const target=await closedRiskReview(),execution=reviewExecutions([target.review])[0].execution;
  expect(execution.status).toBe('cancelled');expect(execution.completed_at).toBeUndefined();
  // Retained rows may lack cancellation metadata or still carry unrelated old completion fields.
  const occurrence=mode==='recorded cancellation'?execution:{...execution,cancelled_at:undefined,cancelled_by:undefined,completed_at:'2025-01-01T00:00:00Z',completed_by_name:'Unrelated completion actor',outcome:'Old completion outcome'};
  const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');await renderReview(target,{initialValues:{occurrence}});
  expect(historicalSummary()?.textContent).toBe('Cancelled');expect(document.body.textContent).not.toContain('Legacy completion');
  expect(document.body.textContent).not.toContain('Completed — by Unassigned');expectFrozenReview();
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
  expect(await reviewRow(target.review)).toEqual(target.review);expect(await riskRow(target.risk)).toEqual(target.risk);
});

test('a current cancelled native Risk Review remains frozen without a completion summary or writes',async()=>{
  const target=await closedRiskReview(),post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');await renderReview(target);
  expect(historicalSummary()).toBeUndefined();expect(document.body.textContent).not.toContain('Legacy completion');expectFrozenReview();
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();expect(await reviewRow(target.review)).toEqual(target.review);
});

test('a genuinely completed native occurrence retains its recorded date, actor and outcome',async()=>{
  const target=await fixture('cis-ig1'),done=(await api.post('/reviews/'+target.review.review_id+'/complete',{...await riskCompletion(target.review),risk_assessment:{},risk_outcome:'Reviewed — No Change'})).data;
  target.review=done.review;const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');await renderReview(target,{initialValues:{occurrence:done.occurrence}});
  const day=new Date(done.occurrence.completed_at.slice(0,10)+'T00:00:00').toLocaleDateString();
  expect(done.occurrence.checklist_outcome).toBe('No exceptions noted');
  expect(historicalSummary().textContent).toBe(`Completed ${day} by ${done.occurrence.completed_by_name} · No exceptions noted`);
  expect(done.occurrence.outcome).toBe('Reviewed — No Change');
  expect((await riskHistory(target.risk))[0]).toMatchObject({occurrence_id:done.occurrence.occurrence_id,outcome:'Reviewed — No Change',checklist_outcome:'No exceptions noted'});
  const reassessment=[...document.querySelectorAll('section')].find(section=>section.querySelector('h3')?.textContent==='Risk reassessment');
  expect(reassessment).toBeTruthy();expect(reassessment.textContent).toContain('Reviewed — No Change');
  expect(node('review-complete')).toBeNull();expect(node('drawer-save')).toBeNull();expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
});

test('retained legacy completed history still reports its original actor and Legacy completion wording',async()=>{
  const target=await fixture('cis-ig1'),db=readStore(),legacyId='synthetic-qa007-legacy-completed';
  db.users.push({user_id:'retained-qa007-actor',name:'Retained legacy actor',role:'client_contributor',status:'active',client_ids:[target.review.client_id]});
  db.reviews.push({review_id:legacyId,client_id:target.review.client_id,title:'Retained legacy Review',review_type:'access',status:'completed',recurrence:'none',due_date:'2025-01-01',completion_date:'2025-01-02T12:00:00Z',completion_snapshot:{by:'retained-qa007-actor'}});saveStore(db);
  const review=(await api.get('/reviews/'+legacyId)).data,occurrence=(await api.get('/reviews/'+legacyId+'/history')).data[0];expect(occurrence.legacy).toBe(true);
  const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');await renderReview({review},{initialValues:{occurrence}});
  const day=new Date(occurrence.completed_at.slice(0,10)+'T00:00:00').toLocaleDateString();
  expect(historicalSummary().textContent).toBe(`Completed ${day} by Retained legacy actor · Legacy completion`);
  expect(node('review-complete')).toBeNull();expect(node('drawer-save')).toBeNull();expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
});
