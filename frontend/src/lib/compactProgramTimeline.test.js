import {compactTimelineGroups,reviewTimelineEvents,actionTimelineEvents} from './compactProgramTimeline';
const now=new Date('2026-12-15T12:00:00Z');
test('bounded lanes preserve every real identity, missing dates and exact year-window end',()=>{
 const events=Array.from({length:40},(_,i)=>({id:`item-${i}`,date:'2027-01-31',title:`Item ${i}`}));
 const model=compactTimelineGroups([...events,events[0],{id:'missing',date:null},{id:'invalid',date:'2027-02-30'},{id:'outside',date:'2027-12-16'}],3,now);
 expect(model.lanes).toHaveLength(3);expect(model.lanes.flat().flatMap(group=>group.events)).toEqual(events.slice().sort((a,b)=>a.id.localeCompare(b.id)));
 expect(model.months.find(month=>month.getUTCMonth()===0).getUTCFullYear()).toBe(2027);
 expect(compactTimelineGroups(events,4,now).lanes).toHaveLength(4);
});
test('saved Review occurrence identity and native cadence survive without forecast creation',()=>{
 const rows=[{review_id:'r',current_occurrence_id:'original',title:'Saved review',status:'upcoming',due_date:'2027-01-31',recurrence:'monthly'},{review_id:'done',status:'completed',due_date:'2027-01-31'},{review_id:'missing',status:'needs_scheduling'}];
 const before=JSON.stringify(rows),events=reviewTimelineEvents(rows);
 expect(events).toHaveLength(1);expect(events[0]).toMatchObject({id:'review:r:original',date:'2027-01-31',kind:'monthly',occurrenceId:'original'});expect(events[0].record).toBe(rows[0]);expect(JSON.stringify(rows)).toBe(before);
});
test('Action timeline uses Action priority, not linked Finding severity, and omits closed/missing deadlines',()=>{
 const active={ticketId:'finding:f',title:'Action',priority:'low',due_date:'2027-01-31',actions:[{status:'open'}],primary:{status:'open',priority:'low'},raw:{status:'open'},finding:{severity:'critical',status:'open'}};
 const events=actionTimelineEvents([active,{...active,ticketId:'no-date',due_date:null}]);
 expect(events).toHaveLength(1);expect(events[0].kind).toBe('low');expect(events[0].record).toBe(active);expect(events[0].date).toBe('2027-01-31');
});
