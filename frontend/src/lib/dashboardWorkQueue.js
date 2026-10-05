import {calendarDay} from './managementDates';
import {actionTitle, taskSource} from './actionItems';
import definitions from '@catalogs/frameworkDefinitions.json';
import {BUSINESS_BASIS} from './requirementBasis';

// Same client dashboard in authenticated and Demo mode; no identity-specific presentation.
export const dashboardPilot = (demo, clientId) => !!clientId;
export const WORK_FILTERS = [
  {key:'pastDue', label:'Past Due', empty:'No past-due items.'},
  {key:'due30', label:'Due in 30 Days', empty:'No items due in the next 30 days.'},
  {key:'all', label:'All Open', empty:'No open priority work.'},
  {key:'unassigned', label:'Unassigned', empty:'All current work is assigned.'},
];
const levels={critical:0,immediate:0,high:1,medium:2,moderate:2,low:3};
const frameworkNames=new Map(definitions.frameworks.map(f=>[f.key,f.key==='cis-ig1'?'CIS Controls v8.1':f.label]));
function sourceLabel(row, records) {
  if(row.kind==='tasks') return taskSource(row.record,records).label;
  const r=row.record;
  const frameworks=[...new Set([r.framework_key,...(r.framework_drivers||[]).map(f=>typeof f==='string'?f:f.framework_key)])].filter(k=>frameworkNames.has(k));
  if(frameworks.length) return frameworks.map(k=>frameworkNames.get(k)).join(' · ');
  for(const [kind,id] of [['vendors','vendor_id'],['policies','policy_id'],['risks','risk_id'],['reviews','review_id']]) {
    if(kind===row.kind)continue;
    const target=records[kind]?.find(v=>v[id]===r[id]&&v.client_id===r.client_id);
    if(target) return target.title||target.name||row.type;
  }
  return r.source || BUSINESS_BASIS[r.governance_context?.category] || ({risks:'Risk Register',policies:'Policy',vendors:'Vendor',requirements:'Framework',exceptions:'Exception'}[row.kind]) || row.type;
}

/** Read-only presentation of the existing management work population, after its
 * lifecycle, occurrence and Finding/Action deduplication rules have run. */
export function dashboardWorkQueue(model, eligibleOwnerIds, sourceRecords = model.activeRecords) {
  const today=calendarDay(model.as_of), records=model.activeRecords;
  // Existing management metrics retain a Finding when its owner/deadline differs
  // from its Action. This operational queue represents remediation once, while
  // preserving the distinct validation decision (remediated Finding).
  const actionFindings=new Set((records.tasks||[]).map(r=>r.finding_id).filter(Boolean));
  const all=model.work.filter(row=>row.kind!=='findings'||row.status==='remediated'||!actionFindings.has(row.id)).map(row=>({...row,
    title:row.kind==='tasks'?actionTitle(row.record):row.title,
    unassigned:!eligibleOwnerIds.has(row.owner_id),
    owner:eligibleOwnerIds.has(row.owner_id)?row.owner:'Unassigned',
    source_label:sourceLabel(row,sourceRecords),
  }));
  const overdue=r=>r.day!==null&&r.day<today;
  const soon=r=>r.day!==null&&r.day>=today&&r.day<=today+30;
  all.sort((a,b)=>Number(overdue(b))-Number(overdue(a))
    || (overdue(a)&&overdue(b)?a.day-b.day:0)
    || Math.min(levels[a.severity]??4,2)-Math.min(levels[b.severity]??4,2)
    || Number(soon(b))-Number(soon(a))
    || Number(b.unassigned)-Number(a.unassigned)
    || (levels[a.severity]??4)-(levels[b.severity]??4)
    || (a.day??Infinity)-(b.day??Infinity)
    || (a.record.created_at||'').localeCompare(b.record.created_at||'')
    || a.key.localeCompare(b.key));
  return {all,pastDue:all.filter(overdue),due30:all.filter(soon),unassigned:all.filter(r=>r.unassigned)};
}
