import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import baseline from '../lib/onboardingCatalog.json';
import {FRAMEWORKS,CATALOGS} from '../lib/frameworks';
import {onboardingPreview} from '../lib/onboardingHandoff';

const api=axios.create({adapter:previewAdapter});
let cid;
const get=async path=>(await api.get(path,{params:{client_id:cid}})).data;
const state=programs=>({version:3,step:3,policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,programs.includes(f.key)?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}});
async function configure(programs=['hipaa']){await api.post('/onboarding/baseline',{client_id:cid,state:state(programs),finalize:true});return get('/frameworks/hipaa');}
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');cid=(await api.post('/clients',{name:'HIPAA isolated fixture'})).data.client_id;});

test('HIPAA uses native regulation identifiers, 22 addressable specifications and recommendation-only review cadences',()=>{
  const c=CATALOGS.hipaa;
  expect(c.requirements).toHaveLength(76);expect(new Set(c.requirements.map(d=>d.id)).size).toBe(76);
  expect(c.requirements.filter(d=>d.specification==='addressable')).toHaveLength(22);
  for(const d of c.requirements)expect(d.source).toMatch(/^https:\/\/www.ecfr.gov\/on\/2026-09-18\/title-45\/section-/);
  for(const p of c.review_plans){expect(p.classification).toBe('recommended');expect(p.source_cadence).toContain('does not prescribe');}
});

test('read-only loads do not seed; Settings activation and repeated applies preserve records',async()=>{
  expect((await get('/frameworks/hipaa')).assessments).toHaveLength(0);
  await configure([]);
  for(let n=0;n<2;n++)await api.patch('/onboarding/programs/hipaa',{client_id:cid,applicability:'applies'});
  expect((await get('/frameworks/hipaa')).assessments).toHaveLength(76);
  expect(await get('/reviews')).toHaveLength(8);
  for(const applicability of ['does_not_apply','unsure','applies'])await api.patch('/onboarding/programs/hipaa',{client_id:cid,applicability});
  expect((await get('/frameworks/hipaa')).assessments).toHaveLength(76);expect(await get('/reviews')).toHaveLength(8);
});

test('shared Review counts match onboarding preview and CIS operational records remain unchanged',async()=>{
  await configure(['cis-ig1']);
  const before=await get('/reviews');
  const s=state(['cis-ig1','hipaa']),snapshot=await get('/onboarding/handoff');
  const preview=onboardingPreview(baseline,s,snapshot.records);
  expect(preview.reviews).toMatchObject({total:18,create:6,retain:12});
  expect(preview.assessmentsByProgram).toEqual({'cis-ig1':0,hipaa:76,'iso-27001':0,'soc-2':0,'nist-csf-2':0});
  await configure(['cis-ig1','hipaa']);
  const after=await get('/reviews');expect(after).toHaveLength(18);
  for(const r of before)expect(after.find(a=>a.review_id===r.review_id)).toEqual(r);
});

test('addressable is not optional; rationale and decision remain in assessment history',async()=>{
  const w=await configure(),row=w.assessments.find(a=>a.definition_id==='164.312(a)(2)(iv)'),path='/framework_assessments/'+row.framework_assessment_id;
  await expect(api.patch(path,{status:'not_applicable',na_rationale:'Addressable is not an exemption'})).rejects.toThrow(/Addressable/);
  await expect(api.patch(path,{status:'addressed',implementation:'Implemented'})).rejects.toThrow(/decision/);
  const body={status:'addressed',implementation:'Scoped protection',addressable_decision:'as_written',addressable_rationale:'Documented and reviewed against scoped risk assessment'};
  await api.patch(path,body);await configure();
  const saved=(await get('/frameworks/hipaa')).assessments.find(a=>a.framework_assessment_id===row.framework_assessment_id);
  expect(saved).toMatchObject(body);expect(saved.assessment_history).toHaveLength(1);
});

test('unlinking shared evidence preserves bytes, other assessment and origin; relinking is idempotent',async()=>{
  const w=await configure(['cis-ig1','hipaa']),aid=w.assessments[0].framework_assessment_id,base='/framework_assessments/'+aid;
  const cis=(await get('/frameworks/cis-ig1')).assessments[0],other='/framework_assessments/'+cis.framework_assessment_id;
  const e=(await api.post('/evidence',{client_id:cid,linked_type:'framework_assessment',linked_id:aid,filename:'proof.txt',content_base64:'eA=='})).data;
  const link={kind:'evidence',id:e.evidence_id};await api.post(other+'/links',link);
  await api.delete(base+'/links',{data:link});
  expect((await api.get(base+'/related')).data.evidence).toHaveLength(0);
  expect((await api.get(other+'/related')).data.evidence).toHaveLength(1);
  expect((await api.get('/evidence/'+e.evidence_id+'/download')).data.content_base64).toBe('eA==');
  for(let n=0;n<2;n++)await api.post(base+'/links',link);
  expect((await api.get(base+'/related')).data.evidence).toHaveLength(1);expect(await get('/evidence')).toHaveLength(1);
});

test('client-only and readonly identities cannot cross scope or mutate assessments',async()=>{
  const w=await configure(),aid=w.assessments[0].framework_assessment_id;
  const db=JSON.parse(sessionStorage.getItem(STORE_KEY));db.user.role='client_readonly';db.user.client_ids=[cid];sessionStorage.setItem(STORE_KEY,JSON.stringify(db));
  await expect(api.patch('/framework_assessments/'+aid,{notes:'denied'})).rejects.toThrow(/Read-only/);
  await expect(api.delete('/framework_assessments/'+aid+'/links',{data:{kind:'evidence',id:'anything'}})).rejects.toThrow(/Read-only/);
  await expect(api.get('/frameworks/hipaa',{params:{client_id:'unrelated-client'}})).rejects.toThrow();
});
