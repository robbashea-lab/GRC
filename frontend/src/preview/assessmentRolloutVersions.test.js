import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {FRAMEWORKS} from '../lib/frameworks';
import baseline from '@catalogs/onboardingCatalog.json';
import {socGuidedCatalog,socQuestions,socGuidedResult} from '../lib/socGuidedAssessment';
import {isoGuidedCatalog,isoQuestions,isoGuidedResult} from '../lib/isoGuidedAssessment';

// Unlike the immutable authored-V2 fixture suite, these use real, unpatched defaults.
const api=axios.create({adapter:previewAdapter});
const state={version:3,step:3,policies:Object.fromEntries(baseline.policies.map(policy=>[policy.key,'unsure'])),
  requirements:Object.fromEntries(FRAMEWORKS.map(framework=>[framework.key,['soc-2','iso-27001'].includes(framework.key)?'applies':'does_not_apply'])),
  reviews:[],framework_reviews:{}};

beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});

test.each([
  ['soc-2','CC6.1',socGuidedCatalog,socQuestions,socGuidedResult,'soc2-assessment-rollout-1'],
  ['iso-27001','6.1.2',isoGuidedCatalog,isoQuestions,isoGuidedResult,'iso27001-assessment-rollout-1'],
])('%s fresh native Demo interview uses the rollout version and persists optional context without saving its assessment',async(framework,id,catalog,questions,evaluate,version)=>{
  expect(catalog.version).toBe(version);
  const client=(await api.post('/clients',{name:'SYNTHETIC rollout version fixture'})).data;
  await api.post('/onboarding/baseline',{client_id:client.client_id,state,finalize:true});
  const workspace=(await api.get('/frameworks/'+framework,{params:{client_id:client.client_id}})).data;
  const row=workspace.assessments.find(item=>item.definition_id===id),path='/framework_assessments/'+row.framework_assessment_id;
  const before=(await api.get(path)).data;
  const initial=(await api.get(path+'/guided-assessment')).data;
  expect(initial.version).toBe(version);expect(initial.answers).toEqual({});
  const answers={};
  for(let pass=0;pass<30;pass++){
    const missing=questions(id,answers,version).filter(question=>!(question.id in answers));
    if(!missing.length)break;
    for(const question of missing)answers[question.id]=question.type==='text'?'':question.type==='context'?'Relevant':question.optional?'No':'Yes';
  }
  const context=catalog.definitions[id].groups.find(group=>group.id==='implementation_context');
  expect(context).toBeTruthy();
  for(const question of context.questions)answers[question.id]='Exact optional custom text — '+question.id;
  const result=evaluate(id,answers,version,client.name);
  const body={version,answers,step:0,completed:true,narrative:result.narrative,result,expected_revision:initial.revision,
    summary_review:{version,answers},base_assessment_token:initial.current_assessment_token,base_scope_fingerprint:initial.current_scope_fingerprint};
  const saved=(await api.put(path+'/guided-assessment',body)).data;
  const reloaded=(await api.get(path+'/guided-assessment')).data;
  expect(reloaded.version).toBe(version);expect(reloaded.answers).toEqual(answers);expect(reloaded.narrative).toBe(saved.narrative);
  for(const question of context.questions)expect(reloaded.answers[question.id]).toBe(answers[question.id]);
  expect((await api.get(path)).data).toEqual(before);
  expect(reloaded.result.status).toBe('addressed');
});
