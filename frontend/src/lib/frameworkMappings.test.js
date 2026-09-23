import data from './frameworkMappings.json';
import {CATALOGS,frameworkDefinition} from './frameworks';
import {mappingsFor} from './frameworkMappings';

test('every Review cadence source driver resolves inside its own mapped definitions',()=>{
  const plans=Object.entries(CATALOGS).flatMap(([framework,catalog])=>catalog.review_plans.map(plan=>({framework,plan})));
  expect(plans).toHaveLength(47);
  expect(plans.filter(({plan})=>plan.cadence_class==='A')).toHaveLength(11);
  expect(plans.filter(({plan})=>plan.cadence_class==='D')).toHaveLength(36);
  for(const {framework,plan} of plans){
    for(const id of plan.safeguards)expect(frameworkDefinition(framework,id)).toBeDefined();
    if(plan.cadence_class==='A'){
      expect(plan.cadence_references.length).toBeGreaterThan(0);
      expect(plan.cadence_references.some(ref=>ref.interval===plan.source_minimum)).toBe(true);
      for(const ref of plan.cadence_references){
        expect(plan.safeguards).toContain(ref.definition_id);
        expect(ref.source).toMatch(/^https:\/\//);
        expect(frameworkDefinition(framework,ref.definition_id)).toBeDefined();
      }
    }else{
      expect(plan.cadence_references).toEqual([]);
      expect(plan.source_minimum).toBeFalsy();
      expect(plan.basis.toLowerCase()).toContain('recommend');
    }
  }
});
test('all mappings reference valid current definitions and explicitly partial provenance',()=>{
  expect(data.mappings).toHaveLength(12);
  const identities=new Set();
  for(const m of data.mappings){
    for(const ref of [m.source,m.target])expect(frameworkDefinition(ref.framework,ref.definition)?.source).toMatch(/^https:\/\//);
    expect(m.type).toBe('partial');expect(m.provenance.basis).toContain('not an official crosswalk');expect(m.notes).toBeTruthy();
    identities.add(JSON.stringify([m.source,m.target]));
  }
  expect(identities.size).toBe(12);
});
test('mappings can be viewed from either side without changing assessment state',()=>{
  expect(mappingsFor('nist-csf-2','PR.AA-05')).toHaveLength(4);
  expect(mappingsFor('hipaa','164.308(a)(4)(ii)(B)')[0].other).toEqual({framework:'nist-csf-2',definition:'PR.AA-05'});
  expect(mappingsFor('soc-2','CC1.1')).toEqual([]);
});

test('source-restricted mapping provenance does not claim completed source comparison',()=>{
  const restricted=data.mappings.filter(m=>['iso-27001','soc-2'].includes(m.target.framework));
  expect(restricted).toHaveLength(6);
  for(const m of restricted){
    expect(m.provenance.basis).toContain('requires an authorized source');
    expect(m.provenance.basis).not.toContain('Comparison of the cited source and target');
    expect(m.type).toBe('partial');
  }
});
