import {loadDashboardItem,dashboardRecordHref} from './dashboardItemSummary';
const item={kind:'tasks',id:'t',title:'Existing title',due_date:'2026-10-05'};
const apiFor=records=>({get:jest.fn(async path=>{if(!records[path])throw Object.assign(new Error('Not available'),{response:{status:403}});return {data:records[path]};}),post:jest.fn(),patch:jest.fn()});
test('manual task has no fabricated origin or source; preserves actual title and purpose',async()=>{
  const api=apiFor({'/tasks/t':{client_id:'a',task_id:'t',source_type:'manual',description:'Actual purpose',created_at:'2026-09-01'}});
  const summary=await loadDashboardItem(api,item,'a');expect(summary.sourceHref).toBeNull();expect(summary.origin).toBe('Manual Entry');expect(summary.purpose).toBe('Actual purpose');expect(summary.recordHref).toBe('/action-items?id=t&client_id=a');expect(api.get).toHaveBeenCalledTimes(1);expect(api.patch).not.toHaveBeenCalled();
});
test('undocumented origin is omitted rather than inferred as manual',async()=>{
  const summary=await loadDashboardItem(apiFor({'/tasks/t':{client_id:'a',task_id:'t'}}),item,'a');
  expect(summary.origin).toBeNull();expect(summary.sourceHref).toBeNull();
});
test('Finding-backed Action uses actual Finding description and exact assessment source',async()=>{
  const api=apiFor({'/tasks/t':{client_id:'a',task_id:'t',finding_id:'f'},'/findings/f':{client_id:'a',finding_id:'f',framework_assessment_id:'a1',description:'Actual deficiency'},'/framework_assessments/a1':{client_id:'a',framework_assessment_id:'a1',framework_key:'cis-ig1',definition_id:'18.5',title:'Internal testing'}});
  const summary=await loadDashboardItem(api,item,'a');expect(summary.purpose).toBe('Actual deficiency');expect(summary.sourceHref).toBe('/compliance/cis-ig1?assessment=a1');expect(api.post).not.toHaveBeenCalled();
});
test('historical Review origin preserves exact stored occurrence rather than current period',async()=>{
  const api=apiFor({'/tasks/t':{client_id:'a',task_id:'t',review_id:'r',occurrence_id:'old'},'/reviews/r':{client_id:'a',review_id:'r',title:'Original review',current_occurrence_id:'now',occurrences:[{occurrence_id:'old',period:'2025',status:'completed'}]}});
  const summary=await loadDashboardItem(api,item,'a');expect(summary.sourceHref).toBe('/reviews?id=r&client_id=a&occurrence=old');expect(summary.sourceInitialValues).toEqual({occurrence:{occurrence_id:'old',period:'2025',status:'completed'}});
});
test('missing/denied/foreign source never creates a navigable link or exposes source content',async()=>{
  for(const source of [undefined,{client_id:'b',review_id:'r',title:'Foreign secret'}]){const api=apiFor({'/tasks/t':{client_id:'a',task_id:'t',review_id:'r'},'/reviews/r':source});const summary=await loadDashboardItem(api,item,'a');expect(summary.sourceHref).toBeNull();expect(JSON.stringify(summary)).not.toContain('Foreign secret');}
});
test('Review with actual policy link resolves source independently of task provenance',async()=>{
  const api=apiFor({'/reviews/r':{client_id:'a',review_id:'r',title:'Review',policy_id:'p'},'/policies/p':{client_id:'a',policy_id:'p',title:'Actual policy'}});const summary=await loadDashboardItem(api,{kind:'reviews',id:'r'},'a');expect(summary.origin).toBe('Actual policy');expect(summary.sourceHref).toBe('/policies?id=p&client_id=a');
});
test('all register destinations use encoded exact IDs, including standalone acceptance',()=>{
  for(const [kind,field] of [['risks','risk_id'],['vendors','vendor_id'],['policies','policy_id'],['exceptions','exception_id'],['requirements','requirement_id']])expect(dashboardRecordHref(kind,{client_id:'a', [field]:'id /?'})).toContain(encodeURIComponent('id /?').replace(/%20/g,'+'));
});
