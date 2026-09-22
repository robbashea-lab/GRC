import data from './frameworkMappings.json';
import {frameworkDefinition} from './frameworks';
import {mappingsFor} from './frameworkMappings';
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
