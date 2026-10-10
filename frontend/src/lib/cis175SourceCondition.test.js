import program3 from '@catalogs/guidedCisProgram.json';
import cis from '@catalogs/cisIG1.json';
import {catalogForVersion, compatibleInterviewAnswers, generateResult, validateAnswers, versionForSafeguard} from './guidedAssessment';
import {omniCisSummary} from './omniCisSummary';

// CAS v8.1 17.5 qualifies third parties by relevance. This fixture excludes
// only that source-conditioned role; it does not assert whole-record N/A.
const id='17.5', criterion='17.5-guided-third-parties';
const complete=version=>({practice:'Yes',...Object.fromEntries(catalogForVersion(version).safeguards[id].filter(q=>q.type==='matrix').map(q=>[q.id,Object.fromEntries(q.rows.map(row=>[row,'Yes']))]))});
const thirdParty=version=>{
  const question=catalogForVersion(version).safeguards[id].find(q=>q.criterion_ids?.includes(criterion));
  return {question,row:question.rows[question.criterion_ids.indexOf(criterion)]};
};

test('only 17.5 selects the additive corrected source version',()=>{
  expect(versionForSafeguard(id)).toBe('cis-v8.1-program-4');
  for(const row of cis.requirements.filter(row=>row.control!==1&&row.id!==id))expect(versionForSafeguard(row.id)).toBe(program3.version);
});

test('relevance-backed third-party exclusion accepts complete internal response without invented remediation',()=>{
  const version=versionForSafeguard(id),{question,row}=thirdParty(version),answers=complete(version);
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
  const version=versionForSafeguard(id),{question,row}=thirdParty(version),answers=complete(version);
  answers[question.id][row]=value;
  const result=generateResult(id,answers,new Date(),version);
  expect(result.status).toBe('in_progress');
  expect(value==='No'?result.gaps.length:result.unknowns.length).toBeGreaterThan(0);
});

test('an exclusion without rationale never supplies a complete implementation result',()=>{
  const version=versionForSafeguard(id),{question,row}=thirdParty(version),answers=complete(version);
  answers[question.id][row]='Not applicable';
  expect(generateResult(id,answers,new Date(),version).status).toBe('in_progress');
});

test('old program3 answers remain readable and the changed condition is unanswered after explicit mapping',()=>{
  const old=program3.version,next=versionForSafeguard(id),answers=complete(old),before=JSON.stringify(answers),oldRow=thirdParty(old);
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
