import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import ReviewDrawer from '@/components/ReviewDrawer';
import {ClientPresentationContext} from '@/components/ClientSurface';
import api from '@/lib/api';
import {cisClient as mockCisClient} from '@/testUtils/cisExperience';
import {rememberClient} from '@/lib/clientSelection';
import {occurrenceId} from '@/lib/reviewOccurrences';
let mockClient='demo_brawndo';
let mockSearch='';
const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:'demo',loading:false})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>{const client=mockClient==='demo_brawndo'?{...mockCisClient(mockClient),name:'Brawndo'}:{client_id:mockClient,name:'Brawndo',status:'active'};return {currentClientId:mockClient,currentClient:client,clients:[client],loading:false};}}));
// These register assertions retain the legacy table; native drawers still use actual CIS capability.
jest.mock('@/lib/brawndoDemoReviews',()=>({...jest.requireActual('@/lib/brawndoDemoReviews'),brawndoDemoReviewsGate:()=>false}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),put:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/reviews',search:mockSearch}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams(mockSearch))}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>props=>props.open?<div data-testid="opened-record" data-kind={props.kind} data-client-id={props.record?.client_id} data-record-id={props.record?.policy_id||props.record?.review_id}>{props.reviewsPilot?'Pilot':'Original'}</div>:null);
jest.mock('@/components/EvidencePanel',()=>()=> <div>Existing evidence panel</div>);
let root,container,rows,saved;
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
const click=async node=>act(async()=>node.click());
const button=text=>[...container.querySelectorAll('button')].find(b=>b.textContent.includes(text));
const input=async(node,value)=>act(async()=>{
  Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});

// These parent UI fixtures exercise Save/Cancel and lifecycle transport. Native
// template classification and incomplete-result denials have separate, unmocked tests.
const mockCompletionGuide=record=>({
  occurrence_id:occurrenceId(record),template_id:record.risk_id?'risk_rec':'custom',template_version:'r4-parent-ui-fixture',
  contract_token:'a'.repeat(64),expected_updated_at:record.updated_at??null,
  custom:!record.risk_id,native_gate:false,read_only:false,service_context:[],
  steps:record.risk_id?[
    {step_id:'risk_rec:record:1',text:'Confirm the risk is still relevant and its description is accurate'},
    {step_id:'risk_rec:record:2',text:'Re-rate likelihood and impact'},
    {step_id:'risk_rec:record:3',text:'Check progress on the linked treatment actions'},
    {step_id:'risk_rec:record:4',text:'Record an acceptance or closure decision with a named approver, if applicable'},
    {step_id:'risk_rec:record:5',text:'Set the next review date'}
  ]:[],
  results:record.risk_id?[
    {step_id:'risk_rec:record:1',result:'Pass',reason:''},
    {step_id:'risk_rec:record:2',result:'Pass',reason:''},
    {step_id:'risk_rec:record:3',result:'Pass',reason:''},
    {step_id:'risk_rec:record:4',result:'Pass',reason:''},
    {step_id:'risk_rec:record:5',result:'Pass',reason:''}
  ]:[],
  required_support:record.risk_id?['Updated risk record','Rating change','Action status','Approver and date','Next review']:[],
  supporting_reference:record.risk_id?'Synthetic completed Risk review result RISK-UI-001':''
});

test('uncertain Review save remains recoverable after remount without reapplying a new draft',async()=>{
 const original={...saved},close=jest.fn();
 api.patch.mockRejectedValueOnce(new Error('response unconfirmed'));
 await act(async()=>root.render(<ReviewDrawer open record={original} clientId={original.client_id} onOpenChange={close}/>));
 await input(document.querySelector('[data-testid="field-notes"]'),'Original pending save');
 await click(document.querySelector('[data-testid="drawer-save"]'));
 const first=api.patch.mock.calls[0];
 expect(document.body.textContent).toContain('Retry unconfirmed save');
 await act(async()=>root.unmount());root=createRoot(container);
 await act(async()=>root.render(<ReviewDrawer open record={{...original,notes:'Original pending save',updated_at:'new-version'}} clientId={original.client_id} onOpenChange={close}/>));
 await click(document.querySelector('[data-testid="drawer-save"]'));
 expect(api.patch).toHaveBeenCalledTimes(1);
 expect(document.body.textContent).toContain('Retry unconfirmed save');
 await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Retry unconfirmed save'));
 expect(api.patch.mock.calls[1]).toEqual(first);
 expect(document.body.textContent).not.toContain('Retry unconfirmed save');
});

test.each(['cis','iso','both'])('combined non-pilot %s Review keeps Notes through cancel, save and historical discard',async framework=>{
  const drivers=[{framework_key:'cis-ig1',framework_plan_key:require('@/lib/frameworks').cis.review_plans[0].key},{framework_key:'iso-27001',framework_plan_key:'iso-management-review'}];
  saved={...saved,client_id:'synthetic-combined',framework_drivers:framework==='both'?drivers:[drivers[framework==='iso'?1:0]]};
  const close=jest.fn(),old={...saved,occurrence_id:'old',period:'Prior period',status:'completed',notes:'Retained minutes'};
  api.get.mockImplementation(async path=>({data:path.endsWith('/completion-guide')?mockCompletionGuide(saved):path.endsWith('/history')?[old]:path.startsWith('/frameworks/')?{assessments:[]}:path==='/related'?{}:[]}));
  await act(async()=>root.render(<ReviewDrawer open record={saved} clientId={saved.client_id} onOpenChange={close}/>));
  await input(document.querySelector('[data-testid="field-notes"]'),'Unsaved combined Notes');
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Close'));
  expect(document.body.textContent).toContain('Leave unsaved changes?');expect(close).not.toHaveBeenCalled();
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Keep editing'));
  expect(document.querySelector('[data-testid="field-notes"]').value).toBe('Unsaved combined Notes');
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Save changes'));
  expect(api.patch).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({notes:'Unsaved combined Notes'}),expect.objectContaining({headers:{'Idempotency-Key':expect.any(String)}}));
  await input(document.querySelector('[data-testid="field-notes"]'),'Discard this current draft');
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Prior period'));
  expect(document.body.textContent).toContain('Leave unsaved changes?');
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Discard changes'));
  expect(document.querySelector('[data-testid="field-notes"]').value).toBe('Retained minutes');
  expect(document.querySelector('[data-testid="field-notes"]').disabled).toBe(true);
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Back to current Review'));
  expect(document.querySelector('[data-testid="field-notes"]').value).toBe('Unsaved combined Notes');
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Close'));
  expect(close).toHaveBeenCalledWith(false);
});
beforeEach(()=>{
  sessionStorage.clear();localStorage.clear();rememberClient('demo_brawndo');
  jest.useFakeTimers({now:new Date('2026-10-03T00:30:00Z'),doNotFake:['setTimeout','clearTimeout','setInterval','clearInterval','setImmediate','clearImmediate','nextTick','queueMicrotask','performance']});
  global.IS_REACT_ACT_ENVIRONMENT=true;mockClient='demo_brawndo';mockSearch='';
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  const today=new Date(),due=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  rows=[
    {review_id:'late',client_id:mockClient,title:'Late active review',review_type:'access',status:'in_progress',due_date:'2020-01-01',recurrence:'quarterly',owner_id:'u'},
    {review_id:'today',client_id:mockClient,title:'Due today',review_type:'access',status:'upcoming',due_date:due,recurrence:'none'},
    {review_id:'unscheduled',client_id:mockClient,title:'Schedule me',review_type:'backup',status:'needs_scheduling',recurrence:'none'},
    {review_id:'closed',client_id:mockClient,title:'Completed review',review_type:'access',status:'completed',due_date:'2020-01-01',recurrence:'none'},
  ];
  saved={...rows[0],notes:'Recorded narrative',policy_id:'p'};
  api.get.mockImplementation(async path=>({data:path.endsWith('/completion-guide')?mockCompletionGuide(saved):path==='/reviews'?rows:path==='/policies'?[{policy_id:'p',client_id:'demo_brawndo',title:'Access Control Policy'}]:path==='/related'?{}:[]}));
  api.patch.mockImplementation(async(path,patch)=>{saved={...saved,...patch};return {data:saved};});
  window.confirm=jest.fn(()=>false);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();jest.useRealTimers();});
