import { eventCycleProgress, policyOverview, policyVisualMatches, timelineBounds, vendorOverview, vendorTimelineEvents } from './brawndoAdditionalPolicyVendor';

const now = new Date('2026-10-16T12:00:00Z');
const policy = { policy_id: 'p1', client_id: 'demo_brawndo', title: 'Recorded policy', category: 'Governance', status: 'draft' };
const vendor = { vendor_id: 'v1', client_id: 'demo_brawndo', name: 'Recorded vendor', status: 'active', criticality: 'high', next_review: '2026-11-15', contract_renewal: '2026-11-16' };

test('policy status figures preserve verification and missing distinctions without manufacturing approval', () => {
  const rows = [policy, { ...policy, policy_id: 'p2', status: 'approved' }, { ...policy, policy_id: 'p3', presence: 'reported_missing' }, { ...policy, policy_id: 'p4', status: 'approved', approved_at: '2026-10-01' }];
  const result = policyOverview(rows);
  expect(result).toMatchObject({ approved: 1, awaiting: 1, missing: 1, mapped: 0, review: null, covered: [], lastClosed: null });
  expect(policyVisualMatches(rows[2], 'missing', '', [], [], 1)).toBe(true);
  expect(policyVisualMatches(rows[1], 'missing', '', [], [], 1)).toBe(false);
  expect(policyVisualMatches(policy, '', 'Other', [], [], 1)).toBe(false);
});

test('annual card uses saved membership and same-client retained completion facts', () => {
  const rows = [policy, { ...policy, policy_id: 'p2' }, { ...policy, policy_id: 'p3' }];
  const review = { review_id: 'r1', client_id: policy.client_id, policy_ids: ['p1', 'p2', 'unknown'], recurrence: 'annual', status: 'upcoming', due_date: '2026-11-01', occurrences: [{ status: 'completed', completed_at: '2025-11-01' }, { status: 'cancelled', completed_at: '2099-01-01' }] };
  const other = { ...review, review_id: 'other', client_id: 'other-client', due_date: '2026-10-17', completion_date: '2099-01-01', status: 'completed' };
  const result = policyOverview(rows, [review, other]);
  expect(result.review).toBe(review);
  expect(result.covered).toEqual(['p1', 'p2']);
  expect(result.lastClosed).toBe('2025-11-01');
  expect(result.scheduledCount).toBe(1);
});

test('mapping figures use native catalog identity rather than a policy title', () => {
  const rows = [{ ...policy, baseline_key: 'policy-access-control-identity-management-policy' }, { ...policy, policy_id: 'p2', title: 'Access Control Policy', governance_context: { category: 'organizational' } }];
  const result = policyOverview(rows, [], ['cis-ig1']);
  expect(result.mapped).toBe(1);
  expect(policyVisualMatches(rows[1], 'mapped', '', ['cis-ig1'], [], 1)).toBe(false);
});

test('vendor figures use native 30-day cohorts and distinguish legal expiration from renewal', () => {
  const rows = [vendor, { ...vendor, vendor_id: 'expiration', next_review: null, contract_renewal: null, contract_expiration: '2026-10-20', criticality: 'low' }, { ...vendor, vendor_id: 'inactive', status: 'inactive' }];
  expect(vendorOverview(rows, now)).toEqual([1, 1, 0, 0]);
});

test('vendor timeline contains only saved dates and original native identities', () => {
  const rows = [Object.freeze({ ...vendor, assurance_records: [Object.freeze({ assurance_id: 'a1', next_follow_up: '2026-10-20', received_at: '2026-09-01' }), Object.freeze({ assurance_id: 'old', superseded_by: 'a1', next_follow_up: '2026-10-18' })], contract_notice_deadline: '2026-10-19' })];
  const review = Object.freeze({ review_id: 'r1', client_id: vendor.client_id, vendor_id: vendor.vendor_id, vendor_purpose: 'vendor', status: 'upcoming', due_date: '2026-11-15' });
  const reviews = [review, { ...review, review_id: 'cancelled', status: 'cancelled', due_date: '2026-10-17' }, { ...review, review_id: 'other-client', client_id: 'other-client', due_date: '2026-10-17' }];
  const events = vendorTimelineEvents(rows, reviews);
  expect(events.map(event => event.id)).toEqual(['notice:v1', 'assurance:v1:a1', 'review:r1', 'renewal:v1']);
  expect(events.find(event => event.id === 'review:r1').review).toBe(review);
  expect(events.find(event => event.id === 'assurance:v1:a1').document.assurance_id).toBe('a1');
  expect(events.every(event => event.vendor === rows[0])).toBe(true);
  expect(events.some(event => event.date.startsWith('2027'))).toBe(false);
  expect(eventCycleProgress(events.find(event => event.kind === 'ren'), now)).toBeNull();
});

test('same-day vendor events order reviews before assurance and renewal while retaining native tie order', () => {
  const date = '2026-11-01';
  const rows = Object.freeze([Object.freeze({ ...vendor, next_review: date, contract_renewal: date, contract_notice_deadline: date, assurance_records: Object.freeze([Object.freeze({ assurance_id: 'a1', next_follow_up: date })]) })]);
  const reviews = Object.freeze(['z-review', 'a-review'].map(review_id => Object.freeze({ review_id, client_id: vendor.client_id, vendor_id: vendor.vendor_id, status: 'upcoming', due_date: date })));
  const events = vendorTimelineEvents(rows, reviews);
  expect(events.map(event => event.id)).toEqual(['review:z-review', 'review:a-review', 'assurance:v1:a1', 'renewal:v1', 'notice:v1']);
  expect(reviews.map(review => review.review_id)).toEqual(['z-review', 'a-review']);
  expect(events.every(event => event.vendor === rows[0] && event.date === date)).toBe(true);
});

test('cycle bars require an actual valid start and an increasing saved end', () => {
  expect(eventCycleProgress({ start: '2026-10-01', date: '2026-10-31' }, now)).toBe(50);
  expect(eventCycleProgress({ start: 'invalid', date: '2026-10-31' }, now)).toBeNull();
  expect(eventCycleProgress({ start: '2026-10-31', date: '2026-10-01' }, now)).toBeNull();
  const bounds = timelineBounds(now);
  expect(bounds.months).toHaveLength(12);
  expect(bounds.position('2026-10-16')).toBe(0);
  expect(bounds.position('2027-10-16')).toBe(100);
});
