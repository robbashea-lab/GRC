import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ActionItems from './ActionItems';
import {FindingsRoute,actionTiles} from './BrawndoActionItems';
import RecordDrawer from '@/components/RecordDrawer';
import api from '@/lib/api';
let mockClient='demo_brawndo',mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'},mockQuery='';
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient,currentClient:{name:'Brawndo'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:e=>e.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,Navigate:({to})=><div data-testid="redirect">{to}</div>,useLocation:()=>({pathname:'/findings',search:mockQuery}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams(mockQuery))}),{virtual:true});
let root,container,rows,findings,saved;
const click=async node=>act(async()=>node.click());
const input=async(node,value)=>act(async()=>{Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockClient='demo_brawndo';mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};mockQuery='';sessionStorage.clear();localStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  rows=[{task_id:'a',client_id:mockClient,title:'Expand inventory',status:'in_progress',priority:'high',due_date:'2020-01-01',source_type:'finding',source_id:'f',finding_id:'f',assignee_id:'admin'},
    {task_id:'b',client_id:mockClient,title:'Ordinary task',status:'open',priority:'informational',source_type:'manual'},
    {task_id:'c',client_id:mockClient,title:'Finished work',status:'done',priority:'low',source_type:'manual'}];
  findings=[{finding_id:'f',client_id:mockClient,title:'Inventory missing devices',description:'Plant devices are missing',status:'in_remediation'},
    {finding_id:'orphan',client_id:mockClient,title:'Finding without an Action',status:'open',severity:'high'}];
  saved={...rows[0]};
  api.get.mockImplementation(async(path,options)=>({data:path==='/tasks'?rows:path==='/findings'?findings:path==='/related'?{findings:[findings[0]]}:path==='/findings/f'?findings[0]:path==='/onboarding/state'?{assessments:[]}:path.endsWith('/members')?[{user_id:'admin',client_ids:[mockClient],status:'active',name:'Joe Bowers'}]:[]}));
  api.patch.mockImplementation(async(path,patch)=>{saved={...saved,...patch};return {data:saved};});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('stable summaries, orphan visibility, search, synchronized quick filters and client isolation',async()=>{
  await act(async()=>root.render(<ActionItems/>));
  const summary=label=>[...container.querySelectorAll('[aria-label="Action summaries"] button')].find(b=>b.textContent.startsWith(label));
  expect(summary('All active').textContent).toContain('3');expect(summary('Overdue').textContent).toContain('Expand inventory');
  expect(container.querySelector('[data-testid="ai-view-active"]').textContent).toBe('Active · 3');
  expect(container.querySelector('[data-testid="ai-row-0"]').className).toContain('bpage-late');
  expect(container.querySelector('[data-testid="ai-foot"]').textContent).toBe('Showing 3 of 3 active action items · soonest due first');
  expect(container.querySelector('[data-testid="ai-pending-notice"]')).toBeNull();expect(summary('Overdue').textContent).toContain('1');
  expect(container.querySelectorAll('[data-testid^="ai-row-"]')).toHaveLength(3);
  expect(container.textContent).toContain('Finding without an Action');
  await click(summary('Overdue'));expect(container.querySelector('[data-testid="ai-view-overdue"]').getAttribute('aria-pressed')).toBe('true');
  await input(container.querySelector('[data-testid="ai-search"]'),'Plant devices');
  expect(container.querySelectorAll('[data-testid^="ai-row-"]')).toHaveLength(1);expect(summary('All active').textContent).toContain('3');
  await input(container.querySelector('[data-testid="ai-search"]'),'');await click(container.querySelector('[data-testid="ai-view-completed"]'));
  expect(container.querySelector('[data-testid="ai-row-0"]').textContent).toContain('Finished work');
  mockClient='demo_dunder';rows=rows.map(r=>({...r,client_id:mockClient}));
  await act(async()=>root.render(<ActionItems/>));
  expect(container.querySelector('[aria-label="Action summaries"]')).not.toBeNull();
  expect(container.textContent).not.toContain('Finding without an Action');
});
test('legacy Findings route redirects every Demo client and preserves the query',async()=>{
  for(const client of ['demo_brawndo','demo_prestige','demo_dunder','demo_new_soc']){
    mockClient=client;mockQuery='?finding_id=f';await act(async()=>root.render(<FindingsRoute/>));
    expect(container.querySelector('[data-testid="redirect"]').textContent).toBe('/action-items?finding_id=f');
  }
  mockQuery='?signal=material';await act(async()=>root.render(<FindingsRoute/>));
  expect(container.querySelector('[data-testid="redirect"]').textContent).toBe('/action-items?signal=material');
  mockUser={...mockUser,workspace_mode:'live'};await act(async()=>root.render(<FindingsRoute/>));expect(container.querySelector('[data-testid="redirect"]')).toBeNull();
});
test.each(['dependency failure','missing finding'])('Finding deep link recovers after %s and retry',async failure=>{
  mockQuery='?finding_id=f';
  const get=api.get.getMockImplementation();let recovered=false;
  api.get.mockImplementation((path,options)=>{
    if(path==='/findings'&&!recovered)return failure==='dependency failure'?Promise.reject(new Error('Dependency unavailable')):Promise.resolve({data:[]});
    return get(path,options);
  });
  await act(async()=>root.render(<ActionItems/>));
  const error=container.querySelector('[data-testid="register-load-error"]');
  expect(error.textContent).toContain(failure==='dependency failure'?'Dependency unavailable':'The requested Finding is unavailable');
  expect(document.querySelector('[data-testid="tasks-drawer"]')).toBeNull();
  recovered=true;await click(error.querySelector('button'));
  expect(document.querySelector('[data-testid="tasks-drawer"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="register-load-error"]')).toBeNull();
});
test('centered detail protects unsaved edits and submits completion with the edits in one write',async()=>{
  const close=jest.fn();await act(async()=>root.render(<RecordDrawer open kind="tasks" record={saved} clientId={mockClient} onOpenChange={close}/>));
  const dialog=document.querySelector('[data-testid="tasks-drawer"]');expect(dialog.className).toContain('brawndo-cis-assessment');
  expect(dialog.querySelector('[aria-label="Action Context & Completion Criteria"]')).toBeTruthy();
  await input(dialog.querySelector('#task-description'),'Inventory expanded and verified');
  await click(dialog.querySelector('[data-testid="drawer-cancel"]'));expect(document.querySelector('[role="alertdialog"]')).toBeTruthy();expect(close).not.toHaveBeenCalled();
  await click([...document.querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent==='Keep editing'));
  api.patch.mockRejectedValueOnce(new Error('Write failed'));await click(dialog.querySelector('[data-testid="complete-action"]'));
  expect(dialog.querySelector('#task-description').value).toBe('Inventory expanded and verified');expect(close).not.toHaveBeenCalled();
  await click(dialog.querySelector('[data-testid="complete-action"]'));
  expect(api.patch.mock.calls[1]).toEqual(['/tasks/a',expect.objectContaining({status:'done',description:'Inventory expanded and verified'})]);
  expect(dialog.textContent).toContain('Action Item completed');expect(api.post).not.toHaveBeenCalled();
});
test('unposted comment prevents completion; authorized contributor can use scoped assignment picker; other clients retain drawer',async()=>{
  mockUser={...mockUser,role:'client_contributor'};
  await act(async()=>root.render(<RecordDrawer open kind="tasks" record={saved} clientId={mockClient} onOpenChange={()=>{}}/>));
  expect(document.querySelector('button[aria-label="Assigned To"]').disabled).toBe(false);
  await click(document.querySelector('[data-testid="tab-comments"]'));
  expect(document.querySelector('[data-testid="drawer-save"]')).toBeTruthy();
  await input(document.querySelector('[data-testid="comment-input"]'),'Unfinished comment');
  await click(document.querySelector('[data-testid="complete-action"]'));expect(api.patch).not.toHaveBeenCalled();
  mockClient='demo_dunder';await act(async()=>root.render(<RecordDrawer open kind="tasks" record={{...saved,client_id:mockClient}} clientId={mockClient} onOpenChange={()=>{}}/>));
  expect(document.querySelector('[data-testid="tasks-drawer"]').className).not.toContain('brawndo-cis-assessment');
});
test.each(['critical',null,'not_assessed'])('legacy priority %s is not downgraded by editing description',async priority=>{
  const record={...saved,priority};await act(async()=>root.render(<RecordDrawer open kind="tasks" record={record} clientId={mockClient} onOpenChange={()=>{}}/>));
  expect(document.querySelector('#task-priority').textContent).toBe(priority==='critical'?'Critical':'Classification needed');
  await input(document.querySelector('#task-description'),'Clarification');await click(document.querySelector('[data-testid="drawer-save"]'));
  expect(api.patch.mock.calls[0][1]).not.toHaveProperty('priority');
});
test('read-only users cannot save, complete or assign work',async()=>{
  mockUser={...mockUser,role:'client_readonly'};await act(async()=>root.render(<RecordDrawer open kind="tasks" record={saved} clientId={mockClient} onOpenChange={()=>{}}/>));
  expect(document.querySelector('[data-testid="complete-action"]')).toBeNull();
  expect(document.querySelector('button[aria-label="Assigned To"]').disabled).toBe(true);
  expect(document.querySelector('[data-testid="drawer-save"]')?.disabled??true).toBe(true);
  expect(document.querySelector('#task-description').disabled).toBe(true);
});
test('server readiness refresh is not a new unsaved edit in the parent Finding',async()=>{
  const close=jest.fn(),finding={...findings[0]};
  api.get.mockImplementation(async(path,options)=>({data:path==='/related'?(options.params.entity_type==='findings'?{tasks:[saved]}:{findings:[finding]}):path==='/findings'?[finding]:path==='/findings/f'?finding:path==='/onboarding/state'?{assessments:[]}:[]}));
  api.patch.mockImplementation(async(path,patch)=>{finding.status='remediated';return {data:{...saved,...patch}};});
  await act(async()=>root.render(<RecordDrawer open kind="findings" record={finding} clientId={mockClient} onOpenChange={close}/>));
  await click(document.querySelector('[data-testid="tab-related"]'));
  await click(document.querySelector('[data-testid="related-tasks-item"] button'));
  await click(document.querySelector('[data-testid="complete-action"]'));
  await click(document.querySelector('[data-testid="tasks-drawer"] [data-testid="drawer-cancel"]'));
  await click(document.querySelector('[data-testid="findings-drawer"] [data-testid="drawer-cancel"]'));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();expect(close).toHaveBeenCalledWith(false);
});
test('tile context names the oldest overdue and next due items from real rows',()=>{
  const now=new Date(2026,8,30),row=(id,due_date,extra={})=>({kind:'tasks',id,title:id,due_date,owner_id:'u',raw:{status:'open'},...extra});
  const tiles=Object.fromEntries(actionTiles([row('late2','2026-09-20'),row('late1','2026-08-31'),row('soon','2026-10-12'),row('later','2026-10-20'),row('far','2026-12-14',{owner_id:null}),row('done','2026-01-01',{raw:{status:'done'}})],now).map(t=>[t.id,t]));
  expect(tiles.overdue).toMatchObject({count:2,context:'30 days late · late1'});
  expect(tiles.upcoming.count).toBe(2);expect(tiles.upcoming.context).toMatch(/^Next: soon, /);
  expect(tiles.active).toMatchObject({count:5,context:'3 on schedule'});
  expect(tiles.unassigned).toMatchObject({count:1,context:'1 item without an owner'});
  const clear=Object.fromEntries(actionTiles([row('ok','2027-01-01')],now).map(t=>[t.id,t]));
  expect(clear.unassigned.context).toBe('Every action item has an owner');expect(clear.overdue.context).toBe('Nothing past due');
});
