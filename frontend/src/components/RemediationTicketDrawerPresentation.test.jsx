import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RemediationTicketDrawer from './RemediationTicketDrawer';
import api from '@/lib/api';

const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
const mockTask={task_id:'action',client_id:'demo_brawndo',title:'Retained action',status:'open',priority:'high',description:'Original plan',updated_at:'v1'};
const mockFinding={finding_id:'issue',client_id:'demo_brawndo',title:'Issue',description:'Original issue',status:'open',primary_task_id:'action',source_type:'risk',source_id:'origin-risk'};
const mockOrigin={risk_id:'origin-risk',client_id:'demo_brawndo',title:'Native origin risk'};
const mockLoad=jest.fn();
let mockLoading=false,mockError='',mockTaskStatus='open',mockFindingStatus='open';
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/useActionRegisterData',()=>({useActionRegisterData:()=>({data:{tasks:[{...mockTask,status:mockTaskStatus,finding_id:'issue'}],findings:[{...mockFinding,status:mockFindingStatus}],risks:[mockOrigin]},users:[],loading:mockLoading,error:mockError,load:mockLoad})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message}));
jest.mock('./EvidencePanel',()=>()=>null);
jest.mock('./AssigneeSelect',()=>()=>null);
jest.mock('./RecordDrawer',()=>({__esModule:true,default:props=><div data-testid="native-source-drawer">{props.kind}:{props.record?.risk_id}</div>}));
let root,container,close;
const click=text=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===text).click());
const change=async(label,value)=>act(async()=>{const node=document.querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
const render=(presentation,props={})=>act(async()=>root.render(<RemediationTicketDrawer open kind="findings" record={mockFinding} clientId="demo_brawndo" presentation={presentation} onOpenChange={close} {...props}/>));
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;mockLoading=false;mockError='';mockTaskStatus='open';mockFindingStatus='open';close=jest.fn();mockLoad.mockResolvedValue({ok:true});api.get.mockResolvedValue({data:[]});api.patch.mockResolvedValue({data:mockTask});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('presentation is opt-in and retains only the original native source navigation',async()=>{
  await render();
  expect(document.querySelector('.brawndo-demo-actions-ticket')).toBeNull();
  expect(document.body.textContent).not.toContain('Finding details and relationships');
  await render('brawndo-demo-actions');
  expect(document.querySelector('.brawndo-demo-actions-ticket')).toBeTruthy();
  expect(document.body.textContent).not.toContain('Finding details and relationships');
  await click('Native origin risk');
  expect(document.querySelector('[data-testid="native-source-drawer"]').textContent).toBe('risks:origin-risk');
});

test('Cancel protects unsaved native Action edits and discard never saves',async()=>{
  await render('brawndo-demo-actions');
  await change('Action title','Unsaved title');
  await click('Cancel');
  expect(close).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Discard unsaved ticket changes?');
  await click('Keep editing');
  expect(document.querySelector('[aria-label="Action title"]').value).toBe('Unsaved title');
  await click('Cancel');await click('Discard changes');
  expect(close).toHaveBeenCalledWith(false);expect(api.patch).not.toHaveBeenCalled();
});

test('confirmed save and failed refresh are distinguished',async()=>{
  mockLoad.mockResolvedValue({ok:false,error:'Unavailable'});
  await render('brawndo-demo-actions');await change('Action title','Saved title');
  await click('Save changes');
  expect(api.patch).toHaveBeenCalled();
  expect(document.body.textContent).toContain('Saved, but ticket details could not be refreshed.');
});

test('pilot navigation close requests protect edits and notify parent when editing continues',async()=>{
  const onCloseCancelled=jest.fn();
  await render('brawndo-demo-actions');await change('Action title','Draft before Back');
  await render('brawndo-demo-actions',{closeRequest:1,onCloseCancelled});
  expect(close).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Discard unsaved ticket changes?');
  await click('Keep editing');
  expect(onCloseCancelled).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[aria-label="Action title"]').value).toBe('Draft before Back');
  await render('brawndo-demo-actions',{closeRequest:2,onCloseCancelled});await click('Discard changes');
  expect(close).toHaveBeenCalledWith(false);expect(api.patch).not.toHaveBeenCalled();
});

test('normal drawer ignores pilot navigation requests',async()=>{
  await render(undefined,{closeRequest:1});expect(close).not.toHaveBeenCalled();
});

test('clean original source browsing adds no new discard confirmation',async()=>{
  const onCloseCancelled=jest.fn();
  await render('brawndo-demo-actions');await click('Native origin risk');
  await render('brawndo-demo-actions',{closeRequest:1,onCloseCancelled});
  expect(document.querySelector('[data-testid="native-source-drawer"]').textContent).toBe('risks:origin-risk');
  expect(close).toHaveBeenCalledWith(false);
  expect(document.body.textContent).not.toContain('Discard unsaved ticket changes?');
  expect(onCloseCancelled).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test.each(['loading','error'])('retained %s data keeps drafts but blocks mutation pathways',async state=>{
  await render('brawndo-demo-actions');await change('Action title','Retained local draft');
  if(state==='loading')mockLoading=true;else mockError='Refresh unavailable';
  await render('brawndo-demo-actions');
  const title=document.querySelector('[aria-label="Action title"]');
  expect(title.value).toBe('Retained local draft');expect(title.disabled).toBe(true);
  const buttons=[...document.querySelectorAll('button')];
  for(const label of ['Save changes','Complete work','Accept issue','Add comment'])expect(buttons.some(button=>button.textContent===label&&!button.disabled)).toBe(false);
  expect(buttons.some(button=>button.textContent==='Finding details and relationships')).toBe(false);
  expect(buttons.find(button=>button.textContent==='Native origin risk').disabled).toBe(true);
  expect(document.querySelector('[aria-label="Attach ticket evidence"]')).toBeNull();
  mockTaskStatus='done';mockFindingStatus='remediated';await render('brawndo-demo-actions');
  expect([...document.querySelectorAll('button')].some(button=>button.textContent==='Validate and complete'&&!button.disabled)).toBe(false);
  mockFindingStatus='closed';await render('brawndo-demo-actions');
  expect([...document.querySelectorAll('button')].some(button=>button.textContent==='Reopen ticket'&&!button.disabled)).toBe(false);
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});
