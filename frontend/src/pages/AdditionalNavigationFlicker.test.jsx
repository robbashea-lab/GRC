import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AIGovernance from './AIGovernance';
import Evidence from './Evidence';
import Contacts from './Contacts';
import ClientProfile from './ClientProfile';
import api from '@/lib/api';

let mockAuth,mockOrg,mockPath,mockSelected,node,root,requests;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/context/ComplianceContext',()=>({useCompliance:()=>({items:[],loading:false,error:''})}));
jest.mock('@/lib/clientSelection',()=>({selectedClient:()=>mockSelected}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('react-router-dom',()=>({Link:({children,to,...props})=><a href={to} {...props}>{children}</a>,Navigate:()=>null,useLocation:()=>({pathname:mockPath,search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>{
  const [params,setParams]=require('react').useState(new URLSearchParams());
  return [params,next=>setParams(new URLSearchParams(typeof next==='function'?next(params):next))];
}}),{virtual:true});
jest.mock('@/components/AIIntake',()=>({useAIIntake:()=>({}),AIIntakeView:()=>null}));
jest.mock('@/components/ContactAccess',()=>({useContactAccess:clientId=>({status:'ready',clientId,accounts:[]})}));
jest.mock('@/components/AdditionalAI',()=>props=><div data-testid="loaded-additional"><h1>{props.clientName} AI Governance</h1><table><tbody>{props.rows.map(row=><tr key={row.ai_system_id}><td>{row.name}</td></tr>)}</tbody></table></div>);
jest.mock('@/components/AdditionalEvidence',()=>({__esModule:true,initialEvidenceView:()=>({}),default:props=><div data-testid="loaded-additional"><h1>{props.clientName} Evidence Library</h1></div>}));
jest.mock('@/components/BrawndoAdditionalContacts',()=>props=><div data-testid="loaded-additional"><h1>{props.client.name} Contacts</h1><table><tbody>{props.rows.map(row=><tr key={row.contact_id}><td>{row.name}</td></tr>)}</tbody></table></div>);
jest.mock('@/components/ContactWorkspace',()=>({__esModule:true,default:()=>null,ContactAccessPill:()=>null}));
jest.mock('@/components/AIDrawer',()=>()=>null);
jest.mock('@/components/RecordDrawer',()=>()=>null);
jest.mock('@/components/EvidenceItemDrawer',()=>()=>null);
jest.mock('./Onboarding',()=>()=>null);
jest.mock('./PlatformAdmin',()=>({UsersTable:()=>null}));
jest.mock('@/components/ComplianceProfile',()=>()=>null);
jest.mock('@/components/ProgramConfiguration',()=>()=>null);
jest.mock('@/components/OnboardingHandoff',()=>()=>null);
jest.mock('@/components/ClientDialog',()=>()=>null);

const cases=[
  ['AI Governance','/ai-governance',AIGovernance],
  ['Evidence Library','/evidence',Evidence],
  ['Contacts','/contacts',Contacts],
  ['Client Profile','/client-profile',ClientProfile],
];
const client={client_id:'demo_brawndo',name:'Brawndo',status:'active',onboarding_baseline:{completed:true,requirements:{'cis-ig1':'applies'}}};
const response=(path,clientId='demo_brawndo')=>path==='/ai_systems'?[{client_id:clientId,ai_system_id:'ai-one',name:'Verified AI',status:'active'}]
  :path==='/ai-intake'?{client_id:clientId,usage:'yes'}
  :path==='/evidence/catalog'?{items:[{client_id:clientId,evidence_id:'e-one',filename:'Verified.pdf'}],total:1,page_size:5,program_counts:{},folder_counts:[]}
  :path==='/contacts'?[{client_id:clientId,contact_id:'contact-one',name:'Verified contact',status:'active'}]
  :path.endsWith('/profile')?{client_id:clientId,completed:true,profile:{},history:[]}
  :path==='/onboarding/handoff'?{client:{...client,client_id:clientId},records:{requirements:[]}}:[];

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  mockAuth={workspaceMode:'demo',user:{user_id:'actor-one',role:'super_admin',workspace_mode:'demo'},loading:false};
  mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false,refresh:jest.fn()};
  mockSelected=client.client_id;requests=[];localStorage.clear();
  api.get.mockImplementation((path,options)=>new Promise((resolve,reject)=>requests.push({path,options,resolve,reject})));
  node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);
});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();});
const render=async(Component,path)=>{mockPath=path;await act(async()=>root.render(<Component/>));};
const resolveReads=async from=>{await act(async()=>{requests.slice(from).forEach(request=>request.resolve({data:response(request.path)}));});};
function expectPending(title){
  expect(node.querySelector('h1').textContent).toBe(`Brawndo ${title}`);
  const frame=node.querySelector('[data-presentation-state="pending"]');
  expect(frame).not.toBeNull();expect(frame.querySelector('[role="status"]')).not.toBeNull();
  expect(frame.querySelector('table,[role="table"],input,select')).toBeNull();
  expect(frame.querySelectorAll('button')).toHaveLength(0);
  expect(frame.textContent).not.toMatch(/No .* yet|0 files|0 contacts|Verified/);
}

