import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {readStore,clone} from './store';
import baseline from '@catalogs/onboardingCatalog.json';
import cis from '@catalogs/cisIG1.json';
import {FRAMEWORKS} from '../lib/frameworks';
import {cisScopeLabel,validateCisSettings} from '../lib/cisScope';

const api=axios.create({adapter:previewAdapter});
const ids='1.5 2.7 3.13 3.14 4.12 6.8 8.12 9.7 12.8 13.7 13.8 13.9 13.10 13.11 15.5 15.6 15.7 16.12 16.13 16.14 17.9 18.4 18.5'.split(' ');
const original=clone(cis);
const state=group=>({version:3,step:3,policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,f.key==='cis-ig1'?'applies':'does_not_apply'])),reviews:[],framework_reviews:{},framework_settings:{'cis-ig1':{implementation_group:group}}});
let cid;
const workspace=async()=>(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data;
const scope=async(group,context={})=>api.patch('/frameworks/cis-ig1/configuration',{client_id:cid,implementation_group:group,expected_updated_at:(await workspace()).configuration.expected_updated_at,...context},{headers:{'Idempotency-Key':'synthetic_scope_'+Date.now()+Math.random().toString(36).slice(2)}});
beforeEach(async()=>{
  sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');
  cid=(await api.post('/clients',{name:'Temporary synthetic scope verification'})).data.client_id;
  // Neutral fixture text exercises mechanics; it is not CIS product guidance.
  cis.available_implementation_groups=[1,2,3];
  cis.requirements.push(...ids.map(id=>({...original.requirements[0],id,title:'Synthetic fixture '+id,implementation_group:3,guidance:'Persistence fixture only.'})));
  cis.review_plans[0].safeguards.push(...ids);
});
afterEach(()=>Object.assign(cis,clone(original)));

test('new IG3 and cumulative transitions preserve answers, identities and Review schedules',async()=>{
  await api.post('/onboarding/baseline',{client_id:cid,state:state(3),finalize:true});
  const initial=await workspace();expect(initial.assessments).toHaveLength(153);
  const first=initial.assessments[0];
  await api.patch('/framework_assessments/'+first.framework_assessment_id,{implementation:'Saved synthetic answer',status:'addressed',verification:'verified'});
  const saved=clone((await workspace()).assessments),reviews=clone(readStore().reviews.filter(r=>r.client_id===cid));
  for(const [group,count] of [[2,130],[3,153],[1,56],[3,153]]){
    const before=(await workspace()).configuration.implementation_group;
    await scope(group,group<before?{confirm_reduction:true,reason:'Synthetic scope QA',effective_date:'2026-10-03'}:{});
    const current=await workspace();expect(current.active_definition_ids).toHaveLength(count);
    expect(current.assessments).toEqual(saved);
    const currentReviews=readStore().reviews.filter(r=>r.client_id===cid);
    expect(currentReviews).toHaveLength(15);
    for(const review of reviews){const retained=currentReviews.find(r=>r.review_id===review.review_id);for(const field of ['title','description','owner_id','recurrence','due_date','schedule_anchor','occurrences'])expect(retained[field]).toEqual(review[field]);}
  }
  expect(saved.filter(r=>ids.includes(r.definition_id))).toHaveLength(23);
  expect(cisScopeLabel({implementation_group:3})).toBe('Added in IG3');
});

test.each([1,2])('upgrade from IG%i creates only missing rows',async group=>{
  await api.post('/onboarding/baseline',{client_id:cid,state:state(group),finalize:true});
  const before=(await workspace()).assessments;
  await scope(3);const after=(await workspace()).assessments;
  expect(after).toHaveLength(153);expect(after.length-before.length).toBe(group===1?97:23);
  for(const row of before)expect(after.find(r=>r.framework_assessment_id===row.framework_assessment_id)).toEqual(row);
});

test('unavailable IG3 is rejected by onboarding and scope without persisted changes',async()=>{
  cis.available_implementation_groups=[1,2];
  const before=clone(readStore());
  await expect(api.post('/onboarding/baseline',{client_id:cid,state:state(3),finalize:true})).rejects.toBeTruthy();
  expect(readStore()).toEqual(before);
  await api.post('/onboarding/baseline',{client_id:cid,state:state(1),finalize:true});
  const initialized=clone(readStore());await expect(scope(3)).rejects.toBeTruthy();expect(readStore()).toEqual(initialized);
  for(const group of [true,'3',0,4,null])expect(()=>validateCisSettings({'cis-ig1':{implementation_group:group}})).toThrow();
});
