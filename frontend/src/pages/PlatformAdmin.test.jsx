import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {UsersTable} from './PlatformAdmin';
import api from '@/lib/api';

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'admin',role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:error=>error.message}));
jest.mock('react-router-dom',()=>({Link:({children})=><span>{children}</span>,useNavigate:()=>jest.fn()}),{virtual:true});
let root,container;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('client changes load once and delayed previous scope cannot replace the current table',async()=>{
  let resolveOld;
  api.get.mockImplementation(path=>path==='/clients/old/members'?new Promise(resolve=>{resolveOld=resolve;}):
    Promise.resolve({data:path==='/clients/new/members'?[{user_id:'new',name:'New member',role:'client_readonly',status:'active'}]:[]}));
  await act(async()=>root.render(<UsersTable scope="client" clientId="old" allowedRoles={['client_readonly']}/>));
  await act(async()=>root.render(<UsersTable scope="client" clientId="new" allowedRoles={['client_readonly']}/>));
  expect(container.querySelector('tbody').textContent).toContain('New member');
  await act(async()=>resolveOld({data:[{user_id:'old',name:'Old member',role:'client_readonly',status:'active'}]}));
  expect(container.querySelector('tbody').textContent).toContain('New member');
  expect(container.textContent).not.toContain('Old member');
  expect(api.get.mock.calls.filter(([path])=>path.endsWith('/members')).map(([path])=>path)).toEqual(['/clients/old/members','/clients/new/members']);
});
