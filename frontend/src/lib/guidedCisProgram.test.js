import cis from '@catalogs/cisIG1.json';
import program from '@catalogs/guidedCisProgram.json';
import {guidedCatalog,control1Catalog,versionForSafeguard,catalogForVersion,pilotEnabled,visibleQuestions,validateAnswers,generateResult,prioritizeGuidedRows} from './guidedAssessment';

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
test('Control 1 keeps its exact version and questions, not a forced version migration',()=>{
  for(const id of Object.keys(control1Catalog.definitions)){
    expect(versionForSafeguard(id)).toBe(control1Catalog.version);
    expect(guidedCatalog.safeguards[id]).toEqual(control1Catalog.safeguards[id]);
  }
  expect(catalogForVersion('brawndo-cis-pilot-1')).toBeTruthy();
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
