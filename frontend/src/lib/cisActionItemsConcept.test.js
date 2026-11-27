import {ACTION_CONCEPT_PRIORITIES,actionConceptPriority,actionConceptEvents,actionConceptUrgency,actionConceptQuarter} from './cisActionItemsConcept';
import {unifiedActions} from './brawndoActions';

const task=(id,extra={})=>({client_id:'client',task_id:id,title:'Saved action',due_date:'2026-10-24',status:'open',priority:'medium',...extra});
const rows=tasks=>unifiedActions({tasks},'client');
const now=new Date(2026,9,24,12);

test('priority aliases follow native ranks and unknown priorities remain truthful and neutral',()=>{
  expect(ACTION_CONCEPT_PRIORITIES.map(priority=>priority.color)).toEqual(['#199681','#2f66c6','#b38131','#b43c55']);
  expect(actionConceptPriority('moderate')).toEqual(actionConceptPriority('medium'));
  expect(actionConceptPriority('immediate')).toEqual(actionConceptPriority('critical'));
  expect(actionConceptPriority('informational')).toMatchObject({key:'unclassified',label:'Informational'});
  expect(actionConceptPriority('unexpected')).toMatchObject({key:'unclassified',label:'Unclassified (unexpected)'});
  expect(actionConceptPriority(null).label).toBe('Unclassified');
});

test('projection keeps distinct saved identities beyond pagination without fabricating Finding deadlines',()=>{
  const tasks=Array.from({length:51},(_,i)=>task(String(i)));
  tasks.push(task('undated',{due_date:null}),task('done',{status:'done'}),task('cancelled',{status:'cancelled'}));
  const records=unifiedActions({tasks,findings:[{client_id:'client',finding_id:'finding',title:'Only finding',due_date:'2026-10-25',severity:'critical',status:'open'}]},'client');
  const before=JSON.stringify(records),events=actionConceptEvents([...records,records[0]]);
  expect(events).toHaveLength(51);expect(new Set(events.map(event=>event.id)).size).toBe(51);
  expect(events.every(event=>event.priority.key==='medium')).toBe(true);
  expect(events[0].task).toBe(tasks[0]);expect(events[0].record).toBe(records.find(record=>record.primary===tasks[0]));
  expect(JSON.stringify(records)).toBe(before);
  expect(actionConceptEvents([...rows([task('same')]),...unifiedActions({tasks:[task('same',{client_id:'other'})]},'other')])).toHaveLength(2);
});

test('pending validation retains primary Action deadline and its own priority, separate from Finding severity',()=>{
  const primary=task('primary',{finding_id:'f',status:'done',priority:'low'});
  const records=unifiedActions({tasks:[primary],findings:[{client_id:'client',finding_id:'f',primary_task_id:'primary',status:'remediated',severity:'critical'}]},'client');
  expect(actionConceptEvents(records)[0]).toMatchObject({task:primary,kind:'low',status:'pending_validation',taskStatus:'done'});
  expect(actionConceptEvents(unifiedActions({tasks:[primary],findings:[{...records[0].finding,status:'closed'}]},'client'))).toEqual([]);
});

test.each([
  ['2026-10-23','overdue','1 day overdue'],['2026-10-24','today','Due today'],
  ['2026-10-25','week','In 1 day'],['2026-10-31','week','In 7 days'],
  ['2026-11-01','fortnight','In 8 days'],['2026-11-08','fortnight','In 15 days'],
  ['2026-11-09','month','In 16 days'],['2026-11-23','month','In 30 days'],
  ['2026-11-24','later','In 31 days'],['2026-02-30','unscheduled','Unscheduled'],
  [null,'unscheduled','Unscheduled'],
])('urgency %s matches native local calendar boundaries',(date,className,text)=>{
  expect(actionConceptUrgency(date,now)).toEqual({className,text});
});

test('quarter groups same date across priorities and retains every endpoint, lane member and deterministic tie',()=>{
  const tasks=[task('z',{due_date:'2026-12-31'}),task('first',{due_date:'2026-10-01'}),
    ...Array.from({length:5},(_,i)=>task('same'+i,{priority:i%2?'high':'low'})),
    task('next',{due_date:'2027-01-01'}),task('invalid',{due_date:'2026-11-31'})];
  const events=actionConceptEvents(rows(tasks)),model=actionConceptQuarter(events,{year:2026,quarter:4},now);
  expect(model.events).toHaveLength(7);expect(model.groups).toHaveLength(3);
  expect(model.groups[0].point).toBe(0);expect(model.groups[2].point).toBe(100);
  expect(model.groups[1].events.map(event=>event.task.task_id)).toEqual(['same0','same1','same2','same3','same4']);
  expect(model.upcoming).toHaveLength(6);expect(model.overdue).toHaveLength(1);
  expect(model.todayPoint).toBeGreaterThan(0);
  expect(actionConceptQuarter(events,{year:2027,quarter:1},now).todayPoint).toBeNull();
  expect(actionConceptQuarter(events,{year:2026,quarter:3},now).todayPoint).toBeNull();
  expect(actionConceptUrgency('2026-10-24T00:30:00+14:00',now).className).toBe('today');
});
