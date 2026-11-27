import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import {authorizeDemo} from './authorization';
import {completionPayload,validateCompletionGuide} from '../lib/r4ReviewCompletion';
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo';
const db=()=>JSON.parse(sessionStorage.getItem(STORE_KEY));
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const create=async extra=>(await api.post('/vendors',{client_id:cid,name:'Synthetic vendor QA',service:'Synthetic service',next_review:'2026-10-15',contract_renewal:'2027-04-01',...extra})).data;
test('the native Vendor lifecycle requires Under Review before Active for every client',async()=>{
  const v=await create(),before=sessionStorage.getItem(STORE_KEY);
  await expect(api.patch('/vendors/'+v.vendor_id,{status:'active'})).rejects.toThrow(/stage/);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  for(const status of ['under_review','active','offboarding','inactive'])await api.patch('/vendors/'+v.vendor_id,{status});
  expect((await api.get('/vendors/'+v.vendor_id)).data.status).toBe('inactive');
  const other=(await api.post('/clients',{name:'Other QA'})).data.client_id;
  const o=(await api.post('/vendors',{client_id:other,name:'Other vendor',service:'Service'})).data;
  await expect(api.patch('/vendors/'+o.vendor_id,{status:'active'})).rejects.toThrow(/stage/);
  for(const status of ['under_review','active'])await api.patch('/vendors/'+o.vendor_id,{status});
  expect((await api.get('/vendors/'+o.vendor_id)).data.status).toBe('active');
});
test('assurance history survives replacement; review completion cannot alter assurance or contract',async()=>{
  const a={assurance_id:'a',type:'SOC 2',report_type:'II',review_status:'reviewed',reviewed_on:'2026-08-01',reviewed_by:'Synthetic reviewer',coverage_start:'2025-07-01',coverage_end:'2026-06-30',evidence_ids:[]};
  const v=await create({assurance_records:[a]});
  await api.patch('/vendors/'+v.vendor_id,{assurance_records:[{...a,superseded_by:'b'},{assurance_id:'b',type:'SOC 2',review_status:'awaiting_update',expected_availability:'2026-12-31',next_follow_up:'2026-12-31',evidence_ids:[]}]});
  const before=(await api.get('/vendors/'+v.vendor_id)).data;
  const r=db().reviews.find(r=>r.vendor_id===v.vendor_id&&r.vendor_purpose==='vendor');
  const current=(await api.get('/reviews/'+r.review_id)).data;
  const finding=(await api.post('/reviews/'+r.review_id+'/create-finding',{
    title:'SYNTHETIC replacement assurance document is pending',remediation_title:'Obtain the replacement assurance document',
    occurrence_id:current.current_occurrence_id,request_id:'synthetic-retained-assurance-finding'})).data;
  const savedReview=(await api.get('/reviews/'+r.review_id)).data;
  const {data:guide}=await api.get('/reviews/'+r.review_id+'/completion-guide');
  expect(guide.expected_updated_at).toBe(savedReview.updated_at??null);
  expect(guide.occurrence_id).toBe(savedReview.current_occurrence_id);
  const assurance=guide.steps.find(step=>step.support==='Assurance document');expect(assurance).toBeDefined();
  const performed={...guide,results:guide.steps.map(step=>({step_id:step.step_id,
    result:step.step_id===assurance.step_id?'Exception':'Pass',
    reason:step.step_id===assurance.step_id?'SYNTHETIC QA: the replacement is awaiting availability; Finding '+finding.finding_id+' retains the open corrective work.':'SYNTHETIC QA: this remaining Vendor check was performed against the fixture.'})),
    supporting_reference:'SYNTHETIC QA completed-result record RETAINED-ASSURANCE-2026: replacement pending; corrective Finding '+finding.finding_id+'. No external assurance claimed.'};
  validateCompletionGuide(performed);
  const completed=(await api.post('/reviews/'+r.review_id+'/complete',{
    ...completionPayload(performed),completion_notes:'SYNTHETIC QA: review performed; replacement assurance remains pending under its normal Finding and open Action.'})).data;
  expect(completed.occurrence).toMatchObject({checklist_outcome:'Exceptions noted',finding_count:1});
  expect(db().tasks.find(task=>task.finding_id===finding.finding_id).status).toBe('open');
  const after=(await api.get('/vendors/'+v.vendor_id)).data;
  expect(after.assurance_records).toEqual(before.assurance_records);expect(after.contract_renewal).toBe(v.contract_renewal);
  expect(after.assurance_records[0].reviewed_by).toBe('Synthetic reviewer');expect(after.assurance_records[0].history).toHaveLength(1);
  const last=after.last_review,next=after.next_review;
  await api.patch('/vendors/'+v.vendor_id,{assurance_records:after.assurance_records.map(a=>a.assurance_id==='b'?{...a,review_status:'received',received_at:'2026-09-30'}:a)});
  const reread=(await api.get('/vendors/'+v.vendor_id)).data;expect(reread.last_review).toBe(last);expect(reread.next_review).toBe(next);
  await expect(api.patch('/vendors/'+v.vendor_id,{assurance_records:[]})).rejects.toThrow(/retained/);
});
test('validation, same-client assurance source and explicit dates; action completion has no side effects',async()=>{
  const v=await create({assurance_records:[{assurance_id:'a',type:'ISO 27001',review_status:'requested',evidence_ids:[]}]});
  await expect(api.patch('/vendors/'+v.vendor_id,{assurance_records:[{assurance_id:'a',type:'ISO 27001',review_status:'reviewed'}]})).rejects.toThrow(/actual/);
  await expect(api.patch('/vendors/'+v.vendor_id,{connected_system_ids:['foreign']})).rejects.toThrow(/client/);
  await expect(api.patch('/vendors/'+v.vendor_id,{contract_notice_deadline:'2026-02-30'})).rejects.toThrow(/valid/);
  const payload={client_id:cid,title:'Request updated certificate',source_type:'vendor',source_id:v.vendor_id,vendor_id:v.vendor_id,assurance_id:'a'};
  const config={headers:{'Idempotency-Key':'vendor-action-qa'}};
  const task=(await api.post('/tasks',payload,config)).data;
  expect((await api.post('/tasks',payload,config)).data.task_id).toBe(task.task_id);
  await expect(api.post('/tasks',{...payload,title:'Different request'},config)).rejects.toThrow(/different values/);
  await expect(api.post('/tasks',{...payload,assurance_id:'foreign'})).rejects.toThrow(/Assurance source/);
  await api.patch('/tasks/'+task.task_id,{status:'done'});
  expect((await api.get('/vendors/'+v.vendor_id)).data).toMatchObject({status:'onboarding',assurance_records:[{review_status:'requested'}],contract_renewal:'2027-04-01'});
});

test('existing permission boundaries protect vendor configuration and read-only access',()=>{
  const user={user_id:'con',role:'client_contributor',client_ids:[cid],status:'active'};
  const state={user,users:[user],vendors:[{vendor_id:'v',client_id:cid,business_owner_id:'con'}]};
  expect(()=>authorizeDemo(state,'patch',['vendors','v'],{notes:'Permitted note'})).not.toThrow();
  expect(()=>authorizeDemo(state,'patch',['vendors','v'],{assurance_records:[]})).toThrow();
  expect(()=>authorizeDemo({...state,user:{...user,role:'client_readonly'},users:[{...user,role:'client_readonly'}]},'patch',['vendors','v'],{notes:'Denied'})).toThrow();
});
