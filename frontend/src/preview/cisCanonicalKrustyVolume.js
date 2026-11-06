import {reviewSchedule, scheduledDate} from '../lib/reviewOccurrences';

const CID = 'demo_krusty_krab';
const DAY = 86400000;
const MONTHS = {monthly:1, quarterly:3, semiannual:6, annual:12};
const SOURCE_FIELDS = {risks:'risk_id', vendors:'vendor_id', ai_systems:'ai_system_id'};
const fail = message => {throw new Error('Krusty history volume: '+message);};
const present = value => value !== undefined && value !== null && value !== '';

function date(value, label) {
  const parsed = scheduledDate(value);
  if (!parsed) fail(label+' must be a valid native date.');
  const iso = parsed.toISOString(), day = iso.slice(0,10);
  return {iso, day, time:+parsed, index:Date.parse(day+'T00:00:00.000Z')/DAY,
    month:parsed.getUTCFullYear()*12+parsed.getUTCMonth()};
}

function ids(values, label) {
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value)
    || new Set(values).size !== values.length) fail(label+' must contain distinct Review IDs.');
  return new Set(values);
}

function sourceOrigins(values, reviewIds) {
  if (!Array.isArray(values)) fail('review_origins must be the native source array.');
  const sources = new Map();
  for (const source of values) {
    if (!source || typeof source !== 'object' || Array.isArray(source)
      || !reviewIds.has(source.review_id) || sources.has(source.review_id)
      || present(source.client_id) && source.client_id !== CID)
      fail('source origins must identify distinct Reviews in this canonical client.');
    date(source.origin, 'source origin');
    sources.set(source.review_id, source);
  }
  return sources;
}

function frameworkScope(review, frameworkIds) {
  if (review.framework_drivers != null && (!Array.isArray(review.framework_drivers)
    || review.framework_drivers.some(driver => !driver || typeof driver !== 'object')))
    fail('framework drivers must retain their native scope.');
  const keys = [review.framework_key,...(review.framework_drivers || []).map(driver => driver.framework_key)].filter(present);
  if (keys.some(key => key !== 'cis-ig1')
    || present(review.framework_version) && review.framework_version !== '8.1'
    || (review.framework_drivers || []).some(driver => present(driver.framework_version) && driver.framework_version !== '8.1'))
    fail('only the supported CIS v8.1 framework scope can be projected.');
  const native = keys.includes('cis-ig1') || present(review.framework_version)
    || present(review.framework_plan_key) || present(review.framework_setup_key)
    || (review.framework_drivers || []).some(driver => present(driver.framework_version));
  if (frameworkIds && native && !frameworkIds.has(review.review_id)) fail('the explicit framework roster conflicts with native scope.');
  return frameworkIds ? frameworkIds.has(review.review_id) : native;
}

function lifecycle(review, source, floor, anchor) {
  const created = present(review.created_at) ? date(review.created_at, 'Review creation') : null;
  const supplied = source ? date(source.origin, 'source origin') : null;
  if (!created && !supplied) fail('each Review needs its actual creation or exact source origin.');
  if (created && supplied && created.time !== supplied.time) fail('the source origin conflicts with Review creation.');
  const origin = supplied || created;
  if (origin.time < floor.time || origin.time > anchor.time) fail('Review creation conflicts with its scoped history floor or anchor.');
  if (source && (present(source.source_kind) || present(source.source_id))) {
    const field = SOURCE_FIELDS[source.source_kind];
    if (!field || typeof source.source_id !== 'string' || !source.source_id || review[field] !== source.source_id)
      fail('the source origin belongs to a different native record.');
  }
  const cancelled = present(review.cancelled_at) ? date(review.cancelled_at, 'cancellation') : null;
  const terminal = present(source?.terminal_at) ? date(source.terminal_at, 'source terminal') : null;
  if (cancelled && terminal && cancelled.time !== terminal.time) fail('source and native terminal dates conflict.');
  const end = terminal || cancelled;
  if (end && (end.time < origin.time || end.time > anchor.time)) fail('the terminal must lie between actual creation and the anchor.');
  return {origin, terminal:end, unresolved:review.status === 'cancelled' && !end};
}

