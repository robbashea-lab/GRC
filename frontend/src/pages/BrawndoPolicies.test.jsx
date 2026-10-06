import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import RecordDrawer from '@/components/RecordDrawer';
import ReviewDrawer from '@/components/ReviewDrawer';
import {SCHEMAS} from '@/lib/schemas';
import api from '@/lib/api';
let mockClient='demo_brawndo';
const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient,currentClient:{name:'Test client'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({Link:({children})=><span>{children}</span>,useLocation:()=>({pathname:'/policies',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams())}),{virtual:true});
jest.mock('@/components/EvidencePanel',()=>()=> <div>Existing evidence panel</div>);
let root,container,rows;
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
const click=node=>act(async()=>node.click());
const input=(node,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockClient='demo_brawndo';mockUser.workspace_mode='demo';localStorage.clear();sessionStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  rows=[{policy_id:'p',client_id:mockClient,title:'Access Policy',status:'draft',presence:'reported_missing',version:'1',onboarding_note:'Preserved historical note'}];
  api.get.mockImplementation(async path=>({data:path==='/policies'?rows:path==='/frameworks/summary'?{client_id:mockClient,items:[]}:path==='/related'?{}:path.endsWith('/approval-context')?{status:'draft',history:[],subject:null,can_configure:false,can_submit:false}:[]}));
  api.patch.mockImplementation(async(path,patch)=>({data:{...rows[0],...patch}}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('approved register has six columns and no summary cards or title metadata across clients',async()=>{
  rows[0].next_review_date='2027-05-20';rows[0].last_reviewed_at='2025-02-10';
  await act(async()=>root.render(<RecordListPage kind="policies"/>));
  const headers=()=>[...container.querySelectorAll('th .column-control')].map(n=>n.textContent);
  expect(headers()).toEqual(['Policy','Framework alignment','Policy status','Owner','Next review','Last review']);
  const cells=container.querySelector('tbody tr').querySelectorAll('td');
  expect(cells[5].textContent).toContain('May 20');expect(cells[6].textContent).toContain('Feb 10');
  expect(container.querySelector('tbody .bpage-meta')).toBeNull();
  expect(container.querySelector('h1').textContent).toBe('Policies');
  expect(container.querySelector('[data-testid="tile-awaiting"]')).toBeNull();
  expect(container.querySelector('[data-testid="policy-view-overdue"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="policies-count"]').textContent).toBe('Showing 1 of 1 policy · next review first');
  await click(container.querySelector('[data-testid="policy-view-approved"]'));
  expect(container.querySelector('tbody').textContent).not.toContain('Access Policy');
  await click(container.querySelector('[data-testid="policy-view-all"]'));
  expect(container.querySelector('tbody').textContent).toContain('Access Policy');
  expect(container.textContent).not.toContain('Review overdue');
  expect(container.querySelector('tbody').textContent).toContain('Needs Creation');
  await input(container.querySelector('[data-testid="policies-search"]'),'unmatched');
  expect(container.querySelector('tbody').textContent).not.toContain('Access Policy');
  mockClient='demo_dunder';rows=rows.map(r=>({...r,client_id:mockClient}));
  await act(async()=>root.render(<RecordListPage kind="policies"/>));
  expect(headers()).toEqual(['Policy','Framework alignment','Policy status','Owner','Next review','Last review']);
  expect(container.querySelector('tbody .bpage-meta')).toBeNull();
});
test('centered policy retains legacy context and protects edits on close and failed save',async()=>{
  const close=jest.fn();
  await act(async()=>root.render(<RecordDrawer open kind="policies" record={rows[0]} schema={SCHEMAS.policies.fields} clientId={mockClient} users={[]} onOpenChange={close}/>));
  const dialog=document.querySelector('[data-testid="policies-drawer"]');
  expect(dialog.className).toContain('brawndo-cis-assessment');
  expect(dialog.querySelector('[data-testid="tab-related"]')).toBeNull();
  expect(dialog.querySelector('[data-testid="field-presence"]')).toBeNull();
  expect(dialog.querySelector('[data-testid="field-onboarding_note"]')).toBeNull();
  expect(dialog.textContent).not.toContain('Preserved historical note');
  expect(dialog.querySelector('[aria-label="Policy approval authority"]')).toBeNull();
  await click(dialog.querySelector('[data-testid="tab-requirements"]'));
  expect(dialog.textContent).toContain('Preserved historical note');
  await click(dialog.querySelector('[data-testid="tab-overview"]'));
  const title=dialog.querySelector('[data-testid="field-title"]');
  await input(title,'Updated Policy');
  await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Cancel'));
  expect(document.querySelector('[role="alertdialog"]')).toBeTruthy();expect(close).not.toHaveBeenCalled();
  await click([...document.querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent==='Keep editing'));
  api.patch.mockRejectedValueOnce(new Error('Write failed'));
  await click(dialog.querySelector('[data-testid="drawer-save"]'));
  expect(title.value).toBe('Updated Policy');expect(close).not.toHaveBeenCalled();
  expect(api.patch).toHaveBeenCalledTimes(1);
  await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Retry unconfirmed save'));
  expect(api.patch.mock.calls[1][1]).toEqual({title:'Updated Policy',expected_updated_at:null});
  expect(api.patch.mock.calls[1][2]).toEqual(api.patch.mock.calls[0][2]);
  expect(close).toHaveBeenCalledWith(false);
});
test('new policy has one status control and no manufactured dates across clients',async()=>{
  await act(async()=>root.render(<RecordDrawer open kind="policies" schema={SCHEMAS.policies.fields} clientId={mockClient} users={[]} onOpenChange={()=>{}}/>));
  const dialog=document.querySelector('[data-testid="policies-drawer"]');
  expect(dialog.querySelectorAll('#policy-status')).toHaveLength(1);
  expect(dialog.querySelector('[data-testid="field-next_review_date"]')).toBeNull();
  expect(dialog.querySelector('[data-testid="field-approved_at"]')).toBeNull();
  mockClient='demo_dunder';
  await act(async()=>root.render(<RecordDrawer open kind="policies" schema={SCHEMAS.policies.fields} clientId={mockClient} users={[]} onOpenChange={()=>{}}/>));
  expect(document.querySelector('[data-testid="policies-drawer"]').className).toContain('brawndo-cis-assessment');
  expect(document.querySelector('[data-testid="field-presence"]')).toBeNull();
});

test('approval draft cannot be silently lost through tabs or mixed with ordinary edits',async()=>{
  const original=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,...args)=>path.endsWith('/approval-context')?{data:{status:'draft',history:[],can_submit:true}}:original(path,...args));
  await act(async()=>root.render(<RecordDrawer open kind="policies" record={rows[0]} schema={SCHEMAS.policies.fields} clientId={mockClient} users={[]} onOpenChange={()=>{}}/>));
  const dialog=document.querySelector('[data-testid="policies-drawer"]');
  await click(dialog.querySelector('[data-testid="tab-evidence"]'));
  await click([...dialog.querySelectorAll('summary')].find(n=>n.textContent==='Approval document & version'));
  const reference=dialog.querySelector('[aria-label="External document reference"]');
  await input(reference,'DEMO synthetic document');
  await click(dialog.querySelector('[data-testid="tab-overview"]'));
  expect(dialog.querySelector('[aria-label="External document reference"]').value).toBe('DEMO synthetic document');
  expect(dialog.querySelector('[data-testid="field-title"]')).toBeNull();
  await click(dialog.querySelector('[data-testid="drawer-save"]'));expect(api.patch).not.toHaveBeenCalled();
});

test.each(['retired','not_applicable'])('normal administrator retains metadata editing for %s Policy',async status=>{
  delete mockUser.workspace_mode;mockClient='synthetic-new-client';rows[0]={...rows[0],client_id:mockClient,status};
  await act(async()=>root.render(<RecordDrawer open kind="policies" record={rows[0]} schema={SCHEMAS.policies.fields} clientId={mockClient} users={[]} onOpenChange={()=>{}}/>));
  const dialog=document.querySelector('[data-testid="policies-drawer"]');
  expect(dialog.querySelector('[data-testid="field-title"]').disabled).toBe(false);
  expect(dialog.querySelector('[data-testid="drawer-save"]').disabled).toBe(false);
  await input(dialog.querySelector('[data-testid="field-title"]'),'Retained metadata edit');
  await click(dialog.querySelector('[data-testid="drawer-save"]'));
  expect(api.patch.mock.calls[0][1]).toEqual({title:'Retained metadata edit',expected_updated_at:null});
});

test('linked Brawndo Policy Review shows its next date from the scheduled cycle',async()=>{
  const review={review_id:'r',client_id:mockClient,policy_id:'p',title:'Policy review',review_type:'policy',status:'upcoming',due_date:'2024-01-01',recurrence:'annual'};
  await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={review} clientId={mockClient} onOpenChange={()=>{}}/>));
  const next=document.querySelector('[data-testid="review-next-date"]').textContent;
  expect(next).not.toMatch(/Calculated/);expect(next).toMatch(/2025/);
});


test.each([1,2,3])('register uses configured IG%i even while assessment payload is empty',async group=>{
  rows[0].baseline_key='policy-information-security-policy';
  const original=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,...args)=>path==='/frameworks/summary'?{data:{client_id:mockClient,items:[{key:'cis-ig1',tracking_available:true,implementation_group:group}]}}:original(path,...args));
  await act(async()=>root.render(<RecordListPage kind="policies"/>));
  expect(container.querySelector('tbody').textContent).toContain(`Supports CIS IG${group}`);
  expect(container.querySelector('[data-testid="tile-mapped"]')).toBeNull();
});
