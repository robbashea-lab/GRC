import axios from 'axios';
import {previewAdapter} from './adapter';
import catalog from '../lib/onboardingCatalog.json';
import {FRAMEWORKS} from '../lib/frameworks';
const api=axios.create({adapter:previewAdapter});
let cid;
const state=programs=>({version:3,step:3,policies:Object.fromEntries(catalog.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,programs.includes(f.key)?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}});
const configure=async(key='cis-ig1')=>{await api.post('/onboarding/baseline',{client_id:cid,state:state([key]),finalize:true});return (await api.get('/frameworks/'+key,{params:{client_id:cid}})).data;};
const cisRow=async()=>{const row=(await configure()).assessments.find(a=>a.definition_id==='1.1');return [row,'/framework_assessments/'+row.framework_assessment_id];};
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');cid=(await api.post('/clients',{name:'Verification QA'})).data.client_id;});

test('verification round-trips, dedupes and is captured in history',async()=>{
  const [row,path]=await cisRow();
  expect(row).not.toHaveProperty('verification');
  const expected={foundation:['1.1-f1','1.1-f2'],mature:['1.1-m10']};
  const saved=(await api.patch(path,{verification:'needs_validation',verification_checklist:{foundation:['1.1-f1','1.1-f2','1.1-f1'],mature:['1.1-m10']},expected_last_assessed:row.last_assessed??null})).data;
  expect(saved.verification_checklist).toEqual(expected);
  const got=(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data.assessments.find(a=>a.framework_assessment_id===row.framework_assessment_id);
  expect([got.verification,got.verification_checklist]).toEqual(['needs_validation',expected]);
  expect(got.assessment_history.at(-1)).toMatchObject({verification:'needs_validation',verification_checklist:expected});
  const again=(await api.patch(path,{verification:'verified',expected_last_assessed:got.last_assessed})).data;
  expect(again.assessment_history.at(-1)).toMatchObject({verification:'verified',verification_checklist:expected});
});

test.each([
  {verification:'done'},{verification_checklist:{extra:[]}},{verification_checklist:{foundation:['1.1-o1']}},
  {verification_checklist:{foundation:['1.2-f1']}},{verification_checklist:{foundation:['1.1_f1']}},{verification_checklist:{foundation:['1.1-f123']}},
  {verification_checklist:{foundation:[1]}},{verification_checklist:{foundation:Array(21).fill('1.1-f1')}},{verification_checklist:['1.1-f1']},
])('rejects invalid verification %j',async patch=>{
  const [row,path]=await cisRow();
  await expect(api.patch(path,{...patch,expected_last_assessed:row.last_assessed??null})).rejects.toThrow();
  const after=(await api.get(path)).data;expect(after).not.toHaveProperty('verification');expect(after.assessment_history).toEqual([]);
});

test('non-CIS assessments reject verification and keep history shape',async()=>{
  const row=(await configure('nist-csf-2')).assessments[0],path='/framework_assessments/'+row.framework_assessment_id;
  await expect(api.patch(path,{verification:'verified',expected_last_assessed:null})).rejects.toThrow('Verification is available only for CIS Controls IG1 and Prestige SOC 2');
  await expect(api.patch(path,{verification_checklist:{},expected_last_assessed:null})).rejects.toThrow('Verification checklists apply only to CIS Controls IG1');
  const saved=(await api.patch(path,{notes:'CSF note',expected_last_assessed:null})).data;
  expect(saved.assessment_history.at(-1)).not.toHaveProperty('verification');
});

test('stale edits are still rejected',async()=>{
  const [row,path]=await cisRow();
  await api.patch(path,{verification:'gap_identified',expected_last_assessed:row.last_assessed??null});
  await expect(api.patch(path,{verification:'verified',expected_last_assessed:row.last_assessed??null})).rejects.toThrow('Assessment changed since it was opened');
});

test('Prestige SOC verification persists without exposing CIS checklists',async()=>{
  cid='demo_prestige';const row=(await api.get('/frameworks/soc-2',{params:{client_id:cid}})).data.assessments.find(a=>a.definition_id==='CC9.2');
  const path='/framework_assessments/'+row.framework_assessment_id;
  const saved=(await api.patch(path,{verification:'needs_validation',expected_last_assessed:row.last_assessed??null})).data;
  expect(saved.verification).toBe('needs_validation');expect(saved.assessment_history.at(-1).verification).toBe('needs_validation');
  expect(saved.assessment_history.at(-1)).not.toHaveProperty('verification_checklist');
  await expect(api.patch(path,{verification_checklist:{},expected_last_assessed:saved.last_assessed})).rejects.toThrow('Verification checklists apply only to CIS Controls IG1');
});

test('Brawndo criteria preserve old checks and history without changing conclusions',async()=>{
  cid='demo_brawndo';
  const row=(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data.assessments.find(a=>a.definition_id==='1.1');
  const path='/framework_assessments/'+row.framework_assessment_id;
  const old=(await api.patch(path,{verification_checklist:{foundation:['1.1-f1']},expected_last_assessed:row.last_assessed??null})).data;
  const saved=(await api.patch(path,{cis_assessment_criteria:['1.1-c1','1.1-c1'],expected_last_assessed:old.last_assessed})).data;
  expect(saved.cis_assessment_criteria).toEqual(['1.1-c1']);
  expect(saved.status).toBe(old.status);expect(saved.verification).toBe(old.verification);
  expect(saved.verification_checklist).toEqual(old.verification_checklist);
  expect(saved.assessment_history.slice(0,-1)).toEqual(old.assessment_history);
  expect(saved.assessment_history.at(-1).cis_assessment_criteria).toEqual(['1.1-c1']);
  expect((await api.get(path)).data.cis_assessment_criteria).toEqual(['1.1-c1']);
  for(const bad of [['1.2-c1'],['1.1-f1'],['1.1-c99'],null,{},Array(21).fill('1.1-c1')])
    await expect(api.patch(path,{cis_assessment_criteria:bad,expected_last_assessed:saved.last_assessed})).rejects.toThrow();
});

test('new criteria cannot be written to another client',async()=>{
  const [row,path]=await cisRow();
  await expect(api.patch(path,{cis_assessment_criteria:[],expected_last_assessed:row.last_assessed??null})).rejects.toThrow();
});

test('SOC guidance saves independently, preserves legacy data and appends immutable history',async()=>{
 const row=(await api.get('/frameworks/soc-2',{params:{client_id:'demo_prestige'}})).data.assessments.find(a=>a.definition_id==='CC9.2');
 const path='/framework_assessments/'+row.framework_assessment_id;
 const baseline=(await api.patch(path,{notes:'Retained assessment note',expected_last_assessed:row.last_assessed??null})).data;
 const saved=(await api.patch(path,{soc_assessment_checks:['CC9.2-v1-r1','CC9.2-v1-o1','CC9.2-v1-r1'],expected_last_assessed:baseline.last_assessed})).data;
 expect(saved.soc_assessment_checks).toEqual(['CC9.2-v1-r1','CC9.2-v1-o1']);
 for(const key of ['status','verification','implementation','notes','management_controls','verification_checklist'])expect(saved[key]).toEqual(baseline[key]);
 expect(saved.assessment_history.slice(0,-1)).toEqual(baseline.assessment_history);
 expect(saved.assessment_history.at(-1).soc_assessment_checks).toEqual(saved.soc_assessment_checks);
 expect((await api.get(path)).data.soc_assessment_checks).toEqual(saved.soc_assessment_checks);
 await expect(api.patch(path,{soc_assessment_checks:[],expected_last_assessed:baseline.last_assessed})).rejects.toThrow('Assessment changed');
 for(const bad of [['CC1.1-v1-r1'],['CC9.2-v1-r99'],['CC9.2-f1'],null,{},[1],Array(31).fill('CC9.2-v1-r1')])
   await expect(api.patch(path,{soc_assessment_checks:bad,expected_last_assessed:saved.last_assessed})).rejects.toThrow();
 const cleared=(await api.patch(path,{soc_assessment_checks:[],expected_last_assessed:saved.last_assessed})).data;
 expect(cleared.soc_assessment_checks).toEqual([]);
 expect(cleared.assessment_history.at(-2).soc_assessment_checks).toEqual(saved.soc_assessment_checks);
});

test.each(['soc-2','cis-ig1','iso-27001'])('SOC guidance cannot affect another client or %s history',async key=>{
 const row=(await configure(key)).assessments[0],path='/framework_assessments/'+row.framework_assessment_id;
 await expect(api.patch(path,{soc_assessment_checks:[],expected_last_assessed:row.last_assessed??null})).rejects.toThrow();
 const saved=(await api.patch(path,{notes:'Ordinary update',expected_last_assessed:row.last_assessed??null})).data;
 expect(saved).not.toHaveProperty('soc_assessment_checks');
 expect(saved.assessment_history.at(-1)).not.toHaveProperty('soc_assessment_checks');
});
