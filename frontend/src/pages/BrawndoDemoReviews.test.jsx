import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoDemoReviews,{BrawndoReviewRows} from './BrawndoDemoReviews';
let root,container;
const review={review_id:'review',client_id:'demo_brawndo',title:'Actual review',status:'in_progress',due_date:'2026-10-31',recurrence:'monthly',owner_id:'owner',occurrences:[{occurrence_id:'completed-original',status:'completed',completed_by:'actor',due_date:'2026-09-30',completed_at:'2026-10-01'}]};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('target workload supports data, hide, keyboard and native summary selection without writes',async()=>{
  const onView=jest.fn();await act(async()=>root.render(<BrawndoDemoReviews rows={[review]} view="all" onView={onView} theme="light"/>));
  const svg=container.querySelector('svg');expect(svg.getAttribute('viewBox')).toBe('0 0 1000 172');
  await act(async()=>svg.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(container.querySelector('.bdr-tip')).toBeTruthy();
  const click=async text=>act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent===text).click());
  await click('View data');expect(container.querySelectorAll('.bdr-data tbody tr')).toHaveLength(12);
  await act(async()=>container.querySelectorAll('.bdr-kcell')[1].click());expect(onView).toHaveBeenCalledWith('overdue');
  await click('Hide chart');expect(container.querySelector('svg')).toBeNull();
});
test('History opens the original review with exact persisted occurrence and actor',async()=>{
  const onOpen=jest.fn();await act(async()=>root.render(<BrawndoReviewRows rows={[review]} users={[{user_id:'actor',name:'Historical actor'}]} checked={new Set()} allChecked={false} toggleAll={()=>{}} toggleOne={()=>{}} history onOpen={onOpen} rowMenu={()=>null}/>));
  expect(container.textContent).toContain('Historical actor');expect(container.textContent).toContain('Actual review');
  await act(async()=>container.querySelector('.bdr-name').click());
  expect(onOpen.mock.calls[0][0]._review).toBe(review);expect(onOpen.mock.calls[0][0]._execution.occurrence_id).toBe('completed-original');
});
test('legacy missing historical dates and actor never inherit latest parent completion',async()=>{
  const row={...review,completed_by:'latest',completed_at:'2026-10-15',completion_date:'2026-10-15',occurrences:[{occurrence_id:'legacy',status:'completed'},{occurrence_id:'cancelled',status:'cancelled'}]};
  await act(async()=>root.render(<BrawndoReviewRows rows={[row]} users={[{user_id:'latest',name:'Latest actor'}]} checked={new Set()} allChecked={false} toggleAll={()=>{}} toggleOne={()=>{}} history onOpen={()=>{}} rowMenu={()=>null}/>));
  expect(container.textContent).not.toContain('Latest actor');expect(container.textContent).toContain('Actor not recorded');expect(container.textContent).toContain('Due date not recorded');expect(container.textContent).toContain('Date not recorded');expect(container.textContent).toContain('Cancelled');
});
test('unavailable summaries use unknown values and keep the chart frame without fabricated zero totals',async()=>{
  await act(async()=>root.render(<BrawndoDemoReviews rows={[]} available={false} view="all" onView={()=>{}} theme="light"/>));
  expect([...container.querySelectorAll('.bdr-kcell strong')].map(node=>node.textContent)).toEqual(['—','—','—','—']);
  expect([...container.querySelectorAll('.bdr-kcell')].every(node=>node.disabled)).toBe(true);expect(container.querySelector('svg')).toBeTruthy();expect(container.querySelector('.bdr-value')).toBeNull();
});

test('genuine native controls remain reachable in the compact result-row disclosure',async()=>{
 const filter=jest.fn();await act(async()=>root.render(<BrawndoReviewRows rows={[review]} users={[]} checked={new Set()} allChecked={false} toggleAll={()=>{}} toggleOne={()=>{}} onOpen={()=>{}} rowMenu={()=>null} controls={<button onClick={filter}>Native status filter</button>}/>));
 const details=container.querySelector('.bdr-more');expect(details.parentElement.className).toBe('bdr-summary');expect(details.open).toBe(false);
 await act(async()=>details.querySelector('summary').click());expect(details.open).toBe(true);
 const control=details.querySelector('button');control.focus();expect(document.activeElement).toBe(control);
 await act(async()=>control.click());expect(filter).toHaveBeenCalledTimes(1);
 expect(container.querySelector('.bdr-name').textContent).toBe('Actual review');
});
