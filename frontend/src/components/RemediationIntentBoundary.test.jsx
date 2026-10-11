import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RemediationTicketDrawer from './RemediationTicketDrawer';
import api,{setAccessToken,setWorkspaceMode} from '@/lib/api';
import {clearPendingCommands,syncPendingCommandIdentity} from '@/lib/createIntent';

const mockUser={user_id:'synthetic-admin-a',role:'super_admin'};
let mockFinding,mockTask;
const mockLoad=jest.fn().mockResolvedValue(undefined);
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/useActionRegisterData',()=>({useActionRegisterData:()=>({data:{findings:[mockFinding],tasks:[mockTask]},users:[],loading:false,error:'',load:mockLoad})}));
jest.mock('./EvidencePanel',()=>()=>null);
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('./AssigneeSelect',()=>()=>null);
jest.mock('./ui/dialog',()=>({Dialog:({children})=><div>{children}</div>,DialogContent:require('react').forwardRef(({children,onOpenAutoFocus,onCloseAutoFocus,...props},ref)=><section ref={ref} {...props}>{children}</section>),DialogTitle:({children})=><h2>{children}</h2>,DialogDescription:({children})=><p>{children}</p>}));

let root,container,calls,write;
const reply=(config,data={})=>({data,status:200,statusText:'OK',headers:{},config});
const button=text=>[...container.querySelectorAll('button')].find(node=>node.textContent===text);
const mount=()=>act(async()=>root.render(<RemediationTicketDrawer open kind="findings" record={mockFinding} clientId="synthetic-client" onOpenChange={()=>{}}/>));
const rationale=()=>act(async()=>{
  const node=container.querySelector('[aria-label="Validation rationale"]');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,'SYNTHETIC VALIDATION ONLY');
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
const remount=async()=>{await act(async()=>root.unmount());root=createRoot(container);await mount();};
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  sessionStorage.clear();localStorage.clear();clearPendingCommands();setWorkspaceMode('standard');
  syncPendingCommandIdentity(mockUser.user_id,'standard');setAccessToken('SYNTHETIC_PRIOR_BEARER');
  mockFinding={finding_id:'synthetic-finding',client_id:'synthetic-client',title:'Synthetic remediation',status:'remediated',updated_at:'original-finding-version'};
  mockTask={task_id:'synthetic-task',client_id:'synthetic-client',title:'Synthetic work',status:'done',finding_id:mockFinding.finding_id,updated_at:'original-task-version'};
  calls=[];write=config=>Promise.resolve(reply(config));
  api.defaults.adapter=config=>{
    if(config.method==='post'){calls.push(config);return write(config);}
    return Promise.resolve(reply(config,[]));
  };
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();clearPendingCommands();sessionStorage.clear();localStorage.clear();setAccessToken(null);jest.clearAllMocks();});

test.each(['decision','reopen'])('actual %s wrapper rejects queued old-actor transport before current credentials are attached',async kind=>{
  if(kind==='reopen')mockFinding.status='closed';
  await mount();if(kind==='decision')await rationale();
  await act(async()=>{
    button(kind==='decision'?'Validate and complete':'Reopen ticket').click();
    await Promise.resolve();
    clearPendingCommands();setAccessToken('SYNTHETIC_NEXT_BEARER');
  });
  expect(calls).toHaveLength(0);
  expect(container.querySelector('[role="alert"]').textContent).toContain('ended workspace');
});

test.each(['decision','reopen'])('ordinary %s recovery forwards headers/config and retains exact native request after response loss',async kind=>{
  if(kind==='reopen')mockFinding.status='closed';
  write=jest.fn().mockImplementationOnce(config=>Promise.reject(Object.assign(new Error('SYNTHETIC RESPONSE LOST'),{config})))
    .mockImplementationOnce(config=>Promise.resolve(reply(config)));
  await mount();if(kind==='decision')await rationale();
  await act(async()=>button(kind==='decision'?'Validate and complete':'Reopen ticket').click());
  expect(calls).toHaveLength(1);
  const original=calls[0],body=JSON.parse(original.data);
  expect(body.request_id).toBe(original.headers['Idempotency-Key']);
  expect(body.expected_updated_at).toBe('original-finding-version');
  expect(original.pendingCommandGeneration).toEqual(expect.any(Number));
  if(kind==='decision')expect(body.rationale).toBe('SYNTHETIC VALIDATION ONLY');
  mockFinding={...mockFinding,updated_at:'newer-loaded-finding-version'};
  await remount();
  await act(async()=>button(kind==='decision'?'Retry unconfirmed decision':'Retry unconfirmed reopening').click());
  expect(calls).toHaveLength(2);
  expect(calls[1].data).toBe(original.data);
  expect(calls[1].headers['Idempotency-Key']).toBe(original.headers['Idempotency-Key']);
  expect(calls[1].pendingCommandGeneration).toBe(original.pendingCommandGeneration);
  expect(button(kind==='decision'?'Retry unconfirmed decision':'Retry unconfirmed reopening')).toBeUndefined();
});
