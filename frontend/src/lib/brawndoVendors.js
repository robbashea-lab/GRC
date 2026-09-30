import {calendarDay,managementDay} from './managementDates';
export const assuranceTypes=['SOC 2','ISO 27001','Penetration Test Summary','Security Questionnaire','Other'];
export const assuranceNames={'SOC 2':'SOC 2 Report','ISO 27001':'ISO/IEC 27001 Certificate','Penetration Test Summary':'Independent Security Assessment / Penetration Test Summary','Security Questionnaire':'Security Questionnaire',Other:'Other Assurance Document'};
export const assuranceStates={requested:'Requested',received:'Received',reviewed:'Reviewed',awaiting_update:'Awaiting Update'};
export const assuranceName=a=>a.document_name||assuranceNames[a.type]||a.type;
// Legacy receipt never establishes review. Retain ambiguous historical dates as recorded.
export const assuranceState=a=>assuranceStates[a.review_status]|| (a.last_reviewed?'Reviewed':a.received_at?'Received':'Not recorded');
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
export const vendorViews=[['all_active','All Active'],['critical','Critical'],['high','High'],['review_due','Reviews Due'],['review_overdue','Reviews Past Due'],['contract_soon','Contracts Expiring'],['renewal_soon','Renewals Upcoming'],['assurance','Assurance Due'],['inactive','Inactive']].map(([id,label])=>({id,label}));
export function vendorMatches(v,view,now=new Date()){
  const inactive=['inactive','terminated'].includes(v.status),today=managementDay(now),day=calendarDay(v.next_review);
  const upcoming=value=>{const d=calendarDay(value);return d!==null&&d>=today&&d<=today+30;};
  if(view==='all')return true;
  if(view==='inactive')return inactive;
  if(inactive)return false;
  if(view==='all_active')return ['onboarding','active','offboarding'].includes(v.status);
  if(view==='unassigned')return ['onboarding','active','offboarding'].includes(v.status)&&!v.business_owner_id;
  if(view==='review_overdue')return day!==null&&day<today;
  if(view==='review_due')return upcoming(v.next_review);
  if(view==='contract_soon')return upcoming(v.contract_expiration||v.contract_end);
  if(view==='renewal_soon')return upcoming(renewalAction(v).date);
  if(view==='assurance')return (v.assurance_records||[]).some(a=>assuranceAttention(a,now).length);
  if(view==='critical_high')return ['critical','high'].includes(v.criticality);
  if(['critical','high'].includes(view))return v.criticality===view;
  return true;
}
export function vendorColumns(columns){return columns.map(c=>{
  if(c.key==='status')return {...c,key:'security_assurance',label:'Security Assurance',value:assuranceSummary,sortable:false,filterOnly:true};
  if(['last_review','next_review','contract_renewal'].includes(c.key))return {...c,sortLabels:['Earliest First','Latest First'],...(c.key==='contract_renewal'?{value:r=>r.contract_renewal,renewal:false}:{})};
  if(['criticality','data_types','business_owner_id'].includes(c.key))return {...c,sortable:false,filterOnly:true};
  return c;
});}
