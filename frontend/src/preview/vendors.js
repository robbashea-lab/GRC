import {vendorPlans,VENDOR_PURPOSES} from '../lib/vendorGovernance';
import {reviewView,reviewSchedule} from '../lib/reviewOccurrences';
export function validateVendor(db,v,previous) {
  if(!v.name?.trim()||!(v.service||v.services)?.trim()) throw new Error('Vendor name and Service / Product are required.');
  if(!['critical','high','medium','moderate','low'].includes(v.criticality)) throw new Error('Invalid Vendor criticality.');
  const stages={onboarding:['under_review','offboarding'],under_review:['active','offboarding'],active:['under_review','offboarding'],offboarding:['inactive'],inactive:[]};
  if(!previous&&v.status!=='onboarding') throw new Error('New Vendors start Onboarding.');
  if(previous&&previous.status!==v.status&&!stages[previous.status]?.includes(v.status)) throw new Error('Use the next Vendor lifecycle stage.');
  if(v.business_owner_id&&!db.users.some(u=>u.user_id===v.business_owner_id&&(u.role==='super_admin'||u.client_ids?.includes(v.client_id)))) throw new Error('Business owner must have access to this client.');
  for(const key of ['contract_lead_days','assurance_window_days']) if(v[key]!=null&&(!Number.isInteger(v[key])||v[key]<1||v[key]>3650)) throw new Error('Lead time must be 1–3650 days.');
  if(v.assurance_required&&!(v.assurance_records||[]).some(a=>a.required!==false)) throw new Error('Select at least one expected assurance artifact.');
  for(const id of v.related_risk_ids||[]) if(!db.risks.some(r=>r.risk_id===id&&r.client_id===v.client_id)) throw new Error('Related Risk must belong to the same client.');
  const ids=[...(v.contract_evidence_ids||[]),...(v.assurance_records||[]).flatMap(a=>a.evidence_ids||[])];
  for(const id of ids) if(!db.evidence.some(e=>e.evidence_id===id&&e.client_id===v.client_id&&!e.archived_at)) throw new Error('Evidence must be an available record from this client.');
  for(const [due,cadence,custom] of Object.values(vendorPlans(v))) {
    if(due&&!Number.isFinite(Date.parse(due))) throw new Error('Invalid Review date.');
    if(!['none','monthly','quarterly','semiannual','annual','custom'].includes(cadence)) throw new Error('Invalid Review frequency.');
    if(cadence==='custom'&&(!Number.isInteger(custom)||custom<1||custom>3650)) throw new Error('Custom recurrence requires 1–3650 days.');
  }
}
export function ensureVendorReviews(db,v) {
  const plans=vendorPlans(v),result=[];
  for(const purpose of Object.keys(VENDOR_PURPOSES)) {
    const candidates=db.reviews.filter(r=>r.client_id===v.client_id&&r.vendor_id===v.vendor_id&&(r.vendor_purpose||'vendor')===purpose);
    const live=candidates.filter(r=>!['completed','cancelled'].includes(r.status));
    if(live.length>1) throw new Error('Multiple active Vendor Reviews require reconciliation; history has been retained.');
    let review=live[0]||candidates.find(r=>r.vendor_purpose===purpose);
    const [due,recurrence,custom]=plans[purpose]||[];
    if(!plans[purpose]||(v.status==='inactive'&&purpose!=='offboarding')) {
      if(review&&!['completed','cancelled'].includes(review.status)) Object.assign(review,{status:'cancelled',cancelled_at:new Date().toISOString()});
      continue;
    }
    if(!due&&(!review||['completed','cancelled'].includes(review.status))) {if(review)result.push(review);continue;}
    if(review?.status==='completed'&&review.due_date?.slice(0,10)===due?.slice(0,10)) {result.push(review);continue;}
    if(purpose==='assurance'&&due?.slice(0,10)===v.next_review?.slice(0,10)) {if(review&&!['completed','cancelled'].includes(review.status))review.status='cancelled';continue;}
    const changed=review?.due_date?.slice(0,10)!==due?.slice(0,10);
    if(!review) {review={review_id:'vendor_review_'+v.vendor_id+'_'+purpose,client_id:v.client_id,vendor_id:v.vendor_id,review_type:'vendor',created_at:new Date().toISOString(),status:'upcoming'};db.reviews.push(review);}
    if(['completed','cancelled'].includes(review.status)) Object.assign(review,{status:'upcoming',current_occurrence_id:'occ_'+crypto.randomUUID(),notes:null,completion_date:null,started_at:null});
    Object.assign(review,{vendor_purpose:purpose,title:VENDOR_PURPOSES[purpose]+' — '+v.name,due_date:due,recurrence,custom_recurrence_days:custom,owner_id:review.vendor_business_owner_id===(v.business_owner_id||null)?review.owner_id:v.business_owner_id||null,vendor_business_owner_id:v.business_owner_id||null});
    Object.assign(review,reviewSchedule(review,changed),reviewView(review));result.push(review);
  }
  return result;
}
export function syncVendorReview(db,r) {
  const v=db.vendors.find(v=>v.vendor_id===r.vendor_id&&v.client_id===r.client_id);if(!v) return;
  const last=r.occurrences?.at(-1),purpose=r.vendor_purpose||'vendor';
  if(purpose==='vendor') {v.review_frequency=r.recurrence==='none'?'as_needed':r.recurrence;v.custom_recurrence_days=r.custom_recurrence_days;v.next_review=['completed','cancelled'].includes(r.status)?null:r.due_date;if(last)v.last_review=last.completed_at;}
  else if(last) {if(purpose==='assurance'&&v.assurance_sync_occurrence_id!==last.occurrence_id){v.assurance_sync_occurrence_id=last.occurrence_id;v.assurance_records=(v.assurance_records||[]).map(a=>a.required===false?a:{...a,last_reviewed:last.completed_at,review_occurrence_id:last.occurrence_id});}v[purpose+'_last_reviewed']=last.completed_at;if(purpose==='assurance')v.assurance_review_date=['completed','cancelled'].includes(r.status)?null:r.due_date;}
}
