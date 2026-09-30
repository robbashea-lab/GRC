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
  for(const patch of [{verification:'verified'},{verification_checklist:{}}])await expect(api.patch(path,{...patch,expected_last_assessed:null})).rejects.toThrow('Verification fields apply only to CIS Controls IG1');
  const saved=(await api.patch(path,{notes:'CSF note',expected_last_assessed:null})).data;
  expect(saved.assessment_history.at(-1)).not.toHaveProperty('verification');
});

test('stale edits are still rejected',async()=>{
  const [row,path]=await cisRow();
  await api.patch(path,{verification:'gap_identified',expected_last_assessed:row.last_assessed??null});
  await expect(api.patch(path,{verification:'verified',expected_last_assessed:row.last_assessed??null})).rejects.toThrow('Assessment changed since it was opened');
});
