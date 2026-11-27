import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY,readStore,saveStore,clone} from './store';
import {createIntent} from '../lib/createIntent';
import {cis,FRAMEWORKS} from '../lib/frameworks';
import catalog from '@catalogs/onboardingCatalog.json';

const api=axios.create({adapter:previewAdapter});
const key='synthetic_framework_review_receipt_0001';
const headers={'Idempotency-Key':key};
let cid,row,path,body;
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(async()=>{
  sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');
  cid=(await api.post('/clients',{name:'SYNTHETIC Framework Review receipt QA'})).data.client_id;
  const initial=(await api.get('/onboarding/baseline',{params:{client_id:cid}})).data;
  const state={version:3,step:3,policies:Object.fromEntries(catalog.policies.map(policy=>[policy.key,'unsure'])),
    requirements:Object.fromEntries(FRAMEWORKS.map(framework=>[framework.key,framework.key==='cis-ig1'?'applies':'does_not_apply'])),
    reviews:[],framework_reviews:Object.fromEntries(cis.review_plans.map(plan=>[plan.key,{enabled:false}])),
    framework_settings:{'cis-ig1':{implementation_group:2}}};
  await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true,
    expected_updated_at:initial.state.updated_at??null,expected_records:initial.record_versions},
    {headers:{'Idempotency-Key':'synthetic_framework_review_fixture_0001'}});
  const workspace=(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data;
  row=workspace.assessments.find(assessment=>cis.requirements.find(definition=>definition.id===assessment.definition_id)?.implementation_group===2);
  expect(row).toBeDefined();
  path=`/framework_assessments/${row.framework_assessment_id}/reviews`;
  body={title:'SYNTHETIC scoped recurring validation',owner_id:'demo_admin',recurrence:'custom',custom_recurrence_days:30,due_date:'2028-02-29'};
});
afterEach(()=>jest.restoreAllMocks());
const receipt=db=>db.command_requests?.[JSON.stringify([db.user.user_id,cid,path,key])];
const work=()=>{
  const db=readStore();
  return clone({reviews:db.reviews.filter(review=>review.client_id===cid),
    assessments:db.framework_assessments.filter(assessment=>assessment.client_id===cid),
    logs:db.logs.filter(event=>event.client_id===cid),
    receipts:Object.fromEntries(Object.entries(db.command_requests||{}).filter(([scope])=>JSON.parse(scope)[2]===path))});
};

test.each([
  ['title',{title:'   '}],['date',{due_date:'2027-02-29'}],
  ['custom interval',{custom_recurrence_days:0}],['owner',{owner_id:'synthetic_missing_owner'}],
  ['model fields',{unexpected:'not accepted'}],
])('a first invalid %s is a safe local rejection and permits a corrected form intent',async(_label,invalid)=>{
  const post=jest.fn((...args)=>api.post(...args)),intent=createIntent(post),before=sessionStorage.getItem(STORE_KEY);
  await expect(intent(path,{...body,...invalid})).rejects.toMatchObject({response:{status:422,headers:{'x-create-rejected':'true'}}});
  expect(intent.unconfirmed()).toBe(false);expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  const created=(await intent(path,body)).data;
  expect(created).toMatchObject({client_id:cid,title:body.title,due_date:body.due_date,custom_recurrence_days:30});
  expect(post.mock.calls[1][2].headers['Idempotency-Key']).not.toBe(post.mock.calls[0][2].headers['Idempotency-Key']);
  expect(work().reviews).toHaveLength(1);
});

