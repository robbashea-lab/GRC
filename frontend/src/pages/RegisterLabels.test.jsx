import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import api from '@/lib/api';
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'admin',role:'super_admin'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'c',currentClient:{name:'Test client'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/systems',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>[new URLSearchParams(),jest.fn()]}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>()=>null);
let root,container;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockImplementation(async path=>({data:path==='/assets'?[
    {asset_id:'a1',client_id:'c',name:'Plant OT network',asset_type:'network',criticality:'critical',status:'active'},
    {asset_id:'a2',client_id:'c',name:'Identity tenant',asset_type:'saas',criticality:'high',status:'active'},
    {asset_id:'a3',client_id:'c',name:'Imported system',asset_type:'mainframe',criticality:'low',status:'active'}]:[]}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
const cell=name=>[...container.querySelectorAll('tr[data-testid^="assets-row-"]')].find(r=>r.textContent.includes(name)).querySelectorAll('td')[2].textContent;

test('register cells show the vocabulary label the form uses, and unknown values as recorded',async()=>{
  await act(async()=>root.render(<RecordListPage kind="assets"/>));
  expect(cell('Plant OT network')).toBe('Network device');
  expect(cell('Identity tenant')).toBe('SaaS');
  expect(cell('Imported system')).toBe('mainframe');
});
