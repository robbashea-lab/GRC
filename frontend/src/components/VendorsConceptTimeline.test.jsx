import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import VendorsConceptTimeline, {VendorsEventList} from './VendorsConceptTimeline';
import {currentQuarter, quarterTimelineBounds} from '@/lib/quarterlyProgramTimeline';

let container, root;
beforeEach(() => {global.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);});
afterEach(async () => {await act(async () => root.unmount()); container.remove();});
const click = node => act(async () => node.click());
const bounds = quarterTimelineBounds(currentQuarter());
const date = new Date((bounds.start + 10) * 86400000).toISOString().slice(0, 10);
const vendor = {client_id: 'c1', vendor_id: 'v1', name: 'Exact vendor'};
const events = [{id: 'r:o1', title: vendor.name, label: 'Vendor review', kind: 'rev', date, vendor, outstanding: true},
  {id: 'a1', title: vendor.name, label: 'Assurance follow-up', kind: 'asr', date, vendor, outstanding: true}];

test('individual same-date circles and date list retain both identities; quarter and legend never write records', async () => {
  const onSelect = jest.fn(), before = JSON.stringify(events);
  await act(async () => root.render(<VendorsConceptTimeline events={events} onSelect={onSelect}/>));
  expect(container.querySelectorAll('.cv-event-dot')).toHaveLength(2);
  await click(container.querySelector('.cv-event-dot'));
  expect(onSelect.mock.calls[0][0].map(event => event.id)).toEqual(['r:o1', 'a1']);
  await click(container.querySelector('[aria-label="Show assurance follow-up events"]'));
  expect(container.querySelectorAll('.cv-event-dot')).toHaveLength(1);
  expect(container.querySelector('.cv-date-label').getAttribute('aria-label')).toMatch(/: 1 item$/);
  await click(container.querySelector('[aria-label="Next quarter"]'));
  expect(container.querySelectorAll('.cv-event-dot')).toHaveLength(0);
  await click([...container.querySelectorAll('button')].find(button => button.textContent === 'This quarter'));
  expect(container.querySelectorAll('.cv-event-dot')).toHaveLength(1);
  expect(JSON.stringify(events)).toBe(before);
});

test('complete readable list sends the current exact event to the native opener and withdraws unavailable work', async () => {
  const onOpen = jest.fn(), props = {selection: {ids: events.map(event => event.id), title: 'Saved work'}, events, users: [], available: true, onOpen, onClose: jest.fn()};
  await act(async () => root.render(<VendorsEventList {...props}/>));
  expect(document.querySelectorAll('.cv-list-items>button')).toHaveLength(2);
  await click(document.querySelector('.cv-list-items>button'));
  expect(onOpen).toHaveBeenCalledWith(events[0]);
  await act(async () => root.render(<VendorsEventList {...props} available={false}/>));
  expect(document.querySelectorAll('.cv-list-items>button')).toHaveLength(0);
  expect(document.body.textContent).toContain('Dates unavailable');
});


test('manual quarter survives a same-scope native route return but never crosses actor context', async () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 25, 12));
  const onSelect = jest.fn();
  try {
    await act(async () => root.render(<VendorsConceptTimeline scopeKey="actor-a:client-a:demo:ig1" events={[]} onSelect={onSelect}/>));
    await click(container.querySelector('[aria-label="Next quarter"]'));
    expect(container.querySelector('.cv-quarter-controls strong').textContent).toBe('Q1 2027');
    await act(async () => root.render(null));
    await act(async () => root.render(<VendorsConceptTimeline scopeKey="actor-a:client-a:demo:ig1" events={[]} onSelect={onSelect}/>));
    expect(container.querySelector('.cv-quarter-controls strong').textContent).toBe('Q1 2027');
    await act(async () => root.render(<VendorsConceptTimeline scopeKey="actor-b:client-a:demo:ig1" events={[]} onSelect={onSelect}/>));
    expect(container.querySelector('.cv-quarter-controls strong').textContent).toBe('Q4 2026');
    expect(onSelect).not.toHaveBeenCalled();
  } finally {await act(async () => root.render(null)); jest.useRealTimers();}
});

test('current quarter rolls over at local midnight while manual browsing remains stable until This quarter', async () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 11, 31, 23, 59, 59));
  const onSelect = jest.fn();
  try {
    await act(async () => root.render(<VendorsConceptTimeline scopeKey="clock:client-a:demo:ig1" events={[]} onSelect={onSelect}/>));
    expect(container.querySelector('.cv-quarter-controls strong').textContent).toBe('Q4 2026');
    await act(async () => jest.advanceTimersByTime(1100));
    expect(container.querySelector('.cv-quarter-controls strong').textContent).toBe('Q1 2027');
    expect(container.querySelector('.cv-today').textContent).toContain('Jan 1');
    await click(container.querySelector('[aria-label="Previous quarter"]'));
    jest.setSystemTime(new Date(2027, 3, 1, 12));
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(container.querySelector('.cv-quarter-controls strong').textContent).toBe('Q4 2026');
    await click([...container.querySelectorAll('button')].find(button => button.textContent === 'This quarter'));
    expect(container.querySelector('.cv-quarter-controls strong').textContent).toBe('Q2 2027');
    expect(onSelect).not.toHaveBeenCalled();
  } finally {await act(async () => root.render(null)); jest.useRealTimers();}
});
