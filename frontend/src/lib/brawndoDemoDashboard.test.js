import {cisClient, cisContext} from '../testUtils/cisExperience';
import {brawndoDemoDashboard, brawndoDemoProgram} from './brawndoDemoDashboard';

const context = () => ({
  ...cisContext(), workspaceMode:'demo', user:{user_id:'demo_user',role:'super_admin',workspace_mode:'demo'},
  currentClientId:'demo_brawndo', currentClient:cisClient(),
  pathname:'/dashboard',
});

// Mirrors the package pilot matrix; authorization is represented by OrgContext's resolved client.
test('only the resolved canonical Explore demo dashboard enables the presentation', () => {
  expect(brawndoDemoDashboard(context())).toBe(true);
  const disabled = [
    {workspaceMode:'standard'},
    {user:{user_id:'demo_user',workspace_mode:'standard'}},
    {user:null}, {user:{workspace_mode:'demo'}},
    {currentClientId:'real_brawndo',currentClient:{client_id:'real_brawndo',name:'Brawndo'}},
    {currentClientId:'demo_initech',currentClient:{client_id:'demo_initech'}},
    {currentClientId:'new_demo_123',currentClient:{client_id:'new_demo_123',name:'Brawndo'}},
    {currentClientId:'new_standard_123',workspaceMode:'standard',currentClient:{client_id:'new_standard_123',name:'Brawndo'}},
    {currentClient:{client_id:'demo_prestige'}}, {currentClient:null},
    {currentClientId:null,currentClient:null},
    {currentClient:{client_id:'demo_brawndo',archived:true}},
    {currentClient:{client_id:'demo_brawndo',archived_at:'2026-10-15'}},
    {currentClient:{client_id:'demo_brawndo',status:'inactive'}},
    {pathname:'/portfolio'}, {pathname:'/compliance/cis-ig1'}, {pathname:'/reviews'},
  ];
  for (const override of disabled) expect(brawndoDemoDashboard({...context(),...override})).toBe(false);
});

function programFixture() {
  return {
    programs:[{id:'demo_brawndo:cis-ig1',key:'cis-ig1',implementation_position:{counts:{implemented:2},scope:{framework_key:'cis-ig1',catalog_version:'8.1',configuration:{implementation_group:1}}}}],
    metadata:{'cis-ig1':{
      selected:true,configured:true,framework:{key:'cis-ig1',version:'8.1'},configuration:{implementation_group:1},
      assessments:[{client_id:'demo_brawndo',framework_key:'cis-ig1',framework_version:'8.1'}],
    }},
  };
}

test('CIS card resolves its actual canonical program and preserves its native current position', () => {
  const {programs,metadata}=programFixture();
  expect(brawndoDemoProgram(programs,metadata,'demo_brawndo')).toEqual({
    client_id:'demo_brawndo',program_id:'demo_brawndo:cis-ig1',program_key:'cis-ig1',framework_key:'cis-ig1',
    program_label:'CIS IG1',scope_label:'CIS Controls v8.1 IG1',to:'/compliance/cis-ig1?client_id=demo_brawndo',
    current:programs[0].implementation_position,
  });
});

test.each([
  ['missing position scope',f=>{delete f.programs[0].implementation_position.scope;}],
  ['wrong position catalog',f=>{f.programs[0].implementation_position.scope.catalog_version='8.0';}],
  ['wrong position group',f=>{f.programs[0].implementation_position.scope.configuration.implementation_group=2;}],
  ['wrong position framework',f=>{f.programs[0].implementation_position.scope.framework_key='soc-2';}],
  ['missing enrollment',f=>{f.programs=[];}],
  ['wrong program client',f=>{f.programs[0].id='other:cis-ig1';}],
  ['wrong program framework',f=>{f.programs[0].key='iso-27001';}],
  ['missing workspace',f=>{f.metadata={};}],
  ['not selected',f=>{f.metadata['cis-ig1'].selected=false;}],
  ['not configured',f=>{f.metadata['cis-ig1'].configured=false;}],
  ['wrong workspace framework',f=>{f.metadata['cis-ig1'].framework.key='iso-27001';}],
  ['wrong group',f=>{f.metadata['cis-ig1'].configuration.implementation_group=2;}],
  ['unvalidated string group',f=>{f.metadata['cis-ig1'].configuration.implementation_group='1';}],
  ['missing configuration',f=>{delete f.metadata['cis-ig1'].configuration;}],
  ['empty assessments',f=>{f.metadata['cis-ig1'].assessments=[];}],
  ['cross-client assessment',f=>{f.metadata['cis-ig1'].assessments[0].client_id='other';}],
  ['wrong assessment framework',f=>{f.metadata['cis-ig1'].assessments[0].framework_key='iso-27001';}],
  ['wrong assessment version',f=>{f.metadata['cis-ig1'].assessments[0].framework_version='8.0';}],
  ['mixed assessment versions',f=>{f.metadata['cis-ig1'].assessments.push({...f.metadata['cis-ig1'].assessments[0],framework_version:'8.0'});}],
])('CIS card fails closed for %s', (_label,change) => {
  const fixture=programFixture();change(fixture);
  expect(brawndoDemoProgram(fixture.programs,fixture.metadata,'demo_brawndo')).toBeNull();
});

test('configured program without a current position retains the honest unavailable state',()=>{
  const {programs,metadata}=programFixture();programs[0].implementation_position=null;
  expect(brawndoDemoProgram(programs,metadata,'demo_brawndo')?.current).toBeNull();
});
