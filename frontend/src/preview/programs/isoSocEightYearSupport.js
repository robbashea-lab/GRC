import {reviewSchedule, reviewView} from '../../lib/reviewOccurrences';

export const DUNDER_ID = 'demo_dunder';
export const DUNDER_SCENARIO_VERSION = 'dunder-eight-year-v1';
export const EIGHT_YEAR_ANCHOR = '2026-11-02T00:00:00.000Z';
export const EIGHT_YEAR_START = '2018-11-02T00:00:00.000Z';
export const copy = value => JSON.parse(JSON.stringify(value));
export const fixtureId = (kind, key) => `${DUNDER_ID}_8y_${kind}_${key}`;
export const at = day => new Date(day.length === 10 ? day + 'T00:00:00.000Z' : day).toISOString();
export const shiftDay = (day, count) => new Date(Date.parse(at(day)) + count * 86400000).toISOString().slice(0, 10);

// The imported timeline is fixed; normal Demo time and retained visitor data stay native.
export const eightYearDates = {
  anchor: EIGHT_YEAR_ANCHOR,
  start: EIGHT_YEAR_START,
  at,
  day: offset => shiftDay(EIGHT_YEAR_ANCHOR, offset),
};

export function dunderFixtureTools(db) {
  let logSequence = 0;
  const actorName = id => db.users.find(user => user.user_id === id)?.name;

  function addLog(kind, id, when, actor, action, meta = {}) {
    if (!actorName(actor)) throw new Error('A historical event needs a retained native actor');
    db.logs.push({audit_id: fixtureId('log', String(++logSequence)), client_id: DUNDER_ID,
      entity_type: kind, entity_id: id, at: at(when), user_id: actor,
      user_name: actorName(actor), user_email: db.users.find(user => user.user_id === actor).email,
      action, meta: {simulated: true, ...meta}});
  }

  function addEvidence({key, title, linked_type, linked_id, at: when, owner, content, extra = {}}) {
    const text = `DEMO - SYNTHETIC DATA\nDunder Mifflin\n${title}\nRecorded: ${at(when)}\n${content}\nFictional internal record; no certification or independent opinion.\n`;
    const bytes = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const row = {evidence_id: fixtureId('evidence', key), client_id: DUNDER_ID,
      filename: key + '.txt', display_name: title, mime_type: 'text/plain', size: bytes.length,
      content_base64: btoa(bytes), evidence_type: 'Report', linked_type, linked_id,
      uploaded_by: owner, uploaded_by_email: db.users.find(user => user.user_id === owner)?.email,
      created_at: at(when), evidence_date: at(when), version: 1, notes: 'DEMO - SYNTHETIC DATA', ...extra};
    if (db.evidence.some(item => item.evidence_id === row.evidence_id)) throw new Error('Duplicate eight-year Evidence ID');
    db.evidence.push(row);
    return row;
  }

  function addReview(config) {
    const {key, ends_at, cancelled_at, snapshotAt, completionAt, completions = {},
      notesAt, evidenceAt, ...fields} = config;
    const reviewId = fields.review_id || fixtureId('review', key);
    if (db.reviews.some(item => item.review_id === reviewId)) throw new Error('Duplicate eight-year Review ID');
    const finalStatus = fields.status || 'upcoming';
    const review = {...fields, review_id: reviewId, client_id: DUNDER_ID,
      status: 'upcoming', created_at: at(fields.created_at || EIGHT_YEAR_START),
      updated_at: at(fields.created_at || EIGHT_YEAR_START),
      created_by: fields.created_by || db.user.user_id, occurrences: []};
    const cutoff = ends_at ? at(ends_at) : EIGHT_YEAR_ANCHOR;
    let cycle = 0;
    while (review.due_date && at(review.due_date) <= cutoff) {
      if (++cycle > 120) throw new Error('Unexpected eight-year Review recurrence');
      const due = review.due_date.slice(0, 10), override = completions[due] || {};
      const completedAt = at(override.completed_at || completionAt?.(due, cycle) || due);
      if (completedAt > EIGHT_YEAR_ANCHOR || completedAt > cutoff) break;
      if (completedAt < review.created_at || completedAt < EIGHT_YEAR_START) throw new Error('Review completion precedes its history');
      const occurrenceId = fixtureId('occurrence', `${key}_${due}`);
      const schedule = reviewSchedule(review, cycle === 1);
      const {occurrences, ...execution} = review;
      const by = override.completed_by || review.reviewer_id || review.owner_id || db.user.user_id;
      const snapshot = snapshotAt?.(completedAt, {due, cycle, occurrenceId}) || {};
      const evidence = evidenceAt?.(completedAt, {due, cycle, occurrenceId}) || [];
      const occurrence = copy({...execution, ...schedule, ...snapshot, occurrence_id: occurrenceId,
        due_date: due, status: 'completed', completed_at: completedAt, completion_date: completedAt,
        updated_at: completedAt,
        completed_by: by, completed_by_name: actorName(by),
        notes: override.notes || notesAt?.(completedAt, due) || snapshot.notes || review.notes || '',
        outcome: override.outcome || snapshot.outcome || 'no_findings', finding_count: override.finding_count ?? snapshot.finding_count ?? 0,
        evidence: evidence.map(item => ({evidence_id: item.evidence_id, filename: item.filename, version: item.version, ...(item.sha256 ? {sha256: item.sha256} : {})}))});
      delete occurrence.cancelled_at;
      review.occurrences.push(occurrence);
      addLog('reviews', reviewId, completedAt, by, 'Review completed', {
        occurrence_id: occurrenceId, period: occurrence.period, outcome: occurrence.outcome,
        finding_count: occurrence.finding_count});
      if (!schedule.next_review_date) {
        Object.assign(review, {status: 'completed', completion_date: completedAt, current_occurrence_id: occurrenceId});
        break;
      }
      Object.assign(review, {due_date: schedule.next_review_date.slice(0, 10),
        schedule_anchor: schedule.schedule_anchor, recurrence_due_date: null});
    }
    if (finalStatus === 'cancelled') {
      if (!cancelled_at || !ends_at) throw new Error('Cancelled recurring work needs its actual cutoff');
      Object.assign(review, {status: 'cancelled', cancelled_at: at(cancelled_at), recurrence: 'none', next_review_date: null});
    } else if (review.status !== 'completed') review.status = finalStatus;
    review.current_occurrence_id ||= fixtureId('occurrence', `${key}_${review.due_date?.slice(0, 10) || 'unscheduled'}`);
    review.updated_at = [review.occurrences.at(-1)?.completed_at,review.cancelled_at,review.created_at].filter(Boolean).sort().at(-1);
    const result = reviewView(review);
    db.reviews.push(result);
    return result;
  }

  return {dates: eightYearDates, addLog, addEvidence, addReview};
}

export function assessmentAt(row, when) {
  const saved = row.assessment_history.filter(entry => entry.at <= at(when)).at(-1);
  if (!saved) throw new Error(`No saved ${row.definition_id} assessment exists at the requested cutoff`);
  const {assessment_history, ...current} = row;
  const {at: savedAt, by, ...fields} = saved;
  // An historical SoA keeps its complete native assessment row, without today's links or history.
  return copy({...current, ...fields, related_links: saved.related_links || [],
    last_assessed: savedAt, last_saved: savedAt, updated_at: savedAt, assessed_by: by});
}
