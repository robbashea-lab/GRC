import {act} from 'react';
import {createRoot} from 'react-dom/client';
import api from '@/lib/api';
import PolicyRequirements,{PolicySummary,PolicyRetainedApproval} from './BrawndoPolicyDetails';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message}));
global.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
const record={policy_id:'p',client_id:'new-client',status:'draft',version:'2-draft',owner_id:'owner',summary:'Existing policy purpose',next_review_date:'2026-12-01',last_reviewed_at:'2026-09-01'};
beforeEach(()=>{host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);api.get.mockResolvedValue({data:{client_id:record.client_id,items:[]}});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
test('Overview summary remains independent of requirements and approval configuration',async()=>{
  await act(async()=>root.render(<PolicySummary record={record} users={[{user_id:'owner',name:'Existing owner'}]}/>));
  expect([...host.querySelectorAll('dt')].map(n=>n.textContent)).toEqual(['Policy Status','Version','Owner','Last Reviewed','Next Review']);
  expect(host.textContent).toContain('Existing owner');
  expect(host.textContent).not.toContain('Existing policy purpose');expect(api.get).not.toHaveBeenCalled();
});
test('requirements are readable sections and exact linked Reviews stay client scoped',async()=>{
  const onOpen=jest.fn(),review={review_id:'r',client_id:record.client_id,policy_id:'p',title:'Authoritative review',recurrence:'annual',due_date:'2026-12-01'};
  await act(async()=>root.render(<PolicyRequirements record={record} related={{reviews:[review,{...review,review_id:'foreign',client_id:'other',title:'Foreign review'}]}} onOpen={onOpen}/>));
  expect(host.querySelector('details')).toBeNull();expect(host.querySelector('dl')).toBeNull();
  expect(host.textContent).toContain('Existing policy purpose');expect(host.textContent).not.toContain('Foreign review');
  await act(async()=>host.querySelector('button').click());expect(onOpen).toHaveBeenCalledWith({kind:'reviews',record:review});
});
test('retained historical approval can relocate without rewriting the draft or historical subject',async()=>{
  const policy={...record,approval_history:[{action:'approved',at:'2026-01-01',subject:{version:'1',title:'Approved document',document_reference:'DOC-1'}}]};
  const before=JSON.stringify(policy);
  await act(async()=>root.render(<PolicyRetainedApproval record={policy}/>));
  expect(host.textContent).toContain('Last approved version');expect(host.textContent).toContain('The current draft is not approved');
  expect(JSON.stringify(policy)).toBe(before);
});
