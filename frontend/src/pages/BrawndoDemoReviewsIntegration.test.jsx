import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import api from '@/lib/api';
import {cisClient as mockCisClient} from '@/testUtils/cisExperience';
let mockReviewSearch='',mockOrgLoading=false,mockWorkspaceMode='demo',mockDrawerMounts=0,mockNativeProps,mockRows,mockClient;
const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:mockWorkspaceMode,loading:false})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'demo_brawndo',currentClient:mockClient,clients:[mockClient],loading:mockOrgLoading})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),delete:jest.fn()},formatError:error=>error.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/reviews',search:mockReviewSearch}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams())}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>function NativeDrawer(props){mockNativeProps=props;const React=require('react');const [value,setValue]=React.useState('Native unsaved draft');React.useEffect(()=>{mockDrawerMounts++;},[]);return props.open?<textarea aria-label="Native draft" value={value} onChange={event=>setValue(event.target.value)}/>:null;});
let root,container;
const one=(selector,scope=container)=>{const nodes=scope.querySelectorAll(selector);expect(nodes).toHaveLength(1);return nodes[0];};
const historyButton=()=>{const group=one('.crr-root .register-heading [aria-label="Records"]');const buttons=[...group.querySelectorAll('button')];expect(buttons).toHaveLength(2);const matches=buttons.filter(button=>button.textContent==='History');expect(matches).toHaveLength(1);return matches[0];};
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{localStorage.setItem('grc_client_id','demo_brawndo');sessionStorage.setItem('grc_client_id','demo_brawndo');global.IS_REACT_ACT_ENVIRONMENT=true;mockOrgLoading=false;mockReviewSearch='';mockWorkspaceMode='demo';mockDrawerMounts=0;mockClient={...mockCisClient(),name:'Brawndo'};mockRows=[{review_id:'review',client_id:'demo_brawndo',title:'Actual Review',status:'upcoming',recurrence:'monthly',due_date:'2026-10-31'}];container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);api.get.mockImplementation(async path=>({data:path==='/reviews'?mockRows:[]}));api.delete.mockResolvedValue({data:{}});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();mockUser.user_id='admin';jest.clearAllMocks();});

