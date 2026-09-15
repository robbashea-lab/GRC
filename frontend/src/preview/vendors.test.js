import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import {assuranceStatus,vendorSignals,vendorPlans} from '../lib/vendorGovernance';
const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/auth/login');});
const db=()=>JSON.parse(sessionStorage.getItem(STORE_KEY));

test('one Vendor obligation, contract lead time and fixed annual completion; inactive retains everything',async()=>{
  const cid=(await api.post('/clients',{name:'Vendor QA'})).data.client_id;
  const v=(await api.post('/vendors',{client_id:cid,name:'CloudCore',service:'CRM',next_review:'2026-10-15',contract_renewal:'2027-03-25',contract_review_enabled:true})).data;
  expect(v.status).toBe('onboarding');
  const r=db().reviews.find(r=>r.vendor_id===v.vendor_id&&r.vendor_purpose==='vendor');
  expect(db().reviews.find(r=>r.vendor_id===v.vendor_id&&r.vendor_purpose==='contract').due_date.slice(0,10)).toBe('2026-12-25');
  expect((await api.post('/vendors/'+v.vendor_id+'/schedule-review',{})).data.review.review_id).toBe(r.review_id);
  await api.post('/reviews/'+r.review_id+'/complete',{occurrence_id:r.current_occurrence_id});
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
  await api.post('/reviews/'+r.review_id+'/complete',{occurrence_id:r.current_occurrence_id});
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
