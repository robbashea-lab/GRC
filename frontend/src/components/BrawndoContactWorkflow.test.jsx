import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ContactWorkspace from './ContactWorkspace';
import api from '@/lib/api';
import {toast} from 'sonner';

let mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
let mockWorkspaceMode='demo';
let mockEligible=true;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:mockWorkspaceMode})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({refresh:jest.fn()})}));
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>mockEligible}));
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn()}));
jest.mock('./RecordDrawer',()=>props=><div data-testid="owned-record">{props.kind}:{props.record.title}</div>);
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
jest.mock('sonner',()=>({toast:{info:jest.fn(),success:jest.fn(),error:jest.fn()}}));

const client={client_id:'demo_brawndo',name:'Brawndo',primary_contact_id:null,updated_at:'client-v1'};
const contact={contact_id:'person',client_id:client.client_id,name:'Person',email:'person@example.test',title:'Security lead',phone:'Retained phone',notes:'Retained notes',status:'active',updated_at:'contact-v1',linked_user_id:'account'};
const account={user_id:'account',name:'Person',email:'login@example.test',role:'client_contributor',status:'active',updated_at:'account-v1'};
let root,container,close;
const button=name=>[...document.querySelectorAll('button')].find(node=>node.textContent===name);
const click=async node=>act(async()=>node.click());
const input=async(node,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
const render=async(record,extra={})=>act(async()=>root.render(<ContactWorkspace open clientId={client.client_id} record={record} onOpenChange={close} {...extra}/>));
const submit=async()=>act(async()=>document.querySelector('.contact-concept-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
beforeEach(()=>{
  sessionStorage.clear();api.get.mockReset();api.post.mockReset();api.patch.mockReset();
  global.IS_REACT_ACT_ENVIRONMENT=true;mockEligible=true;mockWorkspaceMode='demo';mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};window.history.replaceState({},'','/contacts');
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);close=jest.fn();
  api.get.mockImplementation(async path=>({data:path==='/clients/demo_brawndo'?client:path==='/users'?[account]:path.endsWith('/contact-accounts')?[{...account,has_client_access:true}]:path.includes('/open_assignments')?{total:1,risks:1,items:[{kind:'risks',id:'risk',client_id:client.client_id,title:'Real risk',status:'open'}]}:path==='/contacts/person'?contact:path==='/risks/risk'?{risk_id:'risk',client_id:client.client_id,title:'Real risk'}:[]}));
  api.post.mockImplementation(async(_path,body)=>({data:{...body,contact_id:'created',updated_at:'contact-created'}}));
  api.patch.mockImplementation(async(path,body)=>({data:{...(path.startsWith('/contacts/')?contact:account),...body,updated_at:'v2'}}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();window.history.replaceState({},'','/');});

test('new contact uses unique input IDs and creates no account without the explicit invitation',async()=>{
  await render(null);const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);expect(new Set(ids).size).toBe(ids.length);
  const title=document.querySelector('#contact-workflow-title');expect(document.querySelector('label[for="contact-workflow-title"]').textContent).toBe('Role in the program');expect(title.tagName).toBe('INPUT');
  await input(document.querySelector('#contact-workflow-name'),'New contact');await input(document.querySelector('#contact-workflow-email'),'new@example.test');await submit();
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][0]).toBe('/contacts');expect(api.post.mock.calls[0][1]).not.toHaveProperty('role');expect(close).toHaveBeenCalledWith(false);
});

test('Contact editing preserves hidden values and account identity; Owns opens the real same-client record',async()=>{
  await render(contact);await input(document.querySelector('#contact-workflow-email'),'contact-only@example.test');await submit();
  expect(api.patch).toHaveBeenCalledWith('/contacts/person',expect.objectContaining({email:'contact-only@example.test',phone:'Retained phone',notes:'Retained notes',expected_updated_at:'contact-v1'}),expect.objectContaining({headers:expect.objectContaining({'Idempotency-Key':expect.any(String)})}));
  expect(api.patch.mock.calls.some(([path])=>path.startsWith('/users/'))).toBe(false);
  await click([...document.querySelectorAll('[role=tab]')].find(node=>node.textContent.startsWith('Owns')));await click(button('Open →'));
  expect(api.get).toHaveBeenCalledWith('/risks/risk');expect(document.body.textContent).toContain('risks:Real risk');
});

