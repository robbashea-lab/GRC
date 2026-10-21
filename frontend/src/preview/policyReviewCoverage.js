import {clone} from './store';
import {reviewView,reviewSchedule} from '../lib/reviewOccurrences';
import {isPolicySetReview} from '../lib/brawndoAdditionalPolicyVendor';

// Only the existing canonical program definition owns annual set completion.
export {isPolicySetReview};

export function pendingPolicyCoverage(db,kind,row){
  if(!['reviews','policies'].includes(kind))return false;
  const id=row[kind==='reviews'?'review_id':'policy_id'];
  return db.reviews.some(review=>review.client_id===row.client_id&&review._policy_coverage_pending&&
    (kind==='reviews'&&review.review_id===id||review._policy_coverage_pending.members?.some(member=>kind==='reviews'?member.child?.review_id===id:member.policy_id===id)));
}

export function effectivePolicySubject(policy,at){
  if(policy.archived||policy.archived_at||!['approved','draft','in_review'].includes(policy.status)||['not_applicable','reported_missing'].includes(policy.presence))return null;
  const cutoff=Date.parse(at);
  const approvals=[...(policy.approval_history||[]).filter(entry=>entry.action==='approved').map(entry=>({subject:entry.subject,at:entry.at,approval:entry})),
    ...(policy.decision_history||[]).filter(entry=>entry.action==='external_approval_recorded').map(entry=>({subject:entry.subject,at:entry.recorded_at,approval:entry}))]
    .filter(entry=>entry.subject&&Number.isFinite(Date.parse(entry.at))&&Date.parse(entry.at)<=cutoff&&(!entry.approval.reported_approved_at||Number.isFinite(Date.parse(entry.approval.reported_approved_at))&&Date.parse(entry.approval.reported_approved_at)<=cutoff))
    .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const saved=approvals[0]||((policy.status==='approved'&&policy.approval_subject&&Number.isFinite(Date.parse(policy.approved_at))&&Date.parse(policy.approved_at)<=cutoff)?{subject:policy.approval_subject,at:policy.approved_at}:null);
  if(!saved)return null;
  const subject=saved.subject;
  if(subject.client_id!==policy.client_id||subject.policy_id!==policy.policy_id)throw new Error('The approved Policy subject identity is unavailable or belongs to another client.');
  if(!subject.subject_id||typeof subject.version!=='string'||!subject.version.trim())return null;
  if(policy.status==='approved'&&policy.version===subject.version&&policy.effective_date&&(!Number.isFinite(Date.parse(policy.effective_date))||Date.parse(policy.effective_date)>cutoff))return null;
  return clone({policy_id:policy.policy_id,client_id:policy.client_id,subject_id:subject.subject_id,version:subject.version,approval_recorded_at:saved.at,approval:saved.approval||null,subject});
}

export function policySetCoverage(db,review,at){
  if(!isPolicySetReview(review))return null;
  if(review.recurrence!=='annual')throw new Error('Configure the annual Policy Review anchor before completion.');
  return db.policies.filter(policy=>policy.client_id===review.client_id).map(policy=>effectivePolicySubject(policy,at)).filter(Boolean)
    .sort((a,b)=>a.policy_id.localeCompare(b.policy_id));
}

export function advanceCoveredSchedule(review,at){
  const current=reviewView(review),skipped=[];
  let due=current.next_review_date;
  for(let index=0;index<9999;index++){
    if(!due||!Number.isFinite(Date.parse(due)))throw new Error('The annual Policy cadence has no valid next scheduled date.');
    if(Date.parse(due)>Date.parse(at))return {due,skipped};
    skipped.push(due);
    due=reviewSchedule({...review,due_date:due,recurrence_due_date:null,schedule_anchor:current.schedule_anchor}).next_review_date;
  }
  throw new Error('The annual Policy cadence exceeds the supported calendar range.');
}
