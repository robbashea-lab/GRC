import {cisContext} from '../testUtils/cisExperience';
import {additionalSectionSurface, additionalAppearanceSurface, additionalSectionChrome, ADDITIONAL_SECTION_ROUTES} from './brawndoAdditionalScope';
import {visualCorrectionSurface} from './visualCorrectionScope';

const context = {...cisContext(), workspaceMode: 'demo',
  user: {user_id: 'demo_actor', workspace_mode: 'demo', role: 'super_admin'},
  currentClientId: 'demo_brawndo', selectedClientId: 'demo_brawndo', loadedClientId: 'demo_brawndo',
  currentClient: {...cisContext().currentClient, name: 'Brawndo'}};

test.each(Object.entries(ADDITIONAL_SECTION_ROUTES))('%s requires resolved authorized demo and matching loaded scope', (pathname, surface) => {
  expect(additionalSectionSurface({...context, pathname})).toBe(surface);
  for (const patch of [{workspaceMode: 'standard'}, {user: null}, {user: {...context.user, user_id: ''}},
    {user: {...context.user, workspace_mode: 'standard'}}, {authLoading: true}, {authError: 'denied'},
    {orgLoading: true}, {orgError: 'unavailable'}, {currentClient: null}, {currentClientId: 'lookalike'},
    {selectedClientId: ''}, {selectedClientId: 'other'}, {routeClientId: 'other'}, {loadedClientId: undefined},
    {loadedClientId: 'other'}, {currentClient: {...context.currentClient, status: 'archived'}},
    {currentClient: {...context.currentClient, archived: true}},
    {currentClient: {...context.currentClient, archived_at: '2026-10-16'}},
    {currentClient: {client_id: 'lookalike', name: 'Brawndo', status: 'active'}}]) {
    expect(additionalSectionSurface({...context, pathname, ...patch})).toBeNull();
  }
  expect(visualCorrectionSurface({...context, pathname})).toBeNull();
});

test('exact routes leave previous surfaces and their Portfolio scope independent', () => {
  for (const pathname of ['/dashboard', '/calendar', '/reviews', '/action-items', '/risks', '/clients', '/policies/archive', '/policies/']) {
    expect(additionalSectionSurface({...context, pathname})).toBeNull();
  }
  expect(visualCorrectionSurface({...context, pathname: '/clients', workspaceMode: 'standard', currentClientId: 'other'})).toBe('portfolio');
});

test('shell rejects prior route or actor publication before effect cleanup', () => {
  const active = {...context, pathname: '/policies'};
  const appearance = {surface: 'policies', clientId: 'demo_brawndo',
    scope: JSON.stringify(['/policies', 'demo_actor', 'super_admin', 'demo', 'demo', 'demo_brawndo'])};
  expect(additionalAppearanceSurface(active, appearance)).toBe('policies');
  for (const patch of [{pathname: '/vendors'}, {user: {...context.user, user_id: 'next_actor'}},
    {user: {...context.user, role: 'client_readonly'}}, {workspaceMode: 'standard'},
    {currentClientId: 'other'}, {routeClientId: 'other'}]) {
    expect(additionalAppearanceSurface({...active, ...patch}, appearance)).toBeNull();
  }
  expect(additionalAppearanceSurface(active, {...appearance, surface: 'vendors'})).toBeNull();
  expect(additionalAppearanceSurface(active, null)).toBeNull();
});

test.each([1,2,3])('configured IG%i receives additional surfaces in both modes',group=>{
  for(const mode of ['demo','standard'])for(const [pathname,surface] of Object.entries(ADDITIONAL_SECTION_ROUTES)){
    const selected=cisContext('synthetic-'+group,group,mode);
    expect(additionalSectionSurface({...selected,pathname,loadedClientId:selected.currentClientId})).toBe(surface);
    expect(additionalSectionSurface({...selected,pathname,loadedClientId:'previous-client'})).toBeNull();
  }
});


test.each(Object.entries(ADDITIONAL_SECTION_ROUTES))('%s chrome is ready before native data without granting loaded appearance', (pathname,surface)=>{
  const pending={...context,pathname,loadedClientId:null};
  expect(additionalSectionChrome(pending)).toBe(surface);
  expect(additionalSectionChrome({...pending,orgLoading:true})).toBe(surface);
  expect(additionalSectionChrome({...pending,orgLoading:true,currentClient:null,clients:[]})).toBeNull();
  expect(additionalSectionSurface(pending)).toBeNull();
  expect(additionalAppearanceSurface(pending,null)).toBeNull();
  for(const patch of [{user:null},{authLoading:true},{authError:'Denied'},{orgError:'Unavailable'},
    {currentClient:null},{selectedClientId:'other'},{routeClientId:'other'},
    {user:{...context.user,workspace_mode:'standard'}},{currentClient:{...context.currentClient,status:'archived'}},
    {currentClient:{...context.currentClient,onboarding_baseline:{completed:true,requirements:{'cis-ig1':'does_not_apply'}}}}]){
    expect(additionalSectionChrome({...pending,...patch})).toBeNull();
  }
  expect(additionalSectionChrome({...pending,pathname:pathname+'/archive'})).toBeNull();
});
