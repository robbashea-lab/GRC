import axios from 'axios';
import {previewAdapter} from './adapter';
import {unifiedActions} from '../lib/brawndoActions';
import {SOURCE_RECORDS} from '../lib/actionItems';
const api=axios.create({adapter:previewAdapter}),client_id='demo_brawndo';
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});
test('Informational is a Brawndo-only choice, persists without accepting or completing work',async()=>{
  const {data:t}=await api.post('/tasks',{client_id,title:'Advisory QA',source_type:'manual',priority:'informational'});
  expect(t).toMatchObject({priority:'informational',status:'open'});
  expect((await api.get('/tasks/'+t.task_id)).data).toMatchObject({priority:'informational',status:'open'});
  const {data:c}=await api.post('/clients',{name:'Other client'});
  await expect(api.post('/tasks',{client_id:c.client_id,title:'Other advisory',source_type:'manual',priority:'informational'})).rejects.toBeTruthy();
});
test('multiple corrective actions preserve one Finding, occurrence, comments and independent closure',async()=>{
  const {data:r}=await api.post('/reviews',{client_id,title:'Pilot QA review',review_type:'access',recurrence:'quarterly',due_date:'2026-09-30'});
  const {data:f}=await api.post(`/reviews/${r.review_id}/create-finding`,{occurrence_id:r.current_occurrence_id,title:'QA documented gap',remediation_title:'First corrective action',severity:'high'});
  const {data:second}=await api.post('/tasks',{client_id,title:'Second corrective action',source_type:'finding',source_id:f.finding_id});
  const {data:tasks}=await api.get('/tasks',{params:{client_id}}),first=tasks.find(t=>t.finding_id===f.finding_id&&t.task_id!==second.task_id);
  await api.post('/comments',{entity_type:'tasks',entity_id:first.task_id,body:'Preserved operator note'});
  await api.patch('/tasks/'+first.task_id,{description:'Verified outcome',status:'done'});
  expect((await api.get('/findings/'+f.finding_id)).data.status).toBe('in_remediation');
  await expect(api.post(`/findings/${f.finding_id}/validate`,{rationale:'Premature'})).rejects.toBeTruthy();
  const saved=(await api.get('/tasks/'+first.task_id)).data;
  expect(saved).toMatchObject({description:'Verified outcome',status:'done',finding_id:f.finding_id,review_id:r.review_id,occurrence_id:r.current_occurrence_id});
  expect((await api.get('/comments',{params:{entity_type:'tasks',entity_id:first.task_id}})).data.some(c=>c.body==='Preserved operator note')).toBe(true);
  expect(unifiedActions({tasks:[saved,second],findings:[f]},client_id)).toHaveLength(2);
  await api.patch('/tasks/'+second.task_id,{status:'done'});
  expect((await api.get('/findings/'+f.finding_id)).data.status).toBe('remediated');
  expect((await api.get('/reviews/'+r.review_id)).data.status).not.toBe('completed');
});
test('existing origins create ordinary authoritative tasks, with unchanged source IDs',async()=>{
  for(const type of ['risk','review','policy','vendor']){
    const [kind,key]=SOURCE_RECORDS[type],{data:records}=await api.get('/'+kind,{params:{client_id}}),origin=records[0];
    const {data:task}=await api.post('/tasks',{client_id,title:'QA '+type,source_type:type,source_id:origin[key]});
    const {data:saved}=await api.patch('/tasks/'+task.task_id,{title:'Renamed QA '+type});
    expect(saved[key]).toBe(origin[key]);expect(saved.source_type).toBe(type);
    expect(unifiedActions({tasks:[saved],[kind]:records},client_id)[0].source.target[key]).toBe(origin[key]);
  }
});
test('CIS Finding creation stays idempotent and its authoritative action is the single queue row',async()=>{
  const {data:workspace}=await api.get('/frameworks/cis-ig1',{params:{client_id}}),assessment=workspace.assessments[0];
  const path='/framework_assessments/'+assessment.framework_assessment_id+'/findings',body={title:'QA CIS gap',remediation_title:'QA corrective work',severity:'high',request_id:'pilot-cis-qa'};
  const {data:f}=await api.post(path,body);expect((await api.post(path,body)).data.finding_id).toBe(f.finding_id);
  const {data:tasks}=await api.get('/tasks',{params:{client_id}}),linked=tasks.filter(t=>t.finding_id===f.finding_id);
  expect(linked).toHaveLength(1);expect(unifiedActions({tasks:linked,findings:[f],framework_assessments:[assessment]},client_id)).toHaveLength(1);
});
