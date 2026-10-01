import {calendarEntries,needsAttention,calendarTiles} from './BrawndoCalendar';
jest.mock('./BrawndoCalendar.css',()=>({}),{virtual:true});
const today=new Date('2026-09-30T12:00:00');
const e=(key,date,kind='task',extra={})=>({key,date,kind,title:key,status:'open',historical:false,...extra});
const items=[e('b','2026-09-14','finding'),e('a','2026-08-31'),e('c','2026-10-02','finding'),e('d','2026-11-15'),e('h','2026-09-01','review',{historical:true}),e('t','2026-09-30','review')];
test('calendarEntries flattens buckets with bucket date',()=>{
  expect(calendarEntries({reviews:{'2026-09-01':[{key:'r'}]},findings:{},tasks:{'2026-09-02':[{key:'t1'},{key:'t2'}]}}).map(x=>x.key+x.date)).toEqual(['r2026-09-01','t12026-09-02','t22026-09-02']);
});
test('needsAttention: overdue oldest first, then next 30 days, historical excluded',()=>{
  const {overdue,upcoming}=needsAttention(items,today);
  expect(overdue.map(x=>x.key)).toEqual(['a','b']);
  expect(upcoming.map(x=>x.key)).toEqual(['t','c']);
});
test('tiles derive counts and literal context',()=>{
  const month=items.filter(x=>x.date.startsWith('2026-09'));
  const [ov,soon,m,td]=calendarTiles({attention:items,monthEntries:month,anchor:today,today});
  expect([ov.count,ov.context]).toEqual([2,'Oldest: Aug 31 · 30 days late']);
  expect([soon.count,soon.context]).toEqual([1,'c, Oct 2']);
  expect([m.count,m.context]).toEqual([2,'1 overdue · 1 upcoming']);
  expect([td.count,td.context]).toEqual([1,'t']);
  const onlyLate=[e('x','2026-09-02'),e('y','2026-09-03')];
  const t2=calendarTiles({attention:onlyLate,monthEntries:onlyLate,anchor:today,today});
  expect(t2[2].context).toBe('All two are already overdue');expect(t2[3].context).toBe('Nothing due today');expect(t2[1].context).toBe('Nothing due in the next 30 days');
});

test('a Finding with an active Action counts once in Calendar work tiles',()=>{
  const today=new Date(2026,9,1,12);
  const entries=[{kind:'finding',key:'f',title:'F',date:'2026-09-20',represented:true},{kind:'task',key:'t',title:'T',date:'2026-09-25'},{kind:'finding',key:'pv',title:'PV',date:'2026-09-22',represented:false}];
  expect(needsAttention(entries,today).overdue.map(e=>e.key)).toEqual(['pv','t']);
});
