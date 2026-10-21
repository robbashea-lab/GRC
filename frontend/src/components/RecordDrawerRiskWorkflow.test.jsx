import {cisClient} from '@/testUtils/cisExperience';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';
import {toast} from 'sonner';
import {rememberClient} from '@/lib/clientSelection';
import {SCHEMAS} from '@/lib/schemas';

let mockAuth,mockOrg;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn()},formatError:error=>error.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn(),info:jest.fn()}}));
let root,container,risk,rows,props;
const dialog=()=>document.querySelector('[data-testid="risks-drawer"]');
const button=(text,scope=dialog())=>[...scope.querySelectorAll('button')].find(node=>node.textContent===text);
const render=extra=>act(async()=>root.render(<RecordDrawer {...props} {...extra}/>));
// These regressions cover assessment reachability and serialization; full native cases below retain the complete schema.
const aiCreationSchema=SCHEMAS.risks.fields.filter(field=>['title','likelihood_score','impact_score'].includes(field.name));
const click=node=>act(async()=>node.click());
const input=(node,value)=>act(async()=>{
  const prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  sessionStorage.clear();localStorage.clear();rememberClient('demo_brawndo');
  window.history.replaceState({},'','/risks');
  mockAuth={workspaceMode:'demo',loading:false,user:{user_id:'scope-owner',name:'Test approver',email:'approver@example.test',role:'super_admin',workspace_mode:'demo'}};
  const client={...cisClient('demo_brawndo'),name:'Brawndo'};
  mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false};
  risk={risk_id:'risk-a',client_id:'demo_brawndo',display_id:'RISK-105',title:'Current risk',description:'A synthetic recovery risk.',category:'operational',status:'open',likelihood_score:3,impact_score:4,source_type:'manual',treatment:'mitigate',review_cadence:'annual',next_review:'2099-01-01',updated_at:'2026-10-01T12:00:00Z'};
  rows=[risk];
  api.get.mockImplementation(async path=>({data:path==='/risks'?rows:path==='/related'?{}:path==='/evidence/catalog'?{items:[],counts:{direct:0},total:0,page_size:25}:[]}));
  api.patch.mockImplementation(async(path,body)=>({data:{...risk,...body,updated_at:'2026-10-20T12:00:00Z'}}));
  api.post.mockResolvedValue({data:{}});
  props={open:true,kind:'risks',clientId:risk.client_id,record:risk,onOpenChange:jest.fn(),onSaved:jest.fn()};
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each([1,2,3].flatMap(group=>['demo','standard'].map(mode=>[group,mode])))('configured IG%i %s client retains the approved native Risk workflow without a write on open',async(group,mode)=>{
  const client=cisClient(`synthetic_ig${group}_${mode}`,group);
  mockAuth={...mockAuth,workspaceMode:mode,user:{...mockAuth.user,workspace_mode:mode}};
  mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false};
  risk={...risk,client_id:client.client_id};rows=[risk];props={...props,record:risk,clientId:client.client_id};
  rememberClient(client.client_id);
  await render();
  expect(dialog().className).toContain('brawndo-risk-workflow');
  expect(dialog().textContent).toContain(risk.title);
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('AI-origin creation exposes native required assessment without inventing ratings',async()=>{
  window.history.replaceState({},'','/ai-governance');
  api.post.mockRejectedValueOnce(new Error('Risk ratings must be whole numbers from 1 to 5.'));
  await render({record:null,aiRiskCreation:true,schema:aiCreationSchema,initialValues:{title:'Synthetic AI risk'}});
  expect(document.querySelector('[data-testid="field-likelihood_score"]')).not.toBeNull();
  expect(document.querySelector('[data-testid="field-impact_score"]')).not.toBeNull();
  expect(document.querySelector('[data-testid="risk-live-score"]').textContent).toContain('select both');
  await click(button('Create'));
  // The native numeric serializer sends blank values as zero; the server rejects them.
  expect(api.post).toHaveBeenCalledWith('/risks',expect.objectContaining({likelihood_score:0,impact_score:0}),expect.anything());
  expect(toast.error).toHaveBeenCalledWith('Risk ratings must be whole numbers from 1 to 5.');
});

test.each(['caller','route','authority'])('AI assessment remains scoped by %s',async boundary=>{
  window.history.replaceState({},'',boundary==='route'?'/vendors':'/ai-governance');
  if(boundary==='authority'){mockAuth.workspaceMode='authenticated';mockAuth.user.workspace_mode='authenticated';}
  await render({record:null,aiRiskCreation:boundary!=='caller',schema:aiCreationSchema});
  expect(document.querySelector('[data-testid="field-likelihood_score"]')).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
});

test.each(['unsupported-mode','other-client'])('ineligible %s Risk keeps its actual native Close panel',async condition=>{
  const trace=phase=>{if(process.env.WORKFLOW_TEST_TRACE==='1')console.info(`Risk native Close ${condition}: ${phase} at ${Date.now()}`);};
  if(condition==='unsupported-mode'){mockAuth.workspaceMode='authenticated';mockAuth.user.workspace_mode='authenticated';}
  if(condition==='other-client'){
    risk.client_id='demo_dunder';props.clientId='demo_dunder';mockOrg={...mockOrg,currentClientId:'demo_dunder',currentClient:{client_id:'demo_dunder',name:'Dunder Mifflin',status:'active'}};
    rememberClient('demo_dunder');
  }
  trace('before render');
  await render();
  trace('after render');
  expect(dialog().className).not.toContain('brawndo-risk-workflow');
  await click(document.querySelector('[data-testid="risk-close"]'));
  trace('after Close click');
  const reason=document.querySelector('[aria-label="Closure reason"]');
  expect(reason).not.toBeNull();expect(document.querySelector('[aria-label="Closure note"]')).not.toBeNull();
  expect([...document.querySelectorAll('[role="dialog"] button')].some(node=>node.textContent==='Confirm closure')).toBe(true);
  expect(api.post).not.toHaveBeenCalled();
});

test.each(['Accept risk','Close risk'])('eligible %s keeps native decision controls usable and locks background drafts',async command=>{
  await render();await click(button(command));
  expect(dialog().querySelector('[aria-label="Title"]').disabled).toBe(true);
  expect([...dialog().querySelectorAll('.rw-tabs button')].every(node=>node.disabled)).toBe(true);
  expect(button('Re-assess →').disabled).toBe(true);
  expect(button('Save changes').disabled).toBe(true);
  if(command==='Accept risk'){
    expect(dialog().querySelector('[aria-label="Acceptance rationale"]').disabled).toBe(false);
    expect(dialog().querySelector('[aria-label="Acceptance expiry"]').disabled).toBe(false);
  }else expect(dialog().querySelector('[aria-label="Closure note"]').disabled).toBe(false);
  await click(button('Cancel'));
  expect(dialog().querySelector('[aria-label="Title"]').disabled).toBe(false);
  expect([...dialog().querySelectorAll('.rw-tabs button')].every(node=>!node.disabled)).toBe(true);
  expect(api.post).not.toHaveBeenCalled();
});

test('a recorded category remains plain option text in the eligible native editor',async()=>{
  risk.category='retained_category';await render();
  const option=dialog().querySelector('select[aria-label="Category"] option[value="retained_category"]');
  expect(option.textContent).toBe('retained_category (recorded)');expect(option.children).toHaveLength(0);
});

test('dirty Close saves first and uses the returned version for its native command',async()=>{
  await render();await input(dialog().querySelector('[aria-label="Title"]'),'Updated risk');
  await click(button('Close risk'));
  expect(api.patch).toHaveBeenCalledWith('/risks/risk-a',expect.objectContaining({title:'Updated risk',expected_updated_at:'2026-10-01T12:00:00Z'}),expect.any(Object));
  expect(api.post).not.toHaveBeenCalled();
  await click(button('Confirm closure'));
  expect(api.post).toHaveBeenCalledWith('/risks/risk-a/close',expect.objectContaining({reason:'remediated',note:'',expected_updated_at:'2026-10-20T12:00:00Z'}));
});

test('a pending dirty Close cannot install a hidden locked decision on another actor or Risk',async()=>{
  await render();await input(dialog().querySelector('[aria-label="Title"]'),'Old actor draft');
  let resolveSave;api.patch.mockImplementationOnce(()=>new Promise(resolve=>{resolveSave=resolve;}));
  await click(button('Close risk'));
  const nextRisk={...risk,risk_id:'risk-b',title:'Next actor risk',display_id:'RISK-106'};rows=[nextRisk];
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'next-actor'}};
  await render({record:nextRisk});
  await act(async()=>resolveSave({data:{...risk,title:'Old actor draft',updated_at:'2026-10-20T12:00:00Z'}}));
  expect(dialog().querySelector('[aria-label="Closure note"]')).toBeNull();
  expect(dialog().querySelector('[aria-label="Title"]').disabled).toBe(false);
  expect([...dialog().querySelectorAll('.rw-tabs button')].every(node=>!node.disabled)).toBe(true);
  expect(api.post).not.toHaveBeenCalled();
});

