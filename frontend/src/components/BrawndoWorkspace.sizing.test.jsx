import React,{act,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import api from '@/lib/api';
import {AdditionalSectionsProvider} from '@/lib/brawndoAdditionalScope';
import {cisClient} from '../testUtils/cisExperience';
import {frameworkCatalog} from '@/lib/frameworks';
import {cisClientProgram} from '@/lib/cisExperience';
import {sharedClientPrograms} from '@/lib/sharedExperience';
import BrawndoWorkspace from './BrawndoWorkspace';

let mockAuth,mockOrg,mockLocation,mockMounts,mockUnmounts;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/context/ComplianceContext',()=>({useCompliance:()=>({items:[]})}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,default:{get:jest.fn()},formatError:error=>error.message}));
jest.mock('./NotificationBell',()=>()=>null);
jest.mock('./BrawndoSidebar',()=>({ProfileMenu:()=> <span data-testid="native-profile-menu"/>}));
// Keep the real workspace and eligibility; route changes are controlled inputs.
jest.mock('react-router-dom',()=>({
  Link:({to,children,...props})=><a href={to} {...props}>{children}</a>,
  useNavigate:()=>jest.fn(),useLocation:()=>mockLocation,
}),{virtual:true});

function enrolledClient(clientId,group) {
  return {...cisClient(clientId,group),cis_program:{client_id:clientId,program_id:`${clientId}:cis-ig1`,
    framework_key:'cis-ig1',version:'8.1',selected:true,implementation_group:group}};
}

function setContext(clientId,group=1,mode='demo',role='super_admin') {
  require('@/lib/api').PREVIEW_MODE=mode==='demo';
  mockAuth={workspaceMode:mode,loading:false,user:{user_id:'sizing-owner',role,workspace_mode:mode,name:'Native owner'}};
  const client=enrolledClient(clientId,group);
  mockOrg={currentClientId:clientId,currentClient:client,clients:[client],loading:false};
  mockLocation={pathname:'/dashboard',search:`?client_id=${clientId}`};
  (mode==='demo'?sessionStorage:localStorage).setItem('grc_client_id',clientId);
}

function NativeDraftProbe() {
  // Observe mounting only; native controllers retain their own actor/client draft guards.
  const [draft,setDraft]=useState('');
  useEffect(()=>{mockMounts++;return()=>{mockUnmounts++;};},[]);
  return <label>Native unsaved draft<input value={draft} onChange={event=>setDraft(event.target.value)}/></label>;
}

let host,root;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  localStorage.clear();sessionStorage.clear();mockMounts=0;mockUnmounts=0;
  setContext('unlisted-current-client');
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());host.remove();
  localStorage.clear();sessionStorage.clear();jest.clearAllMocks();
});

const render=()=>act(async()=>root.render(<AdditionalSectionsProvider><BrawndoWorkspace><NativeDraftProbe/></BrawndoWorkspace></AdditionalSectionsProvider>));
const shell=()=>host.querySelector('.brawndo-workspace-pilot');
const expectSizing=enabled=>{
  expect(shell().getAttribute('data-cis-sizing')).toBe(enabled?'true':null);
  // New sizing eligibility must not publish inherited document/portal styling.
  expect(document.documentElement.hasAttribute('data-cis-sizing')).toBe(false);
  expect(document.body.hasAttribute('data-cis-sizing')).toBe(false);
};

const eligibleRoutes=['/dashboard','/calendar','/reviews','/action-items','/compliance/cis-ig1','/risks','/policies','/vendors','/ai-governance'];

test.each(['demo','standard'].flatMap(mode=>[1,2,3].flatMap(group=>['super_admin','client_readonly'].map(role=>[mode,group,role]))))(
  '%s IG%i %s clients receive the shell marker across every sizing surface without a name whitelist',async(mode,group,role)=>{
    setContext(`arbitrary-${mode}-${group}-${role}`,group,mode,role);
    const before=JSON.stringify({auth:mockAuth,org:mockOrg});
    for(const pathname of eligibleRoutes) {
      mockLocation={...mockLocation,pathname};await render();expectSizing(true);
      expect(host.querySelector('label input')).toBeTruthy();
      expect(host.querySelector('[data-testid="native-profile-menu"]')).toBeTruthy();
    }
    expect(JSON.stringify({auth:mockAuth,org:mockOrg})).toBe(before);
    expect(mockMounts).toBe(1);expect(mockUnmounts).toBe(0);
    expect(api.get).not.toHaveBeenCalled();
  }
);

