import {
  currentQuarter,shiftQuarter,quarterToday,quarterTimelineBounds,quarterTimelineGroups,isOverdue,quarterlyChartScope,
  quarterlyReviewEvents,quarterlyActionEvents,quarterlyRiskEvents,QUARTERLY_REVIEW_LEGEND,QUARTERLY_ACTION_LEGEND,
} from './quarterlyProgramTimeline';
import {calendarDay} from './managementDates';
import {localCalendarDate} from './calendarView';
import {unifiedActions} from './brawndoActions';
import {cisClient} from '../testUtils/cisExperience';

const q1={year:2028,quarter:1},q2={year:2028,quarter:2};
const event=(id,date,kind='monthly',title=id)=>({id,date,kind,title,label:'Saved date'});
const task=(id,overrides={})=>({client_id:'a',task_id:id,title:id,due_date:'2028-04-12',priority:'medium',status:'open',...overrides});
const risk=(id,overrides={})=>({client_id:'a',risk_id:id,display_id:id,title:id,status:'assessed',...overrides});

test('chart state scope is stable for equivalent membership but resets for actor, client, mode or native program changes',()=>{
  const user={user_id:'u',role:'platform_admin',client_ids:['b','a'],workspace_mode:'standard'},client=cisClient('a',1);
  const before=JSON.stringify({user,client}),scope=quarterlyChartScope(user,'standard',client);
  expect(quarterlyChartScope({...user,client_ids:['a','b']},'standard',client)).toBe(scope);
  for(const [actor,mode,current] of [
    [{...user,user_id:'other'},'standard',client],[{...user,role:'client_readonly'},'standard',client],
    [{...user,client_ids:['a']},'standard',client],[{...user,workspace_mode:'demo'},'demo',client],
    [user,'standard',cisClient('b',1)],[user,'standard',cisClient('a',2)],
    [user,'standard',{...client,onboarding_baseline:{completed:true,requirements:{'iso-27001':'applies'}}}],
  ])expect(quarterlyChartScope(actor,mode,current)).not.toBe(scope);
  expect(JSON.stringify({user,client})).toBe(before);
});

test.each([
  [2027,2,31,1],[2027,3,1,2],[2027,5,30,2],[2027,6,1,3],
  [2027,8,30,3],[2027,9,1,4],[2027,11,31,4],[2028,0,1,1],
])('current quarter matches native Calendar local date at %s/%s/%s', (year,month,day,quarter)=>{
  const now=new Date(year,month,day,23,59,59);
  expect(currentQuarter(now)).toEqual({year,quarter});
  expect(quarterToday(now)).toBe(calendarDay(localCalendarDate(now)));
});

test('local Calendar day, not UTC instant, determines the quarter at timezone boundaries',()=>{
  const now=new Date('2028-04-01T00:30:00Z');
  // Simulate the same instant's native western-local Calendar getters, independent of Jest's TZ.
  jest.spyOn(now,'getFullYear').mockReturnValue(2028);
  jest.spyOn(now,'getMonth').mockReturnValue(2);
  jest.spyOn(now,'getDate').mockReturnValue(31);
  expect(currentQuarter(now)).toEqual({year:2028,quarter:1});
  expect(quarterToday(now)).toBe(calendarDay('2028-03-31'));
  expect(now.toISOString()).toBe('2028-04-01T00:30:00.000Z');
});

test('quarter navigation crosses year boundaries without fixed example-year limits',()=>{
  expect(shiftQuarter({year:2027,quarter:4},1)).toEqual({year:2028,quarter:1});
  expect(shiftQuarter(q1,-1)).toEqual({year:2027,quarter:4});
  expect(shiftQuarter(q1,48)).toEqual({year:2040,quarter:1});
  expect(shiftQuarter({year:2040,quarter:1},-48)).toEqual(q1);
});

test.each([
  [1,'2028-01-01','2028-04-01'],[2,'2028-04-01','2028-07-01'],
  [3,'2028-07-01','2028-10-01'],[4,'2028-10-01','2029-01-01'],
])('Q%s uses start-inclusive, next-start-exclusive bounds', (quarter,first,next)=>{
  const bounds=quarterTimelineBounds({year:2028,quarter});
  expect(bounds.start).toBe(calendarDay(first));expect(bounds.end).toBe(calendarDay(next));
  expect(bounds.months).toHaveLength(3);expect(bounds.position(first)).toBe(0);expect(bounds.position(next)).toBe(100);
  const last=new Date((bounds.end-1)*86400000).toISOString().slice(0,10);
  expect(quarterTimelineGroups([event('first',first),event('last',last),event('next',next)],{year:2028,quarter}).events.map(row=>row.id)).toEqual(['first','last']);
});

