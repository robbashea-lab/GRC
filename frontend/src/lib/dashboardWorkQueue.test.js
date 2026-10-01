import {dashboardPilot,dashboardWorkQueue} from './dashboardWorkQueue';
import {calendarDay} from './managementDates';
import {aggregateClientDashboard} from './clientDashboard';
import {managementMetrics} from './managementMetrics';

const row=(id,due,extra={})=>({key:`tasks:${id}:due`,id,kind:'tasks',owner_id:'u',owner:'Owner',day:calendarDay(due),due_date:due,severity:'low',record:{task_id:id,client_id:'a',title:id,source_type:'manual'},...extra});
test('pilot is limited to the canonical Demo client, never standard mode or a name match',()=>{
  expect(dashboardPilot(true,'demo_brawndo')).toBe(true);
  // Every Demo client, including Dunder and newly created ones, gets the reference dashboard;
  // the live backend (no work_queue contract) and an unselected client do not.
  for(const id of ['demo_prestige','demo_dunder','demo_new_client'])expect(dashboardPilot(true,id)).toBe(true);
  for(const [demo,id] of [[false,'demo_brawndo'],[false,'demo_dunder'],[true,null],[true,''],[false,null]])expect(dashboardPilot(demo,id)).toBe(false);
});
test('same population drives totals and filters; literal days, eligible users and deterministic ordering',()=>{
  const work=[row('today','2026-09-27'),row('30','2026-10-27'),row('31','2026-10-28'),row('old','2026-09-01'),row('critical','2026-09-26',{severity:'critical'}),row('none',null,{owner_id:'disabled'}),row('invalid','2026-02-30')];
  const groups=dashboardWorkQueue({work,activeRecords:{},as_of:'2026-09-27'},new Set(['u']));
  expect(groups.all).toHaveLength(7);
  expect(groups.all.slice(0,2).map(r=>r.id)).toEqual(['old','critical']);
  expect(groups.pastDue.map(r=>r.id)).toEqual(['old','critical']);
  expect(groups.due30.map(r=>r.id)).toEqual(['today','30']);
  expect(groups.unassigned.map(r=>r.id)).toEqual(['none']);
  expect(groups.unassigned[0].owner).toBe('Unassigned');
  expect(groups.all.every(r=>r.source_label==='Manual / Internal')).toBe(true);
  expect(work.find(r=>r.id==='none').owner).toBe('Owner');
});
test('shared lifecycle deduplication keeps pending validation but excludes represented Findings and historical work',()=>{
  const today=new Date('2026-09-27T12:00:00Z');
  const sources={tasks:[{client_id:'a',task_id:'t',title:'Complete review',finding_id:'f',due_date:'2026-09-20',assignee_id:'u',status:'open'}],findings:[
    {client_id:'a',finding_id:'f',title:'Gap',due_date:'2026-09-20',owner_id:'u',status:'open'},
    {client_id:'a',finding_id:'v',title:'Validate',due_date:'2026-09-25',owner_id:'u',status:'remediated'},
    {client_id:'a',finding_id:'closed',title:'Closed',status:'closed'},
    {client_id:'b',finding_id:'other',title:'Other client',status:'open'},
  ],reviews:[{client_id:'a',review_id:'history',title:'Historical',status:'completed',due_date:'2025-01-01'}]};
  expect(()=>aggregateClientDashboard(sources,{clientId:'a',today})).toThrow('different client');
  const aggregation=aggregateClientDashboard({...sources,findings:sources.findings.filter(f=>f.client_id==='a')},{clientId:'a',today});
  const model={...managementMetrics(aggregation,{today}),activeRecords:aggregation.activeRecords};
  const groups=dashboardWorkQueue(model,new Set(['u']));
  expect(groups.all.map(r=>r.id).sort()).toEqual(['t','v']);
  expect(groups.all.find(r=>r.id==='t').source_label).toBe('Gap');
});
test('queue presents remediation once even when a linked Finding has another owner or deadline',()=>{
  const finding={...row('f','2026-09-11'),kind:'findings',status:'in_remediation'};
  const validation={...finding,id:'v',key:'findings:v',status:'remediated'};
  const model={as_of:'2026-09-27',work:[finding,validation,row('t','2026-09-20')],activeRecords:{tasks:[{finding_id:'f'},{finding_id:'v'}]}};
  expect(dashboardWorkQueue(model,new Set(['u'])).all.map(r=>r.id).sort()).toEqual(['t','v']);
});
test('due-soon reviews are not buried under later moderate-priority work',()=>{
  const model={as_of:'2026-09-27',activeRecords:{},work:[row('later','2026-12-01',{severity:'medium'}),row('soon','2026-10-01',{severity:null}),row('high','2026-12-01',{severity:'high'})]};
  expect(dashboardWorkQueue(model,new Set(['u'])).all.map(r=>r.id)).toEqual(['high','soon','later']);
});
test('historical provenance can name a closed source without adding that source to current work',()=>{
  const task=row('t','2026-10-01');task.record={...task.record,source_type:'finding',finding_id:'closed'};
  const model={as_of:'2026-09-27',activeRecords:{},work:[task]};
  const groups=dashboardWorkQueue(model,new Set(['u']),{findings:[{client_id:'a',finding_id:'closed',title:'Retained source',status:'closed'}]});
  expect(groups.all).toHaveLength(1);expect(groups.all[0].source_label).toBe('Retained source');
});