test.each(['demo_brawndo','demo_dunder','demo_prestige','new-client'])('%s shares Dunder summaries, columns and filters while preserving history and client scope',async clientId=>{
  mockClient=clientId;rows=rows.map(r=>({...r,client_id:clientId}));
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('.page-title').textContent).toBe('Reviews');
  expect(container.querySelector('.brawndo-reviews')).toBeNull();
  expect(container.querySelectorAll('thead th')).toHaveLength(10);
  expect(container.querySelector('th[data-column="basis"]').textContent).toContain('Basis');
  expect(container.querySelector('th[data-column="owner_id"]').textContent).toContain('Owner');
  const tab=id=>container.querySelector(`[data-testid="reviews-tab-${id}"]`);
  const count=()=>container.querySelectorAll('tr[data-testid^="reviews-row-"]').length;
  expect(tab('all').textContent).toBe('All3');
  expect(tab('overdue').textContent).toBe('Overdue1');
  expect(tab('due30').textContent).toBe('Due in 30 days1');
  expect(tab('upcoming').textContent).toBe('Due in 90 days1');
  expect(container.querySelector('.register-signals')).toBeNull();
  // Open work is the default; closed reviews live behind history.
  expect(count()).toBe(3);
  expect(tab('all').getAttribute('aria-pressed')).toBe('true');
  await click(tab('due30'));
  expect(count()).toBe(1);
  expect(container.querySelector('[data-testid="reviews-row-0"]').textContent).toContain('Due today');
  expect(tab('all').getAttribute('aria-pressed')).toBe('false');
  await click(tab('overdue'));
  expect(count()).toBe(1);

  expect(tab('overdue').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('[data-testid="reviews-status-0"]').textContent).toBe('overdue');
  await input(container.querySelector('[data-testid="reviews-search"]'),'no match');
  expect(tab('all').textContent).toBe('All3');
  await click(button('Clear filters'));
  expect(count()).toBe(3);
  await click(tab('mine'));
  expect(count()).toBe(0);
  await click(tab('all'));
  expect(count()).toBe(3);
  await click(button('Review History'));
  expect(count()).toBe(1);
  expect(container.querySelector('[data-testid="reviews-row-0"]').textContent).toContain('Completed review');
  await click(button('Back to active Reviews'));
  await click(tab('all'));
  rows=rows.map(r=>({...r,client_id:'different-client'}));mockClient='different-client';
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('.page-title').textContent).toBe('Reviews');
  expect(count()).toBe(3);
  expect(container.querySelector('.register-signals [aria-pressed="true"]')).toBeNull();
});

test('removed recent-completion indicator preserves its existing bookmarked filter',async()=>{
  mockSearch='?signal=recent';
  const completed_at=new Date().toISOString();
  rows=rows.map(r=>['late','closed'].includes(r.review_id)?{...r,occurrences:[{completed_at}]}:r);
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('.register-signals')).toBeNull();
  const shown=[...container.querySelectorAll('tr[data-testid^="reviews-row-"]')].map(r=>r.textContent);
  expect(shown).toHaveLength(2);
  expect(shown.join(' ')).toContain('Late active review');
  expect(shown.join(' ')).toContain('Completed review');
  await click(container.querySelector('[data-testid="reviews-tab-all"]'));
  expect(container.querySelectorAll('tr[data-testid^="reviews-row-"]')).toHaveLength(3);
});

