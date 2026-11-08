import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AIGovernance from './AIGovernance';
import api from '@/lib/api';
import {AdditionalSectionsProvider} from '@/lib/brawndoAdditionalScope';
import {rememberClient} from '@/lib/clientSelection';
import {applyTool,blankDraft,snapshot,onboardingPayload} from '@/lib/aiOnboarding';
import {ids,saveStore} from '@/preview/store';
import {toast} from 'sonner';

let mockAuth,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,
  default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),
  formatError:error=>error.response?.data?.detail||error.message,API:'/api'}));
jest.mock('react-router-dom',()=>({
  Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn(),
  useLocation:()=>({pathname:globalThis.window.location.pathname,search:globalThis.window.location.search}),
  useSearchParams:()=>require('react').useState(new URLSearchParams(globalThis.window.location.search)),
}),{virtual:true});
jest.mock('@/lib/recordUuid',()=>({recordUuid:()=>require('crypto').randomUUID()}));
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn(),info:jest.fn()}}));

let root,container;
const clientsByFramework=Object.fromEntries(['cis-ig1','iso-27001','soc-2'].map(framework=>[framework,`synthetic_linked_risk_${framework}`]));
const render=()=>act(async()=>root.render(<AdditionalSectionsProvider><AIGovernance/></AdditionalSectionsProvider>));
async function click(node){expect(node).toBeTruthy();expect(node.disabled).not.toBe(true);await act(async()=>node.click());}
async function description(value){const node=document.querySelector('[data-testid="risks-drawer"] [data-testid="field-description"]');expect(node).toBeTruthy();await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});return node;}
const child=kind=>document.querySelector(`[data-testid="${kind}-drawer"]`);
const aiRow=async id=>(await api.get('/ai_systems',{params:{client_id:mockOrg.currentClientId}})).data.find(row=>row.ai_system_id===id);
async function fixture(clientId){
  rememberClient(clientId);window.history.replaceState({},'',`/ai-governance?client_id=${clientId}`);
  const clients=(await api.get('/clients')).data;
  mockOrg={currentClientId:clientId,currentClient:clients.find(row=>row.client_id===clientId),clients,loading:false,error:''};
  const draft=applyTool(blankDraft('2026-10-27'),0);draft.name='Synthetic linked-risk continuity';
  draft.confirmations=Object.fromEntries(['details','screening','risk'].map(step=>[step,snapshot(draft,step)]));
  return (await api.post('/ai_systems/onboard',onboardingPayload(clientId,draft),{headers:{'Idempotency-Key':'synthetic-ai-linked-risk-0001'}})).data;
}
async function openLinked(created){
  await render();
  await click(container.querySelector(`[data-expand="${created.ai_system_id}"]`));
  await click([...container.querySelectorAll('.expanded-row .inline-actions button')].find(node=>node.textContent==='View linked risk'));
  expect(child('risks')).toBeTruthy();
  expect(child('risks').classList.contains('brawndo-risk-workflow')).toBe(false);
}

beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  // These parent-lifecycle fixtures retain the real adapter and native commands,
  // without unrelated seeded portfolio histories or company-specific reconciliation.
  const db=Object.fromEntries(Object.keys(ids).map(kind=>[kind,[]]));
  db.clients=Object.entries(clientsByFramework).map(([framework,client_id])=>({client_id,name:`Synthetic ${framework} client`,status:'active',
    framework_settings:framework==='soc-2'?{'soc-2':{categories:['security']}}:{}}));
  db.requirements=Object.entries(clientsByFramework).map(([baseline_key,client_id])=>({requirement_id:`${client_id}_enrollment`,client_id,baseline_key,baseline_response:'applies'}));
  db.user={user_id:'synthetic_linked_risk_admin',name:'Synthetic reviewer',email:'reviewer@example.test',role:'platform_admin',status:'active',workspace_mode:'demo',client_ids:Object.values(clientsByFramework)};
  db.users=[{...db.user}];Object.assign(db,{logs:[],notifications:[],drafts:{},baselines:{}});
  saveStore(db,{resetFiles:true});
  mockAuth={workspaceMode:'demo',loading:false,error:'',user:(await api.post('/demo/enter')).data.user};
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.restoreAllMocks();jest.clearAllMocks();});

