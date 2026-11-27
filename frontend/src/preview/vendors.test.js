import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {STORE_KEY} from './store';
import {assuranceStatus,vendorSignals,vendorPlans} from '../lib/vendorGovernance';
import {completionPayload,validateCompletionGuide} from '../lib/r4ReviewCompletion';
const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const db=()=>JSON.parse(sessionStorage.getItem(STORE_KEY));
async function currentVendorCompletionGuide(reviewId){
  const {data:review}=await api.get('/reviews/'+reviewId);
  const {data:guide}=await api.get('/reviews/'+reviewId+'/completion-guide');
  expect(guide).toMatchObject({template_id:'vendor_rec',occurrence_id:review.current_occurrence_id,expected_updated_at:review.updated_at??null,read_only:false});
  return guide;
}

test('one Vendor obligation, contract lead time and fixed annual completion; inactive retains everything',async()=>{
  const cid=(await api.post('/clients',{name:'Vendor QA'})).data.client_id;
  const v=(await api.post('/vendors',{client_id:cid,name:'CloudCore',service:'CRM',next_review:'2026-10-15',contract_renewal:'2027-03-25',contract_review_enabled:true})).data;
  expect(v.status).toBe('onboarding');
  const r=db().reviews.find(r=>r.vendor_id===v.vendor_id&&r.vendor_purpose==='vendor');
  expect(db().reviews.find(r=>r.vendor_id===v.vendor_id&&r.vendor_purpose==='contract').due_date.slice(0,10)).toBe('2026-12-25');
  expect((await api.post('/vendors/'+v.vendor_id+'/schedule-review',{})).data.review.review_id).toBe(r.review_id);
  const guide=await currentVendorCompletionGuide(r.review_id);
  const performed={...guide,
    results:guide.steps.map(step=>({step_id:step.step_id,result:'Pass',reason:'SYNTHETIC QA: this Vendor check was performed with no exception.'})),
    supporting_reference:'SYNTHETIC QA completed-result record VENDOR-ANNUAL-2026: illustrative Vendor check results, not external assurance.'};
  validateCompletionGuide(performed);
  const completed=(await api.post('/reviews/'+r.review_id+'/complete',{
    ...completionPayload(performed),completion_notes:'SYNTHETIC QA: completed the annual Vendor checks and retained the illustrative result reference.'})).data;
  expect(completed.occurrence).toMatchObject({occurrence_id:r.current_occurrence_id,checklist_outcome:'No exceptions noted',supporting_reference:performed.supporting_reference});
  expect(completed.occurrence.checklist_results).toEqual(expect.arrayContaining(performed.results.map(result=>expect.objectContaining(result))));
  expect(db().vendors.find(x=>x.vendor_id===v.vendor_id).next_review.slice(0,10)).toBe('2027-10-15');
  for(const status of ['under_review','active','offboarding','inactive']) await api.patch('/vendors/'+v.vendor_id,{status});
  expect(db().reviews.find(x=>x.review_id===r.review_id)).toMatchObject({status:'cancelled',occurrences:[expect.any(Object)]});
  expect(db().vendors.find(x=>x.vendor_id===v.vendor_id).contract_renewal).toBe('2027-03-25');
});

