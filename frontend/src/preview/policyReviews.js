import {reviewSchedule,reviewView} from '../lib/reviewOccurrences';
// Keep document lifecycle separate from the existing recurring Review lifecycle.
export function syncPolicyReview(db, review) {
  const ids=review.policy_ids||[review.policy_id].filter(Boolean);if(!ids.length)return;
  for(const policy of db.policies.filter(p=>ids.includes(p.policy_id)&&p.client_id===review.client_id)){
    const reviews=db.reviews.filter(r=>(r.policy_id===policy.policy_id||r.policy_ids?.includes(policy.policy_id))&&r.client_id===policy.client_id),due=reviews.filter(r=>r.due_date&&!['completed','cancelled'].includes(r.status)).map(r=>r.due_date).sort(),completed=reviews.flatMap(r=>[...(r.occurrences||[]).map(o=>o.completed_at),...(r.status==='completed'?[r.completion_date]:[])]).filter(Boolean).sort();
    Object.assign(policy,{next_review_date:due[0]||null,schedule_from_reviews:true});if(completed.length)policy.last_reviewed_at=completed.at(-1);
  }
}

const ACTIVE=r=>!['completed','cancelled'].includes(r.status);
// Brawndo: a Policy's review obligation is one authoritative recurring Review (annual by default),
// never a date maintained separately on the Policy. Returns the active linked Review.
export function ensurePolicyReview(db, policy, due) {
  if (policy.client_id !== 'demo_brawndo' || ['retired', 'not_applicable'].includes(policy.status)) return null;
  const linked = db.reviews.filter(r => r.policy_id === policy.policy_id && r.client_id === policy.client_id);
  const active = linked.find(ACTIVE);
  if (active) return active;
  const date = String(due || policy.next_review_date || '').slice(0, 10);
  if (!date) return null;
  const context = policy.governance_context || {};
  const review = {review_id: 'policy_review_' + policy.policy_id, client_id: policy.client_id, policy_id: policy.policy_id,
    title: 'Policy Review — ' + policy.title, review_type: 'policy', status: 'upcoming', recurrence: 'annual', due_date: date,
    owner_id: policy.owner_id || null, created_at: new Date().toISOString(), created_by: db.user?.user_id || null,
    governance_context: {category: 'organizational', rationale: 'Recurring review of this Policy document.',
      cadence_source: context.cadence_source || 'organization_defined', cadence_rationale: context.cadence_rationale || 'Annual governance review and reassessment following material changes.'}};
  if (linked.some(r => r.review_id === review.review_id)) review.review_id += '_' + date;
  db.reviews.push(review);
  Object.assign(review, reviewSchedule(review, true));
  Object.assign(review, reviewView(review));
  return review;
}
