import {
  RISK_CONCEPT_TYPES,riskDate,riskUrgency,riskConceptFigures,riskConceptQuarter,riskTreatmentRelations,
} from './cisRisksConcept';
import {calendarDay} from './managementDates';
import {riskMatches} from './brawndoRisks';
import {quarterToday,quarterlyRiskEvents} from './quarterlyProgramTimeline';

const now=new Date(2026,9,24,12);
const q4={year:2026,quarter:4};
const risk=(id,fields={})=>({client_id:'a',risk_id:id,display_id:id,title:id,status:'identified',
  likelihood_score:2,impact_score:3,...fields});
const task=(id,fields={})=>({client_id:'a',task_id:id,title:id,status:'open',due_date:'2026-12-18',...fields});

test('saved dates retain their literal calendar date and invalid dates stay truthful',()=>{
  expect(riskDate('2027-01-01T00:30:00+14:00')).toBe('Jan 1, 2027');
  expect(riskDate('2027-01-01T23:30:00-12:00',{year:false})).toBe('Jan 1');
  for(const value of [null,'','not a date','2026-02-31']) {
    expect(riskDate(value)).toBe('Not recorded');
    expect(riskUrgency(value,now)).toEqual({className:'unscheduled',text:'Not scheduled',days:null});
  }
});

test.each([
  [-1,'overdue','1 day overdue'],[0,'today','Due today'],[1,'week','In 1 day'],[7,'week','In 7 days'],
  [8,'fortnight','In 8 days'],[15,'fortnight','In 15 days'],[16,'month','In 16 days'],
  [30,'month','In 30 days'],[31,'later','In 31 days'],
])('urgency uses the native Calendar local day at offset %i',(offset,className,text)=>{
  const date=new Date((quarterToday(now)+offset)*86400000).toISOString().slice(0,10);
  expect(riskUrgency(date,now)).toEqual({className,text,days:offset});
});

test('metric counts retain native upcoming and current-acceptance definitions across quarter browsing',()=>{
  const rows=[
    risk('high',{status:'in_progress',likelihood_score:3,impact_score:4,next_review:'2026-10-24'}),
    risk('next',{next_review:'2026-10-25'}),
    risk('accepted',{status:'accepted',accepted_by:'actor',acceptance_date:'2026-10-01',acceptance_rationale:'Recorded decision',acceptance_expires_at:'2027-03-13'}),
    risk('expired',{status:'accepted',accepted_by:'actor',acceptance_date:'2026-10-01',acceptance_rationale:'Recorded decision',acceptance_expires_at:'2026-10-23'}),
    risk('incomplete',{status:'accepted',acceptance_expires_at:'2027-03-13'}),
    risk('closed',{status:'closed',next_review:'2026-10-25'}),
  ];
  // Noon UTC keeps the existing management UTC metric day explicit in every test timezone.
  const metricNow=new Date('2026-10-24T12:00:00Z');
  const before=JSON.stringify(rows),figures=riskConceptFigures(rows,riskMatches,metricNow);
  expect(figures.map(({id,count})=>[id,count])).toEqual([
    ['all_active',5],['significant',1],['upcoming',1],['accepted',1],
  ]);
  expect(figures[0].detail).toBe('1 in treatment · 1 open · 1 accepted');
  expect(figures[1].detail).toBe('high · score 12');
  expect(figures[2].detail).toBe('Next Oct 24 · high');
  expect(figures[3].detail).toBe('Expires Mar 13');
  const noCurrentAcceptance=(row,view,date)=>view==='accepted'?false:riskMatches(row,view,date);
  expect(riskConceptFigures(rows,noCurrentAcceptance,metricNow)[3].count).toBe(0);
  const {events}=quarterlyRiskEvents(rows,{});
  riskConceptQuarter(events,{year:2027,quarter:1},500,metricNow);
  expect(riskConceptFigures(rows,riskMatches,metricNow)).toEqual(figures);
  expect(JSON.stringify(rows)).toBe(before);
});

test('same-day saved event types remain distinct and shared exact Action identities appear once',()=>{
  const rows=[risk('one',{next_review:'2026-12-18',status:'accepted',acceptance_expires_at:'2026-12-18'}),risk('two')];
  const action=task('shared'),{events}=quarterlyRiskEvents(rows,{one:[action],two:[action]});
  const before=JSON.stringify(events),model=riskConceptQuarter([...events,events[0]],q4,500,now);
  expect(model.events).toHaveLength(3);
  expect(model.groups).toHaveLength(1);
  expect(model.groups[0].items.map(event=>event.kind)).toEqual(['expiry','review','action']);
  expect(model.groups[0]).toMatchObject({date:'2026-12-18',width:69,lane:0});
  expect(model.events.find(event=>event.kind==='action').record).toBe(action);
  expect(new Set(model.events.map(event=>event.id)).size).toBe(3);
  expect(JSON.stringify(events)).toBe(before);
  expect(RISK_CONCEPT_TYPES.map(({kind,color})=>[kind,color])).toEqual([
    ['review','#2f66c6'],['action','#b38131'],['expiry','#199681'],
  ]);
});

