import {cisExperienceEligible} from './cisExperience';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {selectedClient} from './clientSelection';

// Presentation only. Native controllers retain all authorization and save rules.
export function brawndoFullRecordEligible(context) {
  return cisExperienceEligible(context) && context.clientId === context.currentClientId
    && (!context.record || context.record.client_id === context.currentClientId);
}

export function useBrawndoFullRecord(record,clientId) {
  const auth=useAuth(),org=useOrg();
  return brawndoFullRecordEligible({...org,...auth,record,clientId,
    authLoading:auth?.loading,authError:auth?.error,orgLoading:org?.loading,orgError:org?.error,
    selectedClientId:selectedClient(),routeClientId:new URLSearchParams(window.location.search).get('client_id')});
}
