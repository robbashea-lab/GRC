import {CATALOGS, FRAMEWORKS} from './frameworks';
import {reviewSchedule} from './reviewOccurrences';

export const POLICY_STATUS = {needs_verification:'Needs Confirmation',needs_creation:'Needs Creation',draft:'Draft',in_review:'In Review',pending_approval:'Pending Approval',approved:'Approved'};
export function policyStatus(row) {
  if (row.status==='retired') return 'retired';
  if (row.status==='not_applicable'||row.presence==='not_applicable') return 'not_applicable';
  if (row.status==='in_review'&&row.approval_request_id) return 'pending_approval';
  if (row.status==='approved'&&!(row.approved_at||row.approval_subject||row.approval_history?.some(h=>h.action==='approved')||row.decision_history?.some(h=>h.action==='external_approval_recorded'))) return 'needs_verification';
  if (row.presence==='reported_missing'&&['draft',undefined,null,''].includes(row.status)) return 'needs_creation';
  return row.status||'needs_verification';
}
export const policyStatusLabel=value=>POLICY_STATUS[value]||({retired:'Retired · retained',not_applicable:'Previously excluded'}[value])||`${value} · legacy`;
export const nextPolicyReview=(day,cadence='annual',days)=>reviewSchedule({due_date:day,recurrence:cadence||'annual',custom_recurrence_days:days}).next_review_date?.slice(0,10)||null;

// A required documented process is not a mandate for a separately titled policy.
// Only retain catalog-owned mappings; never infer alignment from a document title.
export function policyAlignment(row, programs=[], assessments=[]) {
  return programs.flatMap(key=>{
    const catalog=CATALOGS[key];
    if(!catalog)return [];
    const mapped=(catalog.policy_mappings||[]).filter(m=>m.policy_key===row.baseline_key);
    const ids=new Set(mapped.flatMap(m=>m.safeguards));
    assessments.filter(a=>a.client_id===row.client_id&&a.framework_key===key&&a.related_links?.some(l=>l.kind==='policies'&&l.id===row.policy_id)).forEach(a=>ids.add(a.definition_id));
    return [...ids].flatMap(id=>{
      const definition=catalog.requirements.find(d=>d.id===id);
      if(!definition||key==='cis-ig1'&&definition.implementation_group>1)return [];
      const mapping=mapped.find(m=>m.safeguards.includes(id));
      return [{key,id,title:definition.title,version:catalog.version,label:FRAMEWORKS.find(f=>f.key===key)?.label||key,
        relation:'Supports',purpose:mapping?.rationale||mapping?.reason,source:definition.source,sourceCadence:definition.source_cadence,
        assessment:assessments.find(a=>a.client_id===row.client_id&&a.framework_key===key&&a.definition_id===id)}];
    });
  });
}
export const alignmentFallback=row=>row.governance_context?.category==='organizational'?'Organization-defined':'Alignment not documented';
export function policyColumns(columns,rows,programs,assessments=[]) {
  return columns.map(c=>{
    if(c.key==='title')return {...c,label:'Policy'};
    if(c.key==='presence')return {key:'alignment',label:'Framework Alignment',sortable:false,filterOnly:true,filter:true,value:r=>[...new Set(policyAlignment(r,programs,assessments).map(a=>`${a.relation} ${a.label}`))].join(' · ')||alignmentFallback(r),labelValue:v=>v};
    if(c.key==='status')return {...c,label:'Policy Status',sortable:false,filterOnly:true,value:policyStatus,labelValue:policyStatusLabel,options:[...new Set(rows.map(policyStatus))].map(value=>({value,label:policyStatusLabel(value)}))};
    if(c.key==='owner_id')return {...c,sortable:false,filterOnly:true};
    if(c.dateKind)return {...c,label:c.key==='last_reviewed_at'?'Last Reviewed':'Next Review',sortLabels:['Earliest First','Latest First']};
    return c;
  });
}