test.each(['','short','synthetic invalid key with spaces'])('invalid supplied key %s cannot mutate work or declare an old intent rejected',async invalidKey=>{
  const before=sessionStorage.getItem(STORE_KEY);
  try{await api.post(path,body,{headers:{'Idempotency-Key':invalidKey}});throw new Error('Expected invalid key');}
  catch(error){expect(error.response.status).toBe(422);expect(error.response.headers['x-create-rejected']).toBeUndefined();}
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('raw changed payload conflicts before coercion or model validation, while exact replay adds no writes',async()=>{
  const first=(await api.post(path,body,{headers})).data,before=work(),saved=sessionStorage.getItem(STORE_KEY);
  const storage=jest.spyOn(Storage.prototype,'setItem');
  expect((await api.post(path,{...body},{headers})).data).toEqual(first);
  expect(storage.mock.calls.filter(([storageKey])=>storageKey===STORE_KEY)).toHaveLength(0);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(saved);expect(work()).toEqual(before);
  for(const changed of [{...body,custom_recurrence_days:'30'},{...body,title:null}]){
    try{await api.post(path,changed,{headers});throw new Error('Expected changed payload conflict');}
    catch(error){expect(error.response.status).toBe(409);expect(error.response.headers['x-create-rejected']).toBeUndefined();}
  }
  expect(work()).toEqual(before);
});

test.each(['program','role','active definition','tenant access','pending client','pending assessment'])('a committed lost response retains its original intent across withdrawn %s',async withdrawn=>{
  let lose=true,originalResult;
  const post=jest.fn(async(...args)=>{
    const response=await api.post(...args);
    if(lose){lose=false;originalResult=clone(response.data);throw new axios.AxiosError('SYNTHETIC response lost after atomic commit','ERR_BAD_RESPONSE',undefined,null,{status:503,headers:{},data:{detail:'SYNTHETIC response lost'}});}
    return response;
  });
  const intent=createIntent(post);
  await expect(intent(path,body)).rejects.toMatchObject({response:{status:503}});
  expect(intent.unconfirmed()).toBe(true);expect(intent.pendingRequest()).toEqual([path,body]);
  const committed=work();expect(committed.reviews).toHaveLength(1);
  const original=committed.reviews[0],db=readStore(),actor=clone(db.user);
  const requestKey=post.mock.calls[0][2].headers['Idempotency-Key'],scope=JSON.stringify([actor.user_id,cid,path,requestKey]);
  const originalReceipt=clone(db.command_requests[scope]);
  expect(originalReceipt.result).toEqual(originalResult);
  // Persisted Reviews gain the inherited empty history default; receipts retain the wire result.
  expect(original).toEqual({...originalResult,occurrences:[]});
  const client=db.clients.find(current=>current.client_id===cid),assessment=db.framework_assessments.find(current=>current.framework_assessment_id===row.framework_assessment_id);
  const requirement=db.requirements.find(current=>current.client_id===cid&&current.baseline_key==='cis-ig1');
  if(withdrawn==='program')requirement.baseline_response='does_not_apply';
  if(withdrawn==='role')Object.assign(db.user,{role:'client_readonly',client_ids:[cid]});
  if(withdrawn==='active definition')client.framework_settings['cis-ig1'].implementation_group=1;
  if(withdrawn==='tenant access')Object.assign(db.user,{role:'platform_admin',all_clients:false,client_ids:[]});
  if(withdrawn==='pending client')client._r4_context_pending={request_id:'synthetic_pending_client'};
  if(withdrawn==='pending assessment')assessment._r4_context_pending={request_id:'synthetic_pending_assessment'};
  saveStore(db);const deniedBytes=sessionStorage.getItem(STORE_KEY);
  try{await intent.retry();throw new Error('Expected current authority or scope denial');}
  catch(error){expect(error.response.status).toBe(['role','tenant access'].includes(withdrawn)?403:409);expect(error.response.headers['x-create-rejected']).toBeUndefined();}
  expect(sessionStorage.getItem(STORE_KEY)).toBe(deniedBytes);
  expect(intent.unconfirmed()).toBe(true);expect(intent.pendingRequest()).toEqual([path,body]);
  await expect(intent(path,{...body,title:'Changed uncertain setup'})).rejects.toThrow('not been confirmed');
  const restored=readStore();restored.user=actor;
  restored.requirements.find(current=>current.client_id===cid&&current.baseline_key==='cis-ig1').baseline_response='applies';
  const currentClient=restored.clients.find(current=>current.client_id===cid);currentClient.framework_settings['cis-ig1'].implementation_group=2;delete currentClient._r4_context_pending;
  delete restored.framework_assessments.find(current=>current.framework_assessment_id===row.framework_assessment_id)._r4_context_pending;
  saveStore(restored);
  const beforeRetry=work(),saved=sessionStorage.getItem(STORE_KEY);
  expect((await intent.retry()).data).toEqual(originalReceipt.result);
  expect(intent.unconfirmed()).toBe(false);expect(sessionStorage.getItem(STORE_KEY)).toBe(saved);expect(work()).toEqual(beforeRetry);
  expect(work().reviews).toEqual(committed.reviews);expect(work().assessments).toEqual(committed.assessments);expect(work().logs).toEqual(committed.logs);
  expect(post.mock.calls).toHaveLength(3);
  for(const call of post.mock.calls){expect(call[0]).toBe(path);expect(call[1]).toEqual(body);expect(call[2]).toEqual(post.mock.calls[0][2]);}
  const stored=readStore();
  expect(stored.command_requests[scope]).toEqual(originalReceipt);
  expect(stored.command_requests[scope].result).toEqual(originalResult);
});

test('failed persistence commits neither Review effects nor its receipt; the same request recovers once',async()=>{
  const before=sessionStorage.getItem(STORE_KEY),write=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('SYNTHETIC failed atomic storage commit');});
  try{
    try{await api.post(path,body,{headers});throw new Error('Expected atomic persistence failure');}
    catch(error){expect(error.message).toContain('Changes were not saved');expect(error.response.headers['x-create-rejected']).toBeUndefined();}
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  }finally{write.mockRestore();}
  expect(receipt(readStore())).toBeUndefined();expect(work().reviews).toHaveLength(0);
  const saved=(await api.post(path,body,{headers})).data;
  expect(receipt(readStore()).result).toEqual(saved);expect(work().reviews).toHaveLength(1);
  expect((await api.post(path,body,{headers})).data).toEqual(saved);
});

