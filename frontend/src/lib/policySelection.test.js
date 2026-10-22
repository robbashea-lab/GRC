import catalog from '@catalogs/onboardingCatalog.json';
import {mappedPolicyKeys,selectedPolicies} from './policySelection';
import {unansweredPolicies,onboardingPreview} from './onboardingHandoff';

test('legacy absence keeps every optional policy; explicit exclusion is not missing',()=>{
  expect(selectedPolicies(catalog,{})).toEqual(catalog.policies);
  const state={selected_policy_keys:[catalog.policies[0].key],policies:{},requirements:{},reviews:[]};
  expect(unansweredPolicies(catalog,state).map(p=>p.key)).toEqual(state.selected_policy_keys);
  state.policies[state.selected_policy_keys[0]]='no';
  expect(unansweredPolicies(catalog,state)).toEqual([]);
  expect(onboardingPreview(catalog,state,{policies:[],reviews:[],framework_assessments:[]}).policies).toMatchObject({total:1,create:1,no:1});
  expect(()=>selectedPolicies(catalog,{selected_policy_keys:['invented']})).toThrow('Invalid policy selection');
  expect(()=>selectedPolicies(catalog,{selected_policy_keys:[catalog.policies[0].key,catalog.policies[0].key]})).toThrow();
});

test.each([1,2,3])('CIS IG%i selection is mapped and leaves the general catalog available',implementation_group=>{
  const keys=mappedPolicyKeys({requirements:{'cis-ig1':'applies'},framework_settings:{'cis-ig1':{implementation_group}}});
  expect(keys).toHaveLength(10);
  expect(keys).not.toContain('policy-acceptable-use-policy');
  expect(catalog.policies.find(p=>p.key==='policy-acceptable-use-policy')).toBeTruthy();
});
