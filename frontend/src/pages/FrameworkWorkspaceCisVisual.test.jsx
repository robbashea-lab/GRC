import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkWorkspace from './FrameworkWorkspace';
import {cis,FRAMEWORKS} from '@/lib/frameworks';
import api from '@/lib/api';

let mockAuth,mockOrg,mockLocation,mockMounts,mockUnmounts,mockOmniProps,mockRegisterProps;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,default:{get:jest.fn()},formatError:error=>error.message}));
jest.mock('@/components/GuidedAssessor',()=>props=>{mockOmniProps=props;return null;});
jest.mock('@/components/SocGuidedAssessor',()=>()=>null);
jest.mock('@/components/BrawndoCisControls',()=>({...jest.requireActual('@/components/BrawndoCisControls'),__esModule:true,default:()=>null}));
jest.mock('@/components/BrawndoSecurityDomains',()=>()=>null);
jest.mock('@/components/BrawndoCisOverview',()=>({__esModule:true,default:()=>null,AssessmentOverview:()=>null,BrawndoCisHeader:()=>null,FrameworkHeader:()=>null}));
// Register rendering has its own real-component suite; this boundary observes page context only.
jest.mock('@/components/BrawndoCisVisualRegister',()=>({__esModule:true,
  default:props=>{mockRegisterProps=props;return <div data-testid="register-boundary" data-control-key={props.controlKey||''}/>;},
  CisVisualHeader:()=>null,CisVisualSnapshot:()=>null,
}));
// This observable controller boundary proves mount/draft continuity, not native command persistence.
jest.mock('@/components/FrameworkDrawer',()=>function Drawer({record,onSaved,onManage,recordManagement,onOpenChange,breadcrumb}){
  const React=require('react'),[draft,setDraft]=React.useState('');
  const identity=record.framework_assessment_id+(recordManagement?':manage':':assessment');
  React.useEffect(()=>{mockMounts.push(identity);return()=>mockUnmounts.push(identity);},[identity]);
  return <section data-testid={recordManagement?'management-boundary':'assessment-boundary'} data-assessment-id={record.framework_assessment_id}>
    <textarea aria-label={recordManagement?'Management draft':'Assessment draft'} value={draft} onChange={event=>setDraft(event.target.value)}/>
    <button type="button" onClick={onSaved}>Refresh linked context</button>
    {onManage&&<button type="button" onClick={onManage}>Manage from assessment</button>}
    <button type="button" onClick={()=>onOpenChange(false)}>Close boundary</button>
    {breadcrumb?.filter(item=>item.onClick).map(item=><button type="button" key={item.label} data-breadcrumb onClick={item.onClick}>{item.label}</button>)}
  </section>;
});
jest.mock('react-router-dom',()=>({
  useSearchParams:()=>{const [params,set]=require('react').useState(mockLocation.params);return [params,(next,options={})=>{mockLocation.search='?'+String(next);mockLocation.state=options.state??null;set(new URLSearchParams(next));}];},
  useLocation:()=>mockLocation,useNavigate:()=>jest.fn(),Link:({to,children})=><a href={to}>{children}</a>,
}),{virtual:true});

function fixture(){
  const definitions=cis.requirements.filter(row=>row.implementation_group===1);
  const assessments=definitions.map(definition=>({framework_assessment_id:'native-'+definition.id,
    client_id:'demo_brawndo',framework_key:'cis-ig1',framework_version:'8.1',definition_id:definition.id,
    status:'not_assessed',verification:'not_verified',implementation:'',assessment_history:[]}));
  return {framework:{...FRAMEWORKS.find(row=>row.key==='cis-ig1')},selected:true,configured:true,
    configuration:{implementation_group:1},active_definition_ids:definitions.map(row=>row.id),definitions,assessments,work:{},
    implementation_position:{program_id:'demo_brawndo:cis-ig1',availability:'available',total:56,denominator:56,implemented:0,excluded:0,
      counts:[{key:'addressed',count:0},{key:'in_progress',count:0},{key:'needs_attention',count:0},{key:'not_assessed',count:56}]}};
}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
let root,host,data;
const render=()=>act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="demo_brawndo"/>));
async function click(button){expect(button).toBeTruthy();await act(async()=>button.click());}
async function edit(input,value){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
const expectVisual=()=>{expect(host.querySelector('.brawndo-cis-visual')).toBeTruthy();expect(document.body.dataset.brawndoCisVisual).toBe('true');};

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();sessionStorage.setItem('grc_client_id','demo_brawndo');
  mockAuth={user:{user_id:'visual-refresh-actor',workspace_mode:'demo',role:'super_admin'},workspaceMode:'demo',loading:false};
  const client={client_id:'demo_brawndo',name:'Brawndo',status:'active'};
  mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false};
  mockLocation={pathname:'/compliance/cis-ig1',search:'?assessment=native-1.1',params:new URLSearchParams('assessment=native-1.1'),state:null};
  mockMounts=[];mockUnmounts=[];mockOmniProps=null;mockRegisterProps=null;data=fixture();api.get.mockResolvedValue({data});
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});

