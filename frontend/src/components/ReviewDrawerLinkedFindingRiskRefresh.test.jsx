import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewDrawer from './ReviewDrawer';
import api from '@/lib/api';
import {rememberClient} from '@/lib/clientSelection';

let mockAuth,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),formatError:error=>error.response?.data?.detail||error.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn(),info:jest.fn()}}));

let root,container,review,finding,parentSaved,savedEvent;
const query=id=>document.querySelector(`[data-testid="${id}"]`);
const button=(scope,label)=>[...scope.querySelectorAll('button')].find(node=>node.textContent===label);
const click=node=>act(async()=>{expect(node).toBeTruthy();node.focus();node.click();});
const focusSettled=()=>act(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
const render=(props={})=>act(async()=>root.render(<ReviewDrawer open record={review} clientId={review.client_id} onOpenChange={()=>{}} onSaved={parentSaved} {...props}/>));
const input=(node,value)=>act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();rememberClient('demo_brawndo');
  window.history.replaceState({},'','/reviews?client_id=demo_brawndo');
  const user=(await api.post('/demo/enter')).data.user;mockAuth={user,workspaceMode:'demo',loading:false};
  const clients=(await api.get('/clients')).data;
  mockOrg={currentClientId:'demo_brawndo',currentClient:clients.find(row=>row.client_id==='demo_brawndo'),clients,loading:false};
  review=(await api.post('/reviews',{client_id:'demo_brawndo',title:'Synthetic parent refresh QA',review_type:'access',recurrence:'quarterly',due_date:'2099-09-30'})).data;
  finding=(await api.post(`/reviews/${review.review_id}/create-finding`,{request_id:crypto.randomUUID(),title:'Synthetic linked gap',remediation_title:'Retain native work',occurrence_id:review.current_occurrence_id})).data;
  parentSaved=jest.fn();savedEvent=jest.fn();window.addEventListener('grc:ticket-saved',savedEvent);
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{
  if(root)await act(async()=>root.unmount());
  container.remove();window.removeEventListener('grc:ticket-saved',savedEvent);jest.restoreAllMocks();jest.clearAllMocks();
});

async function openFinding(){
  await click(button(query('reviews-drawer'),'1 finding raised'));await focusSettled();
  await click(button(document.querySelector('[aria-label="Findings from this occurrence"]'),'Retain native work'));await focusSettled();
  expect(query('remediation-ticket-drawer')).toBeTruthy();
}
async function raiseRisk(){
  await click(button(query('remediation-ticket-drawer'),'Raise as risk'));
  await click(button(document.querySelector('[role="alertdialog"]'),'Confirm raise as risk'));
}
// Hold only the parent Review's four real adapter reads; the child ticket and command remain native.
function holdReviewRefresh(){
  const get=api.get.bind(api),reads=new Map();
  jest.spyOn(api,'get').mockImplementation((path,config)=>{
    let name;
    if(path===`/reviews/${review.review_id}/history`)name='history';
    if(path==='/related'&&config?.params?.entity_type==='reviews'&&config.params.entity_id===review.review_id)name='related';
    if(path==='/comments'&&config?.params?.entity_type==='reviews'&&config.params.entity_id===review.review_id)name='comments';
    if(path===`/reviews/${review.review_id}/activity`)name='activity';
    if(!name)return get(path,config);
    const gate=deferred();reads.set(name,gate);
    return Promise.all([get(path,config),gate.promise]).then(([response])=>response);
  });
  return reads;
}
const finishReads=reads=>act(async()=>{for(const gate of reads.values())gate.resolve();});
const expectAllReads=reads=>expect([...reads.keys()]).toEqual(['history','related','comments','activity']);
const expectUnconfirmed=()=>{
  expect(parentSaved).not.toHaveBeenCalled();expect(savedEvent).not.toHaveBeenCalled();
  expect(query('remediation-ticket-drawer').textContent).toContain('Review refresh could not be confirmed');
  expect(query('remediation-ticket-drawer').textContent).not.toContain('Risk linked and verified.');
  expect(button(query('remediation-ticket-drawer'),'Check linked Risk')).toBeTruthy();
};

