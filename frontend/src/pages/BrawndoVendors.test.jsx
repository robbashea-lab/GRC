import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import VendorRegister,{vendorTiles} from './VendorRegister';
import RecordDrawer from '@/components/RecordDrawer';
import {SCHEMAS} from '@/lib/schemas';
import api from '@/lib/api';
let mockClient='demo_brawndo',mockSearch='';
const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient,currentClient:{name:'Test'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({Link:({children})=><span>{children}</span>,useLocation:()=>({pathname:'/vendors',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams(mockSearch))}),{virtual:true});
jest.mock('@/components/EvidencePanel',()=>()=> <div>Existing evidence panel</div>);
jest.mock('@/lib/recordUuid',()=>({recordUuid:()=> 'test-request-identity'}));
let root,container;
const click=node=>act(async()=>node.click());
const input=(node,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;mockClient='demo_brawndo';mockSearch='';localStorage.clear();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);api.get.mockImplementation(async path=>({data:path==='/related'?{}:path==='/vendors'?[{vendor_id:'v',client_id:mockClient,name:'Cloud QA',service:'Hosting',criticality:'high',status:'active',assurance_records:[]}]:[]}));});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('shared vendor summary and assurance columns preserve creation across clients',async()=>{
  await act(async()=>root.render(<VendorRegister/>));expect(container.querySelector('.bpage h1').textContent).toBe('Vendors');expect(container.textContent).toContain('Test · Third parties');expect(container.querySelector('[data-testid="tile-critical_high"]').textContent).toContain('Cloud QA');expect(container.querySelector('[data-testid="vendor-row-0"] .bpage-meta').textContent).toBe('Hosting');expect(container.querySelector('[data-testid="vendor-foot"]').textContent).toBe('Showing 1 of 1 active vendors');
  await click(container.querySelector('[data-testid="new-vendor"]'));
  const dialog=document.querySelector('[data-testid="vendors-drawer"]');expect(dialog.className).toContain('brawndo-cis-assessment');expect(dialog.textContent).not.toContain('Category');expect(dialog.textContent).toContain('Add to Register');
  await click(document.querySelector('[data-testid="drawer-cancel"]'));
  mockClient='demo_dunder';await act(async()=>root.render(<VendorRegister/>));expect(container.querySelector('.bpage h1').textContent).toBe('Vendors');
  await click(container.querySelector('[data-testid="new-vendor"]'));expect(document.querySelector('[data-testid="new-vendor-dialog"]').textContent).toContain('Category');expect(document.querySelector('[data-testid="new-vendor-dialog"]').textContent).toContain('Security Assurance Required');
});
test('shared styling retains another client vendor Category and required assurance in the create payload',async()=>{
  mockClient='demo_dunder';api.post.mockResolvedValue({data:{vendor_id:'created',client_id:mockClient}});
  await act(async()=>root.render(<VendorRegister/>));await click(container.querySelector('[data-testid="new-vendor"]'));
  const dialog=document.querySelector('[data-testid="new-vendor-dialog"]');
  expect(dialog.textContent).toContain('Category');expect(dialog.textContent).toContain('SaaS');
  await input(dialog.querySelector('#new-vendor-name'),'Dunder vendor');await input(dialog.querySelector('#new-vendor-service'),'Hosted service');
  await click([...dialog.querySelectorAll('label')].find(l=>l.textContent==='Security Assurance Required').querySelector('input'));
  await click([...dialog.querySelectorAll('label')].find(l=>l.textContent==='SOC 2').querySelector('input'));
  await click(dialog.querySelector('[data-testid="new-vendor-save"]'));
  expect(api.post).toHaveBeenCalledWith('/vendors',expect.objectContaining({client_id:'demo_dunder',name:'Dunder vendor',service:'Hosted service',category:'SaaS',assurance_required:true,assurance_records:[{type:'SOC 2',required:true,evidence_ids:[]}]}));
});
test('a future client shared register preserves under-review vendors and expiration-only contract dates',async()=>{
  mockClient='future-client';const original=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,...args)=>path==='/vendors'?{data:[{vendor_id:'legacy',client_id:mockClient,name:'Legacy review vendor',status:'under_review',criticality:'high',contract_expiration:'2027-04-01',assurance_records:[]}]}:original(path,...args));
  await act(async()=>root.render(<VendorRegister/>));
  expect(container.querySelector('[data-testid="vendor-row-0"]').textContent).toContain('Legacy review vendor');
  expect(container.querySelector('[data-testid="vendor-row-0"] .register-date > span').textContent).toBe(new Date('2027-04-01T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}));
  expect(container.querySelector('[data-testid="vendor-foot"]').textContent).toBe('Showing 1 of 1 active vendors');
  expect(container.querySelector('button[aria-label="Service / Product: sort and filter"]')).toBeTruthy();
  expect(container.querySelector('button[aria-label="Status: sort and filter"]')).toBeTruthy();
  expect(container.querySelectorAll('thead th')).toHaveLength(9);
  expect(container.querySelector('[data-testid="tile-critical_high"]').textContent).toContain('Legacy review vendor');
});
test('new vendor draft is protected and failed create remains open',async()=>{
  const close=jest.fn();api.post.mockRejectedValue(new Error('Save unavailable'));
  await act(async()=>root.render(<RecordDrawer open onOpenChange={close} kind="vendors" schema={SCHEMAS.vendors.fields} clientId={mockClient}/>));
  await input(document.querySelector('[data-testid="field-name"]'),'Draft vendor');await input(document.querySelector('[data-testid="field-service"]'),'Service');
  await input(document.querySelector('[data-testid="field-next_review"]'),'2026-10-15');await input(document.querySelector('[data-testid="field-contract_renewal"]'),'2027-04-01');
  await click(document.querySelector('[data-testid="drawer-save"]'));expect(close).not.toHaveBeenCalled();expect(document.querySelector('[data-testid="field-name"]').value).toBe('Draft vendor');
  expect(api.post.mock.calls[0][1]).toMatchObject({next_review:'2026-10-15',contract_renewal:'2027-04-01'});
  await click(document.querySelector('[data-testid="drawer-cancel"]'));expect(document.body.textContent).toContain('Discard unsaved changes?');expect(close).not.toHaveBeenCalled();
});
test('tile context names vendors and falls back to next renewal',()=>{
  const now=new Date('2026-09-30T12:00:00');
  const rows=[{vendor_id:'a',name:'Sentinel',status:'active',criticality:'critical',next_review:'2026-10-18',contract_renewal:'2027-03-29',assurance_records:[{type:'SOC 2',next_follow_up:'2026-10-10'}]},
    {vendor_id:'b',name:'Northstar',status:'active',criticality:'medium',next_review:'2027-03-09',contract_renewal:'2026-11-24'},
    {vendor_id:'c',name:'Old Co',status:'inactive',criticality:'high',next_review:'2026-10-02',contract_renewal:'2026-10-05'}];
  const t=Object.fromEntries(vendorTiles(rows,now).map(x=>[x.id,x]));
  expect(t.critical_high).toMatchObject({count:1,context:'Sentinel'});
  expect(t.review_due.count).toBe(1);expect(t.review_due.context).toMatch(/^Sentinel, Oct 18$/);
  expect(t.assurance).toMatchObject({count:1,context:'Sentinel'});
  expect(t.contract_soon.count).toBe(0);expect(t.contract_soon.context).toBe('Next renewal: Northstar, Nov 24');
  expect(vendorTiles([],now).map(x=>x.count)).toEqual([0,0,0,0]);
});
test('tiles and chips drive the register views; row opens drawer',async()=>{
  await act(async()=>root.render(<VendorRegister/>));
  await click(container.querySelector('[data-testid="tile-critical_high"]'));
  expect(container.querySelector('[data-testid="vendor-view-critical_high"]').getAttribute('aria-pressed')).toBe('true');
  await click(container.querySelector('[data-testid="vendor-view-inactive"]'));expect(container.querySelector('[data-testid="vendor-row-0"]')).toBeNull();
  await click(container.querySelector('[data-testid="vendor-view-all_active"]'));
  await click(container.querySelector('[data-testid="vendor-row-0"]'));expect(document.querySelector('[data-testid="vendors-drawer"]')).not.toBeNull();
});

test('the Dashboard assurance link opens the matching Vendors view, not All active',async()=>{
  mockSearch='view=assurance_attention';
  await act(async()=>root.render(<VendorRegister/>));
  expect(container.querySelector('[data-testid="vendor-view-all_active"]').getAttribute('aria-pressed')).toBe('false');
});
