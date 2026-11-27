import {assessedRisk} from './grcWork';
import {calendarDay} from './managementDates';
import {riskIsClosed} from './riskRegister';
import {currentQuarter,quarterToday,quarterTimelineBounds} from './quarterlyProgramTimeline';

const DAY=86400000;

export const RISK_CONCEPT_TYPES=[
  {kind:'review',label:'Risk review',color:'#2f66c6'},
  {kind:'action',label:'Treatment action',color:'#b38131'},
  {kind:'expiry',label:'Acceptance expiry',color:'#199681'},
];

export function riskDate(value,{year=true}={}) {
  const day=calendarDay(value);
  return day===null?'Not recorded':new Date(day*DAY).toLocaleDateString('en-US',{
    month:'short',day:'numeric',year:year?'numeric':undefined,timeZone:'UTC',
  });
}

export function riskUrgency(value,now=new Date()) {
  const day=calendarDay(value),today=quarterToday(now);
  if(day===null||today===null)return {className:'unscheduled',text:'Not scheduled',days:null};
  const days=day-today;
  return {
    className:days<0?'overdue':days===0?'today':days<=7?'week':days<=15?'fortnight':days<=30?'month':'later',
    text:days<0?`${-days} ${days===-1?'day':'days'} overdue`:days===0?'Due today':`In ${days} ${days===1?'day':'days'}`,
    days,
  };
}

// The register owns metric definitions, including current acceptance and its UTC upcoming window.
export function riskConceptFigures(rows,matches,now=new Date()) {
  const active=rows.filter(row=>!riskIsClosed(row)&&matches(row,'all_active',now));
  const accepted=rows.filter(row=>matches(row,'accepted',now));
  const significant=active.filter(row=>matches(row,'significant',now)).map(assessedRisk);
  const high=[...significant].sort((a,b)=>b.risk_score-a.risk_score)[0];
  const expiry=accepted.map(row=>row.acceptance_expires_at).filter(value=>calendarDay(value)!==null)
    .sort((a,b)=>calendarDay(a)-calendarDay(b))[0];
  const nextReview=active.filter(row=>calendarDay(row.next_review)!==null)
    .sort((a,b)=>calendarDay(a.next_review)-calendarDay(b.next_review))[0];
  return [
    {id:'all_active',label:'Active risks',count:active.length,
      detail:`${active.filter(row=>['in_progress','treated'].includes(row.status)).length} in treatment · ${active.filter(row=>['identified','assessed','open'].includes(row.status)).length} open · ${accepted.length} accepted`},
    {id:'significant',label:'High or critical',count:significant.length,
      detail:high?`${high.display_id||'Risk'} · score ${high.risk_score}`:'None'},
    {id:'upcoming',label:'Review due in 30 days',count:rows.filter(row=>matches(row,'upcoming',now)).length,
      detail:nextReview?`Next ${riskDate(nextReview.next_review,{year:false})} · ${nextReview.display_id||'ID pending'}`:'None scheduled'},
    {id:'accepted',label:'Accepted',count:accepted.length,
      detail:expiry?`Expires ${riskDate(expiry,{year:false})}`:'No current acceptance'},
  ];
}

const eventLabel=event=>RISK_CONCEPT_TYPES.find(type=>type.kind===event.kind)?.label||event.label||'';
const compareEvents=(a,b)=>calendarDay(a.date)-calendarDay(b.date)
  ||eventLabel(a).localeCompare(eventLabel(b))||String(a.title||'').localeCompare(String(b.title||''))
  ||String(a.id).localeCompare(String(b.id));

// Input is the native quarterlyRiskEvents projection; this only places its saved events.
export function riskConceptQuarter(events,selection,width=500,now=new Date()) {
  const bounds=quarterTimelineBounds(selection||currentQuarter(now));
  const start=bounds.start,end=bounds.end-1,plotWidth=Number.isFinite(width)&&width>0?width:500;
  const position=day=>18+(day-start)/(end-start)*Math.max(120,plotWidth-36);
  const seen=new Set();
  const ordered=events.filter(event=>{
    const day=calendarDay(event.date);
    if(!event.id||seen.has(event.id)||day===null||day<start||day>end)return false;
    seen.add(event.id);
    return true;
  }).sort(compareEvents);
  const dateGroups=new Map();
  for(const event of ordered) {
    const date=new Date(calendarDay(event.date)*DAY).toISOString().slice(0,10);
    if(!dateGroups.has(date))dateGroups.set(date,[]);
    dateGroups.get(date).push(event);
  }
  const laneEnds=[];
  const groups=[...dateGroups].map(([date,items])=>{
    const groupWidth=Math.max(48,items.length*23),anchor=position(calendarDay(date));
    let lane=0;
    while(laneEnds[lane]!==undefined&&anchor-groupWidth/2<laneEnds[lane]+12)lane++;
    laneEnds[lane]=anchor+groupWidth/2;
    return {date,items,width:groupWidth,anchor,left:Math.min(plotWidth-groupWidth-2,Math.max(2,anchor-groupWidth/2)),lane};
  });
  const ticks=[];
  for(let day=start;day<=end;day+=7)ticks.push(day);
  if(ticks[ticks.length-1]!==end)ticks.push(end);
  return {start,end,months:bounds.months.map(month=>month.getTime()/DAY),ticks,today:quarterToday(now),
    groups,events:ordered,height:Math.max(190,laneEnds.length*54+30),position};
}

// Match /related's same-client Risk→Action OR query without its 200-record display cap.
export function riskTreatmentRelations(risks,tasks,clientId) {
  if(!Array.isArray(risks)||!Array.isArray(tasks))throw new Error('Linked Action collection is unavailable.');
  const validId=value=>typeof value==='string'&&value.trim().length>0;
  const validRecord=record=>record!==null&&typeof record==='object'&&!Array.isArray(record);
  if(!validId(clientId)
    ||risks.some(risk=>!validRecord(risk)||risk.client_id!==clientId||!validId(risk.risk_id))
    ||tasks.some(task=>!validRecord(task)||task.client_id!==clientId||!validId(task.task_id))) {
    throw new Error('Linked Actions have invalid client or record identities.');
  }
  if(risks.some(risk=>risk.related_task_ids!=null&&(!Array.isArray(risk.related_task_ids)||risk.related_task_ids.some(id=>!validId(id))))) {
    throw new Error('Linked Action references are invalid.');
  }
  return Object.fromEntries(risks.map(risk=>[risk.risk_id,tasks.filter(task=>task.risk_id===risk.risk_id
    ||risk.task_id===task.task_id||risk.related_task_ids?.includes(task.task_id))]));
}