test.each(['unconfigured','general','hipaa','nist-csf-2','cmmc'])('%s common History keeps parent rows, native due ordering and current-record opening',async framework=>{
  mockClient={client_id:'demo_brawndo',name:'Synthetic common client',status:'active',shared_programs:[],
    onboarding_baseline:{completed:framework!=='unconfigured',requirements:['unconfigured','general'].includes(framework)?{}:{[framework]:'applies'}}};
  const occurrence={occurrence_id:'historical-only',status:'completed',title:'Old occurrence title',due_date:'2026-08-01',completed_at:'2026-10-25',completed_by_name:'Saved occurrence actor'};
  const completed={review_id:'closed-parent',client_id:'demo_brawndo',title:'Later completed parent',status:'completed',recurrence:'annual',due_date:'2020-12-01',current_occurrence_id:'parent-current',occurrences:[occurrence]};
  const cancelled={...completed,review_id:'cancelled-parent',title:'Earlier cancelled parent',status:'cancelled',due_date:'2020-11-01',occurrences:[]};
  mockRows=[completed,cancelled,{...completed,review_id:'recurring-active',title:'Active parent with older history',status:'upcoming'}];
  const before=JSON.stringify(mockRows);await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('[data-visual-surface="reviews"]')).toBeTruthy();
  await act(async()=>historyButton().click());
  expect([...container.querySelectorAll('.register tbody .bdr-name')].map(node=>node.textContent)).toEqual(['Earlier cancelled parent','Later completed parent']);
  expect(container.querySelector('.register').textContent).not.toContain('Old occurrence title');
  expect(container.querySelector('.register').textContent).not.toContain('Active parent with older history');
  expect(container.querySelector('.register').textContent).not.toContain('Saved occurrence actor');
  expect(container.querySelectorAll('.register .overdue-row')).toHaveLength(0);
  expect(container.querySelectorAll('.register .due-badge')).toHaveLength(0);
  expect(container.querySelector('.register').textContent).not.toContain('Next cycle');
  expect([...container.querySelectorAll('[aria-label="Sort reviews"] option')].some(node=>node.value==='completed_at:desc')).toBe(false);
  await act(async()=>container.querySelectorAll('.register tbody .bdr-name')[1].click());
  expect(mockNativeProps.record).toBe(completed);expect(mockNativeProps.initialValues.occurrence).toBeUndefined();
  expect(mockNativeProps.reviewsPilot).toBe(false);expect(JSON.stringify(mockRows)).toBe(before);
  for(const method of ['post','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test.each(['completed','cancelled'])('native All-tab %s filter keeps closed parent dates and current-record identity without overdue/next-cycle claims',async status=>{
  // Native table preferences are session scoped; isolate each synthetic actor's filter state.
  mockUser.user_id=`native-status-${status}`;
  mockClient={client_id:'demo_brawndo',name:'Synthetic General client',status:'active',shared_programs:[],
    onboarding_baseline:{completed:true,requirements:{}}};
  const closed={review_id:`closed-${status}`,client_id:'demo_brawndo',title:`Saved ${status} parent`,status,recurrence:'annual',due_date:'2020-10-01',
    current_occurrence_id:'native-parent-current',occurrences:[{occurrence_id:'old-execution',status:'completed',due_date:'2019-10-01',completed_at:'2019-10-02'}]};
  mockRows=[closed,{...closed,review_id:'active-parent',title:'Active overdue parent',status:'upcoming',occurrences:[]}];
  const before=JSON.stringify(mockRows);await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('.register .bdr-name').textContent).toBe('Active overdue parent');
  expect(container.querySelectorAll('.register .overdue-row')).toHaveLength(1);
  await act(async()=>container.querySelector('.bdr-more summary').click());
  const control=one('[aria-label="Status: sort and filter"]');
  await act(async()=>control.dispatchEvent(new MouseEvent('pointerdown',{button:0,ctrlKey:false,bubbles:true})));
  const choice=[...document.querySelectorAll('[role="menuitemcheckbox"]')].find(node=>node.textContent===(status==='completed'?'Completed':'Cancelled'));
  expect(choice).toBeTruthy();await act(async()=>choice.click());
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(historyButton().getAttribute('aria-pressed')).toBe('false');
  expect([...container.querySelectorAll('.register tbody .bdr-name')].map(node=>node.textContent)).toEqual([closed.title]);
  const row=one('.register tbody .bdr-trow');expect(row.classList.contains('overdue-row')).toBe(false);
  expect(row.querySelector('.due-badge')).toBeNull();expect(row.textContent).not.toContain('Next cycle');
  expect(row.querySelector('time').dateTime).toBe(closed.due_date);
  await act(async()=>row.querySelector('.bdr-name').click());
  expect(mockNativeProps.record).toBe(closed);expect(mockNativeProps.initialValues.occurrence).toBeUndefined();
  expect(JSON.stringify(mockRows)).toBe(before);for(const method of ['post','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test('same-client authorization recheck preserves the native drawer instance and its draft',async()=>{
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('[data-visual-surface="reviews"]')).toBeTruthy();
  await act(async()=>container.querySelector('.bdr-name').click());
  const draft=container.querySelector('[aria-label="Native draft"]'),mounts=mockDrawerMounts;
  const themeAction=one('.crr-root .page-actions .surface-theme-action'),previousTheme=one('.crr-root[data-visual-surface="reviews"]').dataset.theme;
  await act(async()=>themeAction.click());expect(one('.crr-root[data-visual-surface="reviews"]').dataset.theme).toBe(previousTheme==='dark'?'light':'dark');expect(container.querySelector('[aria-label="Native draft"]')).toBe(draft);expect(mockDrawerMounts).toBe(mounts);
  mockOrgLoading=true;await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('[data-visual-surface="reviews"]')).toBeNull();
  expect(container.querySelector('[aria-label="Native draft"]')).toBe(draft);
  mockOrgLoading=false;await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('[aria-label="Native draft"]')).toBe(draft);expect(mockDrawerMounts).toBe(mounts);
  expect(draft.value).toBe('Native unsaved draft');expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});
test('mismatched standard mode with Demo actor keeps the original register presentation',async()=>{
  mockWorkspaceMode='standard';await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('[data-visual-surface="reviews"]')).toBeNull();expect(container.querySelector('.register-surface')).toBeTruthy();
});
test('History native menu opens the exact occurrence while Delete retains the parent identity and version',async()=>{
  const occurrence={occurrence_id:'original-execution',status:'completed',updated_at:'old-execution-version',due_date:'2026-09-30',completed_at:'2026-10-01'};
  mockRows=[{...mockRows[0],updated_at:'current-parent-version',occurrences:[occurrence]}];
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  await act(async()=>historyButton().click());
  const openMenu=async()=>act(async()=>container.querySelector('[aria-label="Row actions"]').dispatchEvent(new MouseEvent('pointerdown',{button:0,bubbles:true})));
  await openMenu();
  const openItem=[...document.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent.includes('Open / edit'));
  expect(openItem).toBeTruthy();await act(async()=>openItem.click());
  expect(mockNativeProps.record).toBe(mockRows[0]);expect(mockNativeProps.initialValues.occurrence).toBe(occurrence);
  await act(async()=>mockNativeProps.onOpenChange(false));
  await openMenu();const deletion=[...document.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent.includes('Delete'));
  const confirm=jest.spyOn(window,'confirm').mockReturnValue(true);await act(async()=>deletion.click());confirm.mockRestore();
  expect(api.delete).toHaveBeenCalledWith('/reviews/review',{data:{expected_updated_at:'current-parent-version'}});
});