test('leap day and literal timestamp/date-only deadlines do not shift quarter membership',()=>{
  const model=quarterTimelineGroups([
    event('leap','2028-02-29'),event('last','2028-03-31T23:30:00-07:00'),
    event('next','2028-04-01T00:30:00+14:00'),event('bad','2028-02-30'),
    event('missing',null),event('no-id','2028-01-02'),
  ].map(row=>row.id==='no-id'?{...row,id:null}:row),q1);
  expect(model.events.map(row=>row.id)).toEqual(['leap','last']);
  expect(model.groups.map(group=>group.date)).toEqual(['2028-02-29','2028-03-31']);
  expect(quarterTimelineGroups([event('not-leap','2027-02-29')],{year:2027,quarter:1}).events).toEqual([]);
});

test('exact day and category groups total unique members, with stable title/ID ties and no collapsed dates',()=>{
  const first=event('id-b','2028-04-12','monthly','A'),second=event('id-a','2028-04-12T00:00:00Z','monthly','A');
  const events=[first,second,...Array.from({length:3},(_,i)=>event('z'+i,'2028-04-12','monthly','Z'+i)),
    event('quarter','2028-04-12','quarterly'),event('later','2028-04-13','monthly'),first];
  const before=JSON.stringify(events),model=quarterTimelineGroups(events,q2);
  expect(model.events).toHaveLength(7);expect(model.groups).toHaveLength(3);
  const same=model.groups.find(group=>group.id==='2028-04-12:monthly');
  expect(same.events).toHaveLength(5);expect(same.events.slice(0,2).map(row=>row.id)).toEqual(['id-a','id-b']);
  expect(same.events[1]).toBe(first);expect(model.groups.find(group=>group.kind==='quarterly').point).toBe(same.point);
  expect(model.groups.find(group=>group.date==='2028-04-13').events[0].id).toBe('later');
  expect(JSON.stringify(events)).toBe(before);
});

test('five same-date cadence groups and a large dataset retain every identity before bounded presentation',()=>{
  const events=QUARTERLY_REVIEW_LEGEND.map(({kind},i)=>event('cadence'+i,'2028-04-12',kind));
  events.push(...Array.from({length:500},(_,i)=>event('bulk'+i,`2028-05-${String(i%31+1).padStart(2,'0')}`,'annual')));
  const model=quarterTimelineGroups(events,q2);
  expect(model.events).toHaveLength(505);
  expect(model.groups.filter(group=>group.date==='2028-04-12')).toHaveLength(5);
  expect(new Set(model.groups.flatMap(group=>group.events.map(row=>row.id))).size).toBe(505);
  expect(quarterTimelineGroups(events,{year:2040,quarter:1}).groups).toEqual([]);
});

test('overdue styling follows actual open work, not a past date or completed occurrence alone',()=>{
  const now=new Date(2028,3,13,12),past=event('past','2028-04-12');
  expect(isOverdue(past,now)).toBe(true);
  expect(isOverdue({...past,date:'2028-04-13'},now)).toBe(false);
  for(const status of ['done','completed','cancelled','closed','retired'])expect(isOverdue({...past,status},now)).toBe(false);
  expect(isOverdue({...past,historical:true},now)).toBe(false);
  expect(isOverdue({...past,overdueEligible:false},now)).toBe(false);
  expect(isOverdue({...past,date:null},now)).toBe(false);
  expect(isOverdue({...past,kind:'expiry',record:{status:'accepted'}},now)).toBe(true);
});

test('Review cadence is the actual native cadence and current occurrence identity is preserved without projection',()=>{
  const rows=['monthly','quarterly','semiannual','annual','custom','none',null].map((recurrence,i)=>({
    client_id:'a',review_id:'r'+i,current_occurrence_id:'saved'+i,title:'Review '+i,status:'upcoming',due_date:'2028-04-12',recurrence,
  }));
  const before=JSON.stringify(rows),events=quarterlyReviewEvents(rows);
  expect(events.map(row=>row.kind)).toEqual(['monthly','quarterly','semiannual','annual','other','other','other']);
  expect(events[2]).toMatchObject({id:'review:r2:saved2',occurrenceId:'saved2',kind:'semiannual'});
  expect(events[0].record).toBe(rows[0]);expect(JSON.stringify(rows)).toBe(before);
  expect(quarterlyReviewEvents([{...rows[1],due_date:null}])).toEqual([]);
  expect(QUARTERLY_REVIEW_LEGEND.map(row=>row.shape)).toEqual(['circle','diamond','square','triangle','hexagon']);
});

