import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {selectedClient} from './clientSelection';

// Presentation only. Native controllers retain all authorization and save rules.
export function brawndoFullRecordEligible({workspaceMode,user,authLoading,authError,
  currentClient,currentClientId,orgLoading,orgError,selectedClientId,routeClientId,
  clientId,record}) {
  return workspaceMode==='demo' && user?.workspace_mode==='demo' && !!user.user_id
    && !authLoading && !authError && !orgLoading && !orgError
    && currentClientId==='demo_brawndo' && currentClient?.client_id===currentClientId
    && currentClient.status==='active' && !currentClient.archived && !currentClient.archived_at
    && selectedClientId===currentClientId && clientId===currentClientId
    && (!routeClientId || routeClientId===currentClientId)
    && (!record || record.client_id===currentClientId);
}

export function useBrawndoFullRecord(record,clientId) {
  const auth=useAuth(),org=useOrg();
  return brawndoFullRecordEligible({...org,...auth,record,clientId,
    authLoading:auth?.loading,authError:auth?.error,orgLoading:org?.loading,orgError:org?.error,
    selectedClientId:selectedClient(),routeClientId:new URLSearchParams(window.location.search).get('client_id')});
}
