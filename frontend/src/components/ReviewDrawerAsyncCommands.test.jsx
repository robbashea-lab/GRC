import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewDrawer from './ReviewDrawer';
import api from '@/lib/api';
import {ids,readStore,saveStore} from '@/preview/store';
import {rememberClient} from '@/lib/clientSelection';
import {cisClient} from '@/testUtils/cisExperience';
import {toast} from 'sonner';

let mockAuth,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,API:'/api',
  default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),
  formatError:error=>error.response?.data?.detail||error.message}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('@/lib/recordUuid',()=>({recordUuid:()=>require('crypto').randomUUID()}));
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));

const clientIds=['synthetic-review-command-a','synthetic-review-command-b'];
const query=id=>document.querySelector(`[data-testid="${id}"]`);
const deferred=()=>{
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
};
const reviewFixture=(id,clientId)=>({review_id:id,client_id:clientId,title:`QA Review ${id}`,
  review_type:'access',status:'in_progress',recurrence:'quarterly',due_date:'2099-09-30',
  current_occurrence_id:`occ-${id}`,notes:`Saved notes for ${id}`,occurrences:[],
  created_at:'2026-10-29T10:00:00Z',updated_at:'2026-10-29T10:00:00Z'});

let root,host,clients,reviewA,reviewB,otherClientReview,onSaved,onOpenChange;
const nativeScroll=Element.prototype.scrollIntoView;
beforeAll(()=>{if(!nativeScroll)Element.prototype.scrollIntoView=jest.fn();});
afterAll(()=>{if(!nativeScroll)delete Element.prototype.scrollIntoView;});
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  sessionStorage.clear();localStorage.clear();
  clients=clientIds.map((id,index)=>({...cisClient(id),name:`QA command client ${index+1}`}));
  reviewA=reviewFixture('command-a',clientIds[0]);
  reviewB=reviewFixture('command-b',clientIds[0]);
  otherClientReview=reviewFixture('command-foreign',clientIds[1]);
  // Disposable, record-backed Preview fixture. No canonical clients or shared seed history.
  const db=Object.fromEntries(Object.keys(ids).map(kind=>[kind,[]]));
  db.clients=clients;db.reviews=[reviewA,reviewB,otherClientReview];
  db.requirements=clients.map(client=>({requirement_id:`${client.client_id}:cis-enrollment`,
    client_id:client.client_id,baseline_key:'cis-ig1',baseline_response:'applies'}));
  db.user={user_id:'synthetic-command-owner',name:'QA reviewer',email:'reviewer@example.test',
    role:'platform_admin',status:'active',workspace_mode:'demo',client_ids:clientIds};
  db.users=[{...db.user}];Object.assign(db,{logs:[],notifications:[],drafts:{},baselines:{}});
  saveStore(db,{resetFiles:true});
  mockAuth={user:(await api.post('/demo/enter')).data.user,workspaceMode:'demo',loading:false,error:''};
  onSaved=jest.fn();onOpenChange=jest.fn();
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());host.remove();
  jest.restoreAllMocks();jest.clearAllMocks();sessionStorage.clear();localStorage.clear();
});

async function renderReview(review=reviewA,props={},orgOverrides={}){
  const client=clients.find(row=>row.client_id===review.client_id);
  rememberClient(review.client_id);window.history.replaceState({},'',`/reviews?client_id=${review.client_id}`);
  mockOrg={currentClientId:review.client_id,currentClient:client,clients,loading:false,error:'',...orgOverrides};
  await act(async()=>root.render(<ReviewDrawer open record={review} clientId={review.client_id}
    onOpenChange={onOpenChange} onSaved={onSaved} {...props}/>));
}
async function inputNotes(value){
  const field=query('field-notes');expect(field).not.toBeNull();expect(field.disabled).toBe(false);
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,value);
    field.dispatchEvent(new Event('input',{bubbles:true}));
  });
}
async function click(node){expect(node).not.toBeNull();expect(node.disabled).not.toBe(true);await act(async()=>node.click());}
const currentReview=async review=>(await api.get(`/reviews/${review.review_id}`)).data;

