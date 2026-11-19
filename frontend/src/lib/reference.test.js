import {isBrawndoReference,isPrestigeReference,isReferencePresentation,isReferenceWorkflow,isCisReference} from './reference';
import {dashboardPilot} from './dashboardWorkQueue';
import {sharedExperienceEligible} from './sharedExperience';
import {cisContext} from '../testUtils/cisExperience';
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

test('native CIS capability follows enrollment while common workflows keep authorized client identity in every mode',()=>{
  for(const workspace_mode of ['demo','standard'])for(const implementation_group of [1,2,3]){
    const client={client_id:'independent-client',status:'active',framework_settings:{'cis-ig1':{implementation_group}},onboarding_baseline:{completed:true,requirements:{'cis-ig1':'applies'}}};
    const user={user_id:'operator',role:'platform_admin',workspace_mode};
    const before=JSON.stringify({client,user});
    expect(isReferencePresentation(client.client_id,user)).toBe(true);
    expect(isCisReference(client.client_id,user,client)).toBe(true);
    expect(isReferenceWorkflow(client.client_id,user,client)).toBe(true);
    expect(isReferenceWorkflow('other-client',user,client)).toBe(false);
    // Shared layout is independent of enrollment; the actual CIS capability keeps every old negative boundary.
    for(const changedClient of [
      {...client,archived:true},
      {...client,onboarding_baseline:{...client.onboarding_baseline,completed:false}},
      {...client,onboarding_baseline:{completed:true,requirements:{'cis-ig1':'does_not_apply'}}},
      {...client,framework_settings:{'cis-ig1':{implementation_group:4}}},
    ])expect(isCisReference(client.client_id,user,changedClient)).toBe(false);
    expect(isCisReference(client.client_id,{...user,role:'unknown'},client)).toBe(false);
    expect(isReferenceWorkflow(client.client_id,{...user,user_id:null},client)).toBe(false);
    const identity={...cisContext(client.client_id,implementation_group,workspace_mode),user,currentClient:client,clients:[client]};
    expect(sharedExperienceEligible(identity)).toBe(true);
    expect(sharedExperienceEligible({...identity,currentClient:{...client,archived:true}})).toBe(false);
    expect(sharedExperienceEligible({...identity,user:{...user,role:'unknown'}})).toBe(false);
    expect(sharedExperienceEligible({...identity,user:{...user,user_id:null}})).toBe(false);
    expect(sharedExperienceEligible({...identity,currentClientId:'other-client'})).toBe(false);
    expect(JSON.stringify({client,user})).toBe(before);
  }
  expect(isReferenceWorkflow('future-onboarded-client',{user_id:'operator',role:'platform_admin',workspace_mode:'standard'})).toBe(true);
  const general={client_id:'demo_brawndo',name:'Brawndo',status:'active'};
  const operator={user_id:'operator',role:'platform_admin',workspace_mode:'demo'};
  expect(isReferenceWorkflow(general.client_id,operator,general)).toBe(true);
  expect(isCisReference(general.client_id,operator,general)).toBe(false);
  expect(isReferenceWorkflow('demo_dunder',{workspace_mode:'demo'})).toBe(false);
  expect(isReferenceWorkflow('demo_prestige',{workspace_mode:'demo'})).toBe(false);
  expect(isReferenceWorkflow('demo_prestige',{workspace_mode:'standard'})).toBe(false);
  for(const workspace_mode of ['demo','standard'])for(const clientId of ['demo_prestige','demo_dunder','future-general-client']){
    expect(isReferenceWorkflow(clientId,{...operator,workspace_mode})).toBe(true);
  }
});

test('the shared dashboard supports every selected client in Demo and authenticated mode',()=>{
  for(const demo of [true,false]){
    for(const id of ['demo_brawndo','demo_prestige','normal-synthetic-client'])expect(dashboardPilot(demo,id)).toBe(true);
    for(const id of ['',null,undefined])expect(dashboardPilot(demo,id)).toBe(false);
  }
});
