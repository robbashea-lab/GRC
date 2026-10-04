import {cis,reviewDriver} from './frameworks';
import {cisReviewBriefs,operationGaps} from './cisOperations';
import {operatorStatuses} from './frameworkOperator';

test('all 15 shared IG2 briefs derive their mapped checks, examples and timing from reviewed guidance',()=>{
  const ids=new Set();
  for(const plan of cis.review_plans){
    const record={framework_drivers:[reviewDriver('cis-ig1',plan)],description:'Client instructions',recurrence:'custom',occurrences:[{notes:'Historical'}]};
    const original=JSON.stringify(record),[brief]=cisReviewBriefs(record,cis.requirements.map(d=>d.id));
    expect(brief.items.map(d=>d.id)).toEqual(plan.safeguards);
    for(const item of brief.items){ids.add(item.id);expect(item.review).toBeTruthy();expect(item.outcome).toBeTruthy();expect(item.evidence).toBeTruthy();expect(item.source_cadence).toBeTruthy();}
    expect(JSON.stringify(record)).toBe(original);
  }
  expect(ids.size).toBe(130);
  expect(cisReviewBriefs({title:cis.review_plans[0].title})).toEqual([]);
  expect(cisReviewBriefs({framework_key:'iso-27001',framework_plan_key:'iso-management-review'})).toEqual([]);
});
test('setup gaps are independent of implementation, verification and file counts',()=>{
  expect(operationGaps({status:'addressed',verification:'verified',implementation:'Configured'})).toEqual(['Accountable person']);
  const row={status:'needs_attention',verification:'gap_identified',process_owner_id:'contact',implementation:'Weekly provider operation',cis_operation:{provider:'Provider',confirmed:true}};
  expect(operationGaps(row)).toEqual([]);expect(row.status).toBe('needs_attention');
  expect(operationGaps({...row,implementation:''})).toContain('Operating method or procedure reference');
  expect(operationGaps({...row,cis_operation:{provider:'Provider',confirmed:false}})).toEqual([]);
  expect(operationGaps({cis_setup:{accountable_person_recorded:true,operating_method_recorded:true,arrangement_confirmed:false}})).toEqual([]);
});
test('CIS label is canonical and other framework presentation is unchanged',()=>{
  expect(operatorStatuses('cis-ig1').needs_attention).toBe('Not Implemented');
  expect(operatorStatuses('iso-27001').needs_attention).toBe('Not Implemented / Needs Validation');
  expect(operatorStatuses('soc-2').needs_attention).toBe('Needs Remediation / Validation');
});
