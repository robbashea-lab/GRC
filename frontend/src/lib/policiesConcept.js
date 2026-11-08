import { isPolicySetReview } from './brawndoAdditionalPolicyVendor';
import { calendarDay } from './managementDates';

// An individual Policy review must never stand in for the program's annual Review.
export function annualPolicyReview(reviews, clientId) {
  if (!clientId) return { review: null, lastClosed: null };
  const candidates = reviews.filter(review => review.client_id === clientId
    && isPolicySetReview(review) && review.recurrence === 'annual' && !review.archived && !review.archived_at);
  const review = candidates.filter(item => !['completed', 'cancelled'].includes(item.status))
    .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))[0] || null;
  const completed = candidates.flatMap(item => [
    ...(item.status === 'completed' && item.completion_date ? [item.completion_date] : []),
    ...(item.occurrences || []).filter(occurrence => occurrence.status === 'completed' && occurrence.completed_at
      && (!occurrence.review_id || occurrence.review_id === item.review_id)
      && (!occurrence.client_id || occurrence.client_id === clientId))
      .map(occurrence => occurrence.completed_at),
  ]).filter(value => calendarDay(value) !== null).sort();
  return { review, lastClosed: completed.at(-1) || null };
}
