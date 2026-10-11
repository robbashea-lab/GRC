import {isoAuditTiming,isoRecommendedWork} from './isoGuidedProgram';
const date='2026-10-11',control={framework_key:'iso-27001',framework_assessment_id:'control',definition_id:'A.5.1',specification:'annex_control',status:'needs_attention'};
test('SoA dominates and deduplicates a control without misclassifying undecided or excluded implementation',()=>{
  const pending=isoRecommendedWork([control,control],[],{},date);expect(pending).toHaveLength(1);expect(pending[0].view).toBe('soa');
  expect(isoRecommendedWork([{...control,soa_applicability:'excluded',soa_justification:'Outside the ISMS scope with documented risk basis'}],[],{},date)).toHaveLength(0);
  expect(isoRecommendedWork([{...control,soa_applicability:'included',soa_justification:'Risk treatment'}],[],{},date)[0].view).toBe('annex_control');
});
test('actual deadlines, not unfinished quarter, define lateness',()=>{
  expect(isoAuditTiming({due_date:'2026-12-31'},date).key).toBe('upcoming');
  expect(isoAuditTiming({due_date:date},date).label).toBe('Due today');
  expect(isoAuditTiming({due_date:'2026-10-10'},date).key).toBe('overdue');
  expect(isoAuditTiming({due_date:'2026-02-30'},date).key).toBe('unscheduled');
  expect(isoAuditTiming({due_date:'2026-10-10',status:'completed'},date).key).toBe('complete');
  expect(isoAuditTiming({due_date:'2026-08-01',status:'cancelled'},date)).toEqual({key:'cancelled',label:'Cancelled'});
  expect(isoRecommendedWork([],[{review_id:'ended-audit',status:'cancelled',due_date:'2026-08-01',iso_audit:{package_key:'risk'}}],{},date)).toEqual([]);
});
test('scope is ISO only and upcoming audit does not dominate implementation gaps',()=>{
  const requirement={...control,framework_assessment_id:'requirement',definition_id:'4.1',specification:'isms_clause'};
  const rows=isoRecommendedWork([{...control,framework_key:'soc-2'},requirement],[{review_id:'audit',iso_audit:{},due_date:'2026-12-31'}],{},date);
  expect(rows.map(r=>r.key)).toEqual(['requirement','audit:audit']);
});
