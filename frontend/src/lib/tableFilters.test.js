import { applyTableFilters, calendarDay, columnOptions, dateMatches, EMPTY, reviewMatches } from './tableFilters';
import { tableColumns } from './tableColumns';

const now = new Date(2026, 8, 9, 14);
const filter = (rows, columns, filters, sort) => applyTableFilters(rows,columns,{filters,sort},now);
test.each([
  ['2026-09-08','overdue',true],['2026-09-09','overdue',false],['2026-09-09','today',true],
  ['2026-09-16','next7',true],['2026-09-17','next7',false],['2026-10-09','next30',true],
  ['2026-10-10','next30',false],['2026-10-10','next31_90',true],['2026-12-08','next31_90',true],
  ['2026-12-09','next31_90',false],['2026-08-10','last30',true],['2026-08-09','last30',false],
  ['2025-09-09','last12',true],['2025-09-08','last12',false],['2026-09-10','last90',false],
  [null,EMPTY,true],['bad date',EMPTY,true],[null,'next30',false],
])('calendar date %s with %s yields %s',(date,preset,expected)=>expect(dateMatches(date,preset,now)).toBe(expected));
test('invalid calendar dates are empty rather than normalized deadlines',()=>expect(calendarDay('2026-02-31')).toBeNull());
test('text sort is case-insensitive, numeric-aware, reversible, and leaves nulls last',()=>{
  const rows=[{title:'Zoo'},{title:null},{title:'alpha 10'},{title:'Alpha 2'}];
  const columns=[{key:'title'}];
  expect(filter(rows,columns,{}, {key:'title',dir:'asc'}).map(r=>r.title)).toEqual(['Alpha 2','alpha 10','Zoo',null]);
  expect(filter(rows,columns,{}, {key:'title',dir:'desc'}).map(r=>r.title)).toEqual(['Zoo','alpha 10','Alpha 2',null]);
  expect(rows[0].title).toBe('Zoo');
});
test('OR within a category, AND across categories, and existing search/presets compose',()=>{
  const rows=[{title:'Access A',status:'upcoming',owner_id:null,review_type:'access',recurrence:'monthly',due_date:'2026-09-10'},
    {title:'Access B',status:'in_progress',owner_id:'a',review_type:'access',recurrence:'monthly',due_date:'2026-09-10'},
    {title:'Vendor',status:'upcoming',owner_id:null,review_type:'vendor',recurrence:'monthly',due_date:'2026-09-10'}];
  const cols=tableColumns('reviews',{rows});
  // Avoid the actual clock for semantic status here; dedicated status tests cover it.
  const filters={review_type:['access'],owner_id:[EMPTY,'a'],recurrence:['monthly'],due_date:['next30']};
  expect(filter(rows.filter(r=>r.title.includes('Access')),cols,filters)).toHaveLength(2);
  expect(filter(rows,cols,{...filters,owner_id:[EMPTY]}).map(r=>r.title)).toEqual(['Access A']);
  expect(filter(rows,cols,{...filters,recurrence:['annual']})).toHaveLength(0);
});
test('review status column uses exactly the quick preset predicate',()=>{
  const rows=[{status:'in_progress',due_date:'2000-01-01'},{status:'upcoming',due_date:'2099-01-01'},{status:'needs_scheduling'},{status:'completed',due_date:'2000-01-01'}];
  const cols=tableColumns('reviews',{rows});
  for(const status of ['overdue','upcoming','needs_scheduling','in_progress','completed']) {
    expect(filter(rows,cols,{status:[status]})).toEqual(rows.filter(r=>reviewMatches(r,status)));
  }
  expect(filter(rows,cols,{status:['overdue','in_progress']})).toEqual([rows[0]]);
});
test('owner choices cannot enumerate unrelated users',()=>{
  const rows=[{owner_id:'a'}];
  const cols=tableColumns('reviews',{rows,users:[{user_id:'a',name:'A'},{user_id:'other-client',name:'Private Person'}]});
  expect(columnOptions(cols.find(c=>c.key==='owner_id'),rows)).toEqual([{value:'a',label:'A'},{value:EMPTY,label:'Unassigned'}]);
});
test('vendor multi-value data types, criticality and review/renewal dates combine',()=>{
  const rows=[{name:'A',criticality:'critical',data_types:['PII','Internal'],business_owner_id:null,next_review:'2026-09-10',contract_renewal:'2026-10-20',status:'active'},
    {name:'B',criticality:'low',data_types:['Internal'],business_owner_id:'a',next_review:null,status:'inactive'}];
  const cols=tableColumns('vendor-register',{rows});
  expect(filter(rows,cols,{criticality:['critical'],data_types:['PII'],business_owner_id:[EMPTY],next_review:['next30'],contract_renewal:['next31_90'],status:['active']})).toEqual([rows[0]]);
  expect(filter(rows,cols,{next_review:[EMPTY]})).toEqual([rows[1]]);
});
test('risk score sorting is numeric, severity uses logical ranking, and no scores are invented',()=>{
  const rows=[{title:'A',risk_level:'low',risk_score:2},{title:'B',risk_level:'critical',risk_score:20},{title:'C',risk_level:'moderate',risk_score:6},{title:'D',risk_score:null}];
  const cols=tableColumns('risk-register',{rows});
  expect(filter(rows,cols,{}, {key:'risk_score',dir:'desc'}).map(r=>r.title)).toEqual(['B','C','A','D']);
  expect(filter(rows,cols,{risk_level:['critical','moderate']},{key:'risk_level',dir:'asc'}).map(r=>r.title)).toEqual(['C','B']);
  expect(rows[3].risk_score).toBeNull();
});
test('Action Items preserve native statuses and combine priority, owner and due date',()=>{
  const rows=[{title:'A',priority:'high',status:'in_remediation',owner_id:'a',due_date:'2026-09-11'},{title:'B',priority:'low',status:'done',due_date:null}];
  expect(filter(rows,tableColumns('action-items',{rows}),{priority:['high'],status:['in_remediation'],owner_id:['a'],due_date:['next7']})).toEqual([rows[0]]);
});
test.each(['policies','contacts','evidence','client-management','portfolio','users'])('%s declarations support the shared engine without mutation',module=>{
  const row={title:'A',name:'A',client_id:'a',status:'active',role:'IT Lead',mime_type:'application/pdf'};
  const cols=tableColumns(module,{rows:[row]});
  expect(cols.length).toBeGreaterThan(2);
  expect(filter([row],cols,{})).toEqual([row]);
});
test('users client assignment options and values are limited to authorized client records',()=>{
  const rows=[{name:'User',client_ids:['a','secret']}];
  const c=tableColumns('users',{rows,clients:[{client_id:'a',name:'Authorized'}]}).find(c=>c.key==='client_ids');
  expect(columnOptions(c,rows).map(o=>o.value)).not.toContain('secret');
  expect(filter(rows,[c],{client_ids:['secret']})).toEqual([]);
});
