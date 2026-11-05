import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import CisReviewsConcept from './CisReviewsConcept';

let root,container;
const rows=Array.from({length:5},(_,index)=>({client_id:'fixture',review_id:`review-${index}`,
  current_occurrence_id:`occ-${index}`,title:`Saved Review ${index}`,status:'upcoming',
  due_date:'2026-11-29',recurrence:['monthly','quarterly','semiannual','annual','none'][index]}));
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent===text);
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-24T12:00:00Z'));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});
const render=props=>act(async()=>root.render(<CisReviewsConcept rows={rows} scopeKey="fixture" {...props}/>));

test('five saved occurrences share one date and keep individual tooltip/list identities and exact native opening',async()=>{
  const onOpenReview=jest.fn();await render({onOpenReview});
  const dots=[...container.querySelectorAll('.review-dot')];expect(dots).toHaveLength(5);
  expect(container.querySelectorAll('.date-group')).toHaveLength(1);
  expect(dots.every(dot=>dot.textContent==='')).toBe(true);
  await act(async()=>dots[3].focus());expect(container.querySelector('[role="tooltip"]').textContent).toContain('Saved Review 3');
  await act(async()=>dots[3].click());
  const list=document.querySelector('[role="dialog"]');expect(list).not.toBeNull();
  expect(list.querySelectorAll('.date-review')).toHaveLength(5);
  expect(list.querySelector('.highlight').textContent).toContain('Saved Review 3');
  await act(async()=>list.querySelector('.highlight').click());
  expect(onOpenReview).toHaveBeenCalledWith(rows[3]);
});

test.each([['upcoming','Upcoming','Not started'],['in_progress','In progress','In progress'],['not_started','Not started','Not started'],
  ['needs_scheduling','Needs scheduling','Needs scheduling'],['custom_status','custom status','custom status'],['__proto__','  proto  ','  proto  '],
  ['constructor','constructor','constructor'],['toString','toString','toString']])(
  'tooltip retains its status and date list displays execution for %s without changing the native record',async(status,label,executionLabel)=>{
    const record={...rows[0],status},before=JSON.stringify(record),onOpenReview=jest.fn();
    await render({rows:[record],onOpenReview});
    const dot=container.querySelector('.review-dot');expect(dot).not.toBeNull();
    await act(async()=>dot.focus());
    expect(container.querySelector('.tip-meta').textContent.endsWith(`· ${label}`)).toBe(true);
    await act(async()=>dot.click());
    const entry=document.querySelector('[role="dialog"] .date-review');expect(entry).not.toBeNull();
    expect([...entry.querySelectorAll('.list-details span')].pop().textContent).toBe(executionLabel);
    await act(async()=>entry.click());
    expect(onOpenReview).toHaveBeenCalledWith(record);expect(JSON.stringify(record)).toBe(before);
  });

test.each([['2026-10-23','1 day overdue'],['2026-10-24','Due today'],['2026-10-25','In 1 day']])(
  'date popup separates unstarted execution from the %s due indicator',async(due_date,dueLabel)=>{
    const record={...rows[0],due_date},before=JSON.stringify(record);
    await render({rows:[record]});
    await act(async()=>container.querySelector('.review-dot').click());
    const entry=document.querySelector('[role="dialog"] .date-review');
    expect([...entry.querySelectorAll('.list-details span')].pop().textContent).toBe('Not started');
    expect(entry.querySelector('.due-badge').textContent).toBe(dueLabel);
    expect(container.querySelector('.agenda-switch').textContent).toContain('Upcoming');
    expect(JSON.stringify(record)).toBe(before);
  });

test.each(['data','agenda'])('quarter %s list and its shortcuts retain their established labels',async(type)=>{
  const before=JSON.stringify(rows);await render();
  expect(container.querySelector('.agenda-switch').textContent).toContain('Upcoming 5');
  expect(container.querySelector('.agenda-all').textContent).toBe('View all 5 upcoming reviews →');
  await act(async()=>type==='data'?button('View data').click():container.querySelector('.agenda-all').click());
  const entries=[...document.querySelectorAll('[role="dialog"] .date-review')];
  expect(entries).toHaveLength(5);
  expect(entries.map(entry=>[...entry.querySelectorAll('.list-details span')].pop().textContent)).toEqual(Array(5).fill('Upcoming'));
  expect(JSON.stringify(rows)).toBe(before);
});

test('quarter and cadence filter presentation without changing records, and Today appears only in current quarter',async()=>{
  await render();expect(container.querySelector('.today-line')).not.toBeNull();
  await act(async()=>button('Monthly').click());expect(container.querySelectorAll('.review-dot')).toHaveLength(1);
  expect(container.querySelector('.agenda-switch').textContent).toContain('Upcoming 5');
  await act(async()=>container.querySelector('[aria-label="Next quarter"]').click());
  expect(container.querySelector('.today-line')).toBeNull();expect(container.querySelectorAll('.review-dot')).toHaveLength(0);
  await act(async()=>button('This quarter').click());expect(container.querySelectorAll('.review-dot')).toHaveLength(5);
  expect(rows.map(row=>row.due_date)).toEqual(Array(5).fill('2026-11-29'));
});

test('completed occurrences stay out of unresolved agenda and context changes close stale lists',async()=>{
  const onOpenReview=jest.fn();await render({rows:[...rows,{...rows[0],review_id:'complete',status:'completed',due_date:'2026-10-01'}],onOpenReview});
  expect(container.querySelectorAll('.review-dot')).toHaveLength(5);
  await act(async()=>container.querySelector('.review-dot').click());expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await render({scopeKey:'different',rows:[],onOpenReview});
  expect(document.querySelector('[role="dialog"]')).toBeNull();expect(container.querySelector('.review-dot')).toBeNull();
  expect(onOpenReview).not.toHaveBeenCalled();
});

test('unavailable data withholds dots, agenda commands and list entry without fabricated totals',async()=>{
  await render({available:false});expect(container.querySelector('.review-dot')).toBeNull();
  expect(container.querySelector('.agenda-entry')).toBeNull();
  expect(button('View data').disabled).toBe(true);expect(container.querySelector('.agenda-switch').textContent).toContain('Upcoming —');
  expect(container.textContent).toContain('Review dates unavailable.');
  expect(container.textContent).not.toContain('records are loading');
});