test('Discard changes clears an unfinished inline acceptance when reopening the same Risk',async()=>{
  await render();await click(button('Accept risk'));
  await input(dialog().querySelector('[aria-label="Acceptance rationale"]'),'Discard this unsubmitted decision.');
  await act(async()=>dialog().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  const discard=document.querySelector('[role="alertdialog"]');expect(discard).not.toBeNull();
  await click(button('Discard changes',discard));
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
  await render({open:false});await render({open:true});
  expect(dialog().querySelector('[aria-label="Acceptance rationale"]')).toBeNull();
  expect(dialog().querySelector('[aria-label="Title"]').disabled).toBe(false);
  await click(button('Accept risk'));
  expect(dialog().querySelector('[aria-label="Acceptance rationale"]').value).toBe('');
  expect(api.post).not.toHaveBeenCalled();
});

test.each([['auth','Accept risk'],['org','Close risk']])('%s loading preserves an owned %s draft through native fallback and return to inline',async(surface,command)=>{
  const trace=phase=>{if(process.env.WORKFLOW_TEST_TRACE==='1')console.info(`Risk decision ${surface}: ${phase} at ${Date.now()}`);};
  trace('before render');
  await render();await click(button(command));
  trace('decision opened');
  const acceptance=command==='Accept risk';
  const field=acceptance?'[aria-label="Acceptance rationale"]':'[aria-label="Closure note"]';
  const draft='Keep this unsent decision across temporary loading.';
  await input(dialog().querySelector(field),draft);
  if(surface==='auth')mockAuth={...mockAuth,loading:true};else mockOrg={...mockOrg,loading:true};
  await render();
  expect(dialog().className).not.toContain('brawndo-risk-workflow');
  const fallbackField=acceptance?document.querySelector('[data-testid="accept-rationale"]'):document.querySelector('[aria-label="Closure note"]');
  expect(fallbackField).not.toBeNull();expect(fallbackField.value).toBe(draft);
  const fallback=fallbackField.closest('[role="dialog"]');
  expect(fallback).not.toBe(dialog());
  expect(dialog().closest('[aria-hidden="true"]')).not.toBeNull();
  await act(async()=>fallbackField.focus());
  await act(async()=>dialog().querySelector('[data-testid="field-title"]').focus());
  expect(fallback.contains(document.activeElement)).toBe(true);
  trace('fallback focused');
  const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  expect(props.onOpenChange).not.toHaveBeenCalled();
  if(surface==='auth')mockAuth={...mockAuth,loading:false};else mockOrg={...mockOrg,loading:false};
  await render();
  expect(dialog().className).toContain('brawndo-risk-workflow');
  expect(dialog().querySelector(field).value).toBe(draft);
  expect(dialog().querySelector('[aria-label="Title"]').disabled).toBe(true);
  trace('inline restored');
  if(surface==='auth')mockAuth={...mockAuth,loading:true};else mockOrg={...mockOrg,loading:true};
  await render();
  const cancelField=acceptance?document.querySelector('[data-testid="accept-rationale"]'):document.querySelector('[aria-label="Closure note"]');
  await click(button(acceptance?'Cancel':'Close',cancelField.closest('[role="dialog"]')));
  trace('fallback cancelled');
  if(surface==='auth')mockAuth={...mockAuth,loading:false};else mockOrg={...mockOrg,loading:false};
  await render();
  expect(dialog().querySelector(field)).toBeNull();
  expect(dialog().querySelector('[aria-label="Title"]').disabled).toBe(false);
  expect(api.post).not.toHaveBeenCalled();
  trace('completed');
});

test('dirty Close cannot create a hidden decision after eligibility disappears during its native Save',async()=>{
  await render();await input(dialog().querySelector('[aria-label="Title"]'),'Saved before temporary loading');
  let resolveSave;api.patch.mockImplementationOnce(()=>new Promise(resolve=>{resolveSave=resolve;}));
  await click(button('Close risk'));
  mockOrg={...mockOrg,loading:true};await render();
  await act(async()=>resolveSave({data:{...risk,title:'Saved before temporary loading',updated_at:'2026-10-20T12:00:00Z'}}));
  expect(document.querySelector('[aria-label="Closure note"]')).toBeNull();
  mockOrg={...mockOrg,loading:false};await render();
  expect(dialog().querySelector('[aria-label="Closure note"]')).toBeNull();
  expect(dialog().querySelector('[aria-label="Title"]').disabled).toBe(false);
  expect([...dialog().querySelectorAll('.rw-tabs button')].every(node=>!node.disabled)).toBe(true);
  expect(api.post).not.toHaveBeenCalled();
});

const openSupportingRecords=async()=>{
  await click([...dialog().querySelectorAll('[role="tab"]')].find(node=>node.textContent.startsWith('Treatment')));
  const disclosure=dialog().querySelector('.rw-supporting details');
  await click(disclosure.querySelector('summary'));
  return disclosure;
};

test('Treatment Supporting records exposes actual native controls and excludes duplicate Action/Evidence rows from related empty state',async()=>{
  const original=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,...args)=>path==='/related'?{data:{tasks:[{task_id:'native-task',client_id:risk.client_id,title:'Native treatment work',status:'open'}],evidence:[{evidence_id:'native-file',client_id:risk.client_id,filename:'Native source.pdf'}]}}:original(path,...args));
  await render();const disclosure=await openSupportingRecords();
  expect(disclosure.open).toBe(true);
  expect(disclosure.querySelector('[data-testid="drawer-evidence-dropzone"]')).not.toBeNull();
  expect(disclosure.querySelector('[data-testid="drawer-evidence-input"]').type).toBe('file');
  expect([...disclosure.querySelectorAll('button')].some(node=>node.textContent==='Link existing Evidence')).toBe(true);
  expect(disclosure.querySelector('[data-testid="comment-input"]')).not.toBeNull();
  const related=[...disclosure.querySelectorAll('section')].find(section=>section.querySelector('h3')?.textContent==='Related records');
  expect(related.textContent).toContain('No related records yet.');
  expect(related.querySelector('[data-testid="related-tasks-item"]')).toBeNull();
  expect(related.querySelector('[data-testid="related-evidence-item"]')).toBeNull();
  expect(dialog().querySelector('.rw-action').textContent).toContain('Native treatment work');
});

