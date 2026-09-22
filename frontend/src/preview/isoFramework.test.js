import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import baseline from '../lib/onboardingCatalog.json';
import {FRAMEWORKS,CATALOGS} from '../lib/frameworks';

const api=axios.create({adapter:previewAdapter});
let cid;
const get=async path=>(await api.get(path,{params:{client_id:cid}})).data;
const state=programs=>({version:3,step:3,policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,programs.includes(f.key)?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}});
async function configure(programs=['iso-27001']){await api.post('/onboarding/baseline',{client_id:cid,state:state(programs),finalize:true});return get('/frameworks/iso-27001');}
const path=(w,id)=>'/framework_assessments/'+w.assessments.find(a=>a.definition_id===id).framework_assessment_id;
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');cid=(await api.post('/clients',{name:'ISO isolated fixture'})).data.client_id;});

test('ISO has 30 ISMS units, 93 Annex references and recommendation-only cadences',()=>{
  const c=CATALOGS['iso-27001'];
  expect(c.requirements).toHaveLength(123);
  expect(new Set(c.requirements.map(d=>d.id)).size).toBe(123);
  expect(c.requirements.filter(d=>d.specification==='isms_clause')).toHaveLength(30);
  for(const [n,count] of [[5,37],[6,8],[7,14],[8,34]]){
    expect(c.requirements.filter(d=>d.control==='A.'+n).map(d=>d.id)).toEqual(Array.from({length:count},(_,i)=>'A.'+n+'.'+(i+1)));
  }
  for(const p of c.review_plans){expect(p.classification).toBe('recommended');expect(p.source_cadence).toContain('does not prescribe');}
});

test('explicit activation and toggles retain state, with no mutating GET',async()=>{
  expect((await get('/frameworks/iso-27001')).assessments).toHaveLength(0);
  const w=await configure(),p=path(w,'4.3');
  await api.patch(p,{status:'in_progress',implementation:'Scoped facilities and service boundaries'});
  for(const applicability of ['does_not_apply','unsure','applies','applies'])await api.patch('/onboarding/programs/iso-27001',{client_id:cid,applicability});
  expect((await get('/frameworks/iso-27001')).assessments).toHaveLength(123);
  expect(await get('/reviews')).toHaveLength(10);
  expect(await get(p)).toMatchObject({implementation:'Scoped facilities and service boundaries',status:'in_progress',assessment_history:[expect.objectContaining({status:'in_progress'})]});
});

test('SoA decisions are separate from mandatory ISMS status and require justification',async()=>{
  const w=await configure(),p=path(w,'A.8.30');
  await expect(api.patch(path(w,'4.3'),{status:'not_applicable',na_rationale:'Not permitted'})).rejects.toThrow();
  for(const body of [{status:'addressed',implementation:'Operating'},{status:'not_applicable',soa_applicability:'excluded'},{soa_applicability:'excluded',soa_justification:'No outsourcing'},{soa_applicability:'invalid'}])await expect(api.patch(p,body)).rejects.toThrow();
  await api.patch(p,{status:'not_applicable',soa_applicability:'excluded',soa_justification:'No outsourced development in scope'});
  expect(await get(p)).toMatchObject({status:'not_applicable',soa_applicability:'excluded'});
  await api.patch(p,{status:'in_progress',soa_applicability:'included',soa_justification:'New development supplier in scope'});
  expect((await get(p)).assessment_history).toHaveLength(2);
});

test('CIS and HIPAA work is reused without changes; ISO-specific obligations remain distinct',async()=>{
  await configure(['cis-ig1','hipaa']);const before=JSON.parse(JSON.stringify(await get('/reviews')));
  const w=await configure(['cis-ig1','hipaa','iso-27001']);
  const after=await get('/reviews');expect(after).toHaveLength(22);
  for(const row of before)expect(after.find(r=>r.review_id===row.review_id)).toEqual(row);
  const related=await get(path(w,'A.5.18')+'/related');
  expect(related.reviews).toHaveLength(2);
  expect(related.reviews.some(r=>r.framework_key==='cis-ig1')).toBe(true);
  expect(related.policies.length).toBeGreaterThan(0);
});

test('shared evidence can be unlinked without deleting its original attribution; a corrective action does not assess ISO',async()=>{
  const w=await configure(),p=path(w,'10.2');
  const f=(await api.post(p+'/findings',{title:'Effectiveness gap',remediation_title:'Validate effectiveness',request_id:'iso-test'})).data;
  expect(f.source).toContain('ISO 27001 10.2');
  const related=await get(p+'/related');expect(related.tasks).toHaveLength(1);
  await api.patch('/tasks/'+related.tasks[0].task_id,{status:'done'});
  expect((await get(p)).status).toBe('not_assessed');
  const a=(await get(p)).framework_assessment_id;
  const e=(await api.post('/evidence',{client_id:cid,filename:'synthetic.txt',mime_type:'text/plain',content_base64:'c3ludGhldGlj',linked_type:'framework_assessments',linked_id:a})).data;
  const other=path(w,'9.2.2');
  await api.post(other+'/links',{kind:'evidence',id:e.evidence_id});
  await api.delete(other+'/links',{data:{kind:'evidence',id:e.evidence_id}});
  expect((await get(p+'/related')).evidence.map(x=>x.evidence_id)).toContain(e.evidence_id);
  expect((await get(other+'/related')).evidence).toHaveLength(0);
  expect(JSON.parse(sessionStorage.getItem(STORE_KEY)).evidence.find(x=>x.evidence_id===e.evidence_id).linked_id).toBe(a);
});
