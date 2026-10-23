import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import QuarterlyProgramTimeline,{packQuarterGroups} from './QuarterlyProgramTimeline';
import {QUARTERLY_REVIEW_LEGEND} from '@/lib/quarterlyProgramTimeline';

let root,container,bounds,scope;
const saved=(id,date='2026-12-15',kind='monthly',extra={})=>({id,date,kind,title:`Saved ${id}`,label:'Review due',record:{review_id:id,client_id:'client-one',status:'open'},...extra});
const click=button=>act(async()=>button.click());
const button=text=>[...container.querySelectorAll('button')].find(node=>node.textContent===text||node.getAttribute('aria-label')===text);
const frame=()=>act(async()=>jest.advanceTimersByTime(20));
const render=props=>act(async()=>root.render(<QuarterlyProgramTimeline scopeKey={scope} chartKey="reviews" legend={QUARTERLY_REVIEW_LEGEND} {...props}/>));
async function selectMember(id){await click(container.querySelector('.qpt-event'));await click(document.querySelector(`.qpt-selection-row[data-event-id="${id}"]`));}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();jest.setSystemTime(new Date('2026-12-15T12:00:00'));
  scope=`actor:standard:client-one:${expect.getState().currentTestName}`;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  const original=Element.prototype.getBoundingClientRect;
  bounds=jest.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(){return this.classList?.contains('qpt-plot')?{width:700,height:220,left:0,right:700,top:0,bottom:220}:original.call(this);});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();bounds.mockRestore();jest.useRealTimers();});

test('exact date/category numbered groups retain unique members and count1 also opens the centered native selector',async()=>{
  const events=[saved('one'),saved('two'),saved('two'),saved('different','2026-12-15','quarterly'),saved('next','2027-01-01')],onOpen=jest.fn(),original=JSON.stringify(events);
  await render({events,onOpen});
  expect(container.querySelectorAll('.qpt-lane')).toHaveLength(3);
  expect(container.querySelectorAll('.qpt-event')).toHaveLength(2);
  expect(container.querySelector('[data-group-id="2026-12-15:monthly"] .qpt-symbol>b').textContent).toBe('2');
  expect(container.querySelector('[data-group-id="2026-12-15:quarterly"] .qpt-symbol>b').textContent).toBe('1');
  const single=container.querySelector('[data-group-id="2026-12-15:quarterly"]');await click(single);
  expect(document.querySelector('[role="dialog"]').classList.contains('qpt-selector')).toBe(true);
  expect(document.querySelectorAll('.qpt-selection-row')).toHaveLength(1);
  expect(onOpen).not.toHaveBeenCalled();
  await click(document.querySelector('.qpt-selection-row'));expect(onOpen).toHaveBeenCalledWith(events[3]);
  expect(document.querySelector('.qpt-selector')).toBeNull();expect(JSON.stringify(events)).toBe(original);
  await click(button('View data'));expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
});

test('quarter/year navigation changes only chart-local events and manual windows survive native return and date rollover',async()=>{
  const events=[saved('q4'),saved('q1','2027-01-01'),saved('q2','2027-04-01'),saved('future','2028-12-31')];
  await render({events});expect(container.querySelector('.qpt-year').textContent).toContain('Q4 2026');
  await click(button('Next quarter'));expect(container.querySelector('.qpt-year').textContent).toContain('Q1 2027');
  expect(container.querySelectorAll('.qpt-coming button')).toHaveLength(1);expect(container.querySelector('.qpt-coming').textContent).toContain('Saved q1');
  await click(button('Q2'));expect(container.querySelector('.qpt-year').textContent).toContain('Q2 2027');
  await render({events,recordOpen:true});await render({events,recordOpen:false});expect(container.querySelector('.qpt-year').textContent).toContain('Q2 2027');
  await act(async()=>{jest.setSystemTime(new Date('2028-01-01T12:00:00'));window.dispatchEvent(new Event('focus'));});
  expect(container.querySelector('.qpt-year').textContent).toContain('Q2 2027');
  await click(button('This quarter'));expect(container.querySelector('.qpt-year').textContent).toContain('Q1 2028');
  await click(button('Previous quarter'));expect(container.querySelector('.qpt-year').textContent).toContain('Q4 2027');
});

test.each(['2027-03-31','2027-06-30','2027-09-30','2027-12-31'])('This quarter refreshes through local midnight after %s and background return',async date=>{
  jest.setSystemTime(new Date(`${date}T23:59:59`));await render({});
  const before=container.querySelector('.qpt-year').textContent;
  await act(async()=>jest.advanceTimersByTime(1100));expect(container.querySelector('.qpt-year').textContent).not.toBe(before);
  const next=new Date();next.setMonth(next.getMonth()+3);
  await act(async()=>{jest.setSystemTime(next);document.dispatchEvent(new Event('visibilitychange'));});
  expect(button('This quarter').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('.qpt-year').textContent).toContain(`Q${Math.floor(next.getMonth()/3)+1} ${next.getFullYear()}`);
});

