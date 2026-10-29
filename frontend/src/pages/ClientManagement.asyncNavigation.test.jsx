import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useLocation,useNavigate} from 'react-router-dom';
import ClientManagement from './ClientManagement';
import {OrgProvider,useOrg} from '@/context/OrgContext';
import api from '@/lib/api';
import {toast} from 'sonner';

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'qa-owner',role:'super_admin'},workspaceMode:'standard'})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},PREVIEW_MODE:false,formatError:error=>error.message}));
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));

const existing={client_id:'qa-existing-alpha',name:'QA existing Alpha',status:'active',environment:'Demo'};
const created={client_id:'qa-created-november',name:'QA newly created November',status:'onboarding',environment:'Demo'};
const refreshed=[existing,created];
const directory=rows=>({data:{clients:rows.map(client=>({...client,program_status:'setup_required'}))}});
let container,root,org,observed,navigateFixture,createdOnServer,deferReads,clientRequests,directoryRequests;

function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject,settled:false};
}
function request(queue){const next=deferred();queue.push(next);return next.promise;}
function ScopeProbe(){
  org=useOrg();const location=useLocation();navigateFixture=useNavigate();
  observed.push({path:location.pathname,search:location.search,clientId:org.currentClientId,name:org.currentClient?.name||'',loading:org.loading,error:org.error});
  return <output data-testid="actual-client-scope">{location.pathname}|{location.search}|{org.currentClientId}|{org.currentClient?.name||''}|{org.error}</output>;
}
function Harness(){return <MemoryRouter initialEntries={['/admin/clients']}><OrgProvider><ScopeProbe/><Routes>
  <Route path="/admin/clients" element={<ClientManagement/>}/>
  <Route path="/client-profile" element={<p>QA scope destination</p>}/>
  <Route path="/clients" element={<p>QA different native route</p>}/>
</Routes></OrgProvider></MemoryRouter>;}

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  localStorage.clear();sessionStorage.clear();localStorage.setItem('grc_client_id',existing.client_id);
  observed=[];createdOnServer=false;deferReads=false;clientRequests=[];directoryRequests=[];
  jest.clearAllMocks();
  api.get.mockImplementation(path=>{
    if(path==='/clients/grc-leads'||path==='/contacts')return Promise.resolve({data:[]});
    if(path==='/clients')return createdOnServer&&deferReads?request(clientRequests):Promise.resolve({data:createdOnServer?refreshed:[existing]});
    if(path==='/clients/directory')return createdOnServer&&deferReads?request(directoryRequests):Promise.resolve(directory(createdOnServer?refreshed:[existing]));
    throw new Error(`Unexpected isolated QA read: ${path}`);
  });
  api.post.mockImplementation(async path=>{if(path!=='/clients')throw new Error('Unexpected isolated QA write');createdOnServer=true;return {data:created};});
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();localStorage.clear();sessionStorage.clear();});

