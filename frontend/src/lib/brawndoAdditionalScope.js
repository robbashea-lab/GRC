import {useLocation} from 'react-router-dom';
import {createContext, useContext, useEffect, useState} from 'react';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {selectedClient} from './clientSelection';

export const ADDITIONAL_SECTION_ROUTES = Object.freeze({
  '/policies': 'policies',
  '/vendors': 'vendors',
  '/evidence': 'evidence',
  '/ai-governance': 'ai-governance',
  '/client-profile': 'profile',
  '/contacts': 'contacts',
});

const AdditionalSectionsContext = createContext(null);

export function AdditionalSectionsProvider({children}) {
  const [appearance, publish] = useState(null);
  return <AdditionalSectionsContext.Provider value={{appearance, publish}}>{children}</AdditionalSectionsContext.Provider>;
}

export function useAdditionalSectionsAppearance() {
  return useContext(AdditionalSectionsContext)?.appearance;
}

const appearanceScope = ({pathname, user, workspaceMode, currentClientId}) =>
  JSON.stringify([pathname, user?.user_id, user?.role, user?.workspace_mode, workspaceMode, currentClientId]);

export function additionalAppearanceSurface(context, appearance) {
  if (!appearance || appearance.scope !== appearanceScope(context)) return null;
  const surface = additionalSectionSurface({...context, loadedClientId: appearance.clientId});
  return surface === appearance.surface ? surface : null;
}

// Appearance never grants access; authorized native controllers still own every operation.
export function additionalSectionSurface({pathname, workspaceMode, user, currentClientId,
  currentClient, selectedClientId, routeClientId, loadedClientId, authLoading, authError,
  orgLoading, orgError}) {
  const surface = ADDITIONAL_SECTION_ROUTES[pathname];
  if (!surface || authLoading || authError || orgLoading || orgError
    || workspaceMode !== 'demo' || user?.workspace_mode !== 'demo' || !user?.user_id
    || currentClientId !== 'demo_brawndo' || currentClient?.client_id !== currentClientId
    || selectedClientId !== currentClientId || loadedClientId !== currentClientId
    || routeClientId && routeClientId !== currentClientId
    || currentClient.status !== 'active' || currentClient.archived || currentClient.archived_at) return null;
  return surface;
}

export function useAdditionalSectionsSurface(surface, loadedClientId) {
  const auth = useAuth();
  const org = useOrg();
  const {pathname, search} = useLocation();
  const publish = useContext(AdditionalSectionsContext)?.publish;
  const scope = appearanceScope({...org, ...auth, pathname});
  const enabled = additionalSectionSurface({...org, ...auth, pathname, loadedClientId,
    selectedClientId: selectedClient(), routeClientId: new URLSearchParams(search).get('client_id'),
    authLoading: auth.loading, authError: auth.error, orgLoading: org.loading, orgError: org.error}) === surface;
  // Shell and portals activate only after the mounted native page verifies its loaded identity.
  useEffect(() => {
    if (!publish || !enabled) return undefined;
    publish({surface, clientId: loadedClientId, scope});
    return () => publish(current => current?.scope === scope ? null : current);
  }, [publish, enabled, surface, loadedClientId, scope]);
  return enabled;
}
