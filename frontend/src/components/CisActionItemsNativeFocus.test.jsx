import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CisActionItemsOverview} from './CisActionItemsConcept';
import RemediationTicketDrawer from './RemediationTicketDrawer';
import {ticketRecords} from '@/lib/remediationTickets';
import api from '@/lib/api';

const mockUser={user_id:'focus-admin',role:'super_admin',workspace_mode:'standard'};
const initialTask={task_id:'focus-action',client_id:'focus-client',title:'Native focus regression',status:'open',priority:'medium',due_date:'2026-11-07',description:'Saved plan',updated_at:'v1'};
let mockTask;
const mockLoad=jest.fn();
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>true}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/useActionRegisterData',()=>({useActionRegisterData:()=>({data:{tasks:[mockTask],findings:[]},users:[],loading:false,error:'',load:mockLoad})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
jest.mock('./EvidencePanel',()=>()=>null);
jest.mock('./AssigneeSelect',()=>()=>null);

const now=new Date(2026,9,24,12);
function Harness({ordinary=false,onOpened}){
  const [records,setRecords]=useState(()=>ticketRecords({tasks:[mockTask]},'focus-client'));
  const [native,setNative]=useState(null),[ordinaryVisible,setOrdinaryVisible]=useState(true);
  const open=(event,onReturnFocus)=>{
    const next={record:event.task,onReturnFocus};onOpened(next);setNative(next);
  };
  const saved=()=>{setRecords([]);setOrdinaryVisible(false);};
  return <main>
    <input aria-label="Native register search" data-testid="ai-search"/>
    {ordinary&&ordinaryVisible&&<button type="button" onClick={()=>{const next={record:mockTask};onOpened(next);setNative(next);}}>Ordinary native opener</button>}
    {!ordinary&&<CisActionItemsOverview rows={records} now={now} available scopeKey="focus-admin:standard:focus-client" recordOpen={!!native} onOpen={open}/>}
    {native&&<RemediationTicketDrawer open kind="tasks" clientId="focus-client" record={native.record} onReturnFocus={native.onReturnFocus} onSaved={saved} onOpenChange={value=>{if(!value)setNative(null);}}/>}
  </main>;
}

let root,container;
const buttons=()=>[...document.querySelectorAll('button')];
const click=async node=>act(async()=>{node.focus();node.click();});
const button=label=>buttons().find(node=>node.textContent===label);
// Flush Radix FocusScope's actual deferred unmount autofocus, not a harness replacement.
const flushNativeClose=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const editTitle=()=>act(async()=>{
  const input=document.querySelector('[aria-label="Action title"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Saved native focus title');
  input.dispatchEvent(new Event('input',{bubbles:true}));
});

beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  mockTask={...initialTask};sessionStorage.clear();
  mockLoad.mockResolvedValue({ok:true});api.get.mockResolvedValue({data:[]});
  api.patch.mockImplementation(async(path,body)=>{
    mockTask={...mockTask,...body,updated_at:'v2'};
    return {data:mockTask};
  });
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());await flushNativeClose();container.remove();jest.clearAllMocks();});

test('real native Save then Close returns to View data after its concept origin is removed',async()=>{
  const onOpened=jest.fn();
  await act(async()=>root.render(<Harness onOpened={onOpened}/>));
  const origin=container.querySelector('.agenda-entry'),openedTask=mockTask;
  await click(origin);
  expect(onOpened.mock.calls[0][0].record).toBe(openedTask);
  expect(typeof onOpened.mock.calls[0][0].onReturnFocus).toBe('function');
  expect(document.querySelector('[data-testid="remediation-ticket-drawer"]')).toBeTruthy();
  await editTitle();await click(button('Save changes'));
  expect(api.patch).toHaveBeenCalledWith('/tasks/focus-action',expect.objectContaining({title:'Saved native focus title',expected_updated_at:'v1'}),expect.anything());
  expect(mockLoad).toHaveBeenCalled();expect(origin.isConnected).toBe(false);
  expect(document.querySelector('[aria-label="Action title"]').value).toBe('Saved native focus title');
  await click(button('Close'));await flushNativeClose();
  expect(document.querySelector('[data-testid="remediation-ticket-drawer"]')).toBeNull();
  expect(document.activeElement).toBe(button('View data'));
});

test('ordinary native open has no concept callback and retains the native disconnected-opener fallback',async()=>{
  const onOpened=jest.fn();
  await act(async()=>root.render(<Harness ordinary onOpened={onOpened}/>));
  const origin=button('Ordinary native opener');await click(origin);
  expect(onOpened.mock.calls[0][0]).not.toHaveProperty('onReturnFocus');
  await editTitle();await click(button('Save changes'));
  expect(api.patch).toHaveBeenCalled();expect(origin.isConnected).toBe(false);
  await click(button('Close'));await flushNativeClose();
  expect(document.activeElement).toBe(container.querySelector('[data-testid="ai-search"]'));
});

