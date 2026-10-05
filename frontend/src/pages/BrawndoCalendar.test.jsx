import {calendarEntries,scheduledItems} from './BrawndoCalendar';
const e=(key,date,extra={})=>({key,date,kind:'task',title:key,status:'open',historical:false,...extra});
test('calendarEntries keeps every supported bucket date',()=>{
  expect(calendarEntries({reviews:{'2026-09-01':[{key:'r'}]},tasks:{'2026-09-02':[{key:'t'}]},vendor_dates:{'2026-09-03':[{key:'v'}]}}).map(x=>x.key+x.date)).toEqual(['r2026-09-01','t2026-09-02','v2026-09-03']);
});
test('Scheduled items follows the period, includes completion, and retains old outstanding work once',()=>{
  const entries=[e('old','2020-01-01'),e('late','2026-10-01'),e('done','2026-10-01',{historical:true}),e('today','2026-10-05'),e('next','2026-10-06'),e('outside','2026-11-01'),e('old-done','2020-01-01',{historical:true})];
  const {overdue,scheduled}=scheduledItems(entries,'2026-10-05','2026-10-01','2026-10-31');
  expect(overdue.map(x=>x.key)).toEqual(['old','late']);
  expect(scheduled.map(x=>x.key)).toEqual(['done','today','next']);
  expect(new Set([...overdue,...scheduled].map(x=>x.key)).size).toBe(5);
  expect(scheduledItems(entries,'2026-10-05','2026-10-05','2026-10-05').scheduled.map(x=>x.key)).toEqual(['today']);
});
