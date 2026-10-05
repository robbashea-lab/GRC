import rules from './grcRules.json';
import {isInternal,isAssignedTo} from './permissions';
import {occurrenceId,reviewView} from './reviewOccurrences';
import {actionStatus} from './actionItems';
import {calendarDay} from './tableFilters';
import {assuranceKey} from './brawndoVendors';

export const CALENDAR_SCOPES=[['active','Active'],['history','Completed / Closed'],['all','All']];
export const localCalendarDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function calendarPeriod(anchor,view='month') {
  const first=new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate());
  if(view==='month')first.setDate(1);
  if(view==='week')first.setDate(first.getDate()-((first.getDay()+6)%7));
  const last=new Date(first);
  if(view==='month')last.setMonth(last.getMonth()+1,0);
  if(view==='week')last.setDate(last.getDate()+6);
  const gridFirst=new Date(first);
  if(view==='month')gridFirst.setDate(gridFirst.getDate()-((gridFirst.getDay()+6)%7));
  const count=view==='month'?42:view==='week'?7:1;
  const days=Array.from({length:count},(_,i)=>new Date(gridFirst.getFullYear(),gridFirst.getMonth(),gridFirst.getDate()+i));
  const format=d=>d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  const label=view==='month'?first.toLocaleDateString(undefined,{month:'long',year:'numeric'}):view==='day'?format(first):`${format(first)} – ${format(last)}`;
  return {days,start:localCalendarDate(first),end:localCalendarDate(last),label};
}
export function stepCalendarDate(anchor,view,direction) {
  const next=new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate());
  if(view==='month') {
    const selectedDay=next.getDate();next.setDate(1);next.setMonth(next.getMonth()+direction);
    next.setDate(Math.min(selectedDay,new Date(next.getFullYear(),next.getMonth()+1,0).getDate()));
  } else next.setDate(next.getDate()+direction*(view==='week'?7:1));
  return next;
}
export const calendarTerminal=(kind,row)=>rules.closed[kind+'s']?.includes(row.status);
export function canMoveCalendar(kind,row,user) {
  // Server field allowlist: client roles may move Action Item due dates only, contributors only on their own.
  if(calendarTerminal(kind,row))return false;
  if(isInternal(user))return kind!=='review'||row.vendor_purpose!=='contract';
  if(kind!=='task')return false;
  return user?.role==='client_grc_manager'||(user?.role==='client_contributor'&&isAssignedTo(user,row));
}
export function calendarItem(row,kind,user,historical=false) {
  const source=kind==='review'?reviewView(row):row;
  const oid=kind==='review'?(row.occurrence_id||occurrenceId(row)):null;
  const terminal=historical||calendarTerminal(kind,source);
  return {id:row[kind+'_id'],key:`${kind}:${row[kind+'_id']}:${oid||'current'}`,client_id:row.client_id,kind,title:row.title,status:source.status,
    owner_id:row.owner_id||row.assignee_id||null,due_date_iso:row.due_date,review_type:row.review_type||null,period:kind==='review'?source.period:null,
    updated_at:row.updated_at??null,occurrence_id:oid,historical:!!terminal,can_reschedule:!terminal&&canMoveCalendar(kind,source,user)};
}
export function calendarWindow(start,end) {
  const first=start?calendarDay(start):calendarDay(new Date().toISOString())-42*86400000;
  const last=end?calendarDay(end):first+92*86400000;
  if(first==null||last==null||last<first||last-first>366*86400000)throw new Error('Choose a valid Calendar period of no more than 367 days.');
  return [first,last];
}
export function calendarBuckets(records,user,{start,end,scope='active',overdue_before}={}) {
  if(!CALENDAR_SCOPES.some(([key])=>key===scope))throw new Error('Invalid Calendar scope');
  const [first,last]=calendarWindow(start,end),entries=new Map();
  const inRange=row=>{const day=calendarDay(row.due_date);return day!=null&&day>=first&&day<=last;};
  const cutoff=overdue_before?calendarDay(overdue_before):null;
  if(overdue_before&&cutoff==null)throw new Error('Choose a valid overdue cutoff date.');
  const add=(row,kind,history=false)=>{const value=calendarItem(row,kind,user,history);if(scope==='active'&&value.historical||scope==='history'&&!value.historical)return;entries.set(value.key,value);};
  const bounded=rows=>{if(rows.length>5000)throw new Error('Too many Calendar entries. Choose a shorter period; no partial results are shown.');return rows;};
  for(const kind of ['review','finding','task']) {
    const rows=(records[kind+'s']||[]).filter(r=>(inRange(r)||scope!=='history'&&cutoff!=null&&!calendarTerminal(kind,r)&&calendarDay(r.due_date)!=null&&calendarDay(r.due_date)<cutoff)&&(scope==='all'||(scope==='history')===!!calendarTerminal(kind,r)));
    for(const row of bounded(rows))add(row,kind);
  }
  if(scope!=='active') {
    const history=(records.reviews||[]).flatMap(r=>(r.occurrences||[]).filter(o=>o.occurrence_id&&calendarTerminal('review',o)&&inRange(o)&&(!o.client_id||o.client_id===r.client_id)&&(!o.review_id||o.review_id===r.review_id)).map(o=>({...o,client_id:r.client_id,review_id:r.review_id})));
    for(const row of bounded(history))add(row,'review',true);
  }
  // A Finding with an active Action is represented by that Action in work counts (the grid still shows both).
  const covered=new Set((records.tasks||[]).filter(t=>t.finding_id&&!calendarTerminal('task',t)).map(t=>t.finding_id));
  for(const value of entries.values())if(value.kind==='finding')value.represented=covered.has(value.id);
  const result={reviews:{},findings:{},tasks:{}};
  for(const value of [...entries.values()].sort((a,b)=>a.due_date_iso.localeCompare(b.due_date_iso)||Number(a.historical)-Number(b.historical)||(a.title||'').localeCompare(b.title||'')||a.key.localeCompare(b.key))) (result[value.kind+'s'][value.due_date_iso.slice(0,10)]||=[]).push(value);
  return result;
}
export function calendarStatus(item) {
  if(item.kind==='task')return actionStatus(item.status);
  if(item.kind?.startsWith('vendor_'))return 'Vendor date';
  return ({needs_scheduling:'Needs Scheduling',upcoming:'Upcoming',in_progress:'In Progress',completed:'Completed',cancelled:'Cancelled',open:'Open',in_remediation:'In Remediation',remediated:'Pending Validation',closed:'Closed',accepted:'Accepted'})[item.status]||'Status not recorded';
}
export const calendarType=item=>({review:'Review',finding:'Finding',task:'Action Item',...VENDOR_EVENT_LABELS})[item.kind]||'Record';
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

