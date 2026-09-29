import {calendarDay,dateMatches} from './tableFilters';
import {basisSummary} from './requirementBasis';

export const REVIEW_VIEWS = [
  {id:'overdue',label:'Overdue',tone:'pastDue'},
  {id:'upcoming',label:'Upcoming (30 days)',tone:'due30'},
  {id:'open',label:'All Open',tone:'all'},
  {id:'unassigned',label:'Unassigned',tone:'unassigned'},
];
export const REVIEW_STATUS = {upcoming:'Upcoming',overdue:'Overdue',needs_scheduling:'Needs Scheduling',in_progress:'In Progress',completed:'Completed',cancelled:'Cancelled'};
const closed = row => ['completed','cancelled'].includes(row.status);
export const reviewSource = row => basisSummary(row)==='Basis not recorded'?'Not documented':basisSummary(row);
export function pilotReviewStatus(row,now=new Date()) {
  if (closed(row)) return row.status;
  if (calendarDay(row.due_date)===null) return 'needs_scheduling';
  if (row.status==='in_progress') return 'in_progress';
  return dateMatches(row.due_date,'overdue',now)?'overdue':'upcoming';
}
export function pilotReviewMatches(row,view,now=new Date()) {
  if (view==='history') return closed(row);
  if (!view) return true;
  if (closed(row)) return false;
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
