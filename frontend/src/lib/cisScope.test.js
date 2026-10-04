import {cisProgramName,cisAvailableGroups} from './cisScope';
import {currentHandoff} from './onboardingHandoff';

test.each([1,2,3])('CIS names reflect group %i without changing identity or enabling it',group=>{
  expect(cisProgramName({key:'cis-ig1',name:'Legacy IG1'},{implementation_group:group})).toBe(`CIS Controls v8.1 IG${group}`);
  const client={client_id:'synthetic',framework_settings:{'cis-ig1':{implementation_group:group}}};
  const snapshot={client,records:{requirements:[{client_id:'synthetic',baseline_key:'cis-ig1',baseline_response:'applies'}],reviews:[],policies:[],framework_assessments:[]}};
  expect(currentHandoff(snapshot,'synthetic').programs[0]).toMatchObject({key:'cis-ig1',name:`CIS Controls v8.1 IG${group}`,label:`CIS IG${group}`});
  expect(cisAvailableGroups()).toEqual([1,2]);
});
test('default and other framework names remain correct',()=>{
  expect(cisProgramName({key:'cis-ig1'})).toBe('CIS Controls v8.1 IG1');
  expect(cisProgramName({key:'hipaa',name:'HIPAA'},{implementation_group:3})).toBe('HIPAA');
});