// Brawndo: Vendor dates projected directly from the authoritative Vendor record (no Reviews are created).
// Security assurance follow-up, contract renewal and the contract notice deadline stay distinct event types.
export const VENDOR_EVENT_LABELS={vendor_assurance:'Security Assurance Due',vendor_contract_renewal:'Contract Renewal',vendor_contract_notice:'Contract Notice Deadline'};
export function vendorCalendarItems(vendors=[],reviews=[],{start,end,scope='active',overdue_before}={},now=new Date()) {
  const [first,last]=calendarWindow(start,end),out={},today=calendarDay(overdue_before||localCalendarDate(now));
  const iso=day=>new Date(day).toISOString().slice(0,10);
  // Past assurance follow-ups remain open obligations (overdue); a passed renewal or notice date is history,
  // as on the Brawndo Vendors page (Renewals Upcoming lists future dates only).
  const add=(v,kind,day,suffix,label,extra={})=>{
    const historical=kind!=='vendor_assurance'&&day<today;
    if(day==null||((day<first||day>last)&&!(kind==='vendor_assurance'&&overdue_before&&day<calendarDay(overdue_before))))return;
    if(scope==='active'&&historical||scope==='history'&&!historical)return;
    const value={id:v.vendor_id,vendor_id:v.vendor_id,key:`${kind}:${v.vendor_id}:${suffix}`,client_id:v.client_id,kind,title:`${label} — ${v.name}`,
      status:'scheduled',owner_id:v.business_owner_id||null,due_date_iso:iso(day),review_type:null,period:null,occurrence_id:null,historical,can_reschedule:false,...extra};
    (out[value.due_date_iso]||=[]).push(value);
  };
  for(const v of vendors) {
    if(['inactive','terminated'].includes(v.status))continue;
    const active=reviews.filter(r=>r.client_id===v.client_id&&r.vendor_id===v.vendor_id&&!['completed','cancelled'].includes(r.status));
    (v.assurance_records||[]).forEach((a,i)=>{
      if(a.superseded_by)return;
      const day=calendarDay(a.next_follow_up||a.refresh_due);
      // A Vendor or Assurance Review due the same day already carries this obligation on the Calendar.
      if(active.some(r=>['vendor','assurance'].includes(r.vendor_purpose||'vendor')&&calendarDay(r.due_date)===day))return;
      add(v,'vendor_assurance',day,assuranceKey(a,i),`${VENDOR_EVENT_LABELS.vendor_assurance} · ${a.type||'Assurance'}`,{assurance_id:a.assurance_id||null});
    });
    const notice=calendarDay(v.contract_notice_deadline),renewal=calendarDay(v.contract_renewal);
    if(!active.some(r=>r.vendor_purpose==='contract')&&renewal!==notice)add(v,'vendor_contract_renewal',renewal,'renewal',VENDOR_EVENT_LABELS.vendor_contract_renewal);
    add(v,'vendor_contract_notice',notice,'notice',VENDOR_EVENT_LABELS.vendor_contract_notice);
  }
  for(const items of Object.values(out))items.sort((a,b)=>a.title.localeCompare(b.title));
  return out;
}
