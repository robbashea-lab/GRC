import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import contract from '@contracts/review-command.json';

const api=axios.create({adapter:previewAdapter});

test('pre-save stale ticket rejection releases a persisted intent without changing records',async()=>{
 const task=(await api.post('/tasks',{client_id:'demo_brawndo',title:'Stale ticket test'})).data;
 await expect(api.patch('/tasks/'+task.task_id,{title:'Stale overwrite',expected_updated_at:'obsolete'},{headers:{'Idempotency-Key':'stale-task-command-001'}})).rejects.toMatchObject({response:{status:409,headers:{'x-create-rejected':'true'}}});
 expect((await api.get('/tasks/'+task.task_id)).data.title).toBe('Stale ticket test');
});
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
async function setup(){
  const client=(await api.post('/clients',{name:'Isolated replay scenario'})).data;
  const review=(await api.post('/reviews',{client_id:client.client_id,...contract.review})).data;
  return {client,review,path:`/reviews/${review.review_id}/create-finding`,body:{...contract.command,occurrence_id:review.current_occurrence_id}};
}
test('command replay returns original result, rejects changed intent, and keeps one linked action',async()=>{
  const {client,review,path,body}=await setup();
  await expect(api.post(path,{...body,request_id:undefined})).rejects.toMatchObject({response:{status:contract.missing_identity_status}});
  const first=(await api.post(path,body)).data;
  expect(first.status).toBe(contract.result_status);
  await expect(api.post(path,{...body,title:contract.changed_title})).rejects.toMatchObject({response:{status:contract.changed_payload_status}});
  await api.patch(`/findings/${first.finding_id}`,{title:'Later edit',expected_updated_at:first.updated_at});
  await api.post(`/reviews/${review.review_id}/complete`,{occurrence_id:body.occurrence_id});
  expect((await api.post(path,body)).data).toEqual(first);
  expect((await api.get(`/findings/${first.finding_id}`)).data.title).toBe('Later edit');
  expect((await api.get('/tasks',{params:{client_id:client.client_id}})).data.filter(t=>t.finding_id===first.finding_id)).toHaveLength(contract.action_count);
});
test('storage failure commits neither command effects nor receipt; same intent recovers once',async()=>{
  const {client,path,body}=await setup();
  const before=sessionStorage.getItem(STORE_KEY);
  const write=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('injected persistence failure');});
  try{await expect(api.post(path,body)).rejects.toThrow('Changes were not saved');expect(sessionStorage.getItem(STORE_KEY)).toBe(before);}
  finally{write.mockRestore();}
  const result=(await api.post(path,body)).data;
  expect((await api.post(path,body)).data).toEqual(result);
  expect((await api.get('/findings',{params:{client_id:client.client_id}})).data).toHaveLength(contract.finding_count);
});
test('receipt replay checks current tenant access first',async()=>{
  const {path,body}=await setup();
  await api.post(path,body);
  const db=JSON.parse(sessionStorage.getItem(STORE_KEY));
  db.user={...db.user,role:'client_viewer',client_ids:['demo_brawndo']};
  sessionStorage.setItem(STORE_KEY,JSON.stringify(db));
  await expect(api.post(path,body)).rejects.toMatchObject({response:{status:contract.denied_status}});
});

test('validation proves no Demo write, while saved conflicts and storage failures do not',async()=>{
 const {path,body}=await setup(),before=sessionStorage.getItem(STORE_KEY);
 await expect(api.post(path,{...body,title:'x'.repeat(1001)})).rejects.toMatchObject({response:{status:422,headers:{'x-create-rejected':'true'}}});
 expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
 const write=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('injected storage failure');});
 try{await api.post(path,body);throw new Error('Expected storage failure');}
 catch(error){expect(error.response).toBeDefined();expect(error.response.headers?.['x-create-rejected']).toBeUndefined();}
 finally{write.mockRestore();}
 await api.post(path,body);
 try{await api.post(path,{...body,title:'Different saved intent'});throw new Error('Expected conflict');}
 catch(error){expect(error.response.status).toBe(409);expect(error.response.headers?.['x-create-rejected']).toBeUndefined();}
});

test('different actors using the same request ID retain separate Finding intents',async()=>{
  const {client,path,body}=await setup();
  const first=(await api.post(path,body)).data;
  const db=JSON.parse(sessionStorage.getItem(STORE_KEY));
  db.user={...db.user,user_id:'second-release-operator'};db.users.push({...db.user,status:'active'});
  sessionStorage.setItem(STORE_KEY,JSON.stringify(db));
  const second=(await api.post(path,{...body,title:'Second operator observation'})).data;
  expect(second.finding_id).not.toBe(first.finding_id);
  expect(second.title).toBe('Second operator observation');
  expect((await api.get('/findings',{params:{client_id:client.client_id}})).data).toHaveLength(2);
});

test('assigned contributor cannot delegate a Review Finding to a provider account',async()=>{
  const {client,review,path,body}=await setup();
  const db=JSON.parse(sessionStorage.getItem(STORE_KEY)),admin=db.user.user_id;
  db.user={...db.user,user_id:'release-contributor',role:'client_contributor',client_ids:[client.client_id]};
  db.users.push({...db.user,status:'active'});
  db.reviews.find(r=>r.review_id===review.review_id).owner_id=db.user.user_id;
  sessionStorage.setItem(STORE_KEY,JSON.stringify(db));
  await expect(api.post(path,{...body,owner_id:admin})).rejects.toMatchObject({response:{status:403}});
  expect((await api.get('/findings',{params:{client_id:client.client_id}})).data).toHaveLength(0);
  expect((await api.post(path,body)).data.owner_id).toBe(db.user.user_id);
});

test('standalone Action rejects malformed fields before writing and accepts a corrected retry',async()=>{
  const {client}=await setup();
  const finding=(await api.post('/findings',{client_id:client.client_id,title:'Independent observation'})).data;
  const path='/findings/'+finding.finding_id+'/create-task';
  for(const body of [{title:{unexpected:'object'}},{due_date:'not-a-date'},{status:'done'}])
    await expect(api.post(path,body)).rejects.toMatchObject({response:{status:422}});
  expect((await api.get('/tasks',{params:{client_id:client.client_id}})).data).toHaveLength(0);
  expect((await api.post(path,{title:'Valid corrective work'})).data.title).toBe('Valid corrective work');
});
