import { calendarDay } from './tableFilters';

export const ACTION_VIEWS = ['active', 'overdue', 'in_progress', 'open', 'completed'];
export const SOURCE_TYPES = { manual: 'Manual / Internal', review: 'Review', finding: 'Finding', risk: 'Risk', vendor: 'Vendor', policy: 'Policy', audit: 'Audit / Assessment' };
export const SOURCE_RECORDS = { review: ['reviews','review_id'], finding: ['findings','finding_id'], risk: ['risks','risk_id'], vendor: ['vendors','vendor_id'], policy: ['policies','policy_id'], audit: ['assessments','assessment_id'] };
export const actionStatus = status => ({done:'Completed',open:'Open',in_progress:'In Progress',blocked:'Blocked',cancelled:'Cancelled'})[status] || status;
export const actionPriority = value => ({critical:'Immediate',immediate:'Immediate',medium:'Moderate',moderate:'Moderate',high:'High',low:'Low'})[value] || value;
export const actionTerminal = row => ['done','cancelled'].includes(row.status);
export const daysDue = (row, now=new Date()) => {
  const day = calendarDay(row.due_date);
  return day == null ? null : Math.round((day-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);
};
export function actionMatches(row, view, now=new Date()) {
  if(view==='active' || view==='all') return row.status!=='done';
  if(view==='overdue') return !actionTerminal(row) && daysDue(row,now) != null && daysDue(row,now)<0;
  if(view==='completed') return row.status==='done';
  if(view==='open' || view==='in_progress') return (row.status||'open')===view;
  return true;
}
export function actionOrder(a,b,now=new Date()) {
  const group=r=>r.status==='done'?5:r.status==='cancelled'?6:actionMatches(r,'overdue',now)?0:daysDue(r,now)==null?4:r.status==='in_progress'?1:r.status==='open'?2:3;
  const diff=group(a)-group(b);
  return diff || (a.status==='done' ? (b.completed_at||'').localeCompare(a.completed_at||'') : (a.due_date||'9999').localeCompare(b.due_date||'9999')) || (a.title||'').localeCompare(b.title||'');
}
// Infer only from real existing links. Never manufacture historical provenance.
export function taskSource(row, records={}) {
  const type=row.source_type || Object.keys(SOURCE_RECORDS).find(t=>row[SOURCE_RECORDS[t][1]]) || (row.source ? 'legacy' : 'unknown');
  const [kind,key]=SOURCE_RECORDS[type]||[];
  const id=row.source_id || row[key];
  const target=kind && (records[kind]||[]).find(r=>r[key]===id && r.client_id===row.client_id);
  const label=target?.title || target?.name || SOURCE_TYPES[type] || (type==='legacy' ? 'Legacy source' : 'Not recorded');
  return {type,kind,id,target,label};
}
