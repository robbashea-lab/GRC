import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RemediationTicketDrawer from './RemediationTicketDrawer';
import api from '@/lib/api';

const mockUser={user_id:'detail-admin',role:'super_admin',workspace_mode:'demo'};
const initialTask={task_id:'detail-action',client_id:'demo_brawndo',finding_id:'detail-finding',title:'Native Action',status:'open',priority:'medium',description:'Saved plan',resolution:'',assignee_id:null,due_date:null,updated_at:'task-v1'};
const initialFinding={finding_id:'detail-finding',client_id:'demo_brawndo',title:'Native Finding',description:'Saved issue',status:'open',primary_task_id:'detail-action',updated_at:'finding-v1'};
let mockTasks,mockFindings,mockFullRecord,mockEvidenceTotal;
const mockLoad=jest.fn();
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>mockFullRecord}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/useActionRegisterData',()=>({useActionRegisterData:()=>({data:{tasks:mockTasks,findings:mockFindings},users:[],loading:false,error:'',load:mockLoad})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
jest.mock('./EvidencePanel',()=>{
  const {useEffect}=require('react');
  return function NativeEvidenceStub(props){
    useEffect(()=>{if(Number.isInteger(mockEvidenceTotal))props.onSummary?.(mockEvidenceTotal);},[props.onSummary]);
    return <>{props.renderHeader?.(null)}<div data-testid="native-evidence">{props.kind}:{props.id}</div></>;
  };
});
jest.mock('./AssigneeSelect',()=>props=><><select aria-label="Responsible owner" value={props.value||''} disabled={props.disabled} onChange={event=>props.onChange(event.target.value||null)}><option value="">Unassigned</option><option value="eligible-user">Eligible user</option></select>{props.guidanceText&&<p>{props.guidanceText}</p>}</>);
jest.mock('./RecordDrawer',()=>()=>null);

let root,container,close;
const surface=()=>document.querySelector('[data-testid="remediation-ticket-drawer"]');
const taskForm=id=>document.querySelector(`[data-ticket-task="${id}"]`);
const button=(text,scope=document)=>[...scope.querySelectorAll('button')].find(node=>node.textContent===text);
const click=async(text,scope=document)=>act(async()=>button(text,scope).click());
const change=async(label,value,scope=document)=>act(async()=>{
  const node=scope.querySelector(`[aria-label="${label}"]`);
  const prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:node.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));
});
const render=async(props={})=>act(async()=>root.render(<RemediationTicketDrawer open kind="tasks" record={initialTask} clientId="demo_brawndo" onOpenChange={close} {...props}/>));

beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  mockTasks=[{...initialTask}];mockFindings=[{...initialFinding}];mockFullRecord=true;mockEvidenceTotal=null;
  close=jest.fn();mockLoad.mockResolvedValue({ok:true});api.get.mockResolvedValue({data:[]});
  api.post.mockResolvedValue({data:{}});
  api.patch.mockImplementation(async(path,body)=>{
    const task=mockTasks.find(row=>path==='/tasks/'+row.task_id);
    return {data:{...task,...body,updated_at:'accepted-v2'}};
  });
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('saved Task receives the appearance without enabling the list workflow pilot',async()=>{
  await render();
  expect(surface().classList.contains('brawndo-action-detail')).toBe(true);
  expect(surface().classList.contains('brawndo-demo-actions-ticket')).toBe(false);
  expect(document.querySelector('[role="tablist"]')).toBeTruthy();
  expect(document.querySelector('[aria-label="Action title"]').value).toBe(initialTask.title);
});

test('only the already-marked Action Items Finding entry receives the new appearance',async()=>{
  await render({kind:'findings',record:initialFinding});
  expect(surface().classList.contains('brawndo-action-detail')).toBe(false);
  await render({kind:'findings',record:initialFinding,presentation:'brawndo-demo-actions'});
  expect(surface().classList.contains('brawndo-action-detail')).toBe(true);
  await render({kind:'findings',record:initialFinding});
  expect(surface().classList.contains('brawndo-action-detail')).toBe(false);
});

