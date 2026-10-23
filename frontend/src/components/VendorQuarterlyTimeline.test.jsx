import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoAdditionalVendors, {vendorQuarterlyTimelineEvents} from './BrawndoAdditionalVendors';

const vendor = Object.freeze({vendor_id: 'native-vendor', client_id: 'isolated-client', name: 'Recorded Vendor',
  status: 'active', criticality: 'high', next_review: '2026-11-05', contract_renewal: '2026-12-12',
  contract_notice_deadline: '2026-11-12', service: 'Recorded service',
  assurance_records: Object.freeze([Object.freeze({assurance_id: 'native-assurance', document_name: 'Recorded assurance',
    review_status: 'received', next_follow_up: '2026-11-05'})])});
const review = Object.freeze({review_id: 'native-review', client_id: vendor.client_id, vendor_id: vendor.vendor_id,
  title: 'Saved primary Vendor Review', status: 'upcoming', vendor_purpose: 'vendor', due_date: '2026-11-05'});
const assurance = Object.freeze({...review, review_id: 'native-assurance-review', title: 'Saved assurance Review', vendor_purpose: 'assurance'});
const contract = Object.freeze({...review, review_id: 'native-contract-review', title: 'Saved contract Review', vendor_purpose: 'contract'});

test('quarterly Vendor events retain every actual identity and native purpose/destination without rewriting records', () => {
  const rows = Object.freeze([vendor]), reviews = Object.freeze([review, assurance, contract]);
  const before = JSON.stringify({rows, reviews});
  const events = vendorQuarterlyTimelineEvents(rows, reviews);
  expect(events).toHaveLength(6);
  expect(events.find(event => event.id === 'review:native-review')).toMatchObject({kind: 'rev', record: review, review, vendor, tab: 'reviews_tab'});
  expect(events.find(event => event.id === 'review:native-assurance-review')).toMatchObject({kind: 'asr', record: assurance, review: assurance, tab: 'reviews_tab'});
  expect(events.find(event => event.id === 'review:native-contract-review')).toMatchObject({kind: 'ren', record: contract, review: contract, overdueEligible: true});
  expect(events.find(event => event.id === 'assurance:native-vendor:native-assurance')).toMatchObject({kind: 'asr', record: vendor, vendor, tab: 'assurance', detail: 'Recorded assurance · Received'});
  for (const id of ['renewal:native-vendor', 'notice:native-vendor']) {
    expect(events.find(event => event.id === id)).toMatchObject({kind: 'ren', record: vendor, vendor, tab: 'contract', overdueEligible: false});
  }
  expect(events.filter(event => event.date === '2026-11-05').map(event => event.id).sort()).toEqual([
    'assurance:native-vendor:native-assurance', 'review:native-assurance-review', 'review:native-contract-review', 'review:native-review',
  ]);
  expect(JSON.stringify({rows, reviews})).toBe(before);
});

test('quarterly adapter uses current native source rules for missing dates, inactive Vendors and unrelated Reviews', () => {
  const live = {...vendor, next_review: '2026-11-05', contract_renewal: null, contract_notice_deadline: 'invalid', assurance_records: []};
  const unrelated = {...review, client_id: 'foreign-client'};
  const completed = {...review, status: 'completed'};
  const events = vendorQuarterlyTimelineEvents([live, {...vendor, vendor_id: 'inactive', status: 'inactive'}], [unrelated, completed]);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({id: 'vendor:native-vendor', kind: 'rev', date: '2026-11-05', vendor: live, tab: 'reviews_tab'});
  expect(events[0].review).toBeUndefined();
});

let container, root, previousObserver, geometry, scopeSequence = 0;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-18T16:00:00Z'));
  previousObserver = global.ResizeObserver;
  global.ResizeObserver = class {observe() {} unobserve() {} disconnect() {}};
  geometry = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return {width: this.classList.contains('qpt-plot') ? 1100 : 0, height: 0, top: 0, left: 0, right: 1100, bottom: 0};
  });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  geometry.mockRestore(); global.ResizeObserver = previousObserver; jest.useRealTimers();
});

const click = node => act(async () => node.click());
const buttonNamed = text => [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === text || node.textContent === text);

async function render(overrides = {}) {
  const handlers = {onOpen: jest.fn(), onOpenReview: jest.fn(), onView: jest.fn(), onSearch: jest.fn()};
  const props = {rows: [vendor], reviews: [review, assurance, contract], quarterlyChart: true,
    scopeKey: `actor:standard:isolated-client:cis-ig1:IG2:${++scopeSequence}`, ...handlers, ...overrides};
  await act(async () => root.render(<BrawndoAdditionalVendors {...props}/>));
  return {handlers, props};
}

test('non-quarterly consumers retain the existing native Vendor timeline', async () => {
  await render({quarterlyChart: false});
  expect(container.querySelector('.bav-timeline')).toBeTruthy();
  expect(container.textContent).toContain('Next 12 months');
  expect(container.querySelector('[aria-label="Calendar quarter"]')).toBeNull();
});

function protectedMarkup(modalOpen = false) {
  return Object.fromEntries([['cards', '.bapv-kstrip'], ['register', '[aria-label="Vendor register"]']].map(([key, selector]) => {
    const node = container.querySelector(selector), copy = node.cloneNode(true);
    // The native Dialog deliberately hides its background siblings from assistive technology.
    for (const attribute of ['data-aria-hidden', 'aria-hidden']) {
      expect(node.getAttribute(attribute)).toBe(modalOpen ? 'true' : null);
      if (modalOpen) copy.removeAttribute(attribute);
    }
    return [key, copy.outerHTML];
  }));
}

