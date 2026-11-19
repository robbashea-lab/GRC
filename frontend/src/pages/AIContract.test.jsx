jest.mock('@/lib/brawndoAdditionalScope',()=>({useAdditionalSectionsSurface:()=>false,useAdditionalSectionsPresentation:()=>false}));
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AIGovernance from './AIGovernance';
import AIDrawer from '@/components/AIDrawer';
import api from '@/lib/api';
import {AI_KEYS,AI_RELATIONSHIP_NOTICE} from '@/lib/aiGovernance';
import {AI_PILOT_KEYS} from '@/lib/brawndoAI';
import {readStore,saveStore} from '@/preview/store';

let mockUser,mockClient,mockClients;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:mockUser?.workspace_mode==='demo'?'demo':'standard',loading:false})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient,currentClient:mockClients.find(client=>client.client_id===mockClient),clients:mockClients,loading:false})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),formatError:e=>e.response?.data?.detail||e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('@/lib/recordUuid',()=>({recordUuid:()=>require('crypto').randomUUID()}));

let root,container;
const buttons=label=>[...document.querySelectorAll('button')].filter(b=>b.textContent===label);
const click=node=>act(async()=>node.click());
const input=(label,value)=>act(async()=>{
 const node=document.querySelector(`[aria-label="${label}"]`),prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:node.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
 Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);
 node.dispatchEvent(new Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));
});
const mine=async()=>(await api.get('/ai_systems',{params:{client_id:mockClient}})).data;
function useScopedActor(clientId,role){
 const db=readStore(),actor={user_id:'synthetic_ai_contract_'+role+'_'+clientId,
  name:'Synthetic AI metadata actor',email:'ai-'+role+'-'+clientId+'@example.test',
  role,status:'active',workspace_mode:'demo',client_ids:[clientId],all_clients:false};
 expect(db.users.some(user=>user.user_id===actor.user_id)).toBe(false);
 db.users.push(actor);db.user=actor;saveStore(db);mockUser=actor;
}
beforeEach(async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();mockClient='demo_prestige';
 mockUser=(await api.post('/demo/enter')).data.user;
 mockClients=(await api.get('/clients')).data;
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.restoreAllMocks();});

test('SOC shared presentation retains approved metadata through native create/edit while keeping approval separate',async()=>{
 const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
 await act(async()=>root.render(<AIGovernance/>));
 await click(container.querySelector('[data-testid="new-ai-system"]'));
 expect(document.querySelector('[data-testid="ai-drawer"]').className).toContain('brawndo-cis-assessment');
 await input('Product / System Name','Prestige contract test');await input('Purpose / Use','Canonical governance use.');
 await click(buttons('Create AI System')[0]);
 expect(document.querySelector('[data-testid="ai-drawer"] [role="alert"]')?.textContent).toBeUndefined();
 expect(document.querySelector('[data-testid="ai-drawer"]')).toBeNull();
 const created=(await mine()).find(r=>r.name==='Prestige contract test');expect(created).toBeTruthy();
 const body=post.mock.calls.find(([path])=>path==='/ai_systems')[1];
 expect(Object.keys(body).sort()).toEqual(['client_id',...AI_KEYS,...AI_PILOT_KEYS].sort());
 expect(container.querySelector('.brawndo-ai-grid')).not.toBeNull();
 await click(container.querySelector('[aria-label="Open Prestige contract test"]'));
 await input('Product / System Name','Prestige contract edited');await click(buttons('Save Changes')[0]);
 expect(document.querySelector('[data-testid="ai-drawer"]')).toBeNull();
 const updated=(await mine()).find(r=>r.ai_system_id===created.ai_system_id);
 expect(updated.name).toBe('Prestige contract edited');expect(updated.description).toBe(created.description);
 expect(Object.keys(patch.mock.calls.find(([path])=>path==='/ai_systems/'+created.ai_system_id)[1]).sort()).toEqual(['client_id','expected_updated_at',...AI_KEYS,...AI_PILOT_KEYS].sort());
 for(const key of AI_PILOT_KEYS)expect(updated[key]).toEqual(created[key]);
 expect(updated.approval_history).toBeUndefined();
});