test('partial primary success and failed role save retain the role draft and dirty close guard',async()=>{
  let releaseReload;let reload=false;
  const normal=api.get.getMockImplementation();api.get.mockImplementation((path,...args)=>reload&&path==='/clients/demo_brawndo'?new Promise(resolve=>{releaseReload=resolve;}):normal(path,...args));
  api.patch.mockImplementation(async(path,body)=>{if(path.startsWith('/users/'))throw Error('Role changed elsewhere');if(path.startsWith('/clients/')){reload=true;return {data:{...client,...body}};}return {data:{...contact,...body,updated_at:'contact-v2'}};});
  await render(contact);await click(document.querySelector('input[type=checkbox]'));
  await click(button('Platform access'));await click([...document.querySelectorAll('.roles button')].find(node=>node.textContent.startsWith('Read Only'))||[...document.querySelectorAll('.roles button')].find(node=>node.textContent.startsWith('Read only')));
  await submit();expect(document.body.textContent).toContain('Role changed elsewhere');expect(releaseReload).toBeDefined();
  await click(button('Close'));expect(document.body.textContent).toContain('Discard contact changes?');expect(close).not.toHaveBeenCalled();
});

test('an ineligible or wrong-route record keeps the ordinary native editor',async()=>{
  mockEligible=false;await render(contact);expect(document.querySelector('.contact-concept-form')).toBeNull();expect(document.querySelector('#contact-phone')).toBeTruthy();
  mockEligible=true;window.history.replaceState({},'','/vendors');await render(contact);expect(document.querySelector('.contact-concept-form')).toBeNull();
});

test.each([false,true])('a deferred Contact A save cannot target or overwrite a switched Contact (return to A: %s)',async returnToA=>{
  const other={...contact,contact_id:'person-b',name:'Person B',email:'b@example.test',linked_user_id:'account-b',updated_at:'contact-b-v1'};
  const otherAccount={...account,user_id:'account-b',name:'Person B',role:'client_contributor',updated_at:'account-b-v1'};
  const normalGet=api.get.getMockImplementation();
  api.get.mockImplementation((path,...args)=>path==='/users'?Promise.resolve({data:[account,otherAccount]}):normalGet(path,...args));
  let resolveContact;
  api.patch.mockImplementation((path,body)=>path==='/contacts/person'?new Promise(resolve=>{resolveContact=resolve;}):Promise.resolve({data:{...otherAccount,...body}}));
  const saved=jest.fn();
  await render(contact,{onSaved:saved});await click(button('Platform access'));
  await click([...document.querySelectorAll('.roles button')].find(node=>/^Read [Oo]nly/.test(node.textContent)));
  await submit();expect(resolveContact).toBeDefined();
  await render(other,{onSaved:saved});
  if(returnToA)await render(contact,{onSaved:saved});
  await act(async()=>resolveContact({data:{...contact,name:'Stale saved A',updated_at:'contact-v2'}}));
  expect(api.patch.mock.calls.map(([path])=>path)).toEqual(['/contacts/person']);
  expect(document.querySelector('#contact-workflow-name').value).toBe(returnToA?'Person':'Person B');
  expect(document.body.textContent).not.toContain('Stale saved A');
  expect(saved).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('.contact-concept-form button[type="submit"]').textContent).toBe('Save changes');
});