test('historical Review chart members retain the saved title/cadence/date/evidence and native read-only opener',()=>{
  const execution={review_id:'r',client_id:'a',occurrence_id:'past',title:'Original quarterly review',
    recurrence:'quarterly',due_date:'2028-04-12',status:'completed',period:'Q2 2028',evidence:[{evidence_id:'proof',sha256:'recorded-checksum'}]};
  const review={review_id:'r',client_id:'a',current_occurrence_id:'current',title:'Renamed annual review',
    recurrence:'annual',due_date:'2029-04-12',status:'upcoming',occurrences:[execution]};
  const before=JSON.stringify(review),events=quarterlyReviewEvents([review]),saved=events.find(row=>row.historical);
  expect(saved).toMatchObject({id:'review:r:past',date:'2028-04-12',title:'Original quarterly review',kind:'quarterly',
    label:'Completed Review occurrence',occurrenceId:'past',status:'completed',historical:true});
  expect(saved.record._review).toBe(review);expect(saved.record._execution).toBe(execution);
  expect(saved.record.recurrence).toBe('quarterly');expect(saved.record.evidence).toBe(execution.evidence);
  expect(isOverdue(saved,new Date(2030,0,1))).toBe(false);
  expect(quarterTimelineGroups(events,q2).events).toEqual([saved]);
  expect(events.find(row=>!row.historical)).toMatchObject({id:'review:r:current',kind:'annual',title:'Renamed annual review'});
  expect(JSON.stringify(review)).toBe(before);
});

test('saved cancelled/legacy history is not given current cadence, new identities, missing dates or future cycles',()=>{
  const old={review_id:'r',client_id:'a',occurrence_id:'old',due_date:'2028-04-12',status:'cancelled',title:'Cancelled saved review'};
  const review={review_id:'r',client_id:'a',title:'Current monthly',current_occurrence_id:'current',status:'upcoming',
    recurrence:'monthly',due_date:'2028-06-12',occurrences:[old,{...old},
      {...old,occurrence_id:'missing-due',due_date:null},{...old,occurrence_id:null},
      {...old,occurrence_id:'foreign-client',client_id:'b'},{...old,occurrence_id:'foreign-review',review_id:'other'}]};
  const events=quarterlyReviewEvents([review]),historical=events.filter(row=>row.historical);
  expect(events).toHaveLength(2);expect(historical).toHaveLength(1);
  expect(historical[0]).toMatchObject({id:'review:r:old',kind:'other',detail:'Cadence not recorded',label:'Cancelled Review occurrence'});
  expect(historical[0].record.recurrence).toBeUndefined();expect(historical[0].record._execution).toBe(old);
  expect(quarterTimelineGroups(events,{year:2029,quarter:1}).events).toEqual([]);
});

test('current and retained terminal occurrences deduplicate by exact native occurrence identity',()=>{
  const review={review_id:'r',client_id:'a',title:'Current',current_occurrence_id:'same',status:'upcoming',
    recurrence:'annual',due_date:'2028-04-12',occurrences:[{review_id:'r',client_id:'a',occurrence_id:'same',title:'Stored duplicate',status:'completed',due_date:'2028-04-12'}]};
  const current=quarterlyReviewEvents([review]);
  expect(current).toHaveLength(1);expect(current[0].record).toBe(review);expect(current[0].historical).toBeUndefined();
  const closed={...review,status:'completed'};
  const historical=quarterlyReviewEvents([closed]);
  expect(historical).toHaveLength(1);expect(historical[0].record._execution).toBe(review.occurrences[0]);
  const terminalOnly={...review,occurrences:[],current_occurrence_id:'terminal',status:'cancelled'};
  expect(quarterlyReviewEvents([terminalOnly])).toEqual([expect.objectContaining({id:'review:r:terminal',historical:true,status:'cancelled'})]);
});

test('each actual linked Action keeps its own date and priority; Finding severity cannot replace either',()=>{
  const records={findings:[{client_id:'a',finding_id:'f',title:'Gap',status:'in_remediation',severity:'critical',due_date:'2028-06-01',primary_task_id:'low'}],
    tasks:[task('low',{finding_id:'f',priority:'low'}),task('high',{finding_id:'f',priority:'high',due_date:'2028-05-10'})]};
  const rows=unifiedActions(records,'a'),before=JSON.stringify(rows),events=quarterlyActionEvents(rows);
  expect(events.map(row=>[row.id,row.kind,row.date])).toEqual([
    ['a:action:low','low','2028-04-12'],['a:action:high','high','2028-05-10'],
  ]);
  expect(events[1].record).toBe(rows[0]);expect(events[1].task).toBe(records.tasks[1]);
  expect(JSON.stringify(rows)).toBe(before);expect(QUARTERLY_ACTION_LEGEND.map(row=>row.label)).toEqual(['Low','Medium','High','Critical','Unclassified']);
});

