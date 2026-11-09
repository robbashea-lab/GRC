import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import {activePlans,frameworkCatalog} from '@/lib/frameworks';

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
  api.get.mockImplementation(async path=>({data:path==='/organizational-controls'?{items:[],migration_pending:0,has_more:false}:path==='/organizational-controls/candidates'?{items:[],has_more:false}:path==='/organizational-controls/assessments'?[record]:path.endsWith('/related')?{reviews:[],evidence:[]}:path.endsWith('/members')?[{user_id:'manager',name:'Manager',role:'client_grc_manager',client_ids:['client']},{user_id:'contributor',name:'Contributor',role:'client_contributor',client_ids:['client']}]:path==='/comments'?[{comment_id:'comment',body:'Historical discussion',author_name:'Manager',created_at:'2026-10-01'}]:path.endsWith('/activity')?[{audit_id:'event',action:'assessment saved',at:'2026-10-01'}]:path.startsWith('/frameworks/')?{assessments:[record],configuration:{implementation_group:mockGroup}}:path==='/risks'?[{risk_id:'risk',client_id:'client',title:'Exact scoped risk'}]:[]}));
  api.patch.mockImplementation(async(path,body)=>({data:{...record,...body}}));api.post.mockResolvedValue({data:{}});
});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();});
const button=text=>[...node.querySelectorAll('button')].find(b=>b.textContent===text);
const change=async(field,value)=>act(async()=>{Object.getOwnPropertyDescriptor(field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLSelectElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event(field.tagName==='TEXTAREA'?'input':'change',{bubbles:true}));});
const render=props=>act(async()=>root.render(<FrameworkDrawer open recordManagement record={record} clientId="client" onOpenChange={()=>{}} {...props}/>));
const controlDialog=()=>document.querySelector('[role="dialog"]');
const controlButton=text=>[...controlDialog().querySelectorAll('button')].find(b=>b.textContent===text);
const nameControl=async value=>act(async()=>{
  const field=controlDialog().querySelector('[aria-label="Organizational Control name"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,value);
  field.dispatchEvent(new Event('input',{bubbles:true}));
});

test('ISO Manage retains the client-wide Controls manager without narrowing or defaulting it to the selected requirement',async()=>{
  mockUser.role='platform_admin';await render();
  expect(node.querySelector('[aria-label="Organizational Controls"]')).toBeTruthy();
  expect(api.get).toHaveBeenCalledWith('/organizational-controls',expect.objectContaining({params:{client_id:'client',assessment_id:undefined,offset:0}}));
  expect(node.textContent).not.toContain('Show all client Controls to reuse an existing one');
  expect(button('Create organizational Control')).toBeDefined();
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('an unsaved Control draft in ISO Manage activates the existing parent leave guard without saving either record',async()=>{
  mockUser.role='platform_admin';const close=jest.fn();await render({onOpenChange:close});
  await act(async()=>button('Create organizational Control').click());await nameControl('Unsaved operating Control');
  await act(async()=>button('Close').click());
  expect(close).not.toHaveBeenCalled();expect(node.textContent).toContain('Leave unsaved changes?');
  expect(controlDialog().querySelector('[aria-label="Organizational Control name"]').value).toBe('Unsaved operating Control');
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  await act(async()=>button('Discard changes').click());expect(close).toHaveBeenCalledWith(false);
});

test('saving a client-wide Control refreshes ISO management and the caller without changing the assessment or adding a default mapping',async()=>{
  mockUser.role='platform_admin';const onSaved=jest.fn();
  const control={control_id:'control-created',client_id:'client',name:'Client-wide operating Control',description:'',frequency:'',design:'not_assessed',owner_id:null,assessment_ids:[],related_links:[],conflicts:[],observations:[],legacy_sources:[],history:[],linked_records:{}};
  const original=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,...args)=>path==='/organizational-controls/control-created'?{data:control}:original(path,...args));
  api.post.mockImplementation(async path=>({data:path==='/organizational-controls'?control:{}}));
  await render({onSaved});await act(async()=>button('Create organizational Control').click());await nameControl(control.name);
  await act(async()=>controlButton('Save Control').click());
  expect(api.post).toHaveBeenCalledWith('/organizational-controls',{name:control.name,description:'',frequency:'',design:'not_assessed',owner_id:null,assessment_ids:[],related_links:[],client_id:'client',request_id:expect.any(String)});
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(api.get.mock.calls.filter(([path])=>path==='/frameworks/iso-27001').length).toBeGreaterThan(1);
  expect(controlDialog().textContent).toContain('Control saved. Framework assessments are unchanged.');
  expect(api.patch).not.toHaveBeenCalled();expect(record.implementation).toBe('Saved scope');
  await act(async()=>button('Close').click());
  expect(node.textContent).not.toContain('Leave unsaved changes?');
});

test('ISO Review-only management does not mount the client-wide Controls manager',async()=>{
  await render({recordManagement:false,reviewManagement:true});
  expect(node.querySelector('[aria-label="Organizational Controls"]')).toBeNull();
  expect(api.get.mock.calls.some(([path])=>path==='/organizational-controls')).toBe(false);
});

test('Frameworks owner save uses only exact assessment owner and version guard; saved history/comments remain readable',async()=>{
  await render();expect(node.querySelector('[data-testid="framework-record-management"]')).toBeTruthy();
  expect(node.querySelectorAll('[role="tab"]')).toHaveLength(0);
  expect(node.textContent).toContain('Historical scope');expect(node.textContent).toContain('Historical discussion');expect(node.textContent).toContain('assessment saved');
  await change(node.querySelector('[aria-label="Assessment Owner"]'),'contributor');
  await act(async()=>button('Save owner').click());
  expect(api.patch).toHaveBeenCalledWith('/framework_assessments/assessment-4.1',{owner_id:'contributor',process_owner_id:null,expected_last_assessed:'2026-10-01'});
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
  expect(node.querySelector('[aria-label="Organizational Controls"]')).toBeTruthy();expect(button('Create organizational Control')).toBeUndefined();
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

test('backend projected retained control has a visible identifier when its name is omitted',async()=>{
 record={...record,framework_key:'soc-2',definition_id:'CC1.1'};
 const original=api.get.getMockImplementation();
 api.get.mockImplementation(async(path,...args)=>{const result=await original(path,...args);if(path.startsWith('/frameworks/'))result.data.organizational_controls=[{control_id:'control-retained',assessment_ids:[record.framework_assessment_id]}];return result;});
 await render();expect(button('control-retained')).toBeDefined();
});

test('ISO process owner remains a contact draft with guarded save and clear; readonly cannot change it',async()=>{
 const original=api.get.getMockImplementation();
 api.get.mockImplementation(async(path,...args)=>path==='/contacts'?{data:[{contact_id:'contact-business',name:'Business owner'}]}:original(path,...args));
 const close=jest.fn();await render({onOpenChange:close});
 await change(node.querySelector('[aria-label="Process Owner"]'),'contact-business');
 await act(async()=>button('Close').click());expect(close).not.toHaveBeenCalled();expect(node.textContent).toContain('Leave unsaved changes?');
 await act(async()=>button('Save owner').click());
 expect(api.patch).toHaveBeenLastCalledWith('/framework_assessments/assessment-4.1',{owner_id:'manager',process_owner_id:'contact-business',expected_last_assessed:'2026-10-01'});
 await change(node.querySelector('[aria-label="Process Owner"]'),'');await act(async()=>button('Save owner').click());
 expect(api.patch).toHaveBeenLastCalledWith('/framework_assessments/assessment-4.1',{owner_id:'manager',process_owner_id:null,expected_last_assessed:'2026-10-01'});
 mockUser.role='client_viewer';await render();expect(node.querySelector('[aria-label="Process Owner"]').closest('fieldset').disabled).toBe(true);
});

test.each(['cis-ig1','soc-2'])('%s management does not add an ISO process owner control',async frameworkKey=>{
 record={...record,framework_key:frameworkKey,definition_id:frameworkKey==='cis-ig1'?'6.1':'CC1.1'};
 await render();expect(node.querySelector('[aria-label="Process Owner"]')).toBeNull();
  expect(node.querySelector('[aria-label="Organizational Controls"]')).toBeNull();expect(api.get.mock.calls.some(([path])=>path==='/organizational-controls')).toBe(false);
 await change(node.querySelector('[aria-label="Assessment Owner"]'),'contributor');await act(async()=>button('Save owner').click());
 expect(api.patch.mock.calls[0][1]).not.toHaveProperty('process_owner_id');
});

function soaManagementContext(selected=true){
  record={...record,framework_assessment_id:'synthetic-soa-A.5.1',definition_id:'A.5.1',framework_version:frameworkCatalog('iso-27001').version,soa_applicability:'included',soa_justification:'Exact native SoA decision.'};
  const get=api.get.getMockImplementation();api.get.mockImplementation(async(path,...args)=>{
    const response=await get(path,...args);
    return path==='/frameworks/iso-27001'?{data:{...response.data,selected,configured:true,framework:{key:'iso-27001',version:frameworkCatalog('iso-27001').version},assessments:[record]}}:response;
  });
}

test('eligible SoA management adds guidance beside existing owner, links and Reviews access with the exact native commands',async()=>{
  soaManagementContext();const navigate=jest.fn();await render({isoView:'soa',onReviews:navigate});
  expect([...node.querySelectorAll('[data-soa-guidance]')].map(element=>element.dataset.soaGuidance)).toEqual(['owner','review-trigger','risk-links']);
  expect(node.querySelector('[data-soa-guidance="owner"]').textContent).toContain('Who is responsible for the decision and its maintenance?');
  expect(node.querySelector('[data-soa-guidance="risk-links"]').textContent).toContain('Which assessed risks or other obligations support that decision?');
  expect(node.querySelector('[data-soa-guidance="review-trigger"]').textContent).toContain('What organizational changes or planned review arrangements will prompt reconsideration?');
  for(const element of node.querySelectorAll('[data-soa-guidance]')){expect(element.textContent).toContain('ISO/IEC 27001:2022 · 6.1.3(d)');expect(element.querySelectorAll('input,textarea,select,button')).toHaveLength(0);}
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();expect(node.querySelectorAll('[aria-label="Assessment Owner"]')).toHaveLength(1);expect(node.querySelectorAll('[aria-label="Process Owner"]')).toHaveLength(1);
  await change(node.querySelector('[aria-label="Assessment Owner"]'),'contributor');await act(async()=>button('Save owner').click());
  expect(api.patch).toHaveBeenCalledWith('/framework_assessments/synthetic-soa-A.5.1',{owner_id:'contributor',process_owner_id:null,expected_last_assessed:'2026-10-01'});
  await change(node.querySelector('[aria-label="Related record"]'),'risk');await act(async()=>button('Link record').click());expect(api.post).toHaveBeenCalledWith('/framework_assessments/synthetic-soa-A.5.1/links',{kind:'risks',id:'risk'});
  await act(async()=>node.querySelector('a[href^="/reviews?"]').click());expect(navigate).toHaveBeenCalledWith('/reviews?client_id=client&framework_key=iso-27001&framework_assessment=synthetic-soa-A.5.1');
  expect(record.soa_applicability).toBe('included');expect(record.soa_justification).toBe('Exact native SoA decision.');expect(record.implementation).toBe('Saved scope');
});

test('SoA management guidance follows validated view context without changing the other ISO manager',async()=>{
  soaManagementContext();await render({isoView:'annex_control'});expect(node.querySelectorAll('[data-soa-guidance]')).toHaveLength(0);
  await render({isoView:'soa'});expect(node.querySelectorAll('[data-soa-guidance]')).toHaveLength(3);
  await render();expect(node.querySelectorAll('[data-soa-guidance]')).toHaveLength(0);expect(button('Save owner')).toBeDefined();expect(button('Link record')).toBeDefined();expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('an unenrolled SoA record receives no rollout guidance and read-only management retains all native restrictions',async()=>{
  soaManagementContext(false);mockUser.role='client_viewer';await render({isoView:'soa'});
  expect(node.querySelectorAll('[data-soa-guidance]')).toHaveLength(0);expect(button('Save owner').disabled).toBe(true);expect(button('Link record').disabled).toBe(true);expect(node.querySelector('[aria-label="Assessment Owner"]').disabled).toBe(true);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});
