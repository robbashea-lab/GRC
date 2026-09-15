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
