import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewDrawer from './ReviewDrawer';
import api from '@/lib/api';
import {ids,readStore,saveStore} from '@/preview/store';
import {rememberClient} from '@/lib/clientSelection';
import {reviewExecutions} from '@/lib/brawndoDemoReviews';
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

const clients=Object.fromEntries(['cis-ig1','iso-27001','soc-2'].map(key=>[key,`synthetic-qa005-${key}`]));
const node=id=>document.querySelector(`[data-testid="${id}"]`);
const button=label=>[...document.querySelectorAll('button')].find(value=>value.textContent===label);
let root,host,onOpenChange;
const nativeScroll=Element.prototype.scrollIntoView;
beforeAll(()=>{if(!nativeScroll)Element.prototype.scrollIntoView=jest.fn();});
afterAll(()=>{if(!nativeScroll)delete Element.prototype.scrollIntoView;});
async function click(value){expect(value).toBeTruthy();expect(value.disabled).not.toBe(true);await act(async()=>value.click());}
async function input(value){const field=document.querySelector('[aria-label="Review assessment rationale"]');expect(field).toBeTruthy();await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,value);
  field.dispatchEvent(new Event('input',{bubbles:true}));
});}
async function choose(label,value){await click(document.querySelector(`[aria-label="${label}"]`));await click([...document.querySelectorAll('[role="option"]')].find(option=>option.textContent===value));}
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
async function renderReview({review},props={}){await act(async()=>root.render(<ReviewDrawer open record={review} clientId={review.client_id} reviewsPilot onOpenChange={onOpenChange} {...props}/>));}
async function complete(framework){await click(node('review-complete'));
  if(framework==='cis-ig1'){expect(node('review-complete-confirm')).toBeTruthy();await click(node('review-complete-confirmed'));}
  else expect(node('review-complete-confirm')).toBeNull();
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
  expect(document.querySelector('[aria-label="Risk treatment"]').textContent).toBe('monitor');
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
  const completed=(await api.post('/reviews/'+target.review.review_id+'/complete',{occurrence_id:target.review.current_occurrence_id,risk_assessment:{},risk_outcome:'Reviewed — No Change'})).data;
  target.review=completed.review;target.risk=await riskRow(target.risk);
  const authorized=mockOrg,post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
  mockOrg={...authorized,currentClient:null,loading:true};await renderReview(target);
  expect(document.querySelector('[aria-label="Review assessment rationale"]').value).toBe('Retained native assessment');
  mockOrg=authorized;await renderReview(target);
  expect(document.querySelector('[aria-label="Review assessment rationale"]')).toBeTruthy();
  expect(document.querySelector('[aria-label="Review assessment rationale"]').value).toBe('Retained native assessment');
  expect(document.querySelector('[aria-label="Risk treatment"]').textContent).toBe('Monitoring (legacy treatment)');
  expect(document.body.textContent).toContain('Reviewed — No Change');expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
  await click(node('review-complete'));expect(node('review-complete-confirm')).toBeTruthy();expect(post).not.toHaveBeenCalled();
  await click(node('review-complete-confirmed'));expect(completion(post,target.review).risk_assessment).toEqual({});
  expectUnchanged(target.risk,await riskRow(target.risk));expect(await riskHistory(target.risk)).toHaveLength(2);
});

test('late scope resolution loads current Risk information and ignores the prior in-flight related response',async()=>{
  const target=await fixture('cis-ig1',{assessment_rationale:'Old saved assessment',treatment:'monitor'}),authorized=mockOrg;
  const originalGet=api.get.bind(api),pendingOld=[];let phase='old';
  jest.spyOn(api,'get').mockImplementation(async(path,options)=>{
    const response=await originalGet(path,options);
    if(path==='/related'&&phase==='old')return new Promise(resolve=>pendingOld.push(()=>resolve(response)));
    return response;
  });
  mockOrg={...authorized,currentClient:null,loading:true};await renderReview(target);expect(pendingOld.length).toBeGreaterThan(0);
  target.risk=(await api.patch('/risks/'+target.risk.risk_id,{assessment_rationale:'Current saved assessment',expected_updated_at:target.risk.updated_at??null})).data;
  const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');phase='current';mockOrg=authorized;await renderReview(target);
  expect(document.querySelector('[aria-label="Review assessment rationale"]')).toBeTruthy();
  expect(document.querySelector('[aria-label="Review assessment rationale"]').value).toBe('Current saved assessment');
  await act(async()=>{for(const resolve of pendingOld.splice(0))resolve();});
  expect(document.querySelector('[aria-label="Review assessment rationale"]').value).toBe('Current saved assessment');
  expect(document.querySelector('[aria-label="Risk treatment"]').textContent).toBe('Monitoring (legacy treatment)');
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
  await complete(target.framework);expect(completion(post,target.review).risk_assessment).toEqual({});
  expectUnchanged(target.risk,await riskRow(target.risk));expect((await riskHistory(target.risk))[0].outcome).toBe('Reviewed — No Change');
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
  const target=await fixture('cis-ig1'),done=(await api.post('/reviews/'+target.review.review_id+'/complete',{occurrence_id:target.review.current_occurrence_id,risk_assessment:{},risk_outcome:'Reviewed — No Change'})).data;
  target.review=done.review;const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');await renderReview(target,{initialValues:{occurrence:done.occurrence}});
  const day=new Date(done.occurrence.completed_at.slice(0,10)+'T00:00:00').toLocaleDateString();
  expect(historicalSummary().textContent).toBe(`Completed ${day} by ${done.occurrence.completed_by_name} · Reviewed — No Change`);
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
