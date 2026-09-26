import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import {isBrawndoCisPrototype} from './BrawndoCisAssessment';
import api from '@/lib/api';

let mockUser;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:e=>e.message}));
jest.mock('./RecordDrawer',()=>({kind,record,onOpenChange})=><div data-testid="nested">{kind} {record.title}<button onClick={()=>onOpenChange(false)}>Close linked record</button></div>);
jest.mock('./AssigneeSelect',()=>()=>null);
jest.mock('./ui/dialog',()=>{
 const R=require('react');return {Dialog:({children})=><div>{children}</div>,DialogContent:({children,onOpenAutoFocus,onCloseAutoFocus,onPointerDownOutside,...props})=><div {...props}>{children}</div>,DialogTitle:R.forwardRef((props,ref)=><h2 {...props} ref={ref}/>),DialogDescription:({children})=><p>{children}</p>};
});
let root,container,record,related,close,next;
const button=name=>[...document.querySelectorAll('button')].find(b=>b.textContent===name);
async function input(label,value){const el=container.querySelector(`[aria-label="${label}"]`);await act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{
 global.crypto=require('node:crypto').webcrypto;
 global.IS_REACT_ACT_ENVIRONMENT=true;mockUser={user_id:'u',role:'super_admin',workspace_mode:'demo'};
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);close=jest.fn();next=jest.fn();
 record={framework_assessment_id:'a',framework_key:'cis-ig1',definition_id:'1.2',client_id:'demo_brawndo',status:'addressed',implementation:'Current process',technology:'Recorded platform',notes:'Older notes',assessment_history:[],last_assessed:null};
 related={reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]};
 api.get.mockImplementation(async path=>({data:path.endsWith('/related')?related:path==='/frameworks/cis-ig1'?{assessments:[record]}:path==='/evidence'?[{evidence_id:'e',filename:'Validation.txt'}]:[]}));
 api.patch.mockImplementation(async(path,body)=>{record={...record,...body,last_assessed:'2026-09-23',assessment_history:[{...body,at:'2026-09-23',by:'u'}]};return {data:record};});
 api.post.mockResolvedValue({data:{}});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
async function render(){await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="demo_brawndo" onOpenChange={close} onNext={next} position="2 of 56 in framework order"/>));}

