import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoActionItems from './BrawndoActionItems';
import {displayDay,displayRecordedAt} from '@/lib/managementDates';

let mockEligible=true;
let mockNativeProps;
const mockReturnFocus=jest.fn();
const mockRows=jest.requireActual('@/lib/brawndoActions').unifiedActions({tasks:[
  {task_id:'unassigned',client_id:'client',title:'Missing owner',priority:'medium',status:'open',source_type:'manual'},
  {task_id:'historical-owner',client_id:'client',title:'Unavailable owner retained',owner_id:'former',priority:'high',status:'open',source_type:'manual'},
]},'client');
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'reader',role:'client_readonly'},workspaceMode:'standard'})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'client',currentClient:{client_id:'client',name:'Client'}})}));
// This suite isolates the reader controller from enrollment; shared eligibility owns rollout.
jest.mock('@/lib/sharedExperience',()=>({...jest.requireActual('@/lib/sharedExperience'),sharedExperienceEligible:()=>mockEligible}));
jest.mock('@/lib/brawndoActions',()=>({...jest.requireActual('@/lib/brawndoActions'),unifiedActions:()=>mockRows}));
jest.mock('@/lib/useActionRegisterData',()=>({useActionRegisterData:()=>({data:{},users:[],loading:false,error:null,load:jest.fn()})}));
jest.mock('react-router-dom',()=>({Navigate:()=>null,useLocation:()=>({state:null}),useNavigationType:()=> 'POP',useSearchParams:()=>require('react').useState(new URLSearchParams())}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>({__esModule:true,default:props=>{mockNativeProps=props;return <div data-testid="native-record">{props.kind}:{props.record.task_id}</div>;}}));
jest.mock('@/components/CisActionItemsConcept',()=>({
  useActionConceptClock:()=>new Date(),
  CisActionItemsSummary:({metrics,onSelect})=><button data-testid="owner-summary" onClick={()=>onSelect('unassigned')}>{metrics.needsOwner.length}</button>,
  CisActionItemsOverview:({onOpen})=><button data-testid="concept-open" onClick={()=>onOpen({task:mockRows[1].raw},mockReturnFocus)}>Open saved action</button>,
  ActionConceptPriority:({value})=><span data-testid="concept-priority">{value}</span>,
  ActionConceptDue:()=>null,
}));

let root,container;
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockEligible=true;mockRows.splice(2);mockNativeProps=null;mockReturnFocus.mockClear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test('eligible shared reader preserves missing-only owner destination and opens exact native saved Action',async()=>{
  await act(async()=>root.render(<BrawndoActionItems/>));
  expect(container.querySelector('.cia-register')).toBeTruthy();
  expect(container.querySelector('[data-testid="new-action-item"]')).toBeNull();
  expect(container.querySelector('[data-testid="owner-summary"]').textContent).toBe('1');
  await act(async()=>container.querySelector('[data-testid="owner-summary"]').click());
  expect(container.querySelectorAll('[data-testid^="ai-row-"]')).toHaveLength(1);
  expect(container.querySelector('[data-testid="ai-row-0"]').textContent).toContain('Missing owner');
  await act(async()=>container.querySelector('[data-testid="concept-open"]').click());
  expect(container.querySelector('[data-testid="native-record"]').textContent).toBe('tasks:historical-owner');
  expect(mockNativeProps.onReturnFocus).toBe(mockReturnFocus);
});

test('ordinary register opens preserve the native focus owner',async()=>{
  await act(async()=>root.render(<BrawndoActionItems/>));
  await act(async()=>container.querySelector('[data-testid="concept-open"]').click());
  await act(async()=>mockNativeProps.onOpenChange(false));
  await act(async()=>container.querySelector('.register-record-link').click());
  expect(mockNativeProps.onReturnFocus).toBeUndefined();
});

test('ineligible shared controller retains native register structure and presentation',async()=>{
  mockEligible=false;await act(async()=>root.render(<BrawndoActionItems/>));
  expect(container.querySelector('.cia-page')).toBeNull();
  expect(container.querySelector('.cia-register')).toBeNull();
  expect(container.querySelector('[data-testid="concept-priority"]')).toBeNull();
  expect(container.querySelector('[data-testid="owner-summary"]')).toBeNull();
  expect(container.querySelector('[data-testid="concept-open"]')).toBeNull();
  expect(container.querySelector('[data-testid="new-action-item"]')).toBeNull();
  expect(container.querySelector('.register-toolbar').previousElementSibling.querySelector('h1').textContent).toBe('Action Items');
});

test('eligible Completed rows keep recorded work completion separate from Finding validation',async()=>{
  const completed={task_id:'completed',client_id:'client',title:'Completed Action',status:'done',finding_id:'validated',completed_at:'2026-10-20',completed_by:'Historical Actor',due_date:'2020-01-01'};
  const missing={task_id:'missing-completion',client_id:'client',title:'Undated completion',status:'done',finding_id:'also-validated',due_date:'2020-01-01'};
  mockRows.push(...jest.requireActual('@/lib/brawndoActions').unifiedActions({tasks:[completed,missing],findings:[
    {finding_id:'validated',client_id:'client',status:'closed',primary_task_id:'completed',validated_at:'2026-10-23'},
    {finding_id:'also-validated',client_id:'client',status:'closed',primary_task_id:'missing-completion',validated_at:'2026-10-24'},
  ]},'client'));
  await act(async()=>root.render(<BrawndoActionItems/>));
  const completedTab=[...container.querySelectorAll('.cia-tabs button')].find(node=>node.textContent==='Completed');
  await act(async()=>completedTab.click());
  const rows=[...container.querySelectorAll('[data-testid^="ai-row-"]')];
  const saved=rows.find(node=>node.textContent.includes('Completed Action'));
  const absent=rows.find(node=>node.textContent.includes('Undated completion'));
  expect(saved.textContent).toContain('by Historical Actor');
  expect(saved.querySelector('td:nth-child(4)').textContent).toContain(displayRecordedAt('2026-10-20'));
  expect(saved.querySelector('.validation-date').textContent).toBe('Finding validated '+displayDay('2026-10-23'));
  expect(absent.textContent).toContain('Completion date not recorded');
  expect(absent.textContent).toContain('Completion actor not recorded');
  expect(absent.querySelector('.validation-date').textContent).toBe('Finding validated '+displayDay('2026-10-24'));
  expect(rows.every(node=>!node.classList.contains('overdue-row'))).toBe(true);
  // Due-date sorting/filtering stays explicitly available rather than pretending to sort completion dates.
  expect(container.querySelector('th:nth-child(4)').textContent).toContain('Completed');
  expect(container.querySelector('th:nth-child(4) .column-control').textContent).toContain('Due Date');
});
