import {sharedAppearanceEligible} from './sharedExperience';
// Appearance only. Native page permissions and record guards remain authoritative.
export function visualCorrectionSurface(context) {
  const {pathname, user, authLoading} = context;
  const internal = ['super_admin', 'platform_admin'].includes(user?.role);
  if (pathname === '/clients') return !authLoading && internal ? 'portfolio' : null;
  const surfaces = {'/dashboard': 'dashboard', '/calendar': 'calendar', '/reviews': 'reviews',
    '/action-items': 'actions', '/risks': 'risks'};
  const surface = surfaces[pathname];
  if (!surface || !sharedAppearanceEligible(context) || surface === 'actions' && !internal) return null;
  return surface;
}