test.each(Object.values(clientsByFramework))('%s linked Risk saves its draft before opening the exact central Review and closes only explicitly',async clientId=>{
  const created=await fixture(clientId),before=(await api.get('/risks/'+created.risk_id)).data;
  const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
  await openLinked(created);
  const riskSurface=child('risks');
  await description('Saved before the linked Risk review opens.');
  await click(riskSurface.querySelector('[data-testid="risk-mark-reviewed"]'));
  expect(toast.error).not.toHaveBeenCalled();
  expect(child('risks')).toBe(riskSurface);
  expect(child('reviews')).toBeTruthy();
  const saved=(await api.get('/risks/'+created.risk_id)).data;
  expect(saved.description).toBe('Saved before the linked Risk review opens.');
  const review=(await api.get('/reviews/'+saved.linked_review_id)).data;
  expect(review).toMatchObject({risk_id:created.risk_id,client_id:clientId});
  expect(review.status).not.toBe('completed');
  for(const key of ['created_at','date_identified','likelihood_score','impact_score','last_reviewed'])expect(saved[key]).toEqual(before[key]);
  const savedAI=await aiRow(created.ai_system_id);
  expect(savedAI.approval_status).toBe('pending_assessment');
  expect(savedAI.approval_history).toEqual(created.ai_system.approval_history);
  const updateIndex=patch.mock.invocationCallOrder[patch.mock.calls.findIndex(([path])=>path==='/risks/'+created.risk_id)];
  const reviewIndex=post.mock.invocationCallOrder[post.mock.calls.findIndex(([path])=>path==='/risks/'+created.risk_id+'/review')];
  expect(updateIndex).toBeLessThan(reviewIndex);
  expect(post.mock.calls.some(([path])=>path.endsWith('/approval'))).toBe(false);
  await click([...child('reviews').querySelectorAll('.review-workflow-footer button')].find(node=>node.textContent==='Close'));
  expect(child('reviews')).toBeNull();expect(child('risks')).toBe(riskSurface);
  await description('Explicit Risk save still follows its native close contract.');
  await click(riskSurface.querySelector('[data-testid="drawer-save"]'));
  expect(child('risks')).toBeNull();
  expect((await api.get('/risks/'+created.risk_id)).data.description).toBe('Explicit Risk save still follows its native close contract.');
  expect((await aiRow(created.ai_system_id)).approval_status).toBe('pending_assessment');
});

test('a stale linked Risk save retains the native draft and never starts a Review command',async()=>{
  const created=await fixture(clientsByFramework['iso-27001']);await openLinked(created);
  const riskSurface=child('risks'),draft=await description('Unsaved local linked Risk description');
  const before=(await api.get('/risks/'+created.risk_id)).data;
  await api.patch('/risks/'+created.risk_id,{description:'Concurrent native edit',expected_updated_at:before.updated_at});
  const post=jest.spyOn(api,'post');
  await click(riskSurface.querySelector('[data-testid="risk-mark-reviewed"]'));
  expect(child('risks')).toBe(riskSurface);expect(child('reviews')).toBeNull();
  expect(draft.value).toBe('Unsaved local linked Risk description');expect(toast.error).toHaveBeenCalled();
  expect(post.mock.calls.some(([path])=>path==='/risks/'+created.risk_id+'/review')).toBe(false);
  expect((await api.get('/risks/'+created.risk_id)).data.description).toBe('Concurrent native edit');
  expect((await aiRow(created.ai_system_id)).approval_status).toBe('pending_assessment');
});

test('a reader can open linked Risk context without gaining Risk review or save commands',async()=>{
  const created=await fixture(clientsByFramework['soc-2']);mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_readonly'}};
  const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
  await openLinked(created);
  expect(child('risks').querySelector('[data-testid="risk-mark-reviewed"]')).toBeNull();
  expect(child('risks').querySelector('[data-testid="drawer-save"]').disabled).toBe(true);
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
});

test.each(['client_id','risk_id'])('a linked Risk response with a mismatched %s never opens a native drawer',async field=>{
  const created=await fixture(clientsByFramework['iso-27001']),get=api.get.bind(api);
  // The real response is deliberately corrupted at the transport boundary; native
  // relationship writers already reject a saved cross-client link.
  jest.spyOn(api,'get').mockImplementation(async(path,config)=>{
    const response=await get(path,config);
    return path==='/risks/'+created.risk_id?{...response,data:{...response.data,[field]:field==='client_id'?clientsByFramework['soc-2']:'other-risk'}}:response;
  });
  const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
  await render();await click(container.querySelector(`[data-expand="${created.ai_system_id}"]`));
  await click([...container.querySelectorAll('.expanded-row .inline-actions button')].find(node=>node.textContent==='View linked risk'));
  expect(child('risks')).toBeNull();expect(child('reviews')).toBeNull();
  expect(container.textContent).toContain('Related record identity could not be verified.');
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
});
