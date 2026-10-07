import configuration from './brawndoWorkspacePilot.json';

// Approved Omni artwork/window/free-drag boundary. Shared workspace presentation
// uses reference.js instead; neither predicate grants API authorization.
export function brawndoWorkspacePilot(clientId,user,config=configuration){
  if(!user||!clientId)return false;
  return user.workspace_mode==='demo'
    ?clientId===config.demoClientId
    :config.stagingClientIds.includes(clientId);
}