test('same-scope route remount remembers only a manual chart window and a different identity clears it',async()=>{
  await render({});await click(button('Next quarter'));expect(container.querySelector('.qpt-year').textContent).toContain('Q1 2027');
  await act(async()=>{root.unmount();root=createRoot(container);});await render({});
  expect(container.querySelector('.qpt-year').textContent).toContain('Q1 2027');
  await render({scopeKey:'another-actor:standard:client-one'});expect(container.querySelector('.qpt-year').textContent).toContain('Q4 2026');
  await render({});expect(container.querySelector('.qpt-year').textContent).toContain('Q4 2026');
});

test('five same-date categories stay separate in bounded lanes and every overflow member remains reachable',async()=>{
  const events=QUARTERLY_REVIEW_LEGEND.map(item=>saved(item.kind,'2026-12-15',item.kind));await render({events});
  expect(container.querySelectorAll('.qpt-lane')).toHaveLength(3);expect(container.querySelectorAll('.qpt-event')).toHaveLength(3);
  expect(container.querySelector('.qpt-overflow').textContent).toContain('2 groups (2 items)');
  await click(container.querySelector('.qpt-overflow'));expect(document.querySelectorAll('.qpt-selection-row')).toHaveLength(2);
  const overflowTitles=[...document.querySelectorAll('.qpt-selection-row strong')].map(node=>node.textContent);
  const visibleLabels=[...container.querySelectorAll('.qpt-event')].map(node=>node.dataset.groupId.split(':')[1]);
  expect(new Set([...visibleLabels.map(kind=>`Saved ${kind}`),...overflowTitles])).toHaveProperty('size',5);
  await click(document.querySelector('[aria-label="Close item selection"]'));await frame();expect(document.activeElement).toBe(container.querySelector('.qpt-overflow'));
});

test('density packing never combines dates/categories, overlaps within a lane, loses a group or grows rows',()=>{
  const groups=Array.from({length:200},(_,i)=>({id:`group-${i}`,point:i%25*4,events:[saved(`event-${i}`)]}));
  const {lanes,overflow}=packQuarterGroups(groups,3,300);
  expect(lanes).toHaveLength(3);expect(new Set([...lanes.flat(),...overflow].map(group=>group.id))).toHaveProperty('size',200);
  lanes.forEach(lane=>lane.forEach((group,i)=>lane.slice(i+1).forEach(other=>expect(Math.abs(group.point-other.point)/100*300).toBeGreaterThanOrEqual(84))));
  expect(packQuarterGroups(groups,3,0).overflow).toHaveLength(200);
});

test('native entry closes the selector before capture and delayed opening retains the connected originating marker',async()=>{
  let resolve,invoker;const opening=new Promise(done=>{resolve=done;}),events=[saved('native')];
  const onOpen=jest.fn(()=>{invoker=document.activeElement;expect(document.querySelector('.qpt-selector')).toBeNull();return opening;});
  await render({events,onOpen});const trigger=container.querySelector('.qpt-event');await selectMember('native');expect(invoker).toBe(trigger);
  await frame();await frame();await render({events:[...events],onOpen,recordOpen:true});await act(async()=>resolve());
  const nativeButton=document.createElement('button');document.body.appendChild(nativeButton);await act(async()=>{nativeButton.focus();nativeButton.remove();});
  await render({events:[...events],onOpen,recordOpen:false});await frame();expect(document.activeElement).toBe(trigger);
});

test.each(['actor-two:standard:client-one','actor:demo:client-one','actor:standard:client-two'])('a changed actor/mode/client disconnects the captured invoker and prevents cross-scope focus: %s',async nextScope=>{
  const events=[saved('scoped')],onOpen=jest.fn();await render({events,onOpen});const trigger=container.querySelector('.qpt-event');await selectMember('scoped');
  await render({events,onOpen,recordOpen:true});const other=document.createElement('button');document.body.appendChild(other);await act(async()=>other.focus());
  await render({events,onOpen,scopeKey:nextScope,recordOpen:false});await frame();expect(trigger.isConnected).toBe(false);expect(document.activeElement).toBe(other);other.remove();
});

test('native removal uses the current safe fallback and refused openings do not capture later unrelated closes',async()=>{
  const events=[saved('remove')],onOpen=jest.fn(async()=>undefined);await render({events,onOpen});const trigger=container.querySelector('.qpt-event');await selectMember('remove');await frame();expect(document.activeElement).toBe(trigger);
  await render({events,onOpen,recordOpen:true});const other=document.createElement('button');document.body.appendChild(other);await act(async()=>other.focus());
  await render({events,onOpen,recordOpen:false});await frame();expect(document.activeElement).toBe(other);other.remove();
  await selectMember('remove');await render({events,onOpen,recordOpen:true});await render({events:[],onOpen,recordOpen:false});await frame();expect(document.activeElement).toBe(button('View data'));
});

