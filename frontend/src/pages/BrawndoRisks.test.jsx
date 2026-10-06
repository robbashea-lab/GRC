import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RiskRegister,{RISK_SCORE_MAX} from './RiskRegister';
import api from '@/lib/api';
let mockClient='demo_brawndo';
const mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:mockClient,currentClient:{name:'Test client'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()},formatError:e=>e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/risks',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams())}),{virtual:true});
jest.mock('@/components/RecordDrawer',()=>()=>null);
let root,container,rows;
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text||b.textContent.startsWith(text));
const click=async node=>act(async()=>node.click());
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;mockClient='demo_brawndo';mockUser.workspace_mode='demo';localStorage.clear();
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 rows=[{risk_id:'late',client_id:mockClient,title:'Late risk',status:'open',next_review:'2020-01-01',likelihood_score:3,impact_score:4},{risk_id:'undated',client_id:mockClient,title:'Undated risk',status:'open'},{risk_id:'closed',client_id:mockClient,title:'Closed risk',status:'closed'}];
 api.get.mockImplementation(async path=>({data:path==='/risks'?rows:[]}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('approved filters replace summary cards and preserve client isolation',async()=>{
 await act(async()=>root.render(<RiskRegister/>));
 expect(container.querySelector('[aria-label="Risk summaries"]')).toBeNull();
 expect([...container.querySelectorAll('[aria-label="Risk views"] button')].map(b=>b.textContent.split(' · ')[0])).toEqual(['All active','Critical','High','Due for review','Accepted','Closed','Review due in 30 days']);
 await click(container.querySelector('[data-testid="risk-view-review_due"]'));
 expect(container.querySelector('tbody').textContent).toContain('Late risk');
 expect(container.querySelector('tbody').textContent).not.toContain('Undated risk');
 await click(container.querySelector('[data-testid="risk-view-high"]'));
 expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
 expect(container.querySelector('.brisk-level').textContent).toBe('High');
 mockClient='future_client';mockUser.workspace_mode='authenticated';rows=rows.map(r=>({...r,client_id:mockClient,category:'operational'}));
 await act(async()=>root.render(<RiskRegister/>));
 expect(container.querySelector('.approved-risk-register')).not.toBeNull();
 expect(container.querySelector('tbody').textContent).not.toContain('Operational');
 expect(container.querySelectorAll('thead th')).toHaveLength(7);
 expect(container.querySelector('[data-testid="risk-view-all_active"]').textContent).toContain('2');
});

test('new risk has annual/undecided defaults and protects an unfinished draft',async()=>{
 await act(async()=>root.render(<RiskRegister/>));await click(button('New Risk'));
 const dialog=document.querySelector('[role="dialog"]');
 expect(dialog.className).toContain('brawndo-cis-assessment');expect(dialog.textContent).toContain('Not Yet Decided');expect(dialog.textContent).toContain('Annual');
 await act(async()=>{const input=dialog.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Unsaved risk');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Cancel'));
 expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();expect(api.post).not.toHaveBeenCalled();
});

test('review filters partition authoritative dates for normal and Demo clients',async()=>{
 const now=new Date();const day=n=>{const d=new Date(now);d.setDate(d.getDate()+n);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
 for(const mode of ['demo','authenticated']){
  mockUser.workspace_mode=mode;
  rows=[-1,0,1,30,31].map(n=>({risk_id:String(n),client_id:mockClient,title:'Review '+n,status:'identified',next_review:day(n)}));
  await act(async()=>root.render(<RiskRegister key={mode}/>));
  await click(container.querySelector('[data-testid="risk-view-review_due"]'));
  expect([...container.querySelectorAll('tbody .register-record-link')].map(b=>b.textContent)).toEqual(['Review -1','Review 0']);
  await click(container.querySelector('[data-testid="risk-view-upcoming"]'));
  expect([...container.querySelectorAll('tbody .register-record-link')].map(b=>b.textContent)).toEqual(['Review 1','Review 30']);
 }
 expect(RISK_SCORE_MAX).toBe(25);
});
