import {useLocation} from 'react-router-dom';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {selectedClient} from './clientSelection';
import {brawndoOnboardingGate} from './brawndoOnboarding';

// This controls appearance only. Native controllers retain every permission and write.
export function useBrawndoOnboardingAppearance({profileClientId, loadedClientId, handoffClientId, hasError=false}) {
  const auth=useAuth(), org=useOrg(), {pathname,search}=useLocation();
  return brawndoOnboardingGate({...auth,...org,pathname,profileClientId,loadedClientId,handoffClientId,
    selectedClientId:selectedClient(),routeClientId:new URLSearchParams(search).get('client_id'),
    authLoading:auth.loading,authError:auth.error,orgLoading:org.loading,orgError:org.error,hasError});
}
