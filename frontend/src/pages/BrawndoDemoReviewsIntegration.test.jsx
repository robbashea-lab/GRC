import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordListPage from './RecordListPage';
import api from '@/lib/api';
import {cisClient as mockCisClient} from '@/testUtils/cisExperience';
let mockReviewSearch='',mockOrgLoading=false,mockWorkspaceMode='demo',mockDrawerMounts=0,mockNativeProps,mockRows;
const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:mockWorkspaceMode,loading:false})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'demo_brawndo',currentClient:{...mockCisClient(),name:'Brawndo'},clients:[mockCisClient()],loading:mockOrgLoading})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),delete:jest.fn()},formatError:error=>error.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/reviews',search:mockReviewSearch}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams())}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>function NativeDrawer(props){mockNativeProps=props;const React=require('react');const [value,setValue]=React.useState('Native unsaved draft');React.useEffect(()=>{mockDrawerMounts++;},[]);return props.open?<textarea aria-label="Native draft" value={value} onChange={event=>setValue(event.target.value)}/>:null;});
let root,container;
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{localStorage.setItem('grc_client_id','demo_brawndo');sessionStorage.setItem('grc_client_id','demo_brawndo');global.IS_REACT_ACT_ENVIRONMENT=true;mockOrgLoading=false;mockReviewSearch='';mockWorkspaceMode='demo';mockDrawerMounts=0;mockRows=[{review_id:'review',client_id:'demo_brawndo',title:'Actual Review',status:'upcoming',recurrence:'monthly',due_date:'2026-10-31'}];container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);api.get.mockImplementation(async path=>({data:path==='/reviews'?mockRows:[]}));api.delete.mockResolvedValue({data:{}});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('same-client authorization recheck preserves the native drawer instance and its draft',async()=>{
  await act(async()=>root.render(<RecordListPage kind="reviews"/>));
  expect(container.querySelector('[data-visual-surface="reviews"]')).toBeTruthy();
  await act(async()=>container.querySelector('.bdr-name').click());
  const draft=container.querySelector('[aria-label="Native draft"]'),mounts=mockDrawerMounts;
  const themeAction=container.querySelector('.bdr-head-actions .surface-theme-action'),previousTheme=container.querySelector('.brawndo-demo-reviews').dataset.theme;
  await act(async()=>themeAction.click());expect(container.querySelector('.brawndo-demo-reviews').dataset.theme).toBe(previousTheme==='dark'?'light':'dark');expect(container.querySelector('[aria-label="Native draft"]')).toBe(draft);expect(mockDrawerMounts).toBe(mounts);
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
  await act(async()=>[...container.querySelectorAll('.bdr-register .bdr-seg button')].find(button=>button.textContent==='History').click());
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

test('quarter chart opens the original saved historical occurrence without changing cards, register or current Review',async()=>{
  jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-18T12:00:00'));
  const original=HTMLElement.prototype.getBoundingClientRect;
  const geometry=jest.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return this.classList.contains('qpt-plot')?{width:1100,height:220,left:0,right:1100,top:0,bottom:220}:original.call(this);});
  try{
    const execution={occurrence_id:'saved-quarterly',review_id:'review',client_id:'demo_brawndo',
      title:'Original saved quarterly Review',recurrence:'quarterly',status:'completed',due_date:'2026-09-30',
      completed_at:'2026-10-01T10:00:00Z',evidence:[{evidence_id:'saved-evidence'}],notes:'Original occurrence notes'};
    mockRows=[{...mockRows[0],title:'Renamed current monthly Review',updated_at:'current-parent-version',occurrences:[execution]}];
    const before=JSON.stringify(mockRows);
    await act(async()=>root.render(<RecordListPage kind="reviews"/>));
    const protectedBefore={cards:container.querySelector('.bdr-kstrip').outerHTML,register:container.querySelector('.bdr-register').outerHTML};
    await act(async()=>container.querySelector('[aria-label="Previous quarter"]').click());
    expect(container.querySelector('.qpt-year').textContent).toContain('Q3 2026');
    expect({cards:container.querySelector('.bdr-kstrip').outerHTML,register:container.querySelector('.bdr-register').outerHTML}).toEqual(protectedBefore);
    const marker=container.querySelector('[data-group-id="2026-09-30:quarterly"]');
    expect(marker.querySelector('b').textContent).toBe('1');expect(marker.classList.contains('qpt-overdue')).toBe(false);
    await act(async()=>marker.click());
    expect(document.querySelector('.qpt-selection-row').textContent).toContain('Original saved quarterly Review');
    expect(document.querySelector('.qpt-selection-row').textContent).toContain('Completed Review occurrence');
    await act(async()=>document.querySelector('.qpt-selection-row').click());
    expect(mockNativeProps.record).toBe(mockRows[0]);expect(mockNativeProps.initialValues.occurrence).toBe(execution);
    expect(mockNativeProps.initialValues.occurrence.evidence).toBe(execution.evidence);
    await act(async()=>mockNativeProps.onOpenChange(false));
    expect(container.querySelector('.qpt-year').textContent).toContain('Q3 2026');
    expect(JSON.stringify(mockRows)).toBe(before);
    for(const verb of ['post','patch','delete'])expect(api[verb]).not.toHaveBeenCalled();
  }finally{geometry.mockRestore();jest.useRealTimers();}
});

 test.each(['selection','route'])('shared appearance boundary excludes mismatched %s identity',async mismatch=>{
 if(mismatch==='selection')sessionStorage.setItem('grc_client_id','another-client');else mockReviewSearch='?client_id=another-client';
 await act(async()=>root.render(<RecordListPage kind="reviews"/>));
 expect(container.querySelector('[data-visual-surface="reviews"]')).toBeNull();expect(container.querySelector('.register-surface')).not.toBeNull();
 });
