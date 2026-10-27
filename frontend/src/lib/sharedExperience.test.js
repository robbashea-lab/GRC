import {cisContext} from '../testUtils/cisExperience';
import {frameworkCatalog} from './frameworks';
import {cisExperienceEligible} from './cisExperience';
import {sharedClientPrograms,sharedExperienceEligible,sharedPresentationEligible,sharedClientRoute,sharedNativeClientRoute,SHARED_CLIENT_ROUTES} from './sharedExperience';
import {visualCorrectionSurface} from './visualCorrectionScope';
import {brawndoDemoCalendar} from './brawndoDemoCalendar';
import {brawndoDemoReviewsGate} from './brawndoDemoReviews';
import {brawndoDemoActionsGate} from './brawndoDemoActions';
import {brawndoDemoRisksGate} from './brawndoDemoRisks';
import {brawndoFullRecordEligible} from './brawndoFullRecord';
import {additionalSectionSurface,additionalSectionChrome} from './brawndoAdditionalScope';

function enrolled(frameworkKey,mode='standard',role='super_admin') {
  const context=cisContext(`synthetic-${frameworkKey}-${mode}`,1,mode);
  const clientId=context.currentClientId;
  context.user={...context.user,role};
  context.currentClient={client_id:clientId,name:'Arbitrary native organization',status:'active',
    onboarding_baseline:{completed:true,requirements:{[frameworkKey]:'does_not_apply'}},
    framework_settings:frameworkKey==='soc-2'?{'soc-2':{categories:['security','availability','confidentiality']}}:{},
    shared_programs:[{client_id:clientId,program_id:`${clientId}:${frameworkKey}`,framework_key:frameworkKey,
      version:frameworkCatalog(frameworkKey).version,selected:true}]};
  context.clients=[context.currentClient];
  return context;
}

test.each(['iso-27001','soc-2'].flatMap(key=>['demo','standard'].map(mode=>[key,mode])))(
  '%s %s uses finalized authorized enrollment across shared pages without CIS activation or record changes',(key,mode)=>{
    const context=enrolled(key,mode),before=JSON.stringify(context);
    expect(sharedClientPrograms(context.currentClient)).toEqual([expect.objectContaining({clientId:context.currentClientId,
      programId:`${context.currentClientId}:${key}`,frameworkKey:key,version:frameworkCatalog(key).version})]);
    expect(sharedExperienceEligible(context)).toBe(true);
    expect(cisExperienceEligible(context)).toBe(false);
    for(const [pathname,gate,surface] of [['/calendar',brawndoDemoCalendar,'calendar'],['/reviews',brawndoDemoReviewsGate,'reviews'],
      ['/action-items',brawndoDemoActionsGate,'actions'],['/risks',brawndoDemoRisksGate,'risks']]) {
      expect(gate({...context,pathname})).toBe(true);
      expect(visualCorrectionSurface({...context,pathname})).toBe(surface);
    }
    for(const pathname of SHARED_CLIENT_ROUTES) {
      expect(sharedClientRoute(pathname)).toBe(true);
      expect(brawndoFullRecordEligible({...context,pathname,clientId:context.currentClientId,record:{client_id:context.currentClientId}})).toBe(true);
    }
    for(const [pathname,surface] of [['/policies','policies'],['/vendors','vendors'],['/ai-governance','ai-governance']]) {
      expect(additionalSectionChrome({...context,pathname,loadedClientId:null})).toBe(surface);
      expect(additionalSectionSurface({...context,pathname,loadedClientId:context.currentClientId})).toBe(surface);
      expect(additionalSectionSurface({...context,pathname,loadedClientId:'foreign'})).toBeNull();
    }
    for(const pathname of ['/evidence','/contacts','/client-profile','/reports','/systems','/compliance/iso-27001','/compliance/soc-2']) {
      expect(sharedClientRoute(pathname)).toBe(false);
      expect(additionalSectionChrome({...context,pathname})).toBeNull();
      expect(brawndoFullRecordEligible({...context,pathname,clientId:context.currentClientId,record:null})).toBe(false);
    }
    expect(JSON.stringify(context)).toBe(before);
  });

