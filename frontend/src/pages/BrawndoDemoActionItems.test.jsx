import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation,useNavigate} from 'react-router-dom';
import ActionItems from './ActionItems';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';

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
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();sessionStorage.setItem('grc_client_id','demo_brawndo');mockDrawer=null;mockForm=null;
  mockAuth={workspaceMode:'demo',loading:false,user:{user_id:'actor',role:'super_admin',workspace_mode:'demo'}};
  mockOrg={currentClientId:cid,currentClient:{...cisClient(cid,1),name:'Brawndo'},clients:[cisClient(cid,1)],loading:false,error:''};
  records={tasks:Array.from({length:12},(_,i)=>task(String(i).padStart(2,'0'),{assignee_id:i===0?'eligible':'removed'})),findings:[]};
  api.get.mockImplementation(async(path)=>({data:path.startsWith('/framework_assessments/')?(records.framework_assessments||[]).find(row=>row.framework_assessment_id===path.split('/').pop()):path==='/onboarding/state'?{assessments:records.framework_assessments||[]}:path.endsWith('/members')?[{user_id:'eligible',name:'Eligible owner',assignment_eligible:true},{user_id:'removed',name:'Historical owner',assignment_eligible:false}]:records[path.slice(1)]||[]}));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('concept native close owns late focus after reload replaces its opener; register opens retain native fallback',async()=>{
  const day=new Date(),due=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
  records.tasks=[task('focus',{due_date:due})];await render();
  const origin=container.querySelector('.agenda-entry');await click(origin);
  const returnFocus=mockDrawer.onReturnFocus;expect(typeof returnFocus).toBe('function');
  records.tasks=[];await act(async()=>mockDrawer.onSaved());
  await act(async()=>mockDrawer.onOpenChange(false));
  expect(origin.isConnected).toBe(false);expect(returnFocus()).toBe(true);
  expect(document.activeElement.textContent).toBe('View data');
  records.tasks=[task('focus',{due_date:due})];await act(async()=>mockDrawer.onSaved());
  await click(container.querySelector('.bda-title'));
  expect(mockDrawer.onReturnFocus).toBeUndefined();
});

test('Due in 30 days uses native inclusive boundaries, excludes undated/finished work and labels its destination',async()=>{
  jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-24T12:00:00'));
  try{
    records.tasks=[task('yesterday',{due_date:'2026-10-23'}),task('today',{due_date:'2026-10-24'}),task('day14',{due_date:'2026-11-07'}),task('day15',{due_date:'2026-11-08'}),task('day30',{due_date:'2026-11-23'}),task('day31',{due_date:'2026-11-24'}),task('undated'),task('done',{due_date:'2026-11-05',status:'done'}),task('pending-task',{finding_id:'pending',due_date:'2026-11-23',status:'done'})];
    records.findings=[finding('pending',{status:'remediated',primary_task_id:'pending-task'})];
    await render();expect(summary('upcoming')).toBe('5');
    await click(container.querySelector('.bda-upcoming'));
    expect(new Set(tickets().map(row=>row.dataset.ticketId))).toEqual(new Set(['task:today','task:day14','task:day15','task:day30','finding:pending']));
    expect(container.querySelector('.bda-more-controls label:last-child select').selectedOptions[0].textContent).toBe('Due in 30 days');
    expect(container.querySelector('.bda-chip').textContent).toContain('Due in 30 days');
  }finally{jest.useRealTimers();}
});