test.each([['upcoming',1,'Due today'],['unassigned',2,'Schedule me'],['history',1,'Completed review'],['mine',0,'']])('bookmarked %s view opens the equivalent shared filter',async(view,count,title)=>{
  mockSearch=`?reviewView=${view}`;
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelectorAll('tr[data-testid^="reviews-row-"]')).toHaveLength(count);
  if(title)expect(container.querySelector('tbody').textContent).toContain(title);
  await click(container.querySelector('[data-testid="reviews-tab-all"]'));
  expect(container.querySelectorAll('tr[data-testid^="reviews-row-"]')).toHaveLength(3);
});

test('mixed-client Review responses are rejected and Retry restores scoped native counts',async()=>{
  rows.push({...rows[0],client_id:'other-client',review_id:'foreign',title:'Another client review'});
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  const error=container.querySelector('[data-testid="register-load-error"]');
  expect(error?.textContent).toContain('Records could not be verified for this client.');
  expect(container.querySelectorAll('[data-testid^="reviews-row-"]')).toHaveLength(0);
  expect(container.querySelector('[data-testid="export-reviews-button"]').disabled).toBe(true);
  expect(container.textContent).not.toContain('Another client review');
  expect(api.post).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
  rows=rows.filter(row=>row.client_id===mockClient);
  await click(error.querySelector('button'));
  expect(container.querySelector('[data-testid="register-load-error"]')).toBeNull();
  expect(container.querySelector('[data-testid="reviews-tab-overdue"]').textContent).toBe('Overdue1');
  expect(container.querySelector('[data-testid="reviews-tab-all"]').textContent).toBe('All3');
  expect(container.textContent).not.toContain('Another client review');
});

test('the completed status column filter opens historical records instead of intersecting the open tab',async()=>{
  rows.push({...rows[3],review_id:'cancelled',status:'cancelled',title:'Cancelled review'});
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  const status=container.querySelector('[aria-label="Status: sort and filter"]');
  await act(async()=>status.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  const completed=[...document.querySelectorAll('[role="menuitemcheckbox"]')].find(item=>item.textContent==='Completed');
  expect(completed).toBeTruthy();
  await click(completed);
  expect(container.querySelectorAll('tr[data-testid^="reviews-row-"]')).toHaveLength(1);
  expect(container.querySelector('[data-testid="reviews-row-0"]').textContent).toContain('Completed review');
  expect(container.querySelector('.register-count').textContent).toBe('1 / 5');
  await click(container.querySelector('[data-testid="reviews-tab-all"]'));
  expect(container.querySelectorAll('tr[data-testid^="reviews-row-"]')).toHaveLength(3);
});
test('default client surface shares the global Review presentation and preserves the stored policy identity',async()=>{
  mockClient='future-client';saved={...saved,client_id:mockClient};
  const load=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,...args)=>path==='/policies'?{data:[
    {policy_id:'p',client_id:mockClient,title:'Stored future-client policy'},
    {policy_id:'p',client_id:'foreign',title:'Foreign policy with the same identifier'},
    {policy_id:'unlinked',client_id:mockClient,title:'Unlinked same-client policy'}
  ]}:load(path,...args));
  await act(async()=>root.render(<ClientPresentationContext.Provider value="Future client"><ReviewDrawer open record={saved} clientId={mockClient} onOpenChange={()=>{}}/></ClientPresentationContext.Provider>));
  const dialog=document.querySelector('[data-testid="reviews-drawer"]');
  expect(dialog.className).toContain('brawndo-cis-assessment');
  expect(dialog.querySelector('[aria-label="Requirement basis"]')).toBeNull();
  await click(dialog.querySelector('[data-testid="tab-requirements"]'));
  expect(dialog.querySelector('[aria-label="Requirement & Review Expectations"]')).not.toBeNull();
  expect(dialog.textContent).toContain('Stored future-client policy');
  expect(dialog.textContent).not.toContain('Foreign policy with the same identifier');
  expect(dialog.textContent).not.toContain('Unlinked same-client policy');
  expect(dialog.querySelector('details')).toBeNull();
  await click(dialog.querySelector('[data-testid="tab-overview"]'));
  expect(dialog.querySelector('[data-testid="field-policy_id"]')).toBeNull();
  expect(dialog.querySelector('h2').getAttribute('tabindex')).toBe('-1');
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  await click(dialog.querySelector('[data-testid="tab-requirements"]'));
  await click([...dialog.querySelectorAll('button')].find(node=>node.textContent==='Stored future-client policy'));
  const opened=document.querySelector('[data-testid="opened-record"]');
  expect(opened.dataset.kind).toBe('policies');expect(opened.dataset.clientId).toBe(mockClient);expect(opened.dataset.recordId).toBe('p');
  expect(saved.policy_id).toBe('p');expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('centered detail preserves policy/context and guards unsaved and failed saves',async()=>{
  const close=jest.fn();
  await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId="demo_brawndo" onOpenChange={close}/>));
  const dialog=document.querySelector('[data-testid="reviews-drawer"]');
  expect(dialog.className).toContain('brawndo-cis-assessment');
  expect(dialog.textContent).toContain('Assigned reviewer');
  expect(dialog.textContent).not.toContain('Access Control Policy');
  await click(dialog.querySelector('[data-testid="tab-requirements"]'));
  expect(dialog.textContent).toContain('Access Control Policy');
  expect(dialog.querySelector('details')).toBeNull();
  await click(dialog.querySelector('[data-testid="tab-overview"]'));
  expect(dialog.querySelector('[data-testid="field-policy_id"]')).toBeNull();
  expect(dialog.querySelector('[aria-label="Requirement basis"]')).toBeNull();
  const notes=dialog.querySelector('[data-testid="field-notes"]');
  await input(notes,'Updated narrative');
  await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Close'));
  expect(document.querySelector('[role="alertdialog"]').textContent).toContain('Leave unsaved changes?');expect(close).not.toHaveBeenCalled();
  await click([...document.querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent==='Keep editing'));
  api.patch.mockRejectedValueOnce(new Error('Write failed'));
  await click(dialog.querySelector('[data-testid="drawer-save"]'));
  expect(notes.value).toBe('Updated narrative');expect(close).not.toHaveBeenCalled();
  await click(dialog.querySelector('[data-testid="drawer-save"]'));
  expect(api.patch).toHaveBeenCalledTimes(1);
  await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Retry unconfirmed save'));
  expect(saved.notes).toBe('Updated narrative');
  expect(api.patch.mock.calls[1][2]).toEqual(api.patch.mock.calls[0][2]);
  expect(api.patch.mock.calls[1][1]).toEqual(expect.objectContaining({expected_occurrence_id:'occ_late',notes:'Updated narrative'}));
  window.confirm.mockClear();
  await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Close'));
  expect(window.confirm).not.toHaveBeenCalled();expect(close).toHaveBeenCalledWith(false);
});
test('another client retains its original Review workflow inside the shared presentation',async()=>{
  const record={...saved,client_id:'demo_dunder'};
  await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={record} clientId="demo_dunder" onOpenChange={()=>{}}/>));
  expect(document.querySelector('[data-testid="reviews-drawer"]').className).toContain('brawndo-cis-assessment');
  await click(document.querySelector('[data-testid="tab-requirements"]'));
  expect(document.querySelector('[aria-label="Requirement basis"]')).toBeTruthy();
  expect(document.querySelector('[aria-label="Requirement & Review Expectations"]')).toBeNull();
});
test('unfinished comments cannot be lost by completing an occurrence',async()=>{
  await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
  await click(document.querySelector('[data-testid="tab-comments"]'));
  await input(document.querySelector('[data-testid="comment-input"]'),'Unposted operator note');
  await click(document.querySelector('[data-testid="tab-overview"]'));
  await click(document.querySelector('[data-testid="review-complete"]'));
  expect(api.post).not.toHaveBeenCalled();
  await click(document.querySelector('[data-testid="tab-comments"]'));
  expect(document.querySelector('[data-testid="comment-input"]').value).toBe('Unposted operator note');
});

