import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {readStore,saveStore} from './store';
import {FRAMEWORKS,CATALOGS} from '../lib/frameworks';
import {socGuidedCatalog,socQuestions,socGuidedResult,socGuidedEnabled} from '../lib/socGuidedAssessment';
import baseline from '@catalogs/onboardingCatalog.json';
const api=axios.create({adapter:previewAdapter}),categories=Object.keys(CATALOGS['soc-2'].categories);
let cid;
const state=programs=>({version:3,step:3,policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,programs.includes(f.key)?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}});
const workspace=async id=>(await api.get('/frameworks/soc-2',{params:{client_id:id||cid}})).data;
async function configure(programs=['soc-2']){await api.post('/onboarding/baseline',{client_id:cid,state:state(programs),finalize:true});return workspace();}
async function scope(selected){const config=(await workspace()).configuration;await api.patch('/frameworks/soc-2/configuration',{client_id:cid,categories:selected,expected_updated_at:config.expected_updated_at??null});return workspace();}
const complete=id=>Object.fromEntries(socQuestions(id,{},socGuidedCatalog.version).filter(q=>!q.condition).map(q=>[q.id,q.type==='context'?'Relevant':q.type==='text'?'':'Yes']));
async function completed(row){
  const path='/framework_assessments/'+row.framework_assessment_id+'/guided-assessment',initial=(await api.get(path)).data;
  const answers=complete(row.definition_id);for(const q of socQuestions(row.definition_id,answers))if(!(q.id in answers))answers[q.id]=q.type==='text'?'':'Yes';
  const result=socGuidedResult(row.definition_id,answers,initial.version,'Agent 2 synthetic SOC');
  return (await api.put(path,{version:initial.version,answers,summary_review:{version:initial.version,answers},step:0,completed:true,narrative:result.narrative,result,expected_revision:initial.revision,base_assessment_token:initial.current_assessment_token,base_scope_fingerprint:initial.current_scope_fingerprint})).data;
}
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');cid=(await api.post('/clients',{name:'Agent 2 isolated SOC fixture'})).data.client_id;});
test('new SOC onboarding defaults to33 clean Common Criteria and add-program preserves other programs',async()=>{
  const first=await configure();expect(first.active_definition_ids).toHaveLength(33);expect(first.assessments.every(a=>a.status==='not_assessed'&&!a.implementation&&!a.assessment_history?.length)).toBe(true);
  expect(first.assessments.every(a=>socGuidedEnabled(cid,{user_id:'demo_admin'},'soc-2',first.configuration,a.definition_id))).toBe(true);
  const existing=(await api.post('/clients',{name:'Agent 2 existing add-SOC fixture'})).data.client_id;
  await api.post('/onboarding/baseline',{client_id:existing,state:state(['cis-ig1','iso-27001']),finalize:true});
  const prior=readStore().framework_assessments.filter(a=>a.client_id===existing);
  await api.patch('/onboarding/programs/soc-2',{client_id:existing,applicability:'applies'});
  const added=await workspace(existing);expect(added.active_definition_ids).toHaveLength(33);expect(added.assessments.every(a=>a.status==='not_assessed')).toBe(true);
  expect(readStore().framework_assessments.filter(a=>a.client_id===existing&&a.framework_key!=='soc-2')).toEqual(prior);
  await api.patch('/onboarding/programs/soc-2',{client_id:existing,applicability:'applies'});expect((await workspace(existing)).assessments).toHaveLength(33);
});
test('every61criterion saves only progress then exact text/status with native history and no collateral mutation',async()=>{
  await configure();const all=await scope(categories);expect(all.active_definition_ids).toHaveLength(61);
  for(const row of all.assessments){
    const before=JSON.parse(JSON.stringify(row)),draft=await completed(row),path='/framework_assessments/'+row.framework_assessment_id;
    expect((await api.get(path)).data).toEqual(before);
    const text=draft.narrative+'\n\nOperator-reviewed wording.';
    const reviewed=(await api.put(path+'/guided-assessment',{version:draft.version,answers:draft.answers,step:draft.step,completed:true,narrative:text,result:{...draft.result,narrative:text},expected_revision:draft.revision})).data;
    const body={implementation:text,status:reviewed.result.status,record_assessment:reviewed.result.status!=='not_assessed',guided_assessment_source:Object.fromEntries(['version','revision','generated_at'].map(k=>[k,reviewed[k]])),expected_last_assessed:before.last_saved||before.last_assessed||null};
    const saved=(await api.patch(path,body)).data;expect(saved.implementation).toBe(text);expect(saved.status).toBe('addressed');
    for(const key of ['verification','soc_assessment_checks','management_controls','notes','related_links'])expect(saved[key]).toEqual(before[key]);
    expect(saved.assessment_history.at(-1).guided_assessment_source.answers).toEqual(draft.answers);
    expect((await api.get(path)).data.implementation).toBe(text);
    await expect(api.patch(path,body)).rejects.toMatchObject({response:{status:409}});
  }
  const snapshot=readStore();expect(snapshot.findings.filter(row=>row.client_id===cid)).toHaveLength(0);
},60000);
test('categories exclude retained interviews fromrecommendations and deactivation/reactivation is idempotent',async()=>{
  await configure();const all=await scope(categories),privacy=all.assessments.find(a=>a.definition_id==='P1.1'),saved=await completed(privacy);
  const narrowed=await scope(['security']);expect(narrowed.active_definition_ids).toHaveLength(33);expect(narrowed.guided_assessment_drafts['P1.1']).toBeUndefined();
  await expect(api.get('/framework_assessments/'+privacy.framework_assessment_id+'/guided-assessment')).rejects.toMatchObject({response:{status:404}});
  await scope(categories);expect((await api.get('/framework_assessments/'+privacy.framework_assessment_id+'/guided-assessment')).data.answers).toEqual(saved.answers);
  const records=readStore().framework_assessments.filter(a=>a.client_id===cid);
  await api.patch('/onboarding/programs/soc-2',{client_id:cid,applicability:'does_not_apply'});await expect(api.get('/framework_assessments/'+privacy.framework_assessment_id+'/guided-assessment')).rejects.toMatchObject({response:{status:404}});
  await api.patch('/onboarding/programs/soc-2',{client_id:cid,applicability:'applies'});expect(readStore().framework_assessments.filter(a=>a.client_id===cid)).toEqual(records);
});
test('scope/context/manual changes and forged property updates reject stale or misleading application',async()=>{
  const w=await configure(),row=w.assessments[0],draft=await completed(row),path='/framework_assessments/'+row.framework_assessment_id;
  const body={implementation:draft.narrative,status:draft.result.status,guided_assessment_source:Object.fromEntries(['version','revision','generated_at'].map(k=>[k,draft[k]])),expected_last_assessed:row.last_saved||row.last_assessed||null};
  for(const extra of [{status:'not_applicable',na_rationale:'Outsourced'},{verification:'verified'},{implementation:'Unreviewed text'}])await expect(api.patch(path,{...body,...extra})).rejects.toThrow();
  await api.patch(path,{implementation:'Manual native correction'});await expect(api.patch(path,{...body,expected_last_assessed:(await api.get(path)).data.last_saved})).rejects.toMatchObject({response:{status:409}});
  expect((await api.get(path)).data.implementation).toBe('Manual native correction');
});
test('existing non-Prestige SOC defaults, wrong-client and reader denial remain authoritative in Demo adapter',async()=>{
  const w=await configure(),row=w.assessments[0],path='/framework_assessments/'+row.framework_assessment_id+'/guided-assessment';
  expect((await api.get(path)).data.version).toBe(socGuidedCatalog.version);
  const db=readStore();db.user={...db.user,role:'client_readonly',client_ids:[cid]};saveStore(db);
  expect((await api.get(path)).data.answers).toEqual({});await expect(api.put(path,{version:socGuidedCatalog.version,answers:{},step:0,completed:false,expected_revision:0})).rejects.toMatchObject({response:{status:403}});
  const other=readStore();other.user={...other.user,client_ids:[]};saveStore(other);await expect(api.get(path)).rejects.toMatchObject({response:{status:403}});
});
