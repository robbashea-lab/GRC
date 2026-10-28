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

test('large user lists page without omitting the final records',async()=>{
  api.get.mockImplementation(path=>Promise.resolve({data:path==='/users'?Array.from({length:26},(_,i)=>({user_id:`user-${i}`,name:`Member ${i}`,email:`member${i}@example.test`,role:'client_readonly',status:'active'})):[]}));
  await act(async()=>root.render(<UsersTable allowedRoles={['client_readonly']}/>));
  expect(container.querySelectorAll('tbody tr')).toHaveLength(25);
  const next=Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Next');
  await act(async()=>next.click());
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(container.querySelector('tbody').textContent).toContain('Member 25');
  expect(next.disabled).toBe(true);
});

test('Administration presentation keeps native menus, self restrictions and real scoped client labels',async()=>{
  const records=[
    {user_id:'admin',name:'Existing Admin',email:'admin@example.test',role:'super_admin',status:'active',client_ids:[]},
    {user_id:'member',name:'Existing Member',email:'member@example.test',role:'client_readonly',status:'invited',client_ids:['client-a','unavailable-client']},
  ];
  const before=JSON.stringify(records);
  api.get.mockImplementation(path=>Promise.resolve({data:path==='/users'?records:[{client_id:'client-a',name:'Authorized client'}]}));
  await act(async()=>root.render(<UsersTable adminPresentation allowedRoles={['client_readonly']}/>));
  expect(container.querySelector('h1').textContent).toBe('Users & Access');
  expect(container.querySelectorAll('[data-testid="add-user-platform"]')).toHaveLength(1);
  expect([...container.querySelectorAll('thead .column-control')].map(button=>button.textContent.trim())).toEqual(['User','Role','Client access','Status','Last login']);
  expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  const member=container.querySelector('[data-testid="user-row-1"]');
  expect(member.textContent).toContain('2 client(s)');
  expect(member.textContent).toContain('Authorized client');
  expect(member.textContent).not.toContain('unavailable-client');
  expect(member.querySelector('[data-status="invited"]').textContent).toBe('invited');
  expect(container.querySelector('[aria-label="Actions for Existing Admin"]')).toBeNull();
  expect(container.querySelector('[aria-label="Actions for Existing Member"]')).not.toBeNull();
  expect(JSON.stringify(records)).toBe(before);
});

test('client-profile user table does not inherit Administration markup or its header',async()=>{
  api.get.mockImplementation(path=>Promise.resolve({data:path==='/clients/client-a/members'?[{user_id:'member',name:'Existing Member',email:'member@example.test',role:'client_readonly',status:'active'}]:[]}));
  await act(async()=>root.render(<UsersTable scope="client" clientId="client-a" allowedRoles={['client_readonly']}/>));
  expect(container.querySelector('h1')).toBeNull();
  expect(container.querySelector('.admin-panel')).toBeNull();
  expect(container.querySelector('.admin-avatar')).toBeNull();
  expect(container.querySelector('[data-testid="add-user-client"]').textContent).toContain('Add client user');
  expect(container.querySelectorAll('thead .column-control')).toHaveLength(4);
  expect(container.querySelector('tbody').textContent).toContain('Existing Member');
  expect(container.querySelector('[data-status]')).toBeNull();
});