test.each(cases)('%s keeps its qualified heading while reads are pending and shows native loaded content only after acceptance',async(title,path,Component)=>{
  await render(Component,path);expectPending(title);expect(requests.length).toBeGreaterThan(0);
  await resolveReads(0);
  expect(node.querySelector('[data-presentation-state="pending"]')).toBeNull();
  expect(node.querySelector('h1').textContent).toBe(`Brawndo ${title}`);
  expect(node.querySelector(title==='Client Profile'?'.baprof-identity':'[data-testid="loaded-additional"]')).not.toBeNull();
  for(const method of ['post','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test.each(cases)('%s retains the qualified error header and recovers through its native Retry',async(title,path,Component)=>{
  await render(Component,path);
  await act(async()=>requests[0].reject(Error('Synthetic read unavailable')));
  expect(node.querySelector('h1').textContent).toBe(`Brawndo ${title}`);
  const frame=node.querySelector('[data-presentation-state="pending"]');
  expect(frame.querySelector('[role="alert"]').textContent).toContain('Synthetic read unavailable');
  expect(frame.querySelector('table,[role="table"],input,select')).toBeNull();
  const before=requests.length;await act(async()=>frame.querySelector('button').click());
  expectPending(title);expect(requests.length).toBeGreaterThan(before);await resolveReads(before);
  expect(node.querySelector('[data-presentation-state="pending"]')).toBeNull();
});

test.each(cases)('%s does not apply qualified pending chrome when trusted mode or selected client disagrees',async(_title,path,Component)=>{
  mockAuth={...mockAuth,workspaceMode:'standard'};await render(Component,path);
  expect(node.querySelector('[data-presentation-state="pending"]')).toBeNull();
  mockAuth={...mockAuth,workspaceMode:'demo'};mockSelected='different-client';await render(Component,path);
  expect(node.querySelector('[data-presentation-state="pending"]')).toBeNull();
});

test.each(cases)('%s discards a late prior actor response until the new identity has its own accepted read',async(title,path,Component)=>{
  await render(Component,path);const prior=[...requests];
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'actor-two'}};await render(Component,path);expectPending(title);
  await act(async()=>prior.forEach(request=>request.resolve({data:response(request.path)})));
  expectPending(title);expect(node.textContent).not.toMatch(/Verified AI|Verified contact|Verified.pdf/);
  await resolveReads(prior.length);expect(node.querySelector('[data-presentation-state="pending"]')).toBeNull();
});