test('equal titles and dates preserve distinct identities with deterministic ID ties',()=>{
  const events=[
    {id:'review:b',kind:'review',title:'Same title',date:'2026-12-18'},
    {id:'review:a',kind:'review',title:'Same title',date:'2026-12-18'},
  ];
  expect(riskConceptQuarter(events,q4,500,now).events.map(event=>event.id)).toEqual(['review:a','review:b']);
  expect(events.map(event=>event.id)).toEqual(['review:b','review:a']);
});

test('quarter endpoints are inclusive, positions are proportional and Today is never clamped',()=>{
  const events=[
    {id:'last',kind:'review',date:'2026-12-31'},
    {id:'first',kind:'review',date:'2026-10-01'},
    {id:'outside',kind:'review',date:'2027-01-01'},
    {id:'invalid',kind:'review',date:'2026-11-31'},
  ];
  const model=riskConceptQuarter(events,q4,500,now);
  expect(model.start).toBe(calendarDay('2026-10-01'));
  expect(model.end).toBe(calendarDay('2026-12-31'));
  expect(model.months).toEqual(['2026-10-01','2026-11-01','2026-12-01'].map(calendarDay));
  expect(model.events.map(event=>event.id)).toEqual(['first','last']);
  expect(model.position(model.start)).toBe(18);
  expect(model.position(model.end)).toBe(482);
  expect(model.position((model.start+model.end)/2)).toBe(250);
  expect(model.ticks[0]).toBe(model.start);
  expect(model.ticks[model.ticks.length-1]).toBe(model.end);
  const past=riskConceptQuarter([],{year:2025,quarter:4},500,now);
  const future=riskConceptQuarter([],{year:2027,quarter:1},500,now);
  expect(past.today).toBeGreaterThan(past.end);
  expect(future.today).toBeLessThan(future.start);
  expect(past.today).toBe(quarterToday(now));
  expect(future.today).toBe(past.today);
});

test('nearby dates use independent lanes without shifting dates or dropping dense records',()=>{
  const events=Array.from({length:12},(_,index)=>({id:`event-${index}`,kind:'review',title:`Risk ${index}`,date:`2026-10-${String(index+1).padStart(2,'0')}`}));
  const model=riskConceptQuarter(events,q4,500,now);
  expect(model.events).toHaveLength(12);
  expect(model.groups.map(group=>group.date)).toEqual(events.map(event=>event.date));
  expect(model.groups[0].lane).toBe(0);
  expect(model.groups[1].lane).toBe(1);
  expect(model.height).toBeGreaterThan(190);
  for(const group of model.groups)expect(group.anchor).toBe(model.position(calendarDay(group.date)));
});

test('treatment projection matches all three native relation paths across the complete collection',()=>{
  const rows=[risk('direct',{framework:'cis'}),risk('pointer',{task_id:'pointed',framework:'ai'}),
    risk('list',{related_task_ids:['last'],framework:'vendor'}),risk('unlinked')];
  const tasks=[task('direct',{risk_id:'direct'}),task('pointed'),
    ...Array.from({length:205},(_,index)=>task(`unrelated-${index}`)),task('last')];
  const before=JSON.stringify({rows,tasks}),relations=riskTreatmentRelations(rows,tasks,'a');
  expect(Object.keys(relations)).toEqual(['direct','pointer','list','unlinked']);
  expect(relations.direct).toEqual([tasks[0]]);
  expect(relations.pointer).toEqual([tasks[1]]);
  expect(relations.list).toEqual([tasks[tasks.length-1]]);
  expect(relations.unlinked).toEqual([]);
  expect(JSON.stringify({rows,tasks})).toBe(before);
});

test('conflicting shared Action dates reach native conflict handling without silent selection',()=>{
  const rows=[risk('r')],tasks=[task('shared',{risk_id:'r'}),task('shared',{risk_id:'r',due_date:'2026-12-19'})];
  const relations=riskTreatmentRelations(rows,tasks,'a');
  expect(relations.r).toHaveLength(2);
  const result=quarterlyRiskEvents(rows,relations);
  expect(result.events).toEqual([]);
  expect(result.conflictingActions).toEqual(['a:action:shared']);
});

test('malformed or foreign Action projections report failure rather than silently appearing complete',()=>{
  expect(()=>riskTreatmentRelations([],null,'a')).toThrow('collection');
  expect(()=>riskTreatmentRelations([risk('r')],[],'')).toThrow('identities');
  expect(()=>riskTreatmentRelations([risk('r',{client_id:'b'})],[],'a')).toThrow('identities');
  expect(()=>riskTreatmentRelations([risk('r')],[task('t',{client_id:'b'})],'a')).toThrow('identities');
  expect(()=>riskTreatmentRelations([risk('r')],[task(null)],'a')).toThrow('identities');
  expect(()=>riskTreatmentRelations([risk('r',{related_task_ids:'t'})],[],'a')).toThrow('references');
});
