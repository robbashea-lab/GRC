// Keep document lifecycle separate from the existing recurring Review lifecycle.
export function syncPolicyReview(db, review) {
  const ids=review.policy_ids||[review.policy_id].filter(Boolean);if(!ids.length)return;
  for(const policy of db.policies.filter(p=>ids.includes(p.policy_id)&&p.client_id===review.client_id)){
    const reviews=db.reviews.filter(r=>(r.policy_id===policy.policy_id||r.policy_ids?.includes(policy.policy_id))&&r.client_id===policy.client_id),due=reviews.filter(r=>r.due_date&&!['completed','cancelled'].includes(r.status)).map(r=>r.due_date).sort(),completed=reviews.flatMap(r=>[...(r.occurrences||[]).map(o=>o.completed_at),...(r.status==='completed'?[r.completion_date]:[])]).filter(Boolean).sort();
    Object.assign(policy,{next_review_date:due[0]||null,schedule_from_reviews:true});if(completed.length)policy.last_reviewed_at=completed.at(-1);
  }
}
