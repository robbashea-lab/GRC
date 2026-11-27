import {catalogForVersion,generateResult,visibleQuestions} from './guidedAssessment';
import {omniCisSummary} from './omniCisSummary';
import {generatedItems,reconcileItems} from '../preview/assessmentItems';

const version='cis-v8.1-control1-5',date='2026-10-13',catalog=catalogForVersion(version);

test.each(Object.keys(catalog.definitions))('%s unknown-only current Control 1 output keeps honest confirmation context out of supported controls',id=>{
  const root=catalog.definitions[id].root,answers={[root]:'Not sure',[root+'_detail']:'Synthetic QA cannot confirm the reported practice.',additional_gap:'No',additional_confirmation:'No',gaps:'HIDDEN GAP',unknowns:'HIDDEN UNKNOWN'};
  const original={...answers},output=omniCisSummary(id,answers,version,'Synthetic QA',date);
  expect(output.result.status).toBe('not_assessed');expect(output.result.gaps).toEqual([]);
  expect(output.result.narrative).toContain('needs confirmation');expect(output.result.narrative).toContain(answers[root+'_detail']);
  expect(output.result.narrative).not.toMatch(/Controls in place|HIDDEN/);
  expect(output.breakdown.find(row=>row.questionId===root).state).toBe('Needs confirmation');
  expect(output.result.status).toBe(generateResult(id,answers,new Date(2026,9,13),version).status);
  expect(answers).toEqual(original);
});

test.each(['1.3','1.4','1.5'])('%s omits an unanswered root from current controls while retaining the legacy reader',id=>{
  const root=catalog.definitions[id].root,output=omniCisSummary(id,{},version,'Synthetic QA',date);
  expect(output.result.status).toBe('not_assessed');expect(output.result.narrative).not.toContain('Controls in place');
  expect(output.breakdown.find(row=>row.questionId===root).state).toBe('Needs confirmation');
  const historical=omniCisSummary(id,{[root]:'Not sure'},'cis-v8.1-control1-2','Synthetic QA',date);
  const title=catalogForVersion('cis-v8.1-control1-2').definitions[id].title.toLowerCase();
  expect(historical.result.narrative).toBe(`Synthetic QA’s implementation of the practice to ${title} needs confirmation. Some reported practices remain unconfirmed. This assessment reflects practices reported on ${date}; independent verification remains separate.`);
});

test.each(Object.keys(catalog.definitions))('%s current root uncertainty has exact verification provenance and unchanged reconciliation keeps the authoritative Item and notes',id=>{
  const root=catalog.definitions[id].root,answers={[root]:'Not sure',[root+'_detail']:'Synthetic QA root remains unconfirmed.',additional_gap:'No',additional_confirmation:'No',gaps:'HIDDEN GAP',unknowns:'HIDDEN UNKNOWN'};
  const record={framework_key:'cis-ig1',framework_assessment_id:'isolated:'+id,definition_id:id},draft={version,answers,result:generateResult(id,answers,new Date(2026,9,13),version)};
  const question=visibleQuestions(id,answers,version).find(q=>q.id===root);
  expect(draft.result.signals).toContainEqual({questionId:root,kind:'verification'});
  const item=generatedItems(record,draft).find(item=>item.question_id===root);
  expect(item).toMatchObject({question_id:root,kind:'verification',text:question.unknown_template+' — '+answers[root+'_detail'],source_version:version});
  expect(generatedItems(record,draft).some(item=>item.kind==='gap'||item.text.includes('HIDDEN'))).toBe(false);
  const items=reconcileItems(record,draft,'reviewer','original');
  Object.assign(items.find(row=>row.item_id===item.item_id),{state:'resolved',resolution:'Synthetic retained analyst note.'});
  expect(reconcileItems({...record,items_to_address:items},draft,'reviewer','later')).toEqual(items);
});

test.each(['1.3','1.4','1.5'])('%s retains affirmative reported support and actual deficiencies rather than treating every unconfirmed overall result as empty',id=>{
  const root=catalog.definitions[id].root,answers={[root]:'Yes'};
  for(const q of visibleQuestions(id,answers,version))if(q.critical&&q.id!==root)answers[q.id]='Not sure';
  const uncertain=omniCisSummary(id,answers,version,'Synthetic QA',date);
  expect(uncertain.result.status).toBe('not_assessed');
  expect(uncertain.result.narrative).toContain('Controls in place');
  expect(uncertain.result.narrative.split('Controls in place')[1]).not.toContain('Not sure');
  const absent=omniCisSummary(id,{[root]:'No'},version,'Synthetic QA',date);
  expect(absent.result.status).toBe('needs_attention');expect(absent.result.gaps.length).toBeGreaterThan(0);
  expect(absent.result.narrative).not.toContain('Controls in place');
});
