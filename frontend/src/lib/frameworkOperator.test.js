import {CATALOGS} from './frameworks';
import {operatorGuidance,operatorStatuses,assessmentProgress} from './frameworkOperator';

test('CIS guidance covers every existing safeguard without modifying the catalog',()=>{
  const before=JSON.stringify(CATALOGS['cis-ig1']);
  for(const d of CATALOGS['cis-ig1'].requirements){const g=operatorGuidance('cis-ig1',d);expect(g.meaning).toBe(d.guidance);expect(g.implementation.length).toBeGreaterThan(100);expect(g.evidence.length).toBeGreaterThan(50);}
  expect(JSON.stringify(CATALOGS['cis-ig1'])).toBe(before);
  expect(new Set(CATALOGS['cis-ig1'].requirements.map(d=>operatorGuidance('cis-ig1',d).evidence)).size).toBe(56);
});
test('status labels explain existing states without creating a competing lifecycle',()=>{
  expect(Object.keys(operatorStatuses('cis-ig1'))).toEqual(['not_assessed','in_progress','addressed','needs_attention','not_applicable']);
  expect(operatorStatuses('cis-ig1').in_progress).toBe('Partially Implemented');
  expect(operatorStatuses('nist-csf-2').in_progress).toBe('Partially Achieved');
});
test('all NIST outcomes have distinct plain-English explanations and category guidance',()=>{
  const all=CATALOGS['nist-csf-2'].requirements.map(d=>operatorGuidance('nist-csf-2',d));
  expect(new Set(all.map(g=>g.meaning)).size).toBe(106);
  for(const g of all){expect(g.meaning.length).toBeGreaterThan(50);expect(g.implementation.length).toBeGreaterThan(60);expect(g.evidence).toBeTruthy();expect(g.meaning).not.toContain('How does');}
});

test('NIST source qualifications survive concise operator explanations',()=>{
  const catalog=CATALOGS['nist-csf-2'];
  const meaning=id=>operatorGuidance('nist-csf-2',catalog.requirements.find(d=>d.id===id)).meaning;
  expect(meaning('ID.RA-09')).toContain('integrity');
  expect(meaning('ID.RA-10')).toContain('before acquisition');
  expect(meaning('PR.AA-04')).toContain('verify');
  expect(meaning('PR.AA-05')).toContain('separation of duties');
  expect(meaning('RS.AN-06')).toContain('provenance');
  expect(meaning('RC.RP-04')).toContain('post-incident operating norms');
  expect(catalog.requirements.find(d=>d.id==='RC.RP-04').title).toBe('Establish post-incident operating norms');
  for(const plan of catalog.review_plans){
    expect(plan.cadence_class).toBe('D');
    expect(plan.source_minimum).toBeNull();
    expect(plan.cadence_references).toEqual([]);
  }
});
test('HIPAA explanatory text never substitutes for stored regulatory wording',()=>{
  for(const d of CATALOGS.hipaa.requirements){const g=operatorGuidance('hipaa',d);expect(g.meaning.length).toBeGreaterThan(50);expect(g.meaning).not.toBe(d.guidance);expect(g.implementation).toBeTruthy();expect(g.evidence).toBeTruthy();}
  expect(operatorGuidance('hipaa',CATALOGS.hipaa.requirements.find(d=>d.id==='164.306(d)')).meaning).toContain('does not mean optional');
  expect(new Set(CATALOGS.hipaa.requirements.map(d=>operatorGuidance('hipaa',d).evidence)).size).toBe(76);
});

test('HIPAA summaries retain periodic review and the pre-movement backup safeguard',()=>{
  const catalog=CATALOGS.hipaa;
  const definition=id=>catalog.requirements.find(d=>d.id===id);
  expect(operatorGuidance('hipaa',definition('164.316(b)(2)(iii)')).meaning).toContain('periodically');
  const backup=definition('164.310(d)(2)(iv)');
  expect(backup.specification).toBe('addressable');
  expect(operatorGuidance('hipaa',backup).meaning).toContain('retrievable exact copy');
  expect(operatorGuidance('hipaa',backup).meaning).toContain('before moving');
  for(const plan of catalog.review_plans){
    expect(plan.cadence_class).toBe('D');
    expect(plan.source_minimum).toBeFalsy();
    expect(plan.cadence_references).toEqual([]);
  }
});
test('ISO clauses and all 93 Annex controls retain distinct usable guidance',()=>{
  const catalog=CATALOGS['iso-27001'];
  for(const d of catalog.requirements){const g=operatorGuidance('iso-27001',d);expect(g.meaning.length).toBeGreaterThan(40);expect(g.implementation).toBeTruthy();expect(g.evidence).toBeTruthy();expect(g.meaning).not.toContain('Omnisciente implementation prompt');}
  expect(catalog.requirements.filter(d=>d.specification==='annex_control')).toHaveLength(93);
  const clauses=catalog.requirements.filter(d=>d.specification!=='annex_control');
  expect(clauses).toHaveLength(30);
  for(const d of clauses)expect(operatorGuidance('iso-27001',d).meaning).not.toMatch(/^(Record|Document|Explain|Link|Show|Identify|Describe|Assemble|Define) /);
});
test('ISO numerical Review defaults remain recommendations without source minima',()=>{
  for(const plan of CATALOGS['iso-27001'].review_plans){
    expect(plan.cadence_class).toBe('D');
    expect(plan.cadence_references).toEqual([]);
    expect(plan.source_minimum).toBeFalsy();
    expect(plan.basis).toBe('Omnisciente Recommended');
  }
});
test('SOC criteria explain distinct expectations without prescribing controls or samples',()=>{
  const all=CATALOGS['soc-2'].requirements.map(d=>operatorGuidance('soc-2',d));
  expect(new Set(all.map(g=>g.meaning)).size).toBe(61);
  for(const g of all){expect(g.meaning.length).toBeGreaterThan(40);expect(g.implementation).toBeTruthy();expect(g.evidence).toBeTruthy();expect(g.meaning).not.toContain('readiness prompt');}
  expect(operatorStatuses('soc-2').addressed).toBe('Addressed (Readiness)');
});
test('SOC readiness Review defaults do not become source-mandated control frequencies',()=>{
  for(const plan of CATALOGS['soc-2'].review_plans){
    expect(plan.cadence_class).toBe('D');
    expect(plan.cadence_references).toEqual([]);
    expect(plan.source_minimum).toBeFalsy();
    expect(plan.classification).toBe('recommended');
  }
});
test('assessment coverage counts partial assessments, excludes N/A and handles empty data',()=>{
  expect(assessmentProgress([{status:'not_assessed'},{status:'in_progress'},{status:'needs_attention'},{status:'not_applicable'}])).toEqual({total:4,applicable:3,assessed:2,excluded:1});
  expect(assessmentProgress([])).toEqual({total:0,applicable:0,assessed:0,excluded:0});
});
test.each([0,0.5,0.9,1])('coverage remains understandable across every framework at %s assessed',fraction=>{
  for(const catalog of Object.values(CATALOGS)){
    const assessed=Math.floor(catalog.requirements.length*fraction);
    const rows=catalog.requirements.map((d,i)=>({status:i<assessed?(i%2?'addressed':'in_progress'):'not_assessed'}));
    expect(assessmentProgress(rows)).toEqual({total:rows.length,applicable:rows.length,assessed,excluded:0});
  }
});
