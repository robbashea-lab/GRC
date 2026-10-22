import {cisExperienceEligible} from './cisExperience';
import {calendarDay,managementDay} from './managementDates';
import {riskIsClosed} from './riskRegister';
import {isOpen} from './grcWork';
import {timelineBounds} from './brawndoAdditionalPolicyVendor';

// Presentation only; rollback leaves native records, commands and history intact.
export const BRAWNDO_DEMO_RISKS_ENABLED=true;
export function brawndoDemoRisksGate(context) {
  return BRAWNDO_DEMO_RISKS_ENABLED && cisExperienceEligible(context) && context.pathname === '/risks';
}

export function riskHorizon(now=new Date()) {
  const today=managementDay(now),date=new Date(today*86400000);
  const month=date.getUTCMonth()+6,year=date.getUTCFullYear();
  const lastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  return {today,until:Date.UTC(year,month,Math.min(date.getUTCDate(),lastDay))/86400000};
}

// Related is the same authorized relationship contract used by the native drawer.
export async function loadRiskRelations(rows,loadRelated,signal) {
  const relations={},unavailable=[];let cursor=0;
  async function worker() {
    while(cursor<rows.length&&!signal.aborted) {
      const row=rows[cursor++];
      try {
        const data=await loadRelated(row,signal);
        if(!Array.isArray(data?.tasks))throw new Error('Linked Actions unavailable.');
        relations[row.risk_id]=data.tasks.filter(task=>task.client_id===row.client_id&&task.task_id);
      } catch(error) {
        if(signal.aborted)throw error;
        unavailable.push(row.risk_id);
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(4,rows.length)},worker));
  return {relations,unavailable};
}

export function upcomingRiskEvents(rows,relations,now=new Date(),{twelveMonths=false}={}) {
  const bounds=twelveMonths?timelineBounds(now):null;
  const {today,until}=bounds?{today:bounds.start,until:bounds.end}:riskHorizon(now),events=[];
  function add(risk,kind,record,date) {
    const day=calendarDay(date);
    if(day===null||day<today||day>until)return;
    const id=kind==='action'?record.task_id:risk.risk_id;
    events.push({key:`${risk.client_id}:${risk.risk_id}:${kind}:${id}:${date}`,risk,kind,record,date,day});
  }
  for(const risk of rows) {
    if(riskIsClosed(risk))continue;
    add(risk,'review',risk,risk.next_review);
    if(risk.status==='accepted')add(risk,'expiry',risk,risk.acceptance_expires_at);
    for(const task of relations[risk.risk_id]||[]) {
      if(task.client_id===risk.client_id&&task.task_id&&isOpen('tasks',task))add(risk,'action',task,task.due_date);
    }
  }
  return events.sort((a,b)=>a.day-b.day||a.key.localeCompare(b.key));
}

// A saved treatment Action may be linked to several Risks; it remains one dated obligation.
export function riskOverviewEvents(rows,relations,now=new Date()) {
  const seen=new Set(),actionDates=new Map(),conflictingActions=new Set();
  const actionId=(clientId,taskId)=>`${clientId}:action:${taskId}`;
  // Related reads are independent snapshots. Conflicting dates cannot establish one current obligation.
  for(const risk of rows.filter(row=>!riskIsClosed(row)))for(const task of relations[risk.risk_id]||[]) {
    if(task.client_id!==risk.client_id||!task.task_id||!isOpen('tasks',task))continue;
    const id=actionId(risk.client_id,task.task_id),day=calendarDay(task.due_date);
    if(actionDates.has(id)&&actionDates.get(id)!==day)conflictingActions.add(id);
    else actionDates.set(id,day);
  }
  const events=upcomingRiskEvents(rows,relations,now,{twelveMonths:true}).filter(event=>{
    const id=event.kind==='action'?actionId(event.risk.client_id,event.record.task_id):event.key;
    if(conflictingActions.has(id))return false;
    if(seen.has(id))return false;
    seen.add(id);return true;
  }).map(event=>({...event,id:event.kind==='action'?actionId(event.risk.client_id,event.record.task_id):event.key,
    title:event.record.title||event.record.display_id||'ID pending',
    label:event.kind==='review'?'Risk review':event.kind==='action'?'Treatment action due':'Acceptance expires',
    detail:event.kind==='action'?`Linked Risk: ${event.risk.display_id||event.risk.risk_id}`:event.risk.display_id||event.risk.risk_id,
  }));
  return {events,conflictingActions:[...conflictingActions].sort()};
}
