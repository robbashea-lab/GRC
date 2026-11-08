import {rememberClient} from '@/lib/clientSelection';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RiskRegister,{RISK_SCORE_MAX} from './RiskRegister';
import api from '@/lib/api';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import {cisClientProgram} from '@/lib/cisExperience';
import {brawndoFullRecordEligible} from '@/lib/brawndoFullRecord';
// Common register appearance is independent of enrollment; native Risk controls remain authoritative.
let mockClient='demo_dunder';
let mockSearch='';
const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:mockUser.workspace_mode,loading:false})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>{const client={client_id:mockClient,name:'Non-CIS test client',status:'active',cis_program:{client_id:mockClient,program_id:`${mockClient}:cis-ig1`,framework_key:'cis-ig1',version:'8.1',selected:false,implementation_group:1}};return {currentClientId:mockClient,currentClient:client,clients:[client],loading:false};}}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()},formatError:e=>e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/risks',search:mockSearch}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams(mockSearch))}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>()=>null);
let root,container,rows;
const click=async node=>act(async()=>node.click());
const openFilters=async()=>{if(!container.querySelector('[aria-label="Risk filters"]'))await click(container.querySelector('.filter-button'));};
const rowTitles=()=>[...container.querySelectorAll('#actionRows .risk-title')].map(node=>node.textContent);
function expectNoProgramCommands(){
 const context={...useOrg(),...useAuth(),pathname:'/risks',clientId:mockClient,selectedClientId:mockClient};
 expect(cisClientProgram(context.currentClient)).toBeNull();
 expect(brawndoFullRecordEligible(context)).toBe(false);
}
beforeEach(()=>{
 // Keep the existing UTC management day fixed, including an evening in western time zones.
 jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-14T00:30:00Z'));
 global.IS_REACT_ACT_ENVIRONMENT=true;mockClient='demo_dunder';mockSearch='';mockUser.workspace_mode='demo';sessionStorage.clear();localStorage.clear();rememberClient(mockClient);
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 rows=[{risk_id:'late',client_id:mockClient,title:'Late risk',status:'open',next_review:'2020-01-01',likelihood_score:3,impact_score:4},{risk_id:'undated',client_id:mockClient,title:'Undated risk',status:'open'},{risk_id:'closed',client_id:mockClient,title:'Closed risk',status:'closed'}];
 api.get.mockImplementation(async path=>({data:path==='/risks'?rows:[]}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();jest.useRealTimers();});

test('retained significant-risk deep link exposes its native scope in common filters and can be cleared',async()=>{
 mockSearch='?view=significant';mockUser.workspace_mode='standard';
 await act(async()=>root.render(<RiskRegister/>));
 expect(container.querySelector('[data-testid="cis-risks-concept"]')).not.toBeNull();
 expect(container.querySelector('tbody').textContent).not.toContain('Undated risk');
 await openFilters();
 const significant=container.querySelector('[data-testid="risk-view-significant"]');
 expect(significant.textContent).toBe('High or critical');expect(significant.getAttribute('aria-pressed')).toBe('true');
 expect(container.querySelectorAll('[aria-label="Risk views"] button')).toHaveLength(8);
 await click(container.querySelector('#clearFilters'));
 expect(container.querySelector('[data-testid="risk-view-all_active"]').getAttribute('aria-pressed')).toBe('true');
 expect(container.querySelector('#clearFilters')).toBeNull();
 expect(container.querySelector('tbody').textContent).toContain('Undated risk');
 expectNoProgramCommands();expect(api.post).not.toHaveBeenCalled();
});
test('common presentation retains native filters and client isolation without inventing enrollment',async()=>{
 await act(async()=>root.render(<RiskRegister/>));
 expect(container.querySelector('[aria-label="Risk summaries"]')).not.toBeNull();
 await openFilters();
 expect([...container.querySelectorAll('[aria-label="Risk views"] button')].map(b=>b.textContent)).toEqual(['All active','High or critical','In treatment','Accepted','Review due in 30 days','Critical','High','Due for Review']);
 expect(container.querySelector('[data-testid="risk-view-closed"]')).not.toBeNull();
 await click(container.querySelector('[data-testid="risk-view-review_due"]'));
 expect(container.querySelector('tbody').textContent).toContain('Late risk');
 expect(container.querySelector('tbody').textContent).not.toContain('Undated risk');
 await click(container.querySelector('[data-testid="risk-view-high"]'));
 expect(container.querySelectorAll('#actionRows tr')).toHaveLength(1);
 expect(container.querySelector('.score-badge').textContent).toBe('12 · High');
 expectNoProgramCommands();
 mockClient='future_client';rememberClient(mockClient);mockUser.workspace_mode='standard';rows=rows.map(r=>({...r,client_id:mockClient,category:'operational'}));
 await act(async()=>root.render(<RiskRegister/>));
 expect(container.querySelector('.approved-risk-register')).not.toBeNull();
 expect(container.querySelector('tbody').textContent).not.toContain('Operational');
 expect(container.querySelectorAll('.risk-table thead th')).toHaveLength(6);
 expect(container.querySelector('[aria-label="Risk summaries"] .kpi-active strong').textContent).toBe('2');
 expect(api.get).toHaveBeenCalledWith('/risks',{params:{client_id:mockClient}});
 expectNoProgramCommands();expect(api.post).not.toHaveBeenCalled();
});

test('new risk has annual/undecided defaults and protects an unfinished draft',async()=>{
 await act(async()=>root.render(<RiskRegister/>));await click(container.querySelector('[data-testid="new-risk"]'));
 const dialog=document.querySelector('[role="dialog"]');
 expect(dialog.className).toContain('brawndo-cis-assessment');expect(dialog.textContent).toContain('Not Yet Decided');expect(dialog.textContent).toContain('Annual');
 expect(dialog.className).not.toContain('brawndo-risk-workflow');expectNoProgramCommands();
 await act(async()=>{const input=dialog.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Unsaved risk');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Cancel'));
 expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();expect(api.post).not.toHaveBeenCalled();
});

test('review filters partition authoritative dates for normal and Demo clients',async()=>{
 // Relative to UTC 2026-10-14: overdue, today, tomorrow, day 30, then day 31.
 const days={'-1':'2026-10-13','0':'2026-10-14','1':'2026-10-15','30':'2026-11-13','31':'2026-11-14'};
 for(const mode of ['demo','standard']){
  mockUser.workspace_mode=mode;
  rows=[-1,0,1,30,31].map(n=>({risk_id:String(n),client_id:mockClient,title:'Review '+n,status:'identified',next_review:days[n]}));
  await act(async()=>root.render(<RiskRegister key={mode}/>));
  await openFilters();
  await click(container.querySelector('[data-testid="risk-view-review_due"]'));
  expect(rowTitles()).toEqual(['Review -1','Review 0']);
  await click(container.querySelector('[data-testid="risk-view-upcoming"]'));
  expect(rowTitles()).toEqual(['Review 1','Review 30']);
  expectNoProgramCommands();
 }
 expect(RISK_SCORE_MAX).toBe(25);expect(api.post).not.toHaveBeenCalled();
});
