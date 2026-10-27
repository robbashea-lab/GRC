import {cisClientProgram,cisExperienceEligible,cisPresentationEligible,cisWorkspaceMatches,cisDefinitions,cisImplementationGroup} from './cisExperience';
import {validateCisSettings} from './cisScope';
import {cisClient,cisContext,cisWorkspace} from '../testUtils/cisExperience';
import {brawndoCisVisualGate,cisVisualRecordMatches} from './brawndoCisVisual';
import {brawndoDemoDashboard,brawndoDemoProgram} from './brawndoDemoDashboard';
import {brawndoDemoCalendar} from './brawndoDemoCalendar';
import {brawndoDemoReviewsGate} from './brawndoDemoReviews';
import {brawndoDemoActionsGate} from './brawndoDemoActions';
import {brawndoDemoRisksGate} from './brawndoDemoRisks';
import {brawndoFullRecordEligible} from './brawndoFullRecord';
import {brawndoOnboardingGate} from './brawndoOnboarding';
import {visualCorrectionSurface} from './visualCorrectionScope';
import {securityDomainsEnabled,securityDomainModel,cisSecurityDomainMapping} from './brawndoSecurityDomains';

const counts={1:56,2:130,3:153};
test.each([1,2,3])('IG%i uses its exact cumulative catalog in both modes and every appearance route',group=>{
  for(const mode of ['demo','standard']) {
    const clientId=`synthetic-${mode}-${group}`, context=cisContext(clientId,group,mode), data=cisWorkspace(clientId,group);
    expect(cisClientProgram(context.currentClient)).toMatchObject({clientId,implementationGroup:group,version:'8.1'});
    expect(cisExperienceEligible(context)).toBe(true);
    expect(cisWorkspaceMatches(data,clientId)).toBe(true);
    expect(data.active_definition_ids).toEqual(cisDefinitions(group).map(row=>row.id));
    expect(data.active_definition_ids).toHaveLength(counts[group]);
    for(const [pathname,gate,surface] of [['/dashboard',brawndoDemoDashboard,'dashboard'],['/calendar',brawndoDemoCalendar,'calendar'],['/reviews',brawndoDemoReviewsGate,'reviews'],['/action-items',brawndoDemoActionsGate,'actions'],['/risks',brawndoDemoRisksGate,'risks']]) {
      expect(gate({...context,pathname})).toBe(true);
      expect(visualCorrectionSurface({...context,pathname})).toBe(surface);
    }
    expect(brawndoFullRecordEligible({...context,clientId,record:{client_id:clientId}})).toBe(true);
    expect(brawndoOnboardingGate({...context,pathname:'/client-profile',loadedClientId:clientId,profileClientId:clientId,handoffClientId:clientId})).toBe(true);
    const trustedDemo=mode==='demo';
    const loadedScope={clientId,frameworkKey:'cis-ig1',userId:context.user.user_id,role:context.user.role,workspaceMode:mode,userWorkspaceMode:context.user.workspace_mode,trustedDemo};
    expect(brawndoCisVisualGate({...context,pathname:'/compliance/cis-ig1',clientId,frameworkKey:'cis-ig1',data,trustedDemo,loadedScope})).toBe(true);
    const row=data.assessments.at(-1),originKey='verified-origin';
    expect(cisVisualRecordMatches(row,{configuration:data.configuration,current:row,visualOrigin:{key:originKey,selected:true,configured:true,framework:data.framework,programId:`${clientId}:cis-ig1`}},originKey)).toBe(true);
    const rows=data.definitions.map((definition,index)=>({...definition,...data.assessments[index]}));
    expect(securityDomainsEnabled(clientId,'cis-ig1',data,context.user)).toBe(true);
    const domains=securityDomainModel(data,rows,clientId);
    expect(domains.every(domain=>domain.available)).toBe(true);
    expect(domains.flatMap(domain=>domain.rows).map(row=>row.definition_id).sort()).toEqual(data.active_definition_ids.slice().sort());
    expect(new Set(domains.flatMap(domain=>domain.safeguardIds)).size).toBe(counts[group]);
    domains.flatMap(domain=>domain.rows).forEach(row=>expect(rows).toContain(row));
    const programs=[{id:`${clientId}:cis-ig1`,key:'cis-ig1',implementation_position:{scope:{framework_key:'cis-ig1',catalog_version:'8.1',configuration:{implementation_group:group}}}}];
    expect(brawndoDemoProgram(programs,{'cis-ig1':data},clientId)).toMatchObject({client_id:clientId,program_label:`CIS IG${group}`,to:`/compliance/cis-ig1?client_id=${clientId}`});
  }
});

