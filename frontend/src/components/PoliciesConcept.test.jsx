import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import Policies from './BrawndoAdditionalPolicies';

let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const rows = Object.freeze([
  Object.freeze({policy_id:'approved',client_id:'client',title:'Approved record',status:'approved',approved_at:'2026-01-01'}),
  Object.freeze({policy_id:'draft',client_id:'client',title:'Draft record',status:'draft'}),
  Object.freeze({policy_id:'submitted',client_id:'client',title:'Submitted record',status:'in_review',approval_request_id:'submission'}),
  Object.freeze({policy_id:'missing',client_id:'client',title:'Missing record',status:'draft',presence:'reported_missing'}),
]);

test('three cards preserve Robb-approved native grouping and totals independent of visible rows',async()=>{
  const onView=jest.fn();
  await act(async()=>root.render(<Policies clientId="client" rows={rows} filteredRows={[]} onView={onView}/>));
  expect(container.querySelectorAll('.pc-status-card')).toHaveLength(3);
  expect(container.querySelector('[data-testid="additional-policy-metric-approved"] strong').textContent).toBe('1');
  expect(container.querySelector('[data-testid="additional-policy-metric-awaiting"] strong').textContent).toBe('2');
  expect(container.querySelector('[data-testid="additional-policy-metric-missing"] strong').textContent).toBe('1');
  expect(container.querySelector('.pc-approval-track span').style.width).toBe('25%');
  await act(async()=>container.querySelector('[data-testid="additional-policy-metric-awaiting"]').click());
  expect(onView).toHaveBeenCalledWith('awaiting');
  expect(container.textContent).toContain('Showing 0 of 4 policies');
  expect(container.textContent).toContain('Select a policy to open its record.');
  expect(container.textContent).not.toContain('Interactive concept');
});

test('zero-policy client can open its canonical annual Review, never an individual fallback',async()=>{
  const review=Object.freeze({review_id:'annual',client_id:'client',baseline_key:'policy-review',recurrence:'annual',status:'upcoming',due_date:'2027-02-07',current_occurrence_id:'occurrence'});
  const onOpenReview=jest.fn();
  await act(async()=>root.render(<Policies clientId="client" rows={[]} reviews={[review]} onOpenReview={onOpenReview}/>));
  await act(async()=>container.querySelector('.bapv-link').click());
  expect(onOpenReview).toHaveBeenCalledWith(review);
  await act(async()=>root.render(<Policies clientId="client" rows={rows} reviews={[{...review,policy_id:'draft'}]}/>));
  expect(container.querySelector('.bapv-link')).toBeNull();
  expect(container.querySelector('.bap-review-date strong').textContent).toBe('Not scheduled');
});

test.each([{loading:true},{error:'Request failed'}])('unavailable population never reports zero or full approval: %j',async state=>{
  await act(async()=>root.render(<Policies clientId="client" rows={[]} {...state}/>));
  expect([...container.querySelectorAll('.pc-card-copy strong')].map(node=>node.textContent)).toEqual(['—','—','—']);
  expect(container.querySelector('.pc-approval-track').getAttribute('aria-label')).toBe('Policy status unavailable');
  expect(container.textContent).not.toContain('0 of 0');
  expect(container.querySelector('.bapv-summary').textContent).not.toContain('Showing 0');
});

test('approved compact toolbar keeps native action nodes above register and exact record opening',async()=>{
  const onOpen=jest.fn(),nativeAction=jest.fn();
  await act(async()=>root.render(<Policies rows={rows} onOpen={onOpen} pendingDecisions={<button onClick={nativeAction}>Native pending decision</button>} nativeControls={<button onClick={nativeAction}>Native review timing</button>} rowActions={()=> <button>Native row actions</button>}/>));
  const toolbar=container.querySelector('.pc-native-toolbar');
  expect(toolbar.compareDocumentPosition(container.querySelector('[aria-label="Policy register"]')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await act(async()=>toolbar.querySelector('button').click());expect(nativeAction).toHaveBeenCalledTimes(1);
  await act(async()=>container.querySelector('.bapv-name').click());expect(onOpen).toHaveBeenCalledWith(rows[0]);
  expect(container.querySelectorAll('.bap-row-actions button')).toHaveLength(rows.length);
});
