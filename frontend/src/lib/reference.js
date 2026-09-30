// Brawndo is the reference workspace. Presentation gating only; never authorization.
export const isBrawndoReference=(clientId,user)=>user?.workspace_mode==='demo'&&clientId==='demo_brawndo';
// Reference portfolio styling for the demo workspace. Presentation only.
export const isReferencePortfolio=user=>user?.workspace_mode==='demo';