test('withdrawn, incomplete, duplicated and forged program projections never fall back to an editable baseline',()=>{
  const context=enrolled('iso-27001'),client=context.currentClient;
  client.onboarding_baseline.requirements['iso-27001']='applies';
  const descriptor=client.shared_programs[0];
  for(const shared_programs of [undefined,null,{},false,[],[descriptor,descriptor],
    [{...descriptor,selected:false}],[{...descriptor,selected:'true'}],[{...descriptor,client_id:'foreign'}],
    [{...descriptor,program_id:'foreign:iso-27001'}],[{...descriptor,version:'unverified'}]]) {
    expect(sharedClientPrograms({...client,shared_programs})).toEqual([]);
  }
  const compatibility={...client};delete compatibility.shared_programs;
  expect(sharedClientPrograms(compatibility)).toHaveLength(1);
  expect(sharedClientPrograms({...compatibility,onboarding_baseline:{...compatibility.onboarding_baseline,completed:false}})).toEqual([]);
});

test('scope changes retain exact native SOC categories while malformed settings fail closed',()=>{
  const client=enrolled('soc-2').currentClient;
  for(const categories of [['security'],['security','availability','privacy','confidentiality','processing_integrity']]) {
    expect(sharedClientPrograms({...client,framework_settings:{'soc-2':{categories}}})[0].configuration.categories).toEqual(categories);
  }
  for(const categories of [null,[],['availability'],['security','security'],['security','fake'],['security',{toString:'bad'}],false,'security']) {
    expect(sharedClientPrograms({...client,framework_settings:{'soc-2':{categories}}})).toEqual([]);
  }
  for(const framework_settings of [null,[],false,'soc-2']) expect(sharedClientPrograms({...client,framework_settings})).toEqual([]);
});

test('mixed enrollment keeps independent native program identities and does not require a CIS record',()=>{
  const context=enrolled('iso-27001'),soc=enrolled('soc-2').currentClient.shared_programs[0];
  context.currentClient.shared_programs.push({...soc,client_id:context.currentClientId,program_id:`${context.currentClientId}:soc-2`});
  expect(sharedClientPrograms(context.currentClient).map(program=>program.frameworkKey)).toEqual(['iso-27001','soc-2']);
  const cis=cisContext('mixed',3,'standard').currentClient;
  cis.shared_programs=[...context.currentClient.shared_programs.map(program=>({...program,client_id:'mixed',program_id:`mixed:${program.framework_key}`}))];
  expect(sharedClientPrograms(cis).map(program=>program.frameworkKey)).toEqual(['cis-ig1','iso-27001','soc-2']);
  expect(cisExperienceEligible({...cisContext('mixed',3,'standard'),currentClient:cis})).toBe(true);
});

test('identity denial, loading, stale route and record scope retain the existing fail-closed contract',()=>{
  const context=enrolled('soc-2');
  for(const patch of [{user:null},{user:{...context.user,role:'unknown'}},{authLoading:true},{authError:'denied'},
    {orgLoading:true},{orgError:'denied'},{currentClient:null},{clients:[]},{selectedClientId:'foreign'},
    {routeClientId:'foreign'},{loadedClientId:'foreign'},{currentClient:{...context.currentClient,status:'archived'}}]) {
    expect(sharedExperienceEligible({...context,...patch})).toBe(false);
  }
  expect(sharedPresentationEligible({...context,orgLoading:true,loadedClientId:null})).toBe(true);
  expect(sharedPresentationEligible({...context,orgLoading:true,orgError:'denied'})).toBe(false);
  expect(brawndoFullRecordEligible({...context,pathname:'/reviews',clientId:context.currentClientId,record:{client_id:'foreign'}})).toBe(false);
  const reader=enrolled('iso-27001','standard','client_readonly');
  expect(sharedExperienceEligible(reader)).toBe(true);
  expect(brawndoDemoActionsGate({...reader,pathname:'/action-items'})).toBe(false);
  expect(brawndoDemoReviewsGate({...reader,pathname:'/reviews'})).toBe(true);
});

test('shared shell accepts only existing native client/program route boundaries',()=>{
  for(const route of [...SHARED_CLIENT_ROUTES,'/compliance/cis-ig1','/compliance/iso-27001','/compliance/soc-2']) expect(sharedNativeClientRoute(route)).toBe(true);
  for(const route of ['/clients','/admin/security','/platform/security','/account','/compliance/hipaa','/compliance/iso-27001/other']) expect(sharedNativeClientRoute(route)).toBe(false);
});