test.each([false,true])('same-origin linked refresh retains appearance and the %s management controller draft through a deferred response',async management=>{
  await render();expectVisual();
  if(management)await click([...host.querySelectorAll('button')].find(button=>button.textContent==='Manage from assessment'));
  const boundary=host.querySelector(`[data-testid="${management?'management':'assessment'}-boundary"]`),input=boundary.querySelector('textarea');
  await edit(input,'Unsaved native draft retained during linked refresh');
  const mounts=[...mockMounts],unmounts=[...mockUnmounts],pending=deferred();api.get.mockImplementationOnce(()=>pending.promise);
  await click(boundary.querySelector('button'));
  expectVisual();expect(input.isConnected).toBe(true);expect(input.value).toBe('Unsaved native draft retained during linked refresh');
  expect(mockMounts).toEqual(mounts);expect(mockUnmounts).toEqual(unmounts);
  await act(async()=>pending.resolve({data:fixture()}));
  expectVisual();expect(input.isConnected).toBe(true);expect(input.value).toBe('Unsaved native draft retained during linked refresh');
  expect(mockMounts).toEqual(mounts);expect(mockUnmounts).toEqual(unmounts);
});

test('Manage transitions to the exact manager and unmounts the selected controller before returning to the program',async()=>{
  await render();const selected=host.querySelector('[data-testid="assessment-boundary"]');
  await click([...selected.querySelectorAll('button')].find(button=>button.textContent==='Manage from assessment'));
  expect(selected.isConnected).toBe(false);expect(mockUnmounts).toEqual(['native-1.1:assessment']);
  const manager=host.querySelector('[data-testid="management-boundary"]');
  expect(manager.dataset.assessmentId).toBe('native-1.1');expect(mockLocation.search).not.toContain('assessment=');
  await click([...manager.querySelectorAll('button')].find(button=>button.textContent==='Close boundary'));
  expect(host.querySelector('[data-testid="management-boundary"]')).toBeNull();
  expect(host.querySelector('[data-testid="assessment-boundary"]')).toBeNull();expectVisual();
  expect(mockOmniProps.invitationContext).toBe('program');expect(mockOmniProps.rows).toHaveLength(56);
});

test.each([
  ['Control 1','1',['1.1','1.2'],'control-1'],
  ['CIS IG1','',null,'program'],
])('%s breadcrumb restores the native register and Omnibot context',async(label,controlKey,expectedIds,invitationContext)=>{
  sessionStorage.setItem('framework-workspace:visual-refresh-actor:demo_brawndo:cis-ig1',JSON.stringify({'category:all':['3']}));
  await render();
  await click([...host.querySelectorAll('[data-breadcrumb]')].find(button=>button.textContent===label));
  expect(host.querySelector('[data-testid="assessment-boundary"]')).toBeNull();
  expect(host.querySelector('[data-testid="register-boundary"]').dataset.controlKey).toBe(controlKey);
  expect(mockOmniProps.invitationContext).toBe(invitationContext);
  if(expectedIds)expect(mockOmniProps.rows.map(row=>row.definition_id)).toEqual(expectedIds);
  else expect(mockOmniProps.rows).toHaveLength(56);
  expect(JSON.parse(sessionStorage.getItem('framework-workspace:visual-refresh-actor:demo_brawndo:cis-ig1'))['category:all']).toEqual(controlKey?[controlKey]:[]);
});

test('Control breadcrumb clears restrictive filters after a refreshed safeguard leaves the current view',async()=>{
  await render();
  await act(async()=>mockRegisterProps.onFilter('not_assessed'));
  await act(async()=>mockRegisterProps.onSearch('Detailed Enterprise Asset'));
  expect(mockRegisterProps.visible.map(row=>row.definition_id)).toEqual(['1.1']);
  data={...data,assessments:data.assessments.map(row=>row.definition_id==='1.1'?{...row,status:'addressed'}:row),
    implementation_position:{...data.implementation_position,implemented:1,
      counts:data.implementation_position.counts.map(item=>({...item,count:item.key==='addressed'?1:item.key==='not_assessed'?55:item.count}))}};
  api.get.mockResolvedValue({data});
  await click([...host.querySelector('[data-testid="assessment-boundary"]').querySelectorAll('button')].find(button=>button.textContent==='Refresh linked context'));
  expect(mockRegisterProps.visible).toHaveLength(0);
  expect(mockRegisterProps.filter).toBe('not_assessed');expect(mockRegisterProps.search).toBe('Detailed Enterprise Asset');
  await click([...host.querySelectorAll('[data-breadcrumb]')].find(button=>button.textContent==='Control 1'));
  expect(host.querySelector('[data-testid="assessment-boundary"]')).toBeNull();
  expect(mockRegisterProps.controlKey).toBe('1');expect(mockRegisterProps.filter).toBe('all');expect(mockRegisterProps.search).toBe('');
  expect(mockRegisterProps.visible.map(row=>row.definition_id)).toEqual(expect.arrayContaining(['1.1','1.2']));
  expect(mockOmniProps.invitationContext).toBe('control-1');
});

