// Appearance only. Native page permissions and record guards remain authoritative.
export function visualCorrectionSurface({pathname, user, workspaceMode, currentClientId, currentClient,
  authLoading, authError, orgLoading, orgError, selectedClientId, routeClientId}) {
  const internal = ['super_admin', 'platform_admin'].includes(user?.role);
  if (pathname === '/clients') return !authLoading && internal ? 'portfolio' : null;
  const surfaces = {'/dashboard': 'dashboard', '/calendar': 'calendar', '/reviews': 'reviews',
    '/action-items': 'actions', '/risks': 'risks'};
  const surface = surfaces[pathname];
  if (!surface || authLoading || authError || orgLoading || orgError
    || workspaceMode !== 'demo' || user?.workspace_mode !== 'demo' || !user.user_id
    || currentClientId !== 'demo_brawndo' || currentClient?.client_id !== currentClientId
    || selectedClientId !== currentClientId || routeClientId && routeClientId !== currentClientId
    || currentClient.status !== 'active' || currentClient.archived || currentClient.archived_at
    || surface === 'actions' && !internal) return null;
  return surface;
}