test.each(['demo_dunder','demo_prestige'])('%s retains administrator metadata editing while a scoped contributor gains no write or approval authority',async clientId=>{
 mockClient=clientId;
 const row=(await api.post('/ai_systems',{client_id:mockClient,name:'Canonical Prestige AI'})).data;
 await act(async()=>root.render(<AIGovernance/>));
 expect(container.querySelector('[data-testid="ai-system-view-pending"]')).not.toBeNull();
 expect(container.textContent).toContain('Data permissions not established');
 await click(container.querySelector('[aria-label="Open Canonical Prestige AI"]')||buttons('Canonical Prestige AI')[0]);
 expect(document.body.textContent).toMatch(/Approval Status|Proposed Uses & Approval Conditions/);
 expect(document.querySelector('[aria-label="Environment / Account Type"]')).not.toBeNull();
 await input('Environment / Account Type','Managed training account');
 await click(buttons('Data & Access')[0]);
 expect(document.querySelector('[aria-label="Data, integrations & account settings"]')).not.toBeNull();
 await input('Data, integrations & account settings','Training settings retained');
 await click(buttons('Oversight & Review')[0]);
 expect(buttons('Schedule Review')).toHaveLength(1);expect(buttons('Record Decision')).toHaveLength(1);
 expect(document.querySelector('[aria-label="Decision"]').closest('fieldset').disabled).toBe(true);
 await click(buttons('Save Changes')[0]);
 const saved=(await mine()).find(record=>record.ai_system_id===row.ai_system_id);
 expect(saved).toMatchObject({environment:'Managed training account',data_settings:'Training settings retained'});
 expect(saved.approval_history).toBeUndefined();
 await act(async()=>root.render(null));
 useScopedActor(clientId,'client_contributor');
 await act(async()=>root.render(<AIDrawer open clientId={mockClient} record={saved} onOpenChange={jest.fn()}/>));
 expect(document.querySelector('[aria-label="Environment / Account Type"]').closest('fieldset').disabled).toBe(true);
 expect(buttons('Save Changes')).toHaveLength(0);
 await click(buttons('Oversight & Review')[0]);
 expect(buttons('Record Decision')).toHaveLength(0);expect(document.querySelector('[aria-label="Decision"]')).toBeNull();
 await expect(api.patch('/ai_systems/'+row.ai_system_id,{environment:'Forbidden contributor edit',expected_updated_at:saved.updated_at})).rejects.toMatchObject({response:{status:403}});
 expect((await mine()).find(record=>record.ai_system_id===row.ai_system_id)).toEqual(saved);
 await expect(api.post('/ai_systems/'+row.ai_system_id+'/approval',{status:'approved',note:'Contributor cannot approve this saved scope',expected_updated_at:saved.updated_at})).rejects.toMatchObject({response:{status:403}});
 expect((await mine()).find(record=>record.ai_system_id===row.ai_system_id).approval_history).toBeUndefined();
});

test('Brawndo keeps its explicit pilot fields, pending view and administrator approval workflow',async()=>{
 mockClient='demo_brawndo';
 const row=(await api.post('/ai_systems',{client_id:mockClient,name:'Brawndo approval test',description:'Public content drafting',environment:'Managed test account',permitted_data_types:['Public']})).data;
 await act(async()=>root.render(<AIGovernance/>));
 expect(container.querySelector('[data-testid="ai-system-view-pending"]')).not.toBeNull();
 await click(container.querySelector('[aria-label="Open Brawndo approval test"]'));
 expect(document.querySelector('[aria-label="Environment / Account Type"]').value).toBe('Managed test account');
 await click(buttons('Oversight & Review')[0]);await input('Decision','approved');await input('Decision rationale','Administrator confirms this saved scope.');
 await click(buttons('Record Decision')[0]);
 const updated=(await mine()).find(r=>r.ai_system_id===row.ai_system_id);
 expect(updated.approval_status).toBe('approved');expect(updated.approval_history).toHaveLength(1);expect(updated.approval_history[0].scope.environment).toBe('Managed test account');
});

test('standard identity presentation sends the approved shared metadata contract without adding approval controls',async()=>{
 mockUser={...mockUser,workspace_mode:undefined};const close=jest.fn(),post=jest.spyOn(api,'post');
 await act(async()=>root.render(<AIDrawer open clientId={mockClient} onOpenChange={close}/>));
 await input('Product / System Name','Standard contract test');
 const candidate=(await api.get(`/clients/${mockClient}/assignees`,{params:{limit:50,offset:0}})).data.items[0];
 expect(candidate).toBeTruthy();
 await click(document.querySelector('[aria-label="Technical Owner"]'));
 await click([...document.querySelectorAll('[aria-label="Technical Owner candidates"] button')].find(button=>button.textContent.includes(candidate.name||candidate.email)));
 await click(buttons('Create AI System')[0]);
 expect(close).toHaveBeenCalledWith(false);
 expect(Object.keys(post.mock.calls.find(([path])=>path==='/ai_systems')[1]).sort()).toEqual(['client_id',...AI_KEYS,...AI_PILOT_KEYS].sort());
 expect(post.mock.calls.find(([path])=>path==='/ai_systems')[1].technical_owner_id).toBe(candidate.user_id);
 expect(buttons('Record Decision')).toHaveLength(0);
});

