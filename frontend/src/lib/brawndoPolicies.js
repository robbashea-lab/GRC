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
export function policyAlignment(row, programs=[], assessments=[], cisGroup) {
  const group=cisGroup||Math.max(1,...assessments.filter(a=>a.client_id===row.client_id&&a.framework_key==='cis-ig1').map(a=>CATALOGS['cis-ig1'].requirements.find(d=>d.id===a.definition_id)?.implementation_group||1));
  return programs.flatMap(key=>{
    const catalog=CATALOGS[key];
    if(!catalog)return [];
    const mapped=(catalog.policy_mappings||[]).filter(m=>m.policy_key===row.baseline_key);
    const ids=new Set(mapped.flatMap(m=>m.safeguards));
    assessments.filter(a=>a.client_id===row.client_id&&a.framework_key===key&&a.related_links?.some(l=>l.kind==='policies'&&l.id===row.policy_id)).forEach(a=>ids.add(a.definition_id));
    return [...ids].flatMap(id=>{
      const definition=catalog.requirements.find(d=>d.id===id);
      if(!definition||key==='cis-ig1'&&(definition.implementation_group>group||definition.implementation_group>1&&!assessments.some(a=>a.client_id===row.client_id&&a.framework_key===key&&a.definition_id===id)))return [];
      const mapping=mapped.find(m=>m.safeguards.includes(id));
      return [{key,id,title:definition.title,version:catalog.version,label:key==='cis-ig1'?`CIS IG${group}`:FRAMEWORKS.find(f=>f.key===key)?.label||key,
        relation:'Supports',purpose:mapping?.rationale||mapping?.reason,source:definition.source,sourceCadence:definition.source_cadence,
        assessment:assessments.find(a=>a.client_id===row.client_id&&a.framework_key===key&&a.definition_id===id)}];
    });
  });
}
export const alignmentFallback=row=>row.governance_context?.category==='organizational'?'Organization-defined':'Alignment not documented';
export function policyColumns(columns,rows,programs,assessments=[],cisGroup) {
  return columns.map(c=>{
    if(c.key==='title')return {...c,label:'Policy'};
    if(c.key==='presence')return {key:'alignment',label:'Framework Alignment',sortable:false,filterOnly:true,filter:true,value:r=>[...new Set(policyAlignment(r,programs,assessments,cisGroup).map(a=>`${a.relation} ${a.label}`))].join(' · ')||alignmentFallback(r),labelValue:v=>v};
    if(c.key==='status')return {...c,label:'Policy Status',sortable:false,filterOnly:true,value:policyStatus,labelValue:policyStatusLabel,options:[...new Set(rows.map(policyStatus))].map(value=>({value,label:policyStatusLabel(value)}))};
    if(c.key==='owner_id')return {...c,sortable:false,filterOnly:true};
    if(c.dateKind)return {...c,label:c.key==='last_reviewed_at'?'Last Reviewed':'Next Review',sortLabels:['Earliest First','Latest First']};
    return c;
  });
}

// Reference-page views and summary tiles. Derived from the same status and alignment rules as the register.
export const AWAITING_APPROVAL=['draft','in_review','pending_approval'];
const reviewDays=(row,now=new Date())=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(row.next_review_date||''));return m?Math.round((Date.UTC(+m[1],m[2]-1,+m[3])-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/86400000):null;};
const live=row=>!['retired','not_applicable'].includes(policyStatus(row));
export function policyViewMatches(row,view,now=new Date()){
  if(!view)return true;
  if(view==='approved')return policyStatus(row)==='approved';
  if(view==='awaiting')return AWAITING_APPROVAL.includes(policyStatus(row));
  if(view==='due30'){const d=reviewDays(row,now);return live(row)&&d!==null&&d>=0&&d<=30;}
  return true;
}
const short=iso=>new Date(String(iso).slice(0,10)+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
export function policyTiles(rows,programs=[],assessments=[],now=new Date(),cisGroup){
  const approved=rows.filter(r=>policyViewMatches(r,'approved',now)),awaiting=rows.filter(r=>policyViewMatches(r,'awaiting',now));
  const upcoming=rows.filter(r=>live(r)&&reviewDays(r,now)!==null&&reviewDays(r,now)>=0).sort((a,b)=>String(a.next_review_date).localeCompare(String(b.next_review_date)));
  const due=upcoming.filter(r=>reviewDays(r,now)<=30);
  const aligned=rows.map(r=>policyAlignment(r,programs,assessments,cisGroup));
  const mapped=aligned.filter(a=>a.length).length,labels=[...new Set(aligned.flat().map(a=>a.label))];
  const orgDefined=rows.filter((r,i)=>!aligned[i].length&&alignmentFallback(r)==='Organization-defined').length;
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  return [
    {id:'approved',label:'Approved',count:approved.length,tone:'good',context:`${approved.length} of ${plural(rows.length,'policy').replace('policys','policies')} approved`},
    {id:'awaiting',label:'Awaiting approval',count:awaiting.length,tone:'attention',context:awaiting.length?`${awaiting[0].title}${awaiting[0].version?` · v${awaiting[0].version}`:''}${awaiting.length>1?` · +${awaiting.length-1} more`:''}`:'Nothing awaiting approval'},
    {id:'due30',label:'Review due in 30 days',count:due.length,tone:'attention',context:due.length?`${due[0].title}, ${short(due[0].next_review_date)}`:upcoming.length?`Next: ${upcoming[0].title}, ${short(upcoming[0].next_review_date)}`:'No reviews scheduled'},
    {id:'mapped',label:labels.length===1?`Mapped to ${labels[0]}`:'Framework-mapped',count:mapped,tone:'neutral',context:orgDefined?`${orgDefined} organization-defined`:`${rows.length-mapped} without framework alignment`},
  ];
}
