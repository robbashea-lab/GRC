import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {buildLegacyDemoStore,readStore,saveStore,seedStore} from './store';
import {currentReviewCompletion} from '../testUtils/r4ReviewFixture';
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo';
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const day=v=>v?.slice(0,10);
const riskCompletion=review=>currentReviewCompletion(api,review.review_id,{
  expectedOccurrenceId:review.current_occurrence_id,
  resultForStep:step=>{
    const performed={
      'Updated risk record':['Pass','SYNTHETIC QA: inspected the retained Risk identity and saved context.'],
      'Rating change':['Pass','SYNTHETIC QA: reviewed the retained rating without changing it.'],
      'Action status':['N/A','SYNTHETIC QA: this schedule fixture does not inspect or validate linked corrective work; its progress and effectiveness remain separate.'],
      'Approver and date':['N/A','SYNTHETIC QA: this schedule case performs no acceptance or closure decision.'],
      'Next review':['Pass','SYNTHETIC QA: inspected the explicit saved schedule anchor and cadence before native completion.']
    }[step.support];
    expect(performed).toBeDefined();
    return {step_id:step.step_id,result:performed[0],reason:performed[1]};
  },
  supportingReference:'SYNTHETIC QA completed-result record: retained Risk metadata and explicit schedule inspected; linked corrective-work inspection is outside this case and no external assessment is claimed.'
});
test('rescheduling a Risk re-anchors its recurring Review on the new date',async()=>{
  // This retained recurring Risk identity predates the fresh showcase replacement.
  saveStore(buildLegacyDemoStore(),{resetFiles:true});await api.post('/demo/enter');
  const risk=readStore().risks.find(r=>r.client_id===cid&&r.risk_id==='demo_brawndo_risk_1');
  await api.patch('/risks/'+risk.risk_id,{next_review:'2026-11-10'});
  const review=readStore().reviews.find(r=>r.risk_id===risk.risk_id&&!['completed','cancelled'].includes(r.status));
  expect(review.schedule_anchor.day).toBe(10);
  const body=await riskCompletion(review);
  const done=(await api.post(`/reviews/${review.review_id}/complete`,{...body,risk_outcome:'Reviewed — No Change'})).data;
  const months={quarterly:3,semiannual:6,annual:12}[review.recurrence];
  const expected=new Date(Date.UTC(2026,10+months,10)).toISOString().slice(0,10);
  expect(day(done.review.due_date)).toBe(expected);
});
test('rescheduling a Vendor review re-anchors on the new date',async()=>{
  const vendor=readStore().vendors.find(v=>v.vendor_id==='demo_brawndo_vendor_0');
  await api.patch('/vendors/'+vendor.vendor_id,{next_review:'2026-11-05'});
  const review=readStore().reviews.find(r=>r.vendor_id===vendor.vendor_id&&(r.vendor_purpose||'vendor')==='vendor');
  expect(review.schedule_anchor.day).toBe(5);
  expect(day(review.next_review_date).slice(8)).toBe('05');
});
test('seeded Brawndo history follows one unbroken schedule per Review',()=>{
  for(const r of readStore().reviews.filter(r=>r.client_id===cid&&r.occurrences?.length&&['monthly','quarterly','semiannual','annual'].includes(r.recurrence))){
    const chain=[...r.occurrences.map(o=>day(o.due_date)),day(r.due_date)];
    r.occurrences.forEach((o,i)=>{if(o.next_review_date)expect([r.review_id,day(o.next_review_date)]).toEqual([r.review_id,chain[i+1]]);});
  }
});
test.each(['2026-10-02','2024-01-31','2025-02-28','2026-11-30'])('new seed at %s preserves the original anchor across clipped months',clock=>{
  for(const r of seedStore(new Date(clock+'T12:00:00Z')).reviews.filter(r=>r.client_id===cid&&r.occurrences?.length&&['monthly','quarterly','semiannual','annual'].includes(r.recurrence))){
    const chain=[...r.occurrences.map(o=>day(o.due_date)),day(r.due_date)];
    r.occurrences.forEach((o,i)=>{
      expect({review:r.review_id,next:day(o.next_review_date)}).toEqual({review:r.review_id,next:chain[i+1]});
      expect({review:r.review_id,anchor:o.schedule_anchor}).toEqual({review:r.review_id,anchor:r.schedule_anchor});
    });
  }
});
test('a Finding raised in a Policy Review is visible from the Policy',async()=>{
  const policy=readStore().policies.find(p=>p.client_id===cid);
  // The Policy's recurring Review already exists; a second active one is rejected.
  const review=readStore().reviews.find(r=>r.policy_id===policy.policy_id&&!['completed','cancelled'].includes(r.status));
  const finding=(await api.post(`/reviews/${review.review_id}/create-finding`,{occurrence_id:review.current_occurrence_id,request_id:'pol-1',title:'Policy gap',remediation_title:'Update policy'})).data;
  const related=(await api.get('/related',{params:{entity_type:'policies',entity_id:policy.policy_id}})).data;
  expect(related.findings.map(f=>f.finding_id)).toContain(finding.finding_id);
  expect(related.tasks.filter(t=>t.finding_id===finding.finding_id)).toHaveLength(1);
});

test('re-saving a Risk with the same next-review day in date-only form keeps the recurrence anchor',async()=>{
  // Keep the retained v1 Risk as the explicit input to this anchor regression.
  saveStore(buildLegacyDemoStore(new Date('2026-11-02T12:00:00.000Z')),{resetFiles:true});await api.post('/demo/enter');
  const risk=readStore().risks.find(r=>r.risk_id==='demo_brawndo_risk_1');
  expect(day(risk.next_review)).not.toBe('2027-01-31');
  await api.patch('/risks/'+risk.risk_id,{next_review:'2027-01-31'});
  let review=readStore().reviews.find(r=>r.risk_id===risk.risk_id&&!['completed','cancelled'].includes(r.status));
  review=(await api.patch('/reviews/'+review.review_id,{recurrence:'monthly',expected_updated_at:review.updated_at??null,expected_occurrence_id:review.current_occurrence_id})).data;
  expect(review.recurrence).toBe('monthly');
  const body=await riskCompletion(review);
  const done=(await api.post(`/reviews/${review.review_id}/complete`,{...body,risk_outcome:'Reviewed — No Change'})).data;
  const after=readStore().risks.find(r=>r.risk_id===risk.risk_id);
  // Re-save with the identical day as a date-only string, as the drawer does.
  await api.patch('/risks/'+risk.risk_id,{next_review:after.next_review.slice(0,10)});
  review=readStore().reviews.find(r=>r.review_id===done.review.review_id);
  expect(review.schedule_anchor).toEqual(done.review.schedule_anchor);
  expect(readStore().logs.filter(l=>l.entity_id===risk.risk_id&&l.action==='Next Risk Review scheduled')).toHaveLength(1);
});
