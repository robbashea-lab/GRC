// Only the upgraded Omni consumer uses these helpers. Inputs are saved, authorized
// records; draft form values and inferred CIS cadences are not program facts.
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const count = value => Number.isInteger(value) && value >= 0 ? value : null;
const ids = value => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string' && id))] : null;
const statusLabels = {not_assessed: 'Not Assessed', needs_attention: 'Not Implemented', in_progress: 'Partially Implemented', addressed: 'Implemented', not_applicable: 'Not Applicable'};

/** Return an existing valid calendar day, without timezone conversion or defaults. */
export function recordedDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$)/.test(value)) return null;
  const day = value.slice(0, 10), [year, month, date] = day.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (!year || month < 1 || month > 12 || date < 1 || date > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]) return null;
  if (value.length > 10) {
    const [, hour, minute, second, offsetHour = '0', offsetMinute = '0'] = value.match(/T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/);
    if (+hour > 23 || +minute > 59 || +second > 59 || +offsetHour > 23 || +offsetMinute > 59) return null;
  }
  return day;
}

function workSignals(record, complete) {
  const work = record?.work;
  const known = complete && work?.context_complete === true;
  return {
    complete: known,
    findingIds: known ? ids(work.finding_ids) : null,
    reviewIds: known ? ids(work.review_ids) : null,
    actionIds: known ? ids(work.action_ids ?? work.task_ids) : null,
    openFindings: known ? count(work.open_findings) : null,
    openActions: known ? count(work.open_actions) : null,
    hasOpenGapAction: known && Array.isArray(work.priority_records) ? work.priority_records.some(item => item.kind === 'tasks' && item.open_gap === true) : null,
    overdueReviews: count(work?.overdue_reviews),
    overdueActions: count(work?.overdue_actions),
    nextReview: recordedDate(work?.next_review_due)
  };
}

function draftIdentityMatches(record, draft, expected) {
  if (!draft?.revision) return true;
  const identity = {client_id: expected.client_id ?? record.client_id, assessment_id: expected.assessment_id ?? record.framework_assessment_id, user_id: expected.user_id};
  return Object.entries(identity).every(([key, value]) => !value || draft[key] === value);
}

function sameSource(source, draft) {
  // A revision is personal to its actor and assessment. It is not a global ID.
  return !!source && !!draft.user_id && source.by === draft.user_id &&
    ['version', 'revision', 'generated_at'].every(key => source[key] != null && source[key] === draft[key]);
}

/**
 * Describe a saved assessment and the current user's persisted interview.
 * historyComplete means complete native assessment provenance, not merely the
 * last page of interview snapshots. Missing flags never establish zero work.
 */
