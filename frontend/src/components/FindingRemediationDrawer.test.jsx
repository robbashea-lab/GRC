import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'owner',role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn()},formatError:e=>e.message,API:'/api'}));
jest.mock('./ui/dialog',()=>({Dialog:({children})=><div>{children}</div>,DialogContent:({children,...props})=><section {...props}>{children}</section>,DialogTitle:({children})=><h2>{children}</h2>,DialogDescription:({children})=><p>{children}</p>}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
jest.mock('@/components/ui/sheet',()=>({Sheet:({open,children})=>open?<div>{children}</div>:null,SheetContent:({children,...props})=><section {...props}>{children}</section>,SheetHeader:({children})=><header>{children}</header>,SheetTitle:({children})=><h2>{children}</h2>}));

let root,container,finding,task;
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  finding={finding_id:'f',client_id:'a',title:'Control gap',severity:'high',status:'in_remediation'};
  task={task_id:'t',client_id:'a',title:'Remediate gap',description:'Planned correction',priority:'high',status:'open',source_type:'finding',source_id:'f',finding_id:'f'};
  api.get.mockImplementation(async(path)=>({data:path==='/findings'?[{...finding}]:path==='/tasks'?[{...task}]:path==='/evidence/catalog'?{counts:{direct:0},items:[],total:0}:path==='/onboarding/state'?{assessments:[]}:[]}));
  api.patch.mockImplementation(async(path,patch)=>{Object.assign(task,patch);finding.status='remediated';return {data:{...task}};});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each([false,true])('Finding drawer without a selected record does not render validation context (open=%s)',async open=>{
  await act(async()=>root.render(<RecordDrawer open={open} kind="findings" record={null} clientId="a" onOpenChange={()=>{}}/>));
  expect(container.querySelector('[aria-label="Validation context"]')).toBeNull();
  if(open)expect(container.querySelector('[data-testid="field-title"]')).toBeTruthy();
  expect(api.patch).not.toHaveBeenCalled();
});

test.each([
  ['remediated','a',true],
  ['in_remediation','a',false],
  ['remediated','other-client',false],
])('one ticket uses authoritative %s readiness for %s and preserves planned versus actual work',async(status,returnedClient,ready)=>{
  api.patch.mockImplementation(async(path,patch)=>{Object.assign(task,patch);finding.status=status;finding.client_id=returnedClient;return {data:{...task}};});
  await act(async()=>root.render(<RecordDrawer open kind="findings" record={{...finding}} clientId="a" onOpenChange={()=>{}}/>));
  const resolution=container.querySelector('[aria-label="Actual resolution"]');
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(resolution,'Verified actual correction');
    resolution.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await act(async()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Complete work').click());
  expect(api.patch).toHaveBeenCalledWith('/tasks/t',expect.objectContaining({status:'done',resolution:'Verified actual correction'}),expect.objectContaining({headers:expect.any(Object)}));
  expect(task.description).toBe('Planned correction');
  expect(!!container.querySelector('[aria-label="Validation rationale"]')).toBe(ready);
  expect(container.querySelectorAll('[data-testid="remediation-ticket-drawer"]')).toHaveLength(1);
});
