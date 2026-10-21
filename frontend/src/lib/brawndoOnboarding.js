import {cisExperienceEligible, cisIdentityEligible, cisImplementationGroup} from './cisExperience';
import {CADENCES, FRAMEWORKS, existingFrameworkReview, genericReviews, reviewConfig, sharedFrameworkPlans} from '@/lib/frameworks';
import {cisProgramName} from '@/lib/cisScope';
import {existingBaseline} from '@/lib/onboardingHandoff';
import {reviewSchedule, scheduledDate} from '@/lib/reviewOccurrences';

// Presentation only. Native controllers and API authorization own every operation.
export function brawndoOnboardingGate(context) {
  const draft = context.nativeDraft;
  const selectedDraft = draft?.requirements?.['cis-ig1'] === 'applies'
    && cisImplementationGroup({framework_settings:draft.framework_settings}) !== null;
  return (cisExperienceEligible(context) || cisIdentityEligible(context) && selectedDraft) && !context.hasError && context.pathname === '/client-profile'
    && [context.loadedClientId, context.profileClientId, context.handoffClientId].every(id => id === context.currentClientId);
}

// Table rows mirror the native create/retain choices. Handoff records are minimal,
// so retained schedules remain unavailable for projection even when they have a date.
export function onboardingReviewRows(catalog, state, records) {
  const rows = sharedFrameworkPlans(state).filter(plan => reviewConfig(state, plan).enabled).map(plan => {
    const config = reviewConfig(state, plan), existing = existingFrameworkReview(records.reviews, plan);
    return {key: existing?.review_id || `program:${plan.baseline_key || plan.key}`, kind: 'program',
      source: plan.drivers.map(driver => cisProgramName(FRAMEWORKS.find(framework => framework.key === driver.framework_key), state.framework_settings?.[driver.framework_key])).join(' · '),
      existing: !!existing, title: existing?.title || plan.title,
      plan, conflict: config.conflict, review: existing || {
        due_date: config.due_date, recurrence: config.recurrence, custom_recurrence_days: config.custom_recurrence_days,
      }};
  });
  for (const item of genericReviews(catalog, state)) {
    const existing = existingBaseline(records.reviews, item);
    rows.push({key: existing?.review_id || `general:${item.key}`, kind: 'general', source: 'General GRC',
      existing: !!existing, title: existing?.title || item.name, review: existing || {due_date: null, recurrence: null}});
  }
  const seen = new Set();
  return rows.filter(row => {if (seen.has(row.key)) return false; seen.add(row.key); return true;});
}

// Current month plus eleven months. Counts are read-only proposals, never executions.
// Unavailable and unscheduled count rows, total counts projected dates. A row whose
// bounded calculation cannot finish contributes no partial dates.
export function onboardingReviewForecast(rows, now = new Date()) {
  const year = now.getFullYear(), month = now.getMonth();
  const start = Date.UTC(year, month, 1), end = Date.UTC(year, month + 12, 1);
  const today = Date.UTC(year, month, now.getDate());
  const months = Array.from({length: 12}, (_, index) => {
    const at = Date.UTC(year, month + index, 1);
    return {at, label: new Date(at).toLocaleDateString('en-US', {month: 'short', year: 'numeric', timeZone: 'UTC'}), program: 0, general: 0, total: 0};
  });
  let unavailable = 0, unscheduled = 0, ignored = 0;
  for (const row of rows) {
    const native = row.review;
    if (['completed', 'cancelled'].includes(native.status)) {ignored++; continue;}
    if (row.existing || row.conflict) {unavailable++; continue;}
    if (!native.due_date) {unscheduled++; continue;}
    if (!scheduledDate(native.due_date) || !CADENCES.includes(native.recurrence)
      || native.recurrence === 'custom' && (!Number.isInteger(native.custom_recurrence_days)
        || native.custom_recurrence_days < 1 || native.custom_recurrence_days > 3650)) {unavailable++; continue;}
    let cursor = {...native}, complete = false;
    const dates = [];
    for (let step = 0; step < 1100; step++) {
      const date = scheduledDate(cursor.due_date), at = date?.getTime();
      if (!date) break;
      if (at >= end) {complete = true; break;}
      if (at >= today && at >= start) dates.push((date.getUTCFullYear() - year) * 12 + date.getUTCMonth() - month);
      const schedule = reviewSchedule(cursor), next = scheduledDate(schedule.next_review_date);
      if (!next || next.getTime() <= at) break;
      if (next.getTime() >= end) {complete = true; break;}
      cursor = {...cursor, ...schedule, due_date: schedule.next_review_date, recurrence_due_date: null};
    }
    if (!complete) {unavailable++; continue;}
    for (const index of dates) {months[index][row.kind]++; months[index].total++;}
  }
  return {months, unavailable, unscheduled, ignored, total: months.reduce((sum, item) => sum + item.total, 0)};
}
