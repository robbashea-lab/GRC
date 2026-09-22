import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import catalog from '../lib/onboardingCatalog.json';
import {cis,FRAMEWORKS,onboardingDraft,belowSource} from '../lib/frameworks';
import {complianceNavigation} from '../lib/complianceNavigation';
const api=axios.create({adapter:previewAdapter});
let cid;
const get=async(kind,id=cid)=>(await api.get('/'+kind,{params:{client_id:id}})).data;
const state=(programs=['cis-ig1'])=>({version:3,step:3,policies:Object.fromEntries(catalog.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,programs.includes(f.key)?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}});
const configure=async(s=state(),id=cid)=>{await api.post('/onboarding/baseline',{client_id:id,state:s,finalize:true});return get('frameworks/cis-ig1',id);};
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');cid=(await api.post('/clients',{name:'CIS framework QA'})).data.client_id;});

test('new intake begins with programs; catalog is IG1 only; cadence warning separates automation',()=>{
  expect(onboardingDraft({version:2,step:0,policies:{},requirements:{},reviews:['inventory']})).toMatchObject({step:0,reviews:[]});
  expect(cis.requirements).toHaveLength(56);expect(new Set(cis.requirements.map(d=>d.id)).size).toBe(56);
  expect(cis.requirements.filter(d=>['13','16','18'].includes(d.id.split('.')[0]))).toEqual([]);
  expect(FRAMEWORKS.filter(f=>f.implemented).map(f=>f.key)).toEqual(['hipaa','cis-ig1','iso-27001']);
  expect(belowSource(cis.review_plans.find(p=>p.key==='account-authorization'),{recurrence:'annual'})).toBe(true);
  expect(cis.review_plans.find(p=>p.key==='data-recovery').default_cadence).toBe('annual');
});

test.each([[],['cis-ig1'],['hipaa'],['iso-27001','soc-2'],['cis-ig1','hipaa','nist-csf-2']])('selection %j creates only implemented requirements and reviews',async(...args)=>{
  const programs=args;
  expect((await get('frameworks/cis-ig1')).assessments).toHaveLength(0);
  const s=state(programs),workspace=await configure(s);
  expect(workspace.assessments).toHaveLength(programs.includes('cis-ig1')?56:0);
  expect(await get('reviews')).toHaveLength(programs.includes('cis-ig1')?(programs.includes('hipaa')?18:12):programs.includes('hipaa')?8:programs.includes('iso-27001')?10:0);
  const baseline=(await get('onboarding/baseline')).state;
  expect(complianceNavigation(cid,baseline,await get('requirements')).map(f=>f.key).sort()).toEqual([...programs].sort());
  for(const key of ['hipaa','nist-csf-2','iso-27001','cmmc','soc-2']){
    const shell=await get('frameworks/'+key),count=programs.includes(key)?({hipaa:76,'iso-27001':123}[key]||0):0;expect(shell.assessments).toHaveLength(count);expect(shell.definitions).toHaveLength(count);
  }
});

test('one authoritative Finding and Action; evidence, comments, responses survive reconfiguration',async()=>{
  const s=state(),w=await configure(s),aid=w.assessments[0].framework_assessment_id,base='/framework_assessments/'+aid;
  await api.patch(base,{implementation:'Asset inventory reconciled weekly',technology:'Endpoint inventory',status:'in_progress',owner_id:'demo_admin'});
  await api.post('/evidence',{client_id:cid,linked_type:'framework_assessment',linked_id:aid,filename:'inventory.txt',content_base64:'eA=='});
  await api.post('/comments',{entity_type:'framework_assessments',entity_id:aid,body:'Reconciliation checked'});
  const body={title:'Inventory reconciliation gap',remediation_title:'Reconcile missing assets',severity:'high',request_id:'qa-request'};
  const finding=(await api.post(base+'/findings',body)).data;
  expect((await api.post(base+'/findings',body)).data.finding_id).toBe(finding.finding_id);
  let related=(await api.get(base+'/related')).data;
  expect(related.tasks).toHaveLength(1);expect(related.evidence).toHaveLength(1);expect(await get('evidence')).toHaveLength(1);
  await api.patch('/tasks/'+related.tasks[0].task_id,{status:'done'});
  related=(await api.get(base+'/related')).data;
  expect(related.tasks[0].status).toBe('done');expect(related.findings[0].status).toBe('remediated');
  expect((await get('frameworks/cis-ig1')).assessments[0].status).toBe('in_progress');
  await api.post('/findings/'+finding.finding_id+'/validate',{rationale:'Remediation verified'});
  await api.patch(base,{status:'addressed'});
  await configure(s);await configure(state([]));
  expect((await get('reviews')).every(r=>!r.framework_driver_active)).toBe(true);
  await configure(s);
  expect(await get('reviews')).toHaveLength(12);
  const saved=(await get('frameworks/cis-ig1')).assessments[0];
  expect(saved).toMatchObject({status:'addressed',owner_id:'demo_admin'});expect(saved.assessment_history).toHaveLength(2);
  expect((await api.get(base+'/activity')).data.map(a=>a.action)).toContain('Evidence linked');
  expect((await api.get('/comments',{params:{entity_type:'framework_assessments',entity_id:aid}})).data).toHaveLength(1);
});

test('tenant relationships, owner and readonly boundaries; no automatic retrofit',async()=>{
  const a=(await configure()).assessments[0],base='/framework_assessments/'+a.framework_assessment_id;
  const other=(await api.post('/clients',{name:'Other CIS client'})).data.client_id;
  const b=(await configure(state(),other)).assessments[0];
  await api.patch('/framework_assessments/'+b.framework_assessment_id,{implementation:'Other tenant narrative'});
  expect((await get('frameworks/cis-ig1')).assessments[0].implementation).toBe('');
  const risk=(await api.post('/risks',{client_id:other,title:'Other tenant exposure'})).data;
  await expect(api.post(base+'/links',{kind:'risks',id:risk.risk_id})).rejects.toThrow(/this client/);
  await expect(api.patch(base,{status:'not_applicable'})).rejects.toThrow(/rationale/);
  await expect(api.patch(base,{client_id:other})).rejects.toThrow(/immutable/);
  await expect(api.post('/bulk',{kind:'framework_assessments',ids:[a.framework_assessment_id],action:'delete'})).rejects.toThrow(/retained/);
  const db=JSON.parse(sessionStorage.getItem(STORE_KEY));db.user.role='client_readonly';db.user.client_ids=[cid];sessionStorage.setItem(STORE_KEY,JSON.stringify(db));
  await expect(api.patch(base,{notes:'Forbidden'})).rejects.toThrow();
  await expect(get('frameworks/cis-ig1',other)).rejects.toThrow(/Forbidden/);
  await expect(api.get('/framework_assessments/'+b.framework_assessment_id+'/related')).rejects.toThrow(/Forbidden/);
  await expect(api.get('/comments',{params:{entity_type:'framework_assessments',entity_id:b.framework_assessment_id}})).rejects.toThrow(/Forbidden/);
  await expect(api.post('/comments',{entity_type:'framework_assessments',entity_id:a.framework_assessment_id,body:'Readonly edit'})).rejects.toThrow(/Read-only/);
  await expect(api.post('/evidence',{client_id:cid,linked_type:'framework_assessment',linked_id:a.framework_assessment_id,filename:'readonly.txt',content_base64:'eA=='})).rejects.toThrow(/Read-only/);
});
