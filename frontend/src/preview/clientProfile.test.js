import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore,saveStore} from './store';
import catalog from '../lib/onboardingCatalog.json';
import {completeness,validateProfile,applicabilityPrompts} from '../lib/clientProfile';
const api=axios.create({adapter:previewAdapter});
let cid;
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');cid=(await api.post('/clients',{name:'Profile QA'})).data.client_id;});
const profile=async()=>(await api.get('/clients/'+cid+'/profile')).data;
const save=async(section,values)=>api.patch('/clients/'+cid+'/profile',{section,values,expected_updated_at:(await profile()).updated_at});
test('optional metadata persists without operational entities and audits changes',async()=>{
  const before=readStore();
  await save('organization',{employees:0,cyber_insurance:'No',workforce:'Unknown'});
  await save('technical',{cloud:['None'],identity:['Microsoft Entra ID']});
  const after=await profile();
  expect(after.profile.organization.employees).toBe(0);
  expect(completeness(after.profile).percent).toBe(50);
  expect(after.history).toHaveLength(2);
  expect(readStore().vendors).toEqual(before.vendors);
  expect(readStore().risks).toEqual(before.risks);
  await expect(api.patch('/clients/'+cid+'/profile',{section:'organization',values:{employees:3},expected_updated_at:null})).rejects.toBeTruthy();
});
test('validation distinguishes unknown, no, N/A and rejects invalid fields',()=>{
  expect(completeness({}).percent).toBe(0);
  expect(validateProfile('security',{incident_response:'Not Applicable',collects:'Unknown'})).toEqual({incident_response:'Not Applicable',collects:'Unknown'});
  for(const values of [{employees:true},{employees:-1},{insurance_renewal:'2026-02-30'},{it_management:['Unknown','MSP']},{role:'super_admin'}])expect(()=>validateProfile('organization',values)).toThrow();
  expect(applicabilityPrompts({security:{data_types:['CUI']}},[{baseline_key:'cmmc',applicability:'not_applicable'}])).toHaveLength(1);
});
test('first completion is immutable through enrichment, retirement and later finalize',async()=>{
  const state={version:3,step:3,policies:Object.fromEntries(catalog.policies.map(p=>[p.key,'unsure'])),requirements:{'cis-ig1':'applies'},reviews:[]};
  await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true});
  const baseline=(await profile()).baseline, reviews=readStore().reviews.filter(r=>r.client_id===cid);
  expect(baseline.policies).toBe(17);
  await save('security',{data_types:['CUI']});
  await api.patch('/onboarding/programs/cis-ig1',{client_id:cid,applicability:'retired',reason:'Program retired',effective_date:'2026-01-01'});
  expect(readStore().reviews.filter(r=>r.client_id===cid).map(r=>r.review_id)).toEqual(reviews.map(r=>r.review_id));
  await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true});
  expect((await profile()).baseline).toEqual(baseline);
});
test('client member can read own context but not edit or see unrelated client',async()=>{
  const db=readStore();db.user={...db.user,role:'client_contributor',client_ids:[cid]};saveStore(db);
  expect((await profile()).completed).toBe(false);
  await expect(save('organization',{employees:5})).rejects.toBeTruthy();
  const foreign=db.clients.find(c=>c.client_id!==cid).client_id;
  await expect(api.get('/clients/'+foreign+'/profile')).rejects.toBeTruthy();
});
test('original audit-only completion is recognized without inventing intake',async()=>{
  const db=readStore();db.logs.push({client_id:cid,action:'onboarding-complete',at:'2025-01-01T00:00:00Z',user_id:db.user.user_id});saveStore(db);
  const p=await profile();expect(p.completed).toBe(true);expect(p.baseline.state).toEqual({});
  expect((await api.get('/onboarding/handoff',{params:{client_id:cid}})).data.completed).toBe(true);
  await api.patch('/onboarding/programs/cmmc',{client_id:cid,applicability:'applies'});
  expect((await profile()).baseline).toEqual(p.baseline);
});
