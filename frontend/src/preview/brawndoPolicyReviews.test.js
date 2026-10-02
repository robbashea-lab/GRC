import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {readStore} from './store';
import {buildDemoStore} from './demoSeed';
import {ids} from './store';
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo';
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const active=r=>!['completed','cancelled'].includes(r.status);
const policyReviews=()=>readStore().reviews.filter(r=>r.client_id===cid&&r.policy_id);
test('every seeded Brawndo Policy has exactly one active annual Review that keeps its next-review date',()=>{
  const policies=readStore().policies.filter(p=>p.client_id===cid),seeded=buildDemoStore(Object.keys(ids),new Date()).policies.filter(p=>p.client_id===cid);
  expect(policies).toHaveLength(17);
  for(const p of policies){
    const linked=policyReviews().filter(r=>r.policy_id===p.policy_id&&active(r));
    expect(linked).toHaveLength(1);
    const [review]=linked;
    expect(review).toMatchObject({review_type:'policy',recurrence:'annual'});
    expect(p.schedule_from_reviews).toBe(true);
    expect(p.next_review_date.slice(0,10)).toBe(review.due_date.slice(0,10));
    expect(review.due_date.slice(0,10)).toBe(seeded.find(s=>s.policy_id===p.policy_id).next_review_date.slice(0,10));
    if(review.occurrences?.length)expect(p.last_reviewed_at).toBe(review.occurrences.at(-1).completed_at);
  }
  // The program-level Policy Review and Approval Review is retained.
  expect(readStore().reviews.some(r=>r.review_id==='demo_brawndo_review_policy-review'&&!r.policy_id)).toBe(true);
});
test('a second active Review for a Policy is rejected on create and on relink',async()=>{
  const p=readStore().policies.find(x=>x.client_id===cid);
  await expect(api.post('/reviews',{client_id:cid,policy_id:p.policy_id,title:'Duplicate',review_type:'policy',recurrence:'annual',due_date:'2026-12-01'})).rejects.toMatchObject({message:'This Policy already has an active Review; open it instead.'});
  const other=(await api.post('/reviews',{client_id:cid,title:'Unlinked review',review_type:'policy',recurrence:'annual',due_date:'2026-12-01'})).data;
  await expect(api.patch('/reviews/'+other.review_id,{policy_id:p.policy_id})).rejects.toBeTruthy();
});
test('policy Review completion keeps its cycle, records history and leaves approval alone; its Finding stays visible',async()=>{
  const draft=readStore().policies.find(x=>x.client_id===cid&&x.status==='draft');
  const review=policyReviews().find(r=>r.policy_id===draft.policy_id&&active(r));
  const due=review.due_date.slice(0,10);
  const finding=(await api.post(`/reviews/${review.review_id}/create-finding`,{occurrence_id:review.current_occurrence_id,request_id:'pol-qa',title:'Policy omits BYOD',remediation_title:'Add BYOD section'})).data;
  const task=readStore().tasks.find(t=>t.finding_id===finding.finding_id);
  await api.patch('/tasks/'+task.task_id,{status:'done'});
  expect((await api.get('/findings/'+finding.finding_id)).data.status).toBe('remediated');
  const done=(await api.post(`/reviews/${review.review_id}/complete`,{occurrence_id:review.current_occurrence_id})).data;
  expect(done.occurrence).toMatchObject({due_date:expect.stringContaining(due),outcome:'findings_raised'});
  const next=new Date(Date.UTC(+due.slice(0,4)+1,+due.slice(5,7)-1,+due.slice(8,10))).toISOString().slice(0,10);
  expect(done.review.due_date.slice(0,10)).toBe(next);
  const policy=(await api.get('/policies/'+draft.policy_id)).data;
  expect(policy.status).toBe('draft');expect(policy.next_review_date.slice(0,10)).toBe(next);
  const related=(await api.get('/related',{params:{entity_type:'policies',entity_id:draft.policy_id}})).data;
  expect(related.findings.map(f=>f.finding_id)).toContain(finding.finding_id);
  expect(policyReviews().filter(r=>r.policy_id===draft.policy_id)).toHaveLength(1);
});
test('approving a new Brawndo Policy schedules its Review instead of a free-standing date',async()=>{
  const p=(await api.post('/policies',{client_id:cid,title:'Synthetic Mobile Policy',status:'draft',presence:'needs_confirmation',version:'1'})).data;
  await api.post(`/policies/${p.policy_id}/approval-subject`,{version:'1',external_reference:'https://example.test/mobile',external_version:'v1'});
  const approved=(await api.post(`/policies/${p.policy_id}/verify`,{status:'approved',last_reviewed_at:'2026-03-31'})).data;
  const linked=policyReviews().filter(r=>r.policy_id===p.policy_id);
  expect(linked).toHaveLength(1);expect(linked[0].due_date.slice(0,10)).toBe('2027-03-31');
  expect(approved.next_review_date.slice(0,10)).toBe('2027-03-31');expect(approved.schedule_from_reviews).toBe(true);
  await api.post(`/policies/${p.policy_id}/verify`,{status:'approved'});
  expect(policyReviews().filter(r=>r.policy_id===p.policy_id)).toHaveLength(1);
});
