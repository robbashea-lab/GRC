import rules from '../lib/grcRules.json';
import { scheduledDate } from '../lib/reviewOccurrences';
export function guardEdit(kind, body, existing = {}, user) {
  body = {...body};
  delete body.expected_updated_at; // Concurrency precondition, not a business-field edit.
  if(body.due_date&&!scheduledDate(body.due_date))throw new Error('Invalid due date');
  if(kind==='policies') {
    if(['approval_account_id','approver_contact_id','approval_request_id','approval_source','approval_subject'].some(k=>k in body && JSON.stringify(body[k])!==JSON.stringify(existing[k])) || body.status==='in_review' && body.status!==existing.status) throw new Error('Use the dedicated approval action');
    if(existing.status==='in_review' && Object.keys(body).some(k=>JSON.stringify(body[k])!==JSON.stringify(existing[k]) && !((body[k]==null||body[k]==='')&&(existing[k]==null||existing[k]==='')))) throw new Error('Return the pending submission to Draft before editing');
  }
  if(Object.keys(body).some(k=>k.startsWith('framework_')))throw new Error('Framework relationships are managed through the framework workspace');
  const changes = Object.fromEntries(Object.entries(body).filter(([k,v]) => JSON.stringify(v) !== JSON.stringify(existing[k]) && !((v == null || v === '') && (existing[k] == null || existing[k] === ''))));
  if (kind === 'contacts' && 'linked_user_id' in changes) throw new Error('Use the explicit account-link action to change a Contact identity association');
  if (kind === 'policies' && existing.schedule_from_reviews && ['last_reviewed_at','next_review_date'].some(k => k in changes)) throw new Error('Policy Review dates are controlled by linked Reviews.');
  if(kind==='vendors') {
    if(['last_review','assurance_status'].some(k=>k in changes)) throw new Error('Review dates and assurance status are derived.');
    if(existing.status==='inactive'&&Object.keys(changes).length) throw new Error('Inactive Vendors remain historical records.');
    if(existing.vendor_id&&['next_review','review_frequency','custom_recurrence_days','separate_assurance_review','assurance_review_date','assurance_cadence','contract_review_enabled','contract_lead_days','offboarding_review_date'].some(k=>k in changes)&&user&&!['super_admin','platform_admin'].includes(user.role)) throw new Error('Only platform administrators can change Review configuration.');
  }
  if (kind === 'reviews') {
    if('ai_system_id' in changes)throw new Error('Establish AI Reviews from AI Governance');
    if(existing.ai_system_id&&existing.status==='cancelled'&&Object.keys(changes).some(k=>k!=='notes'))throw new Error('Cancelled AI Reviews remain historical');
    if('vendor_id' in changes||'vendor_purpose' in changes) throw new Error('Establish Vendor Reviews from the Vendor schedule.');
    if(existing.vendor_purpose==='contract'&&['due_date','recurrence','custom_recurrence_days'].some(k=>k in changes)) throw new Error('Configure Contract Renewal Review through Vendor contract dates and lead time.');
    if('risk_id' in changes) throw new Error('Establish Risk Reviews from the Risk schedule.');
    if (user && !['super_admin','platform_admin'].includes(user.role) && Object.keys(changes).some(k => k !== 'notes')) throw new Error('Only platform administrators can change Review configuration.');
    if (['period','next_review_date'].some(k => k in changes) || ['in_progress','completed'].includes(changes.status)) throw new Error('Use the Review lifecycle controls. Occurrence and next date are calculated.');
  }
  if (kind === 'reviews' && existing.status === 'completed' && Object.keys(changes).length) throw new Error('Completed reviews are immutable; add an amendment.');
  if(kind==='risks') {
    if('treatment' in changes&&![null,'','mitigate','accept','transfer','avoid','monitor'].includes(changes.treatment)) throw new Error('Invalid treatment decision.');
    if(existing.risk_id&&['next_review','review_cadence','custom_recurrence_days'].some(k=>k in changes)&&user&&!['super_admin','platform_admin'].includes(user.role)) throw new Error('Only platform administrators can change Review configuration.');
    if(['closed','retired'].includes(existing.status)&&Object.keys(changes).length) throw new Error('Closed Risks are historical.');
    if(['display_id','risk_score','risk_level','last_reviewed','date_identified'].some(k=>k in changes)) throw new Error('Risk identifiers, assessment results and review dates are system-controlled.');
    if(!existing.risk_id&&changes.status&&!['open','identified','assessed'].includes(changes.status)) throw new Error('New Risks start as Identified or Assessed.');
  }
  const protectedFields = ['created_at','created_by','updated_at','completion_date','parent_review_id','completion_snapshot','next_occurrence_id','rating_history','approval_history','decision_history','validated_by','validated_at','verified_at','verified_by','approved_at','accepted','accepted_by','acceptance_date','acceptance_rationale','acceptance_expires_at'];
  protectedFields.push('current_occurrence_id','occurrence_id','occurrences','schedule_anchor','started_at','started_by','completed_at','completed_by','closed_at','closed_by');
  if (protectedFields.some(k => k in changes)) throw new Error('Decision and history fields cannot be edited directly.');
  const targets = {policies:['approved'], risks:['accepted','closed','retired'], findings:['closed','accepted','remediated'], reviews:['completed'], exceptions:['approved']};
  if ('status' in changes && rules.statuses[kind] && !rules.statuses[kind].includes(changes.status)) throw new Error('Invalid status.');
  if (targets[kind]?.includes(changes.status) || kind === 'policies' && changes.presence === 'verified_existing' || kind === 'risks' && changes.treatment === 'accept') throw new Error('Use the dedicated decision action.');
}
