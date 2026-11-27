import {policySupportsAssessment,policySupportIds} from './frameworkPolicyLinks';
import {policyAlignment} from './brawndoPolicies';

const policy={client_id:'c',policy_id:'p',baseline_key:'policy-configuration-management-policy',title:'Unrelated title'};
const assessment={client_id:'c',framework_key:'cis-ig1',definition_id:'4.1',framework_assessment_id:'a',related_links:[{kind:'policies',id:'p'}]};
test('explicit cleared and replaced policy identities beat inherited display and catalog associations',()=>{
  expect(policySupportsAssessment(assessment,policy)).toBe(true);
  expect(policySupportsAssessment({...assessment,policy_link_ids:[]},policy)).toBe(false);
  expect(policySupportsAssessment({...assessment,policy_link_ids:['other']},policy)).toBe(false);
  expect(policySupportsAssessment({...assessment,policy_link_ids:['p']},{...policy,baseline_key:undefined,title:'Changed',status:'retired',version:'3'})).toBe(true);
  expect(policySupportsAssessment({...assessment,client_id:'foreign',policy_link_ids:['p']},policy)).toBe(false);
  const retained=['4.2','4.8','4.9','4.10','4.11','12.2','12.3','12.4','12.5','12.6','12.7'];
  expect(policySupportIds(policy,'cis-ig1',[{...assessment,policy_link_ids:[]}])).toEqual(retained);
  expect(policySupportIds(policy,'cis-ig1',[{...assessment,policy_link_ids:['other']}])).toEqual(retained);
  expect(policySupportIds({...policy,policy_id:'other',baseline_key:undefined},'cis-ig1',[{...assessment,policy_link_ids:['other']}])).toEqual(['4.1']);
  expect(policyAlignment(policy,['cis-ig1'],[{...assessment,policy_link_ids:[]}]).map(row=>row.id)).toEqual(['4.2']);
});
test('missing canonical list retains recorded provenance without title inference',()=>{
  expect(policySupportsAssessment({...assessment,related_links:[]},{client_id:'c',policy_id:'manual',title:'Configuration Management Policy'})).toBe(false);
  expect(policySupportsAssessment({...assessment,policy_link_ids:null},policy)).toBe(false);
});
