import {calendarDay} from './managementDates';
import {quarterToday} from './quarterlyProgramTimeline';
import {occurrenceId} from './reviewOccurrences';
import {actionTerminal} from './actionItems';
import {assuranceKey, assuranceName, assuranceState, vendorMatches} from './brawndoVendors';

const live = record => !record.archived_at && !record.archived;
const reviewOpen = record => live(record) && !['completed', 'cancelled'].includes(record.status);

// Read projections only. A shared date never establishes shared completion.
export function vendorOutstandingWork(vendors = [], reviews = [], tasks = [], now = new Date()) {
  const events = new Map();
  const active = vendors.filter(vendor => live(vendor) && vendorMatches(vendor, 'all_active', now));
  const byVendor = new Map(active.map(vendor => [`${vendor.client_id}:${vendor.vendor_id}`, vendor]));
  const byReview = new Map(reviews.filter(review => review.review_id).map(review => [`${review.client_id}:${review.review_id}`, review]));
  const add = event => {
    if (calendarDay(event.date) === null || events.has(event.id)) return;
    events.set(event.id, {...event, title: event.vendor.name});
  };
  for (const vendor of active) {
    const linked = reviews.filter(review => review.client_id === vendor.client_id && review.vendor_id === vendor.vendor_id);
    for (const review of linked.filter(reviewOpen)) {
      if (!review.review_id) continue;
      const purpose = review.vendor_purpose || 'vendor';
      // Offboarding remains its own native process, outside the three work families.
      if (!['vendor', 'assurance', 'contract'].includes(purpose)) continue;
      add({id: `review:${vendor.client_id}:${review.review_id}:${occurrenceId(review)}`, vendor, review,
        kind: purpose === 'assurance' ? 'asr' : purpose === 'contract' ? 'ren' : 'rev',
        label: purpose === 'assurance' ? 'Assurance review' : purpose === 'contract' ? 'Contract review' : 'Vendor review',
        date: review.due_date, owner_id: review.owner_id, outstanding: true, tab: 'reviews_tab'});
    }
    // A legacy saved schedule is represented by its native Vendor only when no primary Review exists.
    if (!linked.some(review => (review.vendor_purpose || 'vendor') === 'vendor')) {
      add({id: `vendor:${vendor.client_id}:${vendor.vendor_id}:review`, vendor, kind: 'rev', label: 'Vendor review',
        date: vendor.next_review, owner_id: vendor.business_owner_id, outstanding: true, tab: 'reviews_tab'});
    }
    (vendor.assurance_records || []).forEach((document, index) => {
      if (document.superseded_by) return;
      add({id: `assurance:${vendor.client_id}:${vendor.vendor_id}:${assuranceKey(document, index)}`, vendor, document,
        assuranceId: assuranceKey(document, index), kind: 'asr', label: 'Assurance follow-up',
        detail: `${assuranceName(document)} · ${assuranceState(document)}`, date: document.next_follow_up || document.refresh_due,
        owner_id: vendor.business_owner_id, outstanding: true, tab: 'assurance'});
    });
    // Legal dates are visible facts, not proof of unresolved work or automatic renewal.
    for (const [field, label] of [['contract_renewal', 'Contract renewal'], ['contract_notice_deadline', 'Notice deadline']]) {
      add({id: `date:${vendor.client_id}:${vendor.vendor_id}:${field}`, vendor, kind: 'ren', label,
        date: vendor[field], owner_id: vendor.business_owner_id, outstanding: false, tab: 'contract'});
    }
  }
  for (const task of tasks) {
    if (!task.task_id || !live(task) || actionTerminal(task)) continue;
    const review = byReview.get(`${task.client_id}:${task.review_id}`);
    const vendorId = task.vendor_id || (task.source_type === 'vendor' ? task.source_id : review?.vendor_id);
    const vendor = byVendor.get(`${task.client_id}:${vendorId}`);
    if (!vendor || (task.vendor_id && review?.vendor_id && task.vendor_id !== review.vendor_id)) continue;
    if (task.source_type === 'vendor' && task.source_id && task.source_id !== vendor.vendor_id) continue;
    const document = task.assurance_id && (vendor.assurance_records || []).find((item, index) => assuranceKey(item, index) === task.assurance_id);
    const kind = document ? 'asr' : review?.vendor_purpose === 'contract' ? 'ren' : 'other';
    add({id: `task:${task.client_id}:${task.task_id}`, vendor, task, document, kind,
      label: document ? 'Assurance action' : kind === 'ren' ? 'Contract action' : 'Action Item · category not recorded',
      detail: task.title, date: task.due_date, owner_id: task.assignee_id || task.owner_id, outstanding: true});
  }
  const ordered = [...events.values()].sort((a, b) => calendarDay(a.date) - calendarDay(b.date) || a.id.localeCompare(b.id));
  const today = quarterToday(now), outstanding = ordered.filter(event => event.outstanding);
  return {events: ordered, outstanding, overdue: outstanding.filter(event => calendarDay(event.date) < today),
    due30: outstanding.filter(event => calendarDay(event.date) >= today && calendarDay(event.date) <= today + 30)};
}

export const vendorWorkUnits = events => `${events.length} ${events.length === 1 ? 'item' : 'items'} · ${new Set(events.map(event => `${event.vendor.client_id}:${event.vendor.vendor_id}`)).size} ${new Set(events.map(event => `${event.vendor.client_id}:${event.vendor.vendor_id}`)).size === 1 ? 'vendor' : 'vendors'}`;
