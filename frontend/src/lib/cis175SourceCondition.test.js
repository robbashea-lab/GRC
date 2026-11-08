import program3 from '@catalogs/guidedCisProgram.json';
import cis from '@catalogs/cisIG1.json';
import {catalogForVersion, compatibleInterviewAnswers, generateResult, validateAnswers, versionForSafeguard} from './guidedAssessment';
import {omniCisSummary} from './omniCisSummary';

// Historical program4 applied the CAS relevance condition to an authored
// third-party supplement. Keep that reader contract; the approved Navigator
// scope in current program5 removes the supplement instead.
const id='17.5', criterion='17.5-guided-third-parties',historical='cis-v8.1-program-4';
const complete=version=>({practice:'Yes',...(version==='cis-v8.1-program-5'?{additional_gap:'No',additional_confirmation:'No'}:{}),...Object.fromEntries(catalogForVersion(version).safeguards[id].filter(q=>q.type==='matrix').map(q=>[q.id,Object.fromEntries(q.rows.map(row=>[row,'Yes']))]))});
const thirdParty=version=>{
  const question=catalogForVersion(version).safeguards[id].find(q=>q.criterion_ids?.includes(criterion));
  return {question,row:question.rows[question.criterion_ids.indexOf(criterion)]};
};

test('the historical corrected reader remains available while current safeguards select V5',()=>{
  expect(catalogForVersion(historical).definitions[id].question_set_version).toBe(historical);
  expect(versionForSafeguard(id)).toBe('cis-v8.1-program-5');
  for(const row of cis.requirements)expect(versionForSafeguard(row.id)).toBe(row.control===1?'cis-v8.1-control1-5':'cis-v8.1-program-5');
});

test('relevance-backed third-party exclusion accepts complete internal response without invented remediation',()=>{
  const version=historical,{question,row}=thirdParty(version),answers=complete(version);
  expect(question.choices).toContain('Not applicable');
  answers[question.id][row]='Not applicable';
  answers.scope_reason='SYNTHETIC QA: no third party performs a relevant incident-response role; all required functions are assigned internally.';
  validateAnswers(id,answers,version);
  expect(generateResult(id,answers,new Date(),version).status).toBe('addressed');
  const summary=omniCisSummary(id,answers,version,'Synthetic source-condition client');
  expect(summary.result.gaps).toEqual([]);
  expect(summary.result.narrative).toContain('Reported outside scope');
  expect(summary.result.narrative).not.toContain('Address the reported deficiency: '+row);
});

test.each(['Not sure','No'])('unknown relevance or absent relevant assignments remains unresolved: %s',value=>{
  const version=historical,{question,row}=thirdParty(version),answers=complete(version);
  answers[question.id][row]=value;
  const result=generateResult(id,answers,new Date(),version);
  expect(result.status).toBe('in_progress');
  expect(value==='No'?result.gaps.length:result.unknowns.length).toBeGreaterThan(0);
});

test('an exclusion without rationale never supplies a complete implementation result',()=>{
  const version=historical,{question,row}=thirdParty(version),answers=complete(version);
  answers[question.id][row]='Not applicable';
  expect(generateResult(id,answers,new Date(),version).status).toBe('in_progress');
});

test('old program3 answers remain readable and the changed condition is unanswered after explicit mapping',()=>{
  const old=program3.version,next=historical,answers=complete(old),before=JSON.stringify(answers),oldRow=thirdParty(old);
  expect(oldRow.question.choices).not.toContain('Not applicable');
  answers.operation='SYNTHETIC QA: preserve unchanged operating context.';
  const original=JSON.stringify(answers),mapped=compatibleInterviewAnswers(id,answers,old,next),newRow=thirdParty(next);
  expect(mapped[newRow.question.id]?.[newRow.row]).toBeUndefined();
  expect(mapped.practice).toBe('Yes');
  expect(mapped.operation).toBe(answers.operation);
  const mappedRows=Object.entries(mapped).filter(([key])=>key.startsWith('requirements_')).flatMap(([,rows])=>Object.keys(rows));
  expect(mappedRows).toHaveLength(10);
  expect(JSON.stringify(answers)).toBe(original);
  expect(before).toContain('Incident-response responsibilities include relevant third parties.');
  expect(generateResult(id,answers,new Date(),old).status).toBe('addressed');
  expect(generateResult(id,mapped,new Date(),next).status).toBe('in_progress');
});

test.each(['No','Not sure','Not applicable'])('explicit reuse to current scope retires only the authored third-party supplement: %s',value=>{
  const next='cis-v8.1-program-5',answers=complete(historical),{question,row}=thirdParty(historical);
  answers[question.id][row]=value;
  if(value==='Not applicable')answers.scope_reason='Synthetic historical third-party relevance rationale.';
  answers.operation='Synthetic assigned response functions remain unchanged.';
  const original=JSON.stringify(answers),mapped=compatibleInterviewAnswers(id,answers,historical,next);
  const before=catalogForVersion(historical).definitions[id].elements,after=catalogForVersion(next).definitions[id].elements;
  expect(before.filter(e=>e.id===criterion)).toHaveLength(1);
  expect(before.find(e=>e.id===criterion).conditional).toBe(true);
  expect(after).toEqual(before.filter(e=>e.id!==criterion));
  expect(after).toHaveLength(10);
  expect(catalogForVersion(next).safeguards[id].some(q=>q.criterion_ids?.includes(criterion))).toBe(false);
  expect(mapped.conditional_0).toBeUndefined();expect(mapped.operation).toBe(answers.operation);
  expect(generateResult(id,answers,new Date(),historical).status).toBe(value==='Not applicable'?'addressed':'in_progress');
  const result=generateResult(id,mapped,new Date(),next);
  expect(result.status).toBe('addressed');expect(result.gaps).toEqual([]);expect(result.unknowns).toEqual([]);
  expect(JSON.stringify(answers)).toBe(original);
  expect(()=>validateAnswers(id,answers,next)).toThrow('Unknown question');
});
