import {calendarDay} from './managementDates';
import {cisReviewEvents,cisReviewQuarter,cisReviewAgenda,cisReviewUrgency,cisReviewCadence,
  cisReviewStatusLabel,formatCisReviewDate,currentQuarter,shiftQuarter,quarterToday,CIS_REVIEW_CADENCES} from './cisReviewsConcept';

const row=(id,due='2026-11-29',extra={})=>({client_id:'client',review_id:id,
  current_occurrence_id:`occ-${id}`,title:'Same review title',due_date:due,status:'upcoming',recurrence:'monthly',...extra});
const q4={year:2026,quarter:4},now=new Date(2026,9,24,23,30);

test('only saved unresolved occurrences enter the presentation without inventing next cycles',()=>{
  const current=row('current'),rows=[current,row('done',undefined,{status:'completed'}),
    row('cancelled',undefined,{status:'cancelled'}),row('invalid','2026-02-30'),
    row('none',null),row(null),row('custom',undefined,{recurrence:'custom',custom_recurrence_days:12})];
  const before=JSON.stringify(rows),events=cisReviewEvents(rows);
  expect(events.map(event=>event.record.review_id)).toEqual(['current','custom']);
  expect(events[0].record).toBe(current);
  expect(events[1].kind).toBe('other');
  expect(JSON.stringify(rows)).toBe(before);
});

test('deduplication uses client, review and exact occurrence, never title/date or framework',()=>{
  const first=row('shared'),rows=[first,{...first,framework_ids:['cis','iso']},
    {...first,current_occurrence_id:'other-occurrence'},{...first,client_id:'other-client'},row('different')];
  const events=cisReviewEvents(rows);
  expect(events).toHaveLength(4);
  expect(new Set(events.map(event=>event.id)).size).toBe(4);
  expect(events.some(event=>event.record===first)).toBe(true);
  expect(cisReviewEvents([row('legacy',undefined,{current_occurrence_id:null})])[0].occurrenceId).toBe('occ_legacy');
});

test('five same-date reviews across cadences share one true date group and retain every circle identity',()=>{
  const rows=['monthly','quarterly','semiannual','annual','custom'].map((recurrence,index)=>row(String(index),undefined,{recurrence}));
  const events=cisReviewEvents([...rows,row('nearby','2026-11-30')]);
  const model=cisReviewQuarter([...events,events[0]],q4);
  expect(model.events).toHaveLength(6);
  expect(model.groups).toHaveLength(2);
  expect(model.groups[0].date).toBe('2026-11-29');
  expect(model.groups[0].events).toHaveLength(5);
  expect(model.groups[0].point).toBe((calendarDay('2026-11-29')-model.start)/(model.end-model.start)*100);
  expect(model.groups[1].point).toBeGreaterThan(model.groups[0].point);
});

test('quarter boundaries retain literal dates, reject invalid dates and do not generate saved work',()=>{
  const events=cisReviewEvents([row('first','2026-10-01'),row('last','2026-12-31T23:30:00-08:00'),
    row('next','2027-01-01T00:30:00+14:00'),row('before','2026-09-30')]);
  expect(cisReviewQuarter(events,q4).events.map(event=>event.record.review_id)).toEqual(['first','last']);
  expect(shiftQuarter(q4,1)).toEqual({year:2027,quarter:1});
  expect(shiftQuarter({year:2027,quarter:1},-1)).toEqual(q4);
  expect(cisReviewQuarter(cisReviewEvents([row('leap','2028-02-29')]),{year:2028,quarter:1}).events).toHaveLength(1);
});

test('agenda includes today as upcoming and keeps quarter selection independent of cadence legend',()=>{
  const events=cisReviewQuarter(cisReviewEvents([row('late','2026-10-23'),row('today','2026-10-24'),
    row('soon','2026-10-25',{recurrence:'annual'}),row('outside','2027-01-02')]),q4).events;
  const agenda=cisReviewAgenda(events,now);
  expect(agenda.overdue.map(event=>event.record.review_id)).toEqual(['late']);
  expect(agenda.upcoming.map(event=>event.record.review_id)).toEqual(['today','soon']);
});

test.each([[-1,'overdue'],[0,'today'],[1,'week'],[7,'week'],[8,'fortnight'],[15,'fortnight'],
  [16,'month'],[30,'month'],[31,'later']])('urgency boundary %s uses %s treatment',(delta,tone)=>{
  const date=new Date((calendarDay('2026-10-24')+delta)*86400000).toISOString();
  expect(cisReviewUrgency(date,now)).toMatchObject({days:delta,tone,className:tone});
});

test('native viewer-local today does not shift literal due dates through UTC',()=>{
  const instant=new Date('2027-01-01T00:30:00Z');
  jest.spyOn(instant,'getFullYear').mockReturnValue(2026);
  jest.spyOn(instant,'getMonth').mockReturnValue(11);
  jest.spyOn(instant,'getDate').mockReturnValue(31);
  expect(currentQuarter(instant)).toEqual(q4);
  expect(quarterToday(instant)).toBe(calendarDay('2026-12-31'));
  expect(cisReviewUrgency('2026-12-31',instant).text).toBe('Due today');
  expect(formatCisReviewDate('2026-12-31T23:30:00-08:00',{year:true})).toBe('Dec 31, 2026');
});

test('placeholders and completed history never gain overdue styling; approved cadence colors are separate',()=>{
  expect(cisReviewStatusLabel(null)).toBe('—');
  expect(cisReviewStatusLabel(undefined)).toBe('—');
  expect(cisReviewStatusLabel('')).toBe('—');
  expect(cisReviewStatusLabel('completed')).toBe('completed');
  expect(cisReviewStatusLabel('cancelled')).toBe('cancelled');
  expect(cisReviewUrgency(null,now)).toMatchObject({days:null,tone:'neutral',text:'Not scheduled'});
  expect(cisReviewUrgency('2026-01-01',now,true)).toMatchObject({tone:'completed',text:'Completed'});
  expect(formatCisReviewDate('bad')).toBe('Not scheduled');
  expect(formatCisReviewDate('2026-11-29',{long:true})).toBe('November 29, 2026');
  expect(CIS_REVIEW_CADENCES.map(item=>item.color)).toEqual(['#2f66c6','#b38131','#199681','#7a6bc2','#77859c']);
  expect(cisReviewCadence(row('custom',undefined,{recurrence:'custom'})).label).toBe('Other');
});