test.each(['actor','authority','mode','actor-mode','client','closed','unmount'])('a pending Contact save stops continuations after %s scope withdrawal',async change=>{
  let rejectContact;
  api.patch.mockImplementation(()=>new Promise((_resolve,reject)=>{rejectContact=reject;}));
  const saved=jest.fn();
  await render(contact,{onSaved:saved});
  await input(document.querySelector('#contact-workflow-name'),'Pending change');await submit();
  expect(rejectContact).toBeDefined();
  if(change==='actor'){mockUser={...mockUser,user_id:'another-admin'};await render(contact,{onSaved:saved});}
  if(change==='authority'){mockUser={...mockUser,role:'client_readonly'};await render(contact,{onSaved:saved});}
  if(change==='mode'){mockWorkspaceMode='standard';await render(contact,{onSaved:saved});}
  if(change==='actor-mode'){mockUser={...mockUser,workspace_mode:'standard'};await render(contact,{onSaved:saved});}
  if(change==='client')await render({...contact,contact_id:'other-client-contact',client_id:'other-client',name:'Other client person'},{clientId:'other-client',onSaved:saved});
  if(change==='closed')await render(contact,{open:false,onSaved:saved});
  if(change==='unmount')await act(async()=>root.render(null));
  await act(async()=>rejectContact(Error('Stale Contact request failure')));
  expect(api.patch).toHaveBeenCalledTimes(1);expect(saved).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('Stale Contact request failure');
});

test('a confirmed new Contact remains recoverable after invitation failure without being created twice',async()=>{
  api.post.mockImplementation(async(path,body)=>{if(path==='/contacts')return {data:{...body,contact_id:'created',updated_at:'created-v1'}};throw Error('Invitation failed');});
  const normalGet=api.get.getMockImplementation();api.get.mockImplementation((path,...args)=>path==='/contacts/created'?Promise.resolve({data:{...contact,contact_id:'created',linked_user_id:null,name:'Created person'}}):normalGet(path,...args));
  await render(null);
  await input(document.querySelector('#contact-workflow-name'),'Created person');await input(document.querySelector('#contact-workflow-email'),'created@example.test');
  const invite=[...document.querySelectorAll('input[type="checkbox"]')].find(node=>node.parentElement.textContent.includes('Invite to GoverNara'));
  await click(invite);await submit();
  expect(document.body.textContent).toContain('Contact saved. A related action was not confirmed');
  expect(document.body.textContent).toContain('Invitation failed');
  expect(api.post.mock.calls.filter(([path])=>path==='/contacts')).toHaveLength(1);
  expect(api.post.mock.calls.some(([path])=>path==='/contacts/created/invite')).toBe(true);
  expect(document.querySelector('#contact-workflow-name').value).toBe('Created person');expect(close).not.toHaveBeenCalled();
  await input(document.querySelector('#contact-workflow-title'),'Updated after recovery');await submit();
  expect(api.post.mock.calls.filter(([path])=>path==='/contacts')).toHaveLength(1);
  expect(api.patch.mock.calls.some(([path])=>path==='/contacts/created')).toBe(true);
});

test.each(['primary','invite'])('a confirmed creation survives a temporary presentation withdrawal and stops its %s action',async action=>{
  let resolveCreate;const saved=jest.fn();
  api.post.mockImplementation(()=>new Promise(resolve=>{resolveCreate=resolve;}));
  const created={...contact,contact_id:'created',linked_user_id:null,name:'Created person'};
  const normalGet=api.get.getMockImplementation();api.get.mockImplementation((path,...args)=>path==='/contacts/created'?Promise.resolve({data:created}):normalGet(path,...args));
  await render(null,{onSaved:saved});
  await input(document.querySelector('#contact-workflow-name'),created.name);await input(document.querySelector('#contact-workflow-email'),created.email);
  const actionLabel=action==='primary'?'Make primary contact':'Invite to GoverNara';
  await click([...document.querySelectorAll('input[type="checkbox"]')].find(node=>node.parentElement.textContent.includes(actionLabel)));await submit();
  expect(resolveCreate).toBeDefined();
  mockEligible=false;await render(null,{onSaved:saved});mockEligible=true;await render(null,{onSaved:saved});
  await act(async()=>resolveCreate({data:created}));
  expect(document.body.textContent).toContain('Refresh this contact before completing the remaining action.');
  expect(api.patch).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('#contact-workflow-name').value).toBe(created.name);
  await input(document.querySelector('#contact-workflow-title'),'Recovered Contact');await submit();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.patch.mock.calls.some(([path])=>path==='/contacts/created')).toBe(true);
});

