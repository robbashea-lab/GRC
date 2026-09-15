import {occurrenceId, reviewSchedule} from './reviewOccurrences';

// Presentation only: relationships and authoritative records are never removed.
export function historicalRemediation(kind, record) {
  return kind === 'tasks' ? record.status === 'done' : kind === 'findings' && record.status === 'closed';
}

// Group current API records by their authoritative relationship, never by title.
export function reviewRemediation(related) {
  const findings = related.findings || [];
  const tasks = related.tasks || [];
  const grouped = new Set();
  const groups = findings.map(finding => ({finding, actions:tasks.filter(task => {
    const matches = task.finding_id === finding.finding_id && task.client_id === finding.client_id;
    if (matches) grouped.add(task.task_id);
    return matches;
  })}));
  return {groups, standaloneTasks:tasks.filter(task => !grouped.has(task.task_id))};
}

export function remediationOrigin(source, review, history=[]) {
  if (!source?.review_id || !review) return 'Not recorded';
  const id=source.occurrence_id || 'occ_'+source.review_id;
  const old=[...history,...(review.occurrences||[])].find(o=>o.occurrence_id===id);
  if(old) return old.period || reviewSchedule(old).period;
  if(source.review_id===review.review_id && id===occurrenceId(review)) return review.period || reviewSchedule(review).period;
  return review.linked_occurrence?.period || 'Not recorded';
}

export function completionHandoff(finding) {
  if(!finding) return 'The Action Item is complete. The linked Finding status could not be loaded; reopen it to check the next step.';
  const state={remediated:'is now awaiting validation. Completion does not close the Finding.',in_remediation:'remains In Remediation; other corrective work is still outstanding.',open:'remains Open.',closed:'is Closed.',accepted:'is Accepted.'}[finding.status];
  return `Finding “${finding.title}” ${state || 'has been updated. Open it to check the next step.'}`;
}
