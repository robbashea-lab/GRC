import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'owner',role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
jest.mock('@/components/ui/sheet',()=>({Sheet:({open,children})=>open?<div>{children}</div>:null,SheetContent:({children,...props})=><section {...props}>{children}</section>,SheetHeader:({children})=><header>{children}</header>,SheetTitle:({children})=><h2>{children}</h2>}));

let root,container,finding,task;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  finding={finding_id:'f',client_id:'a',title:'Control gap',severity:'high',status:'in_remediation'};
  task={task_id:'t',client_id:'a',title:'Remediate gap',priority:'high',status:'open',source_type:'finding',source_id:'f',finding_id:'f'};
  api.get.mockImplementation(async(path,options)=>({data:path==='/findings'?[{...finding}]:path==='/related'?options?.params?.entity_type==='findings'?{tasks:[{...task}]}:{}:[]}));
  api.patch.mockImplementation(async(path,patch)=>{Object.assign(task,patch);finding.status='remediated';return {data:{...task}};});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each([
  ['remediated','a',true],
  ['in_remediation','a',false],
  ['remediated','other-client',false],
])('nested completion uses authoritative %s readiness for %s without losing a draft',async(status,returnedClient,ready)=>{
  api.patch.mockImplementation(async(path,patch)=>{Object.assign(task,patch);finding.status=status;finding.client_id=returnedClient;return {data:{...task}};});
  await act(async()=>root.render(<RecordDrawer open kind="findings" record={{...finding}} clientId="a" onOpenChange={()=>{}}/>));
  const title=container.querySelector('[data-testid="field-title"]');
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'Unsaved clarification');
    title.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await act(async()=>container.querySelector('[data-testid="tab-related"]').click());
  await act(async()=>container.querySelector('[data-testid="related-tasks-item"] button').click());
  await act(async()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Complete Action Item').click());
  expect(api.patch).toHaveBeenCalledWith('/tasks/t',expect.objectContaining({status:'done'}));
  await act(async()=>container.querySelector('[data-testid="tab-overview"]').click());
  expect(!!container.querySelector('[data-testid="finding-validate"]')).toBe(ready);
  expect(container.querySelector('[data-testid="field-title"]').value).toBe('Unsaved clarification');
});