test.each(['demo','standard'])('%s appearance stays consistent through later enrollment and IG changes without remounting an unsaved native child',async mode=>{
  const clientId=`later-enrolled-${mode}`;setContext(clientId,1,mode);
  mockOrg.currentClient={...mockOrg.currentClient,cis_program:{...mockOrg.currentClient.cis_program,selected:false}};
  mockOrg.clients=[mockOrg.currentClient];await render();expectSizing(true);
  expect(cisClientProgram(mockOrg.currentClient)).toBeNull();
  const input=host.querySelector('label input');
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Existing unsaved native draft');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  for(const group of [1,2,3,2,1]) {
    const client=enrolledClient(clientId,group);
    mockOrg={...mockOrg,currentClient:client,clients:[client]};await render();expectSizing(true);
    expect(host.querySelector('label input')).toBe(input);expect(input.value).toBe('Existing unsaved native draft');
    expect(mockOrg.currentClient.framework_settings['cis-ig1'].implementation_group).toBe(group);
  }
  mockOrg={...mockOrg,currentClient:{...mockOrg.currentClient,cis_program:{...mockOrg.currentClient.cis_program,selected:false}}};
  await render();expectSizing(true);expect(cisClientProgram(mockOrg.currentClient)).toBeNull();
  expect(host.querySelector('label input')).toBe(input);expect(input.value).toBe('Existing unsaved native draft');
  expect(mockMounts).toBe(1);expect(mockUnmounts).toBe(0);expect(api.get).not.toHaveBeenCalled();
});

test.each(['demo','standard'])('%s mixed-program navigation keeps dedicated non-CIS and platform pages outside sizing',async mode=>{
  setContext(`mixed-${mode}`,3,mode);
  mockOrg.currentClient.onboarding_baseline.requirements['iso-27001']='applies';
  mockOrg.currentClient.onboarding_baseline.requirements['soc-2']='applies';
  const before=JSON.stringify(mockOrg);
  for(const pathname of ['/reports','/evidence','/contacts','/systems','/client-profile']) {
    mockLocation={...mockLocation,pathname};await render();expectSizing(true);
  }
  for(const pathname of ['/clients','/clients/new','/admin/clients','/platform/security','/account',
    '/compliance/iso-27001','/compliance/soc-2','/compliance/cis-ig1/other']) {
    mockLocation={...mockLocation,pathname};await render();expectSizing(false);
  }
  mockLocation={...mockLocation,pathname:'/compliance/cis-ig1'};await render();expectSizing(true);
  expect(JSON.stringify(mockOrg)).toBe(before);expect(api.get).not.toHaveBeenCalled();
});

test.each(['demo','standard'])('%s unresolved, mismatched and denied identities cannot retain sizing',async mode=>{
  const clientId=`verified-${mode}`;
  const cases=[
    ()=>{mockAuth={...mockAuth,loading:true};},
    ()=>{mockAuth={...mockAuth,error:'Denied identity'};},
    ()=>{mockAuth={...mockAuth,user:null};},
    ()=>{mockAuth={...mockAuth,user:{...mockAuth.user,user_id:null}};},
    ()=>{mockAuth={...mockAuth,user:{...mockAuth.user,role:'unknown'}};},
    ()=>{mockAuth={...mockAuth,user:{...mockAuth.user,workspace_mode:mode==='demo'?'standard':'demo'}};},
    ()=>{mockOrg={...mockOrg,error:'Client unavailable'};},
    ()=>{mockOrg={...mockOrg,currentClient:null,loading:true};},
    ()=>{mockOrg={...mockOrg,clients:[]};},
    ()=>{mockOrg={...mockOrg,currentClientId:'other-client'};},
    ()=>{mockLocation={...mockLocation,search:'?client_id=other-client'};},
    ()=>{(mode==='demo'?sessionStorage:localStorage).setItem('grc_client_id','other-client');},
    ()=>{mockOrg={...mockOrg,currentClient:{...mockOrg.currentClient,status:'archived'}};},
  ];
  for(const invalidate of cases) {
    setContext(clientId,1,mode);await render();expectSizing(true);
    invalidate();await render();expectSizing(false);
  }
  for(const patch of [
    {cis_program:{...enrolledClient(clientId,1).cis_program,selected:false}},
    {framework_settings:{'cis-ig1':{implementation_group:2}}},
  ]) {
    setContext(clientId,1,mode);mockOrg={...mockOrg,currentClient:{...mockOrg.currentClient,...patch}};
    await render();expectSizing(true);expect(cisClientProgram(mockOrg.currentClient)).toBeNull();
  }
  setContext(clientId,1,mode);mockOrg={...mockOrg,loading:true};await render();expectSizing(true);
  expect(api.get).not.toHaveBeenCalled();
});

