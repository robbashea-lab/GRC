import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore,saveStore} from './store';
import {requirementBasis} from '../lib/requirementBasis';
const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});
test('Demo context persists and is auditable without changing source relationships',async()=>{
  const db=readStore(),cid=db.clients[0].client_id;
  const t=(await api.post('/tasks',{client_id:cid,title:'Manual','source_type':'manual',governance_context:{category:'management',rationale:'Initial'}})).data;
  await api.patch('/tasks/'+t.task_id,{governance_context:{category:'management',rationale:'Updated'}});
  expect((await api.get('/tasks/'+t.task_id)).data.governance_context.rationale).toBe('Updated');
  expect(readStore().logs.some(l=>l.meta.governance_context_before?.rationale==='Initial'&&l.meta.governance_context_after?.rationale==='Updated')).toBe(true);
  await expect(api.patch('/tasks/'+t.task_id,{governance_context:{cadence_source:'mandatory'}})).rejects.toThrow();
  await expect(api.patch('/tasks/'+t.task_id,{title_generated:true})).rejects.toThrow();
});
test('Review snapshot retains rationale after the next occurrence changes it',async()=>{
  const cid=readStore().clients[0].client_id;
  const r=(await api.post('/reviews',{client_id:cid,title:'Context history',review_type:'access',recurrence:'quarterly',due_date:'2026-09-30',governance_context:{rationale:'Original'}})).data;
  const next=(await api.post('/reviews/'+r.review_id+'/complete',{occurrence_id:r.current_occurrence_id})).data.review;
  await api.patch('/reviews/'+r.review_id,{governance_context:{rationale:'Next occurrence'},expected_occurrence_id:next.current_occurrence_id,expected_updated_at:next.updated_at});
  const history=(await api.get('/reviews/'+r.review_id+'/history')).data;
  expect(history[0].governance_context.rationale).toBe('Original');
});
test('multi-framework inheritance uses scoped related records, not title matching',async()=>{
  const db=readStore(),cid=db.clients[0].client_id;
  const r=db.reviews.find(r=>r.client_id===cid&&db.framework_assessments.filter(a=>a.client_id===cid&&a.related_links?.some(l=>l.kind==='reviews'&&l.id===r.review_id)).length>3);
  const task=(await api.post('/tasks',{client_id:cid,title:'Follow up',source_type:'review',source_id:r.review_id})).data;
  const related=(await api.get('/related',{params:{entity_type:'tasks',entity_id:task.task_id}})).data;
  expect(requirementBasis('tasks',task,related).length).toBeGreaterThan(0);
  expect(related.framework_assessments.every(a=>a.client_id===cid)).toBe(true);
});
test('archived and deleted sources never become another client record',async()=>{
  const db=readStore(),cid=db.clients[0].client_id,other=db.clients[1].client_id;
  const policy={policy_id:'historical',client_id:cid,title:'Retired policy',status:'retired'};
  db.policies.push(policy);saveStore(db);
  const t=(await api.post('/tasks',{client_id:cid,title:'Context','source_type':'policy',source_id:'historical'})).data;
  expect((await api.get('/related',{params:{entity_type:'tasks',entity_id:t.task_id}})).data.policies.some(p=>p.status==='retired')).toBe(true);
  const changed=readStore();changed.policies=changed.policies.filter(p=>p.policy_id!=='historical');changed.policies.push({...policy,client_id:other,title:'Private'});saveStore(changed);
  expect((await api.get('/related',{params:{entity_type:'tasks',entity_id:t.task_id}})).data.policies).toEqual([]);
  expect((await api.get('/tasks/'+t.task_id)).data.policy_id).toBe('historical');
});
