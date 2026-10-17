import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BrawndoAdditionalPolicies from './BrawndoAdditionalPolicies';
import BrawndoAdditionalVendors from './BrawndoAdditionalVendors';

let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const click = node => act(async () => node.click());

test('policy presentation opens the full native record and keeps selection, row actions and scheduled review access', async () => {
  const policy = { policy_id: 'p1', client_id: 'demo_brawndo', title: 'Recorded policy', category: 'Governance', status: 'draft', next_review_date: '2026-11-01' };
  const review = { review_id: 'r1', client_id: policy.client_id, policy_id: policy.policy_id, title: 'Actual annual review', recurrence: 'annual', status: 'upcoming', due_date: '2026-11-01' };
  const onOpen = jest.fn(), onOpenReview = jest.fn(), onToggle = jest.fn(), onView = jest.fn();
  await act(async () => root.render(<BrawndoAdditionalPolicies rows={[policy]} reviews={[review]} onOpen={onOpen} onOpenReview={onOpenReview} onToggle={onToggle} onView={onView} selectedIds={new Set()} rowActions={() => <button type="button">Native actions</button>} />));
  expect(container.textContent).toContain('Next:');
  expect(container.textContent).toContain('Native actions');
  await click(container.querySelector('.bapv-name')); expect(onOpen).toHaveBeenCalledWith(policy);
  await click(container.querySelector('.bapv-link')); expect(onOpenReview).toHaveBeenCalledWith(review);
  await click(container.querySelector('[aria-label="Select Recorded policy"]')); expect(onToggle).toHaveBeenCalledWith('p1');
  await click(container.querySelector('[data-testid="additional-policy-metric-missing"]')); expect(onView).toHaveBeenCalledWith('missing');
});

test('policy status bar groups saved states without reordering or changing native records', async () => {
  const base = { client_id: 'demo_brawndo', title: 'Recorded policy' };
  const rows = Object.freeze([
    Object.freeze({ ...base, policy_id: 'missing', presence: 'reported_missing', status: 'draft' }),
    Object.freeze({ ...base, policy_id: 'approved', status: 'approved', approved_at: '2026-10-01' }),
    Object.freeze({ ...base, policy_id: 'awaiting', status: 'draft' }),
    Object.freeze({ ...base, policy_id: 'unverified', status: 'approved' }),
  ]);
  await act(async () => root.render(<BrawndoAdditionalPolicies rows={rows} />));
  expect([...container.querySelectorAll('.bap-status-bar i')].map(node => node.className)).toEqual(['approved', 'awaiting', 'missing', 'other']);
  expect([...container.querySelectorAll('.bap-row[data-testid]')].map(node => node.dataset.testid)).toEqual(['policies-row-0', 'policies-row-1', 'policies-row-2', 'policies-row-3']);
  expect([...container.querySelectorAll('.bap-row[data-testid] .bap-state-label')].map(node => node.textContent)).toEqual(['Needs Creation', 'Approved', 'Draft', 'Needs Confirmation']);
  expect(rows.map(row => row.policy_id)).toEqual(['missing', 'approved', 'awaiting', 'unverified']);
  expect(container.querySelector('.bapv-summary').textContent).toContain('CIS mappings are catalog support mappings, not evidence that a safeguard is implemented.');
});

test('vendor timeline and assurance cell open original native destinations without changing records', async () => {
  const vendor = Object.freeze({ vendor_id: 'v1', client_id: 'demo_brawndo', name: 'Recorded vendor', service: 'Actual service', status: 'active', criticality: 'high', assurance_records: [{ assurance_id: 'a1', type: 'SOC 2', review_status: 'received', next_follow_up: '2026-11-01', received_at: '2026-10-01' }] });
  const review = Object.freeze({ review_id: 'r1', client_id: vendor.client_id, vendor_id: vendor.vendor_id, title: 'Actual vendor review', status: 'upcoming', due_date: '2026-11-05' });
  const onOpen = jest.fn(), onOpenReview = jest.fn(), onView = jest.fn();
  await act(async () => root.render(<BrawndoAdditionalVendors rows={[vendor]} reviews={[review]} onOpen={onOpen} onOpenReview={onOpenReview} onView={onView} />));
  await click(container.querySelector('.bav-assurance button')); expect(onOpen).toHaveBeenCalledWith(vendor, 'assurance');
  await click(container.querySelector('.bav-lane-open')); expect(onOpen).toHaveBeenCalledWith(vendor, 'reviews_tab');
  expect(container.querySelector('.bav-assurance').textContent).toContain('Received');
  expect(container.querySelector('.bav-assurance').textContent).not.toContain('Reviewed');
  await click([...container.querySelectorAll('.bav-event')].find(node => node.title.includes('Actual vendor review'))); expect(onOpenReview).toHaveBeenCalledWith(review);
  expect(container.querySelectorAll('.bav-lane')).toHaveLength(1);
  expect(container.querySelector('.bav-renewal').textContent).toBe('No renewal date');
});

test('policy clear delegates once to the atomic parent callback', async () => {
  const policy = { policy_id: 'p1', client_id: 'demo_brawndo', title: 'Recorded policy', category: 'Governance', status: 'draft' };
  const onClear = jest.fn(), onSearch = jest.fn(), onView = jest.fn(), onCategory = jest.fn();
  await act(async () => root.render(<BrawndoAdditionalPolicies rows={[policy]} filteredRows={[]} q="unmatched" view="missing" category="Governance" onClear={onClear} onSearch={onSearch} onView={onView} onCategory={onCategory} />));
  await click([...container.querySelectorAll('button')].find(node => node.textContent === 'Clear filters'));
  expect(onClear).toHaveBeenCalledTimes(1);
  expect(onSearch).not.toHaveBeenCalled(); expect(onView).not.toHaveBeenCalled(); expect(onCategory).not.toHaveBeenCalled();
});