test('missing, unselected and non-CIS configurations cannot inherit CIS capability from a company name',()=>{
  const context=cisContext('demo_brawndo');
  for(const patch of [{onboarding_baseline:null},{framework_settings:{'cis-ig1':null}},{framework_settings:{'cis-ig1':{implementation_group:'2'}}},{onboarding_baseline:{completed:false,requirements:{'cis-ig1':'applies'}}},{onboarding_baseline:{completed:true,requirements:{'cis-ig1':'does_not_apply','iso-27001':'applies'}}}]) {
    expect(cisExperienceEligible({...context,currentClient:{...context.currentClient,...patch,name:'Brawndo'}})).toBe(false);
  }
  for(const patch of [{clients:[]},{selectedClientId:'foreign'},{routeClientId:'foreign'},{loadedClientId:'foreign'},{authLoading:true},{orgError:'denied'},{user:{...context.user,role:'unknown'}},{workspaceMode:'standard'}])expect(cisExperienceEligible({...context,...patch})).toBe(false);
});

test('multi-program clients retain CIS membership without altering their other programs or saved work',()=>{
  const context=cisContext('multi',2,'standard');
  context.currentClient.onboarding_baseline.requirements['iso-27001']='applies';
  context.currentClient.framework_settings['soc-2']={categories:['security']};
  const before=JSON.stringify(context);
  expect(cisExperienceEligible(context)).toBe(true);
  expect(JSON.stringify(context)).toBe(before);
});

test('retained higher-scope rows do not enter the active set and malformed active coverage fails closed',()=>{
  const data=cisWorkspace('retained',1), inactive=cisWorkspace('retained',2).assessments.find(row=>row.definition_id==='1.3');
  data.assessments.push(inactive);data.definitions.push(cisDefinitions(2).find(row=>row.id==='1.3'));
  expect(cisWorkspaceMatches(data,'retained')).toBe(true);
  data.active_definition_ids.push('1.3');
  expect(cisWorkspaceMatches(data,'retained')).toBe(false);
});

test('new native onboarding receives common appearance without granting CIS capability and requires matching loaded identities',()=>{
  const context=cisContext('new',3,'standard');context.currentClient.onboarding_baseline={completed:false,requirements:{}};
  const nativeDraft={requirements:{'cis-ig1':'applies'},framework_settings:{'cis-ig1':{implementation_group:3}}};
  const input={...context,pathname:'/client-profile',loadedClientId:'new',profileClientId:'new',handoffClientId:'new',nativeDraft};
  expect(brawndoOnboardingGate(input)).toBe(true);
  expect(brawndoOnboardingGate({...input,nativeDraft:{}})).toBe(true);
  expect(cisExperienceEligible(input)).toBe(false);
  expect(cisClientProgram(context.currentClient)).toBeNull();
  expect(brawndoOnboardingGate({...input,handoffClientId:'foreign'})).toBe(false);
  expect(brawndoOnboardingGate({...input,clients:[]})).toBe(false);
  for(const patch of [{authLoading:true},{orgLoading:true},{authError:'denied'},{orgError:'denied'},{routeClientId:'foreign'},{loadedClientId:'foreign'}])expect(brawndoOnboardingGate({...input,...patch})).toBe(false);
});

test('IG1 domain mapping remains the approved eleven-domain disjoint partition',()=>{
  expect(cisSecurityDomainMapping(1)).toHaveLength(11);
  expect(cisSecurityDomainMapping(1).flatMap(domain=>domain.safeguardIds)).toHaveLength(56);
});


test('legacy finalized CIS enrollment uses the native IG1 default without mutating configuration or downgrading explicit scope',()=>{
  const context=cisContext('legacy');delete context.currentClient.framework_settings;
  const before=JSON.stringify(context);
  expect(cisClientProgram(context.currentClient).implementationGroup).toBe(1);
  expect(cisExperienceEligible(context)).toBe(true);
  expect(JSON.stringify(context)).toBe(before);
  for(const group of [2,3])expect(cisClientProgram(cisClient('configured',group)).implementationGroup).toBe(group);
  expect(cisClientProgram({...context.currentClient,onboarding_baseline:{completed:true,requirements:{'iso-27001':'applies'}}})).toBeNull();
  expect(cisClientProgram({...context.currentClient,framework_settings:{'cis-ig1':{implementation_group:'2'}}})).toBeNull();
});


