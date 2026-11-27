import {frameworkCatalog} from './frameworks';
import {assessmentRolloutEligible} from './assessmentRolloutEligibility';

function fixture(framework='cis-ig1',definition='1.1',configuration={implementation_group:1}) {
  const record={client_id:'synthetic-later-enrolled',framework_assessment_id:'owned-assessment',
    framework_key:framework,framework_version:frameworkCatalog(framework).version,definition_id:definition};
  return {clientId:record.client_id,record,current:{...record},user:{user_id:'reader',role:'client_readonly'},
    ctx:{current:{...record},framework:{key:framework,version:record.framework_version},
      programSelected:true,programConfigured:true,configuration}};
}

test.each(['demo','authenticated'])('shared presentation is name-independent and keeps %s read-only actors read-only',mode=>{
  const input=fixture();input.user.workspace_mode=mode;
  expect(assessmentRolloutEligible(input)).toBe(true);
  expect(input.user.role).toBe('client_readonly');
});

test('requires live configured enrollment and matching tenant/record/version',()=>{
  for(const mutate of [
    i=>{i.ctx.programSelected=false;},i=>{i.ctx.programConfigured=false;},
    i=>{i.current.client_id='foreign';},i=>{i.ctx.current.framework_assessment_id='other';},
    i=>{i.current.definition_id='1.2';},i=>{i.record.framework_version='unrecognized';},
    i=>{i.ctx.framework.key='soc-2';},i=>{i.user.status='disabled';},i=>{i.user=null;},
  ]){const input=fixture();mutate(input);expect(assessmentRolloutEligible(input)).toBe(false);}
});

test('cumulative CIS scope and opt-in SOC categories remain native',()=>{
  const added=frameworkCatalog('cis-ig1').requirements.find(row=>row.implementation_group===3);
  const input=fixture('cis-ig1',added.id,{implementation_group:1});
  expect(assessmentRolloutEligible(input)).toBe(false);
  input.ctx.configuration.implementation_group=3;
  expect(assessmentRolloutEligible(input)).toBe(true);
  const soc=fixture('soc-2','P1.1',{categories:['security']});
  expect(assessmentRolloutEligible(soc)).toBe(false);
  soc.ctx.configuration.categories.push('privacy');
  expect(assessmentRolloutEligible(soc)).toBe(true);
  expect(assessmentRolloutEligible(fixture('iso-27001','4.1',{}))).toBe(true);
});
