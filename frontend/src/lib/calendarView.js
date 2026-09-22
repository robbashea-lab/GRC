import rules from './grcRules.json';
import {occurrenceId,reviewView} from './reviewOccurrences';
import {actionStatus} from './actionItems';
import {calendarDay} from './tableFilters';

export const CALENDAR_SCOPES=[['active','Active'],['history','Completed / Closed'],['all','All']];
export const calendarTerminal=(kind,row)=>rules.closed[kind+'s']?.includes(row.status);
export function canMoveCalendar(kind,row,user) {
  const admin=['super_admin','platform_admin'].includes(user?.role);
  return (admin||user?.role==='client_contributor')&&!calendarTerminal(kind,row)&&(kind!=='review'||admin&&row.vendor_purpose!=='contract');
}
export function calendarItem(row,kind,user,historical=false) {
  const source=kind==='review'?reviewView(row):row;
  const oid=kind==='review'?(row.occurrence_id||occurrenceId(row)):null;
  const terminal=historical||calendarTerminal(kind,source);
  return {id:row[kind+'_id'],key:`${kind}:${row[kind+'_id']}:${oid||'current'}`,client_id:row.client_id,kind,title:row.title,status:source.status,
    owner_id:row.owner_id||row.assignee_id||null,due_date_iso:row.due_date,review_type:row.review_type||null,period:kind==='review'?source.period:null,
    occurrence_id:oid,historical:!!terminal,can_reschedule:!terminal&&canMoveCalendar(kind,source,user)};
}
export function calendarWindow(start,end) {
  const first=start?calendarDay(start):calendarDay(new Date().toISOString())-42*86400000;
  const last=end?calendarDay(end):first+92*86400000;
  if(first==null||last==null||last<first||last-first>366*86400000)throw new Error('Choose a valid Calendar period of no more than 367 days.');
  return [first,last];
}
export function calendarBuckets(records,user,{start,end,scope='active'}={}) {
  if(!CALENDAR_SCOPES.some(([key])=>key===scope))throw new Error('Invalid Calendar scope');
  const [first,last]=calendarWindow(start,end),entries=new Map();
  const inRange=row=>{const day=calendarDay(row.due_date);return day!=null&&day>=first&&day<=last;};
  const add=(row,kind,history=false)=>{const value=calendarItem(row,kind,user,history);if(scope==='active'&&value.historical||scope==='history'&&!value.historical)return;entries.set(value.key,value);};
  const bounded=rows=>{if(rows.length>5000)throw new Error('Too many Calendar entries. Choose a shorter period; no partial results are shown.');return rows;};
  for(const kind of ['review','finding','task']) {
    const rows=(records[kind+'s']||[]).filter(r=>inRange(r)&&(scope==='all'||(scope==='history')===!!calendarTerminal(kind,r)));
    for(const row of bounded(rows))add(row,kind);
  }
  if(scope!=='active') {
    const history=(records.reviews||[]).flatMap(r=>(r.occurrences||[]).filter(o=>o.occurrence_id&&calendarTerminal('review',o)&&inRange(o)&&(!o.client_id||o.client_id===r.client_id)&&(!o.review_id||o.review_id===r.review_id)).map(o=>({...o,client_id:r.client_id,review_id:r.review_id})));
    for(const row of bounded(history))add(row,'review',true);
  }
  const result={reviews:{},findings:{},tasks:{}};
  for(const value of [...entries.values()].sort((a,b)=>a.due_date_iso.localeCompare(b.due_date_iso)||Number(a.historical)-Number(b.historical)||(a.title||'').localeCompare(b.title||'')||a.key.localeCompare(b.key))) (result[value.kind+'s'][value.due_date_iso.slice(0,10)]||=[]).push(value);
  return result;
}
export function calendarStatus(item) {
  if(item.kind==='task')return actionStatus(item.status);
  return ({needs_scheduling:'Needs Scheduling',upcoming:'Upcoming',in_progress:'In Progress',completed:'Completed',cancelled:'Cancelled',open:'Open',in_remediation:'In Remediation',remediated:'Pending Validation',closed:'Closed',accepted:'Accepted'})[item.status]||'Status not recorded';
}
export const calendarType=item=>({review:'Review',finding:'Finding',task:'Action Item'})[item.kind]||'Record';
export function calendarSelection(item,record,cid) {
  if(record.client_id!==cid||item.client_id!==cid)throw new Error('Record belongs to another client.');
  if(item.kind!=='review')return {};
  const occurrence=record.occurrences?.find(o=>o.occurrence_id===item.occurrence_id);
  if(occurrence)return {occurrence};
  if(item.occurrence_id!==occurrenceId(record))throw new Error('This Review occurrence is no longer available. Refresh the Calendar.');
  return {};
}
export function rescheduledDate(value,target) {
  if(calendarDay(target)==null)throw new Error('Choose a valid date.');
  // Preserve date-only values, time, offset and precision; this is a date move, not a timezone conversion.
  return target+String(value||'').slice(10);
}
