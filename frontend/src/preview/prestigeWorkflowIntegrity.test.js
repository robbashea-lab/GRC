import axios from 'axios';
import {previewAdapter} from './adapter';
import soc from '../lib/soc2.json';
import {reviewSchedule} from '../lib/reviewOccurrences';

const api=axios.create({adapter:previewAdapter});
const cid='demo_prestige';
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});

test('all 38 scoped Prestige criteria retain unique records and linked work',async()=>{
  const workspace=(await api.get('/frameworks/soc-2',{params:{client_id:cid}})).data;
  const ids=workspace.assessments.map(a=>a.definition_id);
  const expected=soc.requirements.map(r=>r.id).filter(id=>/^(CC\d|A1\.|C1\.)/.test(id));
  expect(ids.sort()).toEqual(expected.sort());
  expect(new Set(workspace.assessments.map(a=>a.framework_assessment_id)).size).toBe(38);
  for(const a of workspace.assessments){
    const related=(await api.get(`/framework_assessments/${a.framework_assessment_id}/related`)).data;
    expect(related.reviews).toEqual(expect.any(Array));
    expect(related.findings).toEqual(expect.any(Array));
    expect(related.tasks).toEqual(expect.any(Array));
    expect(related.policies).toEqual(expect.any(Array));
    expect(related.evidence).toEqual(expect.any(Array));
    for(const f of related.findings.filter(f=>f.framework_assessment_id===a.framework_assessment_id))
      expect(related.tasks.some(t=>t.finding_id===f.finding_id)).toBe(true);
  }
});

test('catalogued Prestige policy support resolves to one same-client Policy per scoped mapping',async()=>{
  const workspace=(await api.get('/frameworks/soc-2',{params:{client_id:cid}})).data;
  for(const assessment of workspace.assessments){
    const related=(await api.get(`/framework_assessments/${assessment.framework_assessment_id}/related`)).data;
    const expected=soc.policy_mappings.filter(mapping=>mapping.safeguards.includes(assessment.definition_id));
    for(const mapping of expected)
      expect(related.policies.filter(policy=>policy.client_id===cid&&policy.baseline_key===mapping.policy_key)).toHaveLength(1);
  }
});

test('a Prestige quarterly Review advances eight anchored occurrences across 24 months without duplicate Reviews',async()=>{
  const reviews=(await api.get('/reviews',{params:{client_id:cid}})).data;
  const review=reviews.find(r=>r.recurrence==='quarterly'&&r.due_date&&r.framework_key==='soc-2'&&!r.policy_id&&!r.risk_id);
  expect(review).toBeTruthy();
  const originalId=review.review_id,originalCount=reviews.length,originalHistory=review.occurrences?.length||0;
  let current=review;
  for(let i=0;i<8;i++){
    const expected=reviewSchedule(current).next_review_date;
    const result=(await api.post(`/reviews/${originalId}/complete`,{occurrence_id:current.current_occurrence_id})).data;
    expect(result.occurrence.occurrence_id).toBe(current.current_occurrence_id);
    expect(result.review.due_date).toBe(expected);
    expect(result.review.current_occurrence_id).not.toBe(current.current_occurrence_id);
    current=result.review;
  }
  expect(current.occurrences).toHaveLength(originalHistory+8);
  expect(current.due_date.slice(0,10)).toBe(`${Number(review.due_date.slice(0,4))+2}${review.due_date.slice(4,10)}`);
  expect((await api.get('/reviews',{params:{client_id:cid}})).data).toHaveLength(originalCount);
  const day=current.due_date.slice(0,10);
  const calendar=(await api.get('/calendar',{params:{client_id:cid,start:day,end:day}})).data;
  expect(calendar.reviews[day].filter(item=>item.id===originalId)).toHaveLength(1);
});

test('late completion leaves each missed monthly obligation actionable rather than skipping it',async()=>{
  jest.useFakeTimers().setSystemTime(new Date('2026-11-10T12:00:00Z'));
  try{
    const review=(await api.post('/reviews',{client_id:cid,title:'Prestige late-cadence QA',review_type:'general',recurrence:'monthly',due_date:'2026-09-01'})).data;
    let current=review;
    for(const due of ['2026-10-01','2026-11-01','2026-12-01']){
      current=(await api.post(`/reviews/${review.review_id}/complete`,{occurrence_id:current.current_occurrence_id})).data.review;
      expect(current.due_date.slice(0,10)).toBe(due);
    }
    expect(current.occurrences.map(o=>o.due_date.slice(0,10))).toEqual(['2026-09-01','2026-10-01','2026-11-01']);
  }finally{jest.useRealTimers();}
});

test('a criterion Finding creates one Action and preserves the reverse source link',async()=>{
  const row=(await api.get('/frameworks/soc-2',{params:{client_id:cid}})).data.assessments.find(a=>a.definition_id==='CC9.2');
  const body={title:'CC9.2 lifecycle QA',remediation_title:'Correct CC9.2 gap',description:'QA-only gap',severity:'medium',request_id:'prestige-cc9-2-qa'};
  const path=`/framework_assessments/${row.framework_assessment_id}/findings`;
  const created=(await api.post(path,body)).data;
  const repeated=(await api.post(path,body)).data;
  expect(repeated.finding_id).toBe(created.finding_id);
  const related=(await api.get(`/framework_assessments/${row.framework_assessment_id}/related`)).data;
  expect(related.findings.filter(f=>f.finding_id===created.finding_id)).toHaveLength(1);
  expect(related.tasks.filter(t=>t.finding_id===created.finding_id)).toHaveLength(1);
  const all=(await api.get('/tasks',{params:{client_id:cid}})).data;
  expect(all.filter(t=>t.finding_id===created.finding_id)).toHaveLength(1);
  const task=related.tasks.find(t=>t.finding_id===created.finding_id);
  await api.patch(`/tasks/${task.task_id}`,{status:'done'});
  const remediated=(await api.get(`/findings/${created.finding_id}`)).data;
  expect(remediated.status).toBe('remediated');
  const validated=(await api.post(`/findings/${created.finding_id}/validate`,{rationale:'QA validation'})).data;
  expect(validated.status).toBe('closed');
  const historical=(await api.get(`/framework_assessments/${row.framework_assessment_id}/related`)).data;
  expect(historical.findings.find(f=>f.finding_id===created.finding_id).status).toBe('closed');
  expect(historical.tasks.find(t=>t.task_id===task.task_id).status).toBe('done');
});
