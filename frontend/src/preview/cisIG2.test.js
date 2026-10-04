import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {readStore,STORE_KEY,clone} from './store';
import baseline from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS,activeDefinitions,activePlans,reviewDrivers} from '../lib/frameworks';
import {cisReviewBriefs} from '../lib/cisOperations';
import {complianceNavigation} from '../lib/complianceNavigation';
const api=axios.create({adapter:previewAdapter});
const state=group=>({version:3,step:3,policies:Object.fromEntries(baseline.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,f.key==='cis-ig1'?'applies':'does_not_apply'])),reviews:[],framework_reviews:{},framework_settings:{'cis-ig1':{implementation_group:group}}});
let cid;
const workspace=async()=>(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data;
const blobText=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(blob);});
const scope=async(group,extra={},key='scope_change_'+Date.now()+Math.random().toString(36).slice(2))=>api.patch('/frameworks/cis-ig1/configuration',{client_id:cid,implementation_group:group,expected_updated_at:(await workspace()).configuration.expected_updated_at,...extra},{headers:{'Idempotency-Key':key}});
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');cid=(await api.post('/clients',{name:'Disposable cumulative scope QA'})).data.client_id;});

test('canonical partition and fresh Initech have no fabricated assessment work or user grants',async()=>{
  expect(activeDefinitions('cis-ig1')).toHaveLength(56);expect(activeDefinitions('cis-ig1',{implementation_group:2})).toHaveLength(130);
  expect(activePlans('cis-ig1')).toHaveLength(12);expect(activePlans('cis-ig1',{implementation_group:2})).toHaveLength(15);
  const db=readStore(),id='demo_initech',rows=db.framework_assessments.filter(r=>r.client_id===id);
  expect(rows).toHaveLength(130);expect(new Set(rows.map(r=>r.definition_id)).size).toBe(130);
  for(const r of rows){expect(r.status).toBe('not_assessed');expect(r.verification||'not_verified').toBe('not_verified');expect(r.implementation).toBe('');expect(r.assessment_history).toEqual([]);expect(r.owner_id).toBeNull();}
  expect(db.contacts.filter(r=>r.client_id===id).map(r=>r.name)).toEqual(['Bill Lumbergh','Peter Gibbons','Michael Bolton','Samir Nagheenanajar','Tom Smykowski','Milton Waddams','Nina']);
  expect(db.users.some(r=>r.user_id.startsWith(id))).toBe(false);
  for(const kind of ['findings','tasks','evidence','risks','policies'])expect(db[kind].filter(r=>r.client_id===id)).toEqual([]);
  expect(db.reviews.filter(r=>r.client_id===id)).toHaveLength(15);
  expect(db.reviews.filter(r=>r.client_id===id).every(r=>r.status==='needs_scheduling'&&!r.due_date&&!r.occurrences?.length)).toBe(true);
});

test('upgrade exactly 74, reduction retains data and reenable recovers identities and schedules',async()=>{
  await api.post('/onboarding/baseline',{client_id:cid,state:state(1),finalize:true});
  let before=await workspace();expect(before.assessments).toHaveLength(56);
  const first=before.assessments[0];await api.patch('/framework_assessments/'+first.framework_assessment_id,{implementation:'Retained method',status:'addressed',verification:'verified'});
  const original=clone((await workspace()).assessments),reviews=(await api.get('/reviews',{params:{client_id:cid}})).data;
  await api.patch('/reviews/'+reviews[0].review_id,{title:'Customized description review',description:'Client procedure',expected_updated_at:reviews[0].updated_at,expected_occurrence_id:reviews[0].current_occurrence_id,recurrence:'custom',custom_recurrence_days:43,due_date:'2027-01-01'});
  const reviewBefore=(await api.get('/reviews/'+reviews[0].review_id)).data;
  const key='repeatable_scope_request_123';await scope(2,{},key);
  const current=await workspace();expect(current.assessments).toHaveLength(130);
  for(const old of original)expect(current.assessments.find(r=>r.framework_assessment_id===old.framework_assessment_id)).toEqual(old);
  const reviewAfter=(await api.get('/reviews/'+reviews[0].review_id)).data;
  for(const field of ['title','description','recurrence','custom_recurrence_days','due_date','schedule_anchor','occurrences'])expect(reviewAfter[field]).toEqual(reviewBefore[field]);
  const token=current.configuration.expected_updated_at;
  await expect(scope(1)).rejects.toBeTruthy();
  await scope(1,{confirm_reduction:true,reason:'Reduced planning scope',effective_date:'2026-10-03'});
  const reduced=await workspace();expect(reduced.active_definition_ids).toHaveLength(56);expect(reduced.assessments).toHaveLength(130);
  const exported=await blobText((await api.get('/frameworks/cis-ig1/export',{params:{client_id:cid}})).data);
  expect(exported.split('\r\n')).toHaveLength(57);expect(exported).not.toContain('"18.2"');
  await api.patch('/framework_assessments/'+first.framework_assessment_id,{notes:' =SUM(1,2)'});
  const escaped=await blobText((await api.get('/frameworks/cis-ig1/export',{params:{client_id:cid,include_retained:'false'}})).data);
  expect(escaped).toContain('"\' =SUM(1,2)"');expect(escaped.split('\r\n')).toHaveLength(57);
  const retained=await blobText((await api.get('/frameworks/cis-ig1/export',{params:{client_id:cid,include_retained:true}})).data);
  expect(retained.split('\r\n')).toHaveLength(131);expect(retained).toContain('"Added in IG2","false"');
  const summary=(await api.get('/frameworks/summary',{params:{client_id:cid}})).data;
  expect(summary.items[0]).toMatchObject({total:56,label:'CIS IG1',implementation_group:1});
  const retainedReviews=(await api.get('/reviews',{params:{client_id:cid}})).data;
  for(const record of retainedReviews)for(const brief of cisReviewBriefs(record,reduced.active_definition_ids))expect(brief.items.every(d=>d.implementation_group===1)).toBe(true);
  await expect(scope(2,{expected_updated_at:token})).rejects.toBeTruthy();
  await scope(2);expect((await workspace()).active_definition_ids).toHaveLength(130);expect((await api.get('/reviews',{params:{client_id:cid}})).data).toHaveLength(15);
  const intake=(await api.get('/onboarding/baseline',{params:{client_id:cid}})).data;
  expect(intake.state.framework_settings['cis-ig1'].implementation_group).toBe(1);
  expect(complianceNavigation(cid,{...intake.state,framework_settings:intake.framework_settings},readStore().requirements)[0].label).toBe('CIS IG2');
});