test('Vendor Finding and Task preserve authoritative source and same-client provenance',async()=>{
  const cid=(await api.post('/clients',{name:'Vendor findings QA'})).data.client_id;
  const v=(await api.post('/vendors',{client_id:cid,name:'CloudCore',service:'CRM',next_review:'2026-10-15'})).data;
  const r=db().reviews.find(r=>r.vendor_id===v.vendor_id);
  const f=(await api.post('/reviews/'+r.review_id+'/create-finding',{title:'Missing report',remediation_title:'Obtain report',occurrence_id:r.current_occurrence_id,request_id:'vendor-finding-qa'})).data;
  const task=db().tasks.find(t=>t.finding_id===f.finding_id);
  expect(f.vendor_id).toBe(v.vendor_id);expect(task).toMatchObject({vendor_id:v.vendor_id,review_id:r.review_id,occurrence_id:r.current_occurrence_id});
  const findingBefore=(await api.get('/findings/'+f.finding_id)).data;
  const taskBefore=(await api.get('/tasks/'+task.task_id)).data;
  expect(findingBefore.status).toBe('in_remediation');expect(taskBefore.status).toBe('open');
  expect(findingBefore.validated_at).toBeFalsy();
  const guide=await currentVendorCompletionGuide(r.review_id);
  const assurance=guide.steps.find(step=>step.support==='Assurance document');
  expect(assurance).toBeDefined();
  const reason='SYNTHETIC QA: required assurance report is missing; Finding '+f.finding_id+' remains in remediation and Action '+task.task_id+' remains open.';
  const performed={...guide,
    results:guide.steps.map(step=>({step_id:step.step_id,result:step.step_id===assurance.step_id?'Exception':'Pass',reason:step.step_id===assurance.step_id?reason:'SYNTHETIC QA: this remaining Vendor check was performed.'})),
    supporting_reference:'SYNTHETIC QA completed-result record VENDOR-FINDING-2026: missing report recorded through Finding '+f.finding_id+', with corrective Action '+task.task_id+' still open.'};
  validateCompletionGuide(performed);
  const completed=(await api.post('/reviews/'+r.review_id+'/complete',{
    ...completionPayload(performed),completion_notes:'SYNTHETIC QA: Vendor review performed; the missing-report Finding remains in remediation and its corrective Action remains open.'})).data;
  expect(completed.occurrence).toMatchObject({occurrence_id:r.current_occurrence_id,checklist_outcome:'Exceptions noted',finding_count:1,supporting_reference:performed.supporting_reference});
  expect(completed.occurrence.checklist_results).toEqual(expect.arrayContaining([expect.objectContaining({step_id:assurance.step_id,result:'Exception',reason})]));
  const findingAfter=db().findings.find(x=>x.finding_id===f.finding_id);
  expect(findingAfter.status).toBe(findingBefore.status);
  expect(findingAfter.validated_at).toBe(findingBefore.validated_at);
  expect(findingAfter.validated_by).toBe(findingBefore.validated_by);
  expect(db().tasks.find(t=>t.task_id===task.task_id).status).toBe(taskBefore.status);
  expect(db().tasks.find(t=>t.task_id===task.task_id).status).toBe('open');
  const other=(await api.post('/clients',{name:'Other'})).data.client_id;
  const risk=(await api.post('/risks',{client_id:other,title:'Private risk'})).data;
  await expect(api.patch('/vendors/'+v.vendor_id,{related_risk_ids:[risk.risk_id]})).rejects.toThrow(/same client/);
  await expect(api.patch('/vendors/'+v.vendor_id,{assurance_required:true,assurance_records:[{type:'SOC 2',evidence_ids:['private']}]})).rejects.toThrow(/Evidence/);
});

test('assurance is proportionate; operational cards use linked Reviews and calendar-day windows',()=>{
  const today=new Date('2026-09-14T12:00:00Z');
  const v={vendor_id:'v',client_id:'a',status:'offboarding',assurance_required:true,assurance_records:[]};
  const a={type:'SOC 2',evidence_ids:['e'],received_at:'2026-09-01',refresh_due:'2027-09-01'};
  expect(assuranceStatus(v,a,today)).toBe('current');
  expect(assuranceStatus(v,{...a,refresh_due:'2026-12-13'},today)).toBe('due_soon');
  expect(assuranceStatus({...v,assurance_required:false},{type:'SOC 2'},today)).toBe('not_required');
  const r={review_id:'r',vendor_id:'v',client_id:'a',due_date:'2026-12-13',status:'upcoming'};
  expect(vendorSignals(v,[r],today)._reviewDue).toBe(true);
  expect(vendorSignals({...v,status:'inactive'},[r],today)._reviewDue).toBe(false);
  expect(vendorSignals({...v,next_review:r.due_date},[],today)._reviewDue).toBe(false);
  expect(vendorPlans({contract_review_enabled:true,contract_renewal:'2027-03-25'}).contract[0]).toBe('2026-12-25');
});

test('Dashboard vendor tiles and the register views they open use the same populations',()=>{
  const today=new Date('2026-09-14T12:00:00Z');
  const review=due=>({review_id:'r',vendor_id:'v',client_id:'a',due_date:due,status:'upcoming'});
  const active={vendor_id:'v',client_id:'a',status:'active',assurance_required:true,assurance_records:[{type:'SOC 2',required:true,evidence_ids:['e'],received_at:'2025-01-01',refresh_due:'2026-01-01'}]};
  // "Vendor reviews past due" counts only past-due primary Reviews; "Reviews Due" also includes the next 90 days.
  expect(vendorSignals(active,[review('2026-09-01')],today)).toMatchObject({_reviewOverdue:true,_reviewDue:true});
  expect(vendorSignals(active,[review('2026-10-01')],today)).toMatchObject({_reviewOverdue:false,_reviewDue:true});
  expect(vendorSignals({...active,status:'inactive'},[review('2026-09-01')],today)._reviewOverdue).toBe(false);
  // Assurance is not a management obligation while offboarding, matching the Dashboard assurance tile.
  expect(vendorSignals(active,[],today)._assuranceIssue).toBe(true);
  expect(vendorSignals({...active,status:'offboarding'},[],today)._assuranceIssue).toBe(false);
});
