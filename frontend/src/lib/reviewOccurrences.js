// Date-only obligations retain their calendar cadence, not the completion timestamp.
export const occurrenceId = review => review.current_occurrence_id || 'occ_' + review.review_id;
export function scheduledDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T| )/.test(value)) return null;
  const day = value.slice(0,10), calendar = new Date(day + 'T00:00:00Z'), date = new Date(value);
  // Date.parse normalizes February 30 instead of rejecting it.
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0,10) !== day || !Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return null;
  return date;
}
export function reviewSchedule(review, resetAnchor = false) {
  const date = scheduledDate(review.due_date);
  const valid = !!date;
  const recurrence = review.recurrence || 'none';
  const anchor = (!resetAnchor && review.schedule_anchor) || (valid ? {
    day: date.getUTCDate(),
    month_end: date.getUTCDate() === new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  } : null);
  let next = null, period = 'Needs Scheduling';
  if (valid) {
    const year = date.getUTCFullYear(), month = date.getUTCMonth();
    period = recurrence === 'quarterly' ? `Q${Math.floor(month / 3) + 1} ${year}`
      : recurrence === 'semiannual' ? `H${Math.floor(month / 6) + 1} ${year}`
      : recurrence === 'annual' ? String(year)
      : recurrence === 'monthly' ? date.toLocaleDateString('en-US', {month:'long', year:'numeric', timeZone:'UTC'})
      : date.toISOString().slice(0,10);
    const months = {monthly:1, quarterly:3, semiannual:6, annual:12}[recurrence];
    if (months) {
      date.setUTCDate(1); date.setUTCMonth(month + months);
      const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(anchor.month_end ? last : Math.min(anchor.day, last));
      if (date.getUTCFullYear() <= 9999) next = date.toISOString();
    } else if (recurrence === 'custom' && Number.isInteger(review.custom_recurrence_days) && review.custom_recurrence_days > 0) {
      const candidate = new Date(date.getTime() + review.custom_recurrence_days * 86400000);
      if (!Number.isNaN(candidate.getTime()) && candidate.getUTCFullYear() <= 9999) next = candidate.toISOString();
    }
  }
  return {period, next_review_date:next, schedule_anchor:anchor};
}
export function reviewView(review) {
  const result = {...review, ...reviewSchedule(review), current_occurrence_id:occurrenceId(review)};
  if (!['completed','cancelled'].includes(review.status)) {
    const missing = !scheduledDate(review.due_date) || ('recurrence' in review && [null,''].includes(review.recurrence))
      || (!['none','',null,undefined].includes(review.recurrence) && !result.next_review_date);
    if (missing) result.status = 'needs_scheduling';
    else if (review.status === 'needs_scheduling') result.status = 'upcoming';
  }
  return result;
}
export function belongsToOccurrence(item, review, selected = occurrenceId(review)) {
  return item.occurrence_id === selected || (!item.occurrence_id && selected === 'occ_' + review.review_id);
}
export function assertCurrentOccurrence(review, selected) {
  if (!selected || selected !== occurrenceId(review) || ['completed','cancelled'].includes(review.status))
    throw new Error('This occurrence is closed or has changed. Reload the Review.');
}

// Related Findings/Actions retain their originating execution after recurrence advances.
export function relatedReviewInitialValues(review, source) {
  if (source?.review_id !== review.review_id || !source.occurrence_id) return {};
  const occurrence = review.occurrences?.find(o => o.occurrence_id === source.occurrence_id);
  return occurrence ? {occurrence} : {};
}
