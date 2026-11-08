import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';

let mockUser,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:false}));
jest.mock('react-router-dom',()=>({Link:({children})=><span>{children}</span>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('./EvidencePanel',()=>()=>null);

const vendorPurpose='Manage the vendor relationship, assurance documents and independent review and contract schedules.';
const actionPurpose='Document assigned work and its original source, retain evidence, and complete work separately from Finding validation.';
let root,container;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  sessionStorage.clear();localStorage.clear();
  mockUser={user_id:'synthetic_admin',role:'super_admin',workspace_mode:'standard'};mockOrg={};
  api.get.mockImplementation(async path=>({data:path==='/related'?{}:path==='/onboarding/state'?{assessments:[]}:[]}));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{
  await act(async()=>root.unmount());container.remove();
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  jest.clearAllMocks();
});

const description=dialog=>document.getElementById(dialog.getAttribute('aria-describedby'));
const render=props=>act(async()=>root.render(<RecordDrawer open onOpenChange={jest.fn()} {...props}/>));

test.each([
  ['Dunder Demo','demo_dunder','demo',false],
  ['nonreference normal client','synthetic_vendor_client','standard',false],
  ['Brawndo Demo','demo_brawndo','demo',true],
  ['Prestige Demo','demo_prestige','demo',true],
  ['configured normal CIS IG2','synthetic_cis_ig2','standard',true,2],
  ['configured Demo CIS IG3','synthetic_cis_ig3','demo',true,3],
])('%s announces Vendor purpose without changing workflow tabs',async(name,clientId,mode,reference,group=1)=>{
  mockUser.workspace_mode=mode;
  const client=reference&&clientId!=='demo_prestige'?cisClient(clientId,group):{client_id:clientId,name,status:'active'};
  mockOrg={currentClientId:clientId,currentClient:client,clients:[client]};
  const vendor={vendor_id:'synthetic_vendor',client_id:clientId,name:'Fixture Vendor',service:'Hosting',status:'active',assurance_records:[]};
  await render({kind:'vendors',clientId,record:vendor});
  const dialog=document.querySelector('[data-testid="vendors-drawer"]');
  expect(dialog.getAttribute('role')).toBe('dialog');
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toBe(vendor.name);
  expect(description(dialog).textContent).toBe(vendorPurpose);
  expect(description(dialog).classList.contains('sr-only')).toBe(true);
  expect(dialog.querySelector('[data-testid="tab-assurance"]').textContent).toBe(reference?'Security Assurance Reviews':'Security Assurance');
  for(const tab of ['evidence','comments'])expect(!!dialog.querySelector(`[data-testid="tab-${tab}"]`)).toBe(reference);
});

test('readonly nonreference Vendor retains its disabled save control and correct purpose',async()=>{
  mockUser.role='client_readonly';
  await render({kind:'vendors',clientId:'synthetic_vendor_client',record:{vendor_id:'synthetic_vendor',client_id:'synthetic_vendor_client',name:'Readonly Vendor',status:'active'}});
  const dialog=document.querySelector('[data-testid="vendors-drawer"]');
  expect(description(dialog).textContent).toBe(vendorPurpose);
  expect(dialog.querySelector('[data-testid="drawer-save"]').disabled).toBe(true);
});

test('new Action Item keeps its existing purpose',async()=>{
  await render({kind:'tasks',clientId:'synthetic_vendor_client',record:null});
  expect(description(document.querySelector('[data-testid="tasks-drawer"]')).textContent).toBe(actionPurpose);
});
