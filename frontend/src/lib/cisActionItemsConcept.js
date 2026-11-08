import {calendarDay} from './managementDates';
import {brawndoTicketActive} from './brawndoDemoActions';
import {ticketStage} from './remediationTickets';
import {currentQuarter,quarterTimelineBounds,quarterToday} from './quarterlyProgramTimeline';

export const ACTION_CONCEPT_PRIORITIES = [
  {key:'low',label:'Low',color:'#199681'},
  {key:'medium',label:'Medium',color:'#2f66c6'},
  {key:'high',label:'High',color:'#b38131'},
  {key:'critical',label:'Critical',color:'#b43c55'},
];

export function actionConceptPriority(value) {
  // Native actionPriority/ranks establish these display aliases; saved values stay intact.
  const key=({moderate:'medium',immediate:'critical'})[value]||value;
  return ACTION_CONCEPT_PRIORITIES.find(priority=>priority.key===key)
    ||{key:'unclassified',label:value==='informational'?'Informational':value&&value!=='unclassified'?`Unclassified (${value})`:'Unclassified',color:'#7b8794'};
}

const compareEvents=(a,b)=>calendarDay(a.date)-calendarDay(b.date)
  ||String(a.title||'').localeCompare(String(b.title||''))||a.id.localeCompare(b.id);

export function actionConceptEvents(rows) {
  const seen=new Set(),events=[];
  for(const record of rows.filter(brawndoTicketActive)) {
    const active=record.actions.filter(task=>!['done','cancelled'].includes(task.status));
    // The native timeline retains the primary saved deadline while Finding validation is pending.
    const tasks=active.length?active:ticketStage(record)==='pending_validation'&&record.primary?[record.primary]:[];
    for(const task of tasks) {
      const clientId=task.client_id||record.client_id||record.raw?.client_id;
      if(!clientId||!task.task_id||calendarDay(task.due_date)===null)continue;
      const id=`${clientId}:action:${task.task_id}`;
      if(seen.has(id))continue;
      seen.add(id);
      const priority=actionConceptPriority(task.priority);
      events.push({id,date:task.due_date,title:task.title||record.title,label:'Action due',kind:priority.key,
        priority,status:ticketStage(record),taskStatus:task.status,record,task});
    }
  }
  return events.sort(compareEvents);
}

export function actionConceptUrgency(date,now=new Date()) {
  const day=calendarDay(date);
  if(day===null)return {className:'unscheduled',text:'Unscheduled'};
  const days=day-quarterToday(now);
  if(days<0)return {className:'overdue',text:`${-days} ${days===-1?'day':'days'} overdue`};
  if(days===0)return {className:'today',text:'Due today'};
  return {className:days<=7?'week':days<=15?'fortnight':days<=30?'month':'later',text:`In ${days} ${days===1?'day':'days'}`};
}

export function actionConceptQuarter(events,selection=currentQuarter(),now=new Date()) {
  const bounds=quarterTimelineBounds(selection),seen=new Set(),groups=new Map();
  // Both displayed endpoints are real quarter days: October 1 through December 31.
  const position=value=>(calendarDay(value)-bounds.start)/(bounds.end-bounds.start-1)*100;
  const ordered=events.filter(event=>{
    const day=calendarDay(event.date);
    if(!event.id||seen.has(event.id)||day===null||day<bounds.start||day>=bounds.end)return false;
    seen.add(event.id);return true;
  }).sort(compareEvents);
  for(const event of ordered) {
    const date=new Date(calendarDay(event.date)*86400000).toISOString().slice(0,10);
    if(!groups.has(date))groups.set(date,{id:date,date,point:position(date),events:[]});
    groups.get(date).events.push(event);
  }
  const today=quarterToday(now),upcoming=ordered.filter(event=>calendarDay(event.date)>=today);
  return {...bounds,position,events:ordered,groups:[...groups.values()],upcoming,
    overdue:ordered.filter(event=>calendarDay(event.date)<today),
    todayPoint:today>=bounds.start&&today<bounds.end?(today-bounds.start)/(bounds.end-bounds.start-1)*100:null};
}