test.each([['30',30],[true,1]])('keyed native defaults and integer coercion %s create normal work without inventing dates',async(value,expected)=>{
  const coerced=(await api.post(path,{...body,custom_recurrence_days:value},{headers})).data;
  expect(coerced.custom_recurrence_days).toBe(expected);expect(coerced.current_occurrence_id).toBeTruthy();
  const other=readStore().framework_assessments.find(assessment=>assessment.client_id===cid&&assessment.definition_id!==row.definition_id);
  const unscheduled=(await api.post(`/framework_assessments/${other.framework_assessment_id}/reviews`,{title:'SYNTHETIC organization-defined unscheduled Review'},
    {headers:{'Idempotency-Key':'synthetic_framework_review_defaults_0001'}})).data;
  expect(unscheduled).toMatchObject({recurrence:'quarterly',due_date:null,status:'needs_scheduling'});
});

test('headerless canonical reuse and keyed plan reuse preserve the existing schedule, occurrence and history',async()=>{
  const plan=cis.review_plans.find(current=>current.safeguards.includes(row.definition_id));
  expect(plan).toBeDefined();
  const original=(await api.post(path,{...body,plan_key:plan.key})).data;
  const beforeReuse=work(),hydrated=beforeReuse.reviews.find(review=>review.review_id===original.review_id);
  expect(hydrated).toEqual({...original,occurrences:[]});
  const reused=(await api.post(path,{plan_key:plan.key,title:'',owner_id:'synthetic_missing_owner',recurrence:'monthly',due_date:'not-a-date'})).data;
  expect(reused).toEqual(hydrated);expect(work()).toEqual(beforeReuse);
  const keyed=(await api.post(path,{plan_key:plan.key,review_id:original.review_id},{headers})).data;
  expect(keyed).toEqual(hydrated);
  expect(work().reviews).toHaveLength(1);
  expect(work().reviews).toEqual(beforeReuse.reviews);
  expect(work().assessments).toEqual(beforeReuse.assessments);expect(work().logs).toEqual(beforeReuse.logs);
});