test('Requirements edits retain the Overview draft and save without changing the configured cadence',async()=>{
  await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
  await input(document.querySelector('[data-testid="field-notes"]'),'Retained Overview draft');
  await click(document.querySelector('[data-testid="tab-requirements"]'));
  expect(document.querySelector('[data-testid="tab-overview"]').nextElementSibling.textContent).toBe('Requirement');
  expect(document.querySelector('[data-testid="reviews-drawer"] details')).toBeNull();
  await input(document.querySelector('[aria-label="Review expectation"]'),'Organization-entered expectation draft');
  await click(document.querySelector('[data-testid="tab-overview"]'));
  expect(document.querySelector('[data-testid="field-notes"]').value).toBe('Retained Overview draft');
  await click(document.querySelector('[data-testid="tab-requirements"]'));
  expect(document.querySelector('[aria-label="Review expectation"]').value).toBe('Organization-entered expectation draft');
  await click(document.querySelector('[data-testid="drawer-save"]'));
  expect(api.patch.mock.calls[0][1]).toEqual(expect.objectContaining({notes:'Retained Overview draft',governance_context:{rationale:'Organization-entered expectation draft'},expected_occurrence_id:'occ_late'}));
  expect(api.patch.mock.calls[0][1]).not.toHaveProperty('recurrence');
});

test('Assigned to Me uses the current user assignment and excludes history',async()=>{
  rows=rows.map(r=>['late','closed'].includes(r.review_id)?{...r,owner_id:mockUser.user_id}:r);
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  await click(container.querySelector('[data-testid="reviews-tab-mine"]'));
  const shown=[...container.querySelectorAll('tr[data-testid^="reviews-row-"]')].map(r=>r.textContent);
  expect(shown).toHaveLength(1);expect(shown[0]).toContain('Late active review');
  expect(container.querySelector('[data-testid="reviews-tab-mine"]').textContent).toContain('Assigned to Me');
});

