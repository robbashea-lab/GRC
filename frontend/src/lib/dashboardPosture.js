import { representedFinding } from './grcWork';
import { calendarDay } from './clientDashboard';
import { assuranceStatus, vendorSignals } from './vendorGovernance';
import {managementMetrics} from './managementMetrics';
import {managementDay} from './managementDates';

/** Read-only management projection. Counts and drill-downs share exact arrays. */
export function dashboardPosture(aggregation, {members=[], today=new Date()}={}) {
  const active=aggregation.activeRecords;
  const day=managementDay(today);
  const names=new Map(members.map(u=>[u.user_id,u.name||u.email]));
  const row=(record,kind,id,type,severity)=>({key:`${kind}:${record[id]}:record`,id:record[id],kind,record,type,
    title:record.title||record.name,owner:names.get(record.owner_id||record.assignee_id||record.business_owner_id)||((record.owner_id||record.assignee_id||record.business_owner_id)?'Assigned user':'Unassigned'),
    unassigned:!(record.owner_id||record.assignee_id||record.business_owner_id),status:record.status,due_date:record.due_date||record.next_review||null,
    day:calendarDay(record.due_date||record.next_review),severity,action:kind==='risks'?'View Risk':kind==='vendors'?'View Vendor':'View Finding'});
  const management=managementMetrics(aggregation,{members,today});
  const {work,materialFindings,risks,significantRisks}=management;
  const {past_due:pastDue,due_30d:due30,due_31_90d:due3190}=management.metrics;
  const buckets=[
    {key:'pastDue',label:'Past Due',items:pastDue,tone:'bg-semantic-critical'},
    {key:'inProgress',label:'In Progress',items:work.filter(r=>r.status==='in_progress'&&(r.day===null||r.day>=day)),tone:'bg-semantic-info'},
    {key:'otherDue30',label:'Due Next 30 Days',items:due30.filter(r=>r.status!=='in_progress'),tone:'bg-semantic-duesoon'},
    {key:'scheduled',label:'Scheduled',items:work.filter(r=>r.day>day+30&&r.status!=='in_progress'),tone:'bg-ink-muted'},
    {key:'unscheduled',label:'No Date / Unscheduled',items:work.filter(r=>r.day===null&&r.status!=='in_progress'),tone:'bg-line-strong'},
  ];
  const riskLevels=['critical','high','moderate','low',null].map(level=>({key:level||'unassessed',label:level?level[0].toUpperCase()+level.slice(1):'Not Assessed',items:risks.filter(r=>r.severity===level),tone:level==='critical'?'bg-semantic-critical':level==='high'?'bg-semantic-duesoon':'bg-ink-muted'}));
  const vendors=active.vendors.map(v=>({source:v,signals:vendorSignals(v,active.reviews,today),item:row(v,'vendors','vendor_id','Vendor',v.criticality)}));
  const vendorReviews=work.filter(r=>(r.kind==='reviews'&&r.record.vendor_id&&(r.record.vendor_purpose||'vendor')==='vendor')||(r.kind==='vendors'&&r.event==='review'));
  const vendorHealth=[
    {key:'vendorReviewsPast',label:'Vendor Reviews Past Due',items:vendorReviews.filter(r=>r.day!==null&&r.day<day)},
    {key:'vendorReviewsSoon',label:'Vendor Reviews Due in 30 Days',items:vendorReviews.filter(r=>r.day!==null&&r.day>=day&&r.day<=day+30)},
    {key:'assurance',label:'Assurance Needs Attention',items:vendors.filter(v=>v.source.assurance_required&&(v.source.assurance_records||[]).some(a=>['expired','due_soon','missing'].includes(assuranceStatus(v.source,a,today)))).map(v=>v.item)},
    {key:'contracts',label:'Contracts Expiring',items:vendors.filter(v=>v.signals._contractSoon).map(v=>v.item)},
    {key:'criticalVendors',label:'Critical Vendors',items:vendors.filter(v=>v.source.criticality==='critical').map(v=>v.item)},
    {key:'missingAssurance',label:'Missing Required Assurance',items:vendors.filter(v=>v.source.assurance_required&&(!(v.source.assurance_records||[]).some(a=>a.required!==false)||(v.source.assurance_records||[]).some(a=>assuranceStatus(v.source,a,today)==='missing'))).map(v=>v.item)},
  ];
  const attentionKeys=new Set(aggregation.attention.map(r=>r.key));
  const priority=[...work.filter(r=>attentionKeys.has(r.key)),...materialFindings.filter(r=>!representedFinding(r.record,active.tasks)),...significantRisks];
  const byRecord=new Map();
  const rank=r=>r.day!==null&&r.day<day?(r.severity==='critical'?0:r.severity==='high'?1:2):['critical','high'].includes(r.severity)?3:r.unassigned?4:5;
  priority.sort((a,b)=>rank(a)-rank(b)||(a.day??Infinity)-(b.day??Infinity)||a.title.localeCompare(b.title));
  for(const item of priority)if(!byRecord.has(`${item.kind}:${item.id}`))byRecord.set(`${item.kind}:${item.id}`,{...item,priority_label:item.priority_label||(['critical','high'].includes(item.severity)?item.severity[0].toUpperCase()+item.severity.slice(1):item.unassigned?'Unassigned':'Attention')});
  return {pastDue,due30,due3190,materialFindings,significantRisks,acceptedRisks:risks.filter(r=>r.status==='accepted'),buckets,riskLevels,vendorHealth,priority:[...byRecord.values()],work,management};
}
