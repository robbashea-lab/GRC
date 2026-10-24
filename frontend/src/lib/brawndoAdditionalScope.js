import {useLocation} from 'react-router-dom';
import {createContext, useContext, useLayoutEffect, useState} from 'react';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {selectedClient} from './clientSelection';
import {cisExperienceEligible,cisPresentationEligible} from './cisExperience';

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

// Route chrome needs only the current authorized enrollment, not a completed page read.
// Loaded page controls and portal appearance keep their separate strict receipt.
export function additionalSectionChrome(context) {
  const identity={...context};
  delete identity.loadedClientId;
  const surface=ADDITIONAL_SECTION_ROUTES[identity.pathname];
  return surface&&cisPresentationEligible(identity)?surface:null;
}

// Appearance never grants access; authorized native controllers still own every operation.
export function additionalSectionSurface({pathname, workspaceMode, user, currentClientId,
  currentClient, clients, selectedClientId, routeClientId, loadedClientId, authLoading, authError,
  orgLoading, orgError}) {
  const surface = ADDITIONAL_SECTION_ROUTES[pathname];
  if (!surface || !cisExperienceEligible({pathname, workspaceMode, user, currentClientId, currentClient,
    clients, selectedClientId, routeClientId, loadedClientId,
    authLoading, authError, orgLoading, orgError})) return null;
  return surface;
}

// Native routes such as Risks can use this only for a record-free pending frame.
export function useCisPresentation() {
  const auth=useAuth(),org=useOrg(),{pathname,search}=useLocation();
  return cisPresentationEligible({...org,...auth,pathname,selectedClientId:selectedClient(),
    routeClientId:new URLSearchParams(search).get('client_id'),authLoading:auth.loading,
    authError:auth.error,orgLoading:org.loading,orgError:org.error});
}

// A record-free loading surface may use the current verified route presentation.
export function useAdditionalSectionsPresentation(surface) {
  const auth=useAuth(),org=useOrg(),{pathname,search}=useLocation();
  return additionalSectionChrome({...org,...auth,pathname,selectedClientId:selectedClient(),
    routeClientId:new URLSearchParams(search).get('client_id'),authLoading:auth.loading,
    authError:auth.error,orgLoading:org.loading,orgError:org.error})===surface;
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
  // Loaded controls and portals activate only after the native page verifies its loaded identity.
  useLayoutEffect(() => {
    if (!publish || !enabled) return undefined;
    publish({surface, clientId: loadedClientId, scope});
    return () => publish(current => current?.scope === scope ? null : current);
  }, [publish, enabled, surface, loadedClientId, scope]);
  return enabled;
}