test('historical quarter preserves cards and register while native History opens the original saved occurrence',async()=>{
  jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-18T12:00:00'));
  const original=HTMLElement.prototype.getBoundingClientRect;
  const geometry=jest.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return this.classList.contains('plot')?{width:1100,height:220,left:0,right:1100,top:0,bottom:220}:original.call(this);});
  try{
    const execution={occurrence_id:'saved-quarterly',review_id:'review',client_id:'demo_brawndo',
      title:'Original saved quarterly Review',recurrence:'quarterly',status:'completed',due_date:'2026-09-30',
      completed_at:'2026-10-01T10:00:00Z',evidence:[{evidence_id:'saved-evidence'}],notes:'Original occurrence notes'};
    mockRows=[{...mockRows[0],title:'Renamed current monthly Review',updated_at:'current-parent-version',occurrences:[execution]}];
    const before=JSON.stringify(mockRows);
    await act(async()=>root.render(<RecordListPage kind="reviews"/>));
    const protectedBefore={cards:one('.crr-root .kpis').outerHTML,register:one('.crr-root .register').outerHTML};
    await act(async()=>container.querySelector('[aria-label="Previous quarter"]').click());
    expect(one('.crr-overview .quarter-controls > strong').textContent).toContain('Q3 2026');
    expect({cards:one('.crr-root .kpis').outerHTML,register:one('.crr-root .register').outerHTML}).toEqual(protectedBefore);
    // Approved concept plots saved current unresolved occurrences; completed executions stay in native History.
    expect(container.querySelectorAll('.crr-overview [data-date="2026-09-30"] .review-dot')).toHaveLength(0);
    expect(container.querySelectorAll('.crr-overview .review-dot')).toHaveLength(0);
    await act(async()=>historyButton().click());
    const historyRow=one('.crr-root .register .bdr-name');
    expect(historyRow.textContent).toBe('Original saved quarterly Review');
    await act(async()=>historyRow.click());
    expect(mockNativeProps.record).toBe(mockRows[0]);expect(mockNativeProps.initialValues.occurrence).toBe(execution);
    expect(mockNativeProps.initialValues.occurrence.evidence).toBe(execution.evidence);
    await act(async()=>mockNativeProps.onOpenChange(false));
    expect(one('.crr-overview .quarter-controls > strong').textContent).toContain('Q3 2026');
    expect(JSON.stringify(mockRows)).toBe(before);
    for(const verb of ['post','patch','delete'])expect(api[verb]).not.toHaveBeenCalled();
  }finally{geometry.mockRestore();jest.useRealTimers();}
});


test('unresolved saved Q3 occurrence opens its exact native Review from the concept date list',async()=>{
  jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-18T12:00:00'));
  try{
    const occurrence={occurrence_id:'unresolved-q3-occurrence',status:'upcoming',due_date:'2026-09-30'};
    mockRows=[{review_id:'unresolved-q3-review',client_id:'demo_brawndo',current_occurrence_id:'unresolved-q3-occurrence',
      title:'Saved unresolved quarterly Review',status:'upcoming',recurrence:'quarterly',due_date:'2026-09-30',occurrences:[occurrence]}];
    const before=JSON.stringify(mockRows);
    await act(async()=>root.render(<RecordListPage kind="reviews"/>));
    await act(async()=>one('[aria-label="Previous quarter"]').click());
    expect(one('.crr-overview .quarter-controls > strong').textContent).toBe('Q3 2026');
    const marker=one('.crr-overview [data-date="2026-09-30"] .review-dot');
    expect(marker.getAttribute('aria-label')).toContain('Saved unresolved quarterly Review');
    expect(marker.querySelectorAll('.dot')).toHaveLength(1);expect(marker.querySelector('b')).toBeNull();
    await act(async()=>marker.click());
    const choice=one('.crr-list .date-review',document);
    expect(choice.textContent).toContain('Saved unresolved quarterly Review');
    await act(async()=>choice.click());
    expect(mockNativeProps.record).toBe(mockRows[0]);
    expect(mockNativeProps.record).toMatchObject({review_id:'unresolved-q3-review',client_id:'demo_brawndo',current_occurrence_id:'unresolved-q3-occurrence'});
    await act(async()=>mockNativeProps.onOpenChange(false));
    expect(one('.crr-overview .quarter-controls > strong').textContent).toBe('Q3 2026');
    expect(JSON.stringify(mockRows)).toBe(before);
    for(const verb of ['post','patch','delete'])expect(api[verb]).not.toHaveBeenCalled();
  }finally{jest.useRealTimers();}
});

 test.each(['selection','route'])('shared appearance boundary excludes mismatched %s identity',async mismatch=>{
 if(mismatch==='selection')sessionStorage.setItem('grc_client_id','another-client');else mockReviewSearch='?client_id=another-client';
 await act(async()=>root.render(<RecordListPage kind="reviews"/>));
 expect(container.querySelector('[data-visual-surface="reviews"]')).toBeNull();expect(container.querySelector('.register-surface')).not.toBeNull();
 });
