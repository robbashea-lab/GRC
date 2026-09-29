import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import ReviewDrawer from '@/components/ReviewDrawer';
import api from '@/lib/api';
let mockClient='demo_brawndo';
const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient,currentClient:{name:'Brawndo'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/reviews',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams())}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>props=>props.open?<div data-testid="opened-record">{props.reviewsPilot?'Pilot':'Original'}</div>:null);
jest.mock('@/components/EvidencePanel',()=>()=> <div>Existing evidence panel</div>);
let root,container,rows,saved;
const click=async node=>act(async()=>node.click());
const button=text=>[...container.querySelectorAll('button')].find(b=>b.textContent.includes(text));
const input=async(node,value)=>act(async()=>{
  Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockClient='demo_brawndo';
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
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('summary counts stay stable under search, filters clear, completed accessible and client switching resets pilot',async()=>{
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('.page-title')).toBeNull();
  expect(button('All Open').textContent).toContain('3');
  expect(button('Overdue').textContent).toContain('1');
  expect(button('Upcoming (30 days)').textContent).toContain('1');
  expect(button('Unassigned').textContent).toContain('2');
  await click(button('Overdue'));
  expect(container.querySelectorAll('tr[data-testid^="reviews-row-"]').length).toBe(1);
  expect(container.querySelector('[data-testid="reviews-status-0"]').textContent).toBe('In Progress');
  await input(container.querySelector('[data-testid="reviews-search"]'),'no match');
  expect(button('All Open').textContent).toContain('3');
  await click(button('Clear filters'));
  expect(container.querySelectorAll('tr[data-testid^="reviews-row-"]').length).toBe(4);
  await click(button('Overdue'));
  await click(button('Clear summary filter'));
  expect(container.querySelectorAll('tr[data-testid^="reviews-row-"]').length).toBe(4);
  await click(button('Completed / cancelled history'));
  expect(container.querySelector('[data-testid="reviews-row-0"]').textContent).toContain('Completed review');
  await click(button('All Reviews'));
  await click(button('Unassigned'));
  rows=rows.map(r=>({...r,client_id:'demo_dunder'}));mockClient='demo_dunder';
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('[aria-label="Review summaries"]')).toBeNull();
  expect(container.querySelector('.page-title').textContent).toBe('Reviews');
  expect(container.querySelector('th[data-column="owner_id"]').textContent).toContain('Owner');
  rows=rows.map(r=>({...r,client_id:'demo_brawndo'}));mockClient='demo_brawndo';
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('[aria-label="Review summaries"] [aria-pressed="true"]')).toBeNull();
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

test('Risk review completion sends only changed assessment fields and labels completion-based scheduling',async()=>{
 saved={...saved,risk_id:'risk'};
 api.get.mockImplementation(async path=>({data:path==='/related'?{risks:[{risk_id:'risk',client_id:'demo_brawndo',likelihood_score:3,impact_score:4}]}:[]}));
 api.post.mockResolvedValue({data:{review:saved,occurrence:{occurrence_id:'done'}}});
 await act(async()=>root.render(<ReviewDrawer open reviewsPilot record={saved} clientId="demo_brawndo" onOpenChange={()=>{}}/>));
 expect(document.querySelector('[data-testid="review-next-date"]').textContent).toBe('Calculated from actual completion');
 await click(document.querySelector('[data-testid="review-complete"]'));
 expect(api.post.mock.calls[0][1].risk_assessment).toEqual({});
});