test('tabs and eligibility rechecks retain the same native fields and independent drafts',async()=>{
  await render();
  const title=document.querySelector('[aria-label="Action title"]');
  const resolution=document.querySelector('[aria-label="Actual resolution"]');
  await change('Action title','Unsaved title');await change('Actual resolution','Resolution-only content');
  await click('Activity');await change('Ticket comment','Unposted comment');
  const comment=document.querySelector('[aria-label="Ticket comment"]');
  await click('Evidence');
  expect(document.querySelector('[data-testid="native-evidence"]').textContent).toContain('detail-finding');
  mockFullRecord=false;await render();
  expect(surface().classList.contains('brawndo-action-detail')).toBe(false);
  expect(document.querySelector('[aria-label="Action title"]')).toBe(title);
  expect(document.querySelector('[aria-label="Actual resolution"]')).toBe(resolution);
  expect(document.querySelector('[aria-label="Ticket comment"]')).toBe(comment);
  mockFullRecord=true;await render();await click('Overview');
  expect(title.value).toBe('Unsaved title');expect(resolution.value).toBe('Resolution-only content');expect(comment.value).toBe('Unposted comment');
  await click('Close');expect(document.body.textContent).toContain('Discard unsaved ticket changes?');
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('single-Action footer Save delegates exactly the native dirty-field PATCH and CAS',async()=>{
  await render();await change('Action title','Saved through footer');
  expect(button('Save changes',taskForm('detail-action'))).toBeUndefined();
  expect(button('Complete work',taskForm('detail-action'))).toBeTruthy();
  await click('Save changes',document.querySelector('.ticket-footer'));
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(api.patch.mock.calls[0][0]).toBe('/tasks/detail-action');
  expect(api.patch.mock.calls[0][1]).toEqual({title:'Saved through footer',expected_updated_at:'task-v1'});
  expect(api.post).not.toHaveBeenCalled();
});

test('approved detail labels and prompt keep nullable native field identities without legacy duplicate copy',async()=>{
  await render();
  const owner=document.querySelector('[aria-label="Responsible owner"]'),due=document.querySelector('[aria-label="Due date"]');
  expect(owner.parentElement.textContent).toContain('Owner');
  expect(owner.parentElement.textContent).toContain('Active platform users with access to this client.');
  expect(due.closest('label').textContent).toBe('Due date');
  expect(due.required).toBe(false);expect(owner.required).toBe(false);
  expect(document.querySelector('[aria-label="Planned action"]').placeholder).toBe('What will be done, and by whom.');
  expect([...taskForm('detail-action').querySelectorAll('p')].some(node=>node.textContent==='Unassigned')).toBe(false);
  expect(surface().textContent).not.toContain('Complete outstanding work, then validate the resolution here.');
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('approved due readout follows the native calendar calculation without writing dates',async()=>{
  const overdue=new Date();overdue.setDate(overdue.getDate()-2);
  const date=[overdue.getFullYear(),String(overdue.getMonth()+1).padStart(2,'0'),String(overdue.getDate()).padStart(2,'0')].join('-');
  mockTasks=[{...initialTask,due_date:date}];
  await render();
  expect(taskForm('detail-action').querySelector('.bad-due-help').textContent).toBe('2 days overdue');
  await change('Due date','');
  expect(taskForm('detail-action').querySelector('.bad-due-help')).toBeNull();
  expect(api.patch).not.toHaveBeenCalled();
});

test('footer Save reads the latest native handler after successive edits remain dirty',async()=>{
  await render();
  await change('Action title','First title edit');
  await change('Actual resolution','Latest resolution draft');
  await change('Action title','Latest title edit');
  await click('Save changes',document.querySelector('.ticket-footer'));
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(api.patch.mock.calls[0][0]).toBe('/tasks/detail-action');
  expect(api.patch.mock.calls[0][1]).toEqual({title:'Latest title edit',resolution:'Latest resolution draft',expected_updated_at:'task-v1'});
});

test('Complete work saves permitted pending changes in one PATCH with optional blank resolution and nullable fields',async()=>{
  mockTasks=[{...initialTask,assignee_id:'eligible-user',due_date:'2026-10-22'}];
  await render();await change('Action title','Completed title');await change('Due date','');await change('Responsible owner','');
  await click('Complete work');
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(api.patch.mock.calls[0][1]).toEqual({title:'Completed title',assignee_id:null,due_date:null,status:'done',expected_updated_at:'task-v1'});
  expect(api.patch.mock.calls[0][1]).not.toHaveProperty('resolution');
  expect(api.post).not.toHaveBeenCalled();
});

test('multiple Actions retain separate saves and a sibling resolution-only draft',async()=>{
  mockTasks.push({...initialTask,task_id:'sibling',title:'Sibling Action',updated_at:'sibling-v1'});
  await render();
  await change('Action title','First Action edit',taskForm('detail-action'));
  await change('Actual resolution','Sibling unsaved resolution',taskForm('sibling'));
  expect(button('Save changes',document.querySelector('.ticket-footer'))).toBeUndefined();
  await click('Save changes',taskForm('detail-action'));
  expect(api.patch).toHaveBeenCalledTimes(1);expect(api.patch.mock.calls[0][0]).toBe('/tasks/detail-action');
  expect(taskForm('sibling').querySelector('[aria-label="Actual resolution"]').value).toBe('Sibling unsaved resolution');
  expect(button('Save changes',taskForm('sibling')).disabled).toBe(false);
  await click('Close');expect(document.body.textContent).toContain('Discard unsaved ticket changes?');
});

test('pending validation uses real Finding state and exposes no unsupported Send back command',async()=>{
  mockEvidenceTotal=7;
  mockTasks=[{...initialTask,status:'done',resolution:'Saved resolution',completed_at:'2026-10-18T12:00:00Z',completed_by:'real-completer'}];
  mockFindings=[{...initialFinding,status:'remediated',decision_history:[{action:'validated',by:'previous-validator',at:'2026-09-01T12:00:00Z',rationale:'Earlier completed cycle'}]}];await render();
  expect(document.body.textContent).toContain('Waiting for validation');
  expect(document.body.textContent).not.toContain('Work is complete. A platform administrator must validate');
  expect(document.body.textContent).toContain('real-completer');
  expect(document.querySelector('.bad-state-card').textContent).toContain('What was doneSaved resolution');
  expect(document.querySelector('.bad-state-card').textContent).toContain('Evidence7 files');
  expect(document.querySelector('.bad-state-card').textContent).not.toContain('previous-validator');
  expect(document.querySelector('.bad-state-card').textContent).not.toContain('Earlier completed cycle');
  expect(document.body.textContent).not.toContain('Send back');
  expect(document.querySelector('[aria-label="Actual resolution"]').disabled).toBe(false);
});

test('standalone completed work does not claim a validated Finding',async()=>{
  mockTasks=[{...initialTask,finding_id:null,status:'done'}];mockFindings=[];await render();
  expect(document.querySelector('.bad-state-card').textContent).toContain('Work completed');
  expect(document.querySelector('.bad-state-card').textContent).not.toContain('Validated and closed');
  expect(button('Validate and complete')).toBeUndefined();expect(button('Reopen ticket')).toBeUndefined();
});

test.each(['accepted','accept'])('accepted Finding reads native %s history without manufacturing completed progress',async action=>{
  mockFindings=[{...initialFinding,status:'accepted',decision_history:[{action,by:'decision-actor',at:'2026-10-18T10:00:00Z',rationale:'Retained decision'}]}];await render();
  expect(document.body.textContent).toContain('Acceptance is not verified remediation');
  expect(document.body.textContent).toContain('Retained decision');
  expect(document.body.textContent).not.toContain("It's closed once validated.");
  expect(button('Complete work')).toBeTruthy();
  expect(document.querySelectorAll('.bad-step[data-state="done"]').length).toBe(0);
});

test.each(['validate','accept'])('native %s command retains Work and comment drafts without co-saving them',async operation=>{
  if(operation==='validate'){mockTasks=[{...initialTask,status:'done'}];mockFindings=[{...initialFinding,status:'remediated'}];}
  await render();await change('Actual resolution','Unsaved Work resolution');
  await click('Activity');await change('Ticket comment','Unposted comment');await click('Overview');
  await change(operation==='validate'?'Validation rationale':'Acceptance rationale','Decision rationale');
  await click(operation==='validate'?'Validate and close':'Accept issue');
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls[0][0]).toBe('/findings/detail-finding/'+operation);
  expect(api.post.mock.calls[0][1]).toEqual(expect.objectContaining({rationale:'Decision rationale',expected_updated_at:'finding-v1',request_id:expect.any(String)}));
  expect(document.querySelector('[aria-label="Actual resolution"]').value).toBe('Unsaved Work resolution');
  expect(document.querySelector('[aria-label="Ticket comment"]').value).toBe('Unposted comment');
});

test('missing primary remains a diagnostic and never hides sibling Actions',async()=>{
  mockFindings=[{...initialFinding,primary_task_id:'missing'}];mockTasks.push({...initialTask,task_id:'sibling',title:'Sibling Action'});
  await render({kind:'findings',record:mockFindings[0],presentation:'brawndo-demo-actions'});
  expect(document.body.textContent).toContain('Primary Action unavailable');
  expect(document.querySelectorAll('[data-ticket-task]').length).toBe(2);
  expect(surface().querySelector('h2').textContent).toBe('Native Finding');
});

test('a rejected stale save retains the resolution draft and reports the failure',async()=>{
  api.patch.mockRejectedValueOnce(Object.assign(new Error('Finding changed; reload before saving'),{response:{status:409,headers:{'x-create-rejected':'true'}}}));
  await render();await change('Actual resolution','Keep this draft after conflict');
  await click('Save changes',document.querySelector('.ticket-footer'));
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(api.patch.mock.calls[0][1]).toEqual({resolution:'Keep this draft after conflict',expected_updated_at:'task-v1'});
  expect(document.querySelector('[aria-label="Actual resolution"]').value).toBe('Keep this draft after conflict');
  expect(document.querySelector('[role="alert"]').textContent).toContain('reload before saving');
  expect(mockLoad).not.toHaveBeenCalled();
  expect(document.querySelector('.bad-dirty').textContent).toBe('Unsaved changes');
});

test('closed Finding without a validation receipt does not invent validation proof',async()=>{
  mockTasks=[{...initialTask,status:'done'}];mockFindings=[{...initialFinding,status:'closed'}];await render();
  const card=document.querySelector('.bad-state-card');
  expect(card.querySelector('h3').textContent).toBe('Closed');
  expect(card.textContent).not.toContain('Validated by');
  expect(card.textContent).not.toContain('Validated and closed');
  expect(document.querySelector('.bad-progress').textContent).toContain('Validation not recorded');
});

test('unmarked Finding keeps its native presentation without new state metadata',async()=>{
  mockTasks=[{...initialTask,status:'done',completed_by:'retained-actor',completed_at:'2026-10-18T12:00:00Z'}];
  mockFindings=[{...initialFinding,status:'closed',validated_by:'validator',validated_at:'2026-10-18T13:00:00Z'}];
  await render({kind:'findings',record:mockFindings[0]});
  expect(document.querySelector('.bad-state-card')).toBeNull();
  expect(document.querySelector('.bad-progress')).toBeNull();
  expect(document.body.textContent).not.toContain('Validated by');
  expect(document.body.textContent).not.toContain('Work completed by retained-actor');
  expect(button('Reopen ticket')).toBeTruthy();
  expect(button('Save changes',taskForm('detail-action'))).toBeTruthy();
  expect(document.querySelector('[aria-label="Due date"]').closest('label').textContent).toBe('Due date (optional)');
  expect(document.querySelector('[aria-label="Planned action"]').hasAttribute('placeholder')).toBe(false);
});

test('Task priority remains distinct from the linked Finding severity',async()=>{
  mockTasks=[{...initialTask,priority:'low'}];mockFindings=[{...initialFinding,severity:'critical'}];await render();
  const priority=document.querySelector('.ticket-heading [data-priority]');
  expect(priority.dataset.priority).toBe('low');expect(priority.textContent).toContain('Low');
  const why=document.querySelector('.bad-why');
  expect(why.dataset.severity).toBe('critical');expect(why.textContent).toContain('critical finding');
  expect(api.patch).not.toHaveBeenCalled();
});

test('Evidence tab count comes from the native catalog summary callback',async()=>{
  mockEvidenceTotal=7;await render();
  const evidenceTab=[...document.querySelectorAll('[role="tab"]')].find(node=>node.textContent.startsWith('Evidence'));
  expect(evidenceTab.textContent).toContain('7');
  await act(async()=>evidenceTab.click());
  expect(document.querySelector('[data-testid="native-evidence"]').textContent).toBe('findings:detail-finding');
});


test('approved chooser keeps the native single-file input and cancellation makes no command',async()=>{
  await render();
  const input=document.querySelector('input[aria-label="Attach ticket evidence"]');
  expect(input.type).toBe('file');
  expect(input.multiple).toBe(false);
  expect(input.closest('label').textContent).toBe('Choose files');
  expect(input.closest('.bad-upload').textContent).toContain('Attach proof the work was done');
  await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
  expect(api.post).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
});


test('upcoming due readouts match the reference and settled work keeps its saved date',async()=>{
  const upcoming=new Date();upcoming.setDate(upcoming.getDate()+7);
  const date=[upcoming.getFullYear(),String(upcoming.getMonth()+1).padStart(2,'0'),String(upcoming.getDate()).padStart(2,'0')].join('-');
  mockTasks=[{...initialTask,due_date:date}];await render();
  expect(document.querySelector('.bad-sub [data-tone="warn"]').textContent).toBe('Due in 7 days');
  expect(document.querySelector('.bad-due-help').dataset.upcoming).toBe('true');
  mockTasks=[{...mockTasks[0],status:'done'}];mockFindings=[{...initialFinding,status:'remediated'}];await render();
  expect(document.querySelector('.bad-sub').textContent).toContain('Due in 7 days');
  expect(document.querySelector('.bad-due-help').textContent).toBe('Due in 7 days');
  mockFindings=[{...initialFinding,status:'closed'}];await render();
  expect(document.querySelector('.bad-sub').textContent).not.toContain('Due in');
  expect(document.querySelector('[aria-label="Due date"]').value).toBe(date);
  expect(api.patch).not.toHaveBeenCalled();
});


test('settled sibling Actions do not acquire active deadline warnings',async()=>{
  mockTasks=[{...initialTask,status:'done',due_date:'2020-01-01'},{...initialTask,task_id:'cancelled-sibling',status:'cancelled',due_date:'2020-01-01'}];
  mockFindings=[{...initialFinding,status:'remediated'}];await render();
  expect(taskForm('detail-action').querySelector('.bad-due-help')).toBeTruthy();
  expect(taskForm('cancelled-sibling').querySelector('.bad-due-help')).toBeNull();
  mockTasks=[mockTasks[0],{...mockTasks[1],status:'open'}];mockFindings=[{...initialFinding,status:'accepted'}];await render();
  expect(taskForm('detail-action').querySelector('.bad-due-help')).toBeNull();
  expect(document.querySelector('.bad-sub').textContent).not.toContain('days overdue');
  await render({record:mockTasks[1]});
  expect(document.querySelector('.bad-sub').textContent).toContain('days overdue');
  expect(api.patch).not.toHaveBeenCalled();
});
