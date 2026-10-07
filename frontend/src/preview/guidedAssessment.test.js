import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {guidedCatalog,versionForSafeguard} from '../lib/guidedAssessment';
import baseline from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS} from '../lib/frameworks';
const api=axios.create({adapter:previewAdapter});
let row,path;
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');const w=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data;row=w.assessments.find(a=>a.definition_id==='1.1');path='/framework_assessments/'+row.framework_assessment_id+'/guided-assessment';});
const body={version:versionForSafeguard('1.1'),answers:{inventory:'No',existing:'Manual list'},step:1,completed:false,expected_revision:0};
test('save and resume leave native assessment evidence and history unchanged',async()=>{
  const first=(await api.put(path,body)).data;expect(first.revision).toBe(1);
  expect((await api.get(path)).data.answers).toEqual(body.answers);
  expect((await api.get('/framework_assessments/'+row.framework_assessment_id)).data).toEqual(row);
  await expect(api.put(path,body)).rejects.toMatchObject({response:{status:409}});
});
test('Apply uses normal save and preserves verification and history attribution',async()=>{
  const draft=(await api.put(path,{...body,completed:true})).data,source=Object.fromEntries(['version','revision','generated_at'].map(k=>[k,draft[k]]));
  const result=(await api.patch('/framework_assessments/'+row.framework_assessment_id,{implementation:'Brawndo reports no inventory.',status:'needs_attention',guided_assessment_source:source})).data;
  expect(result.verification).toBe(row.verification);expect(result.last_assessed).toBeTruthy();
  expect(result.assessment_history.at(-1).guided_assessment_source.answers).toEqual(body.answers);
  expect(result.related_links).toEqual(row.related_links);
  const edited=(await api.patch('/framework_assessments/'+row.framework_assessment_id,{implementation:'Manual correction'})).data;
  expect(edited.guided_assessment_source).toBeNull();
});
test('applicable CIS clients start clean and unrelated frameworks reject access',async()=>{
  const cis=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_initech'}})).data;
  const interview=(await api.get('/framework_assessments/'+cis.assessments.find(a=>a.definition_id==='1.1').framework_assessment_id+'/guided-assessment')).data;
  expect(interview.answers).toEqual({});expect(interview.revision).toBe(0);
  for(const [framework,cid] of [['soc-2','demo_prestige'],['iso-27001','demo_dunder']]){
    const w=(await api.get('/frameworks/'+framework,{params:{client_id:cid}})).data;
    if(w.assessments?.length)await expect(api.get('/framework_assessments/'+w.assessments[0].framework_assessment_id+'/guided-assessment')).rejects.toMatchObject({response:{status:404}});
  }
});

test.each([1,2,3])('new IG%i clients receive canonical clean interviews and preserve inherited work on upgrade',async group=>{
  const cid=(await api.post('/clients',{name:'Temporary Omni provisioning QA'})).data.client_id;
  const state={version:3,step:3,policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,f.key==='cis-ig1'?'applies':'does_not_apply'])),reviews:[],framework_reviews:{},framework_settings:{'cis-ig1':{implementation_group:group}}};
  await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true});
  const workspace=async()=>(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data;
  const initial=await workspace(),first=initial.assessments.find(a=>a.definition_id==='1.1'),route='/framework_assessments/'+first.framework_assessment_id+'/guided-assessment';
  expect(initial.active_definition_ids).toHaveLength({1:56,2:130,3:153}[group]);
  for(const id of Object.keys(guidedCatalog.definitions).filter(id=>guidedCatalog.definitions[id].groups.includes(group))){
    const record=initial.assessments.find(a=>a.definition_id===id);
    expect((await api.get('/framework_assessments/'+record.framework_assessment_id+'/guided-assessment')).data).toMatchObject({version:versionForSafeguard(id),answers:{},revision:0});
  }
  const interview=(await api.put(route,{...body,narrative:'Synthetic preserved narrative',completed:true})).data;
  const original=(await api.patch('/framework_assessments/'+first.framework_assessment_id,{implementation:'Synthetic implementation',status:'needs_attention'})).data;
  for(const next of [2,3].filter(g=>g>group)){
    await api.patch('/frameworks/cis-ig1/configuration',{client_id:cid,implementation_group:next,expected_updated_at:(await workspace()).configuration.expected_updated_at},{headers:{'Idempotency-Key':'omni-upgrade-'+group+'-'+next}});
    const updated=await workspace();expect(updated.active_definition_ids).toHaveLength(next===2?130:153);
    expect(updated.assessments.filter(a=>a.definition_id==='1.1')).toHaveLength(1);
    expect(updated.assessments.find(a=>a.framework_assessment_id===first.framework_assessment_id)).toEqual(original);
    expect((await api.get(route)).data).toEqual(interview);
    for(const id of Object.keys(guidedCatalog.definitions))if(guidedCatalog.definitions[id].groups.includes(next)&&id!=='1.1'){
      const added=updated.assessments.find(a=>a.definition_id===id);
      expect((await api.get('/framework_assessments/'+added.framework_assessment_id+'/guided-assessment')).data.answers).toEqual({});
    }
  }
});

test('direct IG1 to IG3 preserves expanded interview and native history without copying client answers',async()=>{
  const cid=(await api.post('/clients',{name:'Temporary direct upgrade QA'})).data.client_id;
  const state={version:3,step:3,policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,f.key==='cis-ig1'?'applies':'does_not_apply'])),reviews:[],framework_reviews:{},framework_settings:{'cis-ig1':{implementation_group:1}}};
  await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true});
  const workspace=async()=>(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data;
  const initial=await workspace(),record=initial.assessments.find(a=>a.definition_id==='2.1');
  const route='/framework_assessments/'+record.framework_assessment_id+'/guided-assessment';
  const interview=(await api.put(route,{...body,version:versionForSafeguard('2.1'),answers:{practice:'Partially',operation:'Synthetic preserved software process'},narrative:'Operator supplied summary'})).data;
  const saved=(await api.patch('/framework_assessments/'+record.framework_assessment_id,{implementation:'Preserved implementation',status:'in_progress'})).data;
  await api.patch('/frameworks/cis-ig1/configuration',{client_id:cid,implementation_group:3,expected_updated_at:initial.configuration.expected_updated_at},{headers:{'Idempotency-Key':'omni-direct-upgrade'}});
  const upgraded=await workspace();
  expect(upgraded.active_definition_ids).toHaveLength(153);
  expect(new Set(upgraded.active_definition_ids).size).toBe(153);
  expect(upgraded.assessments.find(a=>a.framework_assessment_id===record.framework_assessment_id)).toEqual(saved);
  expect((await api.get(route)).data).toEqual(interview);
  expect(upgraded.guided_assessment_drafts['2.1']).toEqual({revision:1,completed:false});
  const added=upgraded.assessments.find(a=>a.definition_id==='18.5');
  expect((await api.get('/framework_assessments/'+added.framework_assessment_id+'/guided-assessment')).data).toMatchObject({answers:{},revision:0});
});
