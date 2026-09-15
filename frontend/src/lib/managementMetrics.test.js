import fixture from './managementScenarios.json';
import {aggregateClientDashboard} from './clientDashboard';
import {dashboardPosture} from './dashboardPosture';
import {managementMetrics,managementProgramStatus} from './managementMetrics';
import {calendarDay,managementDay} from './managementDates';
import {portfolio,dashboard} from '../preview/summaries';

const options={clientId:'a',today:new Date(fixture.today+'T12:00:00Z')};
const model=records=>managementMetrics(aggregateClientDashboard(records,options),options);
test('shared mixed-obligation fixture has exact contributing identities, not just matching totals',()=>{
  const original=JSON.stringify(fixture.records), m=model(fixture.records);
  for(const [key,expected] of Object.entries(fixture.expected))expect(m.metrics[key].map(r=>r.key).sort()).toEqual([...expected].sort());
  expect(JSON.stringify(fixture.records)).toBe(original);
  const dated=['past_due','due_30d','due_31_90d'].flatMap(k=>m.metrics[k].map(r=>r.key));
  expect(new Set(dated).size).toBe(dated.length);
  expect(m.counts).toEqual({past_due:10,due_30d:11,due_31_90d:7,critical_high_open:6,unassigned:2});
});
test('Demo Portfolio, Dashboard API and displayed posture consume the complete same sets',()=>{
  jest.useFakeTimers();jest.setSystemTime(options.today);
  try {
    const db={...fixture.records,clients:[{client_id:'a',name:'Scenario',status:'active'}],users:[],logs:[]};
    const p=portfolio(db,false), d=dashboard(db,{client_id:'a'}), posture=dashboardPosture(aggregateClientDashboard(fixture.records,options),options);
    for(const [key,expected] of Object.entries(fixture.expected)) {
      expect(p.portfolio[key]).toBe(expected.length);
      expect(p.metric_items[key].map(r=>r.key).sort()).toEqual([...expected].sort());
      expect(p.clients[0].metric_items[key]).toEqual(p.metric_items[key]);
      expect(d.management.counts[key]).toBe(expected.length);
    }
    expect(posture.pastDue.map(r=>r.key)).toEqual(model(fixture.records).metrics.past_due.map(r=>r.key));
    expect(posture.due30).toHaveLength(11);expect(posture.due3190).toHaveLength(7);
    expect(p.attention_queue.length).toBeLessThanOrEqual(15);
    expect(p.attention_queue.some(r=>r.entity_type==='finding'&&r.entity_id==='represented')).toBe(false);
  } finally {jest.useRealTimers();}
});
test('more than Top 15 contributes fully; archived clients excluded from totals, own row retained',()=>{
  const tasks=Array.from({length:45},(_,i)=>({client_id:'a',task_id:String(i),title:'Action '+i,due_date:'2026-09-01',status:'open'}));
  const db={clients:[{client_id:'a',name:'Large'},{client_id:'b',name:'Archive',status:'archived'}],tasks:[...tasks,{...tasks[0],client_id:'b'}],users:[],logs:[]};
  const result=portfolio(db,true,options.today);
  expect(result.portfolio.past_due).toBe(45);expect(result.metric_items.past_due).toHaveLength(45);expect(result.attention_queue).toHaveLength(15);
  expect(result.clients.find(c=>c.client_id==='b').past_due).toBe(1);
});
test('completion, reopening and deadline boundary moves update exact populations without writes',()=>{
  const records={tasks:[{task_id:'a',client_id:'a',title:'Move',status:'open',due_date:'2026-09-14'}]};
  expect(model(records).counts.past_due).toBe(1);
  records.tasks[0].status='done';expect(model(records).counts.past_due).toBe(0);
  records.tasks[0].status='open';records.tasks[0].due_date='2026-10-15';expect(model(records).counts.due_30d).toBe(1);
  records.tasks[0].due_date='2026-10-16';expect(model(records).counts.due_31_90d).toBe(1);
  expect(model(records).counts.due_30d).toBe(0);
});
test('date parsing preserves literal due dates and service UTC day across timezone/DST boundaries',()=>{
  expect(managementDay(new Date('2026-09-14T23:30:00-04:00'))).toBe(calendarDay('2026-09-15'));
  expect(calendarDay('2026-09-15T23:30:00-04:00')).toBe(calendarDay('2026-09-15'));
  expect(calendarDay('2026-02-30')).toBeNull();expect(calendarDay('bad')).toBeNull();
  expect(calendarDay('2026-11-02')-calendarDay('2026-11-01')).toBe(1);
});
test('existing attention thresholds and onboarding/archived precedence remain explicit',()=>{
  const empty=model({});expect(managementProgramStatus({status:'active'},empty)).toBe('healthy');
  const populated=model(fixture.records);expect(managementProgramStatus({status:'active'},populated)).toBe('action_required');
  expect(managementProgramStatus({status:'onboarding'},populated)).toBe('onboarding');
  expect(managementProgramStatus({status:'inactive'},populated)).toBe('inactive');
  expect(()=>model({tasks:[{client_id:'b'}]})).toThrow('different client');
});
