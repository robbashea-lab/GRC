import axios from 'axios';
import { previewAdapter } from './adapter';
import { readStore, saveStore } from './store';
const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/auth/login');});
test('manual work starts Open and retains evidence, comments and completion metadata',async()=>{
  const cid=(await api.get('/clients')).data[0].client_id;
  const t=(await api.post('/tasks',{client_id:cid,title:'Disable stale accounts',source_type:'audit',priority:'high'})).data;
  expect(t.status).toBe('open');
  const started=(await api.patch('/tasks/'+t.task_id,{status:'in_progress'})).data;
  expect(started.started_by).toBeTruthy();
  await api.post('/evidence',{client_id:cid,linked_type:'task',linked_id:t.task_id,filename:'accounts.txt',content_base64:'eA=='});
  await api.post('/comments',{entity_type:'tasks',entity_id:t.task_id,body:'Confirmed'});
  const done=(await api.patch('/tasks/'+t.task_id,{status:'done'})).data;
  expect(done.completed_by).toBeTruthy();expect(done.completed_at).toBeTruthy();
  expect((await api.get('/tasks/'+t.task_id+'/activity')).data.map(a=>a.action)).toEqual(expect.arrayContaining(['Work started','Evidence uploaded','Action Item completed']));
  await expect(api.delete('/tasks/'+t.task_id)).rejects.toThrow();
  await expect(api.patch('/tasks/'+t.task_id,{status:'open'})).rejects.toThrow();
  expect((await api.get('/comments',{params:{entity_type:'tasks',entity_id:t.task_id}})).data).toHaveLength(1);
});
test('legacy edits do not fabricate creators, start times or completion dates',async()=>{
  const db=readStore(),cid=db.clients[0].client_id;
  db.tasks.push({task_id:'legacy',client_id:cid,title:'Legacy',status:'done',priority:'low'});saveStore(db);
  const t=(await api.patch('/tasks/legacy',{description:'Additional context'})).data;
  for(const field of ['created_at','created_by','started_at','started_by','completed_at','completed_by']) expect(t[field]).toBeUndefined();
});
test('assessments are optional real source records and cross-tenant links/owners are rejected',async()=>{
  const db=readStore(),cid=db.clients[0].client_id,other=db.clients[1].client_id;
  db.assessments.push({assessment_id:'a',client_id:cid,name:'Readiness'},{assessment_id:'b',client_id:other,name:'Private'});
  db.users.push({user_id:'private',role:'client_contributor',client_ids:[other]});saveStore(db);
  const t=(await api.post('/tasks',{client_id:cid,title:'Remediate assessment',source_type:'audit',source_id:'a'})).data;
  expect(t.assessment_id).toBe('a');
  await expect(api.post('/tasks',{client_id:cid,title:'Wrong source',source_type:'audit',source_id:'b'})).rejects.toThrow();
  await expect(api.patch('/tasks/'+t.task_id,{assignee_id:'private'})).rejects.toThrow();
  expect((await api.get('/related',{params:{entity_type:'tasks',entity_id:t.task_id}})).data.assessments[0].name).toBe('Readiness');
});
