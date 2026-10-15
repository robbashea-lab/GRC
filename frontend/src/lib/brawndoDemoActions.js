import {daysDue} from './actionItems';
import {ticketStage} from './remediationTickets';
import {calendarDay} from './tableFilters';

// Presentation only; every read and command retains native server authorization.
export const BRAWNDO_DEMO_ACTIONS_ENABLED=true;
export function brawndoDemoActionsGate({workspaceMode,user,authLoading=false,authError,orgLoading=false,orgError,currentClientId,currentClient,pathname}) {
  return BRAWNDO_DEMO_ACTIONS_ENABLED&&!authLoading&&!authError&&!orgLoading&&!orgError&&workspaceMode==='demo'&&user?.workspace_mode==='demo'&&!!user.user_id&&
    currentClientId==='demo_brawndo'&&currentClient?.client_id==='demo_brawndo'&&
    (currentClient.status||'active')==='active'&&!currentClient.archived&&!currentClient.archived_at&&pathname==='/action-items';
}

export const brawndoTicketActive=row=>!['completed','accepted','cancelled'].includes(ticketStage(row));
export const brawndoHighSeverity=row=>brawndoTicketActive(row)&&!!row.finding&&['high','critical'].includes(row.finding.severity);
export const brawndoNeedsOwner=(row,eligibleOwnerIds)=>!eligibleOwnerIds.has(row.owner_id);
export const brawndoEligibleOwnerIds=users=>new Set(users.filter(person=>person.assignment_eligible===true&&person.user_id).map(person=>person.user_id));
export const BRAWNDO_DUE_WINDOWS=['overdue','next14','15_30','31_60','later','unscheduled'];

export function brawndoDueWindow(row,now=new Date()) {
  // Native planning dates use their calendar portion, including legacy timestamps.
  const value=row.due_date;
  const validShape=typeof value==='string'&&(/^\d{4}-\d{2}-\d{2}$/.test(value)||
    /^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value)));
  if(!validShape||calendarDay(value)===null)return 'unscheduled';
  const days=daysDue(row,now);
  return days<0?'overdue':days<=14?'next14':days<=30?'15_30':days<=60?'31_60':'later';
}

export function brawndoTicketMetrics(rows,eligibleOwnerIds,now=new Date()) {
  const active=rows.filter(brawndoTicketActive);
  const windows=Object.fromEntries(BRAWNDO_DUE_WINDOWS.map(key=>[key,[]]));
  active.forEach(row=>windows[brawndoDueWindow(row,now)].push(row));
  return {active,completed:rows.filter(row=>ticketStage(row)==='completed'),
    overdue:windows.overdue,needsOwner:active.filter(row=>brawndoNeedsOwner(row,eligibleOwnerIds)),
    highSeverity:active.filter(brawndoHighSeverity),windows};
}

export function brawndoTicketMatches(row,{view='active',q='',source='',owner='',unassigned=false,quick=''}={},eligibleOwnerIds=new Set(),now=new Date()) {
  const stage=ticketStage(row),active=brawndoTicketActive(row);
  if(view==='completed'?stage!=='completed':view!=='all'&&!active)return false;
  if(owner&&row.owner_id!==owner)return false;
  if(unassigned&&!brawndoNeedsOwner(row,eligibleOwnerIds))return false;
  if(source&&row.source?.type!==source&&row.source?.kind!==source&&row.source?.id!==source)return false;
  const filter=quick||(!['active','completed','all'].includes(view)?view:'');
  if(filter==='high_critical'&&!brawndoHighSeverity(row))return false;
  if(filter==='unassigned'&&!brawndoNeedsOwner(row,eligibleOwnerIds))return false;
  if(filter==='upcoming'&&(!active||!['next14','15_30'].includes(brawndoDueWindow(row,now))))return false;
  if(BRAWNDO_DUE_WINDOWS.includes(filter)&&(!active||brawndoDueWindow(row,now)!==filter))return false;
  if(['blocked','in_progress','open','pending_validation','accepted','cancelled'].includes(filter)&&stage!==filter)return false;
  const search=q.trim().toLocaleLowerCase();
  return !search||[row.title,row.issue,row.finding?.title,row.actionSearchText,row.source?.label,row.source?.id,row.finding?.remediation_plan].filter(Boolean).join(' ').toLocaleLowerCase().includes(search);
}
