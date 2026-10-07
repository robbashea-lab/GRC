// Brawndo is the reference workspace. Presentation gating only; never authorization.
import {brawndoWorkspacePilot} from './brawndoWorkspacePilot';
export const isBrawndoReference=(clientId,user)=>brawndoWorkspacePilot(clientId,user);
export const isPrestigeReference=(clientId,user)=>user?.workspace_mode==='demo'&&clientId==='demo_prestige';
// Opt-in operational presentation; CIS-specific gates remain Brawndo-only.
export const isReferencePresentation=(clientId,user)=>isBrawndoReference(clientId,user)||isPrestigeReference(clientId,user);
// Reference portfolio styling for the demo workspace. Presentation only.
export const isReferencePortfolio=user=>user?.workspace_mode==='demo';
// Reference register pages for every Demo client. Presentation only.
export const isReferenceRegister=(clientId,user)=>user?.workspace_mode==='demo'&&!!clientId||brawndoWorkspacePilot(clientId,user);
