import {filterDashboardQueue} from './dashboardWorkQueue';
test('search uses locale-independent lowercase, not accent or sharp-s expansion',()=>{
  const groups={all:[{title:'Straße ÉQUIPE',owner:'İpek',type:'Review'}]};
  expect(filterDashboardQueue(groups,{},[],[],'','straße équipe').all).toHaveLength(1);
  expect(filterDashboardQueue(groups,{},[],[],'','STRASSE').all).toHaveLength(0);
  expect(filterDashboardQueue(groups,{},[],[],'','i\u0307pek').all).toHaveLength(1);
});

test('explicit many-framework controls, source ancestry, complete populations and general work',()=>{
  const tasks=Array.from({length:14},(_,i)=>({task_id:`t${i}`,client_id:'a',review_id:'r'}));
  tasks.push({task_id:'general',client_id:'a',title:'CIS is only a title'});
  const all=tasks.map(t=>({kind:'tasks',id:t.task_id,title:t.title||t.task_id}));
  const groups={all,pastDue:all.slice(0,12),due30:[],unassigned:all.slice(12)};
  const assessments=[{framework_assessment_id:'a1',framework_key:'cis-ig1'},{framework_assessment_id:'a2',framework_key:'soc-2'}];
  const controls=[{assessment_ids:['a1','a2'],related_links:[{kind:'reviews',id:'r'}]}];
  const records={tasks,reviews:[{review_id:'r',client_id:'a'}]};
  for(const framework of ['cis-ig1','soc-2']){
    const result=filterDashboardQueue(groups,records,assessments,controls,framework);
    expect(result.all).toHaveLength(14);
    expect(result.pastDue).toHaveLength(12);
    expect(new Set(result.all.map(r=>r.id)).size).toBe(14);
    expect(result.unassigned).toHaveLength(2);
  }
  expect(filterDashboardQueue(groups,records,assessments,controls).all).toHaveLength(15);
  expect(filterDashboardQueue(groups,records,assessments,controls,'cis-ig1','t13').all.map(r=>r.id)).toEqual(['t13']);
  expect(filterDashboardQueue(groups,records,assessments,controls,'iso-27001').all).toEqual([]);
});
test('record-side assessment links and framework baseline requirements retain membership',()=>{
  const records={risks:[{risk_id:'risk',related_links:[{kind:'framework_assessments',id:'iso'}]},
    {risk_id:'foreign',related_links:[{kind:'framework_assessments',id:'another-client'}]}],
    reviews:[{review_id:'review',risk_id:'risk'}],requirements:[{requirement_id:'req',baseline_key:'iso-27001'},
      {requirement_id:'general',baseline_key:'business-process'}]};
  const all=Object.entries(records).flatMap(([kind,rows])=>rows.map(r=>({kind,id:r[`${kind==='requirements'?'requirement':kind==='reviews'?'review':'risk'}_id`],title:'Target'})));
  const result=filterDashboardQueue({all},records,[{framework_assessment_id:'iso',framework_key:'iso-27001'}],[],'iso-27001');
  expect(result.all.map(r=>r.id)).toEqual(['risk','review','req']);
  expect(filterDashboardQueue({all},records,[],[],'','target').all).toHaveLength(5);
});
