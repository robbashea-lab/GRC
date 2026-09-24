import {CATALOGS} from './frameworks';
import {groupRequirements,nextAssessment,matchesAssessment,sectionSummary,sourcePresentation,recurrencePresentation,assessmentWork} from './frameworkWorkspace';

test('native catalog order and hierarchy survive grouping without losing requirements',()=>{
  for(const [key,catalog] of Object.entries(CATALOGS)){
    const roots=groupRequirements(key,catalog.requirements);
    expect(roots.flatMap(n=>n.rows.map(r=>r.id))).toEqual(catalog.requirements.map(r=>r.id));
  }
  expect(groupRequirements('cis-ig1',CATALOGS['cis-ig1'].requirements)).toHaveLength(15);
  const nist=groupRequirements('nist-csf-2',CATALOGS['nist-csf-2'].requirements);
  expect(nist).toHaveLength(6);expect(nist.every(n=>n.children.length>0)).toBe(true);
  expect(groupRequirements('iso-27001',CATALOGS['iso-27001'].requirements).map(n=>n.id)).toEqual(['isms_clause','annex_control']);
});
test('resume and filters keep assessment status independent from overdue operations',()=>{
  const rows=[{framework_assessment_id:'a',status:'addressed',work:{overdue_reviews:1}},{framework_assessment_id:'b',status:'not_assessed'},{framework_assessment_id:'c',status:'in_progress'}];
  expect(nextAssessment(rows,'c')).toBe(rows[2]);expect(nextAssessment(rows,'a')).toBe(rows[1]);
  expect(nextAssessment([rows[0]])).toBe(rows[0]);expect(nextAssessment([{status:'addressed'}])).toBeNull();
  expect(matchesAssessment(rows[0],'attention')).toBe(true);expect(rows[0].status).toBe('addressed');
  expect(sectionSummary(rows)).toMatchObject({total:3,assessed:2,attention:3});
});
test('official text requires explicit trusted content and unsafe links are not rendered',()=>{
  expect(sourcePresentation({guidance:'Paraphrase',source:'https://example.test'})).toMatchObject({mode:'REFERENCE_ONLY',text:null});
  expect(sourcePresentation({official_text_mode:'LICENSED_TEXT',official_text:'Authorized text',source:'javascript:alert(1)'})).toMatchObject({mode:'LICENSED_TEXT',text:'Authorized text',url:null});
  expect(sourcePresentation({official_text_mode:'OFFICIAL_TEXT'}).mode).toBe('REFERENCE_ONLY');
});
test('a grouped plan interval is attributed only to its cited requirement',()=>{
  const catalog={review_plans:[{safeguards:['a','b'],cadence_references:[{definition_id:'a',interval:'annual'}]}]};
  expect(recurrencePresentation({id:'a'},catalog).basis).toBe('REQUIRED_EXPLICIT');
  expect(recurrencePresentation({id:'b'},catalog).basis).toBe('RECOMMENDED');
  expect(recurrencePresentation({id:'c'},catalog).basis).toBe('NONE');
  expect(recurrencePresentation({id:'c',type:'recurring',source_type:'standard_reference'},catalog).basis).toBe('REQUIRED_ORG_DEFINED');
});
test('operational projection follows relationships without leaking other clients',()=>{
  const row={client_id:'a',framework_assessment_id:'assessment',related_links:[{kind:'reviews',id:'r'}]};
  const work=assessmentWork(row,{reviews:[{client_id:'a',review_id:'r',status:'upcoming',due_date:'2026-01-01'},{client_id:'b',review_id:'r',status:'upcoming',due_date:'2026-01-01'}],findings:[{client_id:'a',finding_id:'f',review_id:'r',status:'open'}],tasks:[{client_id:'a',task_id:'t',finding_id:'f',due_date:'2026-01-01',status:'open'}],evidence:[{client_id:'a',evidence_id:'e',linked_type:'framework_assessment',linked_id:'assessment',created_at:'2025-12-01T00:00:00Z'},{client_id:'b',evidence_id:'x',linked_type:'framework_assessment',linked_id:'assessment',created_at:'2026-01-01'}]},'2026-01-02');
  expect(work).toEqual({review_ids:['r'],finding_ids:['f'],open_findings:1,overdue_reviews:1,overdue_actions:1,open_actions:1,evidence_count:1,latest_evidence_at:'2025-12-01'});
});
