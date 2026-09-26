import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import api from '@/lib/api';
let mockParams;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'admin',role:'super_admin'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'c',currentClient:{name:'Test client'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/findings',search:'?'+mockParams}),useNavigate:()=>jest.fn(),useSearchParams:()=>{const [value,set]=require('react').useState(mockParams);return [value,next=>set(new URLSearchParams(next))];}}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>()=>null);
let root, container;
const finding=(id,status,severity='critical')=>({finding_id:id,client_id:'c',title:id,status,severity,due_date:'2030-01-01'});
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockParams=new URLSearchParams();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockImplementation(async path=>({data:path==='/findings'?[finding('closed-2029','closed'),finding('accepted-2031','accepted'),finding('open-now','open','high'),finding('pending-validation','remediated','medium')]:[]}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
const titles=()=>[...container.querySelectorAll('tr[data-testid^="findings-row-"]')].map(r=>r.textContent);

test('Findings open on current deficiencies; years of closed history do not bury open work',async()=>{
  await act(async()=>root.render(<RecordListPage kind="findings"/>));
  expect(titles().join(' ')).toContain('open-now');
  expect(titles().join(' ')).toContain('pending-validation');
  expect(titles().join(' ')).not.toContain('closed-2029');
  expect(titles().join(' ')).not.toContain('accepted-2031');
  expect(container.querySelector('.register-count').textContent).toBe('2 / 4');
});

test('closed Finding history remains one explicit selection away',async()=>{
  mockParams=new URLSearchParams('status=all');
  await act(async()=>root.render(<RecordListPage kind="findings"/>));
  expect(titles()).toHaveLength(4);
  mockParams=new URLSearchParams('status=closed');
  await act(async()=>root.unmount());root=createRoot(container);
  await act(async()=>root.render(<RecordListPage kind="findings"/>));
  expect(titles()).toHaveLength(1);
  expect(titles()[0]).toContain('closed-2029');
  mockParams=new URLSearchParams('status=active');
  await act(async()=>root.unmount());root=createRoot(container);
  await act(async()=>root.render(<RecordListPage kind="findings"/>));
  expect(titles()).toHaveLength(2);
});
