import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Contacts from './Contacts';
import ContactWorkspace from '@/components/ContactWorkspace';
import api from '@/lib/api';
let mockClient='a';
const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient,currentClient:{name:'Brawndo'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message}));
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams())}),{virtual:true});
jest.mock('@/lib/reference',()=>({isBrawndoReference:id=>id==='demo_brawndo'}));
jest.mock('@/lib/recordUuid',()=>({recordUuid:()=> 'contact-test-intent'}));
const row={contact_id:'c',client_id:'a',name:'Person',email:'person@example.test',title:'Engineer',status:'active',role:'Security Lead',grc_roles:['HR Lead'],notes:'Retained notes',updated_at:'version-1'};
let root,container;
const click=node=>act(async()=>node.click());
const button=name=>[...document.querySelectorAll('button')].find(b=>b.textContent===name);
const input=(node,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
const submit=()=>act(async()=>document.querySelector('.contact-workspace-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;mockClient='a';mockUser.role='super_admin';container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockImplementation(async path=>({data:path==='/contacts'?[row,{...row,contact_id:'old',name:'Former',status:'inactive'}]:path==='/contacts/c'?row:[]}));
  api.post.mockImplementation(async(path,body)=>({data:path==='/contacts'?{...body,contact_id:'c',updated_at:'version-1'}:{user:{user_id:'u'},simulated:true}}));
  api.patch.mockImplementation(async(path,body)=>({data:{...row,...body,updated_at:'version-2'}}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('directory has only contact columns, search/access/archive controls; legacy governance UX is absent',async()=>{
  await act(async()=>root.render(<Contacts/>));
  expect([...container.querySelectorAll('thead th')].map(n=>n.textContent)).toEqual(['Contact','Job Title','Email','Phone','Platform Access','Actions']);
  expect(container.textContent).not.toMatch(/Responsibility coverage|GRC Role|Contact status|Security Lead|HR Lead|Former/);
  await input(container.querySelector('[data-testid=contacts-search]'),'missing');expect(container.querySelectorAll('tbody tr')).toHaveLength(1);expect(container.textContent).toContain('No contacts match');
  await input(container.querySelector('[data-testid=contacts-search]'),'');await click(container.querySelector('input[type=checkbox]'));expect(container.textContent).toContain('Former');
});
test('creation without invitation creates only contact; identity and responsibility fields never submitted',async()=>{
  const close=jest.fn();await act(async()=>root.render(<ContactWorkspace open onOpenChange={close} clientId="a"/>));
  await input(document.querySelector('#contact-name'),'New person');await input(document.querySelector('#contact-email'),'new@example.test');await submit();
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][0]).toBe('/contacts');expect(api.post.mock.calls[0][1]).not.toHaveProperty('role');expect(close).toHaveBeenCalledWith(false);
});
test('optional invitation follows confirmed contact creation and reports simulation',async()=>{
  await act(async()=>root.render(<ContactWorkspace open onOpenChange={()=>{}} clientId="a"/>));
  await input(document.querySelector('#contact-name'),'New person');await input(document.querySelector('#contact-email'),'new@example.test');await click(document.querySelector('.contact-workspace input[type=checkbox]'));
  expect(document.body.textContent).toContain('No email will be sent');await submit();
  expect(api.post.mock.calls[1]).toEqual(['/contacts/c/invite',{role:'client_readonly',client_id:'a',confirmed:true}]);
});
test('invitation failure retains saved identity; retry saving never creates a duplicate contact',async()=>{
  const close=jest.fn();api.post.mockImplementation(async(path,body)=>{if(path.endsWith('/invite'))throw Error('Delivery unavailable');return {data:{...body,contact_id:'c'}};});
  await act(async()=>root.render(<ContactWorkspace open onOpenChange={close} clientId="a"/>));await input(document.querySelector('#contact-name'),'Person');await input(document.querySelector('#contact-email'),'person@example.test');await click(document.querySelector('.contact-workspace input[type=checkbox]'));await submit();
  expect(document.body.textContent).toContain('Contact saved');expect(close).not.toHaveBeenCalled();await submit();expect(api.post.mock.calls.filter(([p])=>p==='/contacts')).toHaveLength(1);expect(api.patch).toHaveBeenCalled();
});
test('edit preserves notes and omitted legacy values, failure retains draft and cancel asks to discard',async()=>{
  const close=jest.fn();api.patch.mockRejectedValue(Error('Save unavailable'));
  await act(async()=>root.render(<ContactWorkspace open onOpenChange={close} clientId="a" record={row}/>));await input(document.querySelector('#contact-title'),'Updated title');await submit();expect(document.querySelector('#contact-title').value).toBe('Updated title');
  expect(api.patch.mock.calls[0][1]).toMatchObject({title:'Updated title',notes:'Retained notes',expected_updated_at:'version-1'});expect(api.patch.mock.calls[0][1]).not.toHaveProperty('status');await click(button('Cancel'));expect(document.body.textContent).toContain('Discard contact changes?');expect(close).not.toHaveBeenCalled();
});
test('active account archiving is blocked and readonly users get no mutations',async()=>{
  api.get.mockResolvedValue({data:[{user_id:'u',status:'active',has_client_access:true}]});
  await act(async()=>root.render(<ContactWorkspace open onOpenChange={()=>{}} clientId="a" record={{...row,linked_user_id:'u'}}/>));expect(button('Archive Contact').disabled).toBe(true);expect(document.body.textContent).toContain('Active account');
  mockUser.role='client_readonly';await act(async()=>root.render(<ContactWorkspace open onOpenChange={()=>{}} clientId="a" record={row}/>));expect(button('Archive Contact')).toBeUndefined();expect(button('Save Changes')).toBeUndefined();
});
test('tenant switching closes editor and does not show earlier contacts',async()=>{
  await act(async()=>root.render(<Contacts/>));await click(button('Person'));expect(document.querySelector('[role=dialog]')).not.toBeNull();mockClient='b';await act(async()=>root.render(<Contacts/>));expect(document.querySelector('[role=dialog]')).toBeNull();expect(container.textContent).not.toContain('Person');
});
test('Brawndo reference renders the themed header; other clients keep the standard header',async()=>{
  mockClient='demo_brawndo';api.get.mockResolvedValue({data:[]});await act(async()=>root.render(<Contacts/>));
  expect(container.querySelector('.bpage h1').textContent).toBe('Contacts');expect(container.querySelector('.bpage-eyebrow').textContent).toBe('Brawndo · People');expect(button('New Contact')).toBeTruthy();
  await act(async()=>root.unmount());root=createRoot(container);mockClient='a';await act(async()=>root.render(<Contacts/>));
  expect(container.querySelector('.bpage')).toBeNull();expect(container.querySelector('h1').textContent).toBe('Contacts');
});
