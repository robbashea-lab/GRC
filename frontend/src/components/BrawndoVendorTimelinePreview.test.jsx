import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BrawndoAdditionalVendors from './BrawndoAdditionalVendors';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }));

let root, container, originalObserver, originalFetch;
const callbacks = () => ({ onOpen: jest.fn(), onOpenReview: jest.fn(), onView: jest.fn(), onSearch: jest.fn() });
const documentRecord = Object.freeze({ assurance_id: 'assurance-exact', document_name: 'Recorded assurance document', type: 'SOC 2', review_status: 'received', next_follow_up: '2026-11-05' });
const vendor = Object.freeze({ vendor_id: 'vendor-exact', client_id: 'demo_brawndo', name: 'Linked vendor', status: 'active', service: 'Recorded payroll service', contract_renewal: '2026-12-12', contract_notice_deadline: '2026-11-12', assurance_records: Object.freeze([documentRecord]) });
const fallback = Object.freeze({ vendor_id: 'fallback-exact', client_id: 'demo_brawndo', name: 'Fallback vendor', status: 'onboarding', service: 'Recorded recovery service', next_review: '2026-11-06' });
const review = Object.freeze({ review_id: 'review-exact', client_id: 'demo_brawndo', vendor_id: vendor.vendor_id, title: 'Saved vendor assurance review', vendor_purpose: 'vendor', status: 'upcoming', due_date: '2026-11-05', notes: 'Inspect the returned control evidence.' });
const rows = Object.freeze([vendor, fallback]);
const marker = label => [...container.querySelectorAll('.bav-event')].find(node => node.getAttribute('aria-label').includes(label));
const preview = () => document.querySelector('.bav-event-preview');
const flush = async (milliseconds = 0) => act(async () => { jest.advanceTimersByTime(milliseconds); await Promise.resolve(); });
const pointer = (node, type, values = {}) => {
  const event = new MouseEvent(type, { bubbles: true, clientX: 20, clientY: 20, ...values });
  Object.defineProperty(event, 'pointerType', { value: values.pointerType || 'mouse' });
  node.dispatchEvent(event);
};
const noSideEffects = handlers => {
  for (const method of ['get', 'post', 'patch', 'delete']) expect(api[method]).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
  for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
};

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-18T16:00:00Z'));
  originalObserver = global.ResizeObserver; originalFetch = global.fetch;
  // JSDOM has no layout observer; keep the installed Tooltip behavior and portal real.
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  global.fetch = jest.fn();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  global.ResizeObserver = originalObserver; global.fetch = originalFetch;
  jest.clearAllMocks(); jest.useRealTimers();
});
async function render(handlers, props = {}) {
  await act(async () => root.render(<BrawndoAdditionalVendors rows={rows} reviews={[review]} {...handlers} {...props} />));
  await flush();
}

test.each([
  ['Saved vendor assurance review', 'Linked Review', 'Inspect the returned control evidence.', 'Nov 5, 2026'],
  ['Fallback vendor, Vendor review', 'Vendor review', 'Recorded recovery service', 'Nov 6, 2026'],
  ['Assurance follow-up', 'Assurance follow-up', 'Recorded assurance document · Received', 'Nov 5, 2026'],
  ['Contract renewal', 'Contract renewal', 'Recorded payroll service', 'Dec 12, 2026'],
  ['Notice deadline', 'Notice deadline', 'Recorded payroll service', 'Nov 12, 2026'],
])('focus previews truthful loaded facts and Escape dismisses without operations: %s', async (identity, kind, context, date) => {
  const handlers = callbacks(); await render(handlers);
  const button = marker(identity); expect(button).toBeTruthy();
  expect(button.hasAttribute('title')).toBe(false); expect(button.closest('.bav-lane').hasAttribute('title')).toBe(false);
  await act(async () => button.focus()); await flush();
  expect(preview()).toBeTruthy();
  expect(preview().textContent).toContain(kind); expect(preview().textContent).toContain(context); expect(preview().textContent).toContain(date);
  expect(document.getElementById(button.getAttribute('aria-describedby')).getAttribute('role')).toBe('tooltip');
  expect(preview().textContent).not.toMatch(/last renewed|December 2025|Task|annual/i);
  noSideEffects(handlers);
  await act(async () => button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await flush(); expect(preview()).toBeNull(); expect(document.activeElement).toBe(button);
  noSideEffects(handlers);
});

test('blur, data refresh and unavailable state discard the active preview', async () => {
  const handlers = callbacks(); await render(handlers, { acceptedRefresh: '2026-10-18T16:00:00Z' });
  await act(async () => marker('Contract renewal').focus()); await flush(); expect(preview()).toBeTruthy();
  await act(async () => container.querySelector('input[type="search"]').focus()); await flush(); expect(preview()).toBeNull();
  await act(async () => marker('Contract renewal').focus()); await flush(); expect(preview()).toBeTruthy();
  await render(handlers, { acceptedRefresh: '2026-10-18T16:01:00Z' }); expect(preview()).toBeNull();
  await act(async () => marker('Contract renewal').focus()); await flush(); expect(preview()).toBeTruthy();
  await render(handlers, { error: 'Unavailable' }); expect(preview()).toBeNull();
  noSideEffects(handlers);
});

test('mouse hover previews without operations and transfer into the card keeps it readable', async () => {
  const handlers = callbacks(); await render(handlers);
  const button = marker('Assurance follow-up');
  await act(async () => pointer(button, 'pointermove')); await flush(160);
  expect(preview()).toBeTruthy(); const card = preview();
  await act(async () => { pointer(button, 'pointerleave'); pointer(card, 'pointermove'); }); await flush();
  expect(preview()).toBe(card); noSideEffects(handlers);
  await act(async () => pointer(card, 'pointerleave'));
  await act(async () => pointer(document.body, 'pointermove', { clientX: 1000, clientY: 1000 })); await flush();
  expect(preview()).toBeNull(); noSideEffects(handlers);
});

test.each([
  ['Saved vendor assurance review', 'review', null],
  ['Fallback vendor, Vendor review', 'fallback', 'reviews_tab'],
  ['Assurance follow-up', 'vendor', 'assurance'],
  ['Contract renewal', 'vendor', 'contract'],
  ['Notice deadline', 'vendor', 'contract'],
])('direct activation retains the exact native object and destination: %s', async (identity, source, tab) => {
  const handlers = callbacks(); await render(handlers);
  const button = marker(identity);
  // Touch must not create a preview step; its ordinary click still opens directly.
  await act(async () => pointer(button, 'pointermove', { pointerType: 'touch' })); await flush(160); expect(preview()).toBeNull();
  await act(async () => { pointer(button, 'pointerdown', { pointerType: 'touch' }); pointer(button, 'pointerup', { pointerType: 'touch' }); button.click(); });
  if (source === 'review') { expect(handlers.onOpenReview).toHaveBeenCalledTimes(1); expect(handlers.onOpenReview.mock.calls[0][0]).toBe(review); expect(handlers.onOpen).not.toHaveBeenCalled(); }
  else { expect(handlers.onOpen).toHaveBeenCalledTimes(1); expect(handlers.onOpen.mock.calls[0][0]).toBe(source === 'fallback' ? fallback : vendor); expect(handlers.onOpen.mock.calls[0][1]).toBe(tab); expect(handlers.onOpenReview).not.toHaveBeenCalled(); }
  for (const method of ['get', 'post', 'patch', 'delete']) expect(api[method]).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled(); expect(handlers.onView).not.toHaveBeenCalled(); expect(handlers.onSearch).not.toHaveBeenCalled();
});
