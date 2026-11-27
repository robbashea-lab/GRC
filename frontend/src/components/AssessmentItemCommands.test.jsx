import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AssessmentItems from './AssessmentItems';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
jest.mock('./AssigneeSelect',()=>({value,onChange,disabled})=><select aria-label="Action assignee" value={value||''} disabled={disabled} onChange={event=>onChange(event.target.value)}><option value="">Unassigned</option><option value="writer">Writer</option></select>);

let host,root,record,owner,controls,saved,changed;
const button=(label,scope=document.body)=>[...scope.querySelectorAll('button')].find(node=>node.textContent===label);
const dialog=()=>document.body.querySelector('[role=dialog]');
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function click(label,scope=document.body){const node=button(label,scope);expect(node).toBeTruthy();expect(node.disabled).toBe(false);await act(async()=>node.click());}
async function edit(label,value){const field=document.body.querySelector(`[aria-label="${label}"]`);await act(async()=>{
  Object.getOwnPropertyDescriptor(field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(field,value);
  field.dispatchEvent(new Event('input',{bubbles:true}));
});}
async function render(props={}){await act(async()=>root.render(<AssessmentItems record={record} ctx={{current:record,users:[]}} controls={controls}
  disabled={false} onSaved={saved} onDraftChange={changed} {...props}/>));}

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  owner={identity:'synthetic-writer-client-a-assessment-a'};
  controls={scope:owner,commandScope:'synthetic-stable-command-owner',writable:true,pending:false,operations:[],answers:{},onRefresh:jest.fn(),onOpenWork:jest.fn(),clientLabel:'Synthetic QA client'};
  record={client_id:'client-a',framework_key:'nist-csf-2',framework_assessment_id:'assessment-a',implementation:'Saved native text',status:'in_progress',verification:'verified',items_revision:3,
    items_to_address:[{item_id:'actual-confirmation',kind:'verification',item_type:'confirmation',origin:'manual',state:'open',text:'Confirm actual ownership',resolution:'',history:[]}],
    item_controls:{'actual-confirmation':{origin:'manual',can_create_action:true,can_remove:true,can_create_finding:false}}};
  saved=jest.fn();changed=jest.fn();api.get.mockReset();api.post.mockReset();api.patch.mockReset();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});

test('pending Add and resolution use typed draft operations and never issue native writes',async()=>{
  function Pending(){
    const [operations,setOperations]=useState([]);
    const pending={...controls,pending:true,operations,onOperation:operation=>{setOperations(previous=>[...previous,operation]);return true;}};
    return <AssessmentItems record={record} ctx={{current:record}} controls={pending} proposedItems={[]} workDisabled onSaved={saved} onDraftChange={changed}/>;
  }
  await act(async()=>root.render(<Pending/>));await click('Add item');await edit('Item description','SYNTHETIC Unicode confirmation — Ω');
  await click('Add item',dialog());
  expect(dialog()).toBeNull();expect(host.textContent).toContain('SYNTHETIC Unicode confirmation — Ω');
  const item=[...host.querySelectorAll('.assessment-item')].find(node=>node.textContent.includes('SYNTHETIC Unicode'));
  await act(async()=>item.querySelector('input[type=checkbox]').click());
  expect(item.textContent).toContain('Resolved');
  await click('Remove item',item);expect(host.textContent).toContain('Removed');
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();expect(saved).not.toHaveBeenCalled();
  expect(changed).toHaveBeenLastCalledWith(false);
});

test('native Add confirms the exact assessment receipt and retains errors for retry',async()=>{
  api.post.mockRejectedValueOnce(new Error('SYNTHETIC interrupted response'));
  await render();await click('Add item');await edit('Item description','SYNTHETIC manual evidence follow-up');await click('Add item',dialog());
  expect(dialog().textContent).toContain('SYNTHETIC interrupted response');
  expect(dialog().querySelector('[aria-label="Item description"]').disabled).toBe(true);
  const [path,body,options]=api.post.mock.calls[0];
  expect(path).toBe('/framework_assessments/assessment-a/items');
  expect(body).toMatchObject({expected_revision:3,item_type:'gap',text:'SYNTHETIC manual evidence follow-up'});
  api.post.mockResolvedValueOnce({data:{...record,items_revision:4}});
  await click('Retry original save',dialog());
  expect(api.post.mock.calls[1]).toEqual([path,body,options]);expect(saved).toHaveBeenCalledTimes(1);expect(dialog()).toBeNull();
});