test('quarter/year, list and chart data interactions leave all native Vendor cards and register unchanged', async () => {
  const {handlers} = await render();
  const baseline = protectedMarkup();
  const cards = container.querySelector('.bapv-kstrip'), register = container.querySelector('[aria-label="Vendor register"]');
  expect(container.querySelector('.qpt-year strong').textContent).toBe('Q4 2026');
  for (const control of ['Q2', 'Previous quarter', 'Next quarter', 'Q4', 'View data', 'Hide data']) {
    await click(buttonNamed(control));
    expect(protectedMarkup()).toEqual(baseline);
  }
  const marker = container.querySelector('[data-group-id="2026-11-05:asr"]');
  expect(marker.querySelector('b').textContent).toBe('2');
  await click(marker);
  expect(document.querySelector('.qpt-selector h2').textContent).toContain('Assurance follow-up');
  expect(document.querySelectorAll('.qpt-selection-row')).toHaveLength(2);
  expect([...document.querySelectorAll('.qpt-selection-row')].map(node => node.dataset.eventId)).toEqual([
    'assurance:native-vendor:native-assurance', 'review:native-assurance-review',
  ]);
  expect(protectedMarkup(true)).toEqual(baseline);
  expect(container.querySelector('.bapv-kstrip')).toBe(cards);
  expect(container.querySelector('[aria-label="Vendor register"]')).toBe(register);
  await click(buttonNamed('Close item selection'));
  await act(async () => jest.advanceTimersByTime(20));
  expect(document.querySelector('.qpt-selector')).toBeNull();
  expect(document.activeElement).toBe(marker);
  expect(protectedMarkup()).toEqual(baseline);
  for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
});

test.each([
  ['review:native-review', '2026-11-05:rev', 'review', review],
  ['review:native-assurance-review', '2026-11-05:asr', 'review', assurance],
  ['assurance:native-vendor:native-assurance', '2026-11-05:asr', 'vendor', 'assurance'],
  ['review:native-contract-review', '2026-11-05:ren', 'review', contract],
  ['renewal:native-vendor', '2026-12-12:ren', 'vendor', 'contract'],
  ['notice:native-vendor', '2026-11-12:ren', 'vendor', 'contract'],
])('larger Vendor selector keeps exact native event destination: %s', async (eventId, groupId, source, target) => {
  const {handlers} = await render();
  const baseline = protectedMarkup();
  const marker = container.querySelector(`[data-group-id="${groupId}"]`);
  if (marker) await click(marker);
  else await click(container.querySelector('.qpt-overflow'));
  expect(handlers.onOpen).not.toHaveBeenCalled(); expect(handlers.onOpenReview).not.toHaveBeenCalled();
  await click(document.querySelector(`.qpt-selection-row[data-event-id="${eventId}"]`));
  if (source === 'review') {
    expect(handlers.onOpenReview).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenReview.mock.calls[0][0]).toBe(target);
    expect(handlers.onOpen).not.toHaveBeenCalled();
  } else {
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);
    expect(handlers.onOpen.mock.calls[0][0]).toBe(vendor);
    expect(handlers.onOpen.mock.calls[0][1]).toBe(target);
    expect(handlers.onOpenReview).not.toHaveBeenCalled();
  }
  expect(document.querySelector('.qpt-selector')).toBeNull();
  expect(protectedMarkup()).toEqual(baseline);
  expect(handlers.onView).not.toHaveBeenCalled(); expect(handlers.onSearch).not.toHaveBeenCalled();
});

test('native Vendor refresh retains the chosen quarter while dates are unavailable, then shows refreshed dates', async () => {
  const {props} = await render();
  await click(buttonNamed('Q2')); await click(buttonNamed('Next quarter'));
  const expected = 'Q3 2026';
  await act(async () => root.render(<BrawndoAdditionalVendors {...props} loading acceptedRefresh={null}/>));
  expect(container.querySelector('.qpt-year strong').textContent).toBe(expected);
  expect(container.querySelector('.quarterly-program-timeline').textContent).toContain('Dates unavailable');
  await act(async () => root.render(<BrawndoAdditionalVendors {...props} acceptedRefresh="2026-10-18T16:01:00Z"/>));
  expect(container.querySelector('.qpt-year strong').textContent).toBe(expected);
  expect(container.querySelector('.quarterly-program-timeline').textContent).toContain('No saved dates in this quarter.');
  await click(buttonNamed('This quarter'));
  expect(container.querySelector('.qpt-year strong').textContent).toBe('Q4 2026');
});

test('the three chart-local Coming up entries use the same exact native destinations', async () => {
  const {handlers} = await render();
  const entries = [...container.querySelectorAll('.qpt-coming > button')];
  expect(entries).toHaveLength(3);
  expect(entries.map(node => node.dataset.eventId)).toEqual([
    'assurance:native-vendor:native-assurance', 'review:native-assurance-review', 'review:native-contract-review',
  ]);
  for (const entry of entries) await click(entry);
  expect(handlers.onOpen.mock.calls).toEqual([[vendor, 'assurance']]);
  expect(handlers.onOpenReview.mock.calls.map(args => args[0])).toEqual([assurance, contract]);
  expect(document.querySelector('.qpt-selector')).toBeNull();
  expect(handlers.onView).not.toHaveBeenCalled(); expect(handlers.onSearch).not.toHaveBeenCalled();
});