test('Technical Owner visibility does not grant a read-only actor AI creation permission',async()=>{
 const candidate=(await api.get(`/clients/${mockClient}/assignees`,{params:{limit:50,offset:0}})).data.items[0];
 expect(candidate).toBeTruthy();
 useScopedActor(mockClient,'client_readonly');
 const before=await mine(),post=jest.spyOn(api,'post');
 await act(async()=>root.render(<AIDrawer open clientId={mockClient} onOpenChange={jest.fn()}/>));
 const technicalOwner=document.querySelector('[aria-label="Technical Owner"]');
 expect(technicalOwner).not.toBeNull();expect(technicalOwner.closest('fieldset').disabled).toBe(true);
 expect(buttons('Create AI System')).toHaveLength(0);expect(buttons('Record Decision')).toHaveLength(0);
 expect(post).not.toHaveBeenCalled();
 await expect(api.post('/ai_systems',{client_id:mockClient,name:'Forbidden technical-owner creation',technical_owner_id:candidate.user_id})).rejects.toMatchObject({response:{status:403}});
 expect(await mine()).toEqual(before);
});

test.each(['demo','standard'].flatMap(mode=>[null,'general','hipaa','nist-csf-2','cmmc'].map(framework=>[mode,framework])))(
 '%s %s native detail editor retains guided metadata without adding approval authority',async(mode,framework)=>{
  mockClient='synthetic-detail-ai';
  const db=readStore();db.clients.push({client_id:mockClient,name:'QA AI detail — SYNTHETIC',status:'onboarding',
   onboarding_baseline:{completed:false,requirements:framework&&framework!=='general'?{[framework]:'applies'}:{}}});saveStore(db);
  mockClients=(await api.get('/clients')).data;
  if(mode==='standard')mockUser={...mockUser,workspace_mode:undefined};
  const close=jest.fn();
  const row=(await api.post('/ai_systems',{client_id:mockClient,name:'Saved synthetic AI',environment:'Original managed account',
   restrictions:'Original conditions',data_settings:'Original settings',permitted_data_types:['Public']})).data;
  await act(async()=>root.render(<AIDrawer open clientId={mockClient} record={row} onOpenChange={close}/>));
  expect(document.querySelector('[aria-label="Environment / Account Type"]').value).toBe('Original managed account');
  await input('Environment / Account Type','Edited managed account');
  await click(buttons('Data & Access')[0]);await input('Data, integrations & account settings','Edited native settings');
  await click(buttons('Save Changes')[0]);
  expect(close).toHaveBeenCalledWith(false);
  const saved=(await mine()).find(record=>record.ai_system_id===row.ai_system_id);
  expect(saved).toMatchObject({environment:'Edited managed account',restrictions:'Original conditions',data_settings:'Edited native settings',permitted_data_types:['Public']});
  expect(saved.approval_history).toBeUndefined();expect(buttons('Record Decision')).toHaveLength(0);
 });

test('Prestige stale edit keeps its draft and does not overwrite the concurrent record',async()=>{
 const row=(await api.post('/ai_systems',{client_id:mockClient,name:'Concurrent Prestige AI'})).data;
 await act(async()=>root.render(<AIGovernance/>));await click(container.querySelector('[aria-label="Open Concurrent Prestige AI"]'));
 await input('Product / System Name','Unsaved Prestige edit');
 await api.patch('/ai_systems/'+row.ai_system_id,{description:'Concurrent canonical edit',expected_updated_at:row.updated_at});
 await click(buttons('Save Changes')[0]);
 expect(document.querySelector('[data-testid="ai-drawer"]')).not.toBeNull();
 expect(document.querySelector('[aria-label="Product / System Name"]').value).toBe('Unsaved Prestige edit');
 expect(document.body.textContent).toContain('Record changed since it was opened');
 expect((await mine()).find(r=>r.ai_system_id===row.ai_system_id)).toMatchObject({name:'Concurrent Prestige AI',description:'Concurrent canonical edit'});
});

test('a historical relationship integrity notice is visible in register and drawer without a write',async()=>{
 const row=(await api.post('/ai_systems',{client_id:mockClient,name:'Preserved historical AI'})).data;
 const get=api.get.bind(api);
 jest.spyOn(api,'get').mockImplementation(async(path,...args)=>{
  const response=await get(path,...args);
  return path==='/ai_systems'?{...response,data:response.data.map(record=>record.ai_system_id===row.ai_system_id?
   {...record,relationship_integrity_warning:true,related_links:[]}:record)}:response;
 });
 const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
 await act(async()=>root.render(<AIGovernance/>));
 expect(container.querySelector('[role="status"].register-notice').textContent).toBe(AI_RELATIONSHIP_NOTICE);
 await click(container.querySelector('[aria-label="Open Preserved historical AI"]'));
 const drawer=document.querySelector('[data-testid="ai-drawer"]');
 expect(drawer.querySelector('[role="status"].register-notice').textContent).toBe(AI_RELATIONSHIP_NOTICE);
 await click(buttons('Related')[0]);
 expect(drawer.textContent).toContain(AI_RELATIONSHIP_NOTICE);
 expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
});