test.each([['normal-client',false,'in_progress','In Progress'],['normal-client',false,'open','Upcoming'],['demo_brawndo',true,'in_progress','In Progress']])('%s shared summary separates execution status from overdue dates for opener %s',async(clientId,pilot,status,label)=>{
  mockClient=clientId;saved={...saved,client_id:clientId,status,due_date:status==='open'?'2099-01-01':'2020-01-01'};
  const expectedDue=saved.due_date;
  await act(async()=>root.render(<ReviewDrawer open reviewsPilot={pilot} record={saved} clientId={clientId} onOpenChange={()=>{}}/>));
  if(pilot){
    expect(document.querySelector('[aria-label="Review execution status"] button').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[aria-label="Review occurrence"] [role="note"]').textContent).toBe('Overdue and in progress');
    expect(document.querySelector('[aria-label="Review occurrence"]').textContent).toContain('Due Jan 1, 2020');
  }else{
    const details=document.querySelector('[aria-label="Review details"]');
    const summary=[...details.querySelectorAll('dl > div')].find(row=>row.querySelector('dt').textContent==='Status');
    expect(summary.querySelector('dd').textContent.toLowerCase()).toBe(label.toLowerCase());
    const due=[...details.querySelectorAll('dl > div')].find(row=>row.querySelector('dt').textContent==='Due Date');
    expect(due.textContent).toContain('Jan 1');
    if(status==='in_progress')expect(details.querySelector('[role="note"]').textContent).toBe('This Review is overdue and in progress.');
    else expect(details.querySelector('[role="note"]')).toBeNull();
  }
  expect(document.querySelector('[data-testid="field-due_date"]').value).toBe(expectedDue);
  expect(saved.status).toBe(status);expect(saved.due_date).toBe(expectedDue);
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test.each([false,true])('normal-client %s existing Review retains drafts and requires explicit discard on close',async existing=>{
  mockClient='normal-client';saved={...saved,client_id:mockClient,framework_key:undefined,framework_drivers:undefined};const close=jest.fn();
  await act(async()=>root.render(<ReviewDrawer open record={existing?saved:null} clientId={mockClient} onOpenChange={close}/>));
  await input(document.querySelector('[data-testid="field-notes"]'),'Normal Review draft');
  await click(document.querySelector('[data-testid="tab-requirements"]'));
  await click(document.querySelector('[data-testid="tab-overview"]'));
  const closeButton=()=>[...document.querySelectorAll('[data-testid="reviews-drawer"] button')].find(b=>b.textContent==='Close');
  await click(closeButton());
  expect(document.querySelector('[role="alertdialog"]')).toBeTruthy();expect(close).not.toHaveBeenCalled();
  await click([...document.querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent==='Keep editing'));
  expect(document.querySelector('[data-testid="field-notes"]').value).toBe('Normal Review draft');
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();expect(close).not.toHaveBeenCalled();
  await click(closeButton());
  await click([...document.querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent==='Discard changes'));
  expect(close).toHaveBeenCalledWith(false);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('new pilot reviews do not wait for nonexistent requirement relationships',async()=>{
  await act(async()=>root.render(<ReviewDrawer open reviewsPilot clientId="demo_brawndo" onOpenChange={()=>{}}/>));
  const dialog=document.querySelector('[data-testid="reviews-drawer"]');
  expect(dialog.textContent).not.toContain('Loading linked requirements');
  await click(dialog.querySelector('[data-testid="tab-requirements"]'));
  expect(dialog.textContent).toContain('Requirement source not documented');
});

test('legacy non-CIS optional Review evaluation is protected as a draft and sent only on completion',async()=>{
 // The approved CIS editor intentionally keeps legacy evaluation fields out of Overview.
 mockClient='demo_prestige';saved={...saved,client_id:mockClient};rememberClient(mockClient);
 const close=jest.fn();
 api.post.mockResolvedValue({data:{review:{...saved,status:'completed'},occurrence:{occurrence_id:'done'}}});
 await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId={mockClient} onOpenChange={close}/>));
 await click([...document.querySelectorAll('summary')].find(s=>s.textContent==='Review evaluation'));
 await input(document.querySelector('[aria-label="Reviewer conclusion"]'),'Operating gap remains despite completed activity');
 await input(document.querySelector('[aria-label="Scope examined"]'),'Client and provider responsibilities');
 await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Close'));
 expect(document.body.textContent).toContain('Leave unsaved changes?');expect(close).not.toHaveBeenCalled();
 await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Keep editing'));
 await click(document.querySelector('[data-testid="review-complete"]'));
 await click(document.querySelector('[data-testid="review-complete-confirmed"]'));
 expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/complete$/),expect.objectContaining({conclusion:'Operating gap remains despite completed activity',tested_scope:'Client and provider responsibilities'}));
});

test('normal ISO management Review shows guide beside existing fields and protects Notes drafts without widening shared behavior',async()=>{
 mockClient='normal-iso';saved={...saved,client_id:mockClient,framework_key:'iso-27001',framework_plan_key:'iso-management-review',review_type:'management',notes:'Leadership agenda v1'};const close=jest.fn();
 await act(async()=>root.render(<ReviewDrawer open record={saved} clientId={mockClient} onOpenChange={close}/>));
 expect(document.querySelector('[data-testid="iso-management-review-guide"]')).toBeNull();
 await click(document.querySelector('[data-testid="tab-requirements"]'));
 expect(document.querySelector('[data-testid="iso-management-review-guide"]')).toBeTruthy();
 expect(document.querySelector('details')).toBeNull();
 await click(document.querySelector('[data-testid="tab-overview"]'));
 const notes=document.querySelector('[data-testid="field-notes"]');
 await input(notes,'Unfinished leadership decisions');
 await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Close'));
 expect(document.body.textContent).toContain('Leave unsaved changes?');expect(close).not.toHaveBeenCalled();
 await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Keep editing'));
 expect(document.querySelector('[data-testid="field-notes"]').value).toBe('Unfinished leadership decisions');
 expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('ISO historical management results remain read-only with separately labelled current guidance and Annex-only SoA scope',async()=>{
 mockClient='normal-iso';saved={...saved,client_id:mockClient,framework_key:'iso-27001',framework_plan_key:'iso-management-review',review_type:'management',notes:'Current agenda v2'};
 const historical={...saved,occurrence_id:'past-iso',notes:'Retained leadership minutes v1',conclusion:'Retained decision v1',status:'completed',iso_soa_snapshot:{captured_at:'2026-10-01',assessments:[]}};
 await act(async()=>root.render(<ReviewDrawer open record={saved} clientId={mockClient} initialValues={{occurrence:historical}} onOpenChange={()=>{}}/>));
 expect(document.querySelector('[data-testid="field-notes"]').value).toBe('Retained leadership minutes v1');
 expect(document.querySelector('[data-testid="field-notes"]').disabled).toBe(true);
 await click(document.querySelector('[data-testid="tab-requirements"]'));
 expect(document.body.textContent).toContain('does not replace the retained historical conclusions');
 await click(document.querySelector('[data-testid="tab-overview"]'));
 expect(document.body.textContent).toContain('Retained decision v1');
 expect(document.body.textContent).toContain('Annex A SoA snapshot captured at completion');
 expect(document.body.textContent).toContain('outside this snapshot');
 expect(historical.conclusion).toBe('Retained decision v1');expect(api.patch).not.toHaveBeenCalled();
});

test.each(['demo_prestige','new-client'])('evaluation survives Save changes and tab navigation, and closure stays guarded for %s',async clientId=>{
 mockClient=clientId;saved={...saved,client_id:clientId};const close=jest.fn();
 await act(async()=>root.render(<ReviewDrawer open reviewsPilot={clientId==='demo_prestige'} record={saved} clientId={clientId} onOpenChange={close}/>));
 await click([...document.querySelectorAll('summary')].find(s=>s.textContent==='Review evaluation'));
 await input(document.querySelector('[aria-label="Reviewer conclusion"]'),'Pending effectiveness judgment');
 await input(document.querySelector('[data-testid="field-notes"]'),'Saved Notes, unfinished evaluation');
 await click(document.querySelector('[data-testid="drawer-save"]'));
 expect(api.patch).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({notes:'Saved Notes, unfinished evaluation'}),expect.objectContaining({headers:{'Idempotency-Key':expect.any(String)}}));
 expect(api.patch.mock.calls[0][1]).not.toHaveProperty('conclusion');
 expect(document.querySelector('[aria-label="Reviewer conclusion"]').value).toBe('Pending effectiveness judgment');
 await click(document.querySelector('[data-testid="tab-related"]'));
 await click(document.querySelector('[data-testid="tab-overview"]'));
 expect(document.querySelector('[aria-label="Reviewer conclusion"]').value).toBe('Pending effectiveness judgment');
 await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Close'));
 expect(document.body.textContent).toContain('Leave unsaved changes?');expect(close).not.toHaveBeenCalled();
});

test('Risk review completion is confirmed first and sends only changed assessment fields',async()=>{
 saved={...saved,risk_id:'risk'};
 api.get.mockImplementation(async path=>({data:path.endsWith('/completion-guide')?mockCompletionGuide(saved):path==='/related'?{risks:[{risk_id:'risk',client_id:'demo_brawndo',likelihood_score:3,impact_score:4}]}:[]}));
 api.post.mockResolvedValue({data:{review:saved,occurrence:{occurrence_id:'done'}}});
 await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
 const next=[...document.querySelectorAll('[aria-label="Review occurrence"] > div')].find(row=>row.textContent.includes('Next review after this'));
 expect(next.querySelector('strong').textContent).toBe('Apr 1, 2020');
 expect(next.textContent).not.toMatch(/Calculated/);
 await click(document.querySelector('[data-testid="review-complete"]'));
 expect(api.post).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Complete this review?');
 await click(document.querySelector('[data-testid="review-complete-confirmed"]'));
 expect(api.post.mock.calls[0][1].risk_assessment).toEqual({});
});

test('the actual parent reloads the Guide safely after current to history to current navigation',async()=>{
 const old={...saved,occurrence_id:'retained-old',period:'Prior period',status:'completed',notes:'Retained historical notes',checklist_outcome:'No exceptions noted'};
 const load=api.get.getMockImplementation();
 api.get.mockImplementation(async(path,...args)=>path.endsWith('/history')?{data:[old]}:load(path,...args));
 await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId={saved.client_id} onOpenChange={()=>{}}/>));
 expect(document.querySelector('[aria-label="Review guide"]')).not.toBeNull();
 expect(document.body.textContent).not.toContain('The checklist is unavailable');
 await click([...document.querySelectorAll('button')].find(node=>node.textContent==='Prior period'));
 expect(document.querySelector('[aria-label="Review guide"]')).toBeNull();
 expect(document.querySelector('[aria-label="Retained completion record"]').textContent).toContain('No exceptions noted');
 expect(document.querySelector('[data-testid="field-notes"]').disabled).toBe(true);
 await click([...document.querySelectorAll('button')].find(node=>node.textContent==='Back to current Review'));
 expect(document.querySelector('[aria-label="Review guide"]')).not.toBeNull();
 expect(document.body.textContent).not.toContain('The checklist is unavailable');
 expect(document.querySelector('[data-testid="field-notes"]').value).toBe('Recorded narrative');
 expect(api.get.mock.calls.filter(([path])=>path.endsWith('/completion-guide'))).toHaveLength(2);
 expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});


