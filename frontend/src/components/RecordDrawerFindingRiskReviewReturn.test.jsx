import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewDrawer from './ReviewDrawer';
import api from '@/lib/api';
import {rememberClient} from '@/lib/clientSelection';

let mockAuth,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),formatError:e=>e.response?.data?.detail||e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn(),info:jest.fn()}}));

let root,container,review,finding;
const button=(scope,label)=>[...scope.querySelectorAll('button')].find(node=>node.textContent===label);
const query=id=>document.querySelector('[data-testid="'+id+'"]');
const click=node=>act(async()=>{expect(node).toBeDefined();node.focus();node.click();});
const focusSettled=()=>act(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();rememberClient('demo_brawndo');
  window.history.replaceState({},'','/reviews?client_id=demo_brawndo');
  const user=(await api.post('/demo/enter')).data.user;mockAuth={user,workspaceMode:'demo',loading:false};
  const clients=(await api.get('/clients')).data;mockOrg={currentClientId:'demo_brawndo',currentClient:clients.find(row=>row.client_id==='demo_brawndo'),clients,loading:false};
  review=(await api.post('/reviews',{client_id:'demo_brawndo',title:'Synthetic native Risk return QA',review_type:'access',recurrence:'quarterly',due_date:'2099-09-30'})).data;
  finding=(await api.post('/reviews/'+review.review_id+'/create-finding',{request_id:crypto.randomUUID(),title:'Synthetic gap',remediation_title:'Retained occurrence work',occurrence_id:review.current_occurrence_id})).data;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.restoreAllMocks();});

async function openFinding(parentSaved=jest.fn()){
  await act(async()=>root.render(<ReviewDrawer open record={review} clientId="demo_brawndo" onOpenChange={()=>{}} onSaved={parentSaved}/>));
  await click(button(query('reviews-drawer'),'1 finding raised'));await focusSettled();
  const popover=document.querySelector('[aria-label="Findings from this occurrence"]');
  await click(button(popover,'Retained occurrence work'));await focusSettled();
  expect(query('remediation-ticket-drawer')).not.toBeNull();
}

test('Review occurrence raises an unassessed Risk once through its real native Finding without changing work or occurrence',async()=>{
  const parentSaved=jest.fn();await openFinding(parentSaved);
  const originalTask=(await api.get('/tasks',{params:{client_id:'demo_brawndo'}})).data.find(row=>row.finding_id===finding.finding_id);
  const post=jest.spyOn(api,'post');
  await click(button(query('remediation-ticket-drawer'),'Raise as risk'));
  await click(button(document.querySelector('[role="alertdialog"]'),'Confirm raise as risk'));
  expect(post.mock.calls.filter(([path])=>path.endsWith('/raise-risk'))).toHaveLength(1);
  expect(parentSaved).toHaveBeenCalledTimes(1);
  const currentFinding=(await api.get('/findings/'+finding.finding_id)).data;
  const risk=(await api.get('/risks/'+currentFinding.risk_id)).data;
  expect(risk).toMatchObject({client_id:'demo_brawndo',status:'identified',source_type:'finding',source_id:finding.finding_id,finding_id:finding.finding_id,likelihood_score:null,impact_score:null,risk_score:null,risk_level:null});
  expect(currentFinding).toMatchObject({status:finding.status,review_id:review.review_id,occurrence_id:review.current_occurrence_id});
  expect((await api.get('/tasks/'+originalTask.task_id)).data).toEqual(originalTask);
  expect((await api.get('/reviews/'+review.review_id)).data).toMatchObject({review_id:review.review_id,status:review.status,current_occurrence_id:review.current_occurrence_id});
});

test('opening a verified existing Risk and returning through its Finding preserves the same Review identity and native focus',async()=>{
  await api.post('/findings/'+finding.finding_id+'/raise-risk');
  await openFinding();const reviewHeading=query('reviews-drawer').querySelector('[data-review-title]'),post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
  await click(button(query('remediation-ticket-drawer'),'Open linked Risk'));await focusSettled();
  expect(query('risks-drawer')).not.toBeNull();expect(query('risks-drawer').textContent).toContain('Needs assessment');
  await click(button(query('risks-drawer'),'Close'));await focusSettled();
  await click(button(query('remediation-ticket-drawer'),'Cancel'));await focusSettled();
  expect(query('remediation-ticket-drawer')).toBeNull();expect(query('reviews-drawer')).not.toBeNull();
  expect(document.activeElement).toBe(reviewHeading);
  expect((await api.get('/reviews/'+review.review_id)).data).toMatchObject({review_id:review.review_id,status:review.status,current_occurrence_id:review.current_occurrence_id});
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
});
