import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Layout from './Layout';
import api from '@/lib/api';
import {cisClient} from '../testUtils/cisExperience';

let mockAuth,mockOrg,mockLocation;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/context/ComplianceContext',()=>({ComplianceProvider:({children})=>children,useCompliance:()=>({items:[]})}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
jest.mock('./NotificationBell',()=>()=>null);
// Keep the real Layout, workspace, Contacts controller and appearance publisher.
// Router location and unrelated navigation widgets are fixtures, not gates under test.
jest.mock('./BrawndoSidebar',()=>({__esModule:true,default:()=> <aside/>,BrawndoPlatformSidebar:()=> <aside/>,ProfileMenu:({storageTools})=><span data-testid="profile-storage" data-enabled={String(storageTools)}/> }));
jest.mock('react-router-dom',()=>({
  Link:({to,children,...props})=><a href={to} {...props}>{children}</a>,
  NavLink:({to,children})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn(),useLocation:()=>mockLocation,
  useSearchParams:()=>[new URLSearchParams(mockLocation.search),jest.fn()],
  Outlet:()=>{const Contacts=require('../pages/Contacts').default;return <Contacts/>;},
}),{virtual:true});

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
let host,root,reads;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();
  mockAuth={workspaceMode:'demo',loading:false,user:{user_id:'actor',role:'super_admin',workspace_mode:'demo',name:'Owner'}};
  const client={...cisClient(),name:'Brawndo'};
  mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false};
  mockLocation={pathname:'/contacts',search:'?client_id=demo_brawndo'};
  sessionStorage.setItem('grc_client_id','demo_brawndo');reads=[];
  api.get.mockImplementation((path,config)=>{
    if(path==='/contacts'){const pending=deferred();reads.push({...pending,clientId:config.params.client_id,signal:config.signal});return pending.promise;}
    return Promise.resolve({data:[]});
  });
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();localStorage.clear();sessionStorage.clear();});
const render=()=>act(async()=>root.render(<Layout/>));
const shell=()=>host.querySelector('.brawndo-workspace-pilot');
const contact=(clientId,name)=>({client_id:clientId,contact_id:'owned-contact-'+clientId,name,email:'synthetic@example.test',status:'active'});

test('the real additional controller keeps approved route chrome while its initial native read is pending',async()=>{
  await render();
  expect(reads).toHaveLength(1);
  expect(shell().dataset.additionalSurface).toBe('contacts');
  expect(host.querySelector('[data-testid="interactive-demo-notice"]')).toBeNull();
  expect(host.querySelector('.bwp-brand small').textContent).toBe('By Prestige Worldwide');
  expect(document.documentElement.dataset.additionalSurface).toBeUndefined();
  expect(host.textContent).not.toContain('Owned loaded contact');
  await act(async()=>reads[0].resolve({data:[contact('demo_brawndo','Owned loaded contact')]}));
  expect(host.textContent).toContain('Owned loaded contact');
  expect(shell().dataset.additionalSurface).toBe('contacts');
  expect(document.documentElement.dataset.additionalSurface).toBe('contacts');
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('a client switch cannot publish a late old response or retain old portal appearance',async()=>{
  await render();const previous=reads[0],next={...cisClient('synthetic-next'),name:'Synthetic next'};
  mockOrg={...mockOrg,currentClientId:next.client_id,currentClient:next,clients:[...mockOrg.clients,next]};
  mockLocation={pathname:'/contacts',search:'?client_id=synthetic-next'};sessionStorage.setItem('grc_client_id',next.client_id);
  await render();expect(previous.signal.aborted).toBe(true);expect(reads).toHaveLength(2);
  expect(shell().dataset.additionalSurface).toBe('contacts');expect(document.documentElement.dataset.additionalSurface).toBeUndefined();
  await act(async()=>previous.resolve({data:[contact('demo_brawndo','Stale foreign contact')]}));
  expect(host.textContent).not.toContain('Stale foreign contact');expect(document.documentElement.dataset.additionalSurface).toBeUndefined();
  await act(async()=>reads[1].resolve({data:[contact(next.client_id,'Current owned contact')]}));
  expect(host.textContent).toContain('Current owned contact');expect(document.documentElement.dataset.additionalSurface).toBe('contacts');
});

test('a failed native read retains stable chrome but never grants loaded portal appearance',async()=>{
  await render();await act(async()=>reads[0].reject(new Error('Owned contact read failed')));
  expect(host.textContent).toContain('Owned contact read failed');
  expect(shell().dataset.additionalSurface).toBe('contacts');expect(document.documentElement.dataset.additionalSurface).toBeUndefined();
  expect(host.querySelector('[data-testid="interactive-demo-notice"]')).toBeNull();
  mockAuth={...mockAuth,error:'Current identity unavailable'};await render();
  expect(shell().dataset.additionalSurface).toBeUndefined();
  expect(host.querySelector('[data-testid="interactive-demo-notice"]')).not.toBeNull();
});


test('deferred background client refresh hides generic scenery while the native unsaved editor stays mounted',async()=>{
  await render();await act(async()=>reads[0].resolve({data:[contact('demo_brawndo','Owned contact')]}));
  const create=[...host.querySelectorAll('button')].find(node=>node.textContent==='New Contact');
  expect(create).toBeTruthy();await act(async()=>create.click());
  const draft=document.querySelector('#contact-name');expect(draft).toBeTruthy();
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(draft,'Unsaved owned draft');draft.dispatchEvent(new Event('input',{bubbles:true}));});
  const refreshed=deferred();mockOrg={...mockOrg,loading:true};await render();
  expect(shell().dataset.additionalSurface).toBe('contacts');
  expect(document.documentElement.dataset.additionalSurface).toBeUndefined();
  expect(host.querySelector('[data-client-workspace-content]').hidden).toBe(true);
  expect(host.querySelector('[role="status"]').textContent).toBe('Refreshing client workspace…');
  expect(document.querySelector('#contact-name')).toBe(draft);expect(draft.value).toBe('Unsaved owned draft');
  await act(async()=>{refreshed.resolve();await refreshed.promise;mockOrg={...mockOrg,loading:false};root.render(<Layout/>);});
  expect(host.querySelector('[data-client-workspace-content]').hidden).toBe(false);
  expect(document.documentElement.dataset.additionalSurface).toBe('contacts');
  expect(document.querySelector('#contact-name')).toBe(draft);expect(draft.value).toBe('Unsaved owned draft');
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('background errors withdraw pending chrome and ISO/SOC routes never gain the CIS refresh mask',async()=>{
  await render();mockOrg={...mockOrg,loading:true};await render();
  expect(host.querySelector('[data-client-workspace-content]').hidden).toBe(true);
  mockOrg={...mockOrg,loading:false,error:'Owned authorization refresh failed'};await render();
  expect(host.querySelector('[data-client-workspace-content]').hidden).toBe(false);
  expect(shell().dataset.additionalSurface).toBeUndefined();
  expect(document.documentElement.dataset.additionalSurface).toBeUndefined();
  mockOrg={...mockOrg,loading:true,error:''};
  for(const pathname of ['/compliance/iso-27001','/compliance/soc-2','/admin/clients','/account']){
    mockLocation={pathname,search:'?client_id=demo_brawndo'};await render();
    expect(host.querySelector('[data-client-workspace-content]').hidden).toBe(false);
    expect(shell().dataset.additionalSurface).toBeUndefined();
    expect(shell().dataset.cisDashboardConcept).toBeUndefined();
  }
});
