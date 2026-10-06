import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';

const mockUser={user_id:'synthetic_admin',role:'super_admin',workspace_mode:'standard'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:false}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
let root,container;
const click=node=>act(async()=>node.click());
const named=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockImplementation(async path=>({data:path==='/onboarding/state'?{assessments:[]}:[]}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each(['tasks','findings'])('new non-reference client %s creation is wide and retains the draft through close cancellation',async kind=>{
  const close=jest.fn();
  await act(async()=>root.render(<RecordDrawer open kind={kind} record={null} clientId="synthetic_new_client" onOpenChange={close}/>));
  const dialog=document.querySelector(`[data-testid="${kind}-drawer"]`);
  expect(dialog.className).toContain('action-record-dialog');
  expect(dialog.querySelector('[aria-label="Manage people in a new tab"]')).toBeNull();
  const title=dialog.querySelector('[data-testid="field-title"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'Unsaved synthetic action draft');title.dispatchEvent(new Event('input',{bubbles:true}));});
  await click(dialog.querySelector('button .sr-only').parentElement);
  expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alertdialog"]')).toBeTruthy();
  await click(named('Keep editing'));
  expect(title.value).toBe('Unsaved synthetic action draft');
  await click(dialog.querySelector('button .sr-only').parentElement);
  await click(named('Discard changes'));
  expect(close).toHaveBeenCalledWith(false);
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
