import {isBrawndoReference,isPrestigeReference,isReferencePresentation} from './reference';
import {dashboardPilot} from './dashboardWorkQueue';
test('operational presentation is opt-in by synthetic identity, never name or authorization',()=>{
  for(const id of ['demo_brawndo','demo_prestige']){
    expect(isReferencePresentation(id,{workspace_mode:'demo'})).toBe(true);
    expect(isReferencePresentation(id,{workspace_mode:'standard'})).toBe(false);
    expect(dashboardPilot(true,id)).toBe(true);
    expect(dashboardPilot(false,id)).toBe(false);
  }
  expect(isBrawndoReference('demo_prestige',{workspace_mode:'demo'})).toBe(false);
  expect(isPrestigeReference('demo_brawndo',{workspace_mode:'demo'})).toBe(false);
  expect(isReferencePresentation('custom',{workspace_mode:'demo',name:'Prestige Worldwide'})).toBe(false);
});
