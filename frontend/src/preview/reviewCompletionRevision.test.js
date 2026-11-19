import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import {completionPayload,validateCompletionGuide} from '../lib/r4ReviewCompletion';

const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
async function vendorReview(){
  const client=(await api.post('/clients',{name:'SYNTHETIC Review revision fixture'})).data;
  const vendor=(await api.post('/vendors',{client_id:client.client_id,name:'SYNTHETIC vendor',service:'SYNTHETIC managed CRM service',next_review:'2026-10-15'})).data;
  const rows=(await api.get('/reviews',{params:{client_id:client.client_id}})).data;
  const review=rows.find(row=>row.vendor_id===vendor.vendor_id&&row.vendor_purpose==='vendor');
  expect(review).toBeDefined();
  return review;
}
async function performedGuide(review){
  const current=(await api.get('/reviews/'+review.review_id)).data;
  const {data:guide}=await api.get('/reviews/'+review.review_id+'/completion-guide');
  expect(guide.expected_updated_at).toBe(current.updated_at??null);
  expect(guide.occurrence_id).toBe(current.current_occurrence_id);
  const performed={...guide,
    results:guide.steps.map(step=>({step_id:step.step_id,result:'Pass',reason:'SYNTHETIC QA: current Vendor check performed with no exception.'})),
    supporting_reference:'SYNTHETIC QA completed-result record REVIEW-REVISION: illustrative performed checks, not external assurance.'};
  validateCompletionGuide(performed);
  return performed;
}
async function saveCheckpoint(review,guide){
  const checkpoint=completionPayload(guide);
  delete checkpoint.outcome;
  await api.put('/reviews/'+review.review_id+'/completion-guide',checkpoint,{headers:{'Idempotency-Key':'synthetic-review-revision-checkpoint'}});
  return performedGuide(review);
}

test.each([false,true])('raw native completion retains an actual current revision (checkpoint saved: %s)',async checkpointSaved=>{
  const review=await vendorReview();
  let guide=await performedGuide(review);
  expect(guide.expected_updated_at).toBeNull();
  if(checkpointSaved){
    guide=await saveCheckpoint(review,guide);
    expect(guide.expected_updated_at).toEqual(expect.any(String));
    expect(guide.expected_updated_at.length).toBeGreaterThan(0);
  }
  const body={...completionPayload(guide),completion_notes:'SYNTHETIC QA: performed this Review and retained its completed-result reference.'};
  expect(Object.hasOwn(body,'expected_updated_at')).toBe(true);
  const {data:completed}=await api.post('/reviews/'+review.review_id+'/complete',body);
  expect(completed.occurrence).toMatchObject({occurrence_id:guide.occurrence_id,checklist_outcome:'No exceptions noted',supporting_reference:guide.supporting_reference});
  expect(completed.occurrence.checklist_results).toHaveLength(guide.steps.length);
  expect((await api.get('/reviews/'+review.review_id+'/history')).data).toHaveLength(1);
  expect((await api.get('/vendors/'+review.vendor_id)).data.next_review.slice(0,10)).toBe('2027-10-15');
});

test('omitting the revision still refuses completion without changing native saved state',async()=>{
  const review=await vendorReview(),guide=await performedGuide(review),body=completionPayload(guide);
  delete body.expected_updated_at;
  const before=sessionStorage.getItem(STORE_KEY);
  await expect(api.post('/reviews/'+review.review_id+'/complete',body)).rejects.toMatchObject({response:{status:428}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect((await api.get('/reviews/'+review.review_id+'/history')).data).toHaveLength(0);
});

test('a superseded actual revision still refuses completion and preserves the saved checkpoint and schedule',async()=>{
  const review=await vendorReview(),oldGuide=await performedGuide(review),current=await saveCheckpoint(review,oldGuide);
  expect(current.expected_updated_at).not.toBe(oldGuide.expected_updated_at);
  const body={...completionPayload(current),expected_updated_at:oldGuide.expected_updated_at},before=sessionStorage.getItem(STORE_KEY);
  await expect(api.post('/reviews/'+review.review_id+'/complete',body)).rejects.toThrow(/Record changed since it was opened/);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect((await api.get('/reviews/'+review.review_id+'/history')).data).toHaveLength(0);
  expect((await api.get('/reviews/'+review.review_id)).data.updated_at).toBe(current.expected_updated_at);
  expect((await api.get('/vendors/'+review.vendor_id)).data.next_review.slice(0,10)).toBe('2026-10-15');
});