test('Disable access stops before confirmation when its assignments read completes in another Contact',async()=>{
  await render(contact);await click(button('Platform access'));
  let resolveAssignments;const normalGet=api.get.getMockImplementation();
  api.get.mockImplementation((path,...args)=>path==='/users/account/open_assignments'?new Promise(resolve=>{resolveAssignments=resolve;}):normalGet(path,...args));
  const confirm=jest.spyOn(window,'confirm').mockReturnValue(true),saved=jest.fn();
  try{
    await click(button('Disable access'));expect(resolveAssignments).toBeDefined();
    await render({...contact,contact_id:'person-b',name:'Person B'},{onSaved:saved});
    await act(async()=>resolveAssignments({data:{total:1}}));
    expect(confirm).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  }finally{confirm.mockRestore();}
});

test('the shared retry repeats the original native command and accepts its confirmed result',async()=>{
  const saved=jest.fn();api.patch.mockRejectedValueOnce(Error('Response lost'));
  await render(contact,{onSaved:saved});await input(document.querySelector('#contact-workflow-name'),'Confirmed retry');await submit();
  expect(button('Retry unconfirmed save')).toBeTruthy();
  const original=api.patch.mock.calls[0];await click(button('Retry unconfirmed save'));
  expect(api.patch.mock.calls[1]).toEqual(original);
  expect(document.querySelector('#contact-workflow-name').value).toBe('Confirmed retry');
  expect(saved).toHaveBeenCalledTimes(1);expect(toast.success).toHaveBeenCalledWith('Saved');expect(close).not.toHaveBeenCalled();
});

test.each(['record','actor'])('a pending retry cannot overwrite or notify a changed %s context',async change=>{
  let resolveRetry;const saved=jest.fn();
  api.patch.mockRejectedValueOnce(Error('Response lost')).mockImplementationOnce(()=>new Promise(resolve=>{resolveRetry=resolve;}));
  await render(contact,{onSaved:saved});await input(document.querySelector('#contact-workflow-name'),'Pending retry');await submit();
  await click(button('Retry unconfirmed save'));expect(resolveRetry).toBeDefined();
  if(change==='actor'){mockUser={...mockUser,user_id:'other-admin'};await render(contact,{onSaved:saved});}
  else await render({...contact,contact_id:'person-b',name:'Person B'},{onSaved:saved});
  await act(async()=>resolveRetry({data:{...contact,name:'Stale retry'}}));
  expect(document.querySelector('#contact-workflow-name').value).toBe(change==='actor'?'Person':'Person B');
  expect(saved).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();
});

test('a dispatched resend cannot refresh or notify a different Contact on completion',async()=>{
  const pending={...account,status:'invited'};const normalGet=api.get.getMockImplementation();
  api.get.mockImplementation((path,...args)=>path==='/users'?Promise.resolve({data:[pending]}):path.endsWith('/contact-accounts')?Promise.resolve({data:[{...pending,has_client_access:true}]}):normalGet(path,...args));
  let resolveResend;api.post.mockImplementation(()=>new Promise(resolve=>{resolveResend=resolve;}));
  const saved=jest.fn();await render(contact,{onSaved:saved});await click(button('Platform access'));await click(button('Resend invite'));
  expect(resolveResend).toBeDefined();await render({...contact,contact_id:'person-b',name:'Person B'},{onSaved:saved});
  const reads=api.get.mock.calls.length;await act(async()=>resolveResend({data:{}}));
  expect(api.get.mock.calls).toHaveLength(reads);expect(toast.info).not.toHaveBeenCalled();expect(saved).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
});

test('an accepted archive completion cannot close or update a different Contact',async()=>{
  let resolveArchive;api.patch.mockImplementation(()=>new Promise(resolve=>{resolveArchive=resolve;}));
  const saved=jest.fn(),unlinked={...contact,linked_user_id:null};
  await render(unlinked,{onSaved:saved});await click(button('Platform access'));await click(button('Archive contact'));await click(button('Archive Contact'));
  expect(resolveArchive).toBeDefined();await render({...unlinked,contact_id:'person-b',name:'Person B'},{onSaved:saved});
  await act(async()=>resolveArchive({data:{...unlinked,status:'inactive'}}));
  expect(saved).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(document.querySelector('#contact-workflow-name').value).toBe('Person B');
});