test('common onboarding appearance preserves native IG1 default and malformed draft-group validation',()=>{
  const context=cisContext('new-native','1','standard');context.currentClient.onboarding_baseline={completed:false,requirements:{}};
  const nativeDraft={requirements:{'cis-ig1':'applies'}};
  const input={...context,pathname:'/client-profile',loadedClientId:'new-native',profileClientId:'new-native',handoffClientId:'new-native',nativeDraft};
  expect(brawndoOnboardingGate(input)).toBe(true);
  expect(cisImplementationGroup({framework_settings:nativeDraft.framework_settings})).toBe(1);
  for(const implementation_group of [null,undefined,'1',0,4,true]){
    const framework_settings={'cis-ig1':{implementation_group}};
    expect(brawndoOnboardingGate({...input,nativeDraft:{...nativeDraft,framework_settings}})).toBe(true);
    expect(cisImplementationGroup({framework_settings})).toBeNull();
    expect(()=>validateCisSettings(framework_settings)).toThrow('CIS implementation group is not available');
  }
  expect(brawndoOnboardingGate({...input,clients:[]})).toBe(false);
  expect(brawndoOnboardingGate({...input,nativeDraft:{requirements:{'cis-ig1':'does_not_apply'}}})).toBe(true);
  expect(cisExperienceEligible(input)).toBe(false);
});


test('malformed top-level CIS settings deny capability while common appearance remains independent',()=>{
  for(const framework_settings of [null,[],['cis-ig1'],'cis-ig1',1,true]) {
    const client={...cisClient(),framework_settings};
    expect(cisClientProgram(client)).toBeNull();
    const context=cisContext();context.currentClient=client;
    expect(cisExperienceEligible(context)).toBe(false);
    expect(()=>validateCisSettings(framework_settings)).toThrow();
    expect(brawndoOnboardingGate({...context,pathname:'/client-profile',loadedClientId:client.client_id,profileClientId:client.client_id,handoffClientId:client.client_id,
      nativeDraft:{requirements:{'cis-ig1':'applies'},framework_settings}})).toBe(true);
  }
});


test('authoritative native program descriptor remains independent of editable onboarding drafts',()=>{
  const client=cisClient('native-program',2);
  client.cis_program={client_id:client.client_id,program_id:client.client_id+':cis-ig1',framework_key:'cis-ig1',version:'8.1',selected:true,implementation_group:2};
  client.onboarding_baseline={completed:true,requirements:{'cis-ig1':'does_not_apply'}};
  expect(cisClientProgram(client)).toMatchObject({clientId:client.client_id,implementationGroup:2});
  client.onboarding_baseline.requirements['cis-ig1']='applies';
  expect(cisClientProgram({...client,cis_program:{...client.cis_program,selected:false}})).toBeNull();
  for(const patch of [{client_id:'foreign'},{program_id:'foreign:cis-ig1'},{framework_key:'soc-2'},{version:'8.0'},{implementation_group:1},{implementation_group:'2'},{selected:'true'}]) {
    expect(cisClientProgram({...client,cis_program:{...client.cis_program,...patch}})).toBeNull();
  }
  for(const cis_program of [null,undefined,[],true,'CIS'])expect(cisClientProgram({...client,cis_program})).toBeNull();
  expect(cisClientProgram({...client,framework_settings:{'cis-ig1':{implementation_group:3}}})).toBeNull();
});


test('native onboarding client status receives CIS appearance without changing lifecycle state or allowing inactive clients',()=>{
  const context=cisContext('native-new',3,'standard');context.currentClient.status='onboarding';
  const before=JSON.stringify(context);
  expect(cisExperienceEligible(context)).toBe(true);
  const input={...context,pathname:'/client-profile',loadedClientId:'native-new',profileClientId:'native-new',handoffClientId:'native-new'};
  expect(brawndoOnboardingGate(input)).toBe(true);
  expect(JSON.stringify(context)).toBe(before);
  for(const status of ['inactive','paused','archived',undefined])expect(cisExperienceEligible({...context,currentClient:{...context.currentClient,status}})).toBe(false);
  context.currentClient.onboarding_baseline={completed:false,requirements:{}};
  expect(brawndoOnboardingGate({...input,currentClient:context.currentClient,nativeDraft:{requirements:{'cis-ig1':'applies'}}})).toBe(true);
});


test('record-free retained presentation survives only background org loading, never unresolved or invalid identity',()=>{
  const context={...cisContext(),orgLoading:true,loadedClientId:null};
  expect(cisExperienceEligible(context)).toBe(false);
  expect(cisPresentationEligible(context)).toBe(true);
  for(const patch of [{currentClient:null},{clients:[]},{selectedClientId:'foreign'},{routeClientId:'foreign'},
    {user:null},{authLoading:true},{authError:'Denied'},{orgError:'Unavailable'},
    {user:{...context.user,workspace_mode:'standard'}},
    {currentClient:{...context.currentClient,status:'archived'}},
    {currentClient:{...context.currentClient,onboarding_baseline:{completed:true,requirements:{'iso-27001':'applies'}}}}]){
    expect(cisPresentationEligible({...context,...patch})).toBe(false);
  }
});
