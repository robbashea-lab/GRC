import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Evidence from './Evidence';
import api from '@/lib/api';

let mockAuth,mockOrg,mockCompliance,node,root;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/context/ComplianceContext',()=>({useCompliance:()=>mockCompliance}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:error=>error.message}));
jest.mock('@/lib/brawndoAdditionalScope',()=>({useAdditionalSectionsSurface:(surface,loadedClientId)=>!!loadedClientId,useAdditionalSectionsPresentation:()=>true}));
jest.mock('react-router-dom',()=>({Link:({children})=><span>{children}</span>,useLocation:()=>({pathname:'/evidence',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams())}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>()=>null);
jest.mock('@/components/EvidenceItemDrawer',()=>()=>null);

const clientId='new-actual-client';
const client=()=>({client_id:clientId,name:'Synthetic native client',status:'active',cis_program:null});
const enrolled=()=>({...client(),framework_settings:{'cis-ig1':{implementation_group:3}},cis_program:{selected:true,client_id:clientId,program_id:`${clientId}:cis-ig1`,framework_key:'cis-ig1',version:'8.1',implementation_group:3}});
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockAuth={workspaceMode:'demo',user:{user_id:'actor',workspace_mode:'demo',role:'super_admin'}};
  mockOrg={currentClientId:clientId,currentClient:client()};mockCompliance={items:[],loading:false,error:''};
  node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);
  api.get.mockImplementation(async(path,{params}={})=>({data:path==='/evidence/catalog'?{items:[],total:0,page_size:params.page_size,program_counts:{},folder_counts:[],facets:{}}:path==='/reviews'?[]:path==='/frameworks/cis-ig1'?{selected:true,configured:true,configuration:{implementation_group:3},active_definition_ids:[],assessments:[]}:[]}));
});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();});

test.each(['demo','standard'])('normal %s parent supplies only actual CIS enrollment, not draft settings',async mode=>{
  mockAuth={workspaceMode:mode,user:{...mockAuth.user,workspace_mode:mode}};
  mockOrg.currentClient={...client(),framework_settings:{'cis-ig1':{implementation_group:3}},onboarding_baseline:{completed:false,requirements:{'cis-ig1':'applies'}}};
  await act(async()=>root.render(<Evidence/>));
  expect(api.get.mock.calls.some(([path])=>path==='/frameworks/cis-ig1')).toBe(false);
  expect(node.querySelector('[data-testid="evidence-figure-cis"]').textContent).toBe('Framework files0');
  mockOrg.currentClient=enrolled();await act(async()=>root.render(<Evidence/>));
  expect(api.get.mock.calls.filter(([path])=>path==='/frameworks/cis-ig1')).toHaveLength(1);
  expect(node.querySelector('[data-testid="evidence-figure-cis"]').textContent).toBe('CIS IG3 safeguards with evidence0of 0');
});

test('a stale foreign client DTO cannot authorize the selected client CIS request',async()=>{
  const foreign='other-client';mockOrg.currentClient={...enrolled(),client_id:foreign,cis_program:{...enrolled().cis_program,client_id:foreign,program_id:`${foreign}:cis-ig1`}};
  await act(async()=>root.render(<Evidence/>));expect(api.get.mock.calls.some(([path])=>path==='/frameworks/cis-ig1')).toBe(false);
  expect(node.textContent).toContain('Framework files');
});

test('the parent forwards actual enabled zero-count folders and native configuration errors',async()=>{
  mockCompliance={items:[{key:'hipaa',label:'HIPAA native'}],loading:false,error:''};await act(async()=>root.render(<Evidence/>));
  await act(async()=>[...node.querySelectorAll('.bae-folder')].find(button=>button.textContent.startsWith('Frameworks')).click());
  expect(node.querySelector('.bae-subfolders button').textContent).toContain('0');
  mockCompliance={items:[],loading:false,error:'Native configuration failed'};await act(async()=>root.render(<Evidence/>));
  expect(node.textContent).toContain('Framework configuration could not be loaded: Native configuration failed');
  expect(node.querySelector('.bae-subfolders')).toBeNull();
});
