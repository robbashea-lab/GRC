import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import ReviewDrawer from '@/components/ReviewDrawer';
import {ClientPresentationContext} from '@/components/ClientSurface';
import api from '@/lib/api';
let mockClient='demo_brawndo';
let mockSearch='';
const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient,currentClient:{name:'Brawndo'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/reviews',search:mockSearch}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams(mockSearch))}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>props=>props.open?<div data-testid="opened-record">{props.reviewsPilot?'Pilot':'Original'}</div>:null);
jest.mock('@/components/EvidencePanel',()=>()=> <div>Existing evidence panel</div>);
let root,container,rows,saved;
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
const click=async node=>act(async()=>node.click());
const button=text=>[...container.querySelectorAll('button')].find(b=>b.textContent.includes(text));
const input=async(node,value)=>act(async()=>{
  Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});

test.each(['cis','iso','both'])('combined non-pilot %s Review keeps Notes through cancel, save and historical discard',async framework=>{
  const drivers=[{framework_key:'cis-ig1',framework_plan_key:require('@/lib/frameworks').cis.review_plans[0].key},{framework_key:'iso-27001',framework_plan_key:'iso-management-review'}];
  saved={...saved,client_id:'synthetic-combined',framework_drivers:framework==='both'?drivers:[drivers[framework==='iso'?1:0]]};
  const close=jest.fn(),old={...saved,occurrence_id:'old',period:'Prior period',status:'completed',notes:'Retained minutes'};
  api.get.mockImplementation(async path=>({data:path.endsWith('/history')?[old]:path.startsWith('/frameworks/')?{assessments:[]}:path==='/related'?{}:[]}));
  await act(async()=>root.render(<ReviewDrawer open record={saved} clientId={saved.client_id} onOpenChange={close}/>));
  await input(document.querySelector('[data-testid="field-notes"]'),'Unsaved combined Notes');
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Close'));
  expect(document.body.textContent).toContain('Leave unsaved changes?');expect(close).not.toHaveBeenCalled();
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Keep editing'));
  expect(document.querySelector('[data-testid="field-notes"]').value).toBe('Unsaved combined Notes');
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Save changes'));
  expect(api.patch).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({notes:'Unsaved combined Notes'}));
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
  api.get.mockImplementation(async path=>({data:path==='/reviews'?rows:path==='/policies'?[{policy_id:'p',client_id:'demo_brawndo',title:'Access Control Policy'}]:path==='/related'?{}:[]}));
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
  const signal=label=>[...container.querySelectorAll('.register-signal')].find(b=>b.querySelector('.register-signal-label').textContent===label);
  const tab=id=>container.querySelector(`[data-testid="reviews-tab-${id}"]`);
  const count=()=>container.querySelectorAll('tr[data-testid^="reviews-row-"]').length;
  expect(tab('all').textContent).toBe('All open3');
  expect(tab('overdue').textContent).toBe('Overdue1');
  expect(tab('due30').textContent).toBe('Due in 30 days1');
  expect(tab('upcoming').textContent).toBe('Due in 90 days1');
  expect(signal('Due in 14 days').querySelector('.register-signal-value').textContent).toBe('1');
  expect(signal('No owner').querySelector('.register-signal-value').textContent).toBe('2');
  // Open work is the default; closed reviews live behind history.
  expect(count()).toBe(3);
  expect(tab('all').getAttribute('aria-pressed')).toBe('true');
  await click(signal('Due in 14 days'));
  expect(count()).toBe(1);
  expect(container.querySelector('[data-testid="reviews-row-0"]').textContent).toContain('Due today');
  expect(tab('all').getAttribute('aria-pressed')).toBe('false');
  await click(tab('overdue'));
  expect(count()).toBe(1);
  expect(signal('Due in 14 days').getAttribute('aria-pressed')).toBe('false');
  expect(tab('overdue').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('[data-testid="reviews-status-0"]').textContent).toBe('overdue');
  await input(container.querySelector('[data-testid="reviews-search"]'),'no match');
  expect(tab('all').textContent).toBe('All open3');
  await click(button('Clear filters'));
  expect(count()).toBe(3);
  await click(tab('mine'));
  expect(count()).toBe(0);
  await click(signal('No owner'));
  expect(count()).toBe(2);
  await click(button('Review history'));
  expect(count()).toBe(1);
  expect(container.querySelector('[data-testid="reviews-row-0"]').textContent).toContain('Completed review');
  await click(button('Back to active Reviews'));
  await click(signal('No owner'));
  rows=rows.map(r=>({...r,client_id:'different-client'}));mockClient='different-client';
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('.page-title').textContent).toBe('Reviews');
  expect(count()).toBe(3);
  expect(container.querySelector('.register-signals [aria-pressed="true"]')).toBeNull();
});

