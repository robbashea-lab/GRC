// Presentation only: relationships and authoritative records are never removed.
export function historicalRemediation(kind, record) {
  return kind === 'tasks' ? record.status === 'done' : kind === 'findings' && record.status === 'closed';
}
