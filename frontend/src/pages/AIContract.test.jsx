import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AIGovernance from './AIGovernance';
import AIDrawer from '@/components/AIDrawer';
import api from '@/lib/api';
import {AI_KEYS} from '@/lib/aiGovernance';
import {AI_PILOT_KEYS} from '@/lib/brawndoAI';

let mockUser,mockClient;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient})}));
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
beforeEach(async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();mockClient='demo_prestige';
 mockUser=(await api.post('/demo/enter')).data.user;
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.restoreAllMocks();});

test('Prestige shared presentation creates and edits through the real canonical AI contract',async()=>{
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
 expect(Object.keys(body).sort()).toEqual(['client_id',...AI_KEYS].sort());
 expect(container.querySelector('.brawndo-ai-grid')).not.toBeNull();
 await click(container.querySelector('[aria-label="Open Prestige contract test"]'));
 await input('Product / System Name','Prestige contract edited');await click(buttons('Save Changes')[0]);
 expect(document.querySelector('[data-testid="ai-drawer"]')).toBeNull();
 const updated=(await mine()).find(r=>r.ai_system_id===created.ai_system_id);
 expect(updated.name).toBe('Prestige contract edited');expect(updated.description).toBe(created.description);
 expect(Object.keys(patch.mock.calls.find(([path])=>path==='/ai_systems/'+created.ai_system_id)[1]).sort()).toEqual(['client_id','expected_updated_at',...AI_KEYS].sort());
 for(const key of AI_PILOT_KEYS)expect(updated).not.toHaveProperty(key);
});

test('Prestige does not advertise unsupported approval or pilot fields and direct writes remain rejected',async()=>{
 const row=(await api.post('/ai_systems',{client_id:mockClient,name:'Canonical Prestige AI'})).data;
 await act(async()=>root.render(<AIGovernance/>));
 expect(container.querySelector('[data-testid="ai-system-view-pending"]')).toBeNull();
 expect(container.textContent).not.toMatch(/Approval not recorded|Permitted Data|Data permissions not established/);
 await click(container.querySelector('[aria-label="Open Canonical Prestige AI"]'));
 expect(document.body.textContent).not.toMatch(/Approval Status|Proposed Uses & Approval Conditions/);
 expect(document.querySelector('[aria-label="Environment / Account Type"]')).toBeNull();
 await click(buttons('Data & Access')[0]);
 expect(document.querySelector('[aria-label="Data, integrations & account settings"]')).toBeNull();
 await click(buttons('Oversight & Review')[0]);
 expect(buttons('Schedule Review')).toHaveLength(1);expect(buttons('Record Decision')).toHaveLength(0);
 expect(document.querySelector('[aria-label="Decision"]')).toBeNull();
 await expect(api.patch('/ai_systems/'+row.ai_system_id,{environment:'Unsupported',expected_updated_at:row.updated_at})).rejects.toThrow('Unknown or read-only AI fields');
 await expect(api.post('/ai_systems/'+row.ai_system_id+'/approval',{status:'approved',note:'Unsupported',expected_updated_at:row.updated_at})).rejects.toThrow('Approval pilot is available only for Brawndo Demo');
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

test('standard authenticated presentation sends only the unchanged canonical fields',async()=>{
 mockUser={...mockUser,workspace_mode:undefined};const close=jest.fn(),post=jest.spyOn(api,'post');
 await act(async()=>root.render(<AIDrawer open clientId={mockClient} onOpenChange={close}/>));
 await input('Product / System Name','Standard contract test');
 const candidate=(await api.get(`/clients/${mockClient}/assignees`,{params:{limit:50,offset:0}})).data.items[0];
 expect(candidate).toBeTruthy();
 await click(document.querySelector('[aria-label="Technical Owner"]'));
 await click([...document.querySelectorAll('[aria-label="Technical Owner candidates"] button')].find(button=>button.textContent.includes(candidate.name||candidate.email)));
 await click(buttons('Create AI System')[0]);
 expect(close).toHaveBeenCalledWith(false);
 expect(Object.keys(post.mock.calls.find(([path])=>path==='/ai_systems')[1]).sort()).toEqual(['client_id',...AI_KEYS].sort());
 expect(post.mock.calls.find(([path])=>path==='/ai_systems')[1].technical_owner_id).toBe(candidate.user_id);
 expect(buttons('Record Decision')).toHaveLength(0);
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
