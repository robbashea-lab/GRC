// Date-only obligations retain their calendar cadence, not the completion timestamp.
export const occurrenceId = review => review.current_occurrence_id || 'occ_' + review.review_id;
export function reviewSchedule(review, resetAnchor = false) {
  const date = new Date(review.due_date || NaN);
  const valid = !Number.isNaN(date.getTime());
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
      next = date.toISOString();
    } else if (recurrence === 'custom' && Number.isInteger(review.custom_recurrence_days) && review.custom_recurrence_days > 0) {
      next = new Date(date.getTime() + review.custom_recurrence_days * 86400000).toISOString();
    }
  }
  return {period, next_review_date:next, schedule_anchor:anchor};
}
export function reviewView(review) {
  const result = {...review, ...reviewSchedule(review), current_occurrence_id:occurrenceId(review)};
  if (!['completed','cancelled'].includes(review.status)) {
    const missing = !review.due_date || Number.isNaN(Date.parse(review.due_date)) || ('recurrence' in review && [null,''].includes(review.recurrence))
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
