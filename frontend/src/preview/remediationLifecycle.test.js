import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {SCHEMAS} from '../lib/schemas';
import {readStore,saveStore} from './store';
import {currentReviewCompletion} from '../testUtils/r4ReviewFixture';
const api=axios.create({adapter:previewAdapter});
const types=SCHEMAS.reviews.fields.find(f=>f.name==='review_type').options.map(o=>o.value);
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});

test.each(types)('%s shares remediation readiness, explicit validation and occurrence provenance',async review_type=>{
  const {data:c}=await api.post('/clients',{name:'Lifecycle test'});
  const validator={user_id:'lifecycle-independent-validator',name:'Synthetic independent validator',email:'lifecycle-validator@example.invalid',role:'platform_admin',status:'active',client_ids:[c.client_id]};
  const initial=readStore();initial.users.push(validator);saveStore(initial);
  const asValidator=async perform=>{
    const db=readStore(),worker=db.user;db.user=validator;saveStore(db);
    try{return await perform();}finally{const current=readStore();current.user=worker;saveStore(current);}
  };
  const {data:r}=await api.post('/reviews',{client_id:c.client_id,title:'Review',review_type,recurrence:'quarterly',due_date:'2026-09-30'});
  const occurrence_id=r.current_occurrence_id;
  const {data:f}=await api.post(`/reviews/${r.review_id}/create-finding`,{occurrence_id,title:'Deficiency',remediation_title:'Correct deficiency',severity:'high'});
  const tasks=()=>api.get('/tasks',{params:{client_id:c.client_id}}).then(r=>r.data);
  const finding=()=>api.get('/findings',{params:{client_id:c.client_id}}).then(r=>r.data.find(x=>x.finding_id===f.finding_id));
  expect((await finding()).status).toBe('in_remediation');
  const first=(await tasks())[0];expect(first.status).toBe('open');
  const {data:second}=await api.post('/tasks',{client_id:c.client_id,title:'Second corrective action',source_type:'finding',source_id:f.finding_id});
  await api.patch('/tasks/'+first.task_id,{status:'in_progress'});
  await api.patch('/tasks/'+first.task_id,{status:'done'});
  expect((await finding()).status).toBe('in_remediation');
  await asValidator(async()=>{
    const current=await finding();
    const attempt=api.post(`/findings/${f.finding_id}/validate`,{request_id:'unfinished-work',expected_updated_at:current.updated_at,rationale:'Not ready'});
    await expect(attempt).rejects.toBeTruthy();
    await expect(attempt).rejects.toMatchObject({response:{data:{detail:'Finding must be pending validation.'}}});
  });
  const {data:manual}=await api.post('/tasks',{client_id:c.client_id,title:'Unrelated',source_type:'manual'});
  await api.patch('/tasks/'+manual.task_id,{status:'done'});
  expect((await finding()).status).toBe('in_remediation');
  const completion=await currentReviewCompletion(api,r.review_id,{expectedOccurrenceId:occurrence_id,
    resultForStep:step=>({step_id:step.step_id,result:'N/A',reason:'This synthetic remediation lifecycle case does not perform the external operational check in this question.'}),
    supportingReference:`Native Finding ${f.finding_id} and its saved corrective Actions record the unresolved deficiency.`});
  completion.outcome='Exceptions noted';
  const {data:next}=await api.post(`/reviews/${r.review_id}/complete`,completion);
  expect((await finding()).status).toBe('in_remediation');
  expect(next.review.current_occurrence_id).not.toBe(occurrence_id);
  await api.patch('/tasks/'+second.task_id,{status:'done'});
  expect((await finding()).status).toBe('remediated');
  const {data:closed}=await asValidator(async()=>{
    const current=await finding();
    return api.post(`/findings/${f.finding_id}/validate`,{request_id:'independent-validation',expected_updated_at:current.updated_at,rationale:'Verified corrective actions'});
  });
  expect(closed.status).toBe('closed');expect(closed.validated_at).toBeTruthy();expect(closed.validated_by).toBeTruthy();
  expect(closed.validated_by).toBe(validator.user_id);
  for(const action of (await tasks()).filter(row=>row.finding_id===f.finding_id))expect(action.completed_by).not.toBe(validator.user_id);
  const {data:history}=await api.get('/related',{params:{entity_type:'reviews',entity_id:r.review_id,occurrence_id}});
  expect(history.findings.find(x=>x.finding_id===f.finding_id).status).toBe('closed');
  for(const id of [first.task_id,second.task_id]) {
    expect(history.tasks.find(t=>t.task_id===id)).toMatchObject({finding_id:f.finding_id,review_id:r.review_id,occurrence_id,status:'done'});
  }
});
