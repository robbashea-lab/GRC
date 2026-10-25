import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import api from '@/lib/api';
import {rememberClient} from '@/lib/clientSelection';

let mockAuth,mockOrg,mockLocation;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),formatError:error=>error.response?.data?.detail||error.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useLocation:()=>mockLocation,useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams(mockLocation.search))}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn(),info:jest.fn()}}));

let root,container,review,finding,savedEvent;
const query=id=>document.querySelector(`[data-testid="${id}"]`);
const button=(scope,label)=>[...scope.querySelectorAll('button')].find(node=>node.textContent===label);
const click=node=>act(async()=>{expect(node).toBeTruthy();node.focus();node.click();});
const focusSettled=()=>act(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
const render=(kind='reviews')=>act(async()=>root.render(<RecordListPage kind={kind}/>));
const input=(node,value)=>act(async()=>{
  const prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
const createReview=(title,due_date='2000-09-30')=>api.post('/reviews',{client_id:'demo_brawndo',title,review_type:'access',recurrence:'quarterly',due_date});

beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();rememberClient('demo_brawndo');
  mockLocation={pathname:'/reviews',search:'?client_id=demo_brawndo'};window.history.replaceState({},'','/reviews'+mockLocation.search);
  const user=(await api.post('/demo/enter')).data.user;mockAuth={user,workspaceMode:'demo',loading:false};
  const clients=(await api.get('/clients')).data;
  mockOrg={currentClientId:'demo_brawndo',currentClient:clients.find(row=>row.client_id==='demo_brawndo'),clients,loading:false};
  review=(await createReview('Synthetic native register Risk refresh')).data;
  finding=(await api.post(`/reviews/${review.review_id}/create-finding`,{request_id:crypto.randomUUID(),title:'Synthetic register gap',remediation_title:'Preserve register-linked native work',occurrence_id:review.current_occurrence_id})).data;
  savedEvent=jest.fn();window.addEventListener('grc:ticket-saved',savedEvent);
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{
  if(root)await act(async()=>root.unmount());container.remove();window.removeEventListener('grc:ticket-saved',savedEvent);jest.restoreAllMocks();jest.clearAllMocks();
});

async function openFinding(notes){
  await render();
  const findOpener=()=>[...container.querySelectorAll('.bdr-name')].find(node=>node.textContent===review.title);
  let opener=findOpener();
  while(!opener){
    const pager=container.querySelector('[aria-label="Review register pages"]'),previous=pager.textContent,next=button(pager,'Next');
    expect(next.disabled).toBe(false);await click(next);expect(pager.textContent).not.toBe(previous);opener=findOpener();
  }
  await click(opener);await focusSettled();
  expect(query('reviews-drawer')).toBeTruthy();
  if(notes)await input(query('field-notes'),notes);
  await click(button(query('reviews-drawer'),'1 finding raised')||button(query('reviews-drawer'),'1 finding'));await focusSettled();
  await click(button(document.querySelector('[aria-label="Findings from this occurrence"]'),'Preserve register-linked native work'));await focusSettled();
  expect(query('remediation-ticket-drawer')).toBeTruthy();
}
async function raiseRisk(){
  await click(button(query('remediation-ticket-drawer'),'Raise as risk'));
  await click(button(document.querySelector('[role="alertdialog"]'),'Confirm raise as risk'));
}
// The actual child ticket also reads /reviews; only the Page requests include_basis.
function holdPageRefresh(){
  const gate=deferred(),get=api.get.bind(api);let response;
  const spy=jest.spyOn(api,'get').mockImplementation((path,config)=>{
    const request=get(path,config);
    if(!response&&path==='/reviews'&&config?.params?.include_basis===true){
      response=request;
      return Promise.all([request,gate.promise]).then(([result])=>gate.result||result);
    }
    return request;
  });
  return {...gate,spy,response:()=>response,setResult:result=>{gate.result=result;}};
}
const expectPending=gate=>{
  expect(gate.response()).toBeTruthy();expect(savedEvent).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('Risk linked and verified.');expect(query('risks-drawer')).toBeNull();
};

test('real register -> Review -> Finding waits for the accepted register read before reporting a linked Risk',async()=>{
  await openFinding();const gate=holdPageRefresh(),post=jest.spyOn(api,'post');
  await raiseRisk();expectPending(gate);
  await act(async()=>gate.resolve());
  expect(savedEvent).toHaveBeenCalledTimes(1);expect(query('remediation-ticket-drawer').textContent).toContain('Risk linked and verified.');
  expect(post.mock.calls.map(([path])=>path)).toEqual([`/findings/${finding.finding_id}/raise-risk`]);
  expect(container.textContent).toContain(review.title);
});

test.each(['request','malformed','foreign'])('a %s register refresh failure remains unconfirmed and preserves the native Review draft',async failure=>{
  await openFinding('Unsaved Review draft retained through failed register refresh');
  const gate=holdPageRefresh(),post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
  await raiseRisk();expectPending(gate);
  await act(async()=>{
    if(failure==='request')gate.reject(new Error('Synthetic register refresh unavailable'));
    else {gate.setResult({data:failure==='malformed'?{}:[{...review,client_id:'demo_dunder'}]});gate.resolve();}
  });
  expect(savedEvent).not.toHaveBeenCalled();expect(query('remediation-ticket-drawer').textContent).toContain('Reviews register refresh could not be confirmed');
  expect(query('remediation-ticket-drawer').textContent).not.toContain('Risk linked and verified.');
  expect(button(query('remediation-ticket-drawer'),'Check linked Risk')).toBeTruthy();expect(query('risks-drawer')).toBeNull();
  expect(query('field-notes').value).toBe('Unsaved Review draft retained through failed register refresh');expect(patch).not.toHaveBeenCalled();
  expect(post.mock.calls.map(([path])=>path)).toEqual([`/findings/${finding.finding_id}/raise-risk`]);
  expect((await api.get(`/findings/${finding.finding_id}`)).data.risk_id).toBeTruthy();
  expect((await api.get(`/reviews/${review.review_id}`)).data.notes||'').toBe(review.notes||'');
  if(failure==='request'){
    gate.spy.mockRestore();await click(button(query('remediation-ticket-drawer'),'Check linked Risk'));
    expect(query('remediation-ticket-drawer').textContent).toContain('Risk linked and verified.');
    expect(post.mock.calls.map(([path])=>path)).toEqual([`/findings/${finding.finding_id}/raise-risk`]);
  }
});

test.each(['actor-mode','auth-loading','client','kind','route','closed','unmounted'])('a stale %s page cannot install a superseded register response or report success',async change=>{
  await openFinding();const sentinel=(await createReview(`Superseded register projection ${change}`,'1990-01-01')).data;
  const gate=holdPageRefresh();await raiseRisk();expectPending(gate);
  expect((await gate.response()).data.some(row=>row.review_id===sentinel.review_id)).toBe(true);
  // Delete only this never-completed per-test fixture before newer current reads, retaining its genuine audit entry.
  await api.delete(`/reviews/${sentinel.review_id}`,{data:{expected_updated_at:sentinel.updated_at??null}});
  if(change==='actor-mode')mockAuth={...mockAuth,user:{...mockAuth.user,workspace_mode:'standard'}};
  if(change==='auth-loading')mockAuth={...mockAuth,loading:true};
  if(change==='client'){
    rememberClient('demo_dunder');mockOrg={...mockOrg,currentClientId:'demo_dunder',currentClient:mockOrg.clients.find(row=>row.client_id==='demo_dunder')};
    mockLocation={...mockLocation,search:'?client_id=demo_dunder'};
  }
  if(change==='route')mockLocation={...mockLocation,pathname:'/calendar'};
  if(change==='closed'){await click(button(query('reviews-drawer'),'Close'));await focusSettled();}
  else if(change==='unmounted'){await act(async()=>root.unmount());root=null;}
  else await render(change==='kind'?'findings':'reviews');
  await act(async()=>gate.resolve());
  expect(container.textContent).not.toContain(sentinel.title);expect(savedEvent).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('Risk linked and verified.');expect(query('risks-drawer')).toBeNull();
});

test('changing the native Review occurrence while its register read is pending prevents stale page projection updates',async()=>{
  await api.post(`/reviews/${review.review_id}/complete`,{occurrence_id:review.current_occurrence_id,conclusion:'Synthetic completed occurrence',tested_scope:'Controlled fixture',tested_period:'2000 Q3',checklist_confirmed:true,no_evidence_reason:'Recorded synthetic Finding supplies the test context'});
  review=(await api.get(`/reviews/${review.review_id}`)).data;
  await openFinding();const sentinel=(await createReview('Superseded occurrence register projection','1990-01-01')).data;
  const gate=holdPageRefresh();await raiseRisk();expectPending(gate);
  expect((await gate.response()).data.some(row=>row.review_id===sentinel.review_id)).toBe(true);
  await api.delete(`/reviews/${sentinel.review_id}`,{data:{expected_updated_at:sentinel.updated_at??null}});
  const historyChoice=query('review-history').querySelector('tbody tr:not(.is-current) td:first-child button');
  await click(historyChoice);
  await act(async()=>gate.resolve());
  expect(container.textContent).not.toContain(sentinel.title);expect(savedEvent).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('Risk linked and verified.');expect(query('risks-drawer')).toBeNull();
  expect(button(query('reviews-drawer'),'Back to current Review')).toBeTruthy();
});

describe('a Review created natively and kept open',()=>{
  let nativePost,createdReview,createdFinding,originalDrawer,originalScrollIntoView;
  beforeEach(()=>{originalScrollIntoView=HTMLElement.prototype.scrollIntoView;HTMLElement.prototype.scrollIntoView=jest.fn();});
  afterEach(()=>{if(originalScrollIntoView)HTMLElement.prototype.scrollIntoView=originalScrollIntoView;else delete HTMLElement.prototype.scrollIntoView;});
  beforeEach(async()=>{
    await render();await click(query('create-reviews-button'));originalDrawer=query('reviews-drawer');
    nativePost=jest.spyOn(api,'post');
    await input(query('field-title'),'Native newborn Review kept open');
    await act(async()=>query('field-review_type').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
    await click([...document.querySelectorAll('[role="option"]')].find(node=>node.textContent==='Access'));
    await input(query('field-due_date'),'2026-11-12');
    expect(query('field-recurrence').textContent).toBe('One-time');
    await click(query('drawer-save'));
    const index=nativePost.mock.calls.findIndex(([path])=>path==='/reviews');
    expect(index).toBeGreaterThanOrEqual(0);createdReview=(await nativePost.mock.results[index].value).data;
    expect(createdReview).toMatchObject({client_id:'demo_brawndo',review_type:'access',recurrence:'none'});
    expect(query('reviews-drawer')).toBe(originalDrawer);
    expect(originalDrawer.classList.contains('brawndo-review-workflow')).toBe(false);
    await input(query('field-notes'),'Unfinished newborn Review draft');
  });
  beforeEach(async()=>{
    await click(query('quick-create-finding'));
    await input(query('finding-title'),'Native newborn Finding');
    await input(query('finding-remediation-title'),'Native newborn required Action');
    await input(query('review-finding-form').querySelector('input[type="date"]'),'2026-11-19');
    await act(async()=>query('finding-save').closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    const index=nativePost.mock.calls.findIndex(([path])=>path===`/reviews/${createdReview.review_id}/create-finding`);
    expect(index).toBeGreaterThanOrEqual(0);createdFinding=(await nativePost.mock.results[index].value).data;
    expect(createdFinding).toMatchObject({review_id:createdReview.review_id,occurrence_id:createdReview.current_occurrence_id});
    await click(query('tab-related'));await focusSettled();
    await click(button(query('reviews-drawer'),'Native newborn required Action'));await focusSettled();
    expect(query('remediation-ticket-drawer')).toBeTruthy();expect(query('reviews-drawer')).toBe(originalDrawer);
  });

  test('acknowledges the saved newborn Review without closing or reopening its native drawer',async()=>{
    const gate=holdPageRefresh(),patch=jest.spyOn(api,'patch');
    await raiseRisk();
    expect({pageReadStarted:!!gate.response(),falseUnconfirmed:query('remediation-ticket-drawer').textContent.includes('Reviews register refresh could not be confirmed')})
      .toEqual({pageReadStarted:true,falseUnconfirmed:false});
    expect(savedEvent).not.toHaveBeenCalled();await act(async()=>gate.resolve());
    expect(query('remediation-ticket-drawer').textContent).toContain('Risk linked and verified.');
    expect(savedEvent).toHaveBeenCalledTimes(1);expect(query('reviews-drawer')).toBe(originalDrawer);
    expect(originalDrawer.classList.contains('brawndo-review-workflow')).toBe(false);
    expect(query('tab-related').getAttribute('aria-pressed')).toBe('true');expect(patch).not.toHaveBeenCalled();
    expect(nativePost.mock.calls.filter(([path])=>path.endsWith('/raise-risk')).map(([path])=>path)).toEqual([`/findings/${createdFinding.finding_id}/raise-risk`]);
    const linked=(await api.get(`/findings/${createdFinding.finding_id}`)).data;
    expect((await api.get(`/risks/${linked.risk_id}`)).data).toMatchObject({client_id:'demo_brawndo',finding_id:createdFinding.finding_id,likelihood_score:null,impact_score:null,risk_score:null});
    await click(button(query('remediation-ticket-drawer'),'Cancel'));await click(query('tab-overview'));
    expect(query('field-notes').value).toBe('Unfinished newborn Review draft');
  });

  test('keeps a newborn Risk unconfirmed on register failure and reconciles without creating another Risk',async()=>{
    const gate=holdPageRefresh(),patch=jest.spyOn(api,'patch');
    await raiseRisk();expectPending(gate);
    await act(async()=>gate.reject(new Error('Newborn register read unavailable')));
    expect(savedEvent).not.toHaveBeenCalled();expect(query('remediation-ticket-drawer').textContent).toContain('Reviews register refresh could not be confirmed');
    gate.spy.mockRestore();await click(button(query('remediation-ticket-drawer'),'Check linked Risk'));
    expect(query('remediation-ticket-drawer').textContent).toContain('Risk linked and verified.');expect(savedEvent).toHaveBeenCalledTimes(1);
    expect(nativePost.mock.calls.filter(([path])=>path.endsWith('/raise-risk')).map(([path])=>path)).toEqual([`/findings/${createdFinding.finding_id}/raise-risk`]);
    expect(patch).not.toHaveBeenCalled();expect(query('reviews-drawer')).toBe(originalDrawer);
  });

  test.each(['auth-loading','actor-roundtrip'])('rejects a pending newborn register response after %s without installing its stale projection',async change=>{
    const sentinel=(await createReview('Superseded newborn register projection','1990-01-01')).data;
    const gate=holdPageRefresh();await raiseRisk();expectPending(gate);
    expect((await gate.response()).data.some(row=>row.review_id===sentinel.review_id)).toBe(true);
    await api.delete(`/reviews/${sentinel.review_id}`,{data:{expected_updated_at:sentinel.updated_at??null}});
    if(change==='auth-loading'){mockAuth={...mockAuth,loading:true};await render();}
    else{
      const originalAuth=mockAuth;mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'temporary-other-native-actor'}};await render();
      mockAuth=originalAuth;await render();
    }
    await act(async()=>gate.resolve());
    expect(container.textContent).not.toContain(sentinel.title);expect(savedEvent).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Risk linked and verified.');expect(query('risks-drawer')).toBeNull();
    expect(nativePost.mock.calls.filter(([path])=>path.endsWith('/raise-risk')).map(([path])=>path)).toEqual([`/findings/${createdFinding.finding_id}/raise-risk`]);
  });
});