test('the actual Review-linked Finding waits for all parent reads and the parent callback before reporting verified',async()=>{
  const parent=deferred();parentSaved.mockImplementation(()=>parent.promise);
  await render();await openFinding();const reads=holdReviewRefresh(),post=jest.spyOn(api,'post');
  await raiseRisk();expectAllReads(reads);
  expect(parentSaved).not.toHaveBeenCalled();expect(savedEvent).not.toHaveBeenCalled();
  await act(async()=>{for(const [name,gate] of reads)if(name!=='activity')gate.resolve();});
  expect(parentSaved).not.toHaveBeenCalled();
  await act(async()=>reads.get('activity').resolve());
  expect(parentSaved).toHaveBeenCalledTimes(1);expect(savedEvent).not.toHaveBeenCalled();
  expect(query('remediation-ticket-drawer').textContent).not.toContain('Risk linked and verified.');
  await act(async()=>parent.resolve());
  expect(savedEvent).toHaveBeenCalledTimes(1);
  expect(query('remediation-ticket-drawer').textContent).toContain('Risk linked and verified.');
  expect(post.mock.calls.filter(([path])=>path.endsWith('/raise-risk'))).toHaveLength(1);
  const current=(await api.get(`/findings/${finding.finding_id}`)).data;
  expect((await api.get(`/risks/${current.risk_id}`)).data).toMatchObject({client_id:review.client_id,source_id:finding.finding_id,likelihood_score:null,impact_score:null});
});

test.each(['history','related','comments','activity'])('a failed %s read keeps the linked Risk unconfirmed without calling the parent',async name=>{
  await render();await openFinding();const reads=holdReviewRefresh(),post=jest.spyOn(api,'post');
  await raiseRisk();expectAllReads(reads);
  await act(async()=>{for(const [key,gate] of reads)key===name?gate.reject(new Error('Synthetic refresh read unavailable')):gate.resolve();});
  expectUnconfirmed();
  expect(post.mock.calls.filter(([path])=>path.endsWith('/raise-risk'))).toHaveLength(1);
  // The native command did persist; a failed projection refresh must not invite a second creation.
  expect((await api.get(`/findings/${finding.finding_id}`)).data.risk_id).toBeTruthy();
});

test.each(['actor','role','mode','client','closed','unmounted'])('a stale %s parent cannot acknowledge a pending linked-Risk refresh',async change=>{
  await render();await openFinding();
  const sentinel='Comment visible only in the superseded refresh';
  await api.post('/comments',{entity_type:'reviews',entity_id:review.review_id,occurrence_id:review.current_occurrence_id,body:sentinel});
  const reads=holdReviewRefresh();
  await raiseRisk();expectAllReads(reads);
  if(change==='actor')mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'different-native-actor'}};
  if(change==='role')mockAuth={...mockAuth,user:{...mockAuth.user,role:'platform_admin'}};
  if(change==='mode')mockAuth={...mockAuth,workspaceMode:'authenticated'};
  if(change==='client')mockOrg={...mockOrg,currentClientId:'demo_dunder',currentClient:mockOrg.clients.find(row=>row.client_id==='demo_dunder')};
  if(change==='unmounted'){await act(async()=>root.unmount());root=null;}
  else await render({open:change!=='closed'});
  await finishReads(reads);
  expect(parentSaved).not.toHaveBeenCalled();expect(savedEvent).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('Risk linked and verified.');
  if(['actor','role'].includes(change)){
    // These same-client changes do not reset the Review generation. Reject their stale data before state installation.
    await click(query('tab-comments'));expect(query('reviews-drawer').textContent).not.toContain(sentinel);
  }
});

