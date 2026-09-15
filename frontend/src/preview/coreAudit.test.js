import axios from 'axios';
import {previewAdapter} from './adapter';
import {dashboard,portfolio} from './summaries';
import {seedStore,readStore,saveStore} from './store';
const api=axios.create({adapter:previewAdapter});
beforeEach(()=>{sessionStorage.clear();localStorage.clear();});
test('Finding related Review retains originating occurrence and current evidence stays separate',async()=>{
  await api.post('/demo/enter');
  const {data:client}=await api.post('/clients',{name:'Occurrence audit'});
  const {data:review}=await api.post('/reviews',{client_id:client.client_id,title:'Quarterly review',review_type:'access',recurrence:'quarterly',due_date:'2026-09-30'});
  const occurrence_id=review.current_occurrence_id;
  const {data:finding}=await api.post(`/reviews/${review.review_id}/create-finding`,{occurrence_id,title:'Access gap',remediation_title:'Review privileged accounts',severity:'high'});
  await api.post('/evidence',{client_id:client.client_id,linked_type:'review',linked_id:review.review_id,occurrence_id,filename:'access.txt',content_base64:'eA=='});
  const {data:done}=await api.post(`/reviews/${review.review_id}/complete`,{occurrence_id});
  const {data:related}=await api.get('/related',{params:{entity_type:'findings',entity_id:finding.finding_id}});
  expect(related.reviews[0].linked_occurrence).toEqual({period:'Q3 2026',status:'completed'});
  const {data:current}=await api.get('/related',{params:{entity_type:'reviews',entity_id:review.review_id,occurrence_id:done.review.current_occurrence_id}});
  expect(current.evidence).toEqual([]);
  const {data:old}=await api.get('/related',{params:{entity_type:'reviews',entity_id:review.review_id,occurrence_id}});
  expect(old.evidence.map(e=>e.filename)).toEqual(['access.txt']);
});
test('legacy sample policy dates remain visible without overwriting reviewed dates',()=>{
  const db=seedStore();
  const policy=db.policies.find(p=>p.last_reviewed);
  expect(policy.last_reviewed_at).toBe(policy.last_reviewed);
  policy.last_reviewed_at='2026-09-15';
  saveStore(db);
  expect(readStore().policies.find(p=>p.policy_id===policy.policy_id).last_reviewed_at).toBe('2026-09-15');
});
test('policy completion retains history, synchronizes dates, and leaves approval unchanged',async()=>{
  await api.post('/demo/enter');
  const {data:client}=await api.post('/clients',{name:'Policy audit'});
  const {data:policy}=await api.post('/policies',{client_id:client.client_id,title:'Security Policy'});
  let {data:review}=await api.post('/reviews',{client_id:client.client_id,title:'Annual Policy Review',review_type:'policy',policy_id:policy.policy_id,recurrence:'annual',due_date:'2026-09-30'});
  for(const next of ['2027-09-30','2028-09-30']) {
    const {data:result}=await api.post(`/reviews/${review.review_id}/complete`,{occurrence_id:review.current_occurrence_id});
    review=result.review;
    const {data:policies}=await api.get('/policies',{params:{client_id:client.client_id}});
    expect(policies[0].last_reviewed_at).toBe(result.occurrence.completed_at);
    expect(policies[0].next_review_date.slice(0,10)).toBe(next);
    expect(policies[0].status).toBe('draft');
  }
  expect(review.occurrences).toHaveLength(2);
  await expect(api.patch('/policies/'+policy.policy_id,{last_reviewed_at:'2000-01-01'})).rejects.toBeTruthy();
});
test('rescheduling a central Risk Review updates the same Risk in the demo',async()=>{
  await api.post('/demo/enter');
  const {data:client}=await api.post('/clients',{name:'Risk scheduling audit'});
  const {data:risk}=await api.post('/risks',{client_id:client.client_id,title:'Exposure',next_review:'2026-09-30',review_cadence:'annual'});
  const {data:reviews}=await api.get('/reviews',{params:{client_id:client.client_id}});
  await api.patch('/reviews/'+reviews[0].review_id,{due_date:'2026-10-31',expected_occurrence_id:reviews[0].current_occurrence_id});
  const {data:risks}=await api.get('/risks',{params:{client_id:client.client_id}});
  expect(risks[0].risk_id).toBe(risk.risk_id);
  expect(risks[0].next_review).toBe('2026-10-31');
});
test('dashboard counts today, excludes cancelled actions, and counts linked policy obligation once',()=>{
  const db=seedStore(), client_id=db.clients[0].client_id, today=new Date().toISOString().slice(0,10);
  db.reviews=[{review_id:'r',client_id,policy_id:'p',status:'upcoming',due_date:today}];
  db.tasks=[{task_id:'a',client_id,status:'open',due_date:today},{task_id:'b',client_id,status:'cancelled',due_date:today}];
  db.policies=[{policy_id:'p',client_id,status:'approved',next_review_date:today}];
  expect(dashboard(db,{client_id,scope:'org'}).kpis.due_next_30).toBe(2);
});
test('portfolio counts a linked Risk review deadline once',()=>{
  const db=seedStore(), client_id=db.clients[0].client_id;
  db.reviews=[{review_id:'r',client_id,risk_id:'risk',status:'upcoming',due_date:'2000-01-01'}];
  db.risks=[{risk_id:'risk',client_id,status:'assessed',next_review:'2000-01-01'}];
  db.tasks=[];db.findings=[];
  expect(portfolio(db,false).clients.find(c=>c.client_id===client_id).past_due).toBe(1);
});
