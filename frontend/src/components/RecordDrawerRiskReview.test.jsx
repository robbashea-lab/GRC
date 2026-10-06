import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';
import {toast} from 'sonner';

let mockUser;
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:require('axios').default.create({adapter:require('../preview/adapter').previewAdapter}),formatError:e=>e.response?.data?.detail||e.message,API:'/api'}));
jest.mock('react-router-dom',()=>({Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));

let root,container,risk;
const click=selector=>act(async()=>document.querySelector(selector).click());
const input=(selector,value)=>act(async()=>{
 const node=document.querySelector(selector),prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
 Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);
 node.dispatchEvent(new Event('input',{bubbles:true}));
});
beforeEach(async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
 mockUser=(await api.post('/demo/enter')).data.user;
 risk=(await api.post('/risks',{client_id:'demo_dunder',title:'Accepted operational risk',description:'Synthetic review shortcut regression',likelihood_score:3,impact_score:4,source_type:'manual',review_cadence:'annual',next_review:'2099-01-01'})).data;
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 await act(async()=>root.render(<RecordDrawer open kind="risks" clientId={risk.client_id} record={risk} onOpenChange={()=>{}}/>));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.restoreAllMocks();jest.clearAllMocks();});

test('normal Risk summary and status control preserve the assessed lifecycle label',async()=>{
 mockUser={...mockUser,workspace_mode:'authenticated'};
 await act(async()=>root.render(<RecordDrawer open kind="risks" clientId={risk.client_id} record={{...risk,status:'assessed'}} onOpenChange={()=>{}}/>));
 const summary=[...document.querySelectorAll('dl div')].find(n=>n.querySelector('dt')?.textContent==='Status');
 expect(summary.querySelector('dd').textContent).toBe('Assessed');
 expect(document.querySelector('[data-testid="field-status"]').textContent).toBe('Assessed');
 const footer=document.querySelector('[data-testid="drawer-cancel"]').parentElement;
 expect([...footer.querySelectorAll('button')].map(b=>b.textContent)).toEqual(['Review Risk','Accept Risk','Close Risk','Close','Save changes']);
});

test('Review Risk after acceptance saves the draft and opens the real central Review without rewriting managed decisions',async()=>{
 await input('[data-testid="field-title"]','Updated accepted operational risk');
 await click('[data-testid="risk-accept"]');
 await input('[data-testid="accept-rationale"]','Management accepts the remaining operational exposure.');
 await input('[data-testid="accept-controls"]','Weekly operational monitoring remains in place.');
 await input('[data-testid="accept-expiry"]','2099-01-01');
 await click('[data-testid="accept-submit"]');
 const accepted=(await api.get('/risks/'+risk.risk_id)).data;
 expect(accepted.acceptance_rationale).toBe('Management accepts the remaining operational exposure.');
 expect(document.querySelector('[data-testid="field-title"]').value).toBe('Updated accepted operational risk');
 await click('[data-testid="risk-mark-reviewed"]');
 expect(toast.error).not.toHaveBeenCalled();
 expect(document.querySelector('[data-testid="reviews-drawer"]')).not.toBeNull();
 const saved=(await api.get('/risks/'+risk.risk_id)).data;
 expect(saved.title).toBe('Updated accepted operational risk');
 for(const key of ['accepted_by','acceptance_date','acceptance_rationale','acceptance_expires_at','compensating_controls','decision_history','risk_score'])expect(saved[key]).toEqual(accepted[key]);
 const review=(await api.get('/reviews/'+saved.linked_review_id)).data;
 expect(review).toMatchObject({risk_id:risk.risk_id,client_id:risk.client_id});
 await expect(api.patch('/risks/'+risk.risk_id,{acceptance_rationale:'Not an authorized decision',expected_updated_at:saved.updated_at})).rejects.toMatchObject({response:{data:{detail:'Decision and history fields cannot be edited directly.'}}});
});

test('a failed draft save does not open the Review or discard the draft',async()=>{
 await input('[data-testid="field-title"]','Unsaved title');
 const before=(await api.get('/risks/'+risk.risk_id)).data;
 await api.patch('/risks/'+risk.risk_id,{description:'Concurrent update',expected_updated_at:before.updated_at});
 await click('[data-testid="risk-mark-reviewed"]');
 expect(toast.error).toHaveBeenCalled();
 expect(document.querySelector('[data-testid="reviews-drawer"]')).toBeNull();
 expect(document.querySelector('[data-testid="field-title"]').value).toBe('Unsaved title');
 expect((await api.get('/risks/'+risk.risk_id)).data.title).toBe(before.title);
});

test('omitting acceptance-dialog controls preserves an existing unsaved treatment draft',async()=>{
 await click('[data-testid="tab-treatment"]');
 await input('[data-testid="field-compensating_controls"]','Unsaved treatment controls');
 await click('[data-testid="tab-overview"]');
 await click('[data-testid="risk-accept"]');
 await input('[data-testid="accept-rationale"]','Accept while retaining the treatment draft.');
 await input('[data-testid="accept-expiry"]','2099-01-01');
 await click('[data-testid="accept-submit"]');
 await click('[data-testid="tab-treatment"]');
 expect(document.querySelector('[data-testid="field-compensating_controls"]').value).toBe('Unsaved treatment controls');
 await click('[data-testid="tab-overview"]');
 await click('[data-testid="risk-mark-reviewed"]');
 expect(toast.error).not.toHaveBeenCalled();
 expect(document.querySelector('[data-testid="reviews-drawer"]')).not.toBeNull();
 expect((await api.get('/risks/'+risk.risk_id)).data.compensating_controls).toBe('Unsaved treatment controls');
});
