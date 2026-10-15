import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation,useNavigate} from 'react-router-dom';
import ActionItems from './ActionItems';
import api from '@/lib/api';

let mockAuth,mockOrg,mockDrawer,mockForm;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:error=>error.message,PREVIEW_MODE:true}));
jest.mock('./BrawndoActionItems',()=>()=> <div data-testid="native-register">Native register</div>);
jest.mock('@/components/RecordDrawer',()=>props=>{
  mockForm=props;
  if(props.record&&['tasks','findings'].includes(props.kind)){mockDrawer=props;return <div data-testid="native-ticket">{props.kind}:{props.record.task_id||props.record.finding_id}</div>;}
  return <div data-testid="creation-form"/>;
});

let root,container,records,navigate,location;
function RouteProbe(){navigate=useNavigate();location=useLocation();return null;}
const cid='demo_brawndo';
const task=(id,extra={})=>({task_id:id,client_id:cid,title:'Action '+id,status:'open',source_type:'manual',...extra});
const finding=(id,extra={})=>({finding_id:id,client_id:cid,title:'Finding '+id,status:'open',...extra});
const render=(url='/action-items')=>act(async()=>root.render(<MemoryRouter initialEntries={[url]}><RouteProbe/><ActionItems/></MemoryRouter>));
const rerender=()=>act(async()=>root.render(<MemoryRouter><RouteProbe/><ActionItems/></MemoryRouter>));
const click=node=>act(async()=>node.click());
const button=text=>[...container.querySelectorAll('button')].find(node=>node.textContent===text);
const search=value=>act(async()=>{const node=container.querySelector('[data-testid="ai-search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
const change=(node,value)=>act(async()=>{node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));});
const tickets=()=>[...container.querySelectorAll('tbody tr')];
const summary=key=>container.querySelector('.bda-cell.bda-'+key+' strong').textContent;

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();mockDrawer=null;mockForm=null;
  mockAuth={workspaceMode:'demo',loading:false,user:{user_id:'actor',role:'super_admin',workspace_mode:'demo'}};
  mockOrg={currentClientId:cid,currentClient:{client_id:cid,name:'Brawndo',status:'active'},loading:false,error:''};
  records={tasks:Array.from({length:12},(_,i)=>task(String(i).padStart(2,'0'),{assignee_id:i===0?'eligible':'removed'})),findings:[]};
  api.get.mockImplementation(async(path)=>({data:path==='/onboarding/state'?{assessments:[]}:path.endsWith('/members')?[{user_id:'eligible',name:'Eligible owner',assignment_eligible:true},{user_id:'removed',name:'Historical owner',assignment_eligible:false}]:records[path.slice(1)]||[]}));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('actual route gate accepts only resolved active Brawndo Demo with consistent authentication',async()=>{
  await render();expect(container.querySelector('[aria-label="Action summaries"]')).not.toBeNull();
  const originalAuth=mockAuth,originalOrg=mockOrg;
  const cases=[()=>{mockAuth={...originalAuth,user:{...originalAuth.user,role:'client_readonly'}};},()=>{mockAuth={...originalAuth,workspaceMode:'standard'};},()=>{mockAuth={...originalAuth,user:{...originalAuth.user,workspace_mode:'standard'}};},()=>{mockOrg={...originalOrg,error:'Denied'};},()=>{mockOrg={...originalOrg,currentClient:null};},()=>{mockOrg={...originalOrg,currentClientId:'other'};},()=>{mockOrg={...originalOrg,currentClient:{client_id:'other',name:'Brawndo'}};},()=>{mockOrg={...originalOrg,currentClient:{...originalOrg.currentClient,status:'archived'}};}];
  for(const apply of cases){mockAuth=originalAuth;mockOrg=originalOrg;apply();await rerender();expect(container.querySelector('[data-testid="native-register"]')).not.toBeNull();expect(container.querySelector('[aria-label="Action summaries"]')).toBeNull();}
  mockAuth=originalAuth;mockOrg=originalOrg;await rerender();await act(async()=>navigate('/findings'));expect(container.querySelector('[data-testid="native-register"]')).not.toBeNull();
});

test('full-population summary is independent of search/source and filters precede ten-row pagination',async()=>{
  records.tasks[11]={...records.tasks[11],title:'Distinct target',source_type:'review',review_id:'original'};
  records.findings=[finding('accepted',{status:'accepted',severity:'high'})];records.tasks.push(task('linked',{finding_id:'accepted',status:'blocked'}));
  await render();expect(tickets()).toHaveLength(10);expect(summary('active')).toBe('13');expect(summary('unassigned')).toBe('12');expect(summary('high_critical')).toBe('1');
  await click(button('Next'));expect(tickets()).toHaveLength(3);expect(container.textContent).toContain('Page 2 of 2');
  await search('Distinct target');expect(tickets()).toHaveLength(1);expect(tickets()[0].textContent).toContain('Distinct target');expect(container.textContent).toContain('Page 1 of 1');expect(summary('active')).toBe('13');
  await change(container.querySelector('select'), 'reviews');expect(tickets()).toHaveLength(1);expect(summary('unassigned')).toBe('12');
  await search('does not exist');expect(tickets()).toHaveLength(0);expect(summary('active')).toBe('13');
});

test('presentation preserves native creation forms and adds no selection, bulk or selected CSV operations',async()=>{
  await render();
  expect(container.querySelector('table input[type="checkbox"]')).toBeNull();expect(container.querySelector('[aria-label="Selected ticket actions"]')).toBeNull();
  expect(button('Reassign selected')).toBeUndefined();expect(button('Export selected CSV')).toBeUndefined();
  await click(button('New finding'));expect(mockForm).toMatchObject({kind:'findings',record:null,clientId:cid,open:true});
  expect(container.querySelector('[data-testid="creation-form"]')).not.toBeNull();
  await act(async()=>mockForm.onOpenChange(false));expect(container.querySelector('[data-testid="creation-form"]')).toBeNull();
  await click(button('New action item'));expect(mockForm).toMatchObject({kind:'tasks',record:null,clientId:cid,open:true});
});

test('native origin opens the exact source and retained assurance context without opening its ticket',async()=>{
  const vendor={vendor_id:'original-vendor',client_id:cid,name:'Original vendor'};
  records={tasks:[task('source-task',{source_type:'vendor',vendor_id:vendor.vendor_id,assurance_id:'original-document'})],findings:[],vendors:[vendor]};
  await render();await click(container.querySelector('.bda-origin button'));
  expect(mockForm).toMatchObject({kind:'vendors',record:vendor,clientId:cid,initialValues:{vendorTab:'assurance',assuranceId:'original-document'}});
  expect(mockDrawer).toBeNull();expect(location.pathname).toBe('/action-items');expect(location.search).toBe('');
  await act(async()=>mockForm.onOpenChange(false));expect(container.querySelector('[data-testid="creation-form"]')).toBeNull();
  await click(container.querySelector('tbody tr'));expect(mockDrawer).toMatchObject({kind:'tasks',record:{task_id:'source-task'}});
});


test('completed contains only genuine completion; All records retains acceptance and cancellation',async()=>{
  records={tasks:[task('done',{status:'done'}),task('cancelled',{status:'cancelled'})],findings:[finding('accepted',{status:'accepted'}),finding('closed',{status:'closed'}),finding('pending',{status:'remediated'})]};
  await render();expect(tickets()).toHaveLength(1);expect(tickets()[0].textContent).toContain('Pending validation');
  await click([...container.querySelectorAll('.bda-tabs button')].find(node=>node.textContent.startsWith('Completed')));expect(tickets()).toHaveLength(2);expect(tickets().every(row=>row.textContent.includes('Completed'))).toBe(true);
  await click([...container.querySelectorAll('.bda-tabs button')].find(node=>node.textContent.startsWith('All records')));expect(tickets()).toHaveLength(5);expect(container.textContent).toContain('Accepted');expect(container.textContent).toContain('Cancelled');
});

test.each([['?finding_id=collision','findings'],['?task_id=collision','tasks'],['?id=collision',null]])('typed link %s resolves its exact native identity; ambiguous legacy link is denied',async(query,kind)=>{
  records={findings:[finding('collision')],tasks:[task('collision')]};await render('/action-items'+query);
  if(kind){expect(mockDrawer).toMatchObject({kind,clientId:cid,presentation:'brawndo-demo-actions'});expect(container.querySelector('[data-testid="native-ticket"]')).not.toBeNull();}
  else{expect(mockDrawer).toBeNull();expect(container.querySelector('[role="alert"]').textContent).toContain('ambiguous');}
});

test('router Back/Forward restores committed search',async()=>{
  await render('/action-items?q=Action+00');expect(tickets()).toHaveLength(1);
  await act(async()=>navigate('/action-items?q=Action+11'));expect(container.querySelector('[data-testid="ai-search"]').value).toBe('Action 11');
  await act(async()=>navigate(-1));expect(container.querySelector('[data-testid="ai-search"]').value).toBe('Action 00');expect(container.querySelector('[aria-label="Selected ticket actions"]')).toBeNull();
  await act(async()=>navigate(1));expect(container.querySelector('[data-testid="ai-search"]').value).toBe('Action 11');expect(tickets()).toHaveLength(1);expect(location.search).toContain('Action+11');
});

test.each(['auth','org'])('%s loading before authorization uses native register; a resolved same-scope recheck conceals and retains the pilot',async loadingContext=>{
  if(loadingContext==='auth')mockAuth.loading=true;else mockOrg.loading=true;
  await render('/action-items?q=Action+00');expect(container.querySelector('[data-testid="native-register"]')).not.toBeNull();
  mockAuth.loading=false;mockOrg.loading=false;await rerender();
  const pilot=container.querySelector('.brawndo-demo-actions'),searchNode=container.querySelector('[data-testid="ai-search"]');

  if(loadingContext==='auth')mockAuth={...mockAuth,loading:true};else mockOrg={...mockOrg,loading:true};
  await rerender();expect(container.querySelector('[data-testid="native-register"]')).toBeNull();
  expect(container.querySelector('.brawndo-demo-actions')).toBe(pilot);expect(pilot.closest('[hidden]')).not.toBeNull();
  expect(document.documentElement.dataset.brawndoDemoActionsSuspended).toBe('true');expect(container.querySelector('[data-testid="ai-search"]')).toBe(searchNode);expect(searchNode.value).toBe('Action 00');

  mockAuth={...mockAuth,loading:false};mockOrg={...mockOrg,loading:false};await rerender();
  expect(container.querySelector('.brawndo-demo-actions')).toBe(pilot);expect(pilot.closest('[hidden]')).toBeNull();expect(document.documentElement.dataset.brawndoDemoActionsSuspended).toBeUndefined();

  mockOrg={...mockOrg,error:'Access denied'};await rerender();expect(container.querySelector('.brawndo-demo-actions')).toBeNull();expect(container.querySelector('[data-testid="native-register"]')).not.toBeNull();
});

test('Back asks the current drawer to close, and confirmed discard dismisses it',async()=>{
  await render();await click(container.querySelector('tbody .bda-title'));
  const existing=container.querySelector('[data-testid="native-ticket"]');expect(mockDrawer.closeRequest).toBe(0);
  await act(async()=>navigate(-1));expect(container.querySelector('[data-testid="native-ticket"]')).toBe(existing);expect(mockDrawer.closeRequest).toBeGreaterThan(0);
  await act(async()=>mockDrawer.onOpenChange(false));expect(container.querySelector('[data-testid="native-ticket"]')).toBeNull();expect(location.search).toBe('');
});

test('switching tickets queues the next native target and mounts a fresh keyed drawer only after close',async()=>{
  await render('/action-items?task_id=00');const existing=container.querySelector('[data-testid="native-ticket"]');expect(mockDrawer.ticketKey).toBe('task:00');
  await act(async()=>navigate('/action-items?task_id=01'));expect(mockDrawer.record.task_id).toBe('00');expect(mockDrawer.closeRequest).toBeGreaterThan(0);expect(container.querySelector('[data-testid="native-ticket"]')).toBe(existing);
  const request=mockDrawer.closeRequest;
  await act(async()=>mockDrawer.onOpenChange(false));expect(mockDrawer.record.task_id).toBe('01');expect(mockDrawer.ticketKey).toBe('task:01');expect(mockDrawer.closeRequest).toBe(request);expect(container.querySelector('[data-testid="native-ticket"]')).not.toBe(existing);expect(location.search).toBe('?task_id=01');
});

test('Keep editing cancels queued navigation and restores the current typed Finding URL',async()=>{
  records.findings=[finding('issue')];await render('/action-items?finding_id=issue');const existing=container.querySelector('[data-testid="native-ticket"]');
  await act(async()=>navigate('/action-items?task_id=01'));expect(mockDrawer.closeRequest).toBeGreaterThan(0);expect(mockDrawer.record.finding_id).toBe('issue');
  const request=mockDrawer.closeRequest;
  await act(async()=>mockDrawer.onCloseCancelled());expect(location.search).toBe('?finding_id=issue');expect(mockDrawer.closeRequest).toBe(request);expect(mockDrawer.record.finding_id).toBe('issue');expect(container.querySelector('[data-testid="native-ticket"]')).toBe(existing);
  await act(async()=>navigate('/action-items?task_id=01'));expect(mockDrawer.closeRequest).toBeGreaterThan(request);expect(mockDrawer.record.finding_id).toBe('issue');
});

test('native Close removes typed identifiers without reviving the old drawer and allows immediate reopen',async()=>{
  await render('/action-items?task_id=00');expect(container.querySelector('[data-testid="native-ticket"]')).not.toBeNull();
  await act(async()=>mockDrawer.onOpenChange(false));
  expect(container.querySelector('[data-testid="native-ticket"]')).toBeNull();expect(location.search).toBe('');
  await act(async()=>Promise.resolve());expect(container.querySelector('[data-testid="native-ticket"]')).toBeNull();
  await click(container.querySelector('tbody .bda-title'));expect(container.querySelector('[data-testid="native-ticket"]')).not.toBeNull();expect(location.search).toBe('?task_id=00');expect(mockDrawer.record.task_id).toBe('00');
});

test('repeated Back after Keep editing requests close again and preserves the register history entry',async()=>{
  await render();await click(container.querySelector('tbody .bda-title'));
  const existing=container.querySelector('[data-testid="native-ticket"]');
  await act(async()=>navigate(-1));const firstRequest=mockDrawer.closeRequest;expect(firstRequest).toBeGreaterThan(0);expect(location.pathname).toBe('/action-items');expect(location.search).toBe('');
  await act(async()=>mockDrawer.onCloseCancelled());expect(location.search).toBe('?task_id=00');expect(container.querySelector('[data-testid="native-ticket"]')).toBe(existing);
  await act(async()=>navigate(-1));expect(mockDrawer.closeRequest).toBeGreaterThan(firstRequest);expect(location.pathname).toBe('/action-items');expect(location.search).toBe('');expect(container.querySelector('[data-testid="native-ticket"]')).toBe(existing);
  await act(async()=>mockDrawer.onOpenChange(false));expect(container.querySelector('[data-testid="native-ticket"]')).toBeNull();expect(location.pathname).toBe('/action-items');
});