const render=()=>act(async()=>root.render(<Harness/>));
const click=node=>{expect(node).not.toBeNull();return act(async()=>node.click());};
const type=async(node,value)=>act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
async function createThroughNativeDialog(){
  await render();expect(org.currentClientId).toBe(existing.client_id);expect(org.switchClient('unlisted-client')).toBe(false);
  await click(container.querySelector('[data-testid="add-client-button"]'));
  await type(document.querySelector('[data-testid="new-client-name"]'),created.name);
  await type(document.querySelector('[aria-label="Environment"]'),'Demo');
  await click(document.querySelector('[data-testid="new-client-save"]'));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls[0][0]).toBe('/clients');expect(api.post.mock.calls[0][1].name).toBe(created.name);
  const notification=toast.success.mock.calls.find(([,options])=>options?.action?.label==='Open Client Profile');
  expect(notification).toBeDefined();
  return notification[1].action;
}
const last=()=>observed.at(-1);
function expectNoOldProfile(){
  const profiles=observed.filter(value=>value.path==='/client-profile');
  expect(profiles.every(value=>value.clientId===''||value.clientId===created.client_id)).toBe(true);
  for(const value of profiles.filter(value=>!value.clientId))
    expect(new URLSearchParams(value.search).get('client_id')).toBe(created.client_id);
}
function expectCreatedDestination(){
  expect(last().path).toBe('/client-profile');expect(last().clientId).toBe(created.client_id);expect(last().name).toBe(created.name);
  const requested=new URLSearchParams(last().search).get('client_id');
  expect(requested===null||requested===created.client_id).toBe(true);
  expect(localStorage.getItem('grc_client_id')).toBe(created.client_id);expectNoOldProfile();
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.patch).not.toHaveBeenCalled();
}
async function resolveClient(next,rows){next.settled=true;await act(async()=>next.resolve({data:rows}));}
async function finishAdminReload(){
  expect(clientRequests).toHaveLength(1);expect(directoryRequests).toHaveLength(1);
  clientRequests[0].settled=true;directoryRequests[0].settled=true;
  await act(async()=>{clientRequests[0].resolve({data:refreshed});directoryRequests[0].resolve(directory(refreshed));});
}
async function finishRemainingReads(){
  for(let turn=0;turn<4;turn++){
    const clients=clientRequests.filter(item=>!item.settled),directories=directoryRequests.filter(item=>!item.settled);
    if(!clients.length&&!directories.length)break;
    await act(async()=>{
      for(const item of clients){item.settled=true;item.resolve({data:refreshed});}
      for(const item of directories){item.settled=true;item.resolve(directory(refreshed));}
    });
  }
  expect([...clientRequests,...directoryRequests].every(item=>item.settled)).toBe(true);
}

test('native create toast follows the new authorized client on the normal fast path',async()=>{
  const action=await createThroughNativeDialog();
  await act(async()=>{action.onClick();});expectCreatedDestination();
});

test('clicking native create toast before refresh never opens the previous client and eventually honors the requested client',async()=>{
  deferReads=true;const action=await createThroughNativeDialog();
  expect(org.clients.map(client=>client.client_id)).toEqual([existing.client_id]);
  await act(async()=>{action.onClick();});expectNoOldProfile();
  await finishRemainingReads();expectCreatedDestination();
  const final={...last()};await act(async()=>Promise.resolve());expect(last()).toEqual(final);
});

test('failed authorized-list refresh is fail-closed and native retry resolves only the requested new client',async()=>{
  deferReads=true;const action=await createThroughNativeDialog();
  await act(async()=>{action.onClick();});
  await finishAdminReload();const failed=clientRequests.find(item=>!item.settled);expect(failed).toBeDefined();
  failed.settled=true;await act(async()=>failed.reject(new Error('Isolated client-list response unavailable')));
  expectNoOldProfile();expect(last().clientId).not.toBe(existing.client_id);
  let retry;await act(async()=>{retry=org.refresh();});
  const pending=clientRequests.find(item=>!item.settled);expect(pending).toBeDefined();
  await resolveClient(pending,refreshed);await act(async()=>retry);expectCreatedDestination();
});

test('an older delayed authorized-list response cannot replace the final newly created client selection',async()=>{
  deferReads=true;const action=await createThroughNativeDialog();
  await act(async()=>{action.onClick();});await finishAdminReload();
  const older=clientRequests.find(item=>!item.settled);expect(older).toBeDefined();
  let newerRefresh;await act(async()=>{newerRefresh=org.refresh();});
  const newer=clientRequests.find(item=>!item.settled&&item!==older);expect(newer).toBeDefined();
  await resolveClient(newer,refreshed);await act(async()=>newerRefresh);
  await resolveClient(older,[existing]);expectCreatedDestination();
  expect(org.clients.map(client=>client.client_id)).toEqual(refreshed.map(client=>client.client_id));
});

test('settling the original create refresh cannot navigate back after the user leaves the pending profile',async()=>{
  deferReads=true;const action=await createThroughNativeDialog();
  await act(async()=>{action.onClick();});expectNoOldProfile();
  expect(last().path).toBe('/client-profile');
  expect(new URLSearchParams(last().search).get('client_id')).toBe(created.client_id);
  await act(async()=>navigateFixture('/clients'));
  await finishRemainingReads();
  expect(last().path).toBe('/clients');expect(last().search).toBe('');
  expectNoOldProfile();expect(api.post).toHaveBeenCalledTimes(1);expect(api.patch).not.toHaveBeenCalled();
});
