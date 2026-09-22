import {CATALOGS} from './frameworks';
import {operatorGuidance,operatorStatuses,assessmentProgress} from './frameworkOperator';

test('CIS guidance covers every existing safeguard without modifying the catalog',()=>{
  const before=JSON.stringify(CATALOGS['cis-ig1']);
  for(const d of CATALOGS['cis-ig1'].requirements){const g=operatorGuidance('cis-ig1',d);expect(g.meaning).toBe(d.guidance);expect(g.implementation.length).toBeGreaterThan(100);expect(g.evidence.length).toBeGreaterThan(50);}
  expect(JSON.stringify(CATALOGS['cis-ig1'])).toBe(before);
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
test('HIPAA explanatory text never substitutes for stored regulatory wording',()=>{
  for(const d of CATALOGS.hipaa.requirements){const g=operatorGuidance('hipaa',d);expect(g.meaning.length).toBeGreaterThan(50);expect(g.meaning).not.toBe(d.guidance);expect(g.implementation).toBeTruthy();expect(g.evidence).toBeTruthy();}
  expect(operatorGuidance('hipaa',CATALOGS.hipaa.requirements.find(d=>d.id==='164.306(d)')).meaning).toContain('does not mean optional');
});
test('ISO clauses and all 93 Annex controls retain distinct usable guidance',()=>{
  const catalog=CATALOGS['iso-27001'];
  for(const d of catalog.requirements){const g=operatorGuidance('iso-27001',d);expect(g.meaning.length).toBeGreaterThan(40);expect(g.implementation).toBeTruthy();expect(g.evidence).toBeTruthy();expect(g.meaning).not.toContain('Omnisciente implementation prompt');}
  expect(catalog.requirements.filter(d=>d.specification==='annex_control')).toHaveLength(93);
});
test('assessment coverage counts partial assessments, excludes N/A and handles empty data',()=>{
  expect(assessmentProgress([{status:'not_assessed'},{status:'in_progress'},{status:'needs_attention'},{status:'not_applicable'}])).toEqual({total:4,applicable:3,assessed:2,excluded:1});
  expect(assessmentProgress([])).toEqual({total:0,applicable:0,assessed:0,excluded:0});
});
