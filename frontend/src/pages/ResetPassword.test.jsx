import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import ResetPassword from './ResetPassword';
import api from '@/lib/api';
const mockSetParams=jest.fn();let mockParams;
jest.mock('@/lib/api',()=>({__esModule:true,default:{post:jest.fn()},formatError:e=>e.message}));
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn(),useSearchParams:()=>[mockParams,mockSetParams]}),{virtual:true});
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;mockParams=new URLSearchParams('token=one-time-secret');container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
const type=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};

test('the one-time token leaves the address bar immediately but still resets the password',async()=>{
  await act(async()=>root.render(<ResetPassword/>));
  expect(mockSetParams).toHaveBeenCalledWith({},{replace:true});
  mockParams=new URLSearchParams();
  await act(async()=>root.render(<ResetPassword/>));
  const inputs=container.querySelectorAll('input[type="password"]');
  await act(async()=>{type(inputs[0],'correct horse battery');type(inputs[1],'correct horse battery');});
  api.post.mockResolvedValue({data:{}});
  await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(api.post).toHaveBeenCalledWith('/auth/reset-password',{token:'one-time-secret',new_password:'correct horse battery'});
});