test('checklist and support drafts survive actual Drawer tabs and explicit Cancel without an implicit save',async()=>{
 saved={...saved,risk_id:'risk'};const close=jest.fn();
 await act(async()=>root.render(<ReviewDrawer open record={saved} clientId={saved.client_id} onOpenChange={close}/>));
 const panel=()=>document.querySelector('[aria-label="Review guide"]');
 const first=()=>panel().querySelector('fieldset');
 const reference=()=>[...panel().querySelectorAll('label')].find(node=>node.textContent.startsWith('Supporting result reference')).querySelector('textarea');
 await click(first().querySelectorAll('input[type="radio"]')[1]);
 await input(first().querySelector('textarea'),'Synthetic exception still being investigated');
 await input(reference(),'Unsaved result reference DRAFT-OVERVIEW-001');
 await click(document.querySelector('[data-testid="tab-evidence"]'));
 expect(document.querySelector('[data-testid="tab-evidence"]').getAttribute('aria-pressed')).toBe('true');
 if(panel())expect(panel().closest('[hidden]')).not.toBeNull();
 await click(document.querySelector('[data-testid="tab-overview"]'));
 expect(first().querySelectorAll('input[type="radio"]')[1].checked).toBe(true);
 expect(first().querySelector('textarea').value).toBe('Synthetic exception still being investigated');
 expect(reference().value).toBe('Unsaved result reference DRAFT-OVERVIEW-001');
 expect(api.get.mock.calls.filter(([path])=>path.endsWith('/completion-guide'))).toHaveLength(1);
 await click([...document.querySelectorAll('button')].find(node=>node.textContent==='Close'));
 expect(document.body.textContent).toContain('Leave unsaved changes?');expect(close).not.toHaveBeenCalled();
 await click([...document.querySelectorAll('button')].find(node=>node.textContent==='Keep editing'));
 expect(reference().value).toBe('Unsaved result reference DRAFT-OVERVIEW-001');
 await click([...document.querySelectorAll('button')].find(node=>node.textContent==='Close'));
 await click([...document.querySelectorAll('button')].find(node=>node.textContent==='Discard changes'));
 expect(close).toHaveBeenCalledWith(false);
 expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('an uncertain checklist retries exact A, retains newer B dirty, and saves B only by a later explicit command',async()=>{
 saved={...saved,risk_id:'risk'};const close=jest.fn(),initial=mockCompletionGuide(saved);
 const savedA={...initial,expected_updated_at:'2026-10-03T00:31:00Z',supporting_reference:'Synthetic checkpoint A'};
 api.put.mockReset();api.put.mockRejectedValueOnce(new Error('Synthetic response lost')).mockResolvedValueOnce({data:savedA});
 await act(async()=>root.render(<ReviewDrawer open record={saved} clientId={saved.client_id} onOpenChange={close}/>));
 const panel=()=>document.querySelector('[aria-label="Review guide"]');
 const first=()=>panel().querySelector('fieldset');
 const reference=()=>[...panel().querySelectorAll('label')].find(node=>node.textContent.startsWith('Supporting result reference')).querySelector('textarea');
 const checkpoint=()=>[...panel().querySelectorAll('button')].find(node=>/checklist (progress|save)/.test(node.textContent));
 await input(reference(),'Synthetic checkpoint A');
 await click(checkpoint());
 expect(checkpoint().textContent).toBe('Retry unconfirmed checklist save');
 const requestA=JSON.parse(JSON.stringify(api.put.mock.calls[0]));
 expect(requestA[1].supporting_reference).toBe('Synthetic checkpoint A');
 expect(requestA[1].checklist.results).toEqual(initial.results);
 expect(reference().disabled).toBe(false);
 await click(first().querySelectorAll('input[type="radio"]')[1]);
 await input(first().querySelector('textarea'),'Newer local exception B');
 await input(reference(),'Synthetic local draft B');
 await click(checkpoint());
 expect(api.put).toHaveBeenCalledTimes(2);expect(api.put.mock.calls[1]).toEqual(requestA);
 expect(first().querySelectorAll('input[type="radio"]')[1].checked).toBe(true);
 expect(first().querySelector('textarea').value).toBe('Newer local exception B');
 expect(reference().value).toBe('Synthetic local draft B');
 expect(checkpoint().textContent).toBe('Save checklist progress');
 await click([...document.querySelectorAll('button')].find(node=>node.textContent==='Close'));
 expect(document.body.textContent).toContain('Leave unsaved changes?');expect(close).not.toHaveBeenCalled();
 await click([...document.querySelectorAll('button')].find(node=>node.textContent==='Keep editing'));
 expect(api.put).toHaveBeenCalledTimes(2);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
 const resultsB=[...initial.results.slice(1),{step_id:'risk_rec:record:1',result:'Exception',reason:'Newer local exception B'}];
 api.put.mockResolvedValueOnce({data:{...savedA,expected_updated_at:'2026-10-03T00:32:00Z',results:resultsB,supporting_reference:'Synthetic local draft B'}});
 await click(checkpoint());
 expect(api.put).toHaveBeenCalledTimes(3);
 expect(api.put.mock.calls[2][1]).toEqual({occurrence_id:initial.occurrence_id,expected_updated_at:savedA.expected_updated_at,
   checklist:{contract_token:initial.contract_token,results:resultsB},supporting_reference:'Synthetic local draft B'});
 expect(api.put.mock.calls[2][2].headers['Idempotency-Key']).not.toBe(requestA[2].headers['Idempotency-Key']);
});

test('accepted completion recovery posts exactly the retained server request despite newer Guide and evaluation drafts',async()=>{
 mockClient='demo_prestige';saved={...saved,client_id:mockClient,policy_id:null,baseline_key:'policy-review',review_type:'policy',recurrence:'annual',updated_at:'2026-10-02T15:01:00Z'};rememberClient(mockClient);
 const policySteps=[
   {step_id:'policy:always:1',text:'Review each policy for changes in practice or requirements'},
   {step_id:'policy:always:2',text:'Record approvals and new version numbers'},
   {step_id:'policy:always:3',text:'Confirm documentation is retained for the period the framework requires (HIPAA: six years)'},
   {step_id:'policy:client:1',text:'Client approves updated policies'}
 ];
 const acceptedRequest=Object.freeze({
   occurrence_id:occurrenceId(saved),expected_updated_at:'2026-10-02T14:59:00Z',
   checklist:{contract_token:'b'.repeat(64),results:[
     {step_id:'policy:always:1',result:'Pass',reason:''},
     {step_id:'policy:always:2',result:'Pass',reason:''},
     {step_id:'policy:always:3',result:'Pass',reason:''},
     {step_id:'policy:client:1',result:'Pass',reason:''}
   ]},
   supporting_reference:'Synthetic accepted annual policy result POLICY-RECOVERY-001',outcome:'No exceptions noted',
   conclusion:'Original accepted conclusion',tested_scope:'Original accepted scope'
 });
 const expectedRequest=JSON.parse(JSON.stringify(acceptedRequest));
 const guide={...mockCompletionGuide(saved),template_id:'policy',custom:false,steps:policySteps,
   service_context:[{area_id:'governance',name:'Governance',responsibility_label:'Not set',tools:[]}],
   required_support:['Review notes','Approved versions','Retention location','Approval'],
   supporting_reference:'New current Guide reference must not replace acceptance',
   accepted_completion_retry:{request:acceptedRequest,completed_at:'2026-10-02T15:00:00Z',completed_by:'original-worker'}};
 const load=api.get.getMockImplementation();
 api.get.mockImplementation(async(path,...args)=>path.endsWith('/completion-guide')?{data:guide}:load(path,...args));
 api.post.mockResolvedValue({data:{review:{...saved,status:'completed'},occurrence:{occurrence_id:occurrenceId(saved)}}});
 await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId={mockClient} onOpenChange={()=>{}}/>));
 expect(document.querySelector('[aria-label="Accepted completion awaiting recovery"]').textContent).toContain('Synthetic accepted annual policy result POLICY-RECOVERY-001');
 await click([...document.querySelectorAll('summary')].find(node=>node.textContent==='Review evaluation'));
 await input(document.querySelector('[aria-label="Reviewer conclusion"]'),'New unsaved evaluation must not replace acceptance');
 await input(document.querySelector('[aria-label="Scope examined"]'),'New unsaved scope');
 expect(document.querySelector('[data-testid="review-complete"]').textContent).toContain('Retry accepted completion');
 await click(document.querySelector('[data-testid="review-complete"]'));
 await click(document.querySelector('[data-testid="review-complete-confirmed"]'));
 expect(api.post).toHaveBeenCalledTimes(1);
 expect(api.post.mock.calls[0]).toEqual([`/reviews/${saved.review_id}/complete`,expectedRequest]);
 expect(acceptedRequest).toEqual(expectedRequest);
 expect(api.post.mock.calls[0][1]).not.toHaveProperty('risk_assessment');
 expect(api.patch).not.toHaveBeenCalled();
});