export function describeGuidedContext({record, draft, draftLoaded = false, workLoaded = false, historyComplete = false, expectedIdentity = {}, supportedVersions = [], readOnly = false} = {}) {
  const signals = workSignals(record, workLoaded);
  const source = record?.guided_assessment_source;
  const history = Array.isArray(record?.assessment_history) ? record.assessment_history : [];
  const saved = record ? {
    status: record.status || null, verification: record.verification || null,
    implementation: record.implementation || '',
    origin: source?.origin === 'guided-assessment-pilot' ? 'guided' : source?.origin === 'manual' || record.assessment_origin === 'manual' ? 'manual' : 'unknown',
    source: source || null, history,
    hasPosition: (record.status !== 'not_assessed' && !!record.status) || !!record.implementation?.trim() || !!record.last_assessed || !!source || history.length > 0
  } : null;
  const dates = {
    lastAssessed: recordedDate(record?.assessment_recorded_at ?? record?.last_assessed),
    lastSaved: recordedDate(record?.last_saved),
    latestEvidence: recordedDate(record?.work?.latest_evidence_at),
    nextReview: signals.nextReview
  };
  let state = 'saved', interviewState = 'none', applicationState = 'unknown', lineageStale = null;
  let summary = saved ? `Saved assessment: ${statusLabels[saved.status] || 'status unavailable'}.` : 'Saved assessment context is unavailable.';
  let actions = ['current', 'changes', 'reassess'];
  if (!saved || !statusLabels[saved.status] || !draftLoaded || !signals.complete) {
    state = 'unavailable';
    interviewState = !draftLoaded ? 'unavailable' : draft?.revision ? draft.completed ? 'completed' : 'unfinished' : 'none';
    summary += ' Some context is unavailable; missing information does not confirm that there is no open work.';
    actions = saved ? ['current'] : [];
  } else if (!draftIdentityMatches(record, draft, expectedIdentity) ||
      Object.entries({client_id: expectedIdentity.client_id, framework_assessment_id: expectedIdentity.assessment_id}).some(([key, value]) => value && record[key] !== value)) {
    state = 'unavailable'; interviewState = 'unavailable';
    summary = 'The saved interview does not match this assessment context.'; actions = ['current'];
  } else if (draft?.revision) {
    interviewState = draft.completed ? 'completed' : 'unfinished';
    const known = draft.lineage_known === true && own(draft, 'base_assessment_token') && typeof draft.base_scope_fingerprint === 'string' && draft.base_scope_fingerprint.length === 64;
    lineageStale = known ? draft.lineage_stale === true || draft.base_assessment_token !== (record.last_saved || record.last_assessed || null) ||
      own(draft, 'current_scope_fingerprint') && draft.base_scope_fingerprint !== draft.current_scope_fingerprint : null;
    if (draft.completed) {
      if (sameSource(source, draft)) applicationState = 'current';
      else if (history.some(item => sameSource(item.guided_assessment_source, draft))) applicationState = 'previous';
      else if (historyComplete && Array.isArray(record.assessment_history) && known && expectedIdentity.user_id && draft.user_id === expectedIdentity.user_id) applicationState = 'unapplied';
    }
    if (!supportedVersions.includes(draft.version)) {
      state = 'unavailable'; interviewState = 'unsupported';
      summary += ' The saved question version is unavailable; keep the recorded interview and result unchanged.'; actions = ['current'];
    } else if (applicationState === 'current' || applicationState === 'previous') {
      state = 'result';
      summary += applicationState === 'current' ? ' This recorded recommendation is the current assessment source.' : ' This recorded recommendation was previously applied; the current assessment has a later position.';
      actions = ['current', 'result', 'changes', 'reassess'];
    } else if (lineageStale || !known) {
      state = 'stale';
      summary += lineageStale ? ' Assessment or scope changed after this interview began; compare the saved record before beginning a new review.' : ' This interview has no confirmed assessment base; compare the saved record before beginning a new review.';
      actions = ['current', ...(draft.completed ? ['result'] : ['resume']), 'reassess'];
    } else if (!draft.completed) {
      state = 'resume'; summary += ' An unfinished saved interview can be resumed in its original question version.';
      actions = ['resume', 'current', 'reassess'];
    } else {
      state = 'result';
      summary += applicationState === 'unapplied' ? ' A completed recommendation has not been applied to this assessment.' : ' A completed recommendation is saved; whether it was applied is unknown.';
      actions = ['result', 'current', 'changes', 'reassess'];
    }
  } else if (!saved.hasPosition && saved.status === 'not_assessed') {
    state = 'initial'; summary = 'This safeguard is Not Assessed. Begin an interview when you are ready to establish its implementation position.';
    actions = ['start', 'current'];
  }
  if (signals.openFindings > 0) {
    summary += ` ${signals.openFindings} open Finding${signals.openFindings === 1 ? '' : 's'} remain${signals.openFindings === 1 ? 's' : ''}.`;
    if (!actions.includes('findings')) actions.push('findings');
  }
  if (saved?.status === 'addressed' && saved.verification === 'gap_identified') {
    summary += ' Implementation is reported as Implemented, while the saved verification records a gap. Review this disagreement in the native assessment and linked records; the saved status is retained.';
    if (!actions.includes('findings')) actions.push('findings');
  }
  if (signals.openActions > 0) {
    summary += ` ${signals.openActions} open Action Item${signals.openActions === 1 ? '' : 's'} remain${signals.openActions === 1 ? 's' : ''}.`;
    if (!actions.includes('findings')) actions.push('findings');
  }
  if (signals.overdueReviews > 0 || signals.overdueActions > 0) {
    const existing = [signals.overdueReviews > 0 && `${signals.overdueReviews} overdue Review${signals.overdueReviews === 1 ? '' : 's'}`, signals.overdueActions > 0 && `${signals.overdueActions} overdue Action Item${signals.overdueActions === 1 ? '' : 's'}`].filter(Boolean);
    summary += ` Existing schedule signals: ${existing.join(' and ')}. Review their native records.`;
    if (!actions.includes('findings')) actions.push('findings');
  }
  if (signals.nextReview && !actions.includes('findings')) actions.push('findings');
  if (saved?.status === 'addressed' && saved.verification === 'verified' && signals.complete && signals.openFindings === 0 && signals.openActions === 0 && !signals.nextReview && !signals.overdueReviews && !signals.overdueActions && interviewState === 'none') {
    summary += ' No immediate interview is suggested. Review changes when relevant.';
    actions = ['changes', 'current', 'reassess'];
  }
  if (readOnly) actions = actions.filter(action => ['current', 'findings', 'result'].includes(action));
  return {state, interviewState, applicationState, lineageStale, readOnly, saved, signals, dates, summary, actions,
    result: draft?.completed ? {version: draft.version, revision: draft.revision, generated_at: draft.generated_at, narrative: draft.narrative} : null};
}

