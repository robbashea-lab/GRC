import {cisClient, cisContext} from '../testUtils/cisExperience';
import {visualCorrectionSurface} from './visualCorrectionScope';

const context = {...cisContext(),pathname: '/calendar', workspaceMode: 'demo',
  user: {user_id: 'demo_actor', workspace_mode: 'demo', role: 'super_admin'},
  selectedClientId: 'demo_brawndo', currentClientId: 'demo_brawndo', currentClient:cisClient()};

test('five appearance routes require resolved canonical trusted Demo context', () => {
  for (const pathname of ['/dashboard', '/calendar', '/reviews', '/action-items', '/risks']) {
    expect(visualCorrectionSurface({...context, pathname})).toBeTruthy();
    for (const patch of [{workspaceMode: 'standard'}, {authLoading: true}, {authError: 'denied'},
      {selectedClientId: 'demo_other'}, {selectedClientId: ''}, {routeClientId: 'demo_other'}, {orgLoading: true}, {orgError: 'unavailable'}, {currentClientId: 'new_brawndo'},
      {currentClient: {client_id: 'new_brawndo', name: 'Brawndo', status: 'active'}},
      {currentClient: {...context.currentClient, status: 'archived'}},
      {currentClient: {...context.currentClient, archived_at: '2026-10-16'}},
      {user: {...context.user, workspace_mode: 'standard'}}, {user: {...context.user, user_id: ''}}]) {
      expect(visualCorrectionSurface({...context, pathname, ...patch})).toBeNull();
    }
  }
  expect(visualCorrectionSurface({...context, pathname: '/policies'})).toBeNull();
});

test('Portfolio keeps all authorized internal contexts; Actions retains internal role restriction', () => {
  expect(visualCorrectionSurface({...context, pathname: '/clients', workspaceMode: 'standard',
    currentClientId: 'new_client', currentClient: null})).toBe('portfolio');
  for (const role of ['client_admin', 'client_user', 'client_readonly']) {
    const user = {...context.user, role};
    expect(visualCorrectionSurface({...context, user, pathname: '/clients'})).toBeNull();
    expect(visualCorrectionSurface({...context, user, pathname: '/action-items'})).toBeNull();
  }
});
