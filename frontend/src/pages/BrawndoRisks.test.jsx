import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RiskRegister,{riskTileContexts,RISK_SCORE_MAX} from './RiskRegister';
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
 global.IS_REACT_ACT_ENVIRONMENT=true;mockClient='demo_brawndo';localStorage.clear();
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 rows=[{risk_id:'late',client_id:mockClient,title:'Late risk',status:'open',next_review:'2020-01-01',likelihood_score:3,impact_score:4},{risk_id:'undated',client_id:mockClient,title:'Undated risk',status:'open'},{risk_id:'closed',client_id:mockClient,title:'Closed risk',status:'closed'}];
 api.get.mockImplementation(async path=>({data:path==='/risks'?rows:[]}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
const tile=id=>container.querySelector(`[data-testid="tile-${id}"]`);
test('stable summaries, filters and client isolation',async()=>{
 await act(async()=>root.render(<RiskRegister/>));
 expect(tile('all_active').textContent).toContain('2');expect(tile('significant').textContent).toContain('1');
 expect(container.querySelector('[data-testid="risk-view-review_due"]').textContent).toBe('Due for review · 1');
 await click(container.querySelector('[data-testid="risk-view-review_due"]'));expect(container.querySelector('tbody').textContent).not.toContain('Undated risk');
 expect(container.querySelector('tbody').textContent).toContain('Late risk');
 await click(tile('significant'));expect(tile('significant').getAttribute('aria-pressed')).toBe('true');expect(container.querySelectorAll('tbody tr').length).toBe(1);
 await act(async()=>{const input=container.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'missing');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(tile('all_active').textContent).toContain('2');
 mockClient='demo_other';rows=rows.map(r=>({...r,client_id:mockClient}));
 await act(async()=>root.render(<RiskRegister/>));
 expect(tile('all_active')).not.toBeNull();expect(container.querySelector('.bpage')).not.toBeNull();
 mockClient='demo_brawndo';rows=rows.map(r=>({...r,client_id:mockClient}));
 await act(async()=>root.render(<RiskRegister/>));expect(tile('all_active').textContent).toContain('2');
});
test('new risk has annual/undecided defaults and protects an unfinished draft',async()=>{
 await act(async()=>root.render(<RiskRegister/>));await click(button('New Risk'));
 const dialog=document.querySelector('[role="dialog"]');
 expect(dialog.className).toContain('brawndo-cis-assessment');expect(dialog.textContent).toContain('Not Yet Decided');expect(dialog.textContent).toContain('Annual');
 await act(async()=>{const input=dialog.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Unsaved risk');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Cancel'));
 expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();expect(api.post).not.toHaveBeenCalled();
});

test('tile context lines use real statuses, scores and dates',()=>{
 const now=new Date('2026-09-30T12:00:00');
 const risks=[{display_id:'RISK-001',status:'in_progress',likelihood_score:3,impact_score:4,owner_id:'a',next_review:'2026-10-20'},{display_id:'RISK-002',status:'open',likelihood_score:2,impact_score:3,owner_id:'b',next_review:'2026-12-24'},{display_id:'RISK-003',status:'accepted',likelihood_score:2,impact_score:3,owner_id:'c',next_review:'2026-12-24'},{display_id:'RISK-004',status:'closed',likelihood_score:5,impact_score:5}];
 const c=riskTileContexts(risks,now);
 expect(c.significant).toEqual({count:1,context:'RISK-001 · score 12, in treatment'});
 expect(c.all_active).toEqual({count:3,context:'1 in treatment · 1 open · 1 accepted'});
 expect(c.upcoming.count).toBe(1);expect(c.upcoming.context).toMatch(/^Next: .+, RISK-001$/);
 expect(c.unassigned).toEqual({count:0,context:'Every risk has an owner'});
 const empty=riskTileContexts([{status:'open'}],now);
 expect(empty.significant.context).toBe('No high or critical risks');expect(empty.upcoming.context).toBe('No reviews scheduled');expect(empty.unassigned.context).toBe('1 risk needs an owner');
 expect(RISK_SCORE_MAX).toBe(25);
});