function holdResponse(method,path,{beforeCommit=false}={}){
  const transport=api[method].bind(api),release=deferred(),ready=deferred();
  const spy=jest.spyOn(api,method).mockImplementation((url,...args)=>{
    if(url!==path)return transport(url,...args);
    if(beforeCommit){ready.resolve();return release.promise.then(()=>transport(url,...args));}
    return transport(url,...args).then(response=>{
      ready.resolve(response);
      return release.promise.then(()=>response);
    });
  });
  return {...release,ready:ready.promise,spy};
}
async function dispatchAndWait(node,held){
  expect(node).not.toBeNull();expect(node.disabled).not.toBe(true);
  await act(async()=>{node.click();await held.ready;});
}
function expectVisibleReview(review,notes){
  expect(document.querySelector('[data-review-title]').textContent).toBe(review.title);
  expect(query('field-title').value).toBe(review.title);
  expect(query('field-due_date').value).toBe(review.due_date.slice(0,10));
  expect(query('field-notes').value).toBe(notes);
}

test.each(['same client','different client'])('delayed completion cannot replace the newer %s Review or its draft',async selection=>{
  await renderReview();
  const held=holdResponse('post',`/reviews/${reviewA.review_id}/complete`);
  await dispatchAndWait(query('review-complete'),held);
  const next=selection==='same client'?reviewB:otherClientReview;
  await renderReview(next);await inputNotes('Newer Review draft must survive');
  onSaved.mockClear();toast.success.mockClear();
  await act(async()=>held.resolve());
  expectVisibleReview(next,'Newer Review draft must survive');
  expect(onSaved).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();
  const savedA=await currentReview(reviewA),savedB=await currentReview(next);
  expect(savedA.occurrences).toHaveLength(1);
  expect(savedA.occurrences[0].occurrence_id).toBe(reviewA.current_occurrence_id);
  expect(savedB.current_occurrence_id).toBe(next.current_occurrence_id);expect(savedB.occurrences).toHaveLength(0);
  expect(held.spy.mock.calls.filter(([url])=>url.endsWith('/complete'))).toHaveLength(1);
});

test('closing and reopening the same recurring Review protects its new-cycle draft from an old completion response',async()=>{
  await renderReview();
  const held=holdResponse('post',`/reviews/${reviewA.review_id}/complete`);
  await dispatchAndWait(query('review-complete'),held);
  const advanced=await currentReview(reviewA);
  expect(advanced.current_occurrence_id).not.toBe(reviewA.current_occurrence_id);
  await renderReview(reviewA,{open:false});await renderReview(advanced);
  await inputNotes('Unsaved next-cycle draft');onSaved.mockClear();toast.success.mockClear();
  await act(async()=>held.resolve());
  expectVisibleReview(advanced,'Unsaved next-cycle draft');
  expect(onSaved).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();
  expect((await currentReview(reviewA)).occurrences).toHaveLength(1);
});

test('a delayed old completion cannot exit a newly selected historical occurrence',async()=>{
  await renderReview();const held=holdResponse('post',`/reviews/${reviewA.review_id}/complete`);
  await dispatchAndWait(query('review-complete'),held);
  const historical={...reviewB,occurrence_id:'retained-b-history',status:'completed',notes:'Immutable B occurrence',
    completed_at:'2026-07-01T12:00:00Z',completed_by_name:'Recorded fictional reviewer',outcome:'no_findings'};
  await renderReview(reviewB,{initialValues:{occurrence:historical}});onSaved.mockClear();
  await act(async()=>held.resolve());
  expect(query('field-notes').value).toBe('Immutable B occurrence');expect(query('field-notes').disabled).toBe(true);
  expect(query('review-complete')).toBeNull();expect(query('drawer-save')).toBeNull();
  expect(document.querySelector('[data-review-title]').textContent).toBe(reviewB.title);
  expect(onSaved).not.toHaveBeenCalled();
});

test('unmounting during completion permits its original commit without stale success callbacks',async()=>{
  await renderReview();const held=holdResponse('post',`/reviews/${reviewA.review_id}/complete`);
  await dispatchAndWait(query('review-complete'),held);
  await act(async()=>root.render(null));onSaved.mockClear();toast.success.mockClear();
  await act(async()=>held.resolve());
  expect(query('reviews-drawer')).toBeNull();expect(onSaved).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();
  expect((await currentReview(reviewA)).occurrences).toHaveLength(1);
});

