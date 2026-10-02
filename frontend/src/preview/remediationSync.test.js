import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {readStore} from './store';
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo';
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const events=(kind,id)=>readStore().logs.filter(a=>a.entity_type===kind&&a.entity_id===id).map(a=>a.action);
async function findingWithTask(){
  const review=(await api.post('/reviews',{client_id:cid,title:'Synthetic access review',review_type:'access',recurrence:'quarterly',due_date:'2026-09-30'})).data;
  const finding=(await api.post(`/reviews/${review.review_id}/create-finding`,{occurrence_id:review.current_occurrence_id,request_id:'sync-1',title:'Stale access',remediation_title:'Remove stale access'})).data;
  const task=readStore().tasks.find(t=>t.finding_id===finding.finding_id);
  return {review,finding,task};
}
test('Finding history records its own remediation transitions',async()=>{
  const {finding,task}=await findingWithTask();
  expect(events('findings',finding.finding_id)).toContain('Finding moved to In Remediation');
  await api.patch('/tasks/'+task.task_id,{status:'done'});
  expect((await api.get('/findings/'+finding.finding_id)).data.status).toBe('remediated');
  expect(events('findings',finding.finding_id)).toContain('Finding moved to Pending Validation');
  expect(events('tasks',task.task_id)).toContain('Related Finding moved to Pending Validation');
});
test('deleting the only open Action Item returns the Finding to Open',async()=>{
  const {finding,task}=await findingWithTask();
  await api.delete('/tasks/'+task.task_id);
  expect((await api.get('/findings/'+finding.finding_id)).data.status).toBe('open');
  expect(events('findings',finding.finding_id)).toContain('Finding returned to Open; its remediation Action Item was deleted');
});
test('deleting one Action Item follows the remaining work; accepted Findings are untouched',async()=>{
  const {finding,task}=await findingWithTask();
  const done=(await api.post('/tasks',{client_id:cid,title:'Earlier fix',finding_id:finding.finding_id})).data;
  await api.patch('/tasks/'+done.task_id,{status:'done'});
  expect((await api.get('/findings/'+finding.finding_id)).data.status).toBe('in_remediation');
  await api.delete('/tasks/'+task.task_id);
  expect((await api.get('/findings/'+finding.finding_id)).data.status).toBe('remediated');
  const other=await findingWithTask();
  await api.post(`/findings/${other.finding.finding_id}/accept`,{rationale:'Synthetic accepted gap'});
  await api.delete('/tasks/'+other.task.task_id);
  expect((await api.get('/findings/'+other.finding.finding_id)).data.status).toBe('accepted');
});
test('retrying quick-create with the same request id does not duplicate the Finding',async()=>{
  const {review,finding}=await findingWithTask();
  const again=(await api.post(`/reviews/${review.review_id}/create-finding`,{occurrence_id:review.current_occurrence_id,request_id:'sync-1',title:'Stale access',remediation_title:'Remove stale access'})).data;
  expect(again.finding_id).toBe(finding.finding_id);
  expect(readStore().tasks.filter(t=>t.finding_id===finding.finding_id)).toHaveLength(1);
});