test('a fixture-arranged later Review relationship removal survives unknown-intent replay; a fresh setup deliberately relinks it',async()=>{
  let lose=true,originalResult;
  const post=jest.fn(async(...args)=>{
    const response=await api.post(...args);
    if(lose){lose=false;originalResult=clone(response.data);throw new axios.AxiosError('SYNTHETIC response lost after atomic commit','ERR_BAD_RESPONSE',undefined,null,{status:503,headers:{},data:{detail:'SYNTHETIC response lost'}});}
    return response;
  });
  const originalIntent=createIntent(post);
  await expect(originalIntent(path,body)).rejects.toMatchObject({response:{status:503}});
  expect(originalIntent.unconfirmed()).toBe(true);
  const committed=work(),canonical=committed.reviews[0];expect(committed.reviews).toHaveLength(1);
  const originalKey=post.mock.calls[0][2].headers['Idempotency-Key'];
  const originalReceipt=committed.receipts[JSON.stringify([readStore().user.user_id,cid,path,originalKey])];
  expect(originalReceipt.result).toEqual(originalResult);
  expect(canonical).toEqual({...originalResult,occurrences:[]});
  // Synthetic administrative fixture writer, matching a later direct database write.
  // This does not prove a Review unlink API/UI: native DELETE permits Evidence only.
  const administrativeFixture=readStore();
  const changed=administrativeFixture.framework_assessments.find(assessment=>assessment.framework_assessment_id===row.framework_assessment_id);
  expect(changed.related_links).toContainEqual({kind:'reviews',id:canonical.review_id});
  changed.related_links=changed.related_links.filter(link=>!(link.kind==='reviews'&&link.id===canonical.review_id));
  saveStore(administrativeFixture);
  const removed=work(),saved=sessionStorage.getItem(STORE_KEY),storage=jest.spyOn(Storage.prototype,'setItem');
  expect((await originalIntent.retry()).data).toEqual(originalReceipt.result);
  expect(originalIntent.unconfirmed()).toBe(false);
  expect(storage).not.toHaveBeenCalled();expect(sessionStorage.getItem(STORE_KEY)).toBe(saved);expect(work()).toEqual(removed);
  expect(work().assessments.find(assessment=>assessment.framework_assessment_id===row.framework_assessment_id).related_links).not.toContainEqual({kind:'reviews',id:canonical.review_id});
  const freshIntent=createIntent(post);
  expect((await freshIntent(path,body)).data).toEqual(canonical);
  expect(freshIntent.unconfirmed()).toBe(false);
  expect(post.mock.calls[1][2]).toEqual(post.mock.calls[0][2]);
  expect(post.mock.calls[2][2].headers['Idempotency-Key']).not.toBe(post.mock.calls[0][2].headers['Idempotency-Key']);
  const relinked=work(),removedRow=removed.assessments.find(assessment=>assessment.framework_assessment_id===row.framework_assessment_id);
  expect(relinked.reviews).toEqual(committed.reviews);
  expect(relinked.assessments.find(assessment=>assessment.framework_assessment_id===row.framework_assessment_id)).toEqual({
    ...removedRow,related_links:[...removedRow.related_links,{kind:'reviews',id:canonical.review_id}],
  });
  expect(relinked.logs.filter(event=>event.action==='Framework Review linked')).toHaveLength(removed.logs.filter(event=>event.action==='Framework Review linked').length+1);
  expect(Object.keys(relinked.receipts)).toHaveLength(Object.keys(removed.receipts).length+1);
});