test('a withdrawn pre-completion save cannot dispatch another command or overwrite the replacement Review',async()=>{
  await renderReview();await inputNotes('A saved note, not a B command');
  const held=holdResponse('patch',`/reviews/${reviewA.review_id}`),post=jest.spyOn(api,'post');
  await dispatchAndWait(query('review-complete'),held);
  await renderReview(reviewB);await inputNotes('B draft');onSaved.mockClear();
  await act(async()=>held.resolve());
  expectVisibleReview(reviewB,'B draft');expect(onSaved).not.toHaveBeenCalled();
  expect(post.mock.calls.filter(([url])=>url.endsWith('/complete'))).toHaveLength(0);
  const savedA=await currentReview(reviewA);
  expect(savedA.notes).toBe('A saved note, not a B command');expect(savedA.occurrences).toHaveLength(0);
});

test('a failed current completion recovers its control and retries the same occurrence once',async()=>{
  await renderReview();const transport=api.post.bind(api);
  const post=jest.spyOn(api,'post').mockImplementationOnce(()=>Promise.reject(new Error('Synthetic pre-commit failure')))
    .mockImplementation((...args)=>transport(...args));
  await click(query('review-complete'));
  expect(toast.error).toHaveBeenCalledWith('Synthetic pre-commit failure');expect(query('review-complete').disabled).toBe(false);
  expect((await currentReview(reviewA)).occurrences).toHaveLength(0);
  await click(query('review-complete'));
  const completions=post.mock.calls.filter(([url])=>url.endsWith('/complete'));
  expect(completions).toHaveLength(2);
  for(const [,body] of completions)expect(body.occurrence_id).toBe(reviewA.current_occurrence_id);
  expect((await currentReview(reviewA)).occurrences).toHaveLength(1);
  expect(post.mock.calls.some(([url])=>url.endsWith('/start'))).toBe(false);
  expect(query('review-complete').disabled).toBe(false);
});

test('a late failed command is not reported as an error on the replacement Review',async()=>{
  await renderReview();const held=holdResponse('post',`/reviews/${reviewA.review_id}/complete`,{beforeCommit:true});
  await dispatchAndWait(query('review-complete'),held);await renderReview(otherClientReview);
  await inputNotes('Current client draft');toast.error.mockClear();
  await act(async()=>held.reject(new Error('Old client command failed')));
  expectVisibleReview(otherClientReview,'Current client draft');expect(toast.error).not.toHaveBeenCalled();
  expect(query('review-complete').disabled).toBe(false);
  expect((await currentReview(reviewA)).occurrences).toHaveLength(0);
});

test('same-turn repeated completion dispatches one native command and advances only its original occurrence',async()=>{
  await renderReview();const post=jest.spyOn(api,'post'),complete=query('review-complete');
  // Command reentrancy regression only; this is not a browser responsiveness measurement.
  await act(async()=>{complete.click();complete.click();});
  expect(post.mock.calls.filter(([url])=>url.endsWith('/complete'))).toHaveLength(1);
  const saved=await currentReview(reviewA);
  expect(saved.occurrences).toHaveLength(1);expect(saved.occurrences[0].occurrence_id).toBe(reviewA.current_occurrence_id);
  expect(saved.current_occurrence_id).not.toBe(reviewA.current_occurrence_id);
  expect(post.mock.calls.some(([url])=>url.endsWith('/start'))).toBe(false);
});

test('losing the existing contributor assignment retires a pending Save-to-Complete command without changing IDs',async()=>{
  const db=readStore(),contributor={...mockAuth.user,role:'client_contributor'};
  Object.assign(db.reviews.find(row=>row.review_id===reviewA.review_id),{owner_id:contributor.user_id,reviewer_id:contributor.user_id});
  db.user=contributor;db.users=[contributor];saveStore(db);
  mockAuth={...mockAuth,user:contributor};reviewA=await currentReview(reviewA);
  await renderReview();await inputNotes('Authorized A note before assignment changed');
  const held=holdResponse('patch',`/reviews/${reviewA.review_id}`),post=jest.spyOn(api,'post');
  await dispatchAndWait(query('review-complete'),held);
  const changed=readStore(),row=changed.reviews.find(record=>record.review_id===reviewA.review_id);
  row.owner_id='another-fictional-owner';row.reviewer_id='another-fictional-reviewer';saveStore(changed);
  const withdrawn=await currentReview(reviewA);
  await renderReview(withdrawn);onSaved.mockClear();toast.success.mockClear();
  expect(query('review-complete')).toBeNull();expect(query('field-notes').disabled).toBe(true);
  await act(async()=>held.resolve());
  expect(post.mock.calls.filter(([url])=>url.endsWith('/complete'))).toHaveLength(0);
  expect(onSaved).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();
  expect(query('field-notes').disabled).toBe(true);
  const retained=await currentReview(reviewA);
  expect(retained.owner_id).toBe('another-fictional-owner');expect(retained.reviewer_id).toBe('another-fictional-reviewer');
  expect(retained.notes).toBe('Authorized A note before assignment changed');expect(retained.occurrences).toHaveLength(0);
});