test('retained unsupported priorities and Finding-only/ambiguous deadlines remain honestly Unclassified',()=>{
  const records={tasks:['informational','immediate','moderate',null].map((priority,i)=>task('legacy'+i,{priority})),
    findings:[{client_id:'a',finding_id:'orphan',title:'Unassigned gap',status:'open',severity:'critical',due_date:'2028-04-12'},
      {client_id:'a',finding_id:'multiple',title:'Ambiguous',status:'open',severity:'high',due_date:'2028-04-13'}]};
  records.tasks.push(task('one',{finding_id:'multiple',priority:'medium'}),task('two',{finding_id:'multiple',priority:'critical'}));
  const rows=unifiedActions(records,'a'),events=quarterlyActionEvents(rows);
  for(const value of ['informational','immediate','moderate'])expect(events.find(row=>row.task?.priority===value)).toMatchObject({kind:'unclassified',detail:`Action priority: ${value}`});
  expect(events.find(row=>row.id==='a:finding:orphan')).toMatchObject({kind:'unclassified',label:'Finding due'});
  expect(events.find(row=>row.id==='a:finding:multiple').detail).toContain('Multiple Actions');
  expect(events.find(row=>row.id==='a:action:one').kind).toBe('medium');
  expect(events.find(row=>row.id==='a:action:two').kind).toBe('critical');
  expect(events.filter(row=>row.kind==='unclassified')).toHaveLength(6);
});

test('closed/missing Action deadlines stay absent while saved pending-validation work is never marked overdue',()=>{
  const records={tasks:[task('done',{status:'done'}),task('cancelled',{status:'cancelled'}),task('missing',{due_date:null}),
    task('validation',{finding_id:'f',status:'done'})],
    findings:[{client_id:'a',finding_id:'f',title:'Validate',status:'remediated',primary_task_id:'validation'}]};
  const events=quarterlyActionEvents(unifiedActions(records,'a'));
  expect(events).toHaveLength(1);expect(events[0].id).toBe('a:action:validation');
  expect(events[0].detail).toContain('validation pending');expect(isOverdue(events[0],new Date(2028,5,1))).toBe(false);
});

test('Risk saved dates remain browsable outside the old horizon and distinct event types preserve native destinations',()=>{
  const accepted=risk('r',{status:'accepted',next_review:'2027-03-31',acceptance_expires_at:'2028-04-12'});
  const action=task('t',{due_date:'2030-04-12'}),before=JSON.stringify({accepted,action});
  const result=quarterlyRiskEvents([accepted],{r:[action]});
  expect(result.events.map(row=>[row.kind,row.date])).toEqual([
    ['review','2027-03-31'],['expiry','2028-04-12'],['action','2030-04-12'],
  ]);
  expect(result.events[0].record).toBe(accepted);expect(result.events[2].record).toBe(action);
  expect(result.events[1].label).toBe('Acceptance expires');
  expect(quarterTimelineGroups(result.events,{year:2030,quarter:2}).events[0].record).toBe(action);
  expect(JSON.stringify({accepted,action})).toBe(before);
});

test('same-date Risk review, treatment and acceptance remain separate while shared Action identities deduplicate',()=>{
  const rows=[risk('r',{next_review:'2028-04-12',status:'accepted',acceptance_expires_at:'2028-04-12'}),risk('second')];
  const action=task('shared'),result=quarterlyRiskEvents(rows,{r:[action],second:[action]});
  const model=quarterTimelineGroups(result.events,q2);
  expect(model.groups.map(group=>group.kind).sort()).toEqual(['action','expiry','review']);
  expect(model.events).toHaveLength(3);expect(result.conflictingActions).toEqual([]);
});

test('conflicting/stale, foreign, closed and undated Risk links cannot fabricate an obligation',()=>{
  const rows=[risk('one',{next_review:null}),risk('two'),risk('closed',{status:'closed',next_review:'2028-04-12'})];
  const result=quarterlyRiskEvents(rows,{one:[task('conflict'),task('foreign',{client_id:'b'}),task('done',{status:'done'}),task('missing',{due_date:null})],
    two:[task('conflict',{due_date:'2028-05-10'})],closed:[task('closed-risk')]});
  expect(result.events).toEqual([]);expect(result.conflictingActions).toEqual(['a:action:conflict']);
});
