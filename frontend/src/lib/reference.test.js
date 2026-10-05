import {isBrawndoReference,isPrestigeReference,isReferencePresentation} from './reference';
import {dashboardPilot} from './dashboardWorkQueue';
test('operational presentation is opt-in by synthetic identity, never name or authorization',()=>{
  for(const id of ['demo_brawndo','demo_prestige']){
    expect(isReferencePresentation(id,{workspace_mode:'demo'})).toBe(true);
    expect(isReferencePresentation(id,{workspace_mode:'standard'})).toBe(false);
  }
  expect(isBrawndoReference('demo_prestige',{workspace_mode:'demo'})).toBe(false);
  expect(isPrestigeReference('demo_brawndo',{workspace_mode:'demo'})).toBe(false);
  expect(isReferencePresentation('custom',{workspace_mode:'demo',name:'Prestige Worldwide'})).toBe(false);
});

test('the shared dashboard supports every selected client in Demo and authenticated mode',()=>{
  for(const demo of [true,false]){
    for(const id of ['demo_brawndo','demo_prestige','normal-synthetic-client'])expect(dashboardPilot(demo,id)).toBe(true);
    for(const id of ['',null,undefined])expect(dashboardPilot(demo,id)).toBe(false);
  }
});
