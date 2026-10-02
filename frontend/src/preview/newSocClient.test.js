// DEMO — SYNTHETIC DATA. A newly created SOC 2 Demo client gets the SOC 2 reference workspace.
import axios from 'axios';
import {previewAdapter} from './adapter';
import baseline from '../lib/onboardingCatalog.json';
import {CATALOGS,FRAMEWORKS} from '../lib/frameworks';
import {isReferenceSocAssessment} from '../lib/reference';
import socGuidance from '../lib/operatorGuidance/socAssessmentGuidance.json';
const api=axios.create({adapter:previewAdapter});
const get=async(path,cid)=>(await api.get(path,{params:{client_id:cid}})).data;
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});
test('new SOC 2 Demo client: same workspace and assessment functions as Prestige, isolated records',async()=>{
  const {data:client}=await api.post('/clients',{name:'SOC 2 Readiness QA',industry:'Synthetic services'}),cid=client.client_id;
  const state={version:3,step:3,requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,f.key==='soc-2'?'applies':'does_not_apply'])),
    policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'no'])),reviews:[],
    framework_reviews:Object.fromEntries((CATALOGS['soc-2'].review_plans||[]).map(p=>[p.key,{enabled:false}]))};
  await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true});
  const user=(await api.get('/auth/me')).data;
  // Selection follows the configured framework, not the client name or ID.
  expect(isReferenceSocAssessment(cid,'soc-2',user)).toBe(true);
  expect(isReferenceSocAssessment(cid,'cis-ig1',user)).toBe(false);
  const prestigeBefore=await get('/frameworks/soc-2','demo_prestige');
  const ws=await get('/frameworks/soc-2',cid);
  // Criteria follow the client's own SOC 2 configuration (Prestige also has optional categories).
  expect(ws.assessments.length).toBeGreaterThan(0);
  expect(ws.active_definition_ids.every(id=>ws.assessments.some(a=>a.definition_id===id))).toBe(true);
  expect(ws.assessments.every(a=>a.client_id===cid&&a.status==='not_assessed')).toBe(true);
  // Tiered guidance checks and verification save for the new client, as for Prestige.
  const row=ws.assessments.find(a=>socGuidance.criteria[a.definition_id]?.items?.length);
  const check=socGuidance.criteria[row.definition_id].items[0].id;
  const {data:saved}=await api.patch('/framework_assessments/'+row.framework_assessment_id,{status:'in_progress',soc_assessment_checks:[check],verification:'needs_validation',expected_last_assessed:null});
  expect(saved).toMatchObject({client_id:cid,status:'in_progress',soc_assessment_checks:[check],verification:'needs_validation'});
  // No leakage: Prestige's same criterion is untouched, and the new client sees only its own rows.
  const prestigeAfter=await get('/frameworks/soc-2','demo_prestige');
  expect(prestigeAfter.assessments).toEqual(prestigeBefore.assessments);
  expect((await get('/frameworks/soc-2',cid)).assessments.every(a=>a.client_id===cid)).toBe(true);
  await expect(api.get('/frameworks/soc-2',{params:{client_id:'demo_unknown'}})).rejects.toBeTruthy();
});