test('an uncertain Task retries original A while newer assessment draft B stays protected',async()=>{
  api.post.mockRejectedValueOnce(new Error('SYNTHETIC Task response lost'));
  await render();await click('Create Action Item');await click('Create Action Item',dialog());
  const original=api.post.mock.calls[0];expect(original[0]).toBe('/framework_assessments/assessment-a/items/actual-confirmation/task');
  record={...record,implementation:'Unsaved assessment draft B'};
  await render({workDisabled:true});
  expect(button('Retry original save',dialog()).disabled).toBe(false);
  api.post.mockResolvedValueOnce({data:{task_id:'actual-task-a',client_id:'client-a',framework_assessment_id:'assessment-a',assessment_item_id:'actual-confirmation'}});
  api.get.mockResolvedValueOnce({data:{...record,items_revision:4}});
  await click('Retry original save',dialog());
  expect(api.post.mock.calls[1]).toEqual(original);expect(record.implementation).toBe('Unsaved assessment draft B');
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({items_revision:4}));expect(dialog()).toBeNull();
});

test('late successful receipt cannot update an ended owner even after A to B to A',async()=>{
  const pending=deferred();api.post.mockReturnValueOnce(pending.promise);
  await render();await click('Add item');await edit('Item description','SYNTHETIC owner-fenced follow-up');await click('Add item',dialog());
  controls={...controls,scope:{identity:'different-client-owner'}};await render();
  controls={...controls,scope:{identity:owner.identity}};await render();
  await act(async()=>pending.resolve({data:{...record,items_revision:4}}));
  expect(saved).not.toHaveBeenCalled();expect(dialog()).toBeNull();
});

test('read-only Client questions are explicit saved reads and failed copy has honest manual recovery',async()=>{
  controls={...controls,writable:false};
  api.get.mockResolvedValueOnce({data:{client_id:'client-a',framework_key:'nist-csf-2',questions:[{item_id:'actual-confirmation',definition_id:'GV.OC-01',text:'Confirm actual ownership'}],unconfirmed_count:2}});
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:jest.fn().mockRejectedValue(new Error('Clipboard unavailable'))}});
  await render({disabled:true});expect(button('Add item').disabled).toBe(true);await click('Client questions');
  expect(api.get).toHaveBeenCalledWith('/frameworks/nist-csf-2/client-questions',{params:{client_id:'client-a'}});
  expect(dialog().textContent).toContain('2 open Items have unconfirmed responsibility.');
  await click('Copy',dialog());expect(dialog().textContent).toContain('copy them manually');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('1. Confirm actual ownership (GV.OC-01)');
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('linked work opens only the exact same-client native record and foreign responses stay closed',async()=>{
  record={...record,items_to_address:[{...record.items_to_address[0],task_id:'actual-task-a'}]};
  api.get.mockResolvedValueOnce({data:{task_id:'actual-task-a',client_id:'foreign-client'}});
  await render();await click('Open Action Item');expect(controls.onOpenWork).not.toHaveBeenCalled();expect(host.textContent).toContain('does not match');
  const task={task_id:'actual-task-a',client_id:'client-a',title:'Actual linked work'};
  api.get.mockResolvedValueOnce({data:task});await click('Open Action Item');
  expect(controls.onOpenWork).toHaveBeenCalledWith({kind:'tasks',record:task});expect(api.post).not.toHaveBeenCalled();
});

test('a forged retained route cannot be retried against another assessment',async()=>{
  sessionStorage.setItem('grc_pending_command_v1:'+controls.commandScope+':assessment-item-task',JSON.stringify({key:'synthetic_command_key_01',snapshot:JSON.stringify(['/framework_assessments/foreign-assessment/items/foreign-item/task',{expected_revision:3,title:'Forged retained path'}])}));
  await render();await click('Retry unconfirmed save');
  expect(host.textContent).toContain('retained Action command could not be verified');expect(api.post).not.toHaveBeenCalled();
});

test('an interrupted resolution survives remount and retries its exact payload without requiring a readable held parent',async()=>{
  api.patch.mockRejectedValueOnce(new Error('SYNTHETIC resolution receipt lost'));
  await render();await act(async()=>host.querySelector('input[type=checkbox]').click());
  const original=api.patch.mock.calls[0];expect(original[1]).toEqual({expected_revision:3,state:'resolved',resolution:''});
  expect(saved).not.toHaveBeenCalled();expect(host.textContent).toContain('SYNTHETIC resolution receipt lost');
  await act(async()=>root.unmount());root=createRoot(host);
  await render({ctx:null});expect(button('Retry unconfirmed save').disabled).toBe(false);
  api.patch.mockResolvedValueOnce({data:{...record,items_revision:4,items_to_address:[{...record.items_to_address[0],state:'resolved'}]}});
  await click('Retry unconfirmed save');
  expect(api.patch.mock.calls[1]).toEqual(original);expect(saved).toHaveBeenCalledTimes(1);expect(api.post).not.toHaveBeenCalled();
  expect(button('Retry unconfirmed save')).toBeUndefined();
});

