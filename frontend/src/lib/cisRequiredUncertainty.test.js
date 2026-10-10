import {catalogForVersion, compatibleInterviewAnswers, generateResult, versionForSafeguard} from './guidedAssessment';

const complete=(id,version)=>({practice:'Yes',...Object.fromEntries(catalogForVersion(version).safeguards[id].filter(q=>q.type==='matrix').map(q=>[q.id,Object.fromEntries(q.rows.map(row=>[row,'Yes']))]))});

test('current CIS uncertainty field identifies substantive requirements and directs optional context elsewhere',()=>{
  for(const id of ['8.10','17.5']){
    const q=catalogForVersion(versionForSafeguard(id)).safeguards[id].find(q=>q.id==='unknowns');
    expect(q.prompt).toBe('Which substantive safeguard requirements still need confirmation, and who can verify them?');
    expect(q.help).toContain('Optional tool, owner or record details belong in the context fields');
    expect(q.status_impact).toBe('Unresolved substantive requirements qualify the proposed status; optional context does not.');
  }
});

test('optional owner context does not lower 8.10 while retained substantive uncertainty still does',()=>{
  const id='8.10',version=versionForSafeguard(id),answers=complete(id,version);
  answers.owner='SYNTHETIC QA: the optional log-owner name is still being confirmed.';
  expect(generateResult(id,answers,new Date(),version).status).toBe('addressed');
  answers.unknowns='SYNTHETIC QA: 90-day retention for one in-scope log source still needs confirmation.';
  const result=generateResult(id,answers,new Date(),version);
  expect(result.status).toBe('in_progress');
  expect(result.unknowns).toContain('Reviewer-reported uncertainty: '+answers.unknowns);
});

test.each(['cis-v8.1-program-1','cis-v8.1-program-2','cis-v8.1-program-3'])('explicit reuse from %s preserves the exact stable substantive uncertainty field',from=>{
  for(const id of ['8.10','17.5']){
    const answers={...complete(id,from),unknowns:'SYNTHETIC QA: Required practice still needs confirmation.\n- Retain original wording.',unknowns_detail:'Original supporting detail'};
    const before=JSON.stringify(answers),to=versionForSafeguard(id),mapped=compatibleInterviewAnswers(id,answers,from,to);
    expect(mapped.unknowns).toBe(answers.unknowns);
    expect(mapped.unknowns_detail).toBe(answers.unknowns_detail);
    expect(JSON.stringify(answers)).toBe(before);
    expect(generateResult(id,mapped,new Date(),to).status).toBe('in_progress');
  }
});

test('the clarification leaves legacy program wording and approved 1.1 unchanged',()=>{
  for(const version of ['cis-v8.1-program-1','cis-v8.1-program-2'])expect(catalogForVersion(version).safeguards['8.10'].find(q=>q.id==='unknowns').prompt).toBe('What still needs confirmation, and who can verify it?');
  expect(catalogForVersion(versionForSafeguard('1.1')).safeguards['1.1'].find(q=>q.id==='unknowns').prompt).not.toBe('Which substantive safeguard requirements still need confirmation, and who can verify them?');
});
