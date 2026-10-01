import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore} from './store';
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo';
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const day=v=>v?.slice(0,10);
test('rescheduling a Risk re-anchors its recurring Review on the new date',async()=>{
  const risk=readStore().risks.find(r=>r.client_id===cid&&r.risk_id==='demo_brawndo_risk_1');
  await api.patch('/risks/'+risk.risk_id,{next_review:'2026-11-10'});
  const review=readStore().reviews.find(r=>r.risk_id===risk.risk_id&&!['completed','cancelled'].includes(r.status));
  expect(review.schedule_anchor.day).toBe(10);
  const done=(await api.post(`/reviews/${review.review_id}/complete`,{occurrence_id:review.current_occurrence_id,risk_outcome:'Reviewed — No Change'})).data;
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
test('a Finding raised in a Policy Review is visible from the Policy',async()=>{
  const policy=readStore().policies.find(p=>p.client_id===cid);
  const review=(await api.post('/reviews',{client_id:cid,policy_id:policy.policy_id,title:'Synthetic policy review',review_type:'policy',recurrence:'annual',due_date:'2026-11-01'})).data;
  const finding=(await api.post(`/reviews/${review.review_id}/create-finding`,{occurrence_id:review.current_occurrence_id,request_id:'pol-1',title:'Policy gap',remediation_title:'Update policy'})).data;
  const related=(await api.get('/related',{params:{entity_type:'policies',entity_id:policy.policy_id}})).data;
  expect(related.findings.map(f=>f.finding_id)).toContain(finding.finding_id);
  expect(related.tasks.filter(t=>t.finding_id===finding.finding_id)).toHaveLength(1);
});
