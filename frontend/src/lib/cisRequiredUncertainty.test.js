import {catalogForVersion, compatibleInterviewAnswers, generateResult, versionForSafeguard} from './guidedAssessment';

const complete=(id,version)=>({practice:'Yes',...(version==='cis-v8.1-program-5'?{additional_gap:'No',additional_confirmation:'No'}:{}),...Object.fromEntries(catalogForVersion(version).safeguards[id].filter(q=>q.type==='matrix').map(q=>[q.id,Object.fromEntries(q.rows.map(row=>[row,'Yes']))]))});

test('current CIS uncertainty field identifies substantive requirements and directs optional context elsewhere',()=>{
  for(const id of ['8.10','17.5']){
    const q=catalogForVersion(versionForSafeguard(id)).safeguards[id].find(q=>q.id==='unknowns');
    expect(q.prompt).toBe('Which substantive safeguard requirements still need confirmation, and who can verify them?');
    expect(q.help).toContain('Optional tool, owner or record details belong in the context fields');
    expect(q.status_impact).toBe('Unresolved substantive requirements qualify the proposed status; optional context does not.');
  }
});

test.each([
  ['cis-v8.1-program-3','in_progress'],
  ['cis-v8.1-program-5','not_assessed']
])('optional owner context does not lower 8.10 and affirmed uncertainty retains its version-specific meaning: %s', (version,status)=>{
  const id='8.10',answers=complete(id,version);
  answers.owner='SYNTHETIC QA: the optional log-owner name is still being confirmed.';
  expect(generateResult(id,answers,new Date(),version).status).toBe('addressed');
  answers.unknowns='SYNTHETIC QA: 90-day retention for one in-scope log source still needs confirmation.';
  if(version==='cis-v8.1-program-5'){
    expect(generateResult(id,answers,new Date(),version).status).toBe('addressed');
    answers.additional_confirmation='Yes';
  }
  const result=generateResult(id,answers,new Date(),version);
  expect(result.status).toBe(status);
  expect(result.unknowns).toContain('Reviewer-reported uncertainty: '+answers.unknowns);
});

test.each(['cis-v8.1-program-1','cis-v8.1-program-2','cis-v8.1-program-3'])('explicit reuse from %s preserves the exact stable substantive uncertainty field',from=>{
  for(const id of ['8.10','17.5']){
    const answers={...complete(id,from),unknowns:'SYNTHETIC QA: Required practice still needs confirmation.\n- Retain original wording.',unknowns_detail:'Original supporting detail'};
    const before=JSON.stringify(answers),historical='cis-v8.1-program-3',to=versionForSafeguard(id),mapped=compatibleInterviewAnswers(id,answers,from,to);
    const oldMeaning=compatibleInterviewAnswers(id,answers,from,historical);
    expect(oldMeaning.unknowns).toBe(answers.unknowns);expect(oldMeaning.unknowns_detail).toBe(answers.unknowns_detail);
    expect(generateResult(id,oldMeaning,new Date(),historical).status).toBe('in_progress');
    expect(mapped.unknowns).toBe(answers.unknowns);
    expect(mapped.unknowns_detail).toBe(answers.unknowns_detail);
    expect(to).toBe('cis-v8.1-program-5');expect(mapped.additional_confirmation).toBeUndefined();
    expect(JSON.stringify(answers)).toBe(before);
    expect(generateResult(id,mapped,new Date(),to).status).toBe('addressed');
    const confirmed=generateResult(id,{...mapped,additional_confirmation:'Yes'},new Date(),to);
    expect(confirmed.status).toBe('not_assessed');expect(confirmed.gaps).toEqual([]);
    expect(confirmed.unknowns).toContain('Reviewer-reported uncertainty: '+answers.unknowns);
  }
});

test('legacy program and Control 1 wording stays readable while current V5 requires explicit confirmation intent',()=>{
  for(const version of ['cis-v8.1-program-1','cis-v8.1-program-2'])expect(catalogForVersion(version).safeguards['8.10'].find(q=>q.id==='unknowns').prompt).toBe('What still needs confirmation, and who can verify it?');
  expect(catalogForVersion('cis-v8.1-control1-3').safeguards['1.1'].find(q=>q.id==='unknowns').prompt).not.toBe('Which substantive safeguard requirements still need confirmation, and who can verify them?');
  const current=catalogForVersion(versionForSafeguard('1.1')).safeguards['1.1'].find(q=>q.id==='unknowns');
  expect(versionForSafeguard('1.1')).toBe('cis-v8.1-control1-5');
  expect(current.prompt).toBe('Which substantive safeguard requirements still need confirmation, and who can verify them?');
  expect(current.when).toEqual({additional_confirmation:['Yes']});
});
