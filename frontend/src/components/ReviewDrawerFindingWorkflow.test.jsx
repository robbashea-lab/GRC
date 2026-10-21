import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewDrawer from './ReviewDrawer';
import api from '@/lib/api';
import * as uuid from '@/lib/recordUuid';

let mockUser,mockFullRecord;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>mockFullRecord}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),formatError:e=>e.response?.data?.detail||e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
let root,container,record;
const query=id=>document.querySelector(`[data-testid="${id}"]`);
const button=label=>[...document.querySelectorAll('button')].find(node=>node.textContent===label);
const click=node=>act(async()=>node.click());
const input=(node,value)=>act(async()=>{
  const prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
const field=label=>{
  const node=[...query('review-finding-form').querySelectorAll('label')].find(item=>item.textContent.startsWith(label));
  return document.getElementById(node.htmlFor);
};
const render=props=>act(async()=>root.render(<ReviewDrawer open record={record} clientId={record.client_id} onOpenChange={()=>{}} {...props}/>));
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();mockFullRecord=true;
  mockUser=(await api.post('/demo/enter')).data.user;
  record=(await api.post('/reviews',{client_id:'demo_brawndo',title:'Finding workflow regression',review_type:'access',recurrence:'quarterly',due_date:'2099-09-30'})).data;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.restoreAllMocks();jest.clearAllMocks();});

async function openDraft(){await render();await click(query('quick-create-finding'));}
async function fillDraft(){
  await input(query('finding-title'),'Documented control gap');
  await input(field('Description'),'Observed finding description');
  await input(query('finding-remediation-title'),'Implement the corrective control');
  await input(field('Remediation notes'),'Action implementation instructions');
}

test('accepted native creation keeps Finding and Action contents, optional due and occurrence identities separate',async()=>{
  await openDraft();await fillDraft();await click(document.querySelector('[data-severity="high"]'));
  expect(query('review-finding-form').classList.contains('brawndo-review-finding')).toBe(true);
  expect(query('review-finding-form').closest('.brawndo-review-workflow')).toBeNull();
  expect(field('Due date').required).toBe(false);expect(field('Due date').value).toBe('');
  expect(query('review-finding-form').textContent).toContain('Unassigned');
  const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
  await act(async()=>query('finding-save').closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(post).toHaveBeenCalledWith('/reviews/'+record.review_id+'/create-finding',expect.objectContaining({
    title:'Documented control gap',description:'Observed finding description',remediation_title:'Implement the corrective control',remediation_plan:'Action implementation instructions',severity:'high',owner_id:null,due_date:'',occurrence_id:record.current_occurrence_id,request_id:expect.any(String)
  }),expect.anything());
  expect(post.mock.calls).toHaveLength(1);expect(patch).not.toHaveBeenCalled();
  const finding=(await api.get('/findings',{params:{client_id:record.client_id}})).data.find(item=>item.title==='Documented control gap');
  expect(finding).toMatchObject({description:'Observed finding description',severity:'high',review_id:record.review_id,occurrence_id:record.current_occurrence_id});
  const tasks=(await api.get('/tasks',{params:{client_id:record.client_id}})).data.filter(item=>item.finding_id===finding.finding_id);
  expect(tasks).toHaveLength(1);expect(tasks[0]).toMatchObject({title:'Implement the corrective control',review_id:record.review_id,occurrence_id:record.current_occurrence_id});
  expect(tasks[0].description).toBe('Action implementation instructions');
  expect(finding.owner_id||null).toBeNull();expect(tasks[0].assignee_id||null).toBeNull();
  expect(finding.due_date||null).toBeNull();expect(tasks[0].due_date||null).toBeNull();
  expect((await api.get('/reviews/'+record.review_id)).data).toMatchObject({status:record.status,current_occurrence_id:record.current_occurrence_id});
});

test('quick date and severity controls change only the pending draft and preserve its request identity',async()=>{
  await render();const ids=jest.spyOn(uuid,'recordUuid');await click(query('quick-create-finding'));
  const requestId=ids.mock.results[0].value,initialIdCount=ids.mock.calls.length;
  const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch'),get=jest.spyOn(api,'get');
  await click(button('30 days'));expect(field('Due date').value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await click(document.querySelector('[data-severity="critical"]'));
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();expect(get).not.toHaveBeenCalled();expect(ids).toHaveBeenCalledTimes(initialIdCount);
  await fillDraft();await act(async()=>query('finding-save').closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(post.mock.calls[0][1]).toMatchObject({request_id:requestId,severity:'critical'});
});

test('cancel protects a pending Finding, Keep editing retains it, and Discard writes nothing',async()=>{
  await openDraft();await fillDraft();const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
  await click(button('Cancel'));expect(document.body.textContent).toContain('Leave unsaved changes?');
  await click(button('Keep editing'));expect(query('finding-title').value).toBe('Documented control gap');
  await click(button('Cancel'));await click(button('Discard changes'));
  expect(query('review-finding-form')).toBeNull();expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
});

test('historical occurrence with the same Review ID but a foreign client has no new presentation',async()=>{
  await render({initialValues:{occurrence:{...record,client_id:'demo_dunder',occurrence_id:'foreign_occurrence',status:'completed'}}});
  expect(query('reviews-drawer').classList.contains('brawndo-review-workflow')).toBe(false);
  expect(query('quick-create-finding')).toBeNull();expect(query('review-finding-form')).toBeNull();
});

test('an eligible native owner selection and explicit due date are applied to both created records',async()=>{
  const candidates=(await api.get('/clients/'+record.client_id+'/assignees',{params:{search:'',offset:0,limit:50}})).data.items;
  expect(candidates.length).toBeGreaterThan(0);const owner=candidates[0];
  await openDraft();await fillDraft();
  await click(query('review-finding-form').querySelector('button[aria-label="Owner"]'));
  const selection=document.querySelector('[aria-label="Owner candidates"]');
  const candidate=[...selection.querySelectorAll('button')].find(node=>node.textContent.includes(owner.name||owner.email));
  expect(candidate).toBeDefined();await click(candidate);
  await input(field('Due date'),'2099-11-15');
  const post=jest.spyOn(api,'post');
  await act(async()=>query('finding-save').closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(post.mock.calls[0][1]).toMatchObject({owner_id:owner.user_id,due_date:'2099-11-15'});
  const finding=(await api.get('/findings',{params:{client_id:record.client_id}})).data.find(item=>item.title==='Documented control gap');
  const task=(await api.get('/tasks',{params:{client_id:record.client_id}})).data.find(item=>item.finding_id===finding.finding_id);
  expect(finding).toMatchObject({owner_id:owner.user_id,due_date:'2099-11-15'});
  expect(task).toMatchObject({assignee_id:owner.user_id,due_date:'2099-11-15'});
});
