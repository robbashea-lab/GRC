import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import {currentReviewCompletion} from '../testUtils/r4ReviewFixture';
const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const db=()=>JSON.parse(sessionStorage.getItem(STORE_KEY));
const riskCompletion=review=>currentReviewCompletion(api,review.review_id,{
  expectedOccurrenceId:review.current_occurrence_id,
  resultForStep:step=>{
    const performed={
      'Updated risk record':['Pass','SYNTHETIC QA: reviewed the saved Exposure record; no description change is asserted.'],
      'Rating change':['Pass','SYNTHETIC QA: reviewed the fixture rating; only an explicit assessment payload may change it.'],
      'Action status':['N/A','SYNTHETIC QA: this rating/schedule fixture does not inspect or validate linked corrective work; its progress and effectiveness remain separate.'],
      'Approver and date':['N/A','SYNTHETIC QA: no acceptance or closure decision is part of this occurrence.'],
      'Next review':['Pass','SYNTHETIC QA: checked the saved cadence; the native completion determines the next scheduled date.']
    }[step.support];
    expect(performed).toBeDefined();
    return {step_id:step.step_id,result:performed[0],reason:performed[1]};
  },
  supportingReference:'SYNTHETIC QA completed-result record: native Risk rating and schedule fixture inspected; linked corrective-work inspection is outside this case and no external assessment is claimed.'
});
test('administrator schedule override is preserved for a shared, non-reference Risk Review',async()=>{
  const cid=(await api.post('/clients',{name:'Shared Risk override QA'})).data.client_id;
  const risk=(await api.post('/risks',{title:'Exposure',client_id:cid,likelihood_score:3,impact_score:4,next_review:'2026-11-02',review_cadence:'annual'})).data;
  const review=(await api.post('/risks/'+risk.risk_id+'/review')).data.review;
  const route='/reviews/'+review.review_id+'/complete';
  const current=await riskCompletion(review);
  await expect(api.post(route,{...current,risk_next_review:'2028-01-01T00:00:00Z'})).rejects.toThrow();
  const body={...current,risk_next_review:'2028-01-01'};
  const done=(await api.post(route,body)).data;
  expect(done.occurrence.next_review_override).toBe('2028-01-01');
  expect(done.review.due_date).toBe('2028-01-01');
  expect((await api.post(route,body)).data.occurrence).toEqual(done.occurrence);
});
test('one Risk obligation, repeatable No Change completion, fixed cadence and historical snapshots',async()=>{
  const cid=(await api.post('/clients',{name:'Risk lifecycle QA'})).data.client_id;
  const risk=(await api.post('/risks',{title:'Exposure',client_id:cid,likelihood_score:3,impact_score:4,next_review:'2026-11-02',review_cadence:'annual'})).data;
  const route='/risks/'+risk.risk_id;
  const review=(await api.post(route+'/review')).data.review;
  expect((await api.post(route+'/review')).data.review.review_id).toBe(review.review_id);
  const body=await riskCompletion(review);
  const done=(await api.post('/reviews/'+review.review_id+'/complete',body)).data;
  expect(done.occurrence.outcome).toBe('Reviewed — No Change');
  expect((await api.post('/reviews/'+review.review_id+'/complete',body)).data.occurrence).toEqual(done.occurrence);
  expect(db().risks.find(r=>r.risk_id===risk.risk_id).next_review.slice(0,10)).toBe('2027-11-02');
  expect(db().reviews.filter(r=>r.risk_id===risk.risk_id)).toHaveLength(1);
  const next=await riskCompletion(done.review);
  await api.post('/reviews/'+review.review_id+'/complete',{...next,risk_assessment:{likelihood_score:4}});
  const history=(await api.get(route+'/review-history')).data;
  expect(history).toHaveLength(2);expect(history[1].risk_before.risk_score).toBe(12);expect(history[1].risk_after.risk_score).toBe(16);
});
test('linking preserves one authoritative Action Item and its source; closure retains evidence and history',async()=>{
  const cid=(await api.post('/clients',{name:'Risk linking QA'})).data.client_id;
  const risk=(await api.post('/risks',{title:'Exposure',client_id:cid,likelihood_score:3,impact_score:4})).data;
  const task=(await api.post('/tasks',{title:'Existing treatment',client_id:cid,source_type:'manual'})).data;
  const route='/risks/'+risk.risk_id;
  await api.post(route+'/link-action-item',{task_id:task.task_id});await api.post(route+'/link-action-item',{task_id:task.task_id});
  expect(db().tasks.find(t=>t.task_id===task.task_id).source_type).toBe('manual');
  expect((await api.get('/related',{params:{entity_type:'risks',entity_id:risk.risk_id}})).data.tasks).toHaveLength(1);
  const evidence=(await api.post('/evidence',{client_id:cid,linked_type:'risk',linked_id:risk.risk_id,filename:'assessment.txt',content_base64:'eA=='})).data;
  await api.post(route+'/close',{reason:'remediated'});
  await expect(api.delete(route)).rejects.toBeTruthy();await expect(api.delete('/evidence/'+evidence.evidence_id)).rejects.toBeTruthy();
  expect(db().tasks.some(t=>t.task_id===task.task_id)).toBe(true);
});
