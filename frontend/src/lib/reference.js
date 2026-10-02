// Brawndo is the reference workspace. Presentation gating only; never authorization.
export const isBrawndoReference=(clientId,user)=>user?.workspace_mode==='demo'&&clientId==='demo_brawndo';
export const isPrestigeReference=(clientId,user)=>user?.workspace_mode==='demo'&&clientId==='demo_prestige';
// The SOC 2 reference workspace follows the client's configured framework, not its name or ID.
export const isReferenceSocAssessment=(clientId,frameworkKey,user)=>user?.workspace_mode==='demo'&&!!clientId&&frameworkKey==='soc-2';
// Opt-in operational presentation; CIS-specific gates remain Brawndo-only.
export const isReferencePresentation=(clientId,user)=>isBrawndoReference(clientId,user)||isPrestigeReference(clientId,user);
// Reference portfolio styling for the demo workspace. Presentation only.
export const isReferencePortfolio=user=>user?.workspace_mode==='demo';
// Reference register pages (Action Items, Risks) for every Demo client. Presentation only.
export const isReferenceRegister=(clientId,user)=>user?.workspace_mode==='demo'&&!!clientId;
