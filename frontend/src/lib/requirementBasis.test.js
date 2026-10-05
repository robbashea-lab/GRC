import {CATALOGS} from './frameworks';
import {requirementBasis,nativeClassification,cadenceBasis,basisSummary,referenceUrl,validateGovernanceContext} from './requirementBasis';
import {actionTitle,taskSource} from './actionItems';
test('native classifications do not promote supporting mappings into universal mandates',()=>{
  expect(nativeClassification('hipaa',{specification:'addressable'})).toBe('Addressable specification');
  expect(nativeClassification('iso-27001',{specification:'annex_control'})).toBe('Annex A / SoA');
  expect(nativeClassification('cis-ig1',{implementation_group:1})).toBe('IG1 Safeguard');
  expect(nativeClassification('soc-2',{specification:'common_criterion'})).toBe('Common Criterion');
});
test('multiple assessments group and deduplicate only within the authorized client',()=>{
  const row={client_id:'a',framework_key:'cis-ig1',framework_safeguards:['1.1']};
  const related={framework_assessments:[{client_id:'a',framework_key:'cis-ig1',definition_id:'1.1',framework_assessment_id:'a1'},{client_id:'a',framework_key:'iso-27001',definition_id:'5.2',framework_assessment_id:'a2'},{client_id:'b',framework_key:'hipaa',definition_id:'164.302',framework_assessment_id:'private'}]};
  const groups=requirementBasis('reviews',row,related);
  expect(groups).toHaveLength(2);expect(groups[0].requirements).toHaveLength(1);
  expect(groups[0].requirements[0].assessment.framework_assessment_id).toBe('a1');
});
test('cadence separates configured interval, catalog source and recommended default',()=>{
  const p=CATALOGS['iso-27001'].review_plans[0],row={client_id:'a',framework_key:'iso-27001',framework_plan_key:p.key,framework_safeguards:p.safeguards,recurrence:'quarterly',governance_context:{cadence_source:'organization_defined',cadence_rationale:'Management planning cycle'}};
  const cadence=cadenceBasis(row,requirementBasis('reviews',row));
  expect(cadence.current).toBe('quarterly');expect(cadence.classification).toBe('Organization-defined');
  expect(cadence.sources[0].source).toContain('does not prescribe');
  expect(cadence.sources[0].recommended).toBe(p.default_cadence);
});
test('explicit source minimum is kept separate from operational cadence text',()=>{
  const p=CATALOGS['cis-ig1'].review_plans.find(p=>p.source_minimum),row={framework_key:'cis-ig1',framework_plan_key:p.key,framework_safeguards:p.safeguards,recurrence:'monthly'};
  expect(cadenceBasis(row,requirementBasis('reviews',row)).sources[0].minimum).toBe(p.source_minimum);
  expect(cadenceBasis(row).classification).toContain('not recorded');
});
test('null, missing and unsupported definitions never fabricate claims',()=>{
  expect(requirementBasis('policies',{})).toEqual([]);
  const retained=requirementBasis('reviews',{framework_key:'cmmc',framework_safeguards:['legacy-reference']});
  expect(retained[0].requirements[0].definition.source).toBeUndefined();
  expect(retained[0].requirements[0].classification).toBe('Classification not recorded');
  expect(basisSummary({})).toBe('Basis not recorded');
  expect(basisSummary({governance_context:{category:'organizational'}})).toBe('Organizational requirement');
});
test.each(['javascript:alert(1)','http://example.test','https://user:secret@example.test','not a URL'])('unsafe or unavailable reference stays plain text: %s',url=>expect(referenceUrl(url)).toBeNull());
test('safe reference and validated organization context do not permit mandatory classification',()=>{
  expect(referenceUrl('https://www.iso.org/standard/27001')).toBeTruthy();
  expect(()=>validateGovernanceContext({rationale:'decision',cadence_source:'risk_based'})).not.toThrow();
  for(const value of [{category:'required'},{cadence_source:'regulatory'},{framework:'invented'},{rationale:'x'.repeat(4001)},{reference_url:'javascript:x'}])expect(()=>validateGovernanceContext(value)).toThrow();
});
test('legacy generated title cleanup requires proof, not a matching prefix',()=>{
  expect(actionTitle({title:'Remediate: Gap',title_generated:true})).toBe('Gap');
  expect(actionTitle({title:'Remediate: Deliberate title'})).toBe('Remediate: Deliberate title');
});
test('finding/review legacy ambiguity resolves IDs correctly and unavailable sources stay unavailable',()=>{
  const row={client_id:'a',source:'finding',source_id:'f',finding_id:'f',review_id:'r'};
  const source=taskSource(row,{findings:[{client_id:'a',finding_id:'f',title:'Gap'}],reviews:[{client_id:'a',review_id:'r',title:'Review'}]});
  expect(source.label).toBe('Gap');expect(source.kind).toBe('findings');
  expect(taskSource(row).target).toBeUndefined();
  expect(taskSource(row,{findings:[{client_id:'b',finding_id:'f',title:'Secret'}]}).target).toBeUndefined();
});

 test('IG3 supporting references identify the versioned CIS framework without claiming IG1 scope',()=>{
 const row={framework_key:'cis-ig1',framework_safeguards:['1.5'],recurrence:'custom',custom_recurrence_days:7};
 const groups=requirementBasis('reviews',row);
 expect(groups[0].label).toBe('CIS Controls v8.1');
 expect(groups[0].requirements[0].classification).toBe('IG3 Safeguard');
 expect(basisSummary(row)).toBe('CIS Controls v8.1');
});


test.each([1,2,3])('IG%i Review cadence display excludes higher-group references without changing stored work',group=>{
  for(const id of ['6.8','17.9']){
    const plan=CATALOGS['cis-ig1'].review_plans.find(p=>p.cadence_references.some(r=>r.definition_id===id));
    const safeguards=plan.safeguards.filter(id=>CATALOGS['cis-ig1'].requirements.find(d=>d.id===id).implementation_group<=group);
    const row={framework_key:'cis-ig1',framework_plan_key:plan.key,framework_safeguards:safeguards,recurrence:'custom',custom_recurrence_days:42,occurrences:[{occurrence_id:'historical',scheduled_due_date:'2026-09-01'}]};
    const original=JSON.stringify(row);
    expect(cadenceBasis(row,requirementBasis('reviews',row)).sources.flatMap(s=>s.refs).some(r=>r.definition_id===id)).toBe(group===3);
    expect(JSON.stringify(row)).toBe(original);
    const stored={...row,framework_drivers:[{framework_key:'cis-ig1',framework_plan_key:plan.key,framework_safeguards:safeguards,framework_cadence_references:plan.cadence_references}]};
    const before=JSON.stringify(stored);
    expect(cadenceBasis(stored).sources.flatMap(s=>s.refs).some(r=>r.definition_id===id)).toBe(group===3);
    expect(JSON.stringify(stored)).toBe(before);
  }
});