function schedule(review) {
  if (!['upcoming','in_progress','completed','cancelled','needs_scheduling'].includes(review.status))
    fail('the Review must retain a native lifecycle status.');
  if (!['monthly','quarterly','semiannual','annual','custom','none'].includes(review.recurrence))
    fail('an explicit supported native recurrence is required.');
  if (review.recurrence === 'custom' && (!Number.isInteger(review.custom_recurrence_days) || review.custom_recurrence_days <= 0))
    fail('custom recurrence must retain its positive native day interval.');
  if (review.schedule_anchor != null && (typeof review.schedule_anchor !== 'object' || Array.isArray(review.schedule_anchor)
    || !Number.isInteger(review.schedule_anchor.day) || review.schedule_anchor.day < 1 || review.schedule_anchor.day > 31
    || typeof review.schedule_anchor.month_end !== 'boolean')) fail('the native calendar anchor is invalid.');
  const current = date(review.due_date, 'current due date');
  const base = date(present(review.recurrence_due_date) ? review.recurrence_due_date : review.due_date, 'current recurrence date');
  const native = reviewSchedule(review);
  if (review.recurrence !== 'none') {
    const next = date(native.next_review_date, 'native next cycle');
    if (next.index <= base.index) fail('the native recurrence does not advance.');
  }
  return {base, current, anchor:{day:native.schedule_anchor.day,month_end:native.schedule_anchor.month_end}};
}

function priorPeriods(review, origin, terminal, anchor, native) {
  if (review.recurrence === 'none' || native.base.index < origin.index) return [];
  const months = MONTHS[review.recurrence], interval = review.custom_recurrence_days;
  // One additional step proves that the actual day/month span has reached its
  // origin. This is a derived finite bound, not a truncated history allowance.
  const bound = months ? Math.floor((native.base.month-origin.month)/months)+1
    : Math.floor((native.base.index-origin.index)/interval)+1;
  if (!Number.isSafeInteger(bound) || bound < 1) fail('the native recurrence span is invalid.');
  const dueDates = [];
  let successor = native.base.day, reachedOrigin = false;
  for (let step = 1; step <= bound; step++) {
    let candidate;
    if (months) {
      if (native.base.month-months*step < origin.month) {reachedOrigin = true; break;}
      const previous = scheduledDate(native.base.iso);
      previous.setUTCDate(1); previous.setUTCMonth(previous.getUTCMonth()-months*step);
      const last = new Date(Date.UTC(previous.getUTCFullYear(),previous.getUTCMonth()+1,0)).getUTCDate();
      previous.setUTCDate(native.anchor.month_end ? last : Math.min(native.anchor.day,last));
      candidate = date(previous.toISOString(), 'prior calendar cycle');
    } else {
      const previous = native.base.index-interval*step;
      if (previous < origin.index) {reachedOrigin = true; break;}
      candidate = date(new Date(previous*DAY).toISOString(), 'prior custom cycle');
    }
    if (candidate.index < origin.index) {reachedOrigin = true; break;}
    if (candidate.day >= successor) fail('the reversed native cycle does not move backward.');
    const forward = reviewSchedule({...review, due_date:candidate.day, recurrence_due_date:null, schedule_anchor:native.anchor});
    if (!forward.next_review_date || date(forward.next_review_date, 'forward oracle').day !== successor)
      fail('a reversed cycle does not round-trip through native scheduling.');
    if (candidate.index < anchor.index && (!terminal || candidate.index < terminal.index)) {
      // A moved current deadline can share a day with a distinct prior native
      // period. Neither deleting that period nor counting it is justified here.
      if (candidate.day === native.current.day) return null;
      dueDates.push(candidate.day);
    }
    successor = candidate.day;
  }
  if (!reachedOrigin) fail('the derived native recurrence bound did not reach its origin.');
  return dueDates.reverse();
}

