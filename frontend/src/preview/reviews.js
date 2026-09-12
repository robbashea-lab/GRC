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
  const review = record(db, 'reviews', id), current = reviewView(review);
  const previous = review.occurrences?.find(o => o.occurrence_id === body.occurrence_id);
  if (name === 'complete' && previous) return {review:current, occurrence:previous, spawned:null};
  assertCurrentOccurrence(review, body.occurrence_id);
  if (current.status === 'needs_scheduling') throw new Error('An administrator must schedule this Review first.');
  if (name === 'start') {
    if (review.status !== 'in_progress') {
      write(db, 'reviews', {status:'in_progress', current_occurrence_id:body.occurrence_id, started_at:now(), started_by:db.user.user_id}, id);
      reviewEvent(db, review, 'Review started');
    }
    return reviewView(review);
  }
  const findings = list(db,'findings',review.client_id).filter(f => f.review_id === id && belongsToOccurrence(f,review));
  const evidence = list(db,'evidence',review.client_id).filter(e => e.linked_id === id && ['review','reviews'].includes(e.linked_type) && belongsToOccurrence(e,review));
  const {occurrences, ...execution} = current;
  const completed = clone({...execution, occurrence_id:occurrenceId(review), status:'completed', completed_at:now(), completion_date:now(),
    completed_by:db.user.user_id, completed_by_name:db.user.name, notes:body.completion_notes ?? review.notes,
    outcome:findings.length ? 'findings_raised' : 'no_findings', finding_count:findings.length,
    evidence:evidence.map(e => ({evidence_id:e.evidence_id,filename:e.filename,version:e.version,sha256:e.sha256}))});
  const next = current.next_review_date;
  write(db, 'reviews', {
    occurrences:[...(occurrences || []), completed], schedule_anchor:current.schedule_anchor,
    ...(next ? {status:'upcoming',due_date:next,current_occurrence_id:uid('occ'),notes:null,started_by:null,started_at:null,
      completion_date:null,completion_snapshot:null}
      : {status:'completed',current_occurrence_id:occurrenceId(review),completion_date:completed.completed_at})
  }, id);
  reviewEvent(db, review, 'Review completed', completed.occurrence_id, {period:completed.period, outcome:completed.outcome, finding_count:findings.length});
  if (next) reviewEvent(db, review, 'Next occurrence scheduled', completed.occurrence_id, {due_date:next});
  return {review:reviewView(review),occurrence:completed,spawned:null};
}