test('cancelling the completion confirmation saves nothing and keeps the Review open',async()=>{
 api.post.mockResolvedValue({data:{review:saved,occurrence:{occurrence_id:'done'}}});
 await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
 await click(document.querySelector('[data-testid="review-complete"]'));
 expect(document.querySelector('[data-testid="review-complete-confirm"]').textContent).toContain('This will close the current occurrence and schedule the next review according to its existing cadence.');
 await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel'));
 expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
 expect(document.querySelector('[data-testid="review-complete-confirm"]')).toBeNull();
});

test('a proven rejected Finding can be corrected with a new command identity',async()=>{
 api.post.mockReset();
 api.post.mockRejectedValueOnce({message:'Finding title is too long',response:{status:422,headers:{'x-create-rejected':'true'}}}).mockResolvedValue({data:{finding_id:'saved'}});
 await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
 await click(document.querySelector('[data-testid="quick-create-finding"]'));
 await input(document.querySelector('[data-testid="finding-title"]'),'x'.repeat(1001));
 await input(document.querySelector('[data-testid="finding-remediation-title"]'),'Correct the gap');
 await click(document.querySelector('[data-testid="finding-save"]'));
 const original=api.post.mock.calls[0];
 expect(document.querySelector('[data-testid="finding-title"]').value).toBe('x'.repeat(1001));
 await input(document.querySelector('[data-testid="finding-title"]'),'Corrected title');
 await click(document.querySelector('[data-testid="finding-save"]'));
 expect(api.post).toHaveBeenCalledTimes(2);
 expect(api.post.mock.calls[1][1].title).toBe('Corrected title');
 expect(api.post.mock.calls[1][1].request_id).not.toBe(original[1].request_id);
 expect(document.querySelector('[data-testid="review-finding-form"]')).toBeNull();
});

