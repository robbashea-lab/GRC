// Brawndo is the reference workspace. Presentation gating only; never authorization.
import {brawndoWorkspacePilot} from './brawndoWorkspacePilot';
import {cisActorMode,cisClientProgram} from './cisExperience';
export const isBrawndoReference=(clientId,user)=>brawndoWorkspacePilot(clientId,user);
export const isPrestigeReference=(clientId,user)=>user?.workspace_mode==='demo'&&clientId==='demo_prestige';
// Resolve saved enrollment from the current authorized client, never a name or request payload.
export const isCisReference=(clientId,user,client)=>client?.client_id===clientId
  && ['active','onboarding'].includes(client.status) && !client.archived && !client.archived_at
  && cisActorMode(user,user?.workspace_mode||'standard') && !!cisClientProgram(client);
// Retain Prestige's existing native workflow independently of the CIS rollout.
export const isReferenceWorkflow=(clientId,user,client)=>isCisReference(clientId,user,client)||isPrestigeReference(clientId,user);
// Shared presentation defaults; these predicates never grant record access or activate Omni.
export const isWorkspacePresentation=(clientId,user)=>!!user&&!!clientId;
export const isReferencePresentation=isWorkspacePresentation;
export const isReferencePortfolio=user=>!!user;
export const isReferenceRegister=isWorkspacePresentation;
