import React,{act,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import AIOnboardingWizard from './AIOnboardingWizard';
import api from '@/lib/api';
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'admin',role:'super_admin'},workspaceMode:'standard'})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()},formatError:error=>error.message}));
let node,root;
const buttons=()=>[...document.querySelectorAll('button')];
const button=text=>buttons().find(item=>item.textContent===text);
const click=async item=>act(async()=>item.click());
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();node=document.createElement('div');document.body.append(node);root=createRoot(node);api.get.mockResolvedValue({data:[]});api.post.mockResolvedValue({data:{ai_system_id:'saved'}});});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();});
async function render(props={}){await act(async()=>root.render(<StrictMode><AIOnboardingWizard clientId="a" users={[]} onClose={()=>{}} onSaved={()=>{}} {...props}/></StrictMode>));}
async function select(){await click(document.querySelector('.picker-trigger'));await click(document.querySelector('[role="option"]'));}
async function acknowledge(){await click(document.querySelector('.review-check input'));}
async function complete(){await select();await acknowledge();await click(button('Next'));await acknowledge();await click(button('Next'));await acknowledge();}

test('mandatory three-step sequence sends one final native command under StrictMode',async()=>{
  const saved=jest.fn();await render({onSaved:saved});
  expect(button('Add AI system')).toBeUndefined();
  await select();await click(button('Next'));
  expect(document.querySelector('[role="alert"]').textContent).toMatch(/Confirm/);
  expect(api.post).not.toHaveBeenCalled();
  await acknowledge();await click(button('Next'));
  expect(document.querySelectorAll('.screening-question')).toHaveLength(10);
  expect(api.post).not.toHaveBeenCalled();
  await acknowledge();await click(button('Next'));expect(button('Add AI system').disabled).toBe(true);
  await acknowledge();await click(button('Add AI system'));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/ai_systems/onboard',expect.objectContaining({client_id:'a',confirmations:{details:true,screening:true,risk:true}}),expect.objectContaining({headers:{'Idempotency-Key':expect.any(String)}}));
  expect(saved).toHaveBeenCalledWith({ai_system_id:'saved'});
});
test('uncertain failure survives close/reopen and retries the exact original payload and key',async()=>{
  api.post.mockRejectedValueOnce(new Error('Connection lost'));
  await render();await complete();await click(button('Add AI system'));
  const original=api.post.mock.calls[0];
  expect(document.body.textContent).toContain('Retry original Add');
  await act(async()=>root.render(null));await render();
  expect(document.body.textContent).toContain('Confirm the previous Add');
  await click(button('Retry original Add'));
  expect(api.post.mock.calls[1]).toEqual(original);
});
test('saved Vendor preview returns to unchanged draft without creating or editing records',async()=>{
  api.get.mockResolvedValue({data:[{client_id:'a',vendor_id:'v1',name:'Verified Vendor',service:'AI service',next_review:'2027-10-25'}]});
  await render();await select();await acknowledge();await click(button('Preview vendor register (1)'));
  expect(document.querySelectorAll('th')).toHaveLength(4);
  expect(document.body.textContent).toContain('Verified Vendor');
  await click(button('Return to system details'));
  expect(document.querySelector('.review-check input').checked).toBe(true);
  expect(api.post).not.toHaveBeenCalled();
});
