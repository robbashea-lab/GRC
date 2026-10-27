import { policyAlignment, policyStatus, AWAITING_APPROVAL } from './brawndoPolicies';
import { vendorMatches } from './brawndoVendors';
import { calendarDay, managementDay } from './managementDates';
import { CATALOGS, FRAMEWORKS } from './frameworks';

const liveReview = review => !['completed', 'cancelled'].includes(review.status) && !review.archived_at;
const eventKindOrder = { rev: 0, asr: 1, ren: 2 };
export const policyReviewIds = review => [...new Set([review.policy_id, ...(review.policy_ids || [])].filter(Boolean))];
export const isPolicySetReview = review => !!review.client_id && review.baseline_key === 'policy-review' && (review.review_type == null || review.review_type === 'policy') && !review.policy_id;
const expandedPolicyMapping = programs => programs.some(key => ['iso-27001', 'soc-2'].includes(key));
export const policyMappedFilterUnavailable = (view, error, programs = [], frameworkKeys = [], alignmentFiltered = false) => (view === 'mapped' || alignmentFiltered) && !!error
  && expandedPolicyMapping([...programs, ...frameworkKeys]);
const visiblePolicyAlignment = (row, programs, assessments, cisGroup) => policyAlignment(row, programs, assessments, cisGroup)
  .filter(item => expandedPolicyMapping(programs) || item.key === 'cis-ig1');

export function policyMappingPresentation(programs = [], cisGroup = 1) {
  if (!expandedPolicyMapping(programs)) return {mappedLabel:`Mapped to CIS IG${cisGroup}`, alignmentHeading:`CIS IG${cisGroup} safeguards`};
  const keys = [...new Set(programs.filter(key => typeof key === 'string' && Object.hasOwn(CATALOGS, key)))];
  if (keys.length !== 1) return {mappedLabel:'Framework-mapped', alignmentHeading:'Framework alignment'};
  const key = keys[0], label = key === 'cis-ig1' ? `CIS IG${cisGroup}` : FRAMEWORKS.find(program => program.key === key)?.label || CATALOGS[key].label;
  const unit = key === 'cis-ig1' ? 'safeguards' : key === 'iso-27001' ? 'alignment' : (CATALOGS[key].labels?.items || 'requirements').toLowerCase();
  return {mappedLabel:`Mapped to ${label}`, alignmentHeading:`${label} ${unit}`};
}

// These are presentation cohorts; the native approval and scheduling commands remain authoritative.
export function policyOverview(rows, reviews = [], programs = [], assessments = [], cisGroup = 1) {
  const ids = new Set(rows.map(row => row.policy_id));
  const clientId = rows[0]?.client_id;
  const linked = reviews.filter(review => review.client_id === clientId && (isPolicySetReview(review) || policyReviewIds(review).some(id => ids.has(id))));
  const scheduled = linked.filter(liveReview).sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
  const review = scheduled.find(item => isPolicySetReview(item) && item.recurrence === 'annual')
    || scheduled.find(item => item.recurrence === 'annual') || scheduled[0] || null;
  const covered = review ? policyReviewIds(review).filter(id => ids.has(id)) : [];
  const completed = (review ? [review] : linked).flatMap(item => [
    ...(item.status === 'completed' && item.completion_date ? [item.completion_date] : []),
    ...(item.occurrences || []).filter(occurrence => occurrence.status !== 'cancelled' && occurrence.completed_at).map(occurrence => occurrence.completed_at),
  ]).filter(value => calendarDay(value) !== null).sort();
  const mapped = rows.filter(row => visiblePolicyAlignment(row, programs, assessments, cisGroup).length);
  return {
    approved: rows.filter(row => policyStatus(row) === 'approved').length,
    awaiting: rows.filter(row => AWAITING_APPROVAL.includes(policyStatus(row))).length,
    missing: rows.filter(row => policyStatus(row) === 'needs_creation').length,
    mapped: expandedPolicyMapping(programs) ? new Set(mapped.map(row => row.policy_id)).size : mapped.length,
    review, covered, scheduledCount: scheduled.length, lastClosed: completed.at(-1) || null,
  };
}

export function policyVisualMatches(row, view, category, programs, assessments, cisGroup) {
  if (category && row.category !== category) return false;
  if (view === 'missing') return policyStatus(row) === 'needs_creation';
  if (view === 'mapped') return visiblePolicyAlignment(row, programs, assessments, cisGroup).length > 0;
  return true;
}

export function vendorOverview(rows, now = new Date()) {
  return ['critical_high', 'review_due', 'assurance', 'renewal_soon'].map(view => rows.filter(row => vendorMatches(row, view, now)).length);
}

export function vendorTimelineEvents(rows, reviews = []) {
  return rows.filter(row => vendorMatches(row, 'all_active')).flatMap(vendor => {
    const linked = reviews.filter(review => review.client_id === vendor.client_id && review.vendor_id === vendor.vendor_id && liveReview(review));
    const events = linked.map(review => ({
      id: `review:${review.review_id}`, kind: 'rev', label: review.title || 'Review', date: review.due_date,
      start: (review.vendor_purpose || 'vendor') === 'vendor' ? vendor.last_review : null, vendor, review, tab: 'reviews_tab',
    }));
    if (!linked.some(review => (review.vendor_purpose || 'vendor') === 'vendor') && vendor.next_review) {
      events.push({ id: `vendor:${vendor.vendor_id}`, kind: 'rev', label: 'Vendor review', date: vendor.next_review, start: vendor.last_review, vendor, tab: 'reviews_tab' });
    }
    (vendor.assurance_records || []).filter(document => !document.superseded_by).forEach((document, index) => {
      events.push({ id: `assurance:${vendor.vendor_id}:${document.assurance_id || index}`, kind: 'asr', label: 'Assurance follow-up', date: document.next_follow_up || document.refresh_due, start: document.received_at, vendor, tab: 'assurance', document });
    });
    // Legal renewal/notice dates never inherit a Review's completion or an assumed annual cycle.
    events.push({ id: `renewal:${vendor.vendor_id}`, kind: 'ren', label: 'Contract renewal', date: vendor.contract_renewal, vendor, tab: 'contract' });
    events.push({ id: `notice:${vendor.vendor_id}`, kind: 'ren', label: 'Notice deadline', date: vendor.contract_notice_deadline, vendor, tab: 'contract' });
    return events.filter(event => calendarDay(event.date) !== null);
  }).sort((a, b) => calendarDay(a.date) - calendarDay(b.date) || eventKindOrder[a.kind] - eventKindOrder[b.kind]);
}

export function eventCycleProgress(event, now = new Date()) {
  const start = calendarDay(event.start), end = calendarDay(event.date), today = managementDay(now);
  if (start === null || end === null || end <= start) return null;
  return Math.max(0, Math.min(100, (today - start) / (end - start) * 100));
}

export function timelineBounds(now = new Date()) {
  const start = managementDay(now), date = new Date(start * 86400000);
  const endDate = new Date(Date.UTC(date.getUTCFullYear() + 1, date.getUTCMonth(), date.getUTCDate()));
  const end = endDate.getTime() / 86400000;
  const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + index + 1, 1)));
  return { start, end, months, position: value => (calendarDay(value) - start) / (end - start) * 100 };
}
