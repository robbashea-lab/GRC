import {brawndoWorkspacePilot} from './brawndoWorkspacePilot';
import {isWorkspacePresentation} from './reference';

test('approved Omni experience requires an authenticated explicit client identity, not a name or role',()=>{
  const config={demoClientId:'demo_brawndo',stagingClientIds:['synthetic-stage-id']};
  expect(brawndoWorkspacePilot('demo_brawndo',{workspace_mode:'demo'},config)).toBe(true);
  expect(brawndoWorkspacePilot('synthetic-stage-id',{workspace_mode:'standard'},config)).toBe(true);
  for(const id of ['demo_prestige','demo_dunder','Brawndo','other']){
    expect(brawndoWorkspacePilot(id,{workspace_mode:'demo',name:'Brawndo',role:'super_admin'},config)).toBe(false);
    expect(brawndoWorkspacePilot(id,{workspace_mode:'standard',name:'Brawndo',role:'super_admin'},config)).toBe(false);
  }
  expect(brawndoWorkspacePilot('demo_brawndo',{workspace_mode:'standard'},config)).toBe(false);
  expect(brawndoWorkspacePilot('synthetic-stage-id',{workspace_mode:'demo'},config)).toBe(false);
  expect(brawndoWorkspacePilot('synthetic-stage-id',null,config)).toBe(false);
});

test.each(['demo_dunder','demo_prestige','demo_initech','existing-client','future-client','newly-onboarded-synthetic-client'])('shared presentation does not opt %s into the approved Omni experience',clientId=>{
  for(const workspace_mode of ['demo','standard']){
    const user={workspace_mode,name:'Brawndo',role:'super_admin'};
    expect(isWorkspacePresentation(clientId,user)).toBe(true);
    expect(brawndoWorkspacePilot(clientId,user)).toBe(false);
  }
});
