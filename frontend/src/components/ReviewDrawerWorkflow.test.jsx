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

test('eligible existing review follows approved tabs and removes the rejected legacy evaluation and type field',async()=>{
  await render();
  expect(query('reviews-drawer').classList.contains('brawndo-review-workflow')).toBe(true);
  expect([...document.querySelectorAll('[data-testid^="tab-"]')].map(n=>n.textContent)).toEqual(['Overview','Requirement','Evidence0','Comments0','Activity']);
  expect(query('field-review_type')).toBeNull();
  expect(document.querySelector('[aria-label="Reviewer conclusion"]')).toBeNull();
  expect(document.body.textContent).not.toContain('Review evaluation');
  expect(document.body.textContent).toContain('Notes for this occurrence');
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

test('approved footer keeps Save visible across tabs and saves only the native Review draft',async()=>{
  await render();expect(query('drawer-save').disabled).toBe(true);
  await input(query('field-notes'),'Native note from Overview');
  await click(query('tab-comments'));
  expect(document.querySelector('label[for="review-comment"]').textContent).toBe('Add a comment');
  expect(query('comment-input').placeholder).toBe('Ask a question or leave context for the reviewer.');
  expect(query('drawer-save').disabled).toBe(false);
  const patch=jest.spyOn(api,'patch');await click(query('drawer-save'));
  expect(patch).toHaveBeenCalledWith('/reviews/'+record.review_id,expect.objectContaining({notes:'Native note from Overview'}),expect.anything());
  expect(query('drawer-save').disabled).toBe(true);
  await click(query('tab-activity'));expect(query('drawer-save').disabled).toBe(true);
});

test('historical selection is frozen and displays the recorded actor rather than a fabricated reviewer',async()=>{
  const occurrence={...record,occurrence_id:'retained_occurrence',period:'Retained Q2',status:'completed',notes:'Frozen notes',completed_at:'2026-06-30T12:00:00Z',completed_by_name:'Actual retained actor',outcome:'no_findings',conclusion:'Retained evaluation'};
  await render({initialValues:{occurrence}});
  expect(query('reviews-drawer').classList.contains('brawndo-review-workflow')).toBe(true);
  expect(query('field-notes').value).toBe('Frozen notes');expect(query('field-notes').disabled).toBe(true);
  expect(document.body.textContent).toContain('Actual retained actor');expect(document.body.textContent).not.toContain('Retained evaluation');
  expect(button('In progress')).toBeUndefined();expect(query('drawer-save')).toBeNull();expect(query('review-complete')).toBeNull();
  await click(query('tab-activity'));expect(document.body.textContent).toContain('Retained evaluation');
});

test.each([true,false])('historical checklist-only data remains readable in Activity (%s)',async checklist_confirmed=>{
  const occurrence={...record,occurrence_id:'retained_checklist',period:'Retained Q2',status:'completed',checklist_confirmed};
  await render({initialValues:{occurrence}});
  expect(document.body.textContent).not.toContain('Review evaluation');
  await click(query('tab-activity'));
  expect(document.body.textContent).toContain(`Reviewer checklist confirmed: ${checklist_confirmed?'Yes':'No'}`);
  expect(document.querySelector('[aria-label="Reviewer conclusion"]')).toBeNull();
});

test('a historical occurrence from another review does not gain workflow presentation',async()=>{
  await render({initialValues:{occurrence:{...record,review_id:'another_review',occurrence_id:'another_occurrence',status:'completed'}}});
  expect(query('reviews-drawer').classList.contains('brawndo-review-workflow')).toBe(false);
  expect(document.querySelector('.review-workflow-occurrence')).toBeNull();
  expect(query('field-notes').disabled).toBe(true);
});

test.each([['identity',{user_id:'different-demo-user'}],['role',{role:'client_viewer'}]])('Evidence count and cached files are discarded on authenticated %s change, including late old replies',async(_name,userChange)=>{
  const originalGet=api.get.bind(api),pendingOld=[],pendingNew=[];
  let phase='initial';
  const catalog=(total,filename)=>({items:[{evidence_id:'evidence-'+total,filename,category:'direct',linked_type:'review',linked_id:record.review_id,context:{},references:[]}],
    total,counts:{direct:total,actions:0,findings:0,review:0,treatment:0},page:1,page_size:25});
  jest.spyOn(api,'get').mockImplementation((url,options)=>{
    if(url!=='/evidence/catalog')return originalGet(url,options);
    if(phase==='initial')return Promise.resolve({data:catalog(7,'Previously permitted evidence.pdf')});
    return new Promise(resolve=>(phase==='old-refresh'?pendingOld:pendingNew).push(resolve));
  });
  await render();
  expect(query('tab-evidence').textContent).toBe('Evidence7');
  expect(document.body.textContent).toContain('Previously permitted evidence.pdf');

  // Native Activity refresh starts an old-context catalog request that remains in flight.
  phase='old-refresh';await click(query('tab-activity'));
  expect(pendingOld.length).toBeGreaterThan(0);
  phase='new-identity';mockUser={...mockUser,...userChange};
  await render();
  expect(query('tab-evidence').textContent).toBe('Evidence');
  expect(document.body.textContent).not.toContain('Previously permitted evidence.pdf');
  expect(pendingNew.length).toBeGreaterThan(0);

  await act(async()=>{for(const resolve of pendingNew.splice(0))resolve({data:catalog(2,'Current permitted evidence.pdf')});});
  expect(query('tab-evidence').textContent).toBe('Evidence2');
  expect(document.body.textContent).toContain('Current permitted evidence.pdf');
  await act(async()=>{for(const resolve of pendingOld.splice(0))resolve({data:catalog(9,'Late previous-context evidence.pdf')});});
  expect(query('tab-evidence').textContent).toBe('Evidence2');
  expect(document.body.textContent).not.toContain('Late previous-context evidence.pdf');
});

test.each(['field-notes','field-title'])('ordinary same-identity presentation withdrawal restores the unsaved %s field focus and caret',async fieldId=>{
  await render();
  const patch=jest.spyOn(api,'patch'),post=jest.spyOn(api,'post'),value='Unsaved native field with a retained caret';
  const initial=query(fieldId),prototype=initial.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  await act(async()=>{
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(initial,value);
    initial.dispatchEvent(new Event('input',{bubbles:true}));initial.focus();initial.setSelectionRange(8,20,'backward');
  });
  mockFullRecord=false;await render();
  const native=query(fieldId);
  expect(query('reviews-drawer').classList.contains('brawndo-review-workflow')).toBe(false);
  expect(native).not.toBe(initial);expect(native.value).toBe(value);expect(document.activeElement).toBe(native);
  expect([native.selectionStart,native.selectionEnd,native.selectionDirection]).toEqual([8,20,'backward']);
  mockFullRecord=true;await render();
  const restored=query(fieldId);
  expect(query('reviews-drawer').classList.contains('brawndo-review-workflow')).toBe(true);
  expect(restored).not.toBe(native);expect(restored.value).toBe(value);expect(document.activeElement).toBe(restored);
  expect([restored.selectionStart,restored.selectionEnd,restored.selectionDirection]).toEqual([8,20,'backward']);
  expect(patch).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();
});

test.each(['user','role','workspace','client','review','occurrence','frozen','configuration field disabled'])('presentation focus is not transferred across a changed %s context',async change=>{
  await render();
  const patch=jest.spyOn(api,'patch'),post=jest.spyOn(api,'post');
  const fieldId=change==='configuration field disabled'?'field-title':'field-notes';
  const initial=query(fieldId);initial.focus();initial.setSelectionRange(1,4);
  let props={};
  if(change==='user')mockUser={...mockUser,user_id:'different-user'};
  if(change==='role')mockUser={...mockUser,role:'client_viewer'};
  if(change==='workspace')mockUser={...mockUser,workspace_mode:'standard'};
  if(change==='client')props={clientId:'demo_dunder'};
  if(change==='review')props={record:{...record,review_id:'different-review'}};
  if(change==='occurrence')props={record:{...record,current_occurrence_id:'different-occurrence'}};
  if(change==='frozen')props={record:{...record,status:'completed'}};
  if(change==='configuration field disabled')mockUser={...mockUser,role:'client_grc_manager'};
  mockFullRecord=false;await render(props);
  expect(document.activeElement).not.toBe(query(fieldId));
  mockFullRecord=true;await render(props);
  expect(document.activeElement).not.toBe(query(fieldId));
  expect(patch).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();
});

test('presentation changes do not steal focus after the user moved to a surviving native control',async()=>{
  await render();const notes=query('field-notes');notes.focus();notes.setSelectionRange(1,4);
  const close=button('Close');close.focus();expect(document.activeElement).toBe(close);
  mockFullRecord=false;await render();expect(document.activeElement).toBe(close);
  mockFullRecord=true;await render();expect(document.activeElement).toBe(close);
});

test('same-auth Review appearance withdrawal preserves the open native Evidence reuse query',async()=>{
  await render();const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
  await click(query('tab-evidence'));await click(button('Link existing Evidence'));
  const search=document.querySelector('[aria-label="Find existing Evidence"]');
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Retained Review library query');
    search.dispatchEvent(new Event('input',{bubbles:true}));
  });
  mockFullRecord=false;await render();
  expect(query('reviews-drawer').classList.contains('brawndo-review-workflow')).toBe(false);
  expect(query('tab-evidence').getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('[aria-label="Find existing Evidence"]')).toBe(search);expect(search.value).toBe('Retained Review library query');
  mockFullRecord=true;await render();
  expect(query('reviews-drawer').classList.contains('brawndo-review-workflow')).toBe(true);
  expect(query('tab-evidence').getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('[aria-label="Find existing Evidence"]')).toBe(search);expect(search.value).toBe('Retained Review library query');
  expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();
});
