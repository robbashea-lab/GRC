import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewDrawer from './ReviewDrawer';
import api from '@/lib/api';

let mockUser,mockFullRecord;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>mockFullRecord}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),formatError:e=>e.response?.data?.detail||e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));

let root,container,record,onOpenChange;
const query=id=>document.querySelector(`[data-testid="${id}"]`);
const button=label=>[...document.querySelectorAll('button')].find(node=>node.textContent===label);
const click=node=>act(async()=>node.click());
const input=(node,value)=>act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
const render=props=>act(async()=>root.render(<ReviewDrawer open record={record} clientId={record.client_id} onOpenChange={onOpenChange} {...props}/>));
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  sessionStorage.clear();localStorage.clear();mockFullRecord=true;
  mockUser=(await api.post('/demo/enter')).data.user;
  record=(await api.post('/reviews',{client_id:'demo_brawndo',title:'Workflow regression review',review_type:'access',recurrence:'quarterly',due_date:'2099-09-30'})).data;
  onOpenChange=jest.fn();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.restoreAllMocks();jest.clearAllMocks();});

test('eligible existing review retains six native tabs, type and evaluation',async()=>{
  await render();
  expect(query('reviews-drawer').classList.contains('brawndo-review-workflow')).toBe(true);
  expect([...document.querySelectorAll('[data-testid^="tab-"]')].map(n=>n.textContent)).toEqual(['Overview','Requirements','Related','Evidence','Comments0','Activity']);
  expect(query('field-review_type')).not.toBeNull();
  expect(document.querySelector('[aria-label="Reviewer conclusion"]')).not.toBeNull();
  expect(button('In progress').disabled).toBe(false);
});

test.each(['non-Brawndo','new','mismatched'])('%s record cannot acquire workflow presentation',async mode=>{
  if(mode==='non-Brawndo')mockFullRecord=false;
  await render(mode==='new'?{record:null}:mode==='mismatched'?{clientId:'demo_dunder'}:{});
  expect(query('reviews-drawer').classList.contains('brawndo-review-workflow')).toBe(false);
  expect(document.querySelector('.review-workflow-occurrence')).toBeNull();
});

test('In progress saves the native draft with concurrency guards before the native start command',async()=>{
  await render();await input(query('field-notes'),'Native draft retained before start');
  const patch=jest.spyOn(api,'patch'),post=jest.spyOn(api,'post');
  await click(button('In progress'));
  expect(patch).toHaveBeenCalledWith('/reviews/'+record.review_id,expect.objectContaining({notes:'Native draft retained before start',expected_occurrence_id:record.current_occurrence_id,expected_updated_at:record.updated_at??null}),expect.anything());
  expect(post).toHaveBeenCalledWith('/reviews/'+record.review_id+'/start',{occurrence_id:record.current_occurrence_id});
  expect(patch.mock.invocationCallOrder[0]).toBeLessThan(post.mock.invocationCallOrder[0]);
  const saved=(await api.get('/reviews/'+record.review_id)).data;
  expect(saved).toMatchObject({status:'in_progress',notes:'Native draft retained before start'});
  expect(button('In progress').disabled).toBe(true);
});

test('closing a note draft guards it without writing, and explicit Save changes uses native persistence',async()=>{
  await render();const patch=jest.spyOn(api,'patch');
  await input(query('field-notes'),'An explicitly saved note');await click(button('Close'));
  expect(document.body.textContent).toContain('Leave unsaved changes?');expect(patch).not.toHaveBeenCalled();expect(onOpenChange).not.toHaveBeenCalled();
  await click(button('Keep editing'));await click(query('drawer-save'));
  expect((await api.get('/reviews/'+record.review_id)).data.notes).toBe('An explicitly saved note');
  expect(patch).toHaveBeenCalledTimes(1);
});

test('read-only users cannot start or edit the existing occurrence',async()=>{
  mockUser={...mockUser,role:'client_viewer'};await render();
  expect(button('In progress').disabled).toBe(true);
  expect(query('field-notes').disabled).toBe(true);expect(query('drawer-save')).toBeNull();expect(query('review-complete')).toBeNull();
});

test.each([false,true])('completion retains the opener pilot confirmation branch (%s) without an implicit start',async reviewsPilot=>{
  await render({reviewsPilot});const post=jest.spyOn(api,'post');
  await click(query('review-complete'));
  if(reviewsPilot){expect(query('review-complete-confirm')).not.toBeNull();expect(post).not.toHaveBeenCalled();await click(query('review-complete-confirmed'));}
  else expect(query('review-complete-confirm')).toBeNull();
  expect(post.mock.calls.some(([url])=>url.endsWith('/complete'))).toBe(true);
  expect(post.mock.calls.some(([url])=>url.endsWith('/start'))).toBe(false);
});

test('Finding creation remains a separate native portal without workflow styling',async()=>{
  await render();await click(query('quick-create-finding'));
  const portal=query('review-finding-form');expect(portal).not.toBeNull();
  expect(portal.closest('.brawndo-review-workflow')).toBeNull();
  expect(query('finding-title')).not.toBeNull();expect(query('finding-remediation-title')).not.toBeNull();
});

test('historical selection is frozen and displays the recorded actor rather than a fabricated reviewer',async()=>{
  const occurrence={...record,occurrence_id:'retained_occurrence',period:'Retained Q2',status:'completed',notes:'Frozen notes',completed_at:'2026-06-30T12:00:00Z',completed_by_name:'Actual retained actor',outcome:'no_findings',conclusion:'Retained evaluation'};
  await render({initialValues:{occurrence}});
  expect(query('reviews-drawer').classList.contains('brawndo-review-workflow')).toBe(true);
  expect(query('field-notes').value).toBe('Frozen notes');expect(query('field-notes').disabled).toBe(true);
  expect(document.body.textContent).toContain('Actual retained actor');expect(document.body.textContent).toContain('Retained evaluation');
  expect(button('In progress')).toBeUndefined();expect(query('drawer-save')).toBeNull();expect(query('review-complete')).toBeNull();
});

test('a historical occurrence from another review does not gain workflow presentation',async()=>{
  await render({initialValues:{occurrence:{...record,review_id:'another_review',occurrence_id:'another_occurrence',status:'completed'}}});
  expect(query('reviews-drawer').classList.contains('brawndo-review-workflow')).toBe(false);
  expect(document.querySelector('.review-workflow-occurrence')).toBeNull();
  expect(query('field-notes').disabled).toBe(true);
});
