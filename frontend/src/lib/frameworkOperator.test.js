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
test('assessment coverage counts partial assessments, excludes N/A and handles empty data',()=>{
  expect(assessmentProgress([{status:'not_assessed'},{status:'in_progress'},{status:'needs_attention'},{status:'not_applicable'}])).toEqual({total:4,applicable:3,assessed:2,excluded:1});
  expect(assessmentProgress([])).toEqual({total:0,applicable:0,assessed:0,excluded:0});
});
