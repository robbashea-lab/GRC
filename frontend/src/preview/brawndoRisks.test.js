import axios from 'axios';
import {previewAdapter} from './adapter';
import {newRiskDefaults,nextRiskReview} from '../lib/brawndoRisks';
import {STORE_KEY} from './store';
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo';
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const create=async extra=>(await api.post('/risks',{...newRiskDefaults(),client_id:cid,title:'Synthetic pilot Risk',description:'Test only',likelihood_score:3,impact_score:4,...extra})).data;
test('undecided creation, Other descriptions and edits preserve assessment and schedule',async()=>{
 const r=await create({category:'other',category_other:'Synthetic category',source_type:'other',source_other:'Synthetic incident'}),path='/risks/'+r.risk_id;
 expect(r.treatment).toBe('');expect(r.risk_score).toBe(12);expect(r.last_reviewed).toBeFalsy();
 const updated=(await api.patch(path,{title:'Renamed Risk',expected_updated_at:r.updated_at})).data;
 expect(updated.next_review).toBe(r.next_review);expect(updated.last_reviewed).toBeFalsy();
 const stored=JSON.parse(sessionStorage.getItem(STORE_KEY)).risks.find(x=>x.risk_id===r.risk_id);
 expect(stored.category_other).toBe('Synthetic category');expect(stored.source_other).toBe('Synthetic incident');
});
test('proposed Accept is not an acceptance; formal decision retains severity and history',async()=>{
 const r=await create({treatment:'accept'}),path='/risks/'+r.risk_id;
 expect(r.status).not.toBe('accepted');expect(r.accepted_by).toBeFalsy();await expect(api.patch(path,{status:'accepted'})).rejects.toBeTruthy();
 const accepted=(await api.post(path+'/accept',{rationale:'Synthetic acceptance rationale',expiry_date:'2099-01-01'})).data;
 expect(accepted.status).toBe('accepted');expect(accepted.risk_score).toBe(12);expect(accepted.accepted_by).toBeTruthy();expect(accepted.decision_history).toHaveLength(1);
 await expect(api.patch(path,{treatment:'mitigate'})).rejects.toBeTruthy();
});
test('monitoring is pilot lifecycle only; legacy categories and monitoring treatment remain intact',async()=>{
 const r=await create({category:'financial',treatment:'monitor'});const updated=(await api.patch('/risks/'+r.risk_id,{status:'monitoring'})).data;
 expect(updated.category).toBe('financial');expect(updated.treatment).toBe('monitor');
 const other=(await api.post('/clients',{name:'Other Risk QA'})).data.client_id,legacy=await create({client_id:other,source_type:'manual'});
 await expect(api.patch('/risks/'+legacy.risk_id,{status:'monitoring'})).rejects.toBeTruthy();await expect(create({client_id:other,source_type:'other'})).rejects.toBeTruthy();
});
test('late completion keeps the next review on the scheduled cycle, permits explicit override, preserves history',async()=>{
 const r=await create({next_review:'2020-03-01'}),path='/risks/'+r.risk_id,review=(await api.post(path+'/review')).data.review;
 expect((await api.get(path)).data.last_reviewed).toBeFalsy();
 const body={occurrence_id:review.current_occurrence_id,risk_outcome:'Reviewed — No Change'};
 const done=(await api.post('/reviews/'+review.review_id+'/complete',body)).data;
 const saved=(await api.get(path)).data;
 expect(done.occurrence.next_review_date).toBe(saved.next_review);
 expect(saved.next_review.slice(0,10)).toBe('2021-03-01');expect(saved.last_reviewed).toBe(done.occurrence.completed_at);expect(done.occurrence.due_date.slice(0,10)).toBe('2020-03-01');
 expect((await api.post('/reviews/'+review.review_id+'/complete',body)).data.occurrence).toEqual(done.occurrence);
 const override=(await api.post('/reviews/'+review.review_id+'/complete',{occurrence_id:done.review.current_occurrence_id,risk_next_review:'2090-10-10'})).data;
 expect(override.review.due_date.slice(0,10)).toBe('2090-10-10');expect((await api.get(path)).data.next_review).toBe('2090-10-10');expect((await api.get(path+'/review-history')).data).toHaveLength(2);
});
test('risk Action stays authoritative; completion does not accept, close or rescore the risk',async()=>{
 const r=await create(),path='/risks/'+r.risk_id;
 const t=(await api.post('/tasks',{title:'Synthetic treatment action',client_id:cid,source_type:'risk',source_id:r.risk_id})).data;
 const afterCreation=(await api.get(path)).data;
 await api.patch('/tasks/'+t.task_id,{status:'done'});
 const saved=(await api.get(path)).data;expect(saved.status).toBe(afterCreation.status);expect(saved.status).not.toBe('closed');expect(saved.status).not.toBe('accepted');expect(saved.risk_score).toBe(12);
 expect((await api.get('/related',{params:{entity_type:'risks',entity_id:r.risk_id}})).data.tasks).toHaveLength(1);
 await expect(api.patch(path,{status:'closed'})).rejects.toBeTruthy();await api.post(path+'/close',{reason:'condition_removed',note:'Synthetic closure'});
 expect((await api.get(path)).data.closure_note).toBe('Synthetic closure');expect((await api.get(path+'/review-history')).data).toEqual([]);
});
