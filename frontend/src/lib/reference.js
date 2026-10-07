// Brawndo is the reference workspace. Presentation gating only; never authorization.
import {brawndoWorkspacePilot} from './brawndoWorkspacePilot';
export const isBrawndoReference=(clientId,user)=>brawndoWorkspacePilot(clientId,user);
export const isPrestigeReference=(clientId,user)=>user?.workspace_mode==='demo'&&clientId==='demo_prestige';
// Retain existing client-specific workflows independently of shared presentation.
export const isReferenceWorkflow=(clientId,user)=>isBrawndoReference(clientId,user)||isPrestigeReference(clientId,user);
// Shared presentation defaults; these predicates never grant record access or activate Omni.
export const isWorkspacePresentation=(clientId,user)=>!!user&&!!clientId;
export const isReferencePresentation=isWorkspacePresentation;
export const isReferencePortfolio=user=>!!user;
export const isReferenceRegister=isWorkspacePresentation;
