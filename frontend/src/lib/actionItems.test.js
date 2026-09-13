import { actionMatches, actionOrder, taskSource } from './actionItems';
import { applyTableFilters } from './tableFilters';
import { tableColumns } from './tableColumns';
const today=new Date(2026,8,13);
test('work presets overlap overdue without storing a workflow status',()=>{
  const r={status:'in_progress',due_date:'2026-09-01'};
  expect(actionMatches(r,'overdue',today)).toBe(true);
  expect(actionMatches(r,'in_progress',today)).toBe(true);
  expect(actionMatches({...r,status:'done'},'overdue',today)).toBe(false);
  expect(actionMatches({...r,status:'cancelled'},'completed',today)).toBe(false);
  expect(actionMatches({...r,due_date:'2026-09-13'},'overdue',today)).toBe(false);
  expect(actionMatches({...r,due_date:null},'overdue',today)).toBe(false);
});
test('operational ordering keeps completed work last and newest completion first',()=>{
  const rows=[
    {title:'old complete',status:'done',completed_at:'2025-01-01'},
    {title:'undated',status:'open'},
    {title:'open',status:'open',due_date:'2026-09-15'},
    {title:'started',status:'in_progress',due_date:'2026-10-01'},
    {title:'late',status:'open',due_date:'2026-08-01'},
    {title:'later',status:'in_progress',due_date:'2026-09-01'},
    {title:'new complete',status:'done',completed_at:'2026-09-12'},
  ];
  expect(rows.sort((a,b)=>actionOrder(a,b,today)).map(r=>r.title)).toEqual(['late','later','started','open','undated','new complete','old complete']);
});
test('source inference uses real same-client relationships, without inventing history',()=>{
  expect(taskSource({client_id:'a',review_id:'r'},{reviews:[{review_id:'r',client_id:'b',title:'Private'}]}).target).toBeUndefined();
  expect(taskSource({client_id:'a'}).label).toBe('Not recorded');
  expect(taskSource({source_type:'audit'}).label).toBe('Audit / Assessment');
});
test('source, status, owner and priority combine through the shared table engine',()=>{
  const rows=[{title:'A',priority:'high',owner_id:null,status:'open',source_type:'audit'},{title:'B',priority:'high',owner_id:'u',status:'in_progress',source_type:'review'}];
  const columns=tableColumns('action-items',{rows,users:[{user_id:'u',name:'User'}]});
  expect(columns.some(c=>c.key==='type')).toBe(false);
  expect(applyTableFilters(rows,columns,{filters:{priority:['high'],owner_id:['__empty__'],status:['open','in_progress'],source_type:['audit']}})).toEqual([rows[0]]);
});
