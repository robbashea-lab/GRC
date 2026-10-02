import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {STORE_KEY} from './store';
import catalog from '@catalogs/onboardingCatalog.json';
import contract from '@contracts/framework-capabilities.json';
import {FRAMEWORKS} from '../lib/frameworks';

const api=axios.create({adapter:previewAdapter});
let cid,rows;
beforeEach(async()=>{
  sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');
  cid=(await api.post('/clients',{name:'New capability contract client'})).data.client_id;
  const state={version:3,step:3,policies:Object.fromEntries(catalog.policies.map(p=>[p.key,'unsure'])),
    requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,['cis-ig1','soc-2','iso-27001'].includes(f.key)?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}};
  await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true});
  rows=(await Promise.all(['cis-ig1','soc-2','iso-27001'].map(key=>api.get('/frameworks/'+key,{params:{client_id:cid}})))).flatMap(r=>r.data.assessments);
});
const request=async(path,body)=>{try{return await api.patch(path,body);}catch(error){return error.response;}};

test('shared framework acceptance, rejection and stale-write contract',async()=>{
  for(const scenario of contract.framework_cases){
    const row=rows.find(r=>r.framework_key===scenario.framework&&r.definition_id===scenario.definition);
    const path='/framework_assessments/'+row.framework_assessment_id,before=(await api.get(path)).data;
    const response=await request(path,{...scenario.patch,expected_last_assessed:before.last_assessed??null});
    expect({scenario:scenario.name,status:response.status}).toEqual({scenario:scenario.name,status:scenario.status});
    if(response.status===200)expect(response.data).toMatchObject(scenario.patch);
    else expect((await api.get(path)).data).toEqual(before);
  }
  const row=rows.find(r=>r.framework_key==='cis-ig1'&&r.definition_id==='1.1');
  expect((await request('/framework_assessments/'+row.framework_assessment_id,{verification:'verified',expected_last_assessed:null})).status).toBe(contract.stale_write_status);
});

test('capabilities do not grant writes or tenant membership',async()=>{
  const row=rows.find(r=>r.framework_key==='cis-ig1'&&r.definition_id==='1.1');
  for(const scenario of contract.access_cases){
    const db=JSON.parse(sessionStorage.getItem(STORE_KEY));
    db.user.role=scenario.role;db.user.client_ids=[scenario.client_scope==='same'?cid:'other-tenant'];
    sessionStorage.setItem(STORE_KEY,JSON.stringify(db));
    const result=await request('/framework_assessments/'+row.framework_assessment_id,{cis_assessment_criteria:['1.1-c1'],expected_last_assessed:null});
    expect({scenario:scenario.name,status:result.status}).toEqual({scenario:scenario.name,status:scenario.status});
  }
  const stored=JSON.parse(sessionStorage.getItem(STORE_KEY)).framework_assessments.find(r=>r.framework_assessment_id===row.framework_assessment_id);
  expect(stored).not.toHaveProperty('cis_assessment_criteria');
});
