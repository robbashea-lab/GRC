import {calendarDay,managementDay} from './managementDates';

// Demo pilot fields. Approval is a separate, administrator-recorded decision,
// never inferred from inventory lifecycle or the screening risk tier.
export const AI_PILOT_DEFAULTS={environment:'',restrictions:'',data_settings:'',permitted_data_types:[]};
export const AI_PILOT_KEYS=Object.keys(AI_PILOT_DEFAULTS);
export const AI_APPROVAL_LABELS={pending_assessment:'Pending Assessment',approved:'Approved',approved_with_conditions:'Approved with Conditions',not_approved:'Not Approved'};
export const aiInactive=row=>['suspended','retired'].includes(row.status);
export const aiThirdParty=row=>row.screening?.third_party===true||!!row.vendor_id;
export const aiCustomerFacing=row=>row.screening?.customer_facing===true||row.purposes?.includes('Customer-Facing');
export const aiApproval=row=>Object.prototype.hasOwnProperty.call(AI_APPROVAL_LABELS,row.approval_status)?AI_APPROVAL_LABELS[row.approval_status]:'Approval not recorded';
export const aiApproved=row=>['approved','approved_with_conditions'].includes(row.approval_status);
export const aiUseLabel=row=>aiApproved(row)?'Approved Use':row.approval_status==='pending_assessment'?'Proposed Use':'Intended Use';
export const AI_VIEWS=[['active','All Active'],['due','Due for Review'],['high','High Risk'],['third','Third Party'],['customer','Customer Facing'],['pending','Pending Approval']];
export function aiMatches(row,view,showInactive=false,today=managementDay()){
  if(aiInactive(row)&&(!showInactive||view==='due'))return false;
  switch(view){
    case 'due': {const day=calendarDay(row.next_review);return day!==null&&day<=today;}
    case 'high':return ['high','critical'].includes(row.risk_tier);
    case 'third':return aiThirdParty(row);
    case 'customer':return aiCustomerFacing(row);
    case 'pending':return row.approval_status==='pending_assessment';
    default:return true;
  }
}
export function aiScope(row){
  return Object.fromEntries(['name','product_model','provider','vendor_id','description','purposes','data_types','access','screening','human_review_required','human_approval_required','oversight_notes',...AI_PILOT_KEYS].map(key=>[key,row[key]??null]));
}