test('IG2 operating work uses shared Finding, Action, evidence and Review history without fabricating technical execution',async()=>{
  await api.post('/onboarding/baseline',{client_id:cid,state:state(2),finalize:true});
  const assessment=(await workspace()).assessments.find(r=>r.definition_id==='18.2');
  const finding=(await api.post('/framework_assessments/'+assessment.framework_assessment_id+'/findings',{
    request_id:'ig2_gap_external_test',title:'External testing not established',remediation_title:'Arrange qualified external testing',severity:'high'})).data;
  const task=readStore().tasks.find(t=>t.finding_id===finding.finding_id);
  const bytes=btoa('SYNTHETIC QA - illustrative external testing follow-up, not an actual penetration test');
  const evidence=(await api.post('/evidence',{client_id:cid,linked_type:'task',linked_id:task.task_id,filename:'synthetic-followup.txt',mime_type:'text/plain',content_base64:bytes})).data;
  expect((await api.get('/evidence/'+evidence.evidence_id+'/download')).data.content_base64).toBe(bytes);
  await api.patch('/tasks/'+task.task_id,{status:'done'});
  expect((await api.get('/findings/'+finding.finding_id)).data.status).toBe('remediated');
  await api.post('/findings/'+finding.finding_id+'/validate',{rationale:'Synthetic workflow validation only'});
  expect((await api.get('/findings/'+finding.finding_id)).data).toMatchObject({status:'closed',framework_assessment_id:assessment.framework_assessment_id});
  const review=readStore().reviews.find(r=>r.client_id===cid&&r.framework_plan_key==='penetration-testing');
  await api.patch('/reviews/'+review.review_id,{due_date:'2026-10-03',expected_updated_at:review.updated_at,expected_occurrence_id:review.current_occurrence_id});
  const scheduled=(await api.get('/reviews/'+review.review_id)).data;
  const completed=(await api.post('/reviews/'+review.review_id+'/complete',{occurrence_id:scheduled.current_occurrence_id,spawn_next:true,conclusion:'Synthetic governance follow-up reviewed',tested_period:'2026',tested_scope:'18.1-18.3 follow-up',checklist_confirmed:true,no_evidence_reason:'Illustrative workflow only; no external testing performed'})).data;
  expect(completed.occurrence.conclusion).toBe('Synthetic governance follow-up reviewed');
  const unchanged=(await workspace()).assessments.find(r=>r.definition_id==='18.2');
  expect(unchanged.status).toBe('not_assessed');expect(unchanged.verification||'not_verified').toBe('not_verified');
  const urgent=(await api.post('/tasks',{client_id:cid,title:'Synthetic urgent incident response coordination',source_type:'manual',priority:'critical',description:'Event-driven 17.4-17.6 response follow-up'})).data;
  const change=(await api.post('/tasks',{client_id:cid,title:'Synthetic significant application change security review',source_type:'manual',priority:'high',description:'Change-driven 16.1 and 16.10 follow-up'})).data;
  expect([urgent.status,change.status]).toEqual(['open','open']);
});

test('new IG2, later enablement, persisted save failure and authorization boundaries',async()=>{
  await api.post('/onboarding/baseline',{client_id:cid,state:{...state(1),requirements:{...state(1).requirements,'cis-ig1':'does_not_apply'}},finalize:true});
  await api.patch('/onboarding/programs/cis-ig1',{client_id:cid,applicability:'applies',implementation_group:2});expect((await workspace()).assessments).toHaveLength(130);
  for(const group of [0,4,true,'2',null])await expect(scope(group)).rejects.toBeTruthy();
  const db=readStore(),old=db.clients.find(r=>r.client_id===cid).cis_configuration_updated_at;
  const storage=jest.spyOn(Storage.prototype,'setItem').mockImplementationOnce(()=>{throw new DOMException('Quota exceeded','QuotaExceededError');});
  await expect(scope(2)).rejects.toBeTruthy();storage.mockRestore();expect(readStore().clients.find(r=>r.client_id===cid).cis_configuration_updated_at).toBe(old);
  db.user={...db.user,role:'client_grc_manager',client_ids:[cid]};sessionStorage.setItem(STORE_KEY,JSON.stringify(db));await expect(scope(2)).rejects.toMatchObject({response:{status:403}});
  db.user={...db.user,role:'platform_admin',client_ids:['demo_brawndo']};sessionStorage.setItem(STORE_KEY,JSON.stringify(db));await expect(workspace()).rejects.toMatchObject({response:{status:403}});
});
