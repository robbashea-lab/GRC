// Keep document lifecycle separate from the existing recurring Review lifecycle.
export function syncPolicyReview(db, review) {
  if (!review.policy_id) return;
  const policy = db.policies.find(p => p.policy_id === review.policy_id && p.client_id === review.client_id);
  if (!policy) return;
  const reviews = db.reviews.filter(r => r.policy_id === policy.policy_id && r.client_id === policy.client_id);
  const due = reviews.filter(r => r.due_date && !['completed', 'cancelled'].includes(r.status)).map(r => r.due_date).sort();
  const completed = reviews.flatMap(r => [
    ...(r.occurrences || []).map(o => o.completed_at),
    ...(r.status === 'completed' ? [r.completion_date] : [])
  ]).filter(Boolean).sort();
  Object.assign(policy, {next_review_date: due[0] || null, schedule_from_reviews: true});
  if (completed.length) policy.last_reviewed_at = completed[completed.length - 1];
}
