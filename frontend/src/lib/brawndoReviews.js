import {calendarDay,dateMatches} from './tableFilters';
import {basisSummary} from './requirementBasis';

export const REVIEW_VIEWS = [
  {id:'overdue',label:'Overdue',tone:'pastDue'},
  {id:'upcoming',label:'Due in 30 days',tone:'due30'},
  {id:'open',label:'All open',tone:'all'},
  {id:'unassigned',label:'Unassigned',tone:'unassigned'},
];
export const REVIEW_STATUS = {upcoming:'Upcoming',overdue:'Overdue',needs_scheduling:'Needs Scheduling',in_progress:'In Progress',due_soon:'Due soon',completed:'Completed',cancelled:'Cancelled'};
const closed = row => ['completed','cancelled'].includes(row.status);
export const reviewSource = row => basisSummary(row)==='Basis not recorded'?'Not documented':basisSummary(row);
export function pilotReviewStatus(row,now=new Date()) {
  if (closed(row)) return row.status;
  if (calendarDay(row.due_date)===null) return 'needs_scheduling';
  if (row.status==='in_progress') return 'in_progress';
  return dateMatches(row.due_date,'overdue',now)?'overdue':dateMatches(row.due_date,'next30',now)?'due_soon':'upcoming';
}
// Whole days from today to the due date (negative when late); null when unscheduled.
export function reviewDaysUntil(row,now=new Date()) {
  const day=calendarDay(row.due_date);
  return day===null?null:Math.round((day-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);
}
// Default view is open work; closed reviews live behind the history view.
export const PILOT_HIDDEN_COLUMNS=['review_type','basis','next_review_date'];
export function pilotReviewMatches(row,view,now=new Date(),userId) {
  if (view==='history') return closed(row);
  if (closed(row)) return false;
  if (!view) return true;
  if (view==='mine') return !!userId&&row.owner_id===userId;
  if (view==='overdue') return dateMatches(row.due_date,'overdue',now);
  if (view==='upcoming') return dateMatches(row.due_date,'next30',now);
  if (view==='unassigned') return !row.owner_id;
  return view==='open';
}
export function pilotReviewColumns(columns,rows) {
  return columns.map(c=>{
    if (c.key==='basis') return {...c,label:'Requirement Source',filter:true,sortable:false,filterOnly:true,value:reviewSource,labelValue:v=>v};
    if (c.key==='status') return {...c,sortable:false,filterOnly:true,emptyLabel:null,value:pilotReviewStatus,matches:(r,v,now)=>pilotReviewStatus(r,now)===v,
      options:[...new Set(rows.map(r=>pilotReviewStatus(r)))].map(value=>({value,label:REVIEW_STATUS[value]}))};
    if (c.key==='owner_id') return {...c,label:'Assigned Reviewer',sortable:false,filterOnly:true};
    if (c.key==='review_type') return {...c,sortable:false,filterOnly:true,options:c.options?.filter(o=>rows.some(r=>r.review_type===o.value))};
    if (['due_date','next_review_date'].includes(c.key)) return {...c,label:c.key==='due_date'?'Due Date':'Next Due',sortLabels:['Earliest First','Latest First']};
    return c;
  });
}
