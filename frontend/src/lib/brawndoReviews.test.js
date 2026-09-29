import {pilotReviewStatus,pilotReviewMatches,pilotReviewColumns} from './brawndoReviews';
import {applyTableFilters,columnOptions} from './tableFilters';
import {tableColumns} from './tableColumns';
import {isBrawndoReference} from './reference';

const now=new Date(2026,8,29,23,30);
const row=(status,due_date,extra={})=>({status,due_date,...extra});
test('presentation preserves completion and started state while lateness remains independent',()=>{
  expect(pilotReviewStatus(row('completed',null),now)).toBe('completed');
  expect(pilotReviewStatus(row('cancelled','2020-01-01'),now)).toBe('cancelled');
  expect(pilotReviewStatus(row('in_progress',null),now)).toBe('needs_scheduling');
  expect(pilotReviewStatus(row('in_progress','2026-09-28'),now)).toBe('in_progress');
  expect(pilotReviewMatches(row('in_progress','2026-09-28'),'overdue',now)).toBe(true);
  expect(pilotReviewStatus(row('upcoming','2026-09-28'),now)).toBe('overdue');
  expect(pilotReviewStatus(row('upcoming','2026-09-29'),now)).toBe('upcoming');
  expect(pilotReviewStatus(row('open','2027-12-01'),now)).toBe('upcoming');
});
test('literal calendar dates: today and day 30 inclusive; day 31 excluded',()=>{
  for(const day of ['2026-09-29','2026-10-29T00:00:00Z']) expect(pilotReviewMatches(row('open',day),'upcoming',now)).toBe(true);
  expect(pilotReviewMatches(row('open','2026-10-30'),'upcoming',now)).toBe(false);
  expect(pilotReviewMatches(row('open','2026-09-29T00:00:00Z'),'overdue',now)).toBe(false);
  expect(pilotReviewMatches(row('open',null),'open',now)).toBe(true);
  expect(pilotReviewMatches(row('open',null),'unassigned',now)).toBe(true);
  expect(pilotReviewMatches(row('open',null,{owner_id:'u'}),'unassigned',now)).toBe(false);
  for(const status of ['completed','cancelled']){
    for(const view of ['open','unassigned','overdue','upcoming']) expect(pilotReviewMatches(row(status,'2026-09-28'),view,now)).toBe(false);
    expect(pilotReviewMatches(row(status,null),'history',now)).toBe(true);
    expect(pilotReviewMatches(row(status,null),'',now)).toBe(true);
  }
});
test('pilot columns filter derived status/source and disable only requested sorts',()=>{
  const rows=[row('in_progress','2020-01-01',{framework_key:'cis-ig1',review_type:'access'}),row('completed','2026-09-29')];
  const columns=pilotReviewColumns(tableColumns('reviews',{rows}),rows);
  for(const key of ['basis','review_type','status','owner_id'])expect(columns.find(c=>c.key===key).sortable).toBe(false);
  expect(applyTableFilters(rows,columns,{filters:{status:['in_progress']}})).toEqual([rows[0]]);
  const basis=columns.find(c=>c.key==='basis'),source=columnOptions(basis,rows).find(o=>o.label.includes('CIS'));
  expect(applyTableFilters(rows,columns,{filters:{basis:[source.value]}})).toEqual([rows[0]]);
  expect(tableColumns('reviews')[2].label).toBe('Basis');
});
test.each(['due_date','next_review_date'])('%s sorts calendar dates with unscheduled last in both directions',key=>{
  const rows=[{[key]:null},{[key]:'2026-10-01'},{[key]:'2026-09-29T23:30:00Z'}];
  const columns=pilotReviewColumns(tableColumns('reviews'),rows);
  expect(columns.find(c=>c.key===key).sortLabels).toEqual(['Earliest First','Latest First']);
  expect(applyTableFilters(rows,columns,{sort:{key,dir:'asc'}})).toEqual([rows[2],rows[1],rows[0]]);
  expect(applyTableFilters(rows,columns,{sort:{key,dir:'desc'}})).toEqual([rows[1],rows[2],rows[0]]);
});
test('stable demo identity only, not a name or ordinary client session',()=>{
  expect(isBrawndoReference('demo_brawndo',{workspace_mode:'demo'})).toBe(true);
  expect(isBrawndoReference('demo_dunder',{workspace_mode:'demo',name:'Brawndo'})).toBe(false);
  expect(isBrawndoReference('demo_brawndo',{workspace_mode:'standard'})).toBe(false);
});
