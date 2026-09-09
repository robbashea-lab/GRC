import rules from './grcRules.json';
export const closed = rules.closed;
export const isOpen = (kind, row) => !(closed[kind] || []).includes(row.status);
export const riskLevel = score => rules.riskBands.find(([min]) => score >= min)?.[1] || null;
export function assessedRisk(row) {
  const valid = [row.likelihood_score, row.impact_score].every(v => Number.isInteger(v) && v >= 1 && v <= 5);
  const risk_score = valid ? row.likelihood_score * row.impact_score : null;
  return { ...row, risk_score, risk_level: riskLevel(risk_score) };
}
export const riskDue = row => [row.next_review, row.status === 'accepted' ? row.acceptance_expires_at : null].filter(Boolean).sort()[0] || null;
export function representedFinding(finding, tasks) {
  return isOpen('findings', finding) && finding.status !== 'remediated' && tasks.some(t => isOpen('tasks', t) && t.client_id === finding.client_id && t.finding_id === finding.finding_id
    && (t.due_date || '').slice(0, 10) === (finding.due_date || '').slice(0, 10)
    && (t.assignee_id || t.owner_id || '') === (finding.owner_id || ''));
}
