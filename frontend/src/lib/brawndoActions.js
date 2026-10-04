import {actionTitle,daysDue,taskSource} from './actionItems';
import {dateMatches} from './tableFilters';
import {findingOpen} from './findingMetrics';
import {FRAMEWORKS} from './frameworks';
import {occurrenceId,relatedReviewInitialValues} from './reviewOccurrences';
import {ticketRecords,ticketStage} from './remediationTickets';

export const pilotPriority=value=>({medium:'Moderate',moderate:'Moderate',high:'High',low:'Low',informational:'Informational',critical:'Critical',immediate:'Critical / Immediate'})[value]||'Classification needed';
export const finished=row=>['completed','accepted','cancelled'].includes(ticketStage(row));
export function pilotActionStatus(row,now=new Date()) {
  const stage=ticketStage(row);
  if(stage!=='open')return stage;
  return daysDue(row,now)<0&&daysDue(row,now)!==null?'overdue':'open';
}
export function pilotActionMatches(row,view,now=new Date()) {
  if(view==='all')return true;
  if(view==='completed')return finished(row);
  if(finished(row))return false;
  // High / critical Findings: rows of an open high or critical Finding (its Actions, or the Finding
  // itself when it has no active Action). The same population as the Dashboard's Finding count.
  if(view==='high_critical'){const f=row.finding||(row.kind==='findings'?row.raw:null);return !!f&&findingOpen(f)&&['high','critical'].includes(f.severity);}
  if(view==='overdue')return dateMatches(row.due_date,'overdue',now);
  if(view==='upcoming')return dateMatches(row.due_date,'next30',now);
  if(view==='unassigned')return !row.owner_id;
  if(view==='in_progress')return pilotActionStatus(row,now)==='in_progress';
  if(view==='open')return ['open','overdue'].includes(pilotActionStatus(row,now));
  return true;
}
// Follow stored origin IDs, not matching titles or incidental supporting mappings.
export function actionOrigin(record,records={},finding) {
  const source=finding||record,cid=record.client_id;
  const find=(kind,key,id)=>(records[kind]||[]).find(r=>r[key]===id&&r.client_id===cid);
  const aid=source.framework_assessment_id||record.framework_assessment_id;
  if(aid){const target=find('framework_assessments','framework_assessment_id',aid);return {kind:'framework_assessments',target,label:target?`${FRAMEWORKS.find(f=>f.key===target.framework_key)?.label||target.framework_key} Assessment → ${target.framework_key==='cis-ig1'?'Safeguard ':''}${target.definition_id}`:'Assessment unavailable',id:aid};}
  const rid=source.review_id||record.review_id;
  if(rid){const target=find('reviews','review_id',rid),origin={...source,review_id:rid,occurrence_id:source.occurrence_id||record.occurrence_id};
    const initialValues=target?relatedReviewInitialValues(target,origin):{};
    const missing=target&&(!origin.occurrence_id||origin.occurrence_id!==occurrenceId(target)&&!initialValues.occurrence);
    return {kind:'reviews',target:missing?null:target,id:rid,label:target?.title||'Review unavailable',detail:missing?'Original occurrence unavailable':initialValues.occurrence?.period||target?.period,initialValues};}
  const origin=taskSource(source,records);
  if(record.client_id==='demo_brawndo'&&record.assurance_id&&origin.kind==='vendors')return {...origin,detail:'Linked assurance document',initialValues:{vendorTab:'assurance',assuranceId:record.assurance_id}};
  if(origin.type==='manual')return {label:'Manual Entry'};
  if(origin.kind)return origin;
  return {label:source.source||'Origin not documented'};
}
// Read-only projection: no migration, no refresh-time creation, no title-based deduplication.
export function unifiedActions(records,clientId) {
  return ticketRecords(records,clientId).map(row=>({
    ...row,id:row.raw.task_id||row.raw.finding_id,hasAction:row.actions.length>0,
    title:row.finding?row.title:actionTitle(row.raw),client_id:clientId,
    itemType:row.finding||row.raw.finding_id?'Finding':'Task',source:actionOrigin(row.raw,records,row.finding),
  }));
}
export function pilotActionColumns(columns,rows) {
  return columns.map(c=>{
    if(c.key==='owner_id')return {...c,label:'Assigned To',sortable:false,filterOnly:true};
    if(c.key==='priority')return {...c,sortable:false,filterOnly:true,value:r=>pilotPriority(r.priority),labelValue:v=>v,options:undefined,rank:undefined,emptyLabel:null};
    if(c.key==='status')return {...c,sortable:false,filterOnly:true,value:pilotActionStatus,labelValue:v=>({completed:'Completed',in_progress:'In Progress',overdue:'Overdue',open:'Open',pending_validation:'Pending Validation'})[v]||v,matches:(r,v,now)=>pilotActionStatus(r,now)===v};
    if(c.key==='source_type')return {...c,sortable:false,filterOnly:true,value:r=>r.source.label,labelValue:v=>v};
    if(c.key==='due_date')return {...c,label:'Due Date',sortLabels:['Earliest First','Latest First'],matches:(r,v,now)=>v==='overdue'?pilotActionMatches(r,v,now):dateMatches(r.due_date,v,now)};
    return c;
  });
}
