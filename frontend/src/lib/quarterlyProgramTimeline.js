import {calendarDay} from './managementDates';
import {localCalendarDate} from './calendarView';
import {occurrenceId} from './reviewOccurrences';
import {reviewMatches} from './tableFilters';
import {brawndoTicketActive} from './brawndoDemoActions';
import {ticketStage} from './remediationTickets';
import {riskIsClosed} from './riskRegister';
import {isOpen} from './grcWork';
import {cisClientProgram} from './cisExperience';
import {reviewExecutions} from './brawndoDemoReviews';

export const QUARTERLY_REVIEW_LEGEND = [
  {kind:'monthly',label:'Monthly',shape:'circle',tone:'blue'},
  {kind:'quarterly',label:'Quarterly',shape:'diamond',tone:'amber'},
  {kind:'semiannual',label:'Semiannual',shape:'square',tone:'green'},
  {kind:'annual',label:'Annual',shape:'triangle',tone:'blue'},
  {kind:'other',label:'Other',shape:'hexagon',tone:'muted'},
];
export const QUARTERLY_ACTION_LEGEND = [
  {kind:'low',label:'Low',shape:'circle',tone:'green'},
  {kind:'medium',label:'Medium',shape:'diamond',tone:'blue'},
  {kind:'high',label:'High',shape:'square',tone:'amber'},
  {kind:'critical',label:'Critical',shape:'triangle',tone:'danger'},
  {kind:'unclassified',label:'Unclassified',shape:'hexagon',tone:'muted'},
];
export const QUARTERLY_RISK_LEGEND = [
  {kind:'review',label:'Risk review',shape:'circle',tone:'blue'},
  {kind:'action',label:'Treatment action',shape:'diamond',tone:'amber'},
  {kind:'expiry',label:'Risk acceptance',shape:'square',tone:'green'},
];

// Chart-local state identity only; the native route and commands still authorize access.
export function quarterlyChartScope(user,workspaceMode,currentClient) {
  const program=cisClientProgram(currentClient);
  return JSON.stringify([user?.user_id,user?.role,Array.isArray(user?.client_ids)?[...user.client_ids].sort():[],
    workspaceMode,user?.workspace_mode,currentClient?.client_id,program?.programId,program?.implementationGroup,program?.version]);
}

// Match the native Calendar's viewer-local day while retaining literal due dates.
export const quarterToday = (now=new Date()) => calendarDay(localCalendarDate(now));
export function currentQuarter(now=new Date()) {
  return {year:now.getFullYear(),quarter:Math.floor(now.getMonth()/3)+1};
}
export function shiftQuarter({year,quarter},delta) {
  const index=year*4+quarter-1+delta;
  return {year:Math.floor(index/4),quarter:((index%4)+4)%4+1};
}
export function quarterTimelineBounds({year,quarter}) {
  const firstMonth=(quarter-1)*3;
  const months=Array.from({length:3},(_,index)=>new Date(Date.UTC(year,firstMonth+index,1)));
  const start=months[0].getTime()/86400000,end=Date.UTC(year,firstMonth+3,1)/86400000;
  return {year,quarter,start,end,months,position:value=>(calendarDay(value)-start)/(end-start)*100};
}
const compareEvents=(a,b)=>calendarDay(a.date)-calendarDay(b.date)
  ||String(a.title||'').localeCompare(String(b.title||''))||String(a.id).localeCompare(String(b.id));

// The chart reads saved events only; a different quarter never schedules work.
export function quarterTimelineGroups(events,selection) {
  const bounds=quarterTimelineBounds(selection),seen=new Set();
  const ordered=events.filter(event=>{
    const day=calendarDay(event.date);
    if(!event.id||seen.has(event.id)||day===null||day<bounds.start||day>=bounds.end)return false;
    seen.add(event.id);return true;
  }).sort(compareEvents);
  const groups=new Map();
  ordered.forEach(event=>{
    const date=new Date(calendarDay(event.date)*86400000).toISOString().slice(0,10),id=`${date}:${event.kind}`;
    if(!groups.has(id))groups.set(id,{id,date,kind:event.kind,point:bounds.position(date),events:[]});
    groups.get(id).events.push(event);
  });
  return {...bounds,events:ordered,groups:[...groups.values()]};
}

export function isOverdue(event,now=new Date()) {
  const status=event.status??event.record?.status??event.review?.status;
  if(event.overdueEligible===false||event.historical||event.represented
    ||['completed','done','closed','cancelled','retired'].includes(status))return false;
  const day=calendarDay(event.date);
  return day!==null&&day<quarterToday(now);
}

