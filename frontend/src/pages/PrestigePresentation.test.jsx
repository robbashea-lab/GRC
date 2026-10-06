import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import Contacts from './Contacts';
import RecordDrawer from '@/components/RecordDrawer';
import {SCHEMAS} from '@/lib/schemas';
import api from '@/lib/api';
import ClientSurface from '@/components/ClientSurface';
let mockClient='demo_prestige';
const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient,currentClient:{name:'Prestige Worldwide'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({Link:({children})=><span>{children}</span>,useLocation:()=>({pathname:'/policies',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams())}),{virtual:true});
let root,container;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockClient='demo_prestige';localStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockImplementation(async path=>({data:path==='/frameworks/summary'?{client_id:mockClient,items:[{key:'soc-2',label:'SOC 2'}]}:path==='/related'?{}:path.endsWith('/approval-context')?{status:'draft',history:[],can_configure:false,can_submit:false}:[]}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test.each(['reviews','policies'])('Prestige %s uses the reference register, themes and original fields',async kind=>{
  const page=()=>kind==='reviews'?<ClientSurface><RecordListPage kind={kind}/></ClientSurface>:<RecordListPage kind={kind}/>;
  await act(async()=>root.render(page()));
  expect(container.querySelector('h1').textContent).toBe(kind==='reviews'?'Reviews':'Policies');
  expect(container.querySelector('[data-theme="light"]')).toBeTruthy();
  await act(async()=>container.querySelector('[aria-label="Switch to dark mode"]').click());
  expect(container.querySelector('[data-theme="dark"]')).toBeTruthy();
  mockClient='unconverted-client';
  await act(async()=>root.render(page()));
  // Approved Reviews and Policies layouts apply to every client, including new clients.
  expect(container.querySelector('[data-theme="dark"]')).toBeTruthy();
  expect(document.documentElement.dataset.brawndoPortal).toBe('dark');
  if(kind==='policies'){
    expect([...container.querySelectorAll('th .column-control')].map(n=>n.textContent)).toEqual(['Policy','Framework alignment','Policy status','Owner','Next review','Last review']);
    expect(container.querySelector('[data-testid="policy-view-overdue"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tile-awaiting"]')).toBeNull();
  }
  await act(async()=>container.querySelector('[aria-label="Switch to light mode"]').click());
  expect(container.querySelector('[data-theme="light"]')).toBeTruthy();
  expect(document.documentElement.dataset.brawndoPortal).toBe('light');
});
test('Prestige contacts retain the simplified directory',async()=>{
  await act(async()=>root.render(<Contacts/>));
  expect(container.querySelector('h1').textContent).toBe('Contacts');
  expect(container.textContent).toContain('Platform Access');
  expect(container.textContent).not.toContain('Responsibility Matrix');
});
test('Prestige detail protects unsaved edits and failed saves without changing record identity',async()=>{
  const record={policy_id:'p',client_id:mockClient,title:'Policy',status:'draft',presence:'reported_missing'},close=jest.fn();
  await act(async()=>root.render(<RecordDrawer open kind="policies" record={record} schema={SCHEMAS.policies.fields} clientId={mockClient} users={[]} onOpenChange={close}/>));
  const dialog=document.querySelector('[data-testid="policies-drawer"]');
  expect(dialog.className).toContain('brawndo-cis-assessment');
  const input=dialog.querySelector('[data-testid="field-title"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Updated policy');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>dialog.querySelector('[data-testid="drawer-cancel"]').click());
  expect(document.querySelector('[role="alertdialog"]')).toBeTruthy();
  expect(close).not.toHaveBeenCalled();
  await act(async()=>[...document.querySelectorAll('[role="alertdialog"] button')].find(n=>n.textContent==='Keep editing').click());
  api.patch.mockRejectedValueOnce(new Error('Write failed'));
  await act(async()=>dialog.querySelector('[data-testid="drawer-save"]').click());
  expect(input.value).toBe('Updated policy');expect(close).not.toHaveBeenCalled();
});
