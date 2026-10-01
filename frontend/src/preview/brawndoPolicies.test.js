import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore} from './store';
import {nextPolicyReview} from '../lib/brawndoPolicies';
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo';
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const create=async(client=cid)=>(await api.post('/policies',{client_id:client,title:'Synthetic QA Policy',status:'draft',presence:'needs_confirmation',version:'1'})).data;
const source=p=>api.post(`/policies/${p.policy_id}/approval-subject`,{version:'1',external_reference:'https://example.test/synthetic-policy',external_version:'demo-v1'});
test('draft has no dates; recorded external approval defaults next date without inventing history',async()=>{
  const p=await create();expect(p.next_review_date).toBeFalsy();expect(p.last_reviewed_at).toBeFalsy();expect(p.approved_at).toBeFalsy();
  await expect(api.patch('/policies/'+p.policy_id,{status:'approved'})).rejects.toBeTruthy();
  await source(p);
  const approved=(await api.post(`/policies/${p.policy_id}/verify`,{status:'approved',last_reviewed_at:'2024-02-29',approved_at:'2024-02-20'})).data;
  expect(approved.next_review_date).toBe('2025-02-28');expect(approved.approved_at).toBe('2024-02-20');
  const changed=(await api.patch('/policies/'+p.policy_id,{version:'2'})).data;
  expect(changed.status).toBe('draft');expect(changed.next_review_date).toBe(approved.next_review_date);expect(changed.last_reviewed_at).toBe(approved.last_reviewed_at);
  expect(changed.decision_history).toEqual(approved.decision_history);
  expect((await api.get('/policies/'+p.policy_id)).data).toMatchObject({version:'2',next_review_date:'2025-02-28'});
});
test('approval with no historical dates preserves blanks and defaults only next review',async()=>{
  const p=await create();await source(p);
  const approved=(await api.post(`/policies/${p.policy_id}/verify`,{status:'approved'})).data;
  expect(approved.next_review_date).toBe(nextPolicyReview(new Date().toISOString().slice(0,10)));
  expect(approved.approved_at).toBeFalsy();expect(approved.last_reviewed_at).toBeFalsy();
});
test('Brawndo policy review keeps the scheduled cycle on completion, records the actual date, and does not duplicate Reviews',async()=>{
  const p=await create(),review=(await api.post('/reviews',{client_id:cid,policy_id:p.policy_id,title:'Synthetic policy review',review_type:'policy',recurrence:'annual',due_date:'2024-02-29'})).data;
  const before=readStore().reviews.length;
  await expect(api.post(`/policies/${p.policy_id}/verify`,{status:'draft',next_review_date:'2099-01-01'})).rejects.toBeTruthy();
  const result=(await api.post(`/reviews/${review.review_id}/complete`,{occurrence_id:review.current_occurrence_id})).data;
  const policy=(await api.get('/policies/'+p.policy_id)).data;
  expect(policy.next_review_date.slice(0,10)).toBe('2025-02-28');
  expect(policy.last_reviewed_at).toBe(result.occurrence.completed_at);expect(readStore().reviews.length).toBe(before);
  await api.patch('/policies/'+p.policy_id,{title:'Updated title'});
  expect((await api.get('/policies/'+p.policy_id)).data.next_review_date).toBe(policy.next_review_date);
});
test('other clients keep their original policy import and review behavior',async()=>{
  const other=readStore().clients.find(c=>c.client_id!==cid).client_id,p=await create(other);await source(p);
  const approved=(await api.post(`/policies/${p.policy_id}/verify`,{status:'approved'})).data;
  expect(approved.next_review_date).toBeFalsy();
});

test.each([['quarterly',null,'2025-04-30'],['custom',45,'2025-03-17'],['none',null,null]])('policy review keeps the %s schedule anchored to the due date',async(cadence,days,expected)=>{
  const p=await create(),review=(await api.post('/reviews',{client_id:cid,policy_id:p.policy_id,title:'Synthetic override review',review_type:'policy',recurrence:cadence,custom_recurrence_days:days,due_date:'2025-01-31'})).data;
  const result=(await api.post(`/reviews/${review.review_id}/complete`,{occurrence_id:review.current_occurrence_id})).data;
  expect(result.occurrence.next_review_date?.slice(0,10)??null).toBe(expected);
  expect((await api.get('/policies/'+p.policy_id)).data.next_review_date?.slice(0,10)??null).toBe(expected);
  expect((await api.get('/reviews/'+review.review_id)).data.occurrences).toHaveLength(1);
});

test('upload does not approve a draft revision, overwrite overdue dates, or replace historical approval',async()=>{
  const p=await create();await source(p);
  const approved=(await api.post(`/policies/${p.policy_id}/verify`,{status:'approved',last_reviewed_at:'2023-01-01',next_review_date:'2024-01-01'})).data;
  await api.patch('/policies/'+p.policy_id,{version:'2'});
  await api.post('/evidence',{client_id:cid,linked_type:'policy',linked_id:p.policy_id,filename:'DEMO-synthetic-revision.txt',content_base64:btoa('DEMO — SYNTHETIC DATA'.replace('—','-'))});
  const revised=(await api.get('/policies/'+p.policy_id)).data;
  expect(revised).toMatchObject({status:'draft',version:'2',last_reviewed_at:'2023-01-01',next_review_date:'2024-01-01'});
  expect(revised.decision_history).toEqual(approved.decision_history);
});
