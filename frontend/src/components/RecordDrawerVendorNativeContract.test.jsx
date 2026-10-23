import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'synthetic_admin',role:'super_admin',workspace_mode:'standard'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'a',currentClient:require('../testUtils/cisExperience').cisClient('a',2)})}));
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>true}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.response?.data?.detail||e.message,API:'/api',PREVIEW_MODE:false}));
jest.mock('react-router-dom',()=>({Link:({children})=><span>{children}</span>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('./EvidencePanel',()=>()=>null);
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));

let root,container;
const nativeRequests=[];
const client=cisClient('a',2);
const click=node=>act(async()=>node.click());
const saveButton=()=>[...document.querySelectorAll('.vw-footer button')].find(node=>['Add to register','Save changes'].includes(node.textContent));
const render=props=>act(async()=>root.render(<RecordDrawer open kind="vendors" clientId={client.client_id} users={[]} onOpenChange={jest.fn()} {...props}/>));
const input=(node,value)=>act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  sessionStorage.clear();localStorage.clear();window.history.replaceState({},'', '/vendors?client_id=a');
  api.get.mockImplementation(async path=>({data:path==='/related'?{}:[]}));
  api.post.mockImplementation(async(path,body)=>({data:{...body,vendor_id:'synthetic_created_vendor'}}));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
afterAll(()=>{
  // Optional coordinator receipt: replay these actual rendered requests against the isolated native routes.
  if(process.env.GRC_NATIVE_VENDOR_REQUEST_RECEIPT)require('fs').writeFileSync(process.env.GRC_NATIVE_VENDOR_REQUEST_RECEIPT,JSON.stringify(nativeRequests,null,2));
});

test('native CIS catalog creation sends the selected exact identity without an invented connected-system list',async()=>{
  const saved=jest.fn(),close=jest.fn();
  await render({record:null,onSaved:saved,onOpenChange:close});
  const template=[...document.querySelectorAll('.tpl-c')].find(node=>node.querySelector('b')?.textContent==='iVenture Solutions');
  expect(template).toBeTruthy();await click(template);
  await click(saveButton());
  const [path,body]=api.post.mock.calls.find(([path])=>path==='/vendors');
  expect(path).toBe('/vendors');
  expect(body).toMatchObject({client_id:client.client_id,name:'iVenture Solutions',catalog_key:'iventure-solutions',service:'Managed IT, security and compliance (MSP)'});
  expect(body).not.toHaveProperty('connected_system_ids');
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({vendor_id:'synthetic_created_vendor',catalog_key:'iventure-solutions'}));
  expect(close).toHaveBeenCalledWith(false);
  nativeRequests.push({scenario:'native catalog creation',kind:'vendors',body,expected_status:200});
});

test.each([[[]],[['retained_system_identity']]])('explicit connected-system initial metadata stays in the rejected native request (%j)',async connected_system_ids=>{
  const close=jest.fn(),saved=jest.fn();
  api.post.mockRejectedValue({response:{status:422,data:{detail:'Unknown or read-only fields: connected_system_ids'}}});
  await render({record:null,initialValues:{name:'Synthetic explicit metadata Vendor',service:'Synthetic service',connected_system_ids},onOpenChange:close,onSaved:saved});
  await click(saveButton());
  const body=api.post.mock.calls.find(([path])=>path==='/vendors')[1];
  expect(body.connected_system_ids).toEqual(connected_system_ids);
  expect(document.body.textContent).toContain('Unknown or read-only fields: connected_system_ids');
  expect(document.querySelector('[data-testid="field-name"]').value).toBe('Synthetic explicit metadata Vendor');
  expect(close).not.toHaveBeenCalled();expect(saved).not.toHaveBeenCalled();
  nativeRequests.push({scenario:'explicit unsupported metadata preserved',kind:'vendors',body,expected_status:422});
});

test('an unrelated native edit preserves authoritative existing connected-system metadata without resubmitting it',async()=>{
  const connected_system_ids=['retained_system_identity'];
  const record={vendor_id:'synthetic_retained_vendor',client_id:client.client_id,name:'Synthetic retained Vendor',service:'Existing service',criticality:'medium',status:'onboarding',updated_at:'2026-10-23T16:00:00Z',connected_system_ids};
  api.patch.mockImplementation(async(path,body)=>({data:{...record,...body}}));
  await render({record});
  await input(document.querySelector('[data-testid="field-name"]'),'Renamed retained Vendor');
  await click(saveButton());
  const body=api.patch.mock.calls.find(([path])=>path==='/vendors/'+record.vendor_id)[1];
  expect(body).toMatchObject({name:'Renamed retained Vendor',expected_updated_at:'2026-10-23T16:00:00Z'});
  expect(body).not.toHaveProperty('connected_system_ids');
  expect(record.connected_system_ids).toBe(connected_system_ids);expect(record.connected_system_ids).toEqual(['retained_system_identity']);
  nativeRequests.push({scenario:'unrelated edit retains authoritative metadata and version guard',kind:'vendors',method:'patch',record,body,expected_status:200});
});