test.each(['demo','standard'])('%s authorized client switching preserves common sizing without inferring CIS from a name',async mode=>{
  setContext(`first-${mode}`,1,mode);await render();expectSizing(true);
  const nextId=`second-${mode}`,next={client_id:nextId,name:'Synthetic CIS client',status:'active',
    onboarding_baseline:{completed:true,requirements:{hipaa:'applies'}},framework_settings:{}};
  mockOrg={...mockOrg,currentClientId:nextId,currentClient:next,clients:[mockOrg.currentClient,next]};
  mockLocation={pathname:'/dashboard',search:`?client_id=${nextId}`};
  (mode==='demo'?sessionStorage:localStorage).setItem('grc_client_id',nextId);
  await render();expectSizing(true);expect(cisClientProgram(mockOrg.currentClient)).toBeNull();
  const enrolled=enrolledClient(nextId,3);mockOrg={...mockOrg,currentClient:enrolled,clients:[enrolled]};
  await render();expectSizing(true);expect(api.get).not.toHaveBeenCalled();
});

test.each(['iso-27001','soc-2'].flatMap(framework=>['demo','standard'].map(mode=>[framework,mode])))(
  '%s %s reuses common appearance while keeping its dedicated program body protected',async(framework,mode)=>{
    const id=`unlisted-${framework}-${mode}`;setContext(id,1,mode);
    const program={client_id:id,program_id:`${id}:${framework}`,framework_key:framework,version:frameworkCatalog(framework).version,selected:true};
    const client={client_id:id,name:'Native framework organization',status:'active',shared_programs:[program],framework_settings:{}};
    mockOrg={...mockOrg,currentClient:client,clients:[client]};
    const before=JSON.stringify(mockOrg);
    for(const pathname of ['/dashboard','/calendar','/reviews','/action-items','/risks','/policies','/vendors','/ai-governance']) {
      mockLocation={...mockLocation,pathname};await render();expectSizing(true);
      expect(shell().getAttribute('data-shared-shell')).toBe('true');
      expect(shell().hasAttribute('data-cis-visual')).toBe(false);
      expect(document.documentElement.hasAttribute('data-brawndo-cis-visual')).toBe(false);
    }
    const nativeInput=host.querySelector('label input');
    for(const pathname of [`/compliance/${framework}`,'/reports','/evidence','/contacts','/systems','/client-profile']) {
      mockLocation={...mockLocation,pathname};await render();expectSizing(pathname!==`/compliance/${framework}`);
      expect(shell().getAttribute('data-shared-shell')).toBe('true');
      expect(shell().hasAttribute('data-cis-visual')).toBe(false);
      expect(shell().getAttribute('data-additional-surface')).toBe(({'/evidence':'evidence','/contacts':'contacts','/client-profile':'profile'})[pathname]||null);
      expect(shell().hasAttribute('data-visual-surface')).toBe(false);
      expect(host.querySelector('label input')).toBe(nativeInput);
    }
    expect(shell().getAttribute('data-navigation')).toBe('closed');
    expect(host.querySelector('.bwp-nav-backdrop')).toBeNull();
    await act(async()=>host.querySelector('.bwp-mobile-nav').click());
    expectSizing(true);expect(shell().getAttribute('data-navigation')).toBe('open');
    expect(host.querySelector('.bwp-nav-backdrop')).not.toBeNull();
    await act(async()=>host.querySelector('.bwp-nav-backdrop').click());
    expect(shell().getAttribute('data-navigation')).toBe('closed');
    expect(host.querySelector('.bwp-nav-backdrop')).toBeNull();
    expect(JSON.stringify(mockOrg)).toBe(before);
    expect(mockMounts).toBe(1);expect(mockUnmounts).toBe(0);expect(api.get).not.toHaveBeenCalled();
    mockOrg={...mockOrg,currentClient:{...client,shared_programs:[]}};
    mockLocation={...mockLocation,pathname:'/dashboard'};await render();expectSizing(true);
    expect(shell().getAttribute('data-shared-shell')).toBe('true');
    expect(sharedClientPrograms(mockOrg.currentClient)).toEqual([]);
  });
