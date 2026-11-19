import {completionExport,completionColumns} from './r4ReviewExports';

test('exports immutable occurrence facts and appended support without fabricating a legacy checklist',()=>{
  const rows=[{review_id:'retained',title:'Changed current title',occurrences:[{occurrence_id:'old',title:'=Synthetic original',
    completed_at:'2026-01-05',completed_by:null,supporting_reference:'Actual completed result',
    checklist:{required_support:['Period results']},checklist_results:[{result:'Pass',text:'Retained check'}]}]},
  {review_id:'legacy',title:'Legacy',status:'completed',completion_date:'2026-01-04',completion_snapshot:{by:null}}];
  const before=JSON.stringify(rows),csv=completionExport(rows,'2026-01-01','2026-01-05');
  expect(csv.split('\r\n')).toHaveLength(3);
  expect(csv).toContain('"\'=Synthetic original"');
  expect(csv).toContain('"Not recorded"');
  expect(csv).toContain('"Actual completed result","Period results"');
  expect(completionColumns.slice(-2)).toEqual(['Supporting result reference','Support to record']);
  expect(JSON.stringify(rows)).toBe(before);
});

test('rejects impossible or reversed export dates and filters by actual completion day',()=>{
  for(const dates of [['2026-02-30','2026-03-01'],['2026-03-01','2026-02-01'],['2026-99-01','2026-99-02']]) {
    expect(()=>completionExport([],dates[0],dates[1])).toThrow('valid start date');
  }
  expect(completionExport([{review_id:'x',occurrences:[{occurrence_id:'outside',completed_at:'2025-12-31'}]}],
    '2026-01-01','2026-01-31').split('\r\n')).toHaveLength(1);
});
