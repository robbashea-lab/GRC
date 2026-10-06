import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import {activePlans} from '@/lib/frameworks';

let mockUser,mockGroup;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'client'})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn()},formatError:e=>e.message}));
jest.mock('./AssigneeSelect',()=>({label,value,onChange,disabled})=><select aria-label={label} value={value||''} onChange={e=>onChange(e.target.value)} disabled={disabled}><option value="">Unassigned</option><option value="manager">Manager</option><option value="contributor">Contributor</option></select>);
jest.mock('react-router-dom',()=>({Link:({children,to,...props})=><a href={to} {...props}>{children}</a>}),{virtual:true});
jest.mock('./ui/sheet',()=>({Sheet:({children})=><div>{children}</div>,SheetContent:({children,...props})=><div {...props}>{children}</div>,SheetHeader:({children})=><div>{children}</div>,SheetTitle:({children})=><h2>{children}</h2>,SheetDescription:({children})=><p>{children}</p>}));
jest.mock('./ui/alert-dialog',()=>({AlertDialog:({open,children})=>open?<div>{children}</div>:null,AlertDialogContent:({children})=><div>{children}</div>,AlertDialogTitle:({children})=><h2>{children}</h2>,AlertDialogDescription:({children})=><p>{children}</p>,AlertDialogFooter:({children})=><div>{children}</div>,AlertDialogCancel:({children})=><button>{children}</button>,AlertDialogAction:({children,...props})=><button {...props}>{children}</button>}));
let root,node,record;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockUser={user_id:'manager',role:'client_grc_manager'};mockGroup=1;
  node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);
  record={framework_assessment_id:'assessment-4.1',framework_key:'iso-27001',definition_id:'4.1',client_id:'client',owner_id:'manager',last_assessed:'2026-10-01',status:'in_progress',implementation:'Saved scope',assessment_history:[{status:'in_progress',implementation:'Historical scope',at:'2026-10-01',by:'manager'}]};
  api.get.mockImplementation(async path=>({data:path.endsWith('/related')?{reviews:[],evidence:[]}:path.endsWith('/members')?[{user_id:'manager',name:'Manager',role:'client_grc_manager',client_ids:['client']},{user_id:'contributor',name:'Contributor',role:'client_contributor',client_ids:['client']}]:path==='/comments'?[{comment_id:'comment',body:'Historical discussion',author_name:'Manager',created_at:'2026-10-01'}]:path.endsWith('/activity')?[{audit_id:'event',action:'assessment saved',at:'2026-10-01'}]:path.startsWith('/frameworks/')?{assessments:[record],configuration:{implementation_group:mockGroup}}:path==='/risks'?[{risk_id:'risk',client_id:'client',title:'Exact scoped risk'}]:[]}));
  api.patch.mockImplementation(async(path,body)=>({data:{...record,...body}}));api.post.mockResolvedValue({data:{}});
});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();});
const button=text=>[...node.querySelectorAll('button')].find(b=>b.textContent===text);
const change=async(field,value)=>act(async()=>{Object.getOwnPropertyDescriptor(field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLSelectElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event(field.tagName==='TEXTAREA'?'input':'change',{bubbles:true}));});
const render=props=>act(async()=>root.render(<FrameworkDrawer open recordManagement record={record} clientId="client" onOpenChange={()=>{}} {...props}/>));

test('Frameworks owner save uses only exact assessment owner and version guard; saved history/comments remain readable',async()=>{
  await render();expect(node.querySelector('[data-testid="framework-record-management"]')).toBeTruthy();
  expect(node.querySelectorAll('[role="tab"]')).toHaveLength(0);
  expect(node.textContent).toContain('Historical scope');expect(node.textContent).toContain('Historical discussion');expect(node.textContent).toContain('assessment saved');
  await change(node.querySelector('[aria-label="Assessment Owner"]'),'contributor');
  await act(async()=>button('Save owner').click());
  expect(api.patch).toHaveBeenCalledWith('/framework_assessments/assessment-4.1',{owner_id:'contributor',expected_last_assessed:'2026-10-01'});
  expect(api.post).not.toHaveBeenCalled();expect(record.implementation).toBe('Saved scope');
});

