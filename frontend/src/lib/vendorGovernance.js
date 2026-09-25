import { calendarDay } from './clientDashboard';
export const VENDOR_WINDOW_DAYS = 90;
export const ASSURANCE_TYPES = ['SOC 2','ISO 27001','Security Questionnaire','Penetration Test Summary','Cyber Insurance','PCI Attestation','Other'];
export const VENDOR_PURPOSES = {vendor:'Vendor Review',assurance:'Security Assurance Review',contract:'Contract Renewal Review',offboarding:'Offboarding Review'};
export const VENDOR_DATA_TYPES = ['No Sensitive Data','Internal','Confidential','PII','PHI','Financial','Customer Data','Employee Data','Credentials','Source Code / IP','Operational Data','Privileged Access','Network / System Access','API / Integration Access','Other'];
export function assuranceStatus(v,a,today=new Date()) {
  if(!v.assurance_required||a.required===false) return 'not_required';
  if(!a.evidence_ids?.length||!a.received_at||!a.refresh_due) return 'missing';
  if(calendarDay(a.refresh_due)===null||calendarDay(a.received_at)===null)return 'missing';
  const delta=calendarDay(a.refresh_due)-calendarDay(today.toISOString());
  return delta<0?'expired':delta<=(v.assurance_window_days||VENDOR_WINDOW_DAYS)?'due_soon':'current';
}
export function vendorProjection(v,reviews) {
  const linked=reviews.filter(r=>r.vendor_id===v.vendor_id&&r.client_id===v.client_id);
  const primary=linked.filter(r=>(r.vendor_purpose||'vendor')==='vendor');
  const dates=primary.filter(r=>!['completed','cancelled'].includes(r.status)).map(r=>r.due_date).filter(Boolean).sort();
  const completed=primary.flatMap(r=>[...(r.occurrences||[]).map(o=>o.completed_at),...(r.status==='completed'?[r.completion_date]:[])]).filter(Boolean).sort();
  return {...v,...(v.status==='terminated'?{status:'inactive',legacy_status:'terminated'}:{}),service:v.service||v.services,...(primary.length?{next_review:dates[0]||null,last_review:completed.at(-1)||v.last_review}:{}),linked_review_ids:linked.map(r=>r.review_id)};
}
export function vendorSignals(v,reviews,today=new Date()) {
  const value=vendorProjection(v,reviews),now=calendarDay(today.toISOString());
  const days=value=>calendarDay(value)!==null?calendarDay(value)-now:null;
  const next=days(value.next_review),contract=days(value.contract_renewal||value.contract_expiration||value.contract_end);
  const active=value.status!=='inactive';
  // Assurance refresh is not a management obligation while offboarding (management-obligation-contract);
  // the Dashboard assurance tile links here, so both use the same Vendor population.
  const assuranceManaged=active&&value.status!=='offboarding';
  const primary=reviews.some(r=>r.vendor_id===v.vendor_id&&r.client_id===v.client_id&&(r.vendor_purpose||'vendor')==='vendor'&&!['completed','cancelled'].includes(r.status));
  return {...value,_nextReviewDays:next,_contractDays:contract,_reviewDue:active&&primary&&next!==null&&next<=90,
    _reviewOverdue:active&&primary&&next!==null&&next<0,
    _contractSoon:active&&contract!==null&&contract<=(v.contract_lead_days||90),
    _assuranceIssue:assuranceManaged&&!!v.assurance_required&&(v.assurance_records||[]).some(a=>['missing','expired','due_soon'].includes(assuranceStatus(v,a,today)))};
}
export function vendorPlans(v) {
  const frequency=v.review_frequency||'annual';
  const result={vendor:[v.next_review,({biennial:'custom',as_needed:'none'})[frequency]||frequency,frequency==='biennial'?730:v.custom_recurrence_days]};
  if(v.assurance_required&&v.separate_assurance_review) result.assurance=[v.assurance_review_date,v.assurance_cadence||'annual',null];
  const date=v.contract_renewal||v.contract_expiration||v.contract_end;
  if(v.contract_review_enabled&&date) result.contract=[new Date((calendarDay(date)-(v.contract_lead_days||90))*86400000).toISOString().slice(0,10),'none',null];
  if(v.offboarding_review_date) result.offboarding=[v.offboarding_review_date,'none',null];
  return result;
}
