import {assuranceNeedsAttention} from './vendorGovernance';
import {calendarDay,managementDay} from './managementDates';
export const VENDOR_CATEGORIES=['SaaS','Cloud / Hosting','Managed Service Provider','Security Provider','HR / Payroll','Financial','Legal','Marketing','Communications','Infrastructure','Professional Services','Other'];
export const assuranceTypes=['SOC 2','ISO 27001','Penetration Test Summary','Security Questionnaire','Other'];
export const assuranceNames={'SOC 2':'SOC 2 Report','ISO 27001':'ISO/IEC 27001 Certificate','Penetration Test Summary':'Independent Security Assessment / Penetration Test Summary','Security Questionnaire':'Security Questionnaire',Other:'Other Assurance Document'};
export const assuranceStates={requested:'Requested',received:'Received',reviewed:'Reviewed',awaiting_update:'Awaiting Update'};
export const assuranceName=a=>a.document_name||assuranceNames[a.type]||a.type;
// Legacy receipt never establishes review. Retain ambiguous historical dates as recorded.
export const assuranceState=a=>Object.prototype.hasOwnProperty.call(assuranceStates,a.review_status)?assuranceStates[a.review_status]:(a.last_reviewed?'Reviewed':a.received_at?'Received':'Not recorded');
export const assuranceKey=(a,index)=>a.assurance_id||`legacy:${index}`;
export function assuranceAttention(a,now=new Date()){
  if(a.superseded_by)return [];
  const today=managementDay(now),follow=calendarDay(a.next_follow_up||a.refresh_due),expiry=calendarDay(a.certificate_expires_at);
  return [follow!==null&&follow<today?'Follow-up overdue':follow!==null&&follow<=today+30?'Follow-up due within 30 days':null,
    a.type==='ISO 27001'&&expiry!==null&&expiry<today?'Certificate expired':null].filter(Boolean);
}
export const assuranceSummary=v=>{
  const all=(v.assurance_records||[]).filter(a=>!a.superseded_by);
  return all.length?all.map(a=>`${assuranceName(a)} — ${assuranceState(a)}`):['No assurance recorded'];
};
export const renewalAction=v=>({date:v.contract_notice_deadline||v.contract_renewal,label:v.contract_notice_deadline?'Notice deadline':'Renewal date'});
export const vendorViews=[['all_active','All active'],['critical','Critical'],['high','High'],['critical_high','Critical / High'],['review_due','Linked Reviews due / past due in 90 days'],['review_due_30','Linked Reviews due / past due in 30 days'],['review_overdue','Linked Reviews past due'],['contract_soon','Contract actions within configured lead'],['contract_expiring','Contracts expiring in 30 days'],['notice_due_60','Recorded notice deadlines in 60 days'],['renewal_soon','Renewal / notice actions in 30 days'],['assurance','Required assurance needs attention'],['assurance_followup','Assurance follow-up due'],['assurance_attention','Required assurance needs attention'],['unassigned','Unassigned'],['all','All records'],['inactive','Inactive']].map(([id,label])=>({id,label}));
// Native obligation views use the flags projected from actual linked Reviews. Short
// focus views retain their own IDs so presentation cannot redefine native deep links.
export function vendorMatchesView(v,view,now=new Date()){
  const inactive=['inactive','terminated'].includes(v.status),today=managementDay(now);
  const upcoming=value=>{const d=calendarDay(value);return d!==null&&d>=today&&d<=today+30;};
  if(view==='all')return true;
  if(view==='inactive')return inactive;
  if(inactive)return false;
  if(view==='all_active')return true;
  if(view==='unassigned')return !v.business_owner_id;
  if(view==='review_overdue')return !!v._reviewOverdue;
  if(view==='review_due')return !!v._reviewDue;
  if(view==='review_due_30')return !!v._reviewDue&&typeof v._nextReviewDays==='number'&&v._nextReviewDays<=30;
  if(view==='contract_soon'){
    const contract=calendarDay(v.contract_renewal||v.contract_expiration||v.contract_end);
    return v._contractSoon??(contract!==null&&contract-today<=(v.contract_lead_days||90));
  }
  if(view==='contract_expiring')return upcoming(v.contract_expiration||v.contract_end);
  if(view==='notice_due_60'){
    const notice=calendarDay(v.contract_notice_deadline);
    return notice!==null&&notice<=today+60;
  }
  if(view==='renewal_soon')return upcoming(renewalAction(v).date);
  // Assurance Follow-up Due: a document's next follow-up is overdue or within 30 days, or an ISO certificate has expired.
  if(view==='assurance_followup')return (v.assurance_records||[]).some(a=>assuranceAttention(a,now).length);
  // Assurance Needs Attention: the Dashboard rule (required document missing, expired or within the assurance window).
  if(view==='assurance'||view==='assurance_attention')return v._assuranceIssue??assuranceNeedsAttention(v,now);
  if(view==='critical_high')return ['critical','high'].includes(v.criticality);
  if(['critical','high'].includes(view))return v.criticality===view;
  return true;
}
export const vendorMatches=vendorMatchesView;
export function vendorColumns(columns){return columns.map(c=>{
  if(c.key==='status')return {...c,key:'security_assurance',label:'Security Assurance',value:assuranceSummary,sortable:false,filterOnly:true};
  if(['last_review','next_review','contract_renewal'].includes(c.key))return {...c,sortLabels:['Earliest First','Latest First'],...(c.key==='contract_renewal'?{value:r=>r.contract_renewal,renewal:false}:{})};
  if(['criticality','data_types','business_owner_id'].includes(c.key))return {...c,sortable:false,filterOnly:true};
  return c;
});}