// A pure capacity input: no actors, results, completions, record writes or installs.
export function krustyHistoryVolumePlan(reviews, {anchor, organization_origin, framework_origin,
  review_origins = [], framework_review_ids} = {}) {
  if (!Array.isArray(reviews) || reviews.some(review => !review || typeof review !== 'object' || Array.isArray(review)
    || review.client_id !== CID)) fail('only canonical Krusty Review records may be planned.');
  const reviewIds = ids(reviews.map(review => review.review_id), 'reviews');
  const clock = date(anchor, 'anchor'), organization = date(organization_origin, 'organization origin');
  const framework = date(framework_origin, 'framework origin');
  // The existing canonical baseline declares first v8.1 enrollment on July 1;
  // this source-only guard does not redefine the official June release date.
  if (organization.time > framework.time || framework.time > clock.time || framework.day < '2024-07-01')
    fail('organization, declared CIS enrollment and anchor must retain their native chronology.');
  const frameworkIds = framework_review_ids === undefined ? null : ids(framework_review_ids, 'framework_review_ids');
  if (frameworkIds && [...frameworkIds].some(id => !reviewIds.has(id))) fail('framework IDs must resolve to this Review population.');
  const sources = sourceOrigins(review_origins, reviewIds), unresolved = [];
  const rows = reviews.map(review => {
    const isFramework = frameworkScope(review, frameworkIds), floor = isFramework ? framework : organization;
    const life = lifecycle(review, sources.get(review.review_id), floor, clock), native = schedule(review);
    if (life.unresolved) unresolved.push({review_id:review.review_id, code:'terminal_date_unknown',
      detail:'The cancelled Review has no exact terminal date; no prior-period count is inferred.'});
    const dueDates = life.unresolved ? null : priorPeriods(review, life.origin, life.terminal, clock, native);
    if (!life.unresolved && dueDates === null) unresolved.push({review_id:review.review_id, code:'ambiguous_moved_due',
      detail:'The moved current deadline coincides with a prior native period; occurrence identity needs an exact source decision.'});
    return {review_id:review.review_id, scope:isFramework ? 'framework' : 'supplemental',
      origin:life.origin.iso, scoped_floor:floor.iso, terminal_at:life.terminal?.iso || null,
      recurrence:review.recurrence, custom_recurrence_days:review.recurrence === 'custom' ? review.custom_recurrence_days : null,
      current_due_date:review.due_date, recurrence_due_date:review.recurrence_due_date ?? null,
      current_period_date:native.base.day, schedule_anchor:native.anchor,
      due_dates:dueDates || [], planned_period_count:dueDates === null ? null : dueDates.length};
  });
  const resolved = rows.filter(row => row.planned_period_count !== null);
  const total = resolved.reduce((sum, row) => sum+row.planned_period_count, 0);
  const byRecurrence = {};
  for (const row of resolved) byRecurrence[row.recurrence] = (byRecurrence[row.recurrence] || 0)+row.planned_period_count;
  return {schema_version:1, client_id:CID, label:'Source history volume plan; not historical completions or execution proof',
    anchor:clock.iso, organization_origin:organization.iso, framework_origin:framework.iso,
    boundaries:{origin:'inclusive calendar day', anchor:'exclusive calendar day', terminal:'exclusive calendar day',
      current_parent:'excluded', future_periods:'excluded'}, complete:unresolved.length === 0,
    reviews:rows, unresolved, counts:{review_parents:rows.length,
      framework_review_parents:rows.filter(row => row.scope === 'framework').length,
      supplemental_review_parents:rows.filter(row => row.scope === 'supplemental').length,
      unresolved_review_parents:unresolved.length, planned_past_periods:unresolved.length ? null : total,
      resolved_planned_past_periods:total, resolved_periods_by_recurrence:byRecurrence}};
}
