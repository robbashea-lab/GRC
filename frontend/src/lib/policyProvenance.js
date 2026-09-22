export function invalidatePolicyApproval(patch,previous) {
  return previous?.status==='approved' && ['title','version','summary'].some(k=>k in patch && patch[k]!==previous[k]) ?
    {...patch,status:'draft',approved_at:null,approval_subject:null}:patch;
}
export function retainedPolicy(p) {
  return !!(p.approval_history?.length||p.decision_history?.length||['approved','in_review'].includes(p.status));
}
