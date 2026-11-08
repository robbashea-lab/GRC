import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {CisActionItemsOverview} from './CisActionItemsConcept';
import {ticketRecords} from '@/lib/remediationTickets';

let root,container;
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
const click=node=>act(async()=>node.click());
const button=label=>[...container.querySelectorAll('button')].find(node=>node.textContent===label||node.getAttribute('aria-label')===label);
const task=(id,priority='medium',date='2026-11-05')=>({task_id:id,client_id:'client',title:`Saved Action ${id}`,priority,due_date:date,status:'open'});
const rows=tasks=>ticketRecords({tasks},'client');
const render=props=>act(async()=>root.render(<CisActionItemsOverview scopeKey="reader:standard:client" {...props}/>));

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-24T12:00:00'));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});

test('complete saved collection retains every circle, same-date identity and native Action priority',async()=>{
  const sameDay=[task('low','low'),task('moderate','moderate'),task('high','high'),task('critical','critical'),task('unknown','legacy')];
  const more=Array.from({length:17},(_,index)=>task(`later-${index}`,'medium',`2026-12-${String(index+1).padStart(2,'0')}`));
  const orphan={finding_id:'no-action',client_id:'client',title:'Finding without Action',severity:'critical',due_date:'2026-11-05',status:'open'};
  const records=ticketRecords({tasks:[...sameDay,...more],findings:[orphan]},'client');
  // A linked Finding's severity must not replace the Action's saved Low priority.
  records[0].finding={severity:'critical',status:'open'};
  await render({rows:records});
  expect(container.querySelectorAll('.review-dot')).toHaveLength(22);
  const group=container.querySelector('[data-date="2026-11-05"]');
  expect(group.querySelectorAll('.review-dot')).toHaveLength(5);
  expect(group.querySelectorAll('.date-label')).toHaveLength(1);
  expect(new Set([...container.querySelectorAll('.review-dot')].map(node=>node.dataset.actionId)).size).toBe(22);
  for(const dot of container.querySelectorAll('.review-dot')){
    expect(dot.textContent).toBe('');expect(dot.querySelectorAll('i.dot')).toHaveLength(1);
  }
  expect(container.querySelector('[data-action-id="low"]').getAttribute('aria-label')).toContain('Low priority');
  expect(container.querySelector('[data-action-id="moderate"]').getAttribute('aria-label')).toContain('Medium priority');
  expect(container.querySelector('[data-action-id="critical"]').getAttribute('aria-label')).toContain('Critical priority');
  expect(container.querySelector('[data-action-id="unknown"]').getAttribute('aria-label')).toContain('Unclassified (legacy)');
  await click(button('View data'));
  expect(document.querySelectorAll('.date-review')).toHaveLength(22);
  expect(document.querySelector('.date-list').textContent).not.toContain('Finding without Action');
});

test('same-date selector highlights the chosen Action and opens its exact saved native identity',async()=>{
  const tasks=Array.from({length:5},(_,index)=>task(`same-${index}`,index===3?'critical':'medium'));
  const onOpen=jest.fn();await render({rows:rows(tasks),onOpen});
  await click(container.querySelector('[data-action-id="same-3"]'));
  expect(onOpen).not.toHaveBeenCalled();
  expect(document.querySelectorAll('.date-review')).toHaveLength(5);
  const selected=document.querySelector('.date-review.highlight');
  expect(selected.querySelector('.list-title').textContent).toBe('Saved Action same-3');
  await click(selected);
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onOpen.mock.calls[0][0].task).toBe(tasks[3]);
  expect(onOpen.mock.calls[0][0].id).toBe('client:action:same-3');
  expect(document.querySelector('.cia-selector')).toBeNull();
});

test('priority selection filters timeline and its list without changing quarter agenda population',async()=>{
  const tasks=[task('first','low'),task('second','high','2026-11-06'),task('third','critical','2026-11-07'),task('fourth','medium','2026-11-08')];
  const original=JSON.stringify(tasks);await render({rows:rows(tasks)});
  const agendaBefore=container.querySelector('.cia-agenda-list').textContent;
  expect(container.querySelector('[data-mode="upcoming"]').textContent).toContain('4');
  await click(button('Show Critical priority actions'));
  expect(container.querySelectorAll('.review-dot')).toHaveLength(1);
  expect(container.querySelector('.review-dot').dataset.actionId).toBe('third');
  expect(container.querySelector('.cia-agenda-list').textContent).toBe(agendaBefore);
  expect(container.querySelector('[data-mode="upcoming"]').textContent).toContain('4');
  await click(button('View data'));
  expect(document.querySelectorAll('.date-review')).toHaveLength(1);
  expect(document.querySelector('.date-review').textContent).toContain('Saved Action third');
  expect(JSON.stringify(tasks)).toBe(original);
});

test('Today appears only in its actual quarter and quarter navigation keeps saved dates unchanged',async()=>{
  const tasks=[task('past','low','2026-09-30'),task('current'),task('future','high','2027-01-01')];
  await render({rows:rows(tasks)});expect(container.querySelectorAll('.today-line')).toHaveLength(1);
  await click(button('Previous quarter'));
  expect(container.querySelector('.today-line')).toBeNull();
  expect(container.querySelector('.review-dot').dataset.actionId).toBe('past');
  await click(button('This quarter'));await click(button('Next quarter'));
  expect(container.querySelector('.today-line')).toBeNull();
  expect(container.querySelector('.review-dot').dataset.actionId).toBe('future');
  await click(button('This quarter'));expect(container.querySelectorAll('.today-line')).toHaveLength(1);
  expect(container.querySelector('.review-dot').dataset.actionId).toBe('current');
});