export function quarterlyReviewEvents(rows) {
  const current=rows.filter(row=>reviewMatches(row,'all')&&calendarDay(row.due_date)!==null).map(record=>({
    id:`review:${record.review_id}:${occurrenceId(record)}`,date:record.due_date,title:record.title,
    label:'Review due',kind:['monthly','quarterly','semiannual','annual'].includes(record.recurrence)?record.recurrence:'other',
    detail:record.recurrence||'No recurrence',record,status:record.status,occurrenceId:occurrenceId(record),
  }));
  const seen=new Set(current.map(event=>event.id));
  const historical=reviewExecutions(rows).flatMap(({review,execution})=>{
    const id=`review:${review.review_id}:${execution.occurrence_id}`;
    if(seen.has(id)||!['completed','cancelled'].includes(execution.status)||calendarDay(execution.due_date)===null
      ||execution.client_id&&execution.client_id!==review.client_id
      ||execution.review_id&&execution.review_id!==review.review_id)return [];
    seen.add(id);
    // Match the native history opener; cadence and date belong to the saved execution.
    const record={...review,...execution,review_id:review.review_id,due_date:execution.due_date,
      recurrence:execution.recurrence,_review:review,_execution:execution};
    return [{id,date:execution.due_date,title:execution.title||'Historical Review occurrence',
      label:execution.status==='completed'?'Completed Review occurrence':'Cancelled Review occurrence',
      kind:['monthly','quarterly','semiannual','annual'].includes(execution.recurrence)?execution.recurrence:'other',
      detail:execution.recurrence||'Cadence not recorded',record,status:execution.status,
      occurrenceId:execution.occurrence_id,historical:true,
    }];
  });
  return [...current,...historical];
}

export function quarterlyActionEvents(rows) {
  return rows.filter(brawndoTicketActive).flatMap(record=>{
    const actions=record.actions||[],active=actions.filter(task=>!['done','cancelled'].includes(task.status));
    // Completed work awaiting Finding validation was already a saved chart date.
    const datedActions=active.length?active:ticketStage(record)==='pending_validation'&&record.primary?[record.primary]:[];
    const events=datedActions.filter(task=>task.task_id&&calendarDay(task.due_date)!==null).map(task=>({
      id:`${task.client_id||record.client_id||record.raw?.client_id}:action:${task.task_id}`,
      date:task.due_date,title:task.title||record.title,label:'Action due',
      kind:['low','medium','high','critical'].includes(task.priority)?task.priority:'unclassified',
      detail:`Action priority: ${task.priority||'Not recorded'}${task.status==='done'?'; work completed, Finding validation pending':''}`,
      status:task.status,record,task,
    }));
    // A native Finding deadline without a primary Action has no Action priority.
    if(!record.primary&&record.finding?.finding_id&&calendarDay(record.due_date)!==null)events.push({
      id:`${record.finding.client_id}:finding:${record.finding.finding_id}`,
      date:record.due_date,title:record.title,label:'Finding due',kind:'unclassified',
      detail:`Action priority: Not recorded. ${record.diagnostic||'No primary Action recorded'}. Finding severity is not Action priority.`,
      record,status:record.finding.status,
    });
    return events;
  });
}

// Unlike the legacy upcoming window, browsing quarters can read any saved date.
// Relationship conflicts still withhold the ambiguous Action rather than invent its deadline.
export function quarterlyRiskEvents(rows,relations) {
  const events=[],seen=new Set(),actionDates=new Map(),conflictingActions=new Set();
  const actionId=task=>`${task.client_id}:action:${task.task_id}`;
  for(const risk of rows.filter(row=>!riskIsClosed(row)))for(const task of relations[risk.risk_id]||[]) {
    if(task.client_id!==risk.client_id||!task.task_id||!isOpen('tasks',task))continue;
    const id=actionId(task),day=calendarDay(task.due_date);
    if(actionDates.has(id)&&actionDates.get(id)!==day)conflictingActions.add(id);
    else actionDates.set(id,day);
  }
  function add(risk,kind,record,date) {
    if(calendarDay(date)===null)return;
    const id=kind==='action'?actionId(record):`${risk.client_id}:${risk.risk_id}:${kind}`;
    if(seen.has(id)||conflictingActions.has(id))return;
    seen.add(id);
    events.push({id,key:id,risk,kind,record,date,day:calendarDay(date),status:record.status,
      title:record.title||record.display_id||'ID pending',
      label:kind==='review'?'Risk review':kind==='action'?'Treatment action due':'Acceptance expires',
      detail:kind==='action'?`Linked Risk: ${risk.display_id||risk.risk_id}`:risk.display_id||risk.risk_id,
    });
  }
  for(const risk of rows) {
    if(riskIsClosed(risk))continue;
    add(risk,'review',risk,risk.next_review);
    if(risk.status==='accepted')add(risk,'expiry',risk,risk.acceptance_expires_at);
    for(const task of relations[risk.risk_id]||[]) {
      if(task.client_id===risk.client_id&&task.task_id&&isOpen('tasks',task))add(risk,'action',task,task.due_date);
    }
  }
  return {events:events.sort(compareEvents),conflictingActions:[...conflictingActions].sort()};
}
