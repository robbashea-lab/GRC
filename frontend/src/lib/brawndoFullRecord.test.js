import {cisClient, cisContext} from '../testUtils/cisExperience';
import {brawndoFullRecordEligible} from './brawndoFullRecord';

const allowed={...cisContext(),workspaceMode:'demo',user:{user_id:'explorer',role:'super_admin',workspace_mode:'demo'},
  currentClientId:'demo_brawndo',currentClient:cisClient(),
  selectedClientId:'demo_brawndo',clientId:'demo_brawndo',record:{client_id:'demo_brawndo'}};

test('the authorized canonical demo record and its native create flow receive the full editor',()=>{
  expect(brawndoFullRecordEligible(allowed)).toBe(true);
  expect(brawndoFullRecordEligible({...allowed,record:null})).toBe(true);
});
test.each([
  {workspaceMode:'standard'}, {user:{user_id:'explorer',workspace_mode:'standard'}},
  {user:null}, {authLoading:true}, {authError:'denied'}, {orgLoading:true}, {orgError:'denied'},
  {currentClientId:'demo_dunder'}, {currentClient:null},
  {currentClient:{client_id:'lookalike',name:'Brawndo',status:'active'}},
  {currentClient:{...allowed.currentClient,status:'archived'}},
  {currentClient:{...allowed.currentClient,archived_at:'2026-10-01'}},
  {currentClient:{...allowed.currentClient,archived:true}},
  {currentClient:{client_id:'demo_brawndo'}}, {selectedClientId:'demo_dunder'},
  {routeClientId:'denied'}, {clientId:'demo_dunder'}, {record:{client_id:'demo_dunder'}}, {record:{}},
])('fails closed for untrusted, stale or mismatched context %j',change=>{
  expect(brawndoFullRecordEligible({...allowed,...change})).toBeFalsy();
});
