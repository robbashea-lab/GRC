// Synthetic governance execution; no external security operation is performed.
import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import baseline from '@catalogs/onboardingCatalog.json';
import {cis,FRAMEWORKS,reviewDrivers,activePlans} from '../lib/frameworks';
import {cisReviewBriefs} from '../lib/cisOperations';
import {reviewSchedule} from '../lib/reviewOccurrences';
const api=axios.create({adapter:previewAdapter});
const {setImmediate:yieldLoop}=jest.requireActual('timers');
async function post(path,body){const r=await api.post(path,body);jest.runOnlyPendingTimers();await new Promise(resolve=>yieldLoop(resolve));return r.data;}
const get=async(path,cid)=>(await api.get(path,{params:{client_id:cid}})).data;
const clock=day=>jest.setSystemTime(new Date(day+'T14:00:00Z'));
beforeEach(async()=>{jest.useFakeTimers({doNotFake:['performance','nextTick','queueMicrotask']});clock('2026-10-04');sessionStorage.clear();localStorage.clear();await post('/demo/enter');});
afterEach(()=>jest.useRealTimers());

test('a fresh cumulative IG2 program retains source duties through 24 months of all 15 governance Reviews',async()=>{
 const cid=(await post('/clients',{name:'Synthetic IG2 operating-cycle regression'})).client_id;
 const state={version:3,step:3,requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,f.key==='cis-ig1'?'applies':'does_not_apply'])),policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),reviews:[],framework_settings:{'cis-ig1':{implementation_group:2}},framework_reviews:Object.fromEntries(activePlans('cis-ig1',{implementation_group:2}).map(p=>[p.key,{enabled:true,recurrence:p.key==='data-recovery'?'quarterly':p.default_cadence,due_date:'2026-11-30'}]))};
 await post('/onboarding/baseline',{client_id:cid,state,finalize:true});
 const original=await get('/frameworks/cis-ig1',cid),reviews=await get('/reviews',cid),snapshots=new Map(),counts={};
 expect(original.assessments).toHaveLength(130);expect(reviews).toHaveLength(15);
 const mapped=new Set();
 for(const review of reviews)for(const brief of cisReviewBriefs(review,original.active_definition_ids))for(const item of brief.items)mapped.add(item.id);
 expect(mapped.size).toBe(130);
 const duty=id=>cis.requirements.find(d=>d.id===id).source_cadence;
 expect(duty('11.5')).toMatch(/quarter/i);expect(duty('16.4')).toMatch(/month/i);expect(duty('8.11')).toMatch(/week/i);
 expect(duty('16.9')).toMatch(/annual/i);expect(duty('18.2')).toMatch(/annual/i);expect(duty('16.1')).toMatch(/significant.change/i);expect(duty('17.8')).toMatch(/incident/i);
 for(let month=1;month<=24;month++){
  const day=new Date(Date.UTC(2026,10+month,0)).toISOString().slice(0,10);clock(day);
  for(const review of await get('/reviews',cid)){
   if(review.due_date.slice(0,10)>day)continue;
   await post('/reviews/'+review.review_id+'/start',{occurrence_id:review.current_occurrence_id});
   const body={occurrence_id:review.current_occurrence_id,spawn_next:true,conclusion:'Synthetic governance check only',tested_period:review.period||day,tested_scope:review.framework_safeguards.join(', '),checklist_confirmed:true,no_evidence_reason:'Synthetic recurrence test; external technical effectiveness is not asserted'};
   const done=await post('/reviews/'+review.review_id+'/complete',body);
   expect(done.occurrence.due_date).toBe(review.due_date);expect(done.review.due_date).toBe(reviewSchedule(review).next_review_date);
   expect((await post('/reviews/'+review.review_id+'/complete',body)).occurrence).toEqual(done.occurrence);
   snapshots.set(done.occurrence.occurrence_id,JSON.parse(JSON.stringify(done.occurrence)));counts[review.framework_plan_key]=(counts[review.framework_plan_key]||0)+1;
  }
 }
 expect(counts['secure-development']).toBe(24);expect(counts['endpoint-validation']).toBe(8);expect(counts['penetration-testing']).toBe(2);
 expect(counts['data-recovery']).toBe(8);
 const current=await get('/frameworks/cis-ig1',cid);expect(current.assessments).toEqual(original.assessments);
 const live=await get('/reviews',cid);
 for(const review of live){
  expect(reviewDrivers(review)[0].framework_safeguards).toEqual(reviews.find(r=>r.review_id===review.review_id).framework_safeguards);
  for(const occurrence of review.occurrences)expect(occurrence).toEqual(snapshots.get(occurrence.occurrence_id));
 }
 const recovery=live.find(r=>r.framework_plan_key==='data-recovery');expect(recovery.recurrence).toBe('quarterly');
 const secure=live.find(r=>r.framework_plan_key==='secure-development');
 const component=cisReviewBriefs(secure,current.active_definition_ids)[0].items.find(d=>d.id==='16.4');expect(component.source_cadence).toMatch(/month/i);expect(secure.recurrence).toBe('monthly');
 // Event-driven follow-up uses existing records, without fabricating periodic technical executions.
 const change=await post('/tasks',{client_id:cid,title:'Synthetic significant application change',source_type:'manual',description:'16.1 and 16.10 change-triggered process follow-up'});
 const incident=await post('/tasks',{client_id:cid,title:'Synthetic post-incident lesson',source_type:'manual',description:'17.8 post-incident review follow-up'});
 expect([change.status,incident.status]).toEqual(['open','open']);
},120000);