test('dense endpoint groups retain the same proportional anchor as the quarter axis',async()=>{
  const tasks=['2026-10-01','2026-12-31'].flatMap(date=>Array.from({length:5},(_,index)=>task(`${date}-${index}`,'medium',date)));
  await render({rows:rows(tasks)});
  const groups=[...container.querySelectorAll('.date-group')],axis=[...container.querySelectorAll('.axis-label')];
  expect(groups).toHaveLength(2);
  for(const [index,group] of groups.entries()){
    const anchor=Number.parseFloat(group.style.left)+Number.parseFloat(group.style.width)/2;
    const tick=index===0?axis[0]:axis[axis.length-1];
    expect(anchor).toBeCloseTo(Number.parseFloat(tick.style.left),5);
    expect(group.querySelectorAll('.review-dot')).toHaveLength(5);
  }
});

test('agenda native close returns focus to its own opener and context changes dismiss stale selections',async()=>{
  const records=rows([task('first'),task('second','high','2026-11-06')]),onOpen=jest.fn();
  await render({rows:records,onOpen});
  await click(button('View data'));
  await click(document.querySelector('.cia-selector .button'));
  const origin=container.querySelector('.agenda-entry');
  await click(origin);expect(onOpen.mock.calls[0][0].task.task_id).toBe('first');
  await render({rows:records,onOpen,recordOpen:true});
  await render({rows:records,onOpen,recordOpen:false});
  expect(onOpen.mock.calls[0][1]()).toBe(true);
  expect(document.activeElement).toBe(origin);
  await click(container.querySelector('.review-dot'));
  expect(document.querySelector('.cia-selector')).not.toBeNull();
  await render({rows:[],onOpen,scopeKey:'other-client'});
  expect(document.querySelector('.cia-selector')).toBeNull();
  expect(onOpen).toHaveBeenCalledTimes(1);
});

test('native delayed close returns to View data after saving removes the original opener',async()=>{
  const records=rows([task('saved')]),onOpen=jest.fn();
  await render({rows:records,onOpen});
  const origin=container.querySelector('.agenda-entry');
  await click(origin);const returnFocus=onOpen.mock.calls[0][1];
  await render({rows:records,onOpen,recordOpen:true});
  await render({rows:[],onOpen,recordOpen:false});
  expect(origin.isConnected).toBe(false);
  // Native Radix close-autofocus runs after the page has committed the saved collection.
  setTimeout(returnFocus,0);await act(async()=>jest.advanceTimersByTime(0));
  expect(document.activeElement).toBe(button('View data'));
});

test('native close callback cannot focus a stale scope or a background page under another editor',async()=>{
  const records=rows([task('saved')]),onOpen=jest.fn();
  await render({rows:records,onOpen});await click(container.querySelector('.agenda-entry'));
  const returnFocus=onOpen.mock.calls[0][1];
  await render({rows:records,onOpen,recordOpen:true});
  expect(returnFocus()).toBe(false);
  await render({rows:records,onOpen,recordOpen:false,scopeKey:'other-client'});
  const current=button('View data');current.focus();
  expect(returnFocus()).toBe(false);expect(document.activeElement).toBe(current);
});

test('mobile minimum width drives both dense quarter-end groups and their exact axis anchors',async()=>{
  const tasks=['2026-10-01','2026-12-31'].flatMap(date=>Array.from({length:5},(_,index)=>task(`${date}-${index}`,'medium',date)));
  await render({rows:rows(tasks)});
  const viewport=container.querySelector('.timeline-scroll');
  viewport.getBoundingClientRect=()=>({width:321});
  viewport.style.setProperty('--cia-timeline-min-width','570px');
  await act(async()=>window.dispatchEvent(new Event('resize')));
  const width=Number.parseFloat(container.querySelector('.timeline-inner').style.width);
  expect(width).toBe(570);expect(container.querySelectorAll('.review-dot')).toHaveLength(10);
  const groups=[...container.querySelectorAll('.date-group')],axis=[...container.querySelectorAll('.axis-label')];
  for(const [index,group] of groups.entries()){
    const anchor=Number.parseFloat(group.style.left)+Number.parseFloat(group.style.width)/2;
    expect(anchor).toBeCloseTo(Number.parseFloat((index===0?axis[0]:axis.at(-1)).style.left),5);
    expect(Number.parseFloat(group.style.left)).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(group.style.left)+Number.parseFloat(group.style.width)).toBeLessThanOrEqual(width);
  }
});

test('a rejected native opener reports a safe retry and resolves the current saved Action afresh',async()=>{
  const records=rows([task('retry')]),onOpen=jest.fn().mockRejectedValueOnce(new Error('private diagnostic')).mockResolvedValueOnce(true);
  await render({rows:records,onOpen});
  await click(container.querySelector('.agenda-entry'));
  expect(container.querySelector('[role="alert"]').textContent).toContain('The Action could not be opened');
  expect(container.textContent).not.toContain('private diagnostic');
  await click(button('Retry opening Action'));
  expect(onOpen).toHaveBeenCalledTimes(2);
  expect(onOpen.mock.calls[1][0].task).toBe(records[0].primary);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
