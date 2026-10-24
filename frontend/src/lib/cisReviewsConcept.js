import {calendarDay} from './managementDates';
import {occurrenceId} from './reviewOccurrences';
import {reviewMatches} from './tableFilters';
import {quarterToday,quarterTimelineBounds} from './quarterlyProgramTimeline';
import {reviewDisplayValue} from './reviewPresentation';

export {currentQuarter,shiftQuarter,quarterToday} from './quarterlyProgramTimeline';

const reviewStatusLabels={upcoming:'Upcoming',in_progress:'In progress',not_started:'Not started',needs_scheduling:'Needs scheduling'};

// Concept labels are display-only; native history and stored status values stay unchanged.
export function cisReviewStatusLabel(value) {
  return Object.hasOwn(reviewStatusLabels,value)?reviewStatusLabels[value]:reviewDisplayValue('status',value);
}

export const CIS_REVIEW_CADENCES = [
  {kind:'monthly',label:'Monthly',color:'#2f66c6'},
  {kind:'quarterly',label:'Quarterly',color:'#b38131'},
  {kind:'semiannual',label:'Semi-annual',color:'#199681'},
  {kind:'annual',label:'Annual',color:'#7a6bc2'},
  {kind:'other',label:'Other',color:'#77859c'},
];

export function cisReviewCadence(record) {
  return CIS_REVIEW_CADENCES.find(cadence=>cadence.kind===record.recurrence) || CIS_REVIEW_CADENCES[4];
}

const compareEvents=(a,b)=>calendarDay(a.date)-calendarDay(b.date)
  || String(a.title||'').localeCompare(String(b.title||'')) || a.id.localeCompare(b.id);

// Only saved current occurrences enter this view; history and recurrence projections stay native.
export function cisReviewEvents(rows) {
  const seen=new Set();
  return rows.flatMap(record=>{
    if(!record.review_id || !reviewMatches(record,'all') || calendarDay(record.due_date)===null)return [];
    const currentOccurrence=occurrenceId(record);
    const id=JSON.stringify([record.client_id||null,record.review_id,currentOccurrence]);
    if(seen.has(id))return [];
    seen.add(id);
    return [{id,date:record.due_date,title:record.title,kind:cisReviewCadence(record).kind,
      record,occurrenceId:currentOccurrence}];
  }).sort(compareEvents);
}

export function cisReviewQuarter(events,selection) {
  const bounds=quarterTimelineBounds(selection),seen=new Set();
  const ordered=events.filter(event=>{
    const day=calendarDay(event.date);
    if(!event.id || seen.has(event.id) || day===null || day<bounds.start || day>=bounds.end)return false;
    seen.add(event.id);
    return true;
  }).sort(compareEvents);
  const groups=new Map();
  ordered.forEach(event=>{
    const date=new Date(calendarDay(event.date)*86400000).toISOString().slice(0,10);
    if(!groups.has(date))groups.set(date,{id:date,date,point:bounds.position(date),events:[]});
    groups.get(date).events.push(event);
  });
  return {...bounds,events:ordered,groups:[...groups.values()]};
}

export function cisReviewAgenda(events,now=new Date()) {
  const today=quarterToday(now),ordered=[...events].sort(compareEvents);
  return {upcoming:ordered.filter(event=>calendarDay(event.date)!==null&&calendarDay(event.date)>=today),
    overdue:ordered.filter(event=>calendarDay(event.date)!==null&&calendarDay(event.date)<today)};
}

export function cisReviewUrgency(value,now=new Date(),closed=false) {
  const day=calendarDay(value),days=day===null?null:day-quarterToday(now);
  let tone='neutral',text='Not scheduled';
  if(closed){tone='completed';text='Completed';}
  else if(days!==null){
    tone=days<0?'overdue':days===0?'today':days<=7?'week':days<=15?'fortnight':days<=30?'month':'later';
    text=days<0?`${-days} ${days===-1?'day':'days'} overdue`:days===0?'Due today':`In ${days} ${days===1?'day':'days'}`;
  }
  return {days,tone,className:tone,text};
}

export function formatCisReviewDate(value,{long=false,year=false}={}) {
  const day=calendarDay(value);
  return day===null?'Not scheduled':new Date(day*86400000).toLocaleDateString('en-US',{
    month:long?'long':'short',day:'numeric',...((long||year)?{year:'numeric'}:{}),timeZone:'UTC',
  });
}