test('recent-completion signal includes completed and recurring active reviews counted in its summary',async()=>{
  const completed_at=new Date().toISOString();
  rows=rows.map(r=>['late','closed'].includes(r.review_id)?{...r,occurrences:[{completed_at}]}:r);
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  const signal=button('Completed in last 30 days');
  expect(signal.querySelector('.register-signal-value').textContent).toBe('2');
  await click(signal);
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

test('shared Review summaries and rows never count another client',async()=>{
  rows.push({...rows[0],client_id:'other-client',review_id:'foreign',title:'Another client review'});
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('[data-testid="reviews-tab-overdue"]').textContent).toBe('Overdue1');
  expect(container.querySelector('[data-testid="reviews-tab-all"]').textContent).toBe('All open3');
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
test('default client surface reuses the centered Review shell without enabling pilot workflow semantics',async()=>{
  mockClient='future-client';saved={...saved,client_id:mockClient};
  await act(async()=>root.render(<ClientPresentationContext.Provider value="Future client"><ReviewDrawer open record={saved} clientId={mockClient} onOpenChange={()=>{}}/></ClientPresentationContext.Provider>));
  const dialog=document.querySelector('[data-testid="reviews-drawer"]');
  expect(dialog.className).toContain('brawndo-cis-assessment');
  expect(dialog.querySelector('[aria-label="Requirement basis"]')).not.toBeNull();
  expect(dialog.querySelector('[data-testid="field-policy_id"]')).not.toBeNull();
  expect(dialog.querySelector('h2').getAttribute('tabindex')).toBe('-1');
  expect(dialog.getAttribute('aria-modal')).toBe('true');
});

test('centered detail preserves policy/context and guards unsaved and failed saves',async()=>{
  const close=jest.fn();
  await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId="demo_brawndo" onOpenChange={close}/>));
  const dialog=document.querySelector('[data-testid="reviews-drawer"]');
  expect(dialog.className).toContain('brawndo-cis-assessment');
  expect(dialog.textContent).toContain('Assigned Reviewer');
  expect(dialog.textContent).toContain('Access Control Policy');
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
  expect(saved.notes).toBe('Updated narrative');
  expect(api.patch.mock.calls[1][1]).toEqual(expect.objectContaining({expected_occurrence_id:'occ_late',notes:'Updated narrative'}));
  window.confirm.mockClear();
  await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Close'));
  expect(window.confirm).not.toHaveBeenCalled();expect(close).toHaveBeenCalledWith(false);
});
test('a caller cannot enable the pilot for another client',async()=>{
  const record={...saved,client_id:'demo_dunder'};
  await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={record} clientId="demo_dunder" onOpenChange={()=>{}}/>));
  expect(document.querySelector('[data-testid="reviews-drawer"]').className).toContain('record-drawer');
  expect(document.querySelector('[aria-label="Requirement basis"]')).toBeTruthy();
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

test('new pilot reviews do not wait for nonexistent requirement relationships',async()=>{
  await act(async()=>root.render(<ReviewDrawer open reviewsPilot clientId="demo_brawndo" onOpenChange={()=>{}}/>));
  const dialog=document.querySelector('[data-testid="reviews-drawer"]');
  expect(dialog.textContent).not.toContain('Loading linked requirements');
  expect(dialog.textContent).toContain('Requirement source not documented');
});

test('optional Review evaluation is protected as a draft and sent only on completion',async()=>{
 const close=jest.fn();
 api.post.mockResolvedValue({data:{review:{...saved,status:'completed'},occurrence:{occurrence_id:'done'}}});
 await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId="demo_brawndo" onOpenChange={close}/>));
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
 expect(document.querySelector('[data-testid="iso-management-review-guide"]')).toBeTruthy();
 const guide=document.querySelector('[data-testid="iso-management-review-guide"]'),notes=document.querySelector('[data-testid="field-notes"]');
 expect(guide.compareDocumentPosition(notes)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
 expect(document.body.textContent).toContain('does not replace the retained historical conclusions');
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
 expect(api.patch).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({notes:'Saved Notes, unfinished evaluation'}));
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
 api.get.mockImplementation(async path=>({data:path==='/related'?{risks:[{risk_id:'risk',client_id:'demo_brawndo',likelihood_score:3,impact_score:4}]}:[]}));
 api.post.mockResolvedValue({data:{review:saved,occurrence:{occurrence_id:'done'}}});
 await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
 expect(document.querySelector('[data-testid="review-next-date"]').textContent).not.toMatch(/Calculated/);
 await click(document.querySelector('[data-testid="review-complete"]'));
 expect(api.post).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Complete this review?');
 await click(document.querySelector('[data-testid="review-complete-confirmed"]'));
 expect(api.post.mock.calls[0][1].risk_assessment).toEqual({});
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
