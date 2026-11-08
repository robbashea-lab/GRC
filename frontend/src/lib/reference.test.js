import {isBrawndoReference,isPrestigeReference,isReferencePresentation,isReferenceWorkflow,isCisReference} from './reference';
import {dashboardPilot} from './dashboardWorkQueue';
test('operational presentation defaults to every current and future selected client',()=>{
  for(const id of ['demo_brawndo','demo_prestige']){
    expect(isReferencePresentation(id,{workspace_mode:'demo'})).toBe(true);
    expect(isReferencePresentation(id,{workspace_mode:'standard'})).toBe(true);
  }
  expect(isBrawndoReference('demo_prestige',{workspace_mode:'demo'})).toBe(false);
  expect(isPrestigeReference('demo_brawndo',{workspace_mode:'demo'})).toBe(false);
  expect(isReferencePresentation('custom',{workspace_mode:'demo',name:'Prestige Worldwide'})).toBe(true);
  expect(isReferencePresentation('future-onboarded-client',{workspace_mode:'standard'})).toBe(true);
  expect(isReferencePresentation(null,{workspace_mode:'standard'})).toBe(false);
  expect(isReferencePresentation('client',null)).toBe(false);
});

test('native CIS workflow follows finalized enrollment for all groups and modes, while non-CIS and Prestige behavior is retained',()=>{
  for(const workspace_mode of ['demo','standard'])for(const implementation_group of [1,2,3]){
    const client={client_id:'independent-client',status:'active',framework_settings:{'cis-ig1':{implementation_group}},onboarding_baseline:{completed:true,requirements:{'cis-ig1':'applies'}}};
    const user={user_id:'operator',role:'platform_admin',workspace_mode};
    expect(isReferencePresentation(client.client_id,user)).toBe(true);
    expect(isCisReference(client.client_id,user,client)).toBe(true);
    expect(isReferenceWorkflow(client.client_id,user,client)).toBe(true);
    expect(isReferenceWorkflow('other-client',user,client)).toBe(false);
    expect(isReferenceWorkflow(client.client_id,user,{...client,archived:true})).toBe(false);
    expect(isReferenceWorkflow(client.client_id,user,{...client,onboarding_baseline:{...client.onboarding_baseline,completed:false}})).toBe(false);
    expect(isReferenceWorkflow(client.client_id,user,{...client,onboarding_baseline:{completed:true,requirements:{'cis-ig1':'does_not_apply'}}})).toBe(false);
    expect(isReferenceWorkflow(client.client_id,{...user,role:'unknown'},client)).toBe(false);
    expect(isReferenceWorkflow(client.client_id,{...user,user_id:null},client)).toBe(false);
    expect(isReferenceWorkflow(client.client_id,user,{...client,framework_settings:{'cis-ig1':{implementation_group:4}}})).toBe(false);
  }
  expect(isReferenceWorkflow('future-onboarded-client',{user_id:'operator',role:'platform_admin',workspace_mode:'standard'})).toBe(false);
  expect(isReferenceWorkflow('demo_brawndo',{user_id:'operator',role:'platform_admin',workspace_mode:'demo'},{client_id:'demo_brawndo',name:'Brawndo',status:'active'})).toBe(false);
  expect(isReferenceWorkflow('demo_dunder',{workspace_mode:'demo'})).toBe(false);
  expect(isReferenceWorkflow('demo_prestige',{workspace_mode:'demo'})).toBe(true);
  expect(isReferenceWorkflow('demo_prestige',{workspace_mode:'standard'})).toBe(false);
});

test('the shared dashboard supports every selected client in Demo and authenticated mode',()=>{
  for(const demo of [true,false]){
    for(const id of ['demo_brawndo','demo_prestige','normal-synthetic-client'])expect(dashboardPilot(demo,id)).toBe(true);
    for(const id of ['',null,undefined])expect(dashboardPilot(demo,id)).toBe(false);
  }
});
