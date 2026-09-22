import {calendarBuckets,calendarItem,calendarSelection,calendarStatus,canMoveCalendar,rescheduledDate} from './calendarView';
const admin={role:'super_admin'},member={role:'client_contributor'};
const review={review_id:'r',client_id:'a',title:'Access review',status:'upcoming',due_date:'2026-12-31',recurrence:'quarterly',current_occurrence_id:'next'};
const prior={...review,occurrence_id:'prior',due_date:'2026-09-30',status:'completed',completed_at:'2026-10-04'};
const records={reviews:[{...review,occurrences:[prior]}],findings:[{finding_id:'f',client_id:'a',title:'Gap',status:'remediated',due_date:'2026-10-02'}],tasks:[{task_id:'t',client_id:'a',title:'Action',status:'done',due_date:'2026-10-02'}]};
const options={start:'2026-09-01',end:'2026-12-31',scope:'all'};
const flatten=data=>Object.values(data).flatMap(bucket=>Object.values(bucket).flat());
test('active and historical records retain source status, distinct occurrences and scheduled dates',()=>{
  const all=flatten(calendarBuckets(records,admin,options));
  expect(all).toHaveLength(4);expect(new Set(all.map(r=>r.key)).size).toBe(4);
  expect(all.filter(r=>r.kind==='review').map(r=>[r.period,r.status,r.due_date_iso])).toEqual([['Q3 2026','completed','2026-09-30'],['Q4 2026','upcoming','2026-12-31']]);
  expect(new Set(flatten(calendarBuckets(records,admin,{...options,scope:'active'})).map(r=>calendarStatus(r)))).toEqual(new Set(['Pending Validation','Upcoming']));
  expect(flatten(calendarBuckets(records,admin,{...options,scope:'history'})).map(r=>calendarStatus(r))).toEqual(['Completed','Completed']);
  expect(all.filter(r=>r.historical).every(r=>!r.can_reschedule)).toBe(true);
});
test('one-time current and saved occurrence are not duplicated; no foreign embedded snapshot',()=>{
  const row={...review,current_occurrence_id:'prior',due_date:prior.due_date,status:'completed',occurrences:[prior,{...prior,occurrence_id:'foreign',client_id:'b'}]};
  expect(flatten(calendarBuckets({reviews:[row]},admin,options))).toHaveLength(1);
});
test('client contributors cannot move Reviews; source-controlled and terminal dates have no drag permission',()=>{
  expect(canMoveCalendar('review',review,member)).toBe(false);
  expect(canMoveCalendar('review',review,admin)).toBe(true);
  expect(canMoveCalendar('review',{...review,vendor_purpose:'contract'},admin)).toBe(false);
  for(const [kind,status] of [['review','completed'],['review','cancelled'],['finding','closed'],['finding','accepted'],['task','done'],['task','cancelled']])expect(canMoveCalendar(kind,{status},admin)).toBe(false);
  expect(canMoveCalendar('task',{status:'open'},member)).toBe(true);
  expect(canMoveCalendar('finding',{status:'remediated'},{role:'client_viewer'})).toBe(false);
});
test('record selection retains authorized historical occurrence and rejects foreign or unavailable records',()=>{
  const item=calendarItem(prior,'review',admin,true),record=records.reviews[0];
  expect(calendarSelection(item,record,'a')).toEqual({occurrence:prior});
  expect(()=>calendarSelection(item,{...record,client_id:'b'},'a')).toThrow('another client');
  expect(()=>calendarSelection({...item,occurrence_id:'unknown'},record,'a')).toThrow('no longer available');
});
test('date-only boundary, offset-preserving moves, invalid ranges and explicit cap',()=>{
  const data=calendarBuckets(records,admin,{start:'2026-10-02T09:00:00Z',end:'2026-10-02',scope:'all'});
  expect(flatten(data)).toHaveLength(2);
  expect(flatten(calendarBuckets(records,admin,{start:'2026-10-02',end:'2026-10-02'}))).toHaveLength(1);
  expect(rescheduledDate('2026-10-02','2026-10-05')).toBe('2026-10-05');
  expect(rescheduledDate('2026-10-02T23:20:05.123-04:00','2026-10-05')).toBe('2026-10-05T23:20:05.123-04:00');
  expect(()=>calendarBuckets(records,admin,{start:'2026-02-30'})).toThrow('valid Calendar');
  expect(()=>calendarBuckets(records,admin,{start:'2020-01-01',end:'2026-01-01'})).toThrow('valid Calendar');
  expect(()=>calendarBuckets({tasks:Array.from({length:5001},(_,i)=>({...records.tasks[0],task_id:String(i)}))},admin,options)).toThrow('Too many');
});