function compareIds(a, b) {
  const aa = a.definition_id.split('.').map(Number), bb = b.definition_id.split('.').map(Number);
  return aa[0] - bb[0] || aa[1] - bb[1] || a.definition_id.localeCompare(b.definition_id);
}

/** Rank the complete authorized active scope; unfinished interviews stay separate. */
export function prioritizeGuidedLifecycle(rows = [], {drafts = {}, contextComplete = false, limit = 3} = {}) {
  const unique = new Map();
  for (const row of rows) if (row?.definition_id && row.in_active_scope !== false && !unique.has(row.definition_id)) unique.set(row.definition_id, row);
  const scoped = [...unique.values()], resume = [], recommendations = [], overdue = [];
  let complete = contextComplete;
  for (const row of scoped) {
    const signals = workSignals(row, contextComplete);
    complete = complete && !!row.framework_assessment_id && !!statusLabels[row.status] && signals.complete;
    if (drafts[row.definition_id]?.revision && drafts[row.definition_id].completed === false) resume.push({...row, reasonCode: 'unfinished_interview', reason: 'An unfinished saved interview is available.', action: 'resume'});
    if (signals.overdueReviews > 0 || signals.overdueActions > 0) overdue.push({definition_id: row.definition_id, reviewCount: signals.overdueReviews, actionCount: signals.overdueActions});
    let rank, reasonCode, reason, action = 'current';
    if (row.status === 'not_assessed') {rank = 0; reasonCode = 'not_assessed'; reason = 'The saved position is Not Assessed.'; action = 'start';}
    else if (row.status === 'needs_attention') {rank = 1; reasonCode = 'not_implemented'; reason = 'The saved position is Not Implemented; an open Finding is not required to establish this gap.';}
    else if (row.status === 'in_progress' || signals.openFindings > 0 || signals.hasOpenGapAction === true || row.verification === 'gap_identified') {rank = 2; reasonCode = 'partial_or_unresolved'; reason = 'Partial implementation or an explicitly recorded unresolved gap needs attention.'; action = signals.openFindings > 0 || signals.hasOpenGapAction === true ? 'findings' : 'current';}
    else if ((row.status === 'addressed' && row.verification !== 'verified') || signals.nextReview || signals.overdueReviews > 0 || signals.openActions > 0) {
      rank = 3; reasonCode = 'verification_or_review';
      reason = signals.nextReview || signals.overdueReviews > 0 ? 'An authoritative scheduled Review is due or recorded.' : row.status === 'addressed' && row.verification !== 'verified' ? 'The saved implementation position still needs verification.' : 'Linked native Action Item remains open.';
      if (signals.openActions > 0) action = 'findings';
    }
    if (rank != null) recommendations.push({...row, rank, reasonCode, reason, action, signals});
  }
  recommendations.sort((a, b) => a.rank - b.rank || compareIds(a, b));
  resume.sort(compareIds); overdue.sort(compareIds);
  const categoryCount = code => recommendations.filter(item => item.reasonCode === code).length;
  const allIds = key => {
    const values = scoped.map(row => ids(key === 'action_ids' ? row.work?.action_ids ?? row.work?.task_ids : row.work?.[key]));
    return values.every(value => value !== null) ? new Set(values.flat()).size : null;
  };
  const counts = {
    safeguards: complete ? scoped.length : null,
    notAssessed: complete ? categoryCount('not_assessed') : null,
    needsAttention: complete ? categoryCount('not_implemented') : null,
    partialOrUnresolved: complete ? categoryCount('partial_or_unresolved') : null,
    verificationOrReview: complete ? categoryCount('verification_or_review') : null,
    resumable: complete ? resume.length : null,
    openFindings: complete ? allIds('finding_ids') : null,
    linkedReviews: complete ? allIds('review_ids') : null,
    openActions: complete ? allIds('action_ids') : null
  };
  return {recommendations: recommendations.slice(0, Number.isInteger(limit) && limit >= 0 ? limit : 3), resume, counts, overdue, contextComplete: complete};
}
