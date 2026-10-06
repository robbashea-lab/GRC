import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';
import {toast} from 'sonner';

const mockUser={user_id:'synthetic_admin',role:'super_admin',workspace_mode:'standard'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:false}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));
jest.mock('./RemediationTicketDrawer',()=>({__esModule:true,default:({onSaved,onOpenChange})=><div><button onClick={onSaved}>Refresh authoritative readiness</button><button onClick={()=>onOpenChange(false)}>Close nested ticket</button></div>}));

// Exercise retained generic guards directly; the public existing-record route remains the unified ticket.
const EntityDrawer=RecordDrawer({kind:'tasks',record:null}).type;
let root,container,task,finding;
const click=node=>act(async()=>node.click());
const named=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const input=(node,value)=>act(async()=>{Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  task={task_id:'synthetic_task',client_id:'synthetic_client',title:'Synthetic action',description:'Retained plan',priority:'medium',status:'open',source_type:'manual'};
  finding={finding_id:'synthetic_finding',client_id:task.client_id,title:'Synthetic issue',description:'Retained finding',severity:'high',status:'in_remediation'};
  api.get.mockImplementation(async path=>({data:path==='/onboarding/state'?{assessments:[]}:path==='/related'?{tasks:[{...task,finding_id:finding.finding_id}]}:path==='/findings'?[{...finding,status:'remediated'}]:path==='/tasks/'+task.task_id?{...task,finding_id:finding.finding_id}:[]}));
  api.patch.mockResolvedValue({data:{...task,status:'done'}});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each([false,true])('authoritative Finding readiness rebase preserves genuine descriptive drafts=%s',async edited=>{
  const close=jest.fn();
  await act(async()=>root.render(<EntityDrawer open kind="findings" record={finding} clientId={finding.client_id} onOpenChange={close}/>));
  const dialog=document.querySelector('[data-testid="findings-drawer"]');
  if(edited)await input(dialog.querySelector('[data-testid="field-title"]'),'Unsaved descriptive change');
  await click(named('Synthetic action'));
  await click(named('Refresh authoritative readiness'));
  await click(named('Close nested ticket'));
  expect(finding.status).toBe('remediated');
  await click(dialog.querySelector('[data-testid="drawer-cancel"]'));
  if(edited){
    expect(close).not.toHaveBeenCalled();expect(document.querySelector('[role="alertdialog"]')).toBeTruthy();
    await click(named('Keep editing'));
    expect(dialog.querySelector('[data-testid="field-title"]').value).toBe('Unsaved descriptive change');
  }else{expect(close).toHaveBeenCalledWith(false);expect(document.querySelector('[role="alertdialog"]')).toBeNull();}
});

test.each(['Save changes','Complete Action Item'])('%s protects an unposted normal Action comment before writing or closing',async action=>{
  const close=jest.fn();
  await act(async()=>root.render(<EntityDrawer open kind="tasks" record={task} clientId={task.client_id} onOpenChange={close}/>));
  await click(document.querySelector('[data-testid="tab-comments"]'));
  await input(document.querySelector('[data-testid="comment-input"]'),'Unposted normal workspace comment');
  await click(document.querySelector('[data-testid="tab-overview"]'));
  await click(named(action));
  expect(api.patch).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith('Post or discard the unfinished comment before saving or completing this item.');
  await click(document.querySelector('[data-testid="tab-comments"]'));
  expect(document.querySelector('[data-testid="comment-input"]').value).toBe('Unposted normal workspace comment');
});
