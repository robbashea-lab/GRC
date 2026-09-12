import rules from '../lib/grcRules.json';
export function guardEdit(kind, body, existing = {}, user) {
  const changes = Object.fromEntries(Object.entries(body).filter(([k,v]) => JSON.stringify(v) !== JSON.stringify(existing[k]) && !((v == null || v === '') && (existing[k] == null || existing[k] === ''))));
  if (kind === 'reviews') {
    if (user && !['super_admin','platform_admin'].includes(user.role) && Object.keys(changes).some(k => k !== 'notes')) throw new Error('Only platform administrators can change Review configuration.');
    if (['period','next_review_date'].some(k => k in changes) || ['in_progress','completed'].includes(changes.status)) throw new Error('Use the Review lifecycle controls. Occurrence and next date are calculated.');
  }
  if (kind === 'reviews' && existing.status === 'completed' && Object.keys(changes).length) throw new Error('Completed reviews are immutable; add an amendment.');
  const protectedFields = ['created_at','created_by','updated_at','completion_date','parent_review_id','completion_snapshot','next_occurrence_id','rating_history','approval_history','decision_history','validated_by','validated_at','verified_at','verified_by','approved_at','accepted','accepted_by','acceptance_date','acceptance_rationale','acceptance_expires_at'];
  protectedFields.push('current_occurrence_id','occurrence_id','occurrences','schedule_anchor','started_at','started_by','completed_at','completed_by','closed_at','closed_by');
  if (protectedFields.some(k => k in changes)) throw new Error('Decision and history fields cannot be edited directly.');
  const targets = {policies:['approved'], risks:['accepted'], findings:['closed','accepted','remediated'], reviews:['completed'], exceptions:['approved']};
  if ('status' in changes && rules.statuses[kind] && !rules.statuses[kind].includes(changes.status)) throw new Error('Invalid status.');
  if (targets[kind]?.includes(changes.status) || kind === 'policies' && changes.presence === 'verified_existing' || kind === 'risks' && changes.treatment === 'accept') throw new Error('Use the dedicated decision action.');
}
