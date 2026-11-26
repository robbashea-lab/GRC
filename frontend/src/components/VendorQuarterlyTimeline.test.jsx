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
    return {x:0,y:0,width:1100,height:0,top:0,left:0,right:1100,bottom:0};
  });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  geometry.mockRestore(); global.ResizeObserver = previousObserver; jest.useRealTimers();
});

const click = node => act(async () => {expect(node).toBeTruthy();node.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
// Settle the scheduled animation frame without relying on its timer's phase.
// The separate midnight test advances the calendar clock explicitly.
const frame = () => act(async () => jest.advanceTimersToNextTimer());
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
  return Object.fromEntries([['cards', '[aria-label="Vendor summaries"]'], ['register', '[aria-label="Vendor register"]']].map(([key, selector]) => {
    const node = container.querySelector(selector);expect(node).toBeTruthy();const copy = node.cloneNode(true);
    // A portal may hide an ancestor rather than the card itself; the background must still be hidden.
    expect(!!node.closest('[aria-hidden="true"]')).toBe(modalOpen);
    copy.removeAttribute('data-aria-hidden');copy.removeAttribute('aria-hidden');
    return [key, copy.outerHTML];
  }));
}

const ledger=()=>container.querySelector('[aria-label="Vendor dates"]');
const totals=()=>ledger().querySelector('.ql-totals');
const point=(lane,month,day)=>ledger().querySelector('[data-k="'+lane+'|'+new Date(2026,month-1,day).getTime()+'"]');
const choices=()=>[...ledger().querySelectorAll('.v3-ledger-tip button')];
const viewDataRows=()=>[...ledger().querySelectorAll('.vd tbody tr')];

test('quarter navigation and readable point choices leave global cards and register unchanged',async()=>{
  const {handlers}=await render();const baseline=protectedMarkup();
  await click(buttonNamed('Previous quarter'));await click(buttonNamed('Previous quarter'));
  expect(ledger().querySelector('.v3-quarter-switch b').textContent).toBe('Q2 2026');expect(totals().dataset.total).toBe('0');expect(protectedMarkup()).toEqual(baseline);
  await click(buttonNamed('Next quarter'));expect(ledger().querySelector('.v3-quarter-switch b').textContent).toBe('Q3 2026');
  await click(buttonNamed('This quarter'));expect(totals().dataset.total).toBe('6');
  expect([...ledger().querySelectorAll('.ql-point')].reduce((sum,node)=>sum+Number(node.dataset.count),0)).toBe(6);
  const marker=point('asr',11,5);expect(marker.getAttribute('role')).toBe('button');expect(marker.getAttribute('tabindex')).toBe('0');
  await act(async()=>marker.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  expect(choices()).toHaveLength(2);expect(protectedMarkup()).toEqual(baseline);
  await frame();expect(document.activeElement).toBe(choices()[0]);
  await act(async()=>choices()[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(ledger().querySelector('.v3-ledger-tip')).toBeNull();expect(document.activeElement).toBe(marker);expect(protectedMarkup()).toEqual(baseline);
  for(const handler of Object.values(handlers))expect(handler).not.toHaveBeenCalled();
});

test.each([
  ['review:isolated-client:native-review:occ_native-review','rev',11,5,0,'review',review],
  ['review:isolated-client:native-assurance-review:occ_native-assurance-review','asr',11,5,1,'review',assurance],
  ['assurance:isolated-client:native-vendor:native-assurance','asr',11,5,0,'vendor','assurance'],
  ['review:isolated-client:native-contract-review:occ_native-contract-review','ren',11,5,0,'review',contract],
  ['date:isolated-client:native-vendor:contract_renewal','ren',12,12,0,'vendor','contract'],
  ['date:isolated-client:native-vendor:contract_notice_deadline','ren',11,12,0,'vendor','contract'],
])('approved ledger choice keeps the exact native event destination: %s',async(eventId,lane,month,day,index,source,target)=>{
  const {handlers}=await render();const baseline=protectedMarkup();await click(point(lane,month,day));
  expect(handlers.onOpen).not.toHaveBeenCalled();expect(handlers.onOpenReview).not.toHaveBeenCalled();await click(choices()[index]);
  if(source==='review'){
    expect(handlers.onOpenReview).toHaveBeenCalledTimes(1);expect(handlers.onOpenReview.mock.calls[0][0]).toBe(target);expect(handlers.onOpen).not.toHaveBeenCalled();
  }else{
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);expect(handlers.onOpen.mock.calls[0][0]).toBe(vendor);expect(handlers.onOpen.mock.calls[0][1]).toBe(target);expect(handlers.onOpenReview).not.toHaveBeenCalled();
    if(target==='assurance')expect(handlers.onOpen.mock.calls[0][2]).toBe('native-assurance');
  }
  expect(protectedMarkup()).toEqual(baseline);expect(handlers.onView).not.toHaveBeenCalled();expect(handlers.onSearch).not.toHaveBeenCalled();
});

test('native record roundtrip retains quarter and all independent date choices and restores chart focus after refresh',async()=>{
  const {props,handlers}=await render();const marker=point('asr',11,5);await click(marker);const labels=choices().map(node=>node.textContent);
  await frame();expect(document.activeElement).toBe(choices()[0]);
  await click(choices()[0]);expect(handlers.onOpen.mock.calls[0].slice(0,2)).toEqual([vendor,'assurance']);
  await act(async()=>root.render(<BrawndoAdditionalVendors {...props} recordOpen/>));expect(ledger().querySelector('.v3-ledger-tip')).toBeNull();
  await act(async()=>root.render(<BrawndoAdditionalVendors {...props} recordOpen={false}/>));await frame();
  // A native refresh replaces the SVG nodes. Its explicit heading fallback keeps
  // focus in the same ledger instead of focusing a detached pre-refresh point.
  expect(marker.isConnected).toBe(false);expect(document.activeElement).toBe(ledger().querySelector('h2'));expect(totals().dataset.total).toBe('6');await click(point('asr',11,5));expect(choices().map(node=>node.textContent)).toEqual(labels);
});

test('native refresh retains selected quarter while dates unavailable, then returns actual saved dates',async()=>{
  const {props}=await render();await click(buttonNamed('Previous quarter'));expect(ledger().querySelector('.v3-quarter-switch b').textContent).toBe('Q3 2026');
  await act(async()=>root.render(<BrawndoAdditionalVendors {...props} loading acceptedRefresh={null}/>));
  expect(ledger().querySelector('.v3-quarter-switch b').textContent).toBe('Q3 2026');expect(ledger().querySelector('[role="status"]').textContent).toBe('Dates unavailable.');
  await act(async()=>root.render(<BrawndoAdditionalVendors {...props} acceptedRefresh="2026-10-18T16:01:00Z"/>));
  expect(ledger().querySelector('.v3-quarter-switch b').textContent).toBe('Q3 2026');expect(totals().dataset.total).toBe('0');expect(viewDataRows()).toHaveLength(0);
  await click(buttonNamed('This quarter'));expect(totals().dataset.total).toBe('6');expect(viewDataRows()).toHaveLength(6);
});

test('agenda and readable table retain all six independent obligations including same-day records',async()=>{
  const {handlers}=await render();const before=JSON.stringify({vendor,review,assurance,contract});const list=ledger().querySelectorAll('.tl2-lists > div')[1];
  expect(list.querySelectorAll('.tl-item')).toHaveLength(4);await click(buttonNamed('View all 6 items →'));expect(list.querySelectorAll('.tl-item')).toHaveLength(6);expect(viewDataRows()).toHaveLength(6);
  expect(viewDataRows().map(row=>row.cells[1].textContent)).toEqual(['Assurance follow-up','Assurance follow-up','Contract renewal','Vendor review','Contract renewal','Contract renewal']);
  await click(viewDataRows()[0].querySelector('button'));expect(handlers.onOpen.mock.calls[0].slice(0,3)).toEqual([vendor,'assurance','native-assurance']);expect(handlers.onOpenReview).not.toHaveBeenCalled();
  expect(handlers.onView).not.toHaveBeenCalled();expect(handlers.onSearch).not.toHaveBeenCalled();expect(JSON.stringify({vendor,review,assurance,contract})).toBe(before);
});


test('local midnight refreshes global overdue counts and open-list urgency without changing saved work', async () => {
  jest.setSystemTime(new Date(2026, 9, 18, 23, 59, 59));
  const datedVendor = {...vendor, next_review: null, contract_renewal: null, contract_notice_deadline: null, assurance_records: []};
  const datedReview = {...review, due_date: '2026-10-18'};
  const before = JSON.stringify({datedVendor, datedReview});
  await render({rows: [datedVendor], reviews: [datedReview]});
  const due = container.querySelector('[data-testid="additional-vendor-metric-due30"]');
  expect(due.textContent).toContain('Due in 30 days');
  expect(due.textContent).toContain('1 item');
  await click(due);
  expect(document.querySelector('.cv-list-items').textContent).toContain('Due today');
  await act(async () => jest.advanceTimersByTime(1100));
  expect(document.querySelector('.cv-list-items').textContent).toContain('1 day overdue');
  const overdue = container.querySelector('[data-testid="additional-vendor-metric-overdue"]');
  expect(overdue.textContent).toContain('Overdue');
  expect(overdue.textContent).toContain('1 item');
  expect(due.textContent).toContain('0 items');
  expect(JSON.stringify({datedVendor, datedReview})).toBe(before);
});
