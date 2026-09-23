import {reviewedProgress, ongoingProgram} from './programProgress';
import {CATALOGS} from './frameworks';

test('resolved assessment scope includes only addressed and documented valid N/A, with no partial credit',()=>{
  const rows=['addressed','in_progress','not_assessed','needs_attention','not_applicable','not_applicable','legacy'].map((status,i)=>({definition_id:'1.1',status,na_rationale:i===4?'Out of scope':' '}));
  expect(reviewedProgress(rows,'cis-ig1')).toEqual({total:7,resolved:2,valid_na:1,invalid_na:1,percent:29});
  expect(reviewedProgress([],'cis-ig1').percent).toBeNull();
});

test('ISO clause exclusions and HIPAA addressable exclusions do not earn N/A credit',()=>{
  for(const [key,spec] of [['iso-27001','isms_clause'],['hipaa','addressable']]){
    const d=CATALOGS[key].requirements.find(d=>d.specification===spec);
    expect(reviewedProgress([{definition_id:d.id,status:'not_applicable',na_rationale:'Legacy rationale'}],key).resolved).toBe(0);
  }
  const d=CATALOGS['iso-27001'].requirements.find(d=>d.specification==='annex_control');
  const row={definition_id:d.id,status:'not_applicable',soa_applicability:'excluded',soa_justification:'Documented SoA exclusion'};
  expect(reviewedProgress([row],'iso-27001').percent).toBe(100);
  expect(reviewedProgress([{...row,soa_justification:''}],'iso-27001').percent).toBe(0);
});

test('ongoing groups are disjoint, calendar-boundary aware and independent of assessment progress',()=>{
  const reviews=[['past','2026-09-22'],['today','2026-09-23'],['30','2026-10-23'],['later','2026-10-24'],['none',null]].map(([review_id,due_date])=>({review_id,due_date,status:'upcoming',recurrence:'annual'}));
  const before=JSON.stringify(reviews);
  const result=ongoingProgram([...reviews,{...reviews[0],review_id:'done',status:'completed'},{...reviews[0],review_id:'once',recurrence:'none'}],'2026-09-23');
  expect(result.summary.counts).toEqual({past_due:1,due_soon:2,current:1,unscheduled:1});
  expect(result.summary.total).toBe(5);
  expect(result.summary.next.id).toBe('past');
  expect(JSON.stringify(reviews)).toBe(before);
});
