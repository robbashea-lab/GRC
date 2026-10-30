import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RiskRegister from './RiskRegister';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';
import {rememberClient} from '@/lib/clientSelection';

let mockAuth,mockOrg,mockPath;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()},formatError:error=>error.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:mockPath,search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams())}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>()=>null);
jest.mock('@/components/AssigneeSelect',()=>({__esModule:true,default:({value,onChange,disabled})=><select aria-label="Owner" value={value||''} disabled={disabled} onChange={e=>onChange(e.target.value)}><option value="">Unassigned</option><option value="eligible-user">Eligible user</option></select>}));
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));
let root,container;
const click=node=>act(async()=>node.click());
const change=(node,value)=>act(async()=>{
  const prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
const open=async()=>{
  await act(async()=>root.render(<RiskRegister/>));
  await click(container.querySelector('[data-testid="new-risk"]'));
  return document.querySelector('[data-testid="new-risk-dialog"]');
};
const complete=async dialog=>{
  await change(dialog.querySelector('[aria-label="Risk title"]'),'Restore dependencies');
  await change(dialog.querySelector('[aria-label="Risk description"]'),'Dependency failures could prevent recovery.');
  const scales=dialog.querySelectorAll('.rw-scale');
  await click(scales[0].querySelectorAll('button')[2]);
  await click(dialog.querySelectorAll('.rw-scale')[1].querySelectorAll('button')[3]);
};
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockPath='/risks';window.history.replaceState({},'', '/risks');
  sessionStorage.clear();localStorage.clear();rememberClient('demo_brawndo');
  mockAuth={workspaceMode:'demo',loading:false,user:{user_id:'risk-workflow-admin',role:'super_admin',workspace_mode:'demo'}};
  mockOrg={currentClientId:'demo_brawndo',currentClient:{...cisClient(),name:'Brawndo'},clients:[cisClient()],loading:false};
  api.get.mockImplementation(async()=>({data:[]}));
  api.post.mockResolvedValue({data:{risk_id:'server-risk',display_id:'RISK-105'}});
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('required ratings remain explicit and incomplete creation focuses the first missing field',async()=>{
  const dialog=await open();
  expect(dialog.className).toContain('brawndo-risk-workflow');
  expect(dialog.textContent).toContain('Needs assessment');
  expect(dialog.textContent).not.toContain('RISK-004');
  await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  expect(api.post).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(dialog.querySelector('[aria-label="Risk title"]'));
  expect(dialog.querySelector('[aria-label="Risk title"]').getAttribute('aria-invalid')).toBe('true');
  await change(dialog.querySelector('[aria-label="Risk title"]'),'Restore dependencies');
  await change(dialog.querySelector('[aria-label="Risk description"]'),'Dependency failure could prevent recovery.');
  await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  expect(api.post).not.toHaveBeenCalled();
  expect(document.activeElement.dataset.riskField).toBe('likelihood_score');
});

test('scale changes are drafts; create keeps optional owner and native fields through request failure and retry',async()=>{
  const dialog=await open();await complete(dialog);
  expect(api.post).not.toHaveBeenCalled();
  expect(dialog.querySelector('[data-testid="new-risk-level"]').textContent).toBe('High · 12');
  api.post.mockRejectedValueOnce(new Error('Request failed'));
  await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  expect(document.querySelector('[aria-label="Risk title"]').value).toBe('Restore dependencies');
  expect(api.post).toHaveBeenLastCalledWith('/risks',expect.objectContaining({client_id:'demo_brawndo',likelihood_score:3,impact_score:4,review_cadence:'annual',treatment:''}),expect.objectContaining({headers:{'Idempotency-Key':expect.any(String)}}));
  expect(api.post.mock.calls[0][1]).not.toHaveProperty('owner_id');
  expect(api.post.mock.calls[0][1]).not.toHaveProperty('display_id');
  await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  expect(api.post).toHaveBeenCalledTimes(2);
  expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
  expect(document.querySelector('[data-testid="new-risk-dialog"]')).toBeNull();
});

test('create lock prevents duplicate submission and cancel keeps an unfinished draft',async()=>{
  const dialog=await open();await complete(dialog);
  await click([...dialog.querySelectorAll('button')].find(button=>button.textContent==='Cancel'));
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  await click([...document.querySelectorAll('[role="alertdialog"] button')].find(button=>button.textContent==='Keep editing'));
  let resolve;api.post.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  await act(async()=>{const save=dialog.querySelector('[data-testid="new-risk-save"]');save.click();save.click();});
  expect(api.post).toHaveBeenCalledTimes(1);
  await act(async()=>resolve({data:{risk_id:'server-risk'}}));
});

test.each(['unsupported-mode','other-client','mismatch','wrong-route'])('creation presentation stays off for %s',async condition=>{
  if(condition==='wrong-route'){mockPath='/dashboard';window.history.replaceState({},'','/dashboard');}
  if(condition==='unsupported-mode'){mockAuth.workspaceMode='authenticated';mockAuth.user.workspace_mode='authenticated';}
  if(condition==='other-client'){mockOrg.currentClientId='demo_dunder';mockOrg.currentClient={client_id:'demo_dunder',name:'Brawndo',status:'active'};rememberClient('demo_dunder');}
  if(condition==='mismatch')rememberClient('different-client');
  const dialog=await open();
  expect(dialog.className).not.toContain('brawndo-risk-workflow');
  expect(dialog.querySelector('.rw-scale')).toBeNull();
});

test('organization loading withholds creation until the matching client context resolves',async()=>{
  mockOrg={...mockOrg,loading:true};
  await act(async()=>root.render(<RiskRegister/>));
  const frame=container.querySelector('[data-testid="risks-navigation-loading"]');
  expect(frame?.querySelector('[role="status"]')?.textContent).toContain('Loading risks');
  expect(container.querySelector('h1')?.textContent).toBe('Brawndo Risks');
  expect(container.querySelector('[data-testid="new-risk"]')).toBeNull();
  expect(container.querySelector('table,[role="table"]')).toBeNull();
  expect(document.querySelector('[data-testid="new-risk-dialog"]')).toBeNull();
  expect(api.post).not.toHaveBeenCalled();

  mockOrg={...mockOrg,loading:false};
  const dialog=await open();
  expect(container.querySelector('[data-testid="risks-navigation-loading"]')).toBeNull();
  expect(dialog.className).toContain('brawndo-risk-workflow');
  expect(api.post).not.toHaveBeenCalled();
  await complete(dialog);
  await click(dialog.querySelector('[data-testid="new-risk-save"]'));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/risks',expect.objectContaining({client_id:'demo_brawndo',title:'Restore dependencies',likelihood_score:3,impact_score:4}),expect.objectContaining({headers:{'Idempotency-Key':expect.any(String)}}));
  expect(document.querySelector('[data-testid="new-risk-dialog"]')).toBeNull();
});
