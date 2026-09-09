import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import RiskRegister from './RiskRegister';
import VendorRegister from './VendorRegister';
import api from '@/lib/api';
jest.mock('@/context/OrgContext', () => ({useOrg:() => ({currentClientId:'a',currentClient:{name:'Client A'}})}));
jest.mock('@/context/AuthContext', () => ({useAuth:() => ({user:{user_id:'owner',name:'Owner',role:'super_admin'}})}));
jest.mock('@/lib/api', () => ({__esModule:true, default:{get:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api'}));
jest.mock('react-router-dom', () => ({Link:({children,to}) => <a href={to}>{children}</a>}), {virtual:true});
jest.mock('@/components/ui/sheet', () => ({Sheet:({open,children})=>open?<div>{children}</div>:null,SheetContent:({children})=><section>{children}</section>,SheetHeader:({children})=><header>{children}</header>,SheetTitle:({children})=><h2>{children}</h2>}));
let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container=document.createElement('div'); document.body.appendChild(container); root=createRoot(container);
  api.get.mockImplementation(async path => ({data:path==='/users'?[{user_id:'owner',name:'Owner'}]:path==='/risks'?[{risk_id:'r',client_id:'a',title:'Risk record',status:'open',owner_id:'owner'}]:path==='/vendors'?[{vendor_id:'v',client_id:'a',name:'Vendor record',status:'active',criticality:'high',contact_email:'contact@example.test'}]:path==='/related'?{}:[]}));
  api.patch.mockResolvedValue({data:{}});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each([[RiskRegister,'risk-row-0',['title','category','status','owner_id','description']], [VendorRegister,'vendor-row-0',['name','criticality','status','contact_email']]])('register opens its complete real drawer', async(Component,rowId,fields)=>{
  await act(async()=>root.render(<Component/>));
  const row=container.querySelector(`[data-testid="${rowId}"]`);
  expect(row).not.toBeNull();
  await act(async()=>row.click());
  for(const field of fields) expect(container.querySelector(`[data-testid="field-${field}"]`)).not.toBeNull();
  await act(async()=>container.querySelector('[data-testid="drawer-save"]').click());
  expect(api.patch).toHaveBeenCalledWith(Component===RiskRegister?'/risks/r':'/vendors/v',expect.not.objectContaining({client_id:undefined}));
});
