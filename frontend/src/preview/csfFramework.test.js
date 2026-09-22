import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import baseline from '../lib/onboardingCatalog.json';
import {FRAMEWORKS,CATALOGS} from '../lib/frameworks';
import {prioritizeCsfGaps,validateCsfProfile} from '../lib/csfProfile';
const api=axios.create({adapter:previewAdapter});
let cid;
const get=async path=>(await api.get(path,{params:{client_id:cid}})).data;
async function configure(programs=['nist-csf-2']){
  await api.post('/onboarding/baseline',{client_id:cid,finalize:true,state:{version:3,step:3,policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,programs.includes(f.key)?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}}});
  return get('/frameworks/nist-csf-2');
}
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');cid=(await api.post('/clients',{name:'CSF isolated fixture'})).data.client_id;});
test('gap ordering uses explicit priority without mutating source and rejects inherited-field names',()=>{
  const rows=['low','critical','high','medium',''].map((priority,i)=>({definition_id:String(i),csf_profile:{priority}}));
  expect(prioritizeCsfGaps(rows).map(r=>r.csf_profile.priority)).toEqual(['critical','high','medium','low','']);
  expect(rows[0].csf_profile.priority).toBe('low');
  expect(()=>validateCsfProfile({constructor:'invalid'})).toThrow();
});
test('106 outcomes in six Functions and 22 Categories; explicit activation and no destructive toggles',async()=>{
  const catalog=CATALOGS['nist-csf-2'];expect(Object.keys(catalog.functions)).toHaveLength(6);expect(Object.keys(catalog.categories)).toHaveLength(22);expect(new Set(catalog.requirements.map(d=>d.id)).size).toBe(106);
  expect((await get('/frameworks/nist-csf-2')).assessments).toHaveLength(0);
  expect((await configure()).assessments).toHaveLength(106);
  for(const applicability of ['does_not_apply','unsure','applies','applies'])await api.patch('/onboarding/programs/nist-csf-2',{client_id:cid,applicability});
  expect((await get('/frameworks/nist-csf-2')).assessments).toHaveLength(106);expect(await get('/reviews')).toHaveLength(9);
});
test('explicit target and gap decisions retain history and do not change current assessment',async()=>{
  const w=await configure(),path='/framework_assessments/'+w.assessments[0].framework_assessment_id;
  const profile={target_selected:true,target_outcome:'Mission-aligned risk objectives',priority:'high',gap_state:'gap',gap_notes:'Dependency validation outstanding'};
  await api.patch(path,{status:'in_progress',implementation:'Partial scope',csf_profile:profile});
  await api.patch(path,{csf_profile:{...profile,gap_state:'aligned'}});
  const saved=await get(path);expect(saved.status).toBe('in_progress');expect(saved.assessment_history[0].csf_profile).toEqual(profile);
  await api.patch(path,{csf_profile:{...profile,target_selected:false,gap_state:'not_evaluated'}});
  expect((await get(path)).csf_profile.target_outcome).toBe(profile.target_outcome);
});
test('invalid and cross-framework profile fields are rejected',async()=>{
  const w=await configure(['nist-csf-2','cis-ig1']),path='/framework_assessments/'+w.assessments[0].framework_assessment_id;
  for(const csf_profile of [null,[],{target_selected:'true'},{target_selected:true},{priority:'urgent'},{gap_state:'certified'},{gap_state:'gap',gap_notes:'Gap'},{target_outcome:'x'.repeat(4001)},{client_id:'other'},{gap_notes:null}])await expect(api.patch(path,{csf_profile})).rejects.toThrow();
  const cis=(await get('/frameworks/cis-ig1')).assessments[0];await expect(api.patch('/framework_assessments/'+cis.framework_assessment_id,{csf_profile:{}})).rejects.toThrow();
});
test('five frameworks share work and preserve policy records on Settings activation',async()=>{
  await configure(['cis-ig1','hipaa','iso-27001','soc-2']);const reviews=await get('/reviews'),policies=await get('/policies');
  await api.patch('/onboarding/programs/nist-csf-2',{client_id:cid,applicability:'applies'});
  expect(await get('/reviews')).toEqual(reviews);expect(await get('/policies')).toEqual(policies);
  const db=JSON.parse(sessionStorage.getItem(STORE_KEY));expect(db.framework_assessments.filter(a=>a.client_id===cid)).toHaveLength(394);
});
