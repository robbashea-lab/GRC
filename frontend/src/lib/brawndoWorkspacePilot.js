import configuration from './brawndoWorkspacePilot.json';

// Explicit identity opt-in for presentation only. API authorization is unchanged.
// Staging IDs are added only after provisioning the authorized synthetic tenant.
export function brawndoWorkspacePilot(clientId,user,config=configuration){
  if(!user||!clientId)return false;
  return user.workspace_mode==='demo'
    ?clientId===config.demoClientId
    :config.stagingClientIds.includes(clientId);
}
