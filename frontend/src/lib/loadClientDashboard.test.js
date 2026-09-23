import {loadClientDashboard} from './loadClientDashboard';

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

test('bounded contract rejects another tenant',async()=>{
  const api={get:jest.fn(async()=>({data:{contract_version:2,client_id:'b'}}))};
  await expect(loadClientDashboard(api,{clientId:'a',scope:{kind:'org'}})).rejects.toThrow('another client');
});
