import {cisClient} from '@/testUtils/cisExperience';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';
import {rememberClient} from '@/lib/clientSelection';
import {toast} from 'sonner';

let mockAuth,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn()},formatError:error=>error.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn(),info:jest.fn()}}));
let root,container,policy,context,props;
const dialog=()=>document.querySelector('[data-testid="policies-drawer"]');
const button=(text,scope=dialog())=>[...scope.querySelectorAll('button')].find(node=>node.textContent===text);
const tab=label=>[...dialog().querySelectorAll('[role="tab"]')].find(node=>node.textContent.startsWith(label));
const render=extra=>act(async()=>root.render(<RecordDrawer {...props} {...extra}/>));
const click=node=>act(async()=>node.click());
const input=(node,value)=>act(async()=>{
  const prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  sessionStorage.clear();localStorage.clear();rememberClient('demo_brawndo');window.history.replaceState({},'','/policies');
  mockAuth={workspaceMode:'demo',loading:false,user:{user_id:'policy-owner',name:'Test administrator',email:'owner@example.test',role:'super_admin',workspace_mode:'demo'}};
  const client={...cisClient('demo_brawndo'),name:'Brawndo'};
  mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false};
  policy={policy_id:'policy-native',client_id:'demo_brawndo',display_id:'POL-105',title:'Risk Management Policy',category:'Core Governance',owner_id:null,status:'draft',presence:'verified_existing',version:'2.0',updated_at:'2026-10-20T08:00:00Z',summary:'Existing summary',governance_context:{category:'organizational',rationale:'Recorded native purpose',cadence_rationale:'Existing annual cadence reason'},approval_history:[],decision_history:[]};
  context={status:'draft',updated_at:policy.updated_at,can_configure:true,can_submit:true,can_decide:true,named_approver:null,authorized_account:null,linked_account:null,history:[],external_history:[],subject:null,source:{version:'2.0',external_reference:'Controlled policy register',external_version:'Revision 2.0'}};
  api.get.mockImplementation(async path=>({data:path.endsWith('/approval-context')?context:path==='/related'?{}:path==='/evidence/catalog'?{items:[],counts:{direct:0},total:0,page_size:25}:[]}));
  api.patch.mockImplementation(async(path,body)=>({data:{...policy,...body,updated_at:'2026-10-20T09:00:00Z'}}));
  api.post.mockResolvedValue({data:{}});
  props={open:true,kind:'policies',clientId:policy.client_id,record:policy,onOpenChange:jest.fn(),onSaved:jest.fn()};
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each([1,2,3].flatMap(group=>['demo','standard'].map(mode=>[group,mode])))('configured IG%i %s client retains the approved native Policy workflow and original approval history',async(group,mode)=>{
  const client=cisClient(`synthetic_policy_ig${group}_${mode}`,group);
  mockAuth={...mockAuth,workspaceMode:mode,user:{...mockAuth.user,workspace_mode:mode}};
  mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false};
  policy={...policy,client_id:client.client_id};props={...props,record:policy,clientId:client.client_id};
  const originalHistory=JSON.stringify([policy.approval_history,policy.decision_history]);
  rememberClient(client.client_id);
  await render();
  expect(dialog().className).toContain('brawndo-policy-workflow');
  expect(JSON.stringify([policy.approval_history,policy.decision_history])).toBe(originalHistory);
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('canonical active Explore Policy on the exact route uses the new interior without a command on open',async()=>{
  await render();
  expect(dialog().className).toContain('brawndo-policy-workflow');
  expect([...dialog().querySelectorAll('[role="tab"]')].map(node=>node.textContent.replace(/[0-9—]+$/,'').trim())).toEqual(['Overview','Document & approval','Framework mapping','Comments','Activity']);
  expect(dialog().querySelector('[aria-label="Purpose"]').value).toBe('Recorded native purpose');
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test.each(['unsupported-mode','other-client','wrong-route','loading','mismatch','archived'])('Policy presentation stays off for %s without replacing native controls',async condition=>{
  if(condition==='unsupported-mode'){mockAuth.workspaceMode='authenticated';mockAuth.user.workspace_mode='authenticated';}
  if(condition==='other-client'){policy.client_id='demo_dunder';props.clientId='demo_dunder';mockOrg.currentClientId='demo_dunder';mockOrg.currentClient={client_id:'demo_dunder',name:'Brawndo',status:'active'};rememberClient('demo_dunder');}
  if(condition==='wrong-route')window.history.replaceState({},'','/dashboard');
  if(condition==='loading')mockOrg.loading=true;
  if(condition==='mismatch')rememberClient('different-client');
  if(condition==='archived')mockOrg.currentClient.archived=true;
  await render();
  expect(dialog().className).not.toContain('brawndo-policy-workflow');
  expect(dialog().querySelector('[data-testid="field-title"]')).not.toBeNull();
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('Purpose saves through native PATCH with the loaded version and retains the rest of governance context',async()=>{
  const originalContext={...policy.governance_context};
  await render();
  await input(dialog().querySelector('[aria-label="Purpose"]'),'Updated operational purpose.');
  await click(button('Save changes'));
  expect(api.patch).toHaveBeenCalledWith('/policies/policy-native',expect.objectContaining({governance_context:{...originalContext,rationale:'Updated operational purpose.'},expected_updated_at:'2026-10-20T08:00:00Z'}),expect.any(Object));
  expect(api.patch.mock.calls[0][1]).not.toHaveProperty('status');
  expect(api.patch.mock.calls[0][1]).not.toHaveProperty('version');
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
  expect(api.post).not.toHaveBeenCalled();
});

test('Document & approval retains native authority and document-basis controls with no mutation on navigation',async()=>{
  await render();await click(tab('Document & approval'));
  expect(dialog().querySelector('[aria-label="Policy approval authority"]')).not.toBeNull();
  expect(dialog().querySelector('[data-testid="policy-submit-review"]').textContent).toBe('Submit for approval');
  expect(dialog().querySelector('[aria-label="External document reference"]').value).toBe('Controlled policy register');
  expect(dialog().querySelector('[aria-label="Document/version identifier"]').value).toBe('Revision 2.0');
  expect(dialog().querySelector('[aria-label="Named business approver"]')).not.toBeNull();
  expect(api.get).toHaveBeenCalledWith('/policies/policy-native/approval-context',expect.any(Object));
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('pending native approval locks policy fields and keeps authenticated decision controls in the approved tab',async()=>{
  const subject={subject_id:'subject-native',title:policy.title,version:'2.0',captured_at:'2026-10-20T08:00:00Z',basis:{type:'external',reference:'Controlled policy register',document_version:'Revision 2.0'}};
  Object.assign(policy,{status:'in_review',approval_request_id:'request-native',approval_subject:subject});
  Object.assign(context,{status:'in_review',approval_request_id:'request-native',subject});
  await render();
  for(const label of ['Title','Category','Purpose'])expect(dialog().querySelector(`[aria-label="${label}"]`).disabled).toBe(true);
  expect(dialog().querySelector('[aria-label="Owner"]').disabled).toBe(true);
  expect(button('Save changes').disabled).toBe(true);
  await click(tab('Document & approval'));
  expect(dialog().querySelector('[data-testid="policy-approve"]')).not.toBeNull();
  expect(dialog().querySelector('[data-testid="policy-reject"]').disabled).toBe(true);
  expect(dialog().querySelector('[aria-label="Decision comment"]')).not.toBeNull();
  expect(api.post).not.toHaveBeenCalled();
});

test('unsaved native approval-basis edits keep their existing navigation and parent-save locks',async()=>{
  await render();await click(tab('Document & approval'));
  await input(dialog().querySelector('[aria-label="External document reference"]'),'Changed authoritative location');
  expect([...dialog().querySelectorAll('.pw-tabs button')].every(node=>node.disabled)).toBe(true);
  expect(button('Save changes').disabled).toBe(true);
  expect(dialog().querySelector('[aria-label="External document reference"]').value).toBe('Changed authoritative location');
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('unfinished Policy comment blocks navigation/save and pending post locks the composer without losing failure text',async()=>{
  await render();await click(tab('Comments'));
  const composer=dialog().querySelector('[data-testid="comment-input"]');
  await input(composer,'Preserve this native Policy comment.');
  await click(tab('Overview'));
  expect(tab('Comments').getAttribute('aria-selected')).toBe('true');
  expect(toast.error).toHaveBeenCalledWith('Finish or discard the unfinished approval details or comment before switching tabs.');
  await click(button('Save changes'));expect(api.patch).not.toHaveBeenCalled();
  let rejectPost;api.post.mockImplementationOnce(()=>new Promise((resolve,reject)=>{rejectPost=reject;}));
  await act(async()=>{const post=dialog().querySelector('[data-testid="comment-submit"]');post.click();post.click();});
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/comments',{entity_type:'policies',entity_id:policy.policy_id,body:'Preserve this native Policy comment.'});
  expect(composer.disabled).toBe(true);
  expect([...dialog().querySelectorAll('.pw-tabs button')].every(node=>node.disabled)).toBe(true);
  await act(async()=>rejectPost(new Error('Policy comment failed')));
  expect(composer.disabled).toBe(false);expect(composer.value).toBe('Preserve this native Policy comment.');
  expect(toast.error).toHaveBeenCalledWith('Policy comment failed');
});

test('clearing optional Purpose remains a deliberate empty draft and preserves other governance context on Save',async()=>{
  const originalContext={...policy.governance_context};
  await render();const purpose=dialog().querySelector('[aria-label="Purpose"]');
  await input(purpose,'');
  expect(purpose.value).toBe('');
  await click(button('Save changes'));
  expect(api.patch).toHaveBeenCalledWith('/policies/policy-native',expect.objectContaining({governance_context:{...originalContext,rationale:''},expected_updated_at:'2026-10-20T08:00:00Z'}),expect.any(Object));
});
