import {brawndoWorkspacePilot} from './brawndoWorkspacePilot';

test('workspace presentation requires an authenticated explicit client identity, not a name or role',()=>{
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