test('actual route gate accepts resolved CIS clients and denies inconsistent identity or authentication',async()=>{
  await render();expect(container.querySelector('[aria-label="Action summaries"]')).not.toBeNull();
  const originalAuth=mockAuth,originalOrg=mockOrg;
  const cases=[()=>{mockAuth={...originalAuth,user:{...originalAuth.user,role:'client_readonly'}};},()=>{mockAuth={...originalAuth,workspaceMode:'standard'};},()=>{mockAuth={...originalAuth,user:{...originalAuth.user,workspace_mode:'standard'}};},()=>{mockOrg={...originalOrg,error:'Denied'};},()=>{mockOrg={...originalOrg,currentClient:null};},()=>{mockOrg={...originalOrg,currentClientId:'other'};},()=>{mockOrg={...originalOrg,currentClient:{client_id:'other',name:'Brawndo'}};},()=>{mockOrg={...originalOrg,currentClient:{...originalOrg.currentClient,status:'archived'}};}];
  for(const apply of cases){mockAuth=originalAuth;mockOrg=originalOrg;apply();await rerender();expect(container.querySelector('[data-testid="native-register"]')).not.toBeNull();expect(container.querySelector('[aria-label="Action summaries"]')).toBeNull();expect(container.querySelector('.surface-theme-action')).toBeNull();}
  mockAuth={...originalAuth,workspaceMode:'standard',user:{...originalAuth.user,workspace_mode:'standard'}};mockOrg=originalOrg;await rerender();expect(container.querySelector('[aria-label="Action summaries"]')).not.toBeNull();
  mockAuth=originalAuth;mockOrg={...originalOrg,currentClient:cisClient(cid,4)};await rerender();expect(container.querySelector('[aria-label="Action summaries"]')).toBeNull();
  mockAuth=originalAuth;mockOrg=originalOrg;await rerender();await act(async()=>navigate('/findings'));expect(container.querySelector('[data-testid="native-register"]')).not.toBeNull();
});

test('full-population summary is independent of search/source and filters precede ten-row pagination',async()=>{
  records.tasks[11]={...records.tasks[11],title:'Distinct target',source_type:'review',review_id:'original'};
  records.findings=[finding('accepted',{status:'accepted',severity:'high'})];records.tasks.push(task('linked',{finding_id:'accepted',status:'blocked'}));
  await render();expect(tickets()).toHaveLength(10);expect(summary('active')).toBe('13');expect(summary('unassigned')).toBe('12');expect(summary('upcoming')).toBe('0');
  // The replacement overview does not invent a deadline for a blocked, unscheduled ticket.
  expect(container.querySelector('.bda-upcoming small').textContent).toBe('Saved active Action deadlines');
  expect(container.querySelector('.bda-runway')).toBeNull();
  await click(button('Next'));expect(tickets()).toHaveLength(3);expect(container.textContent).toContain('Page 2 of 2');
  await search('Distinct target');expect(tickets()).toHaveLength(1);expect(tickets()[0].textContent).toContain('Distinct target');expect(container.textContent).toContain('Page 1 of 1');expect(summary('active')).toBe('13');
  await change(container.querySelector('.bda-controls select'), 'reviews');expect(tickets()).toHaveLength(1);expect(summary('unassigned')).toBe('12');
  await search('does not exist');expect(tickets()).toHaveLength(0);expect(summary('active')).toBe('13');
});

test('unavailable loads never describe unknown summaries as empty or fully assigned',async()=>{
  let rejectLoad;
  const pending=new Promise((resolve,reject)=>{rejectLoad=reject;});
  api.get.mockReturnValue(pending);
  const expectUnavailable=()=>{
    const cells=[...container.querySelectorAll('.bda-cell')];
    expect(cells).toHaveLength(4);
    for(const cell of cells){
      expect(cell.querySelector('strong').textContent).toBe('—');
      expect(cell.querySelector('small').textContent).toBe('—');
      expect(cell.disabled).toBe(true);
    }
  };
  await render();
  expectUnavailable();
  await act(async()=>rejectLoad(new Error('Tickets service unavailable')));
  expectUnavailable();
  expect(container.querySelector('[role="alert"]').textContent).toContain('Tickets service unavailable');
});

test('presentation preserves native creation forms and adds no selection, bulk or selected CSV operations',async()=>{
  await render();
  const themeAction=container.querySelector('.surface-theme-action');expect(themeAction.textContent).toBe('Dark');
  await click(themeAction);expect(container.querySelector('.brawndo-demo-actions').dataset.theme).toBe('dark');expect(themeAction.textContent).toBe('Light');
  expect(container.querySelector('table input[type="checkbox"]')).toBeNull();expect(container.querySelector('[aria-label="Selected ticket actions"]')).toBeNull();
  expect(button('Reassign selected')).toBeUndefined();expect(button('Export selected CSV')).toBeUndefined();
  await click(button('New finding'));expect(mockForm).toMatchObject({kind:'findings',record:null,clientId:cid,open:true});
  expect(container.querySelector('[data-testid="creation-form"]')).not.toBeNull();
  await act(async()=>mockForm.onOpenChange(false));expect(container.querySelector('[data-testid="creation-form"]')).toBeNull();
  await click(button('New action item'));expect(mockForm).toMatchObject({kind:'tasks',record:null,clientId:cid,open:true});
});

