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
  return Object.fromEntries([['cards', '.cv-kpis'], ['register', '[aria-label="Vendor register"]']].map(([key, selector]) => {
    const node = container.querySelector(selector), copy = node.cloneNode(true);
    // A portal may hide an ancestor rather than the card itself; the background must still be hidden.
    expect(!!node.closest('[aria-hidden="true"]')).toBe(modalOpen);
    copy.removeAttribute('data-aria-hidden');copy.removeAttribute('aria-hidden');
    return [key, copy.outerHTML];
  }));
}

test('quarter/year and readable date-list interactions leave global cards and register unchanged', async () => {
  const {handlers} = await render();
  const baseline = protectedMarkup();
  for (const control of ['Q2', 'Previous quarter', 'Next quarter', 'Q4']) {
    await click(buttonNamed(control));expect(protectedMarkup()).toEqual(baseline);
  }
  const marker = container.querySelector('.cv-event-dot');
  expect(container.querySelectorAll('.cv-event-dot')).toHaveLength(6);
  await click(marker);
  expect(document.querySelectorAll('.cv-list-items>button')).toHaveLength(4);
  expect(protectedMarkup(true)).toEqual(baseline);
  await click(buttonNamed('Close'));
  await act(async () => jest.advanceTimersByTime(20));
  expect(document.querySelector('.cv-event-list')).toBeNull();
  expect(document.activeElement).toBe(marker);
  expect(protectedMarkup()).toEqual(baseline);
  for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
});

test.each([
  ['review:isolated-client:native-review:occ_native-review', 'review', review],
  ['review:isolated-client:native-assurance-review:occ_native-assurance-review', 'review', assurance],
  ['assurance:isolated-client:native-vendor:native-assurance', 'vendor', 'assurance'],
  ['review:isolated-client:native-contract-review:occ_native-contract-review', 'review', contract],
  ['date:isolated-client:native-vendor:contract_renewal', 'vendor', 'contract'],
  ['date:isolated-client:native-vendor:contract_notice_deadline', 'vendor', 'contract'],
])('readable Vendor selector keeps exact native event destination: %s', async (eventId, source, target) => {
  const {handlers} = await render();
  const baseline = protectedMarkup();
  await click(container.querySelector(`.cv-event-dot[data-event-id="${eventId}"]`));
  expect(handlers.onOpen).not.toHaveBeenCalled();expect(handlers.onOpenReview).not.toHaveBeenCalled();
  await click(document.querySelector(`.cv-list-items>[data-event-id="${eventId}"]`));
  if (source === 'review') {
    expect(handlers.onOpenReview).toHaveBeenCalledTimes(1);expect(handlers.onOpenReview.mock.calls[0][0]).toBe(target);expect(handlers.onOpen).not.toHaveBeenCalled();
  } else {
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);expect(handlers.onOpen.mock.calls[0][0]).toBe(vendor);expect(handlers.onOpen.mock.calls[0][1]).toBe(target);expect(handlers.onOpenReview).not.toHaveBeenCalled();
    if(target==='assurance')expect(handlers.onOpen.mock.calls[0][2]).toBe('native-assurance');
  }
  expect(protectedMarkup(true)).toEqual(baseline);
  expect(handlers.onView).not.toHaveBeenCalled();expect(handlers.onSearch).not.toHaveBeenCalled();
});

test('native record roundtrip retains the exact date list and restores its opener on close', async () => {
  const {props,handlers} = await render();
  const marker = container.querySelector('.cv-event-dot');
  await click(marker);
  const ids = [...document.querySelectorAll('.cv-list-items>button')].map(node=>node.dataset.eventId);
  await click(document.querySelector('.cv-list-items>button'));
  expect(handlers.onOpen).toHaveBeenCalledTimes(1);
  await act(async()=>root.render(<BrawndoAdditionalVendors {...props} recordOpen/>));
  expect(document.querySelector('.cv-event-list')).toBeNull();
  await act(async()=>root.render(<BrawndoAdditionalVendors {...props} recordOpen={false}/>));
  expect([...document.querySelectorAll('.cv-list-items>button')].map(node=>node.dataset.eventId)).toEqual(ids);
  await click(buttonNamed('Close'));
  await act(async()=>jest.advanceTimersByTime(20));
  expect(document.activeElement).toBe(marker);
});

test('native refresh retains selected quarter while dates unavailable, then returns actual dates', async () => {
  const {props} = await render();
  await click(buttonNamed('Q2'));await click(buttonNamed('Next quarter'));
  await act(async () => root.render(<BrawndoAdditionalVendors {...props} loading acceptedRefresh={null}/>));
  expect(container.querySelector('.cv-quarter-controls strong').textContent).toBe('Q3 2026');
  expect(container.querySelector('.cv-quarter').textContent).toContain('Dates unavailable');
  await act(async () => root.render(<BrawndoAdditionalVendors {...props} acceptedRefresh="2026-10-18T16:01:00Z"/>));
  expect(container.querySelector('.cv-quarter-controls strong').textContent).toBe('Q3 2026');
  expect(container.querySelector('.cv-quarter').textContent).toContain('No saved events in Q3 2026');
  await click(buttonNamed('This quarter'));expect(container.querySelectorAll('.cv-event-dot')).toHaveLength(6);
});

test('three agenda entries open a readable list before native work; independent same-date obligations retained', async () => {
  const {handlers}=await render();
  expect(container.querySelectorAll('.cv-agenda-entry')).toHaveLength(3);
  await click(container.querySelector('.cv-agenda-entry'));
  expect(document.querySelectorAll('.cv-list-items>button')).toHaveLength(1);
  expect(handlers.onOpen).not.toHaveBeenCalled();expect(handlers.onOpenReview).not.toHaveBeenCalled();
  await click(document.querySelector('.cv-list-items>button'));
  expect(handlers.onOpen.mock.calls[0].slice(0,2)).toEqual([vendor,'assurance']);
  expect(handlers.onView).not.toHaveBeenCalled();expect(handlers.onSearch).not.toHaveBeenCalled();
});


test('local midnight refreshes global overdue counts and open-list urgency without changing saved work', async () => {
  jest.setSystemTime(new Date(2026, 9, 18, 23, 59, 59));
  const datedVendor = {...vendor, next_review: null, contract_renewal: null, contract_notice_deadline: null, assurance_records: []};
  const datedReview = {...review, due_date: '2026-10-18'};
  const before = JSON.stringify({datedVendor, datedReview});
  await render({rows: [datedVendor], reviews: [datedReview]});
  const due = [...container.querySelectorAll('.cv-kpis button')].find(node => node.textContent.includes('Due in 30 days'));
  expect(due.textContent).toContain('1 item');
  await click(due);
  expect(document.querySelector('.cv-list-items').textContent).toContain('Due today');
  await act(async () => jest.advanceTimersByTime(1100));
  expect(document.querySelector('.cv-list-items').textContent).toContain('1 day overdue');
  const overdue = [...container.querySelectorAll('.cv-kpis button')].find(node => node.textContent.includes('Overdue'));
  expect(overdue.textContent).toContain('1 item');
  expect(due.textContent).toContain('0 items');
  expect(JSON.stringify({datedVendor, datedReview})).toBe(before);
});