test('loaded Client Profile retains the same inline draft through a same-scope organization refresh',async()=>{
  await render(ClientProfile,'/client-profile');await resolveReads(0);
  const button=text=>[...node.querySelectorAll('button')].find(element=>element.textContent===text);
  await act(async()=>button('Organization').click());await act(async()=>button('Edit profile section').click());
  const input=node.querySelector('#profile-legal_name'),form=input.closest('form'),reads=api.get.mock.calls.length;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Unsaved legal name');input.dispatchEvent(new Event('input',{bubbles:true}));});
  for(const loading of [true,false]){
    mockOrg={...mockOrg,loading};await render(ClientProfile,'/client-profile');
    expect(node.querySelector('#profile-legal_name')).toBe(input);expect(input.closest('form')).toBe(form);expect(input.value).toBe('Unsaved legal name');
    expect(button('Save profile')).toBeDefined();
  }
  expect(api.get.mock.calls).toHaveLength(reads);
  for(const method of ['post','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'actor-two'}};await render(ClientProfile,'/client-profile');
  expect(input.isConnected).toBe(false);expectPending('Client Profile');
});

const mismatches=[
  ['AI intake from another client','AI Governance','/ai-governance',AIGovernance,'/ai-intake',()=>({client_id:'other-client',usage:'yes'})],
  ['AI intake without an identity','AI Governance','/ai-governance',AIGovernance,'/ai-intake',()=>({usage:'yes'})],
  ['AI intake with a null snapshot','AI Governance','/ai-governance',AIGovernance,'/ai-intake',()=>null],
  ['AI intake with an undefined snapshot','AI Governance','/ai-governance',AIGovernance,'/ai-intake',()=>undefined],
  ['Evidence from another client','Evidence Library','/evidence',Evidence,'/evidence/catalog',()=>({items:[{client_id:'other-client',evidence_id:'wrong',filename:'Unverified record'}]})],
  ['Evidence without a verified item list','Evidence Library','/evidence',Evidence,'/evidence/catalog',()=>({items:null})],
  ['Evidence without a catalog response','Evidence Library','/evidence',Evidence,'/evidence/catalog',()=>null],
  ['Contacts from another client','Contacts','/contacts',Contacts,'/contacts',()=>[{client_id:'other-client',contact_id:'wrong',name:'Unverified record'}]],
  ['Contacts without a verified directory','Contacts','/contacts',Contacts,'/contacts',()=>null],
  ['Profile from another client','Client Profile','/client-profile',ClientProfile,'/clients/demo_brawndo/profile',()=>({client_id:'other-client',completed:true,profile:{organization:{legal_name:'Unverified record'}}})],
  ['Profile handoff from another client','Client Profile','/client-profile',ClientProfile,'/onboarding/handoff',()=>({client:{client_id:'other-client',name:'Unverified record'},records:{requirements:[]}})],
];
test.each(mismatches)('%s produces an explicit verification error and a working Retry instead of indefinite loading',async(_label,title,path,Component,mismatchPath,mismatch)=>{
  await render(Component,path);
  await act(async()=>requests.forEach(request=>request.resolve({data:request.path===mismatchPath?mismatch():response(request.path)})));
  expect(node.querySelector('h1').textContent).toBe(`Brawndo ${title}`);
  const frame=node.querySelector('[data-presentation-state="pending"]');
  expect(frame.querySelector('[role="alert"]').textContent).toContain('could not be verified for this client');
  expect(frame.querySelector('[role="status"],table,[role="table"],input,select')).toBeNull();
  expect(node.textContent).not.toContain('Unverified record');
  const before=requests.length;await act(async()=>frame.querySelector('button').click());expectPending(title);
  await resolveReads(before);expect(node.querySelector('[data-presentation-state="pending"]')).toBeNull();
  for(const method of ['post','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test.each([
  ['Contacts','/contacts',Contacts,'/contacts',[]],
  ['Evidence Library','/evidence',Evidence,'/evidence/catalog',{items:[],total:0,page_size:5,program_counts:{},folder_counts:[]}],
])('%s accepts a verified empty response without treating it as a failed read',async(title,path,Component,emptyPath,empty)=>{
  await render(Component,path);expectPending(title);
  await act(async()=>requests.forEach(request=>request.resolve({data:request.path===emptyPath?empty:response(request.path)})));
  expect(node.querySelector('[data-presentation-state="pending"],[role="alert"]')).toBeNull();
  expect(node.querySelector('[data-testid="loaded-additional"]')).not.toBeNull();
});

test('non-qualified native Evidence reports an invalid current catalog without false zero-count folders',async()=>{
  mockAuth={...mockAuth,workspaceMode:'standard'};await render(Evidence,'/evidence');
  expect(node.querySelector('[data-presentation-state="pending"]')).toBeNull();expect(node.querySelector('.evidence-folder')).toBeNull();
  await act(async()=>requests.forEach(request=>request.resolve({data:{items:null}})));
  expect(node.querySelector('[data-testid="register-load-error"]').textContent).toContain('could not be verified for this client');
  expect(node.querySelector('.evidence-folder,table,[role="table"]')).toBeNull();expect(node.textContent).not.toMatch(/0 files|No evidence yet/);
  for(const method of ['post','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test('non-qualified AI also rejects a null intake before exposing record creation or records',async()=>{
  mockAuth={...mockAuth,workspaceMode:'standard'};await render(AIGovernance,'/ai-governance');
  expect(node.querySelector('[data-testid="new-ai-system"]')).toBeNull();
  await act(async()=>requests.forEach(request=>request.resolve({data:request.path==='/ai-intake'?null:response(request.path)})));
  expect(node.querySelector('[data-testid="register-load-error"]').textContent).toContain('AI intake could not be verified for this client');
  expect(node.querySelector('[data-testid="new-ai-system"],[data-testid="loaded-additional"]')).toBeNull();
  expect(node.textContent).not.toContain('Verified AI');
  for(const method of ['post','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});