test('ISO comment and record link keep exact source context; Review navigation protects the unsaved draft',async()=>{
  const navigate=jest.fn();await render({onReviews:navigate});
  await change(node.querySelector('[aria-label="Requirement comment"]'),'Unsaved ISO discussion');
  await act(async()=>node.querySelector('a[href^="/reviews"]').click());expect(navigate).not.toHaveBeenCalled();expect(node.textContent).toContain('Leave unsaved changes?');
  await act(async()=>button('Discard changes').click());
  expect(navigate).toHaveBeenCalledWith('/reviews?client_id=client&framework_key=iso-27001&framework_assessment=assessment-4.1');
  await act(async()=>button('Add comment').click());
  expect(api.post).toHaveBeenCalledWith('/comments',{client_id:'client',entity_type:'framework_assessments',entity_id:'assessment-4.1',body:'Unsaved ISO discussion'});
});

test('readonly retains history but cannot assign, comment or link; Review management has no assessment-owner editor',async()=>{
  mockUser={user_id:'viewer',role:'client_viewer'};await render();
  expect(node.textContent).toContain('Historical scope');expect(button('Save owner').disabled).toBe(true);expect(button('Link record').disabled).toBe(true);expect(node.querySelector('[aria-label="Requirement comment"]')).toBeNull();
  await act(async()=>root.render(<FrameworkDrawer open reviewManagement record={record} clientId="client" onOpenChange={()=>{}}/>));
  expect(node.querySelector('[data-testid="framework-review-management"]')).toBeTruthy();expect(node.querySelector('[aria-label="Assessment Owner"]')).toBeNull();expect(button('Create or link recurring Review')).toBeUndefined();
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('selected relationship stays a protected draft until the exact link command succeeds',async()=>{
  const close=jest.fn();await render({onOpenChange:close});
  expect(api.get).toHaveBeenCalledWith('/risks',expect.objectContaining({params:{client_id:'client'}}));
  await change(node.querySelector('[aria-label="Related record"]'),'risk');
  await act(async()=>button('Close').click());expect(close).not.toHaveBeenCalled();expect(node.textContent).toContain('Leave unsaved changes?');
  await act(async()=>button('Link record').click());
  expect(api.post).toHaveBeenCalledWith('/framework_assessments/assessment-4.1/links',{kind:'risks',id:'risk'});
  expect(node.querySelector('[aria-label="Related record"]').value).toBe('');
});

test.each([1,2,3])('Reviews reuses configured CIS IG%s plan scope and separate Review owner',async group=>{
  mockGroup=group;mockUser.role='platform_admin';record={...record,framework_key:'cis-ig1',definition_id:'6.1'};
  await render({recordManagement:false,reviewManagement:true});
  await act(async()=>button('Create or link recurring Review').click());
  const plan=activePlans('cis-ig1',{implementation_group:group}).find(p=>p.safeguards.includes('6.1'));
  expect(node.textContent).toContain('Related requirements: '+plan.safeguards.join(', ')+'.');
  await change(node.querySelector('[aria-label="Review Owner"]'),'contributor');
  await act(async()=>button('Save Review').click());
  expect(api.post).toHaveBeenCalledWith('/framework_assessments/assessment-4.1/reviews',expect.objectContaining({owner_id:'contributor',plan_key:plan.key}));
  expect(record.owner_id).toBe('manager');expect(api.patch).not.toHaveBeenCalled();
});

test.each(['client_grc_manager','client_contributor'])('CIS relationship UI preserves original role restriction for %s',async role=>{
  mockUser.role=role;record={...record,framework_key:'cis-ig1',definition_id:'6.1',owner_id:mockUser.user_id};
  await render({recordManagement:false,reviewManagement:true});expect(button('Create or link recurring Review')).toBeUndefined();
});

test('retained out-of-scope CIS safeguard is readable but cannot initialize a new Review',async()=>{
  mockUser.role='platform_admin';record={...record,framework_key:'cis-ig1',definition_id:'6.8'};
  await render({recordManagement:false,reviewManagement:true});expect(button('Create or link recurring Review')).toBeUndefined();
});
