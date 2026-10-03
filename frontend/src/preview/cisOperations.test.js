import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {STORE_KEY} from './store';
import catalog from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS} from '../lib/frameworks';
const api=axios.create({adapter:previewAdapter});
let cid;
const state=keys=>({version:3,step:3,policies:Object.fromEntries(catalog.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,keys.includes(f.key)?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}});
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');cid=(await api.post('/clients',{name:'Synthetic CIS operating setup'})).data.client_id;});
test('fresh, repeated and later-enabled clients retain records and get additive operating arrangements',async()=>{
 await api.post('/onboarding/baseline',{client_id:cid,state:state([]),finalize:true});
 const policies=(await api.get('/policies',{params:{client_id:cid}})).data;
 await api.post('/onboarding/baseline',{client_id:cid,state:state(['cis-ig1']),finalize:true});
 let workspace=(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data;
 expect(workspace.assessments).toHaveLength(56);expect((await api.get('/policies',{params:{client_id:cid}})).data.map(p=>p.policy_id)).toEqual(policies.map(p=>p.policy_id));
 const db=JSON.parse(sessionStorage.getItem(STORE_KEY));db.users.push({user_id:'cis_ops_owner',name:'Synthetic Operator',role:'client_contributor',status:'active',client_ids:[cid]});sessionStorage.setItem(STORE_KEY,JSON.stringify(db));
 for(const id of ['1.2','6.2','4.1','11.2']){
  const row=workspace.assessments.find(r=>r.definition_id===id),path='/framework_assessments/'+row.framework_assessment_id;
  const saved=(await api.patch(path,{owner_id:'cis_ops_owner',implementation:`Synthetic ${id} operating procedure and provider escalation`,cis_operation:{provider:'Synthetic MSP',confirmed:true},expected_last_assessed:null})).data;
  expect(saved.status).toBe('not_assessed');expect(saved.verification).toBeUndefined();expect(saved.cis_operation.confirmed).toBe(true);
  expect((await api.get(path)).data.cis_operation).toEqual(saved.cis_operation);
 }
 const before=JSON.stringify((await api.get('/reviews',{params:{client_id:cid}})).data);
 await api.post('/onboarding/baseline',{client_id:cid,state:state(['cis-ig1']),finalize:true});
 expect(JSON.stringify((await api.get('/reviews',{params:{client_id:cid}})).data)).toBe(before);
 workspace=(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data;
 expect(workspace.assessments.find(r=>r.definition_id==='6.2').cis_operation.confirmed).toBe(true);
});
test('invalid arrangement confirmation and cross-framework field injection are rejected',async()=>{
 await api.post('/onboarding/baseline',{client_id:cid,state:state(['cis-ig1','iso-27001']),finalize:true});
 const cis=(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data.assessments[0],path='/framework_assessments/'+cis.framework_assessment_id;
 for(const value of [{confirmed:true},{confirmed:'true'},{provider:null},{confirmed:null},{provider:'x'.repeat(2001)},{role:'super_admin'}])await expect(api.patch(path,{cis_operation:value,expected_last_assessed:null})).rejects.toThrow();
 const iso=(await api.get('/frameworks/iso-27001',{params:{client_id:cid}})).data.assessments[0];
 await expect(api.patch('/framework_assessments/'+iso.framework_assessment_id,{cis_operation:{confirmed:false},expected_last_assessed:null})).rejects.toThrow();
});
