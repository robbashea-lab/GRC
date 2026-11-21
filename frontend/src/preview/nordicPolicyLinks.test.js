import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {readStore,saveStore} from './store';
import catalog from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS} from '../lib/frameworks';
const api=axios.create({adapter:previewAdapter});
let cid,path,row;
beforeEach(async()=>{
  sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');
  cid=(await api.post('/clients',{name:'Nordic canonical policy QA'})).data.client_id;
  const state={version:3,step:3,policies:Object.fromEntries(catalog.policies.map(policy=>[policy.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(framework=>[framework.key,framework.key==='cis-ig1'?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}};
  await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true});
  row=(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data.assessments.find(item=>item.definition_id==='4.1');
  path='/framework_assessments/'+row.framework_assessment_id;
  const db=readStore();db.policies.push({client_id:cid,policy_id:'local-nordic',baseline_key:'policy-configuration-management-policy',title:'Saved policy',version:'1',status:'draft'},{client_id:'foreign',policy_id:'foreign-nordic',title:'Private'});saveStore(db);
});
test('native Demo clear replacement reload stale retry and foreign denial use one authoritative list',async()=>{
  expect((await api.get(path+'/related')).data.policies.some(policy=>policy.policy_id==='local-nordic')).toBe(true);
  const token=row.last_saved??row.last_assessed??null;
  const cleared=(await api.patch(path,{policy_link_ids:[],expected_last_assessed:token})).data;
  expect((await api.get(path+'/related')).data.policies).toEqual([]);
  expect(cleared.last_assessed).toBe(row.last_assessed);expect(cleared.assessment_history).toEqual(row.assessment_history);
  await expect(api.patch(path,{policy_link_ids:['local-nordic'],expected_last_assessed:token})).rejects.toMatchObject({response:{status:409}});
  await expect(api.patch(path,{policy_link_ids:['foreign-nordic'],expected_last_assessed:cleared.last_saved})).rejects.toMatchObject({response:{status:422}});
  const replacement=(await api.patch(path,{policy_link_ids:['local-nordic'],expected_last_assessed:cleared.last_saved})).data;
  expect((await api.get(path)).data.policy_link_ids).toEqual(['local-nordic']);
  expect((await api.get(path+'/related')).data.policies.map(policy=>policy.policy_id)).toEqual(['local-nordic']);
  const unchanged=(await api.patch(path,{policy_link_ids:['local-nordic'],expected_last_assessed:replacement.last_saved})).data;
  expect(unchanged.last_saved).toBe(replacement.last_saved);expect(unchanged.assessment_history).toEqual(row.assessment_history);
});

test('linked Review subject context excludes a foreign client even when display names agree',async()=>{
  const db=readStore();
  for(const [kind,field] of [['risks','risk_id'],['vendors','vendor_id'],['ai_systems','ai_system_id']]){
    db[kind].push({[field]:'local-'+kind,client_id:cid,title:'Same title',name:'Same title',status:'draft'},{[field]:'foreign-'+kind,client_id:'foreign',title:'Same title',name:'Same title',status:'approved'});
  }
  for(const prefix of ['local','foreign'])db.reviews.push({review_id:prefix+'-subject-review',client_id:cid,title:'Unrelated title',framework_key:row.framework_key,framework_safeguards:[row.definition_id],status:'needs_scheduling',risk_id:prefix+'-risks',vendor_id:prefix+'-vendors',ai_system_id:prefix+'-ai_systems'});
  saveStore(db);
  const related=(await api.get(path+'/related')).data;
  for(const [kind,field] of [['risks','risk_id'],['vendors','vendor_id'],['ai_systems','ai_system_id']])expect(related[kind].map(subject=>subject[field])).toEqual(['local-'+kind]);
});