test('native origin opens the exact source and retained assurance context without opening its ticket',async()=>{
  const vendor={vendor_id:'original-vendor',client_id:cid,name:'Original vendor',assurance_records:[{assurance_id:'original-document',type:'SOC 2',evidence_ids:[]}]};
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
  await click([...container.querySelectorAll('.bda-tabs button')].find(node=>node.textContent.startsWith('Completed')));expect(tickets()).toHaveLength(2);expect(tickets().map(row=>row.dataset.ticketId).sort()).toEqual(['finding:closed','task:done']);
  await change([...container.querySelectorAll('select')].find(node=>[...node.options].some(option=>option.value==='__all__')),'__all__');expect(tickets()).toHaveLength(5);expect([...container.querySelectorAll('select')].find(node=>node.value==='__all__')).toBeDefined();expect(container.querySelector('.bda-show [aria-pressed="true"]')).toBeNull();expect(container.textContent).toContain('Accepted');expect(container.textContent).toContain('Cancelled');
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


test('reference row uses structured source, Finding title, neutral priority and avatar with Due before Status',async()=>{
  records={tasks:[task('native-work',{title:'Native work title',finding_id:'native-finding',priority:'medium',assignee_id:'eligible',due_date:'2026-11-20'})],findings:[finding('native-finding',{title:'Short native Finding title',description:'Long detail remains inside the full native record',framework_assessment_id:'assess'})],framework_assessments:[{client_id:cid,framework_assessment_id:'assess',framework_key:'cis-ig1',definition_id:'14.1'}]};
  await render();const row=tickets()[0];
  expect(row.querySelector('.bda-title').textContent).toBe('Native work title');
  expect(row.querySelector('.bda-origin button').textContent).toBe('CIS 14.1');
  expect(row.textContent).toContain('Finding: Short native Finding title');
  expect(row.textContent).not.toContain('Long detail remains');
  expect(row.querySelector('.priority-badge').textContent).toBe('Medium');
  expect(row.querySelector('.bda-bars')).toBeNull();
  expect(row.querySelector('.bda-avatar').textContent).toBe('EO');
  const columns=[...row.children];expect(columns.indexOf(row.querySelector('.bda-due'))).toBeLessThan(columns.indexOf(row.querySelector('.bda-stage')));
  await click(row);expect(mockDrawer.record.description).toBe('Long detail remains inside the full native record');
});

 test.each(['selection','route'])('shared appearance boundary excludes mismatched %s identity',async mismatch=>{
 if(mismatch==='selection')sessionStorage.setItem('grc_client_id','another-client');
 await render(mismatch==='route'?'/action-items?client_id=another-client':'/action-items');
 expect(container.querySelector('[data-testid="native-register"]')).not.toBeNull();
 expect(container.querySelector('.brawndo-demo-actions')).toBeNull();
 });


test('quarter browsing preserves native overdue filters, cards and register while exact saved Actions remain independently reachable',async()=>{
  jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-18T12:00:00'));
  const original=HTMLElement.prototype.getBoundingClientRect;
  const geometry=jest.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return this.classList.contains('plot')?{width:1100,height:220,left:0,right:1100,top:0,bottom:220}:original.call(this);});
  try{
    records={tasks:[task('late',{due_date:'2026-10-01',priority:'low'}),task('later',{due_date:'2027-01-01',priority:'high'}),task('unscheduled')],findings:[]};
    await render('/action-items?view=active&quick=overdue');
    await click(button('This quarter'));
    expect(container.querySelector('.bda-runway')).toBeNull();expect([...container.querySelectorAll('.review-dot')].map(node=>node.dataset.actionId)).toEqual(['late']);
    expect(tickets()).toHaveLength(1);const before=location.search;
    const protectedBefore={cards:container.querySelector('.bda-summary').outerHTML,register:container.querySelector('.bda-register').outerHTML};
    const point=container.querySelector('.review-dot');expect(point.getAttribute('aria-label')).toContain('Low');
    await act(async()=>point.focus());expect(location.search).toBe(before);
    await click(container.querySelector('[aria-label="Next quarter"]'));
    expect(container.querySelector('.quarter-controls').textContent).toContain('Q1 2027');
    expect({cards:container.querySelector('.bda-summary').outerHTML,register:container.querySelector('.bda-register').outerHTML}).toEqual(protectedBefore);
    expect(location.search).toBe(before);expect(tickets()[0].textContent).toContain('Action late');
    await click(container.querySelector('.agenda-entry'));
    expect(mockDrawer.kind).toBe('tasks');expect(mockDrawer.record.task_id).toBe('later');
    expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  }finally{geometry.mockRestore();jest.useRealTimers();}
});

