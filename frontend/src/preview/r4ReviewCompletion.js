import { buildReviewContract, withContractToken, validateCompletionGuide } from '../lib/r4ReviewCompletion';
import { CATALOGS } from '../lib/frameworks';
import { occurrenceId, belongsToOccurrence } from '../lib/reviewOccurrences';
import { record, write, audit, clone } from './store';
import { commandRequest } from './commandRequests';
import { evidenceAccess } from './evidence';
import { r4Catalog, servicesOf } from './r4ServicesTools';
const prepared = new WeakMap();
const fallbackKeys = new WeakMap();
const fail = (message, status = 422) => {
  throw Object.assign(new Error(message), {
    status
  });
};
const readOnly = (db, review) => db.user.status && db.user.status !== 'active' || !['super_admin', 'platform_admin', 'client_grc_manager', 'client_contributor'].includes(db.user.role) || db.user.role === 'client_contributor' && ![review.owner_id, review.reviewer_id].includes(db.user.user_id) || record(db, 'clients', review.client_id).status === 'archived' || ['completed', 'cancelled'].includes(review.status);

// Adapter awaits this before dispatch and rechecks its existing saved-byte/session boundary.
// The cache is request-local derived state, never a persisted result or a GET mutation.
export async function prepareR4Completion(db, path, method, body = {}) {
  const [, kind, id, operation] = path.split('/');
  if (kind !== 'reviews' || !['complete', 'completion-guide'].includes(operation)) return null;
  const review = record(db, 'reviews', id);
  if (!evidenceAccess(db.user, review.client_id)) fail('Forbidden for this client', 403);
  const client = record(db, 'clients', review.client_id),
    services = {
      ...servicesOf(client),
      catalog: r4Catalog(db)
    };
  const contract = await withContractToken(buildReviewContract(review, services, CATALOGS));
  let cache = prepared.get(db);
  if (!cache) {
    cache = new Map();
    prepared.set(db, cache);
  }
  cache.set(id, contract);
  let keys = fallbackKeys.get(db);
  if (!keys) {
    keys = new Map();
    fallbackKeys.set(db, keys);
  }
  keys.set(id, (await withContractToken({
    payload: body
  })).contract_token);
  return contract;
}
function guideFor(db, review) {
  let contract = prepared.get(db)?.get(review.review_id) || review.r4_current_checklist?.contract;
  if (!contract) {
    const client=record(db,'clients',review.client_id), derived=buildReviewContract(review,{...servicesOf(client),catalog:r4Catalog(db)},CATALOGS);
    // Legacy direct commands retain the explicit-outcome fallback only for an
    // explicitly empty custom/native-integrity contract; known templates need their token.
    if(derived.steps.length)fail('Reopen the current Review guide before saving',409);
    contract={...derived,contract_token:null};
  }
  const saved = review.r4_current_checklist,
    same = saved?.occurrence_id === occurrenceId(review);
  return {
    ...clone(contract),
    occurrence_id: occurrenceId(review),
    expected_updated_at: review.updated_at ?? null,
    results: same ? clone(saved.results) : [],
    supporting_reference: same ? saved.supporting_reference || '' : '',
    read_only: readOnly(db, review)
  };
}
function checkResults(guide, body, complete) {
  const checklist = body.checklist;
  if (!checklist || checklist.contract_token !== guide.contract_token || !Array.isArray(checklist.results)) fail('The Review guide changed; reopen its current checklist', 409);
  if (Object.keys(checklist).some(k => !['contract_token', 'results'].includes(k))) fail('Unsupported checklist fields');
  for (const result of checklist.results) if (!result || Object.keys(result).some(k => !['step_id', 'result', 'reason'].includes(k)) || typeof result.step_id !== 'string' || !['Pass', 'Exception', 'N/A', 'NMI'].includes(result.result) || typeof (result.reason ?? '') !== 'string' || (result.reason || '').length > 4000) fail('Invalid checklist result');
  const ids = checklist.results.map(r => r.step_id);
  if (new Set(ids).size !== ids.length || ids.some(id => !guide.steps.some(s => s.step_id === id))) fail('Unknown or duplicate checklist step');
  if (complete) validateCompletionGuide({
    ...guide,
    results: checklist.results
  });
  return new Map(checklist.results.map(r => [r.step_id, r]));
}
export function r4ReviewCompletionRequest(db, path, method, body = {}, requestKey) {
  const [, kind, id, operation] = path.split('/');
  if (kind !== 'reviews' || operation !== 'completion-guide') return undefined;
  const review = record(db, 'reviews', id),
    guide = guideFor(db, review);
  if (method === 'get') return guide;
  if (method !== 'put') fail('Unsupported Review guide operation');
  if (guide.read_only) fail('This Review guide is read-only', 403);
  if (Object.keys(body).some(k => !['occurrence_id', 'expected_updated_at', 'checklist', 'supporting_reference'].includes(k))) fail('Unsupported Review guide field');
  const execute = () => {
    if (body.occurrence_id !== occurrenceId(review) || body.expected_updated_at !== (review.updated_at ?? null)) fail('Review changed; reload before saving', 409);
    checkResults(guide, body, false);
    if (typeof (body.supporting_reference ?? '') !== 'string' || (body.supporting_reference || '').length > 4000) fail('Invalid supporting result reference');
    const {
      occurrence_id,
      expected_updated_at,
      results,
      supporting_reference,
      read_only,
      ...contract
    } = guide;
    write(db, 'reviews', {
      r4_current_checklist: {
        occurrence_id: guide.occurrence_id,
        contract,
        results: clone(body.checklist.results),
        supporting_reference: body.supporting_reference || '',
        saved_by: db.user.user_id
      }
    }, id);
    audit(db, 'Review checklist saved', 'reviews', review, {
      occurrence_id: guide.occurrence_id
    });
    return guideFor(db, review);
  };
  return commandRequest(db, path, review.client_id, requestKey || fallbackKeys.get(db)?.get(id), body, execute);
}
export function validateDemoCompletion(db, review, body, evidence) {
  const guide = guideFor(db, review);
  if (guide.read_only) fail('This retained Review is read-only', 403);
  if (body.occurrence_id !== guide.occurrence_id) fail('Review occurrence changed; reload before completing', 409);
  if (guide.steps.length && !Object.hasOwn(body, 'expected_updated_at')) fail('Reopen the Review to obtain its current saved revision', 428);
  if (Object.hasOwn(body, 'expected_updated_at') && body.expected_updated_at !== (review.updated_at ?? null)) fail('Review changed; reopen before completing', 409);
  const results = guide.steps.length || body.checklist ? checkResults(guide, body, true) : new Map(),
    exception = [...results.values()].some(r => r.result === 'Exception');
  if (body.outcome !== undefined && !['No exceptions noted', 'Exceptions noted'].includes(body.outcome)) fail('Choose a valid Review outcome');
  if (exception && body.outcome !== 'Exceptions noted') fail('The checklist contains an Exception; retain its findings and follow-up');
  if (exception && (Object.hasOwn(body, 'risk_assessment') || Object.hasOwn(body, 'risk_outcome'))) fail('Complete this exception through the Review follow-up form; risk rating is a separate decision');
  if (exception && !db.findings.some(f => f.client_id === review.client_id && f.review_id === review.review_id && belongsToOccurrence(f, review))) fail('Record the exception through Raise finding before completing this Review; corrective work may remain open');
  const reference = body.supporting_reference ?? '';
  if (typeof reference !== 'string' || reference.length > 4000) fail('Invalid supporting result reference');
  const setup = review.activity_setup || {},
    planned = [setup.recurring_ticket_number, setup.recurring_ticket_url].filter(Boolean),
    trimmed = reference.trim();
  if (evidence.some(e => e.client_id !== review.client_id || e.occurrence_id && e.occurrence_id !== guide.occurrence_id)) fail('Evidence must belong to this client and Review occurrence');
  const usable = evidence.some(e => e.evidence_id && e.filename?.trim() && e.sha256 && e.version != null);
  if (guide.required_support.length && !usable && (!trimmed || planned.includes(trimmed) || planned.includes(trimmed.replace(/^#\s*/, '')))) fail('Attach current-occurrence support or record an explicit completed-result reference; a planned recurring ticket alone is insufficient');
  const checklist = Object.fromEntries(['template_id', 'template_version', 'contract_token', 'required_support', 'service_context'].map(k => [k, clone(guide[k])]));
  return {
    ...(body.outcome !== undefined ? {checklist_outcome: body.outcome} : {}),
    review_template_id: guide.template_id,
    review_template_version: guide.template_version,
    checklist,
    checklist_results: guide.steps.map(step => ({
      ...step,
      ...results.get(step.step_id)
    })),
    supporting_reference: trimmed,
    activity_setup: clone(setup)
  };
}
