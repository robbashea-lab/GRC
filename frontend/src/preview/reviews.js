import {completeRiskReview,riskSnapshot} from './risks';
import {isoCompletionSnapshot} from './isoAudit';
import {initialAuditState,auditEvidenceIds} from '../lib/isoAudit';
import { list, record, write, now, audit, uid, clone } from './store';
import { occurrenceId, reviewView, reviewSchedule, belongsToOccurrence, assertCurrentOccurrence } from '../lib/reviewOccurrences';

export function reviewEvent(db, review, action, occurrence, meta = {}) {
  audit(db, action, 'reviews', review, {occurrence_id:occurrence || occurrenceId(review), by_name:db.user.name, ...meta});
}
export function history(db, review) {
  const result = [...(review.occurrences || [])], seen = new Set();
  let cursor = review;
  while (cursor && !seen.has(cursor.review_id)) {
    seen.add(cursor.review_id);
    if (cursor.status === 'completed' && !cursor.occurrences?.length) {
      const snapshot = cursor.completion_snapshot || {};
      result.push({...cursor, occurrence_id:occurrenceId(cursor), period:cursor.period || snapshot.tested_period || reviewSchedule(cursor).period,
        completed_at:cursor.completion_date || snapshot.at, completed_by:snapshot.by, legacy:true});
    }
    cursor = db.reviews.find(r => r.review_id === cursor.parent_review_id && r.client_id === review.client_id);
  }
  return result.sort((a,b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')));
}
export function reviewAction(db, id, name, body) {
  if(name==='complete') {
    const supported=['occurrence_id','completion_notes','risk_assessment','risk_outcome','risk_next_review','completion_date','spawn_next','conclusion','tested_period','tested_scope','no_evidence_reason','checklist_confirmed'];
    if(Object.keys(body).some(k=>!supported.includes(k)))throw new Error('Unsupported Review completion field');
    for(const [key,limit] of [['conclusion',20000],['tested_period',4000],['tested_scope',4000],['no_evidence_reason',4000]])if(body[key]!=null&&(typeof body[key]!=='string'||body[key].length>limit))throw new Error('Invalid Review evaluation field');
    if('checklist_confirmed' in body&&typeof body.checklist_confirmed!=='boolean')throw new Error('Checklist confirmation must be boolean');
  }
  const review = record(db, 'reviews', id), current = reviewView(review);
  if(review.ai_system_id&&(db.ai_systems||[]).some(a=>a.ai_system_id===review.ai_system_id&&a.status==='retired')&&review.status!=='in_progress')throw new Error('Retired AI only permits completion of already-started closure work');
  const previous = review.occurrences?.find(o => o.occurrence_id === body.occurrence_id);
  if (name === 'complete' && previous) return {review:current, occurrence:previous, spawned:null};
  if(name==='complete'&&body.risk_next_review&&!review.risk_id)throw new Error('Schedule overrides apply only to Risk Reviews');
  if(review.vendor_id&&db.vendors.some(v=>v.vendor_id===review.vendor_id&&v.status==='inactive')&&review.vendor_purpose!=='offboarding') throw new Error('Inactive Vendors have no active recurring Reviews.');
  assertCurrentOccurrence(review, body.occurrence_id);
  if (current.status === 'needs_scheduling') throw new Error('An administrator must schedule this Review first.');
  if (name === 'start') {
    if (review.status !== 'in_progress') {
      write(db, 'reviews', {status:'in_progress', current_occurrence_id:body.occurrence_id, started_at:now(), started_by:db.user.user_id,...(review.risk_id?{risk_baseline:riskSnapshot(record(db,'risks',review.risk_id))}:{})}, id);
      if(review.vendor_id&&(review.vendor_purpose||'vendor')==='vendor') {const v=record(db,'vendors',review.vendor_id);if(v.status==='onboarding'){v.status='under_review';audit(db,'Vendor moved to under review','vendors',v);}}
      reviewEvent(db, review, 'Review started');
    }
    return reviewView(review);
  }
  const findings = list(db,'findings',review.client_id).filter(f => f.review_id === id && belongsToOccurrence(f,review));
  const evidence = list(db,'evidence',review.client_id).filter(e => !e.archived_at&& (auditEvidenceIds(review.iso_audit).includes(e.evidence_id)||(e.linked_id === id && ['review','reviews'].includes(e.linked_type) && belongsToOccurrence(e,review)) || e.relationships?.some(r=>r.kind==='reviews'&&r.id===id&&r.occurrence_id===occurrenceId(review))));
  const {occurrences, ...execution} = current;
  const completed = clone({...execution, ...isoCompletionSnapshot(db,review), occurrence_id:occurrenceId(review), status:'completed', completed_at:now(), completion_date:now(),
    ...Object.fromEntries(Object.entries(body).filter(([k])=>['conclusion','tested_scope','tested_period','checklist_confirmed','no_evidence_reason'].includes(k))),
    completed_by:db.user.user_id, completed_by_name:db.user.name, notes:body.completion_notes ?? review.notes,
    outcome:findings.length ? 'findings_raised' : 'no_findings', finding_count:findings.length,
    evidence:evidence.map(e => ({evidence_id:e.evidence_id,filename:e.filename,version:e.version,sha256:e.sha256}))});
  // Recurrence stays anchored to the scheduled cycle; completion date is recorded, never used as the next anchor.
  const next = review.risk_id?completeRiskReview(db,review,completed,body):current.next_review_date;
  write(db, 'reviews', {
    occurrences:[...(occurrences || []), completed], schedule_anchor:completed.next_review_override?null:current.schedule_anchor,
    ...(next ? {status:'upcoming',due_date:next,current_occurrence_id:uid('occ'),notes:null,started_by:null,started_at:null,
      completion_date:null,completion_snapshot:null,risk_baseline:null,...(review.iso_audit?{iso_audit:initialAuditState(review.iso_audit.package_key,review.iso_audit.cycle+1)}:{})}
      : {status:'completed',current_occurrence_id:occurrenceId(review),completion_date:completed.completed_at})
  }, id);
  reviewEvent(db, review, 'Review completed', completed.occurrence_id, {period:completed.period, outcome:completed.outcome, finding_count:findings.length});
  if(review.policy_id) audit(db,'Policy Review completed','policies',record(db,'policies',review.policy_id),{review_id:id,occurrence_id:completed.occurrence_id});
  if(review.vendor_id) audit(db,'Vendor Review completed','vendors',record(db,'vendors',review.vendor_id),{review_id:id,occurrence_id:completed.occurrence_id});
  if (review.risk_id) audit(db,completed.outcome,'risks',record(db,'risks',review.risk_id),{review_id:id,occurrence_id:completed.occurrence_id});
  if (next) reviewEvent(db, review, 'Next occurrence scheduled', completed.occurrence_id, {due_date:next});
  return {review:reviewView(review),occurrence:completed,spawned:null};
}
