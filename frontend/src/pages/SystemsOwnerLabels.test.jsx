import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import api from '@/lib/api';
import {clearPendingCommands,syncPendingCommandIdentity} from '@/lib/createIntent';

let mockClient,mockUser,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,loading:false,workspaceMode:'standard'})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:false}));
jest.mock('react-router-dom',()=>({Link:({children})=><span>{children}</span>,useLocation:()=>({pathname:'/systems',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>[new URLSearchParams(),jest.fn()]}),{virtual:true});
jest.mock('@/components/EvidencePanel',()=>()=>null);
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));

const owner={user_id:'synthetic-global-owner',name:'Synthetic Global Owner',email:'synthetic-owner@example.test',status:'active'};
let root,host,systems,memberFailure;
const render=(kind='assets')=>act(async()=>root.render(<RecordListPage kind={kind}/>));
const node=id=>document.querySelector(`[data-testid="${id}"]`);
const click=id=>act(async()=>node(id).click());
async function fill(id,value){await act(async()=>{const input=node(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
const rowOwner=()=>host.querySelector('.register-owner')?.textContent;
async function chooseOwner(){
  await click('field-owner_id');
  await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent.includes(owner.name)).click());
}
async function createSystem(){
  await click('create-assets-button');await fill('field-name','Synthetic System');await chooseOwner();await click('drawer-save');
}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();clearPendingCommands();
  mockClient='synthetic-system-client';mockUser={user_id:'synthetic-admin',role:'super_admin',workspace_mode:'standard'};
  mockOrg={currentClientId:mockClient,currentClient:{client_id:mockClient,name:'Synthetic Client',status:'active'},loading:false};
  syncPendingCommandIdentity(mockUser.user_id,'standard');systems=[];memberFailure=false;
  api.get.mockImplementation(async(path,options)=>{
    if(path==='/assets')return {data:systems.filter(s=>s.client_id===options?.params?.client_id).map(s=>({...s}))};
    if(path.endsWith('/members')){
      if(memberFailure)throw new Error('Forbidden');
      return {data:systems.some(s=>s.client_id===mockClient&&s.owner_id===owner.user_id)?[owner]:[]};
    }
    if(path.endsWith('/assignees'))return {data:{items:[owner],has_more:false}};
    return {data:path==='/related'?{}:[]};
  });
  api.post.mockImplementation(async(path,body)=>{
    if(path!=='/assets')throw new Error('Unexpected synthetic write');
    const saved={...body,asset_id:'synthetic-system',updated_at:'synthetic-created-version'};systems.push(saved);return {data:{...saved}};
  });
  api.patch.mockImplementation(async(path,body)=>{
    if(path!=='/assets/synthetic-system')throw new Error('Unexpected synthetic write');
    systems[0]={...systems[0],...body,updated_at:'synthetic-saved-version'};return {data:{...systems[0]}};
  });
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());host.remove();jest.clearAllMocks();
  sessionStorage.clear();localStorage.clear();clearPendingCommands();
});

test('native System create and edit refresh only scoped owner labels without a manual page reload',async()=>{
  await render();await createSystem();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls[0][1]).toMatchObject({client_id:mockClient,name:'Synthetic System',owner_id:owner.user_id});
  expect(rowOwner()).toBe(owner.name);
  await click('assets-row-0');
  expect(document.querySelector('[aria-label="Record summary"]').textContent).toContain(owner.name);
  await fill('field-location','Synthetic location');await click('drawer-save');
  expect(rowOwner()).toBe(owner.name);expect(systems[0]).toMatchObject({asset_id:'synthetic-system',client_id:mockClient,owner_id:owner.user_id,location:'Synthetic location'});
  await click('assets-row-0');
  expect(document.querySelector('[aria-label="Record summary"]').textContent).toContain(owner.name);
  expect(document.querySelector('[aria-label="Record summary"]').textContent).not.toContain('Former user');
  expect(api.get.mock.calls.some(([path])=>path==='/users')).toBe(false);
  expect(api.patch).toHaveBeenCalledTimes(1);expect(api.patch.mock.calls[0][1]).not.toHaveProperty('owner_id');
});

test('a denied members refresh never invents a label or reassigns the correctly saved System',async()=>{
  await render();memberFailure=true;await createSystem();
  expect(systems[0].owner_id).toBe(owner.user_id);
  expect(rowOwner()).toBe('Former user');expect(host.textContent).not.toContain(owner.user_id);
  await click('assets-row-0');
  expect(document.querySelector('[aria-label="Record summary"]').textContent).toContain('Former user');
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.patch).not.toHaveBeenCalled();
  expect(api.get.mock.calls.some(([path])=>path==='/users')).toBe(false);
});
