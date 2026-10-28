import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ActionItems from './ActionItems';
import api from '@/lib/api';
import {rememberClient} from '@/lib/clientSelection';
import {cisClientProgram} from '@/lib/cisExperience';
import {sharedClientPrograms} from '@/lib/sharedExperience';
import {frameworkCatalog} from '@/lib/frameworks';

let mockClient,mockUser,mockOrgLoading,mockDrawerProps,mockDrawerMounts,mockSearch;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:'demo',loading:false})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient.client_id,currentClient:mockClient,clients:[mockClient],loading:mockOrgLoading})}));
jest.mock('@/lib/api',()=>({__esModule:true,API:'/api',PREVIEW_MODE:true,
  default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('react-router-dom',()=>({
  Link:({children,to})=><a href={to}>{children}</a>,Navigate:()=>null,
  useLocation:()=>({pathname:'/action-items',search:mockSearch}),useNavigationType:()=> 'POP',
  useSearchParams:()=>require('react').useState(new URLSearchParams(mockSearch)),
}),{virtual:true});
// Verify native controller-to-drawer identity/props; command behavior has its own real-drawer suites.
jest.mock('@/components/RecordDrawer',()=>function NativeDrawer(props){
  mockDrawerProps=props;
  const React=require('react'),[draft,setDraft]=React.useState('Native draft');
  React.useEffect(()=>{mockDrawerMounts++;},[]);
  return props.open?<textarea aria-label="Native action draft" value={draft} onChange={event=>setDraft(event.target.value)}/>:null;
});

let host,root,records,sequence=0;
const renderedRows=()=>[...host.querySelectorAll('[data-testid^="ai-row-"]')];
const titles=()=>renderedRows().map(row=>row.querySelector('.register-record-link').textContent);
const click=node=>act(async()=>{expect(node).toBeTruthy();node.click();});
const render=()=>act(async()=>root.render(<ActionItems/>));
const enter=(node,value)=>act(async()=>{
  const prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
async function column(label,choice){
  const trigger=host.querySelector(`[aria-label="${label}"]`);expect(trigger).toBeTruthy();
  await act(async()=>trigger.dispatchEvent(new MouseEvent('pointerdown',{button:0,ctrlKey:false,bubbles:true})));
  const option=[...document.querySelectorAll('[role="menuitemcheckbox"]')].find(node=>node.textContent===choice);
  await click(option);
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
}
function client(framework){
  return {client_id:`common-work-${++sequence}`,name:'Synthetic client',status:'active',shared_programs:[],
    onboarding_baseline:{completed:framework!=='unconfigured',requirements:framework==='unconfigured'||framework==='general'?{}:{[framework]:'applies'}}};
}
function task(id,extra={}){
  return {task_id:id,client_id:mockClient.client_id,title:`Action ${id}`,status:'open',priority:'medium',due_date:'2026-11-01',source_type:'manual',...extra};
}
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{
  jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-27T12:00:00'));
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();
  mockClient=client('unconfigured');rememberClient(mockClient.client_id);
  mockUser={user_id:`native-actor-${sequence}`,role:'super_admin',workspace_mode:'demo'};
  mockOrgLoading=false;mockDrawerProps=null;mockDrawerMounts=0;mockSearch='';
  records={tasks:[task('native')],findings:[],reviews:[],risks:[],vendors:[],policies:[]};
  api.get.mockImplementation(async path=>({data:path==='/onboarding/state'?{assessments:[]}:
    path.endsWith('/members')?[{user_id:'former-owner',name:'Saved owner',assignment_eligible:false}]:records[path.slice(1)]||[]}));
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());host.remove();
  for(const method of ['post','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
  jest.clearAllMocks();jest.useRealTimers();
});

test.each(['unconfigured','general','hipaa','nist-csf-2','cmmc'])('%s common appearance keeps native controls and saved record opening without framework capability',async framework=>{
  mockClient=client(framework);rememberClient(mockClient.client_id);records.tasks=[task('native')];
  await render();
  expect(host.querySelector('.cia-register')).toBeTruthy();
  expect(host.querySelector('.brawndo-demo-actions')).toBeNull();
  expect(cisClientProgram(mockClient)).toBeNull();expect(sharedClientPrograms(mockClient)).toEqual([]);
  for(const label of ['Action Item: sort and filter','Priority: filter','Assigned To: filter','Due Date: sort and filter','Status: filter','Source: filter']){
    expect(host.querySelector(`[aria-label="${label}"]`)).toBeTruthy();
  }
  await click(host.querySelector('.register-record-link'));
  expect(mockDrawerProps.kind).toBe('tasks');expect(mockDrawerProps.record).toBe(records.tasks[0]);
  expect(mockDrawerProps.presentation).toBeUndefined();
});

test('missing owners, completed history and open high Finding populations retain the native definitions',async()=>{
  records.tasks=[task('missing'),task('assigned',{assignee_id:'former-owner'}),task('done',{status:'done'}),task('cancelled',{status:'cancelled'}),
    task('accepted-finding-action',{finding_id:'accepted-with-open-action'})];
  records.findings=[{finding_id:'accepted',client_id:mockClient.client_id,title:'Accepted Finding',status:'accepted',severity:'high'},
    {finding_id:'accepted-with-open-action',client_id:mockClient.client_id,title:'Accepted with open Action',status:'accepted',severity:'critical'},
    {finding_id:'open-high',client_id:mockClient.client_id,title:'Open high Finding',status:'open',severity:'high'}];
  const before=JSON.stringify(records);await render();
  const ownerSummary=host.querySelector('.cia-summary .needs-owner');
  expect(ownerSummary.textContent).toContain('Missing owner');await click(ownerSummary);
  expect(titles()).toContain('Action missing');expect(titles()).not.toContain('Action assigned');
  await click(host.querySelector('[data-testid="ai-view-completed"]'));
  expect(new Set(titles())).toEqual(new Set(['Action done','Action cancelled','Accepted Finding']));
  expect(host.querySelector('th:nth-child(4)').textContent).toContain('Due Date');
  expect(host.textContent).not.toContain('Completion actor not recorded');
  await click(host.querySelector('[data-testid="ai-view-high_critical"]'));
  expect(titles()).toEqual(['Open high Finding']);
  expect(JSON.stringify(records)).toBe(before);
});

test.each(['iso-27001','soc-2'])('existing enrolled %s keeps its approved alternate Action controller and popup mode',async framework=>{
  mockClient=client(framework);rememberClient(mockClient.client_id);
  mockClient.shared_programs=[{client_id:mockClient.client_id,program_id:`${mockClient.client_id}:${framework}`,
    framework_key:framework,version:frameworkCatalog(framework).version,selected:true}];
  records.tasks=[task('enrolled')];await render();
  expect(host.querySelector('.brawndo-demo-actions')).toBeTruthy();
  await click(host.querySelector('.bda-title'));
  expect(mockDrawerProps.record).toBe(records.tasks[0]);expect(mockDrawerProps.presentation).toBe('brawndo-demo-actions');
});

test('native exact-source and date/priority/owner column filters remain independently usable',async()=>{
  records.reviews=[{review_id:'review-a',client_id:mockClient.client_id,title:'Review A',current_occurrence_id:'occ-a'},
    {review_id:'review-b',client_id:mockClient.client_id,title:'Review B',current_occurrence_id:'occ-b'}];
  records.tasks=[task('a',{review_id:'review-a',occurrence_id:'occ-a',priority:'high',assignee_id:'former-owner',due_date:'2026-10-26'}),
    task('b',{review_id:'review-b',occurrence_id:'occ-b',priority:'low',due_date:'2026-11-10'})];
  await render();await column('Source: filter','Review A');expect(titles()).toEqual(['Action a']);
  await click(host.querySelector('[aria-label="Remove Source: Review A"]'));
  expect(titles()).toEqual(['Action a','Action b']);
  await column('Priority: filter','High');expect(titles()).toEqual(['Action a']);
  await click(host.querySelector('[aria-label="Remove Priority: High"]'));
  await column('Assigned To: filter','Saved owner');expect(titles()).toEqual(['Action a']);
  await click(host.querySelector('[aria-label="Remove Assigned To: Saved owner"]'));
  await column('Due Date: sort and filter','Overdue');expect(titles()).toEqual(['Action a']);
});

test('common page authorization refresh keeps the original native drawer instance and draft',async()=>{
  await render();await click(host.querySelector('.register-record-link'));
  const draft=host.querySelector('[aria-label="Native action draft"]'),mounts=mockDrawerMounts;
  await enter(draft,'Unsaved native edits');
  mockOrgLoading=true;await render();
  expect(host.querySelector('[aria-label="Native action draft"]')).toBe(draft);
  mockOrgLoading=false;await render();
  expect(host.querySelector('[aria-label="Native action draft"]')).toBe(draft);
  expect(draft.value).toBe('Unsaved native edits');expect(mockDrawerMounts).toBe(mounts);
});

test('read-only common client retains native record opening while creation remains denied',async()=>{
  mockUser={...mockUser,role:'client_readonly'};await render();
  expect(host.querySelector('[data-testid="new-action-item"]')).toBeNull();
  expect([...host.querySelectorAll('button')].some(button=>button.textContent==='New finding')).toBe(false);
  await click(host.querySelector('.register-record-link'));
  expect(mockDrawerProps.record).toBe(records.tasks[0]);expect(mockDrawerProps.presentation).toBeUndefined();
});
