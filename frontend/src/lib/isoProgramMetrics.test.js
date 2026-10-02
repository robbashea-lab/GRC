import {isoProgramMetrics,isoAssessmentConflicts,auditProgrammeMetrics} from './isoProgramMetrics';
import {auditPackage,initialAuditState} from './isoAudit';
import catalog from '@catalogs/iso27001.json';
import guide from '@catalogs/operatorGuidance/isoRequirementGuide.json';

test('guide covers exact assessable clause and Annex identities with five answers and specific guidance',()=>{
  expect(Object.keys(guide.entries).sort()).toEqual(catalog.requirements.map(r=>r.id).sort());
  expect(catalog.requirements.filter(r=>r.specification==='isms_clause')).toHaveLength(30);
  expect(catalog.requirements.filter(r=>r.specification==='annex_control')).toHaveLength(93);
  for(const definition of catalog.requirements){
    const entry=guide.entries[definition.id];
    for(const key of ['plain','start','evidence','ask','gaps'])expect(entry[key].trim().length).toBeGreaterThan(15);
    for(const key of ['review','evidence_examples','outcome'])expect(entry[key].every(text=>text.trim().length>15)).toBe(true);
    expect(entry.author).toBe('Omnisciente');
  }
  for(const prefix of ['A.5.','A.6.','A.7.','A.8.'])expect(catalog.requirements.filter(r=>r.id.startsWith(prefix)).length).toBe({'A.5.':37,'A.6.':8,'A.7.':14,'A.8.':34}[prefix]);
});

test('applicability decisions do not complete implementation and unresolved or excluded controls remain counted',()=>{
  const control=(status,soa_applicability)=>({specification:'annex_control',status,soa_applicability});
  const metrics=isoProgramMetrics([{specification:'isms_clause',status:'not_assessed'},control('addressed','included'),control('in_progress','included'),control('needs_attention','included'),control('not_assessed','included'),control('addressed','excluded'),control('addressed','')]);
  expect(metrics.soa).toEqual({total:6,applicable:4,excluded:1,undetermined:1,decided:5});
  expect(metrics.annex).toEqual({total:4,implemented:1,partial:1,notImplemented:1,notAssessed:1});
  expect(metrics.requirements).toEqual({total:1,implemented:0,partial:0,notImplemented:0,notAssessed:1});
});

test('quarter progress counts planned checks, independent results and deduplicated historical occurrences',()=>{
  const state=initialAuditState('governance-risk'),item=auditPackage(state.package_key).items[0].key,total=auditPackage(state.package_key).items.length;
  state.items[item]={status:'reviewed',result:'nonconformity',finding_ids:['open-finding']};
  const old={occurrence_id:'old',due_date:'2025-06-30',iso_audit:state,completed_at:'2025-06-30'};
  const reviews=[{review_id:'review',current_occurrence_id:'current',due_date:'2026-03-31',iso_audit:initialAuditState('governance-risk',2),occurrences:[old,old]}];
  const historical=auditProgrammeMetrics(reviews,'2025');
  expect(historical.total).toBe(total);expect(historical.complete).toBe(1);
  expect(historical.quarters[1].records).toHaveLength(1);
  expect(historical.quarters[0].total).toBe(0);
  expect(auditProgrammeMetrics(reviews,'2026').complete).toBe(0);
  state.items[item]={status:'reviewed',result:''};expect(auditProgrammeMetrics(reviews,'2025').complete).toBe(0);
  state.items[item]={status:'not_applicable',na_rationale:'Outside agreed audit scope'};expect(auditProgrammeMetrics(reviews,'2025').complete).toBe(1);
  reviews[0].due_date='2026-99-99';expect(auditProgrammeMetrics(reviews,'2026').total).toBe(0);
});

test('legacy applicability conflicts are surfaced without changing records',()=>{
  const rows=[{specification:'isms_clause',status:'not_applicable'},{specification:'annex_control',status:'not_applicable',soa_applicability:'included'},{specification:'annex_control',status:'not_applicable',soa_applicability:'excluded'}];
  const snapshot=JSON.stringify(rows);
  expect(isoAssessmentConflicts(rows)).toEqual(rows.slice(0,2));
  expect(isoProgramMetrics(rows).annex.implemented).toBe(0);
  expect(JSON.stringify(rows)).toBe(snapshot);
});
