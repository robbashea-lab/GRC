import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import baseline from '../lib/onboardingCatalog.json';
import {FRAMEWORKS,CATALOGS} from '../lib/frameworks';
import {controlGap} from '../lib/socReadiness';
const api=axios.create({adapter:previewAdapter});
let cid;
const get=async path=>(await api.get(path,{params:{client_id:cid}})).data;
const state=programs=>({version:3,step:3,policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,programs.includes(f.key)?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}});
async function configure(programs=['soc-2']){await api.post('/onboarding/baseline',{client_id:cid,state:state(programs),finalize:true});return get('/frameworks/soc-2');}
const scope=(categories,extra={})=>api.patch('/frameworks/soc-2/configuration',{client_id:cid,categories,...extra});
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');cid=(await api.post('/clients',{name:'SOC isolated fixture'})).data.client_id;});

test('default scope is 33 Common Criteria; optional categories retain history without affecting current totals',async()=>{
  expect(CATALOGS['soc-2'].requirements).toHaveLength(61);
  expect((await get('/frameworks/soc-2')).assessments).toHaveLength(0);
  expect((await configure()).assessments).toHaveLength(33);
  await scope(['security','availability']);
  let w=await get('/frameworks/soc-2');expect(w.assessments).toHaveLength(36);
  const a=w.assessments.find(a=>a.definition_id==='A1.1');
  await api.patch('/framework_assessments/'+a.framework_assessment_id,{implementation:'Capacity monitoring in review',status:'in_progress'});
  await scope(['security']);
  expect((await get('/frameworks/summary')).items[0]).toMatchObject({total:33,status_counts:{not_assessed:33,in_progress:0}});
  expect((await get('/framework_assessments/'+a.framework_assessment_id)).status).toBe('in_progress');
  await scope(Object.keys(CATALOGS['soc-2'].categories));
  w=await get('/frameworks/soc-2');expect(w.assessments).toHaveLength(61);expect(w.active_definition_ids).toHaveLength(61);
  for(const applicability of ['does_not_apply','unsure','applies'])await api.patch('/onboarding/programs/soc-2',{client_id:cid,applicability});
  expect((await get('/frameworks/soc-2')).assessments).toHaveLength(61);expect(await get('/reviews')).toHaveLength(8);
});

test('scope configuration rejects category, date and field injection errors',async()=>{
  await configure();
  for(const changes of [{categories:['privacy']},{categories:['security','security']},{categories:['security','other']},{period_start:'2026-01-01'},{period_start:'2026-02-30',period_end:'2026-03-01'},{period_start:'2026-12-31',period_end:'2026-01-01'},{role:'super_admin'}])await expect(scope(['security'],changes)).rejects.toThrow();
  expect((await get('/frameworks/soc-2')).configuration.categories).toEqual(['security']);
  for(const field of ['categories','system_description','period_start','period_end'])await expect(scope(['security'],{[field]:null})).rejects.toThrow();
});

test('control design, operating state and instance observations remain independent and historical',async()=>{
  const w=await configure(),p='/framework_assessments/'+w.assessments[0].framework_assessment_id;
  const c={control_id:'observation',name:'Leadership conduct review',description:'Management-designed process',design:'adequate',operating:'gap',frequency:'Quarterly',period_start:'2026-01-01',period_end:'2026-12-31',expected_instances:4,collected_instances:2,population_notes:'Four management meetings',testing_notes:'Two records missing'};
  for(const change of [{name:' '},{design:'certified'},{expected_instances:true},{expected_instances:-1},{collected_instances:1.5},{period_start:'2026-02-30'},{period_start:'',period_end:''},{client_id:'other'}])await expect(api.patch(p,{management_controls:[{...c,...change}]})).rejects.toThrow();
  await expect(api.patch(p,{management_controls:[c,c]})).rejects.toThrow();
  for(const field of ['name','description','design','operating','period_start','period_end'])await expect(api.patch(p,{management_controls:[{...c,[field]:null}]})).rejects.toThrow();
  await api.patch(p,{management_controls:[c]});expect(controlGap(c)).toBe(2);
  await scope(['security'],{period_start:'2027-01-01',period_end:'2027-12-31'});
  expect(await get(p)).toMatchObject({status:'not_assessed',management_controls:[expect.objectContaining({period_start:'2026-01-01',collected_instances:2})]});
  await api.patch(p,{management_controls:[]});
  expect((await get(p)).assessment_history[0].management_controls[0].testing_notes).toBe('Two records missing');
  expect(controlGap({expected_instances:null,collected_instances:0})).toBeNull();
});

test('four frameworks reuse existing work and control descriptions do not imply cross-framework completion',async()=>{
  await configure(['cis-ig1','hipaa','iso-27001']);const before=JSON.parse(JSON.stringify(await get('/reviews')));
  await configure(['cis-ig1','hipaa','iso-27001','soc-2']);
  const after=await get('/reviews');expect(after).toHaveLength(23);
  for(const r of before)expect(after.find(a=>a.review_id===r.review_id)).toEqual(r);
  const snapshot=JSON.parse(sessionStorage.getItem(STORE_KEY));
  expect(snapshot.framework_assessments.filter(a=>a.client_id===cid)).toHaveLength(288);
  expect(snapshot.framework_assessments.filter(a=>a.client_id===cid).every(a=>a.status==='not_assessed')).toBe(true);
});
