import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';
import {toast} from 'sonner';

let mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn()},formatError:error=>error.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({Link:({children})=><span>{children}</span>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('./ReviewDrawer',()=>props=><div data-testid="review-dispatch">{props.record?.review_id}:{props.initialValues?.occurrence?.occurrence_id}</div>);
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));
let root,container,risk,occurrence;
const click=node=>act(async()=>node.click());
const input=(node,value)=>act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockUser={user_id:'admin',role:'super_admin',workspace_mode:'demo'};
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  risk={risk_id:'risk',client_id:'demo_brawndo',title:'Supplier risk',status:'open',likelihood_score:3,impact_score:4,review_cadence:'annual',updated_at:'2026-10-01T12:00:00Z'};
  occurrence={occurrence_id:'completed',review_id:'review',period:'2025',due_date:'2025-10-01',completed_at:'2025-10-02',outcome:'Assessed'};
  api.get.mockImplementation(async path=>({data:path==='/risks'?[risk]:path.endsWith('/review-history')?[occurrence]:path==='/related'?{}:path==='/reviews'?[{review_id:'review',client_id:risk.client_id}]:[]}));
  api.patch.mockImplementation(async(path,patch)=>({data:{...risk,...patch}}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each(['authenticated','demo'])('treatment acceptance respects the %s decision workflow',async mode=>{
 const scrollIntoView=HTMLElement.prototype.scrollIntoView;
 HTMLElement.prototype.scrollIntoView=jest.fn();
 try {
 mockUser.workspace_mode=mode;
 await act(async()=>root.render(<RecordDrawer open kind="risks" clientId={risk.client_id} record={risk} onOpenChange={()=>{}}/>));
 await click(document.querySelector('[data-testid="tab-treatment"]'));
 await click(document.querySelector('[aria-label="Treatment decision"]'));
 const accept=[...document.querySelectorAll('[role="option"]')].find(n=>n.textContent==='Accept');
 expect(accept).toBeTruthy();
 expect(accept.getAttribute('aria-disabled')==='true').toBe(mode==='authenticated');
 expect(api.patch).not.toHaveBeenCalled();
 } finally {
  if(scrollIntoView) HTMLElement.prototype.scrollIntoView=scrollIntoView;
  else delete HTMLElement.prototype.scrollIntoView;
 }
});

test('assessment and treatment keep one draft across tabs, failed save and retry',async()=>{
  const close=jest.fn();
  await act(async()=>root.render(<RecordDrawer open kind="risks" clientId={risk.client_id} record={risk} onOpenChange={close}/>));
  await click(document.querySelector('[data-testid="tab-assessment"]'));
  expect(document.querySelector('[data-testid="risk-live-score"]').textContent).toContain('Score 12');
  await input(document.querySelector('[data-testid="field-impact_description"]'),'Operational outage');
  await click(document.querySelector('[data-testid="tab-treatment"]'));
  await input(document.querySelector('[data-testid="field-notes"]'),'Validate supplier recovery');
  await click(document.querySelector('[data-testid="tab-assessment"]'));
  expect(document.querySelector('[data-testid="field-impact_description"]').value).toBe('Operational outage');
  await click(document.querySelector('[data-testid="drawer-cancel"]'));
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();expect(close).not.toHaveBeenCalled();
  await click([...document.querySelectorAll('[role="alertdialog"] button')].find(node=>node.textContent==='Keep editing'));
  api.patch.mockRejectedValueOnce(new Error('Stale write'));
  await click(document.querySelector('[data-testid="drawer-save"]'));
  expect(close).not.toHaveBeenCalled();expect(toast.error).toHaveBeenCalledWith('Stale write');
  await click(document.querySelector('[data-testid="drawer-save"]'));
  expect(api.patch.mock.calls[1]).toEqual(['/risks/risk',expect.objectContaining({impact_description:'Operational outage',notes:'Validate supplier recovery',expected_updated_at:'2026-10-01T12:00:00Z'}),{headers:{'Idempotency-Key':expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)}}]);
  expect(close).toHaveBeenCalledWith(false);
});

test('completed history opens the original occurrence and refuses a different tenant',async()=>{
  await act(async()=>root.render(<RecordDrawer open kind="risks" clientId={risk.client_id} record={risk} onOpenChange={()=>{}}/>));
  await click(document.querySelector('[data-testid="tab-history"]'));
  const historyButton=[...document.querySelectorAll('button')].find(node=>node.textContent.includes('Scheduled 2025-10-01'));
  const original=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,...args)=>path==='/reviews'?{data:[{review_id:'review',client_id:'another-client'}]}:original(path,...args));
  await click(historyButton);expect(document.querySelector('[data-testid="review-dispatch"]')).toBeNull();
  expect(toast.error).toHaveBeenCalledWith('The original Risk Review is unavailable for this client.');
  api.get.mockImplementation(original);
  await click(historyButton);expect(document.querySelector('[data-testid="review-dispatch"]').textContent).toBe('review:completed');
});

test('read-only access keeps assessment disabled and hides save',async()=>{
  mockUser={...mockUser,role:'client_readonly'};
  await act(async()=>root.render(<RecordDrawer open kind="risks" clientId={risk.client_id} record={risk} onOpenChange={()=>{}}/>));
  await click(document.querySelector('[data-testid="tab-assessment"]'));
  expect(document.querySelector('[data-testid="field-impact_description"]').closest('fieldset').disabled).toBe(true);
  expect(document.querySelector('[data-testid="drawer-save"]').disabled).toBe(true);
});

test('shared Treatment retains existing Action Item linking for authorized users',async()=>{
  delete mockUser.workspace_mode;risk.client_id='synthetic-new-client';
  await act(async()=>root.render(<RecordDrawer open kind="risks" clientId={risk.client_id} record={risk} onOpenChange={()=>{}}/>));
  await click(document.querySelector('[data-testid="tab-treatment"]'));
  const link=[...document.querySelectorAll('button')].find(b=>b.textContent==='Link existing Action Item');
  expect(link).toBeTruthy();
  await click(link);
  expect([...document.querySelectorAll('h2')].some(h=>h.textContent==='Link Action Item')).toBe(true);
});