test('an uncertain Finding failure retains its identity and original draft for retry',async()=>{
 api.post.mockReset();
 api.post.mockRejectedValueOnce({message:'Response lost',response:{status:503,headers:{}}}).mockResolvedValue({data:{finding_id:'saved'}});
 await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
 await click(document.querySelector('[data-testid="quick-create-finding"]'));
 await input(document.querySelector('[data-testid="finding-title"]'),'Original title');
 await input(document.querySelector('[data-testid="finding-remediation-title"]'),'Correct the gap');
 await click(document.querySelector('[data-testid="finding-save"]'));
 const original=api.post.mock.calls[0];
 await input(document.querySelector('[data-testid="finding-title"]'),'Changed before confirmation');
 await click(document.querySelector('[data-testid="finding-save"]'));
 expect(api.post).toHaveBeenCalledTimes(1);
 await input(document.querySelector('[data-testid="finding-title"]'),'Original title');
 await click(document.querySelector('[data-testid="finding-save"]'));
 expect(api.post).toHaveBeenCalledTimes(2);
 expect(api.post.mock.calls[1]).toEqual(original);
 expect(document.querySelector('[data-testid="review-finding-form"]')).toBeNull();
});


test('Requirement policy link uses the stored identity and rejects a foreign client policy',async()=>{
 const load=api.get.getMockImplementation();
 api.get.mockImplementation(async(path,...args)=>path==='/policies'?{data:[{policy_id:'p',client_id:'foreign',title:'Foreign policy must not appear'},{policy_id:'different',client_id:'demo_brawndo',title:'Unlinked policy must not appear'}]}:load(path,...args));
 await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
 await click(document.querySelector('[data-testid="tab-requirements"]'));
 expect(document.body.textContent).not.toContain('Foreign policy must not appear');
 expect(document.body.textContent).not.toContain('Unlinked policy must not appear');
 expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
