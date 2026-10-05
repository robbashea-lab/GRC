import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RiskRegister from './RiskRegister';
import VendorRegister from './VendorRegister';
import api from '@/lib/api';
let mockClient='a',mockSearch='',mockDrawer,mockSetParams;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'viewer',role:'client_viewer'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient,currentClient:{name:'Client'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({useSearchParams:()=>{const [params,setParams]=require('react').useState(new URLSearchParams(mockSearch));mockSetParams=setParams;return [params,setParams];}}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>props=>{mockDrawer=props;return props.open?<div data-testid="opened">{props.record.title||props.record.name}</div>:null;});
let root,container,record;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;mockClient='a';mockDrawer=null;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
describe.each([['risks',RiskRegister,'risk_id'],['vendors',VendorRegister,'vendor_id']])('%s exact dashboard links',(kind,Component,idField)=>{
 beforeEach(()=>{mockSearch='id=exact&client_id=a';record={[idField]:'exact',client_id:'a',title:'Exact record',name:'Exact record',status:'open'};api.get.mockImplementation(async path=>({data:path===`/${kind}/exact`?record:[]}));});
 const render=()=>act(async()=>root.render(<Component/>));
 test('opens exact record outside list and close clears URL ID without reopening',async()=>{
   await render();expect(container.querySelector('[data-testid="opened"]').textContent).toBe('Exact record');
   expect(api.get).toHaveBeenCalledWith(`/${kind}/exact`,expect.objectContaining({signal:expect.any(AbortSignal)}));
   await act(async()=>mockDrawer.onOpenChange(false));expect(container.querySelector('[data-testid="opened"]')).toBeNull();
   const before=api.get.mock.calls.filter(([path])=>path===`/${kind}/exact`).length;
   await act(async()=>mockSetParams(previous=>new URLSearchParams(previous)));expect(api.get.mock.calls.filter(([path])=>path===`/${kind}/exact`)).toHaveLength(before);
 });
 test('rejects URL tenant mismatch without exact GET',async()=>{
   mockSearch='id=exact&client_id=b';await render();expect(api.get.mock.calls.some(([path])=>path===`/${kind}/exact`)).toBe(false);expect(container.querySelector('[data-testid="opened"]')).toBeNull();expect(container.textContent).toContain('another client');
 });
 test('rejects returned record from another tenant',async()=>{
   record.client_id='b';await render();expect(container.querySelector('[data-testid="opened"]')).toBeNull();expect(container.textContent).toContain('another client');
 });
 test('ignores pending exact record after active client changes',async()=>{
   let resolve;api.get.mockImplementation(path=>path===`/${kind}/exact`?new Promise(r=>{resolve=r;}):Promise.resolve({data:[]}));
   await render();mockClient='b';await render();await act(async()=>resolve({data:record}));expect(container.querySelector('[data-testid="opened"]')).toBeNull();
 });
});
