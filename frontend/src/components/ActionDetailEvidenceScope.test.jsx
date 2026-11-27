import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RemediationTicketDrawer from './RemediationTicketDrawer';
import api from '@/lib/api';

let mockUser,mockFullRecord;
const mockTask={task_id:'scope-action',client_id:'demo_brawndo',title:'Native scoped Action',status:'open',priority:'medium',description:'Saved plan',resolution:'',assignee_id:null,due_date:null,updated_at:'saved-v1'};
const mockLoad=jest.fn();
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>mockFullRecord}));
jest.mock('@/lib/useActionRegisterData',()=>({useActionRegisterData:()=>({data:{tasks:[mockTask],findings:[]},users:[],loading:false,error:'',load:mockLoad})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
jest.mock('./RecordDrawer',()=>()=>null);

let root,container;
const render=()=>act(async()=>root.render(<RemediationTicketDrawer open kind="tasks" record={mockTask} clientId={mockTask.client_id} onOpenChange={jest.fn()}/>));
const evidenceTab=()=>[...document.querySelectorAll('[role=tab]')].find(node=>node.textContent.startsWith('Evidence'));
const catalog=(total,filename)=>({items:[{evidence_id:'evidence-'+total,filename,category:'direct',linked_type:'task',linked_id:mockTask.task_id,context:{},references:[]}],
  total,counts:{direct:total,actions:0,findings:0,review:0,treatment:0},page:1,page_size:25});
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  mockUser={user_id:'initial-demo-user',role:'super_admin',workspace_mode:'demo'};
  mockFullRecord=true;
  mockLoad.mockResolvedValue({ok:true});
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each([
  ['identity',{user_id:'different-demo-user'}],
  ['role',{role:'client_viewer'}],
  ['workspace',{workspace_mode:'standard'}]
])('same-ticket Evidence rejects cached files/count and late replies after %s changes',async(_name,userChange)=>{
  let phase='initial';const pendingOld=[],pendingNew=[];
  api.get.mockImplementation((url)=>{
    if(url!=='/evidence/catalog')return Promise.resolve({data:[]});
    if(phase==='initial')return Promise.resolve({data:catalog(27,'Previous-context file.pdf')});
    return new Promise(resolve=>(phase==='old-request'?pendingOld:pendingNew).push(resolve));
  });
  await render();await act(async()=>evidenceTab().click());
  expect(evidenceTab().textContent).toBe('Evidence27');expect(document.body.textContent).toContain('Previous-context file.pdf');
  phase='old-request';
  const pagination=document.querySelector('[aria-label="Evidence pagination"]');
  await act(async()=>[...pagination.querySelectorAll('button')].find(button=>button.textContent==='Next').click());
  expect(pendingOld.length).toBeGreaterThan(0);
  phase='new-context';mockUser={...mockUser,...userChange};await render();
  expect(evidenceTab().textContent).toBe('Evidence');expect(document.body.textContent).not.toContain('Previous-context file.pdf');
  expect(pendingNew.length).toBeGreaterThan(0);
  expect(api.get.mock.calls.filter(([url])=>url==='/evidence/catalog').at(-1)[1].params.page).toBe(1);
  await act(async()=>{for(const resolve of pendingNew.splice(0))resolve({data:catalog(2,'Current-context file.pdf')});});
  expect(evidenceTab().textContent).toBe('Evidence2');expect(document.body.textContent).toContain('Current-context file.pdf');
  await act(async()=>{for(const resolve of pendingOld.splice(0))resolve({data:catalog(9,'Late previous-context file.pdf')});});
  expect(evidenceTab().textContent).toBe('Evidence2');expect(document.body.textContent).not.toContain('Late previous-context file.pdf');
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('same-auth presentation withdrawal retains native Evidence reuse query and paging state',async()=>{
  api.get.mockImplementation((url,{params}={})=>Promise.resolve({data:url!=='/evidence/catalog'?[]:params.entity_type?
    {...catalog(27,'Permitted catalog file.pdf'),page:params.page}:{items:[],counts:{direct:0},total:0,page:params.page,page_size:25}}));
  await render();await act(async()=>evidenceTab().click());
  const pagination=document.querySelector('[aria-label="Evidence pagination"]');
  await act(async()=>[...pagination.querySelectorAll('button')].find(button=>button.textContent==='Next').click());
  await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Link existing Evidence').click());
  const search=document.querySelector('[aria-label="Find existing Evidence"]');
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Retained native library query');
    search.dispatchEvent(new Event('input',{bubbles:true}));
  });
  const requests=api.get.mock.calls.length;
  mockFullRecord=false;await render();
  expect(document.querySelector('[data-testid="remediation-ticket-drawer"]').classList.contains('brawndo-action-detail')).toBe(false);
  expect(document.querySelector('[aria-label="Find existing Evidence"]')).toBe(search);expect(search.value).toBe('Retained native library query');
  expect([...document.querySelectorAll('[aria-label="Evidence pagination"]')].at(-1).textContent).toContain('26–27');
  mockFullRecord=true;await render();
  expect(document.querySelector('[data-testid="remediation-ticket-drawer"]').classList.contains('brawndo-action-detail')).toBe(true);
  expect(document.querySelector('[aria-label="Find existing Evidence"]')).toBe(search);expect(search.value).toBe('Retained native library query');
  expect([...document.querySelectorAll('[aria-label="Evidence pagination"]')].at(-1).textContent).toContain('26–27');
  expect(api.get).toHaveBeenCalledTimes(requests);expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