test('a secondary Action marker opens that exact native Action rather than the linked Finding primary',async()=>{
  jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-18T12:00:00'));
  const original=HTMLElement.prototype.getBoundingClientRect;
  const geometry=jest.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return this.classList.contains('plot')?{width:1100,height:220,left:0,right:1100,top:0,bottom:220}:original.call(this);});
  try{
    records={findings:[finding('issue',{primary_task_id:'primary',severity:'critical',status:'in_remediation'})],tasks:[
      task('primary',{finding_id:'issue',priority:'low',due_date:'2026-11-05'}),
      task('secondary',{finding_id:'issue',priority:'high',due_date:'2026-11-12'}),
    ]};
    await render();
    await click(button('This quarter'));
    await click(container.querySelector('[data-action-id="secondary"]'));
    expect(mockDrawer).toBeNull();expect(document.querySelectorAll('.date-review')).toHaveLength(1);
    await click(document.querySelector('.date-review'));
    expect(mockDrawer.kind).toBe('tasks');expect(mockDrawer.record).toBe(records.tasks[1]);
    expect(new URLSearchParams(location.search).get('task_id')).toBe('secondary');
    expect(new URLSearchParams(location.search).has('finding_id')).toBe(false);
    expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  }finally{geometry.mockRestore();jest.useRealTimers();}
});

test('new due-in-30 card retains native date filtering and clears pagination without writes',async()=>{
  const date=new Date();date.setUTCDate(date.getUTCDate()+12);const due=date.toISOString().slice(0,10);
  records={tasks:[...Array.from({length:12},(_,i)=>task(String(i),{due_date:due})),task('undated')],findings:[]};
  await render('/action-items?page=2');expect(summary('upcoming')).toBe('12');
  await click(container.querySelector('.bda-upcoming'));
  expect(new URLSearchParams(location.search).get('quick')).toBe('upcoming');expect(new URLSearchParams(location.search).has('page')).toBe(false);expect(tickets()).toHaveLength(10);
  await click(container.querySelector('.bda-upcoming'));expect(new URLSearchParams(location.search).has('quick')).toBe(false);
  expect(summary('active')).toBe('13');expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('native cards, register badges and overview advance together at local midnight without writes',async()=>{
  jest.useFakeTimers();jest.setSystemTime(new Date(2026,9,24,23,59,59));
  try{
    records={tasks:[task('today',{due_date:'2026-10-24',priority:'medium'})],findings:[]};
    await render();
    expect(summary('overdue')).toBe('0');expect(summary('upcoming')).toBe('1');
    expect(container.querySelector('.bda-due').textContent).toContain('Due today');
    await act(async()=>{jest.advanceTimersByTime(2000);});
    expect(summary('overdue')).toBe('1');expect(summary('upcoming')).toBe('0');
    expect(container.querySelector('.bda-due').textContent).toContain('1 day overdue');
    expect(container.querySelector('[data-mode="overdue"]').textContent).toContain('1');
    expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  }finally{jest.useRealTimers();}
});

test('priority sorting uses saved Action priority without inheriting Finding-only severity',async()=>{
  records={tasks:[task('own-low',{priority:'low'})],findings:[finding('no-action',{severity:'critical'})]};
  await render('/action-items?sort=priority');
  expect(tickets().map(row=>row.dataset.ticketId)).toEqual(['task:own-low','finding:no-action']);
  expect(tickets()[0].querySelector('.priority-badge').textContent).toBe('Low');
  expect(tickets()[1].querySelector('.priority-badge').textContent).toBe('Unclassified');
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
test.each(['overdue','next14','15_30','31_60','later'])('native %s deep filter remains available after removing the runway presentation',async key=>{
 records={tasks:Array.from({length:12},(_,i)=>task(String(i),{due_date:'2099-01-01'})),findings:[]};
 await render(`/action-items?view=active&quick=${key}`);
 expect(new URLSearchParams(location.search).get('quick')).toBe(key);
 expect(tickets()).toHaveLength(key==='later'?10:0);
 expect(summary('active')).toBe('12');expect(container.querySelector('.bda-runway')).toBeNull();
 expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
