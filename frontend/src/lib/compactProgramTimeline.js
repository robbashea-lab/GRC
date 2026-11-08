import {calendarDay} from './managementDates';
import {timelineBounds} from './brawndoAdditionalPolicyVendor';
import {occurrenceId} from './reviewOccurrences';
import {reviewMatches} from './tableFilters';
import {brawndoTicketActive,brawndoDueWindow} from './brawndoDemoActions';

// Only saved obligations are shown. A chart never creates a future occurrence.
export function reviewTimelineEvents(rows) {
  return rows.filter(row=>reviewMatches(row,'all')&&calendarDay(row.due_date)!==null).map(record=>({
    id:`review:${record.review_id}:${occurrenceId(record)}`,date:record.due_date,title:record.title,
    label:'Review due',kind:record.recurrence==='monthly'?'monthly':record.recurrence==='quarterly'?'quarterly':'other',
    detail:record.recurrence||'No recurrence',record,occurrenceId:occurrenceId(record),
  }));
}
export function actionTimelineEvents(rows) {
  return rows.filter(row=>brawndoTicketActive(row)&&brawndoDueWindow(row)!=='unscheduled').map(record=>{
    // A Finding without an Action has no Action priority; its severity is not a substitute.
    const priority=record.primary?.priority||(record.kind==='tasks'?record.raw?.priority:null);
    return {id:`action:${record.ticketId}`,date:record.due_date,title:record.title,label:record.primary?'Action due':'Finding due',
      kind:['critical','immediate','high'].includes(priority)?'high':priority==='low'?'low':'other',
      detail:`Action priority: ${priority||'Not recorded'}`,record};
  });
}

// A bounded set of lanes and date buckets exposes every member without row-per-record growth.
export function compactTimelineGroups(events,rows=3,now=new Date()) {
  const bounds=timelineBounds(now),seen=new Set();
  const ordered=events.filter(event=>{
    if(!event.id||seen.has(event.id)||calendarDay(event.date)===null||calendarDay(event.date)>bounds.end)return false;
    seen.add(event.id);return true;
  }).sort((a,b)=>calendarDay(a.date)-calendarDay(b.date)||String(a.id).localeCompare(String(b.id)));
  const buckets=new Map();
  ordered.forEach(event=>{
    const point=Math.max(0,Math.min(100,bounds.position(event.date)));
    const bucket=Math.floor(point/8),key=String(bucket);
    if(!buckets.has(key))buckets.set(key,{id:key,point,events:[]});
    buckets.get(key).events.push(event);
  });
  const lanes=Array.from({length:rows},()=>[]);
  [...buckets.values()].forEach((group,index)=>lanes[index%rows].push(group));
  return {...bounds,events:ordered,lanes};
}