test('an unfinished Supporting records comment keeps the disclosure open and blocks navigation, Risk save and dismissal',async()=>{
  await render();const disclosure=await openSupportingRecords();
  await input(disclosure.querySelector('[data-testid="comment-input"]'),'Unfinished native comment');
  expect(disclosure.open).toBe(true);
  await click([...dialog().querySelectorAll('[role="tab"]')].find(node=>node.textContent==='Overview'));
  expect([...dialog().querySelectorAll('[role="tab"]')].find(node=>node.textContent.startsWith('Treatment')).getAttribute('aria-selected')).toBe('true');
  expect(toast.error).toHaveBeenCalledWith('Post or discard the unfinished comment before switching tabs.');
  await click(button('Save changes'));
  expect(api.patch).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith('Post or discard the unfinished comment before saving or completing this item.');
  await click(button('Close'));
  const discard=document.querySelector('[role="alertdialog"]');
  expect(discard).not.toBeNull();expect(props.onOpenChange).not.toHaveBeenCalled();
  await click(button('Keep editing',discard));
  expect(disclosure.querySelector('[data-testid="comment-input"]').value).toBe('Unfinished native comment');
});

test('Supporting records comment prevents duplicate pending posts, retains failure text and posts the same native record on retry',async()=>{
  await render();const disclosure=await openSupportingRecords();
  const comment=disclosure.querySelector('[data-testid="comment-input"]');
  await input(comment,'Retain this comment on a failed request.');
  let rejectPost;api.post.mockImplementationOnce(()=>new Promise((resolve,reject)=>{rejectPost=reject;}));
  await act(async()=>{const post=disclosure.querySelector('[data-testid="comment-submit"]');post.click();post.click();});
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/comments',{entity_type:'risks',entity_id:risk.risk_id,body:'Retain this comment on a failed request.'});
  expect(comment.disabled).toBe(true);
  expect(dialog().querySelector('.rw-supporting').hasAttribute('inert')).toBe(true);
  expect(disclosure.querySelector('[data-testid="drawer-evidence-dropzone"]').getAttribute('aria-disabled')).toBe('true');
  expect([...dialog().querySelectorAll('.rw-tabs button')].every(node=>node.disabled)).toBe(true);
  await act(async()=>rejectPost(new Error('Comment request failed')));
  expect(comment.value).toBe('Retain this comment on a failed request.');
  expect(comment.disabled).toBe(false);expect(toast.error).toHaveBeenCalledWith('Comment request failed');
  api.post.mockResolvedValueOnce({data:{comment_id:'native-comment'}});
  await click(disclosure.querySelector('[data-testid="comment-submit"]'));
  expect(api.post).toHaveBeenCalledTimes(2);
  expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
  expect(comment.value).toBe('');
});