test('actor switch removes appearance while awaiting data loaded for that actor',async()=>{
  await render();expectVisual();
  const pending=deferred();api.get.mockImplementationOnce(()=>pending.promise);
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'new-demo-actor'}};
  await render();
  expect(host.querySelector('.brawndo-cis-visual')).toBeNull();expect(document.body.dataset.brawndoCisVisual).toBeUndefined();
  await act(async()=>pending.resolve({data:fixture()}));
  expectVisual();
});

test('same actor with a changed role must load that role before restoring appearance',async()=>{
  await render();expectVisual();
  const pending=deferred();api.get.mockImplementationOnce(()=>pending.promise);
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_grc_manager'}};
  await render();
  expect(document.body.dataset.brawndoCisVisual).toBeUndefined();
  await act(async()=>pending.resolve({data:fixture()}));
  expectVisual();
});

test('an open manager keeps its native draft when changed role removes appearance and a fresh read restores it',async()=>{
  await render();
  await click([...host.querySelectorAll('button')].find(button=>button.textContent==='Manage from assessment'));
  const input=host.querySelector('[aria-label="Management draft"]');
  await edit(input,'Unsaved manager draft');
  const pending=deferred();api.get.mockImplementationOnce(()=>pending.promise);
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_grc_manager'}};
  await render();
  expect(document.body.dataset.brawndoCisVisual).toBeUndefined();
  expect(input.isConnected).toBe(true);expect(input.value).toBe('Unsaved manager draft');
  await act(async()=>pending.resolve({data:fixture()}));
  expectVisual();expect(input.isConnected).toBe(true);expect(input.value).toBe('Unsaved manager draft');
});

test.each(['workspaceMode','userWorkspaceMode'])('%s round trip cannot reuse the older demo snapshot while fresh reads are pending',async field=>{
  await render();expectVisual();
  const away=deferred(),back=deferred();
  api.get.mockImplementationOnce(()=>away.promise).mockImplementationOnce(()=>back.promise);
  const changeMode=mode=>{mockAuth=field==='workspaceMode'?{...mockAuth,workspaceMode:mode}:{...mockAuth,user:{...mockAuth.user,workspace_mode:mode}};};
  changeMode('standard');await render();
  expect(document.body.dataset.brawndoCisVisual).toBeUndefined();
  changeMode('demo');await render();
  expect(document.body.dataset.brawndoCisVisual).toBeUndefined();
  await act(async()=>away.resolve({data:fixture()}));
  expect(document.body.dataset.brawndoCisVisual).toBeUndefined();
  await act(async()=>back.resolve({data:fixture()}));
  expectVisual();
});

test('including retained native safeguards preserves active register and Omnibot context',async()=>{
  mockLocation={...mockLocation,search:'',params:new URLSearchParams()};
  const retainedDefinitions=cis.requirements.filter(row=>['1.3','1.5'].includes(row.id));
  data={...data,definitions:[...data.definitions,...retainedDefinitions],
    assessments:[...data.assessments,...retainedDefinitions.map(definition=>({
      framework_assessment_id:'native-'+definition.id,client_id:'demo_brawndo',framework_key:'cis-ig1',framework_version:'8.1',
      definition_id:definition.id,status:'addressed',verification:'verified',implementation:'Retained '+definition.id,
      last_assessed:'2026-10-01T12:00:00Z',assessment_history:[],
    }))]};
  api.get.mockResolvedValue({data});
  await render();expectVisual();
  const toggle=[...host.querySelectorAll('label')].find(label=>label.textContent==='Include retained out-of-scope safeguards').querySelector('input');
  expect(toggle.checked).toBe(false);expect(host.querySelector('[aria-labelledby="cis-retained-heading"]')).toBeNull();
  await click(toggle);
  expect(mockRegisterProps.rows).toHaveLength(56);expect(mockOmniProps.rows).toHaveLength(56);
  expect(mockRegisterProps.domains.flatMap(domain=>domain.rows)).toHaveLength(56);
  expect(mockRegisterProps.rows.every(row=>row.implementation_group===1)).toBe(true);
  const retained=host.querySelector('[aria-labelledby="cis-retained-heading"]');
  expect(retained.querySelectorAll('tbody tr')).toHaveLength(2);
  await act(async()=>mockRegisterProps.onSearch('Use a Passive Asset Discovery Tool'));
  expect(retained.querySelectorAll('tbody tr')).toHaveLength(1);
  await click(retained.querySelector('.cis-results-open'));
  expect(host.querySelector('[data-testid="assessment-boundary"]').dataset.assessmentId).toBe('native-1.5');
  expect(mockLocation.search).toContain('assessment=native-1.5');
  expect(host.textContent).toContain('Retained out-of-scope safeguard · history and linked work remain available.');
});
