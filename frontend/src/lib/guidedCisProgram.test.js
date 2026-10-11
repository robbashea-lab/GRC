import cis from '@catalogs/cisIG1.json';
import program from '@catalogs/guidedCisProgramV2.json';
import programV1 from '@catalogs/guidedCisProgramV1.json';
import {guidedCatalog as currentCatalog,control1Catalog,versionForSafeguard as currentVersionForSafeguard,legacyVersionForSafeguard,catalogForPilot,catalogForVersion,pilotEnabled,visibleQuestions as visibleVersionQuestions,validateAnswers as validateVersionAnswers,generateResult as generateVersionResult,prioritizeGuidedRows} from './guidedAssessment';

// Historical program-2 assertions remain intact; new source decisions have a separate suite.
const guidedCatalog=catalogForVersion(program.version);
const versionForSafeguard=(id)=>guidedCatalog.definitions[id]?.question_set_version;
const visibleQuestions=(id,answers,version=versionForSafeguard(id))=>visibleVersionQuestions(id,answers,version);
const validateAnswers=(id,answers,version=versionForSafeguard(id))=>validateVersionAnswers(id,answers,version);
const generateResult=(id,answers,today,version=versionForSafeguard(id))=>generateVersionResult(id,answers,today,version);

const complete=id=>Object.fromEntries(guidedCatalog.safeguards[id].map(q=>[q.id,q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='text'?'': 'Yes']));
test('all 18 Controls have exactly the canonical 56/130/153 cumulative Safeguards',()=>{
  expect(Object.keys(guidedCatalog.definitions)).toEqual(cis.requirements.map(r=>r.id));
  expect(new Set(cis.requirements.map(r=>r.control)).size).toBe(18);
  for(const [group,count] of [[1,56],[2,130],[3,153]]){
    expect(cis.requirements.filter(r=>pilotEnabled('fresh','cis-ig1',{implementation_group:group},r.id))).toHaveLength(count);
    for(const r of cis.requirements)expect(pilotEnabled('fresh','cis-ig1',{implementation_group:group},r.id)).toBe(r.implementation_group<=group);
  }
  expect(pilotEnabled('fresh','hipaa',{},'2.1')).toBe(false);
  expect(pilotEnabled('fresh','cis-ig1',{guided_assessment_enabled:false},'2.1')).toBe(false);
});
test('unchanged Control 1 questions keep their version and historical 1.1 remains available',()=>{
  for(const id of Object.keys(control1Catalog.definitions)){
    expect(catalogForVersion(control1Catalog.version).safeguards[id]).toEqual(control1Catalog.safeguards[id]);
    if(id!=='1.1'){
      expect(versionForSafeguard(id)).toBe(control1Catalog.version);
      expect(guidedCatalog.safeguards[id]).toEqual(control1Catalog.safeguards[id]);
    }
  }
  expect(versionForSafeguard('1.1',true)).toBe('cis-v8.1-control1-3');
  expect(catalogForVersion('brawndo-cis-pilot-1')).toBeTruthy();
});

test('CIS defaults use the reviewed current catalog while original question versions remain explicit',()=>{
  expect(catalogForPilot(false)).toBe(catalogForVersion('cis-v8.1-program-1'));
  expect(catalogForPilot()).toBe(currentCatalog);
  for(const id of Object.keys(guidedCatalog.definitions)){
    const original=id.startsWith('1.')?control1Catalog.version:programV1.version;
    expect(currentVersionForSafeguard(id,false)).toBe(original);
    expect(legacyVersionForSafeguard(id)).toBe(original);
  }
  const old=catalogForPilot(false),id='13.2';
  const answers=Object.fromEntries(old.safeguards[id].map(q=>[q.id,q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='text'?'':'Yes']));
  expect(generateVersionResult(id,answers,new Date(),programV1.version).version).toBe(programV1.version);
});

test.each(['13.2','13.3','13.4','13.7','13.8'])('%s keeps original program-1 matrix keys while new scope applies to every material row',id=>{
  const historical=catalogForVersion(programV1.version);
  const oldQuestion=historical.safeguards[id].find(q=>q.id==='requirements_0');
  expect(oldQuestion.rows).toEqual(programV1.definitions[id].elements.filter(e=>!e.conditional).map(e=>e.text));
  expect(oldQuestion.question_set_version).toBe('cis-v8.1-program-1');
  const oldAnswers={practice:'Yes',requirements_0:Object.fromEntries(oldQuestion.rows.map(row=>[row,'Yes']))};
  expect(validateAnswers(id,oldAnswers,programV1.version)).toBe(oldAnswers);
  expect(()=>validateAnswers(id,oldAnswers,program.version)).toThrow();
  const current=guidedCatalog.safeguards[id].filter(q=>q.type==='matrix');
  expect(current).toHaveLength(1);
  expect(current[0].id).toBe('conditional_0');
  expect(current[0].choices).toContain('Not applicable');
  const answers=complete(id);
  answers.conditional_0=Object.fromEntries(current[0].rows.map(row=>[row,'Not applicable']));
  expect(generateResult(id,answers).unknowns).not.toHaveLength(0);
  answers.scope_reason='Reviewer confirmed that the stated source condition excludes this identified population; remaining applicable assets were reviewed.';
  expect(generateResult(id,answers).gaps).toEqual([]);
  expect(generateResult(id,answers).status).toBe('not_assessed');
  expect(generateResult(id,answers).unknowns).toContain('Applicability requires native assessment decision; excluded scope is not proof of implementation.');
});

