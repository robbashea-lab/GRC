import rules from './grcRules.json';
import {calendarDay,managementDay} from './managementDates';

// Brawndo Finding definitions (one rule wherever a number is labelled as Findings):
// - Open: any Finding not in a final state (closed or accepted). Pending Validation (remediated) is open.
// - Overdue: open with a due/target date before today (UTC calendar day, as on the Dashboard).
// Work-item counts are a separate family: each piece of remediation counts once, as its active Action,
// or as the Finding itself when it has no active Action (which includes Pending Validation).
const FINAL=new Set(rules.closed.findings);
export const findingOpen=f=>!!f&&!FINAL.has(f.status)&&!f.archived_at;
export const findingOverdue=(f,today=new Date())=>{const d=calendarDay(f?.due_date);return findingOpen(f)&&d!==null&&d<managementDay(today);};
export const taskActive=t=>!!t&&!['done','cancelled'].includes(t.status)&&!t.archived_at;
export function findingCounts(findings=[],today=new Date()){
  const open=findings.filter(findingOpen);
  return {open:open.length,pendingValidation:open.filter(f=>f.status==='remediated').length,overdue:open.filter(f=>findingOverdue(f,today)).length,closed:findings.length-open.length};
}
// Findings represented by an active Action are not separate work.
export function workItems(findings=[],tasks=[]){
  const covered=new Set(tasks.filter(t=>taskActive(t)&&t.finding_id).map(t=>`${t.client_id}:${t.finding_id}`));
  return [...tasks.filter(taskActive).map(record=>({kind:'tasks',record})),
    ...findings.filter(f=>findingOpen(f)&&!covered.has(`${f.client_id}:${f.finding_id}`)).map(record=>({kind:'findings',record}))];
}