test('activation requires the exact synthetic client, framework, record tenant and Demo identity',()=>{
 expect(isBrawndoCisPrototype('demo_brawndo',record,mockUser)).toBe(true);
 for(const candidate of [{...record,client_id:'demo_dunder'},{...record,framework_key:'iso-27001'}])expect(isBrawndoCisPrototype('demo_brawndo',candidate,mockUser)).toBe(false);
 expect(isBrawndoCisPrototype('demo_dunder',record,mockUser)).toBe(false);
 expect(isBrawndoCisPrototype('demo_brawndo',record,{...mockUser,workspace_mode:'standard'})).toBe(false);
});
test('linear hierarchy, reference-only content, specific validation and retained metadata',async()=>{
 await render();expect(container.querySelector('[data-testid="brawndo-cis-assessment"]')).toBeTruthy();
 expect([...container.querySelectorAll('.brawndo-step h3')].map(h=>h.textContent)).toEqual(['1What CIS requires','2Client status','3Delivery & current state','4Verification','5Required actions']);
 expect(container.textContent).toContain('Unknown devices are detected');expect(container.querySelector('[aria-label^="Verification status"]').children).toHaveLength(6);
 expect(container.textContent).toContain('Unknown-device records');expect(container.textContent).toContain('not official CIS text');
 expect(container.querySelector('a').href).toMatch(/^https:\/\/cas.docs.cisecurity.org\//);
 expect(container.querySelector('[aria-label="Technology / Processes Used"]').value).toBe('Recorded platform');
 expect(container.querySelector('[aria-label="Previously recorded notes"]').value).toBe('Older notes');
 expect(container.querySelector('input[value="addressed"]').checked).toBe(true);
});
test('status and narrative save through unchanged endpoint, concurrency token and legacy fields',async()=>{
 await render();await act(async()=>container.querySelector('input[value="in_progress"]').click());await input('How is this requirement implemented?','Unauthorized devices isolated pending review.');
 await act(async()=>button('Save assessment').click());
 expect(api.patch).toHaveBeenCalledWith('/framework_assessments/a',expect.objectContaining({status:'in_progress',implementation:'Unauthorized devices isolated pending review.',notes:'Older notes',technology:'Recorded platform',expected_last_assessed:null}));
 expect(container.textContent).toContain('Assessment saved.');expect(container.textContent).not.toContain('Unsaved assessment changes');
});
test('next and close require explicit draft discard; cancel retains narrative',async()=>{
 await render();await input('How is this requirement implemented?','Draft');await act(async()=>button('Next').click());expect(next).not.toHaveBeenCalled();
 expect(document.body.textContent).toContain('Leave unsaved changes?');await act(async()=>button('Keep editing').click());
 expect(container.querySelector('textarea').value).toBe('Draft');await act(async()=>button('Close assessment').click());expect(close).not.toHaveBeenCalled();
 await act(async()=>button('Discard changes').click());expect(close).toHaveBeenCalledWith(false);
});
test('evidence links and Findings use authoritative relationship/workflow endpoints',async()=>{
 await render();await act(async()=>button('Link Evidence').click());const select=container.querySelector('[aria-label="Link existing Evidence"]');
 await act(async()=>{select.value='e';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(api.post).toHaveBeenCalledWith('/framework_assessments/a/links',{kind:'evidence',id:'e'});
 await act(async()=>button('Create Finding').click());await act(async()=>button('Create Finding & Action').click());
 expect(api.post).toHaveBeenCalledWith('/framework_assessments/a/findings',expect.objectContaining({description:'Current process',request_id:expect.any(String)}));
 expect(api.post.mock.calls.some(([p])=>p==='/tasks')).toBe(false);
});
test('linked Findings and Action Items open their existing drawers',async()=>{
 related.findings=[{finding_id:'f',title:'Device gap',status:'open'}];related.tasks=[{task_id:'t',title:'Isolate devices',status:'open'}];
 await render();await act(async()=>button('Device gap').click());expect(container.querySelector('[data-testid="nested"]').firstChild.textContent).toBe('findings');
 expect(container.querySelector('[data-testid="nested"]').textContent).toContain('Device gap');
 await act(async()=>button('Isolate devices').click());expect(container.querySelector('[data-testid="nested"]').firstChild.textContent).toBe('tasks');
 expect(container.querySelector('[data-testid="nested"]').textContent).toContain('Isolate devices');
});
test.each(['client_readonly','client_contributor'])('unassigned %s cannot edit or create linked work',async role=>{
 mockUser.role=role;await render();expect(container.querySelector('fieldset').disabled).toBe(true);expect(button('Save assessment')).toBeUndefined();expect(button('Create Finding')).toBeUndefined();
});
test('load failure disables writes and offers retry',async()=>{
 api.get.mockRejectedValue(new Error('Context unavailable'));await render();expect(container.querySelector('[role="alert"]').textContent).toContain('Context unavailable');expect(button('Save assessment').disabled).toBe(true);expect(button('Retry')).toBeTruthy();
});
test('failed save keeps the draft, error and unsaved status',async()=>{
 await render();await input('How is this requirement implemented?','Draft kept');api.patch.mockRejectedValue(new Error('Conflict: reload required'));await act(async()=>button('Save assessment').click());
 expect(container.textContent).toContain('Conflict: reload required');expect(container.textContent).toContain('Unsaved assessment changes');expect(container.querySelector('textarea').value).toBe('Draft kept');
});

test('Save & next waits for a successful save and never navigates after failure',async()=>{
 await render();await input('How is this requirement implemented?','New narrative');
 api.patch.mockRejectedValueOnce(new Error('Save rejected'));
 await act(async()=>button('Save & next').click());expect(next).not.toHaveBeenCalled();
 expect(container.querySelector('.brawndo-assessment-footer [role="alert"]').textContent).toBe('Save rejected');
 await act(async()=>button('Save & next').click());expect(next).toHaveBeenCalledTimes(1);
 expect(record.implementation).toBe('New narrative');
});

test('Save & next cannot discard a separate Finding or comment draft',async()=>{
 await render();await act(async()=>button('Create Finding').click());
 expect(button('Save & next').disabled).toBe(true);
 expect(container.querySelector('[aria-label="Finding description"]').tagName).toBe('TEXTAREA');
 await act(async()=>button('Cancel Finding').click());
 await input('Safeguard comment','Unposted comment');expect(button('Save & next').disabled).toBe(true);
 expect(next).not.toHaveBeenCalled();
});

test('evidence picker searches display name, distinguishes no match, and retains filename',async()=>{
 api.get.mockImplementation(async path=>({data:path.endsWith('/related')?related:path==='/frameworks/cis-ig1'?{assessments:[record]}:path==='/evidence'?[{evidence_id:'e',filename:'report.txt',display_name:'Asset reconciliation',created_at:'2026-09-01',evidence_type:'Report'}]:[]}));
 await render();await act(async()=>button('Link Evidence').click());
 expect(container.textContent).toContain('Asset reconciliation · 2026-09-01');
 await input('Find existing evidence','no-match');expect(container.textContent).toContain('No evidence matches your search');
 expect(container.querySelector('[aria-label="Link existing Evidence"]').disabled).toBe(true);
 await input('Find existing evidence','report.txt');expect(container.querySelector('[aria-label="Link existing Evidence"]').disabled).toBe(false);
 expect(container.textContent).toContain('save immediately');
});

test('same-record refresh retains linked opener; refresh failure still disables writes',async()=>{
 related.findings=[{finding_id:'f',title:'Device gap',status:'open'}];await render();
 const opener=button('Device gap');await act(async()=>opener.click());
 let reject;api.get.mockImplementation(()=>new Promise((_,fail)=>{reject=fail;}));
 await act(async()=>button('Close linked record').click());
 expect(button('Device gap')).toBe(opener);expect(opener.isConnected).toBe(true);
 await act(async()=>reject(new Error('Refresh denied')));
 expect(button('Save assessment').disabled).toBe(true);
 expect(container.textContent).toContain('Refresh denied');
});

test('context refresh cannot erase an already refreshed evidence picker',async()=>{
 await render();await act(async()=>button('Link Evidence').click());
 const normalGet=api.get.getMockImplementation();let finishContext;
 api.get.mockImplementation(path=>path==='/frameworks/cis-ig1'?new Promise(resolve=>{finishContext=resolve;}):normalGet(path));
 const select=container.querySelector('[aria-label="Link existing Evidence"]');
 await act(async()=>{select.value='e';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(select.disabled).toBe(false);
 await act(async()=>finishContext({data:{assessments:[record]}}));
 expect(container.querySelector('[aria-label="Link existing Evidence"]').disabled).toBe(false);
 expect(container.textContent).not.toContain('Loading available evidence');
});

test('verification ladder separates recorded capability from verified implementation',async()=>{
 record={...record,status:'in_progress',technology:'',implementation:'Partial process'};await render();
 const ladder=container.querySelector('[aria-label^="Verification status"]').textContent;
 expect(ladder).toContain('Capability exists: not established');expect(ladder).toContain('Implementation verified: gap identified');
 expect(container.textContent).toContain('recorded gap but no Finding');
});