test.each(Object.entries(program.definitions).filter(([,d])=>d.elements.length&&d.elements.every(e=>e.conditional)).map(([id])=>id))('%s cannot turn an entirely excluded population into implementation proof in program2',id=>{
  const answers=complete(id);
  for(const q of guidedCatalog.safeguards[id].filter(q=>q.type==='matrix'))answers[q.id]=Object.fromEntries(q.rows.map(row=>[row,'Not applicable']));
  answers.scope_reason='The owner confirmed that the stated source conditions exclude the entire identified population.';
  const before=JSON.stringify(answers),result=generateResult(id,answers);
  expect(result.status).toBe('not_assessed');
  expect(result.basis).toEqual([]);
  expect(result.gaps).toEqual([]);
  expect(result.unknowns).toEqual(['Applicability requires native assessment decision; excluded scope is not proof of implementation.']);
  expect(result.narrative).toContain('exclusion of all source-conditioned requirements');
  expect(result.narrative).not.toContain('reports implementation');
  expect(result.narrative).toContain(answers.scope_reason);
  expect(result.signals).toContainEqual({questionId:'scope_reason',kind:'verification'});
  expect(JSON.stringify(answers)).toBe(before);
  // The frozen version still reproduces its historical recommendation semantics.
  const old=catalogForVersion(programV1.version);
  if(old.definitions[id].elements.every(e=>e.conditional)){
    const historical=Object.fromEntries(old.safeguards[id].map(q=>[q.id,q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Not applicable'])):q.type==='text'?'':'Yes']));
    historical.scope_reason=answers.scope_reason;
    expect(generateResult(id,historical,new Date('2026-10-07'),programV1.version).status).toBe('addressed');
  }
});

test('historical recommendations use their requested definition and new 18.4 preserves necessity',()=>{
  const historical=catalogForVersion(programV1.version),id='18.4';
  const old=Object.fromEntries(historical.safeguards[id].map(q=>[q.id,q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='text'?'':'Yes']));
  expect(generateResult(id,old,new Date('2026-10-07'),programV1.version).version).toBe(programV1.version);
  expect(generateResult(id,old,new Date('2026-10-07'),programV1.version).status).toBe('addressed');
  const answers=complete(id),conditional=guidedCatalog.safeguards[id].find(q=>q.id==='conditional_0');
  answers[conditional.id]={[conditional.rows[0]]:'Not applicable'};
  expect(generateResult(id,answers).unknowns).not.toHaveLength(0);
  answers.scope_reason='Post-test validation explicitly found no detection ruleset or capability change necessary.';
  expect(generateResult(id,answers).gaps).toEqual([]);
  expect(generateResult(id,answers).status).toBe('addressed');
  answers[conditional.id][conditional.rows[0]]='No';
  expect(generateResult(id,answers).status).toBe('in_progress');
});

test('new source considerations do not become publication, tool or extra-encryption mandates',()=>{
  expect(program.definitions['16.2'].elements.find(e=>e.id==='16.2-guided-external-policy-consideration')).toMatchObject({conditional:true});
  expect(program.definitions['16.2'].elements.find(e=>e.id==='16.2-guided-external-policy-consideration').text).toContain('considers');
  expect(program.definitions['13.1'].elements.find(e=>e.id==='13.1-guided-correlation-alerts').text).toContain('configured and operating');
  expect(program.definitions['3.11'].guidance).toMatch(/Storage-layer encryption meets the minimum.*not mandatory/);
  expect(program.definitions['16.9'].guidance).toContain('build a culture of security');
  expect(program.definitions['4.10'].elements.find(e=>e.id==='4.10-c4')).toMatchObject({conditional:true});
  expect(program.definitions['4.10'].elements.find(e=>e.id==='4.10-c4').text).toContain('20 local failed');
  const answers=complete('16.2'),consideration=guidedCatalog.safeguards['16.2'].find(q=>q.id==='conditional_0');
  answers[consideration.id]={[consideration.rows[0]]:'Not applicable'};
  answers.scope_reason='The enterprise does not develop applications for third parties.';
  expect(generateResult('16.2',answers).status).toBe('addressed');
  expect(generateResult('16.2',answers).unknowns).toEqual([]);
});
test.each(Object.keys(program.definitions))('%s implements full, partial, missing, and unknown paths without changing verification',id=>{
  const full=complete(id),output=generateResult(id,full);
  expect(output.status).toBe('addressed');
  expect(output.narrative).toContain(program.definitions[id].title);
  expect(output.narrative).not.toMatch(/passive asset discovery|Brawndo/);
  expect(output.verification).toBeUndefined();
  expect(output.version).toBe(program.version);
  expect(generateResult(id,{...full,practice:'Partially'}).status).toBe('in_progress');
  for(const [answer,status] of [['No','needs_attention'],['Not sure','not_assessed']]){
    const a={...full,practice:answer},questions=visibleQuestions(id,a);
    expect(questions.map(q=>q.id)).not.toContain('requirements_0');
    const result=generateResult(id,a);
    expect(result.status).toBe(status);
    expect(result.narrative).not.toContain('Responsible team');
    expect(result.basis).toEqual([]);
  }
  const matrix=guidedCatalog.safeguards[id].find(q=>q.type==='matrix');
  const a={...full,[matrix.id]:{...full[matrix.id],[matrix.rows[0]]:'Not sure'}};
  expect(generateResult(id,a).unknowns.join(' ')).toContain(matrix.rows[0]);
  expect(generateResult(id,a).gaps).toEqual([]);
  a[matrix.id][matrix.rows[0]]='No';
  expect(generateResult(id,a).gaps.join(' ')).toContain(matrix.rows[0]);
  expect(generateResult(id,a).unknowns).toEqual([]);
  expect(validateAnswers(id,a)).toBe(a);
  expect(guidedCatalog.safeguards[id].length).toBeLessThan(30);
  expect(guidedCatalog.safeguards[id].flatMap(q=>q.criterion_ids||[])).toEqual(expect.arrayContaining(program.definitions[id].elements.map(e=>e.id)));
});
test('mixed gaps and unknowns remain distinct within one question group',()=>{
  const a=complete('4.3'),q=guidedCatalog.safeguards['4.3'].find(q=>q.type==='matrix');
  a[q.id][q.rows[0]]='No';a[q.id][q.rows[1]]='Not sure';
  const result=generateResult('4.3',a);
  expect(result.gaps.join(' ')).not.toContain(q.rows[1]);
  expect(result.unknowns.join(' ')).not.toContain(q.rows[0]);
});
test('source-conditioned exclusions require rationale; unconditional elements cannot be excluded',()=>{
  const a=complete('2.1'),conditional=guidedCatalog.safeguards['2.1'].find(q=>q.id==='conditional_0');
  a[conditional.id][conditional.rows[0]]='Not applicable';
  expect(visibleQuestions('2.1',a).map(q=>q.id)).toContain('scope_reason');
  expect(generateResult('2.1',a).status).toBe('in_progress');
  a.scope_reason='No app store deployment for this population; confirmed with IT';
  expect(generateResult('2.1',a).status).toBe('addressed');
  const mandatory=guidedCatalog.safeguards['2.1'].find(q=>q.id==='requirements_0');
  a[mandatory.id][mandatory.rows[0]]='Not applicable';
  expect(()=>validateAnswers('2.1',a)).toThrow();
});
test('explicit frequencies, thresholds, alternatives and additional source details remain visible',()=>{
  const text=id=>program.definitions[id].elements.map(e=>e.text).join(' ');
  expect(text('4.3')).toMatch(/15 minutes.*two minutes/);
  expect(text('4.10')).toMatch(/20.*10.*10/);
  expect(text('5.3')).toContain('45 days');
  expect(text('8.10')).toContain('90 days');
  expect(text('11.1')).toContain('detailed backup procedures');
  expect(text('11.2')).toContain('at least weekly');
  expect(text('14.1')).toContain('at hire and at least annually');
  expect(text('17.5')).toContain('relevant third parties');
  expect(text('2.2')).toMatch(/mitigating controls.*residual-risk acceptance/);
  expect(text('5.2')).not.toMatch(/8.character|14.character/); // source labels these best practice, not a minimum obligation
});
test('Safeguard numbering orders 13.9 before 13.10 instead of decimal sorting',()=>{
  expect(prioritizeGuidedRows(['13.11','13.10','13.9'].map(definition_id=>({definition_id,status:'not_assessed'}))).map(r=>r.definition_id)).toEqual(['13.9','13.10','13.11']);
});
