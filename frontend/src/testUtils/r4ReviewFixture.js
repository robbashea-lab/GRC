import {occurrenceId} from '../lib/reviewOccurrences';
import {completionPayload, parseReviewCompletionGuide, validateCompletionGuide} from '../lib/r4ReviewCompletion';

// Test callers supply the performed scenario's results. This only reads the
// current native contract and returns its exact command for submission/replay.
export async function currentReviewCompletion(api, reviewId, {
  expectedOccurrenceId, resultForStep, supportingReference, completionNotes
}) {
  if (typeof reviewId !== 'string' || !reviewId.trim()
      || typeof expectedOccurrenceId !== 'string' || !expectedOccurrenceId.trim()
      || typeof resultForStep !== 'function'
      || typeof supportingReference !== 'string' || supportingReference.length > 4000
      || completionNotes !== undefined && typeof completionNotes !== 'string') {
    throw new Error('A Review, exact occurrence, explicit step results and supporting reference are required');
  }
  const review = (await api.get('/reviews/' + reviewId)).data;
  if (!review || review.review_id !== reviewId || occurrenceId(review) !== expectedOccurrenceId) {
    throw new Error('The expected Review occurrence is no longer current');
  }
  const guide = parseReviewCompletionGuide((await api.get('/reviews/' + reviewId + '/completion-guide')).data);
  if (guide.occurrence_id !== expectedOccurrenceId || guide.expected_updated_at !== (review.updated_at ?? null)) {
    throw new Error('The Review changed while reading its completion guide');
  }
  const results = [];
  for (const step of guide.steps) {
    const result = await resultForStep(step, {guide, review});
    if (!result || result.step_id !== step.step_id || typeof result.reason !== 'string'
        || Object.keys(result).some(key => !['step_id', 'result', 'reason'].includes(key))) {
      throw new Error('The scenario must explicitly answer the exact current checklist step: ' + step.step_id);
    }
    results.push(result);
  }
  const performed = {...guide, results, supporting_reference: supportingReference};
  validateCompletionGuide(performed);
  const command = completionPayload(performed);
  if (completionNotes !== undefined) command.completion_notes = completionNotes;
  return command;
}
