import {unifiedActions,pilotActionStatus,pilotActionMatches,pilotPriority,pilotActionColumns,actionOrigin} from './brawndoActions';
import {tableColumns} from './tableColumns';
import {applyTableFilters} from './tableFilters';

const cid='demo_brawndo',now=new Date(2026,8,29,12);
const task=(id,extra={})=>({task_id:id,client_id:cid,title:id,status:'open',source_type:'manual',...extra});
const finding=(id,extra={})=>({finding_id:id,client_id:cid,title:id,status:'open',...extra});

test('ticket search projection retains every legacy Action plan and resolution',()=>{
  const [row]=unifiedActions({findings:[finding('f')],tasks:[task('one',{finding_id:'f',description:'First planned correction',resolution:'First outcome'}),task('two',{finding_id:'f',description:'Second planned correction',resolution:'Second outcome'})]},cid);
  expect(row.actionSearchText).toContain('First planned correction');expect(row.actionSearchText).toContain('Second planned correction');expect(row.actionSearchText).toContain('First outcome');expect(row.actionSearchText).toContain('Second outcome');
});
test('projection preserves orphans and distinct actions, does not mutate or duplicate on refresh, isolates clients',()=>{
  const data={findings:[finding('paired'),finding('orphan'),finding('foreign',{client_id:'other'})],tasks:[task('a',{finding_id:'paired'}),task('b',{finding_id:'paired'}),task('manual'),task('foreign',{client_id:'other'})]};
  const before=JSON.stringify(data),rows=unifiedActions(data,cid);
  expect(rows.map(r=>r.id)).toEqual(['paired','orphan','manual']);
  expect(rows[0].actions.map(t=>t.task_id)).toEqual(['a','b']);
  expect(rows[2].source.label).toBe('Manual Entry');
  expect(unifiedActions(data,cid)).toEqual(rows);expect(JSON.stringify(data)).toBe(before);
});
test.each([
  [{due_date:'2026-09-28'},'overdue',true,false],
  [{due_date:'2026-09-29'},'open',false,true],
  [{due_date:'2026-10-29'},'open',false,true],
  [{due_date:'2026-10-30'},'open',false,false],
  [{due_date:'2026-09-28',status:'in_progress'},'in_progress',true,false],
  [{due_date:'2026-09-28',status:'done'},'completed',false,false],
  [{due_date:null},'open',false,false],
  [{due_date:null,started_at:'2026-09-20'},'in_progress',false,false],
])('workflow and calendar status remain independent for %j',(extra,status,late,upcoming)=>{
  const [row]=unifiedActions({tasks:[task('a',extra)]},cid);
  expect(pilotActionStatus(row,now)).toBe(status);
  expect(pilotActionMatches(row,'overdue',now)).toBe(late);
  expect(pilotActionMatches(row,'upcoming',now)).toBe(upcoming);
  expect(pilotActionMatches(row,'unassigned',now)).toBe(status!=='completed');
});
test('priorities retain Critical and unknown classification; informational is active',()=>{
  expect(pilotPriority('medium')).toBe('Moderate');expect(pilotPriority('critical')).toBe('Critical');
  expect(pilotPriority('not_assessed')).toBe('Classification needed');expect(pilotPriority(null)).toBe('Classification needed');
  expect(pilotActionMatches(unifiedActions({tasks:[task('a',{priority:'informational'})]},cid)[0],'active',now)).toBe(true);
});
test('dates sort both ways with undated last; categorical controls offer filters only',()=>{
  const rows=unifiedActions({tasks:[task('none'),task('early',{due_date:'2026-09-01'}),task('late',{due_date:'2026-10-01'})]},cid);
  const columns=pilotActionColumns(tableColumns('action-items'),rows);
  for(const key of ['priority','owner_id','status','source_type'])expect(columns.find(c=>c.key===key).sortable).toBe(false);
  expect(applyTableFilters(rows,columns,{sort:{key:'due_date',dir:'asc'}}).map(r=>r.id)).toEqual(['early','late','none']);
  expect(applyTableFilters(rows,columns,{sort:{key:'due_date',dir:'desc'}}).map(r=>r.id)).toEqual(['late','early','none']);
});
test('source follows exact framework assessment and historical Review occurrence, never foreign or missing records',()=>{
  const a={framework_assessment_id:'a',client_id:cid,framework_key:'cis-ig1',definition_id:'1.1'};
  expect(actionOrigin(task('t'),{framework_assessments:[a]},finding('f',{framework_assessment_id:'a'}))).toMatchObject({target:a,label:'CIS IG1 Assessment → Safeguard 1.1'});
  const occurrence={occurrence_id:'old',period:'September 2026'},review={review_id:'r',client_id:cid,title:'Training Review',current_occurrence_id:'new',period:'October 2026',occurrences:[occurrence]};
  expect(actionOrigin(task('t',{review_id:'r',occurrence_id:'old'}),{reviews:[review]})).toMatchObject({target:review,detail:'September 2026',initialValues:{occurrence}});
  expect(actionOrigin(task('t',{review_id:'r',occurrence_id:'missing'}),{reviews:[review]}).target).toBeNull();
  expect(actionOrigin(task('t',{review_id:'r'}),{reviews:[review]}).target).toBeNull();
  expect(actionOrigin(task('t',{review_id:'r'}),{reviews:[{...review,client_id:'other'}]}).target).toBeUndefined();
});
test('a Pending Validation Finding is an open work item, overdue by its own target date',()=>{
  const finding={finding_id:'pv',client_id:cid,title:'Gap',status:'remediated',due_date:'2026-09-20',severity:'high'};
  const rows=unifiedActions({findings:[finding],tasks:[task('done',{finding_id:'pv',status:'done',due_date:'2026-09-20'})]},cid);
  const row=rows.find(r=>r.kind==='findings');
  expect(row).toBeTruthy();expect(pilotActionStatus(row,now)).toBe('pending_validation');
  expect(row.hasAction).toBe(true);expect(unifiedActions({findings:[finding],tasks:[]},cid).find(r=>r.kind==='findings').hasAction).toBe(false);
  expect(pilotActionMatches(row,'active',now)).toBe(true);expect(pilotActionMatches(row,'overdue',now)).toBe(true);
  const active=unifiedActions({findings:[{...finding,status:'in_remediation'}],tasks:[task('open',{finding_id:'pv'})]},cid);
  expect(active.filter(r=>r.kind==='findings')).toHaveLength(1);
});
test('the Status filter labels Pending Validation rows (filter options render)',()=>{
  const {columnOptions}=require('./tableFilters');
  const rows=unifiedActions({findings:[{finding_id:'pv',client_id:cid,title:'Gap',status:'remediated'}],tasks:[task('t',{finding_id:'pv',status:'done'}),task('o')]},cid);
  const status=pilotActionColumns(tableColumns('action-items'),rows).find(c=>c.key==='status');
  expect(()=>columnOptions(status,rows)).not.toThrow();
  expect(status.labelValue('pending_validation')).toBe('Pending Validation');
});