test.each([['auth','Accept risk'],['org','Accept risk'],['auth','Close risk'],['org','Close risk']])('%s loading can open native %s and restore the same decision into workflow presentation',async(surface,command)=>{
  if(surface==='auth')mockAuth={...mockAuth,loading:true};else mockOrg={...mockOrg,loading:true};
  await render();expect(dialog().className).not.toContain('brawndo-risk-workflow');
  const acceptance=command==='Accept risk';
  await click(dialog().querySelector(`[data-testid="${acceptance?'risk-accept':'risk-close'}"]`));
  const fallback=acceptance?document.querySelector('[data-testid="accept-rationale"]'):document.querySelector('[aria-label="Closure note"]');
  expect(fallback).not.toBeNull();
  const draft='Native decision begun during temporary loading.';await input(fallback,draft);
  if(surface==='auth')mockAuth={...mockAuth,loading:false};else mockOrg={...mockOrg,loading:false};
  await render();expect(dialog().className).toContain('brawndo-risk-workflow');
  const field=dialog().querySelector(acceptance?'[aria-label="Acceptance rationale"]':'[aria-label="Closure note"]');
  expect(field).not.toBeNull();expect(field.value).toBe(draft);expect(field.disabled).toBe(false);
  expect(dialog().querySelector('[aria-label="Title"]').disabled).toBe(true);
  expect(button('Save changes').disabled).toBe(true);expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  await click(button('Cancel'));
  expect(dialog().querySelector('[aria-label="Title"]').disabled).toBe(false);
  expect([...dialog().querySelectorAll('.rw-tabs button')].every(node=>!node.disabled)).toBe(true);
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('saved Risk description and native Other source remain editable drafts until native Save changes',async()=>{
  risk.source_type='other';risk.source_other='Recorded source';
  await render();
  const description=dialog().querySelector('[aria-label="Risk description"]'),source=dialog().querySelector('#risk-source-other');
  expect(description.value).toBe(risk.description);expect(source.value).toBe('Recorded source');
  await input(description,'Updated native risk description.');await input(source,'Updated native source.');
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
  await click(button('Save changes'));
  expect(api.patch).toHaveBeenCalledWith('/risks/risk-a',expect.objectContaining({description:'Updated native risk description.',source_other:'Updated native source.',expected_updated_at:'2026-10-01T12:00:00Z'}),expect.any(Object));
});

test.each(['client_viewer','client_contributor'])('restored saved Risk fields preserve native %s field permissions',async role=>{
  mockAuth={...mockAuth,user:{...mockAuth.user,role}};risk.owner_id=mockAuth.user.user_id;
  risk.source_type='other';risk.source_other='Recorded source';await render();
  expect(dialog().querySelector('[aria-label="Risk description"]').disabled).toBe(true);
  expect(dialog().querySelector('[aria-label="Risk source"]').disabled).toBe(true);
  expect(dialog().querySelector('#risk-source-other').disabled).toBe(true);
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});