test('policy review warning follows the native local-day overdue and 30-day windows', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 16, 23, 30));
  const policy = { policy_id: 'p1', client_id: 'demo_brawndo', title: 'Recorded policy', status: 'draft' };
  const review = { review_id: 'r1', client_id: policy.client_id, policy_id: policy.policy_id, recurrence: 'annual', status: 'upcoming' };
  try {
    for (const [due_date, warning] of [['2026-10-15', true], ['2026-10-16', true], ['2026-11-15', true], ['2026-11-16', false], [null, false], ['unknown', false]]) {
      await act(async () => root.render(<BrawndoAdditionalPolicies rows={[policy]} reviews={[{ ...review, due_date }]} />));
      expect(container.querySelector('.bap-review-date small').classList.contains('warn')).toBe(warning);
    }
  } finally {
    jest.useRealTimers();
  }
});

test('policy unavailable alignment remains unknown while a healthy unmapped population reports zero', async () => {
  const policy = { policy_id: 'p1', client_id: 'demo_brawndo', title: 'Recorded policy', status: 'draft' };
  const mapped = () => container.querySelector('[data-testid="additional-policy-metric-mapped"]');
  await act(async () => root.render(<BrawndoAdditionalPolicies rows={[policy]} alignmentError="Alignment unavailable" />));
  expect(mapped().querySelector('strong').textContent.startsWith('—')).toBe(true);
  expect(mapped().disabled).toBe(true);
  await act(async () => root.render(<BrawndoAdditionalPolicies rows={[policy]} />));
  expect(mapped().querySelector('strong').textContent.startsWith('0')).toBe(true);
  expect(mapped().disabled).toBe(false);
});

test.each([
  ['inactive', ['inactive'], 'Showing 1 of 2 inactive vendors'],
  ['all', ['active', 'inactive', 'retained'], 'Showing 3 of 3 vendors'],
  ['all_active', ['active'], 'Showing 1 of 1 active vendor'],
])('vendor %s footer uses its truthful authorized population', async (view, visibleIds, expected) => {
  const rows = [
    { vendor_id: 'active', client_id: 'demo_brawndo', name: 'Active vendor', status: 'active' },
    { vendor_id: 'inactive', client_id: 'demo_brawndo', name: 'Inactive vendor', status: 'inactive' },
    { vendor_id: 'retained', client_id: 'demo_brawndo', name: 'Retained vendor', status: 'terminated' },
  ];
  await act(async () => root.render(<BrawndoAdditionalVendors rows={rows} filteredRows={rows.filter(row => visibleIds.includes(row.vendor_id))} view={view} onView={jest.fn()} />));
  expect(container.querySelector('.bapv-summary').textContent).toContain(expected);
});

test.each([{ error: 'Refresh unavailable' }, { loading: true }])('vendor unavailable population does not present zero counts: %j', async state => {
  await act(async () => root.render(<BrawndoAdditionalVendors rows={[]} onView={jest.fn()} {...state} />));
  expect([...container.querySelectorAll('.bapv-kcell strong')].map(node => node.textContent)).toEqual(['—', '—', '—', '—']);
  expect([...container.querySelectorAll('.bapv-segment button span')].every(node => node.textContent === '—')).toBe(true);
  expect(container.querySelector('.bapv-page-head p').textContent).toBe('Third-party register');
  expect(container.querySelector('.bapv-summary').textContent).toBe(state.error ? 'Vendor counts unavailable.' : 'Loading vendors…');
});

test('vendor filtered cohort includes native legacy relationships without using the unrelated active denominator', async () => {
  const rows = [
    { vendor_id: 'active-high', client_id: 'demo_brawndo', name: 'Active high', status: 'active', criticality: 'high' },
    { vendor_id: 'legacy-high', client_id: 'demo_brawndo', name: 'Legacy high', status: 'under_review', criticality: 'high' },
    { vendor_id: 'active-low-1', client_id: 'demo_brawndo', name: 'Active low one', status: 'active', criticality: 'low' },
    { vendor_id: 'active-low-2', client_id: 'demo_brawndo', name: 'Active low two', status: 'active', criticality: 'low' },
  ];
  await act(async () => root.render(<BrawndoAdditionalVendors rows={rows} filteredRows={[rows[1]]} view="critical_high" q="Legacy" onView={jest.fn()} />));
  expect(container.querySelector('.bapv-summary').textContent).toContain('Showing 1 of 2 vendors');
});

test('vendor native notice-deadline cohort is labeled as renewal or notice work', async () => {
  const vendor = { vendor_id: 'v1', client_id: 'demo_brawndo', name: 'Recorded vendor', status: 'active', contract_notice_deadline: new Date().toISOString().slice(0, 10), contract_renewal: '2099-01-01' };
  await act(async () => root.render(<BrawndoAdditionalVendors rows={[vendor]} onView={jest.fn()} />));
  const figure = container.querySelector('[data-testid="additional-vendor-metric-renewal_soon"]');
  expect(figure.textContent).toContain('Renewal / notice actions in 30 days');
  expect(figure.querySelector('strong').textContent).toBe('1');
  expect(container.querySelector('[data-testid="vendor-view-renewal_soon"]').textContent).toContain('Renewal / notice actions');
});