test('completed and explicitly non-overdue past events retain dates without a false late warning',async()=>{
  const events=[saved('done','2026-12-01','monthly',{status:'done'}),saved('legal','2026-12-02','quarterly',{overdueEligible:false}),saved('open','2026-12-03','annual')];
  await render({events});const coming=[...container.querySelectorAll('.qpt-coming>button')];
  expect(coming[0].textContent).toContain('days ago');expect(coming[1].textContent).toContain('days ago');expect(coming[2].textContent).toContain('days late');
  expect(container.querySelectorAll('.qpt-event.qpt-overdue')).toHaveLength(1);
});

test('unavailable state exposes no events and disables View data rather than claiming an empty saved quarter',async()=>{
  await render({events:[saved('hidden')],available:false});expect(container.querySelectorAll('.qpt-event')).toHaveLength(0);expect(container.textContent).toContain('Dates unavailable');expect(button('View data').disabled).toBe(true);
});

test('a removed selection cannot open stale data and Escape returns to the connected marker',async()=>{
  const events=[saved('old')],onOpen=jest.fn();await render({events,onOpen});const trigger=container.querySelector('.qpt-event');await click(trigger);
  await act(async()=>document.querySelector('.qpt-selector').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await frame();expect(document.querySelector('.qpt-selector')).toBeNull();expect(document.activeElement).toBe(trigger);
  await click(trigger);await render({events:[],onOpen});await frame();
  expect(document.querySelector('.qpt-selector')).toBeNull();expect(onOpen).not.toHaveBeenCalled();expect(document.activeElement).toBe(button('View data'));
});

test('a rescheduled event does not restore focus to an old date/category marker that now represents other records',async()=>{
  const events=[saved('moving'),saved('stays')],onOpen=()=>{};
  await render({events,onOpen});const originalTrigger=container.querySelector('.qpt-event');await selectMember('moving');await render({events,onOpen,recordOpen:true});
  await render({events:[saved('moving','2026-12-31'),saved('stays')],onOpen,recordOpen:false});await frame();
  expect(originalTrigger.isConnected).toBe(true);expect(document.activeElement).toBe(button('View data'));
});

test('an overflow event moving onto the plot does not restore focus to the still-connected overflow button',async()=>{
  const events=QUARTERLY_REVIEW_LEGEND.map(item=>saved(item.kind,'2026-12-15',item.kind)),onOpen=()=>{};
  await render({events,onOpen});const originalOverflow=container.querySelector('.qpt-overflow');await click(originalOverflow);
  const row=document.querySelector('.qpt-selection-row'),id=row.dataset.eventId;await click(row);await render({events,onOpen,recordOpen:true});
  await render({events:events.map(event=>event.id===id?{...event,date:'2026-12-31'}:event),onOpen,recordOpen:false});await frame();
  expect(originalOverflow.isConnected).toBe(true);expect(document.activeElement).toBe(button('View data'));
});

test('an open overflow list preserves its clicked IDs through resizing but re-resolves current records and safe native focus',async()=>{
  const events=Array.from({length:5},(_,index)=>saved(`dense-${index}`,`2026-12-${15+index}`));
  let nativeInvoker;const onOpen=jest.fn(()=>{nativeInvoker=document.activeElement;});
  await render({events,onOpen});const origin=container.querySelector('.qpt-overflow');await click(origin);
  const originalIds=[...document.querySelectorAll('.qpt-selection-row')].map(row=>row.dataset.eventId);
  expect(originalIds).toHaveLength(2);
  const currentEvent={...events.find(event=>event.id===originalIds[0]),title:'Current authoritative native title'};
  const currentEvents=[...events.map(event=>event.id===currentEvent.id?currentEvent:event),saved('new-after-click','2026-12-20')];
  bounds.mockImplementation(function(){return this.classList?.contains('qpt-plot')?{width:10000,height:220,left:0,right:10000,top:0,bottom:220}:{width:0,height:0,left:0,right:0,top:0,bottom:0};});
  await act(async()=>window.dispatchEvent(new Event('resize')));await render({events:currentEvents,onOpen});
  expect(origin.isConnected).toBe(false);expect(container.querySelector('.qpt-overflow')).toBeNull();
  expect([...document.querySelectorAll('.qpt-selection-row')].map(row=>row.dataset.eventId)).toEqual(originalIds);
  expect(document.querySelector('.qpt-selector').textContent).toContain('2 items');
  expect(document.querySelector('.qpt-selector').textContent).not.toContain('Saved new-after-click');
  await render({events:currentEvents.filter(event=>event.id!==originalIds[1]),onOpen});
  expect([...document.querySelectorAll('.qpt-selection-row')].map(row=>row.dataset.eventId)).toEqual([currentEvent.id]);
  const chosen=document.querySelector(`.qpt-selection-row[data-event-id="${currentEvent.id}"]`);
  expect(chosen.textContent).toContain(currentEvent.title);await click(chosen);
  expect(onOpen).toHaveBeenCalledWith(currentEvent);expect(nativeInvoker).toBe(button('View data'));
  expect(document.querySelector('.qpt-selector')).toBeNull();
});
