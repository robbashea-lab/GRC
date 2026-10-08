import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import VendorRegister from './VendorRegister';
import api from '@/lib/api';
import {managementDay} from '@/lib/managementDates';

let mockClient, mockSearch, mockSetSearch;
const mockUser={user_id:'vendor-filter-admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient,currentClient:{name:'Filter QA'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({Link:({children})=><span>{children}</span>,useLocation:()=>({pathname:'/vendors',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>{const state=require('react').useState(new URLSearchParams(mockSearch));mockSetSearch=state[1];return state;}}),{virtual:true});
jest.mock('@/components/EvidencePanel',()=>()=> <div>Existing evidence panel</div>);

let root,container,fixtures;
const day=offset=>new Date((managementDay()+offset)*86400000).toISOString().slice(0,10);
const click=node=>act(async()=>node.click());
const input=(node,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
const names=()=>[...container.querySelectorAll('[data-testid^="vendor-row-"] .register-record-link')].map(node=>node.textContent);
const chip=id=>container.querySelector(`[data-testid="vendor-view-${id}"]`);
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockClient='demo_dunder';mockSearch='';localStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  const vendor=(vendor_id,name,extra={})=>({vendor_id,client_id:mockClient,name,service:'Hosting',criticality:'low',status:'active',assurance_records:[],...extra});
  fixtures=[vendor('today','Alpha today',{contract_renewal:day(0)}),vendor('boundary','Zulu boundary',{contract_renewal:day(30),assurance_required:true,assurance_records:[{type:'SOC 2',required:true}]}),
    vendor('outside','Outside window',{contract_renewal:day(31),assurance_required:true,assurance_records:[{type:'SOC 2',required:true,evidence_ids:['e'],received_at:day(-2),refresh_due:day(91)}]}),
    vendor('expiration','Expiration only',{contract_expiration:day(10)}),vendor('missing','Missing date'),vendor('invalid','Invalid date',{contract_renewal:'invalid'}),
    vendor('inactive','Inactive vendor',{status:'inactive',contract_renewal:day(5),assurance_required:true,assurance_records:[{type:'SOC 2',required:true}]}),
    vendor('terminated','Terminated vendor',{status:'terminated',contract_renewal:day(5)}),vendor('foreign','Other client',{client_id:'other-client',contract_renewal:day(5)})];
  api.get.mockImplementation(async path=>({data:path==='/vendors'?fixtures:path.startsWith('/vendors/')?fixtures.find(v=>v.vendor_id===path.split('/').at(-1)):path==='/related'?{}:[]}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each(['demo_brawndo','demo_dunder','future-client'])('%s renewal subset, count, search, sort and clearing agree',async client=>{
  mockClient=client;fixtures=fixtures.map(v=>({...v,client_id:v.client_id==='other-client'?v.client_id:client}));
  await act(async()=>root.render(<VendorRegister/>));await click(chip('renewal_soon'));
  expect(chip('renewal_soon').getAttribute('aria-pressed')).toBe('true');expect(chip('renewal_soon').textContent).toContain('2');
  expect(names()).toHaveLength(2);expect(names()).toEqual(expect.arrayContaining(['Zulu boundary','Alpha today']));expect(container.querySelector('[data-testid="vendor-foot"]').textContent).toBe('Showing 2 of 6 active vendors');
  // The existing column control sorts only the filtered subset.
  const sort=container.querySelector('button[aria-label="Vendor: sort and filter"]');
  await act(async()=>{sort.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0,ctrlKey:false}));});
  const ascending=[...document.querySelectorAll('[role="menuitemcheckbox"]')].find(n=>n.textContent==='A → Z');
  expect(ascending).toBeTruthy();await click(ascending);expect(names()).toEqual(['Alpha today','Zulu boundary']);
  await input(container.querySelector('[data-testid="vendor-search"]'),'zulu');expect(names()).toEqual(['Zulu boundary']);expect(chip('renewal_soon').textContent).toContain('2');
  expect(container.querySelector('[data-testid="vendor-foot"]').textContent).toBe('Showing 1 of 6 active vendors');
  await click([...container.querySelectorAll('button')].find(n=>n.textContent==='Clear filters'));expect(names()).toHaveLength(6);expect(chip('all_active').getAttribute('aria-pressed')).toBe('true');
  // Generic contract display retains its expiration fallback; reference workflow retains renewal-only display.
  const expirationRow=[...container.querySelectorAll('[data-testid^="vendor-row-"]')].find(n=>n.textContent.includes('Expiration only'));
  if(client==='demo_brawndo')expect(expirationRow.textContent).toContain('No renewal date');
  else expect(expirationRow.textContent).not.toContain('No renewal date');
});

test.each(['demo_brawndo','demo_dunder','future-client'])('%s Dashboard attention link selects only matching vendors and exposes selected view',async client=>{
  mockClient=client;mockSearch='view=assurance_attention';fixtures=fixtures.map(v=>({...v,client_id:v.client_id==='other-client'?v.client_id:client}));
  await act(async()=>root.render(<VendorRegister/>));expect(names()).toEqual(['Zulu boundary']);
  expect(chip('assurance_attention').getAttribute('aria-pressed')).toBe('true');expect(chip('assurance_attention').textContent).toContain('1');
  expect(container.querySelector('[data-testid="vendor-foot"]').textContent).toBe('Showing 1 of 6 active vendors');
  await click(chip('all_active'));expect(names()).toHaveLength(6);
});

test('same-client Dashboard navigation updates its filter and an Assurance row action retains register context',async()=>{
  await act(async()=>root.render(<VendorRegister/>));
  await act(async()=>mockSetSearch(new URLSearchParams('view=assurance_attention')));expect(names()).toEqual(['Zulu boundary']);
  await input(container.querySelector('[data-testid="vendor-search"]'),'zulu');
  await click([...container.querySelectorAll('button')].find(n=>n.textContent==='Assurance follow-up due'));
  expect(document.querySelector('[data-testid="tab-assurance"]').className).toContain('active');
  expect(document.querySelector('[data-testid="vendors-drawer"]').textContent).toContain('Security Assurance Required');
  await click(document.querySelector('[data-testid="drawer-cancel"]'));
  expect(document.querySelector('[data-testid="vendors-drawer"]')).toBeNull();expect(names()).toEqual(['Zulu boundary']);
  expect(container.querySelector('[data-testid="vendor-search"]').value).toBe('zulu');expect(chip('assurance_attention').getAttribute('aria-pressed')).toBe('true');
});
