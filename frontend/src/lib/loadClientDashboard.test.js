import {loadClientDashboard} from './loadClientDashboard';
import {cisWorkspace} from '@/testUtils/cisExperience';
import {frameworkDashboardFixture} from '@/testUtils/frameworkDashboard';

test('bounded contract uses server totals without fetching complete registers',async()=>{
  const api={get:jest.fn(async path=>({data:path==='/dashboard'?{
    contract_version:2,client_id:'a',applicable_requirements:[],management:{as_of:'2026-09-15'},
    posture:{pastDue:[{id:'1',kind:'tasks',owner_id:'u',record:{client_id:'a',task_id:'1'}}],totals:{pastDue:2000}},
  }:path.includes('/members')?[{user_id:'u',name:'Authorized owner'}]:{state:{completed:true}}}))};
  const result=await loadClientDashboard(api,{clientId:'a',user:{user_id:'u'},scope:{kind:'org'}});
  expect(result.posture.totals.pastDue).toBe(2000);
  expect(result.posture.pastDue).toHaveLength(1);
  expect(result.posture.pastDue[0].owner).toBe('Authorized owner');
  expect(api.get.mock.calls.map(call=>call[0])).toEqual(['/dashboard','/clients/a/members','/onboarding/baseline']);
});

test.each(['iso-27001','soc-2'])('%s retains complete native domain source in the existing scoped read',async frameworkKey=>{
  const {client,source}=frameworkDashboardFixture(frameworkKey),clientId=client.client_id;
  const summary={contract_version:2,client_id:clientId,applicable_requirements:[{client_id:clientId,baseline_key:frameworkKey,baseline_response:'applies'}],posture:{}};
  const api={get:jest.fn(async(path,options)=>({data:path==='/dashboard'?(options.params.work_queue?{client_id:clientId,groups:{all:{items:[],total:0}}}:summary):path.endsWith('/members')?[]:path==='/onboarding/baseline'?{state:client.onboarding_baseline}:path==='/frameworks/summary'?{client_id:clientId,items:[]}:source}))};
  const before=JSON.stringify(source);
  const result=await loadClientDashboard(api,{clientId,scope:{kind:'org'},workQueue:true,includeProgramMetadata:true});
  expect(result.programSources[frameworkKey]).toBe(source);
  expect(result.programSources[frameworkKey].active_definition_ids).toEqual(source.active_definition_ids);
  expect(result.programSources[frameworkKey].implementation_position.scope).toEqual(source.implementation_position.scope);
  expect(api.get.mock.calls.filter(([path])=>path==='/frameworks/'+frameworkKey)).toHaveLength(1);
  expect(api.get.mock.calls.find(([path])=>path==='/frameworks/'+frameworkKey)[1].params).toEqual({client_id:clientId});
  expect(JSON.stringify(source)).toBe(before);
});

test('bounded contract rejects another tenant',async()=>{
  const api={get:jest.fn(async()=>({data:{contract_version:2,client_id:'b'}}))};
  await expect(loadClientDashboard(api,{clientId:'a',scope:{kind:'org'}})).rejects.toThrow('another client');
});

test.each([1,2,3])('CIS IG%s domain source retains native mappings, identities, excluded and malformed records without another fetch',async group=>{
  const source=cisWorkspace('synthetic',group);
  source.assessments[0].status='not_applicable';source.assessments[0].na_rationale='Native retained rationale';
  source.assessments[1].status='unknown-native-value';
  const summary={contract_version:2,client_id:'synthetic',applicable_requirements:[{client_id:'synthetic',baseline_key:'cis-ig1',baseline_response:'applies'}],posture:{}};
  const api={get:jest.fn(async(path,options)=>({data:path==='/dashboard'?(options.params.work_queue?{client_id:'synthetic',groups:{all:{items:[],total:0}}}:summary):path.endsWith('/members')?[]:path==='/onboarding/baseline'?{state:{completed:true,framework_settings:{'cis-ig1':{implementation_group:group}}}}:path==='/frameworks/summary'?{client_id:'synthetic',items:[]}:source}))};
  const result=await loadClientDashboard(api,{clientId:'synthetic',scope:{kind:'org'},workQueue:true,includeProgramMetadata:true});
  expect(result.cisDomainSource).toBe(source);
  expect(result.cisDomainSource.assessments[1].status).toBe('unknown-native-value');
  expect(result.cisDomainSource.assessments[0].na_rationale).toBe('Native retained rationale');
  expect(api.get.mock.calls.filter(([path])=>path==='/frameworks/cis-ig1')).toHaveLength(1);
  expect(result.programMetadata['cis-ig1'].configuration.implementation_group).toBe(group);
});
