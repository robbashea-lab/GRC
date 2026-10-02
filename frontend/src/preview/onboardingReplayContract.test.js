import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import catalog from '@catalogs/onboardingCatalog.json';

const api=axios.create({adapter:previewAdapter});
const headers={'Idempotency-Key':'onboarding-contract-0001'};
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});
async function setup(){
  const client=(await api.post('/clients',{name:'Onboarding recovery contract'})).data;
  const snapshot=(await api.get('/onboarding/baseline',{params:{client_id:client.client_id}})).data;
  return {client,body:{client_id:client.client_id,finalize:true,expected_updated_at:snapshot.state.updated_at??null,expected_records:snapshot.record_versions,state:{
    version:3,policies:Object.fromEntries(catalog.policies.map(p=>[p.key,'unsure'])),
    requirements:Object.fromEntries(catalog.requirements.map(p=>[p.key,'does_not_apply'])),reviews:[catalog.reviews[0].key]}}};
}
test('missing identity and source versions reject before writes',async()=>{
  const {body}=await setup(),before=sessionStorage.getItem(STORE_KEY);
  await expect(api.post('/onboarding/baseline',body)).rejects.toMatchObject({response:{status:422}});
  for(const key of ['short','invalid spaces in request'])
    await expect(api.post('/onboarding/baseline',body,{headers:{'Idempotency-Key':key}})).rejects.toMatchObject({response:{status:422}});
  await expect(api.post('/onboarding/baseline',{...body,expected_records:undefined},{headers})).rejects.toMatchObject({response:{status:428}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});
test('failed persistence and lost-response replay preserve the original result and later edits',async()=>{
  const {client,body}=await setup(),before=sessionStorage.getItem(STORE_KEY);
  const write=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('injected persistence failure');});
  try{await expect(api.post('/onboarding/baseline',body,{headers})).rejects.toThrow('Changes were not saved');expect(sessionStorage.getItem(STORE_KEY)).toBe(before);}
  finally{write.mockRestore();}
  const completed=(await api.post('/onboarding/baseline',body,{headers})).data;
  const policy=(await api.get('/policies',{params:{client_id:client.client_id}})).data[0];
  await api.patch(`/policies/${policy.policy_id}`,{onboarding_note:'Keep later edit',expected_updated_at:policy.updated_at});
  expect((await api.post('/onboarding/baseline',body,{headers})).data).toEqual(completed);
  expect((await api.get(`/policies/${policy.policy_id}`)).data.onboarding_note).toBe('Keep later edit');
  expect((await api.get('/policies',{params:{client_id:client.client_id}})).data).toHaveLength(catalog.policies.length);
  await expect(api.post('/onboarding/baseline',{...body,state:{...body.state,reviews:[]}},{headers})).rejects.toMatchObject({response:{status:409}});
});
test('source edits and lost tenant access cannot be overwritten by finalization',async()=>{
  const {client,body}=await setup();
  await api.post('/policies',{client_id:client.client_id,title:catalog.policies[0].name,onboarding_note:'New operator record'});
  await expect(api.post('/onboarding/baseline',body,{headers})).rejects.toMatchObject({response:{status:409}});
  expect((await api.get('/policies',{params:{client_id:client.client_id}})).data).toHaveLength(1);
  const db=JSON.parse(sessionStorage.getItem(STORE_KEY));db.user={...db.user,role:'client_viewer',client_ids:['demo_brawndo']};sessionStorage.setItem(STORE_KEY,JSON.stringify(db));
  await expect(api.post('/onboarding/baseline',body,{headers})).rejects.toMatchObject({response:{status:403}});
});

test('legacy finalization rejects foreign, archived and missing assessment Evidence before persisting',async()=>{
  const {client}=await setup();
  const db=JSON.parse(sessionStorage.getItem(STORE_KEY));
  db.evidence.push({evidence_id:'foreign-evidence',client_id:'demo_brawndo'},
    {evidence_id:'archived-evidence',client_id:client.client_id,archived_at:'2026-01-01'});
  sessionStorage.setItem(STORE_KEY,JSON.stringify(db));
  const before=sessionStorage.getItem(STORE_KEY);
  for(const id of ['foreign-evidence','archived-evidence','missing-evidence']){
    await expect(api.post('/onboarding/finalize',{client_id:client.client_id,
      policy_responses:[{name:'Must not appear',response:'yes'}],
      assessments:[{name:'External audit',evidence_ids:[id]}]},{headers})).rejects.toMatchObject({response:{status:422}});
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  }
});