test.each(['authentication','organization'])('%s unavailability retires a pending Save-to-Complete command without changing identity',async boundary=>{
  await renderReview();await inputNotes('Authorized note before context became unavailable');
  const held=holdResponse('patch',`/reviews/${reviewA.review_id}`),post=jest.spyOn(api,'post');
  await dispatchAndWait(query('review-complete'),held);
  if(boundary==='authentication')mockAuth={...mockAuth,error:'Synthetic authentication context unavailable'};
  await renderReview(reviewA,{},boundary==='organization'?{error:'Synthetic organization context unavailable'}:{});
  onSaved.mockClear();toast.success.mockClear();
  await act(async()=>held.resolve());
  expect(post.mock.calls.filter(([url])=>url.endsWith('/complete'))).toHaveLength(0);
  expect(onSaved).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();
  const retained=await currentReview(reviewA);
  expect(retained.notes).toBe('Authorized note before context became unavailable');expect(retained.occurrences).toHaveLength(0);
});

test('acknowledging a posted comment preserves newer editable composer text and permits its subsequent native Post',async()=>{
  await renderReview();await click(query('tab-comments'));
  const enterComment=async value=>{
    const field=query('comment-input');expect(field).not.toBeNull();expect(field.disabled).toBe(false);
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,value);
      field.dispatchEvent(new Event('input',{bubbles:true}));
    });
  };
  await enterComment('Submitted fictional comment');
  const held=holdResponse('post','/comments');
  await dispatchAndWait(query('comment-submit'),held);
  await enterComment('Newer composer draft');
  await act(async()=>held.resolve());
  expect(query('comment-input').value).toBe('Newer composer draft');expect(query('comment-submit').disabled).toBe(false);
  const comments=async()=>(await api.get('/comments',{params:{entity_type:'reviews',entity_id:reviewA.review_id,occurrence_id:reviewA.current_occurrence_id}})).data;
  expect((await comments()).map(row=>row.body)).toEqual(['Submitted fictional comment']);
  expect(held.spy.mock.calls.filter(([url])=>url==='/comments')).toHaveLength(1);
  await click(query('comment-submit'));
  expect((await comments()).map(row=>row.body).sort()).toEqual(['Newer composer draft','Submitted fictional comment'].sort());
  expect(query('comment-input').value).toBe('');
  for(const [,body] of held.spy.mock.calls.filter(([url])=>url==='/comments'))
    expect(body).toMatchObject({entity_type:'reviews',entity_id:reviewA.review_id,occurrence_id:reviewA.current_occurrence_id});
});

test('the native unenrolled-client Notes field stays editable while Complete is pending and retains newer unsaved text',async()=>{
  // Real native fallback for a General GRC client: do not force events onto a disabled workflow field.
  clients[0]={client_id:clientIds[0],name:'QA unenrolled client',status:'active',framework_settings:{}};
  const db=readStore();db.clients[0]=clients[0];
  db.requirements=db.requirements.filter(row=>row.client_id!==clientIds[0]);saveStore(db);
  await renderReview();
  expect(query('reviews-drawer').classList.contains('brawndo-review-workflow')).toBe(false);
  const held=holdResponse('post',`/reviews/${reviewA.review_id}/complete`);
  await dispatchAndWait(query('review-complete'),held);
  await inputNotes('Newer text typed before the completion acknowledgment');
  await act(async()=>held.resolve());
  expect(query('field-notes').value).toBe('Newer text typed before the completion acknowledgment');
  expect(query('drawer-save').disabled).toBe(false);
  const retained=await currentReview(reviewA);
  expect(retained.occurrences).toHaveLength(1);
  expect(retained.occurrences[0].notes).toBe(reviewA.notes);
  expect(retained.notes||'').toBe('');
  expect(retained.current_occurrence_id).not.toBe(reviewA.current_occurrence_id);
});