test('exact retained Resolution A retry preserves newer local note B until its own explicit save',async()=>{
  const originalRecord=record;
  function Resolution(){const [current,setCurrent]=useState(record);return <AssessmentItems record={current} ctx={{current}} controls={controls}
    onSaved={data=>{record=data;setCurrent(data);saved(data);}} onDraftChange={changed}/>;}
  await act(async()=>root.render(<Resolution/>));await edit('Resolution: Confirm actual ownership','SYNTHETIC Resolution A');
  api.patch.mockRejectedValueOnce(new Error('SYNTHETIC response A lost'));await click('Save resolution');
  const first=api.patch.mock.calls[0];expect(first[1].resolution).toBe('SYNTHETIC Resolution A');
  expect(button('Add item').disabled).toBe(true);expect(button('Create Action Item').disabled).toBe(true);
  await edit('Resolution: Confirm actual ownership','SYNTHETIC newer Resolution B');
  api.patch.mockResolvedValueOnce({data:{...record,items_revision:4,items_to_address:[{...record.items_to_address[0],resolution:'SYNTHETIC Resolution A'}]}});
  await click('Save resolution');expect(api.patch.mock.calls[1]).toEqual(first);
  expect(document.querySelector('[aria-label="Resolution: Confirm actual ownership"]').value).toBe('SYNTHETIC newer Resolution B');
  expect(record.items_to_address[0].resolution).toBe('SYNTHETIC Resolution A');expect(changed).toHaveBeenLastCalledWith(true);
  api.patch.mockResolvedValueOnce({data:{...record,items_revision:5,items_to_address:[{...record.items_to_address[0],resolution:'SYNTHETIC newer Resolution B'}]}});
  await click('Save resolution');expect(api.patch.mock.calls[2][1]).toEqual({expected_revision:4,state:'open',resolution:'SYNTHETIC newer Resolution B'});
  expect(api.patch.mock.calls[2][2].headers['Idempotency-Key']).not.toBe(first[2].headers['Idempotency-Key']);
  expect(record.items_to_address[0].resolution).toBe('SYNTHETIC newer Resolution B');expect(changed).toHaveBeenLastCalledWith(false);
  expect(record.status).toBe(originalRecord.status);expect(record.verification).toBe(originalRecord.verification);
});

test('prefilled Action title never splits Unicode while full Item description stays intact',async()=>{
  record={...record,items_to_address:[{...record.items_to_address[0],text:'😀'.repeat(500)}]};
  await render();await click('Create Action Item');
  const title=dialog().querySelector('[aria-label="Action title"]').value;
  expect(Array.from(title)).toHaveLength(500);expect(/[\uD800-\uDBFF]$/.test(title)).toBe(false);
  expect(dialog().querySelector('[aria-label="Action description"]').value).toBe(record.items_to_address[0].text);
  expect(api.post).not.toHaveBeenCalled();
});

test('standard Item rows use the approved readable type and explicit native Resolve command',async()=>{
  record={...record,items_to_address:[{...record.items_to_address[0],created_at:'2026-11-01T12:30:00Z'}]};
  await render({standard:true});
  const row=host.querySelector('.ita-row');expect(row.closest('.ita-wrap')).toBeTruthy();
  expect(row.querySelector('.st').textContent).toBe('Needs confirmation');
  expect(row.querySelector('.ita-txt').textContent).toBe('Confirm actual ownership');
  expect(row.querySelector('time').getAttribute('datetime')).toBe('2026-11-01T12:30:00.000Z');
  expect(record.items_to_address[0].created_at).toBe('2026-11-01T12:30:00Z');
  expect(button('Create action item',row).disabled).toBe(false);
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  api.patch.mockResolvedValueOnce({data:{...record,items_revision:4,items_to_address:[{...record.items_to_address[0],state:'resolved'}]}});
  await click('Resolve',row);
  expect(api.patch.mock.calls[0][1]).toEqual({expected_revision:3,state:'resolved',resolution:''});
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({status:'in_progress',verification:'verified',items_revision:4}));
});
