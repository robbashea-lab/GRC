import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';
import {toast} from 'sonner';

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'synthetic_admin',role:'super_admin',workspace_mode:'standard'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.response?.data?.detail||e.message,API:'/api',PREVIEW_MODE:false}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));

// A source-backed strict adapter exercises the real rendered save path. It is not a server/persistence test.
const serverSource=require('fs').readFileSync(require('path').resolve(__dirname,'../../../backend/server.py'),'utf8');
const findingModel=serverSource.match(/class FindingIn\(BaseModel\):([\s\S]*?)(?=\nclass )/)[1];
const acceptedFields=new Set([...findingModel.matchAll(/^ {4}(\w+):/gm)].map(match=>match[1]));
let root,container;
const click=node=>act(async()=>node.click());
const input=(node,value)=>act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
const render=props=>act(async()=>root.render(<RecordDrawer open kind="findings" record={null} clientId="synthetic_client" {...props}/>));

beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockImplementation(async path=>({data:path==='/onboarding/state'?{assessments:[]}:[]}));
  api.post.mockImplementation(async(path,body)=>{
    if(path!=='/findings')throw new Error('Unexpected create route: '+path);
    const unknown=Object.keys(body).filter(key=>!acceptedFields.has(key)).sort();
    if(unknown.length)throw {response:{status:422,data:{detail:'Unknown or read-only fields: '+unknown.join(', ')}}};
    return {data:{...body,finding_id:'synthetic_created_finding'}};
  });
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('native new Finding sends an accepted strict create payload without invented source metadata',async()=>{
  const saved=jest.fn(),close=jest.fn();await render({onSaved:saved,onOpenChange:close});
  await click(document.querySelector('[data-testid="drawer-save"]'));
  expect(api.post).not.toHaveBeenCalled();expect(toast.error).toHaveBeenCalledWith('Title is required');
  await input(document.querySelector('[data-testid="field-title"]'),'Synthetic native Finding');
  await click(document.querySelector('[data-testid="drawer-save"]'));
  // Before the fix this displays the backend-compatible 422 instead of completing creation.
  expect([...document.querySelectorAll('[role="alert"]')].map(node=>node.textContent).join('')).toBe('');
  const [path,body]=api.post.mock.calls.find(([path])=>path==='/findings');
  expect(path).toBe('/findings');
  expect(body).toMatchObject({title:'Synthetic native Finding',client_id:'synthetic_client',status:'open',severity:'medium'});
  expect(body).not.toHaveProperty('source');
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({finding_id:'synthetic_created_finding',title:'Synthetic native Finding'}));
  expect(close).toHaveBeenCalledWith(false);expect(toast.success).toHaveBeenCalledWith('Created');
});

test('explicit unsupported Finding metadata remains a visible failure and retains the native draft',async()=>{
  const saved=jest.fn(),close=jest.fn();
  await render({initialValues:{title:'Retained Finding draft',source:'explicit unsupported metadata'},onSaved:saved,onOpenChange:close});
  await click(document.querySelector('[data-testid="drawer-save"]'));
  expect(api.post.mock.calls.find(([path])=>path==='/findings')[1].source).toBe('explicit unsupported metadata');
  expect(document.body.textContent).toContain('Unknown or read-only fields: source');
  expect(document.querySelector('[data-testid="field-title"]').value).toBe('Retained Finding draft');
  expect(saved).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();
});