test('a rejected parent callback retains the unconfirmed command and does not dispatch success',async()=>{
  parentSaved.mockRejectedValue(new Error('Synthetic parent list unavailable'));
  await render();await openFinding();await raiseRisk();
  expect(parentSaved).toHaveBeenCalledTimes(1);expect(savedEvent).not.toHaveBeenCalled();
  expect(query('remediation-ticket-drawer').textContent).toContain('Synthetic parent list unavailable');
  expect(query('remediation-ticket-drawer').textContent).not.toContain('Risk linked and verified.');
  expect(button(query('remediation-ticket-drawer'),'Check linked Risk')).toBeTruthy();
});

test('an explicit failed dedicated parent refresh rejects success without invoking the legacy save callback',async()=>{
  const onRiskLinked=jest.fn().mockResolvedValue({ok:false});
  await render({onRiskLinked});await openFinding();await raiseRisk();
  expect(onRiskLinked).toHaveBeenCalledWith({accept:expect.any(Function)});
  expectUnconfirmed();
});

test('a failed exact Risk read blocks read-only opening without invoking parent saves or claiming a save',async()=>{
  const {data:{risk}}=await api.post(`/findings/${finding.finding_id}/raise-risk`);
  await render();await openFinding();const get=api.get.bind(api),post=jest.spyOn(api,'post');
  jest.spyOn(api,'get').mockImplementation((path,config)=>path===`/risks/${risk.risk_id}`?Promise.reject(new Error('Synthetic Risk read unavailable')):get(path,config));
  await click(button(query('remediation-ticket-drawer'),'Open linked Risk'));
  expect(parentSaved).not.toHaveBeenCalled();expect(savedEvent).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();
  expect(query('remediation-ticket-drawer').textContent).toContain('Synthetic Risk read unavailable');
  expect(query('remediation-ticket-drawer').textContent).not.toContain('Risk saved');
  expect(query('remediation-ticket-drawer').textContent).not.toContain('Risk linked and verified.');
  expect(query('risks-drawer')).toBeNull();
});

test('a parent identity change while its callback is pending cannot finish as verified',async()=>{
  const parent=deferred();parentSaved.mockImplementation(()=>parent.promise);
  await render();await openFinding();await raiseRisk();expect(parentSaved).toHaveBeenCalledTimes(1);
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'different-native-actor'}};await render();
  await act(async()=>parent.resolve());
  expect(savedEvent).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('Risk linked and verified.');
});

test('linked Risk refresh and native return preserve unsaved Review notes and comment without saving them',async()=>{
  await render();await input(query('field-notes'),'Unfinished parent Review notes');
  await click(query('tab-comments'));await input(query('comment-input'),'Unposted parent comment');await click(query('tab-overview'));
  const notes=query('field-notes');
  const heading=query('reviews-drawer').querySelector('[data-review-title]');
  await openFinding();const post=jest.spyOn(api,'post'),patch=jest.spyOn(api,'patch');
  await raiseRisk();expect(parentSaved).toHaveBeenCalledTimes(1);
  expect(query('field-notes')).toBe(notes);expect(notes.value).toBe('Unfinished parent Review notes');
  await click(button(query('remediation-ticket-drawer'),'Cancel'));await focusSettled();
  expect(query('remediation-ticket-drawer')).toBeNull();expect(document.activeElement).toBe(heading);
  expect(query('drawer-save').disabled).toBe(false);expect(notes.value).toBe('Unfinished parent Review notes');
  await click(query('tab-comments'));expect(query('comment-input').value).toBe('Unposted parent comment');
  expect(patch).not.toHaveBeenCalled();expect(post.mock.calls.map(([path])=>path)).toEqual([`/findings/${finding.finding_id}/raise-risk`]);
  expect((await api.get(`/reviews/${review.review_id}`)).data.notes||'').toBe(review.notes||'');
  expect((await api.get('/comments',{params:{entity_type:'reviews',entity_id:review.review_id,occurrence_id:review.current_occurrence_id}})).data).toEqual([]);
});
