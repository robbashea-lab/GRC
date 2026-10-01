import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import {isBrawndoCisPrototype} from './BrawndoCisAssessment';
import api from '@/lib/api';
import {BrawndoCisHeader} from './BrawndoCisOverview';

let mockUser,mockOfficial=null;
jest.mock('@/lib/frameworks',()=>{const a=jest.requireActual('@/lib/frameworks');return {...a,frameworkDefinition:(k,id)=>{const d=a.frameworkDefinition(k,id);return mockOfficial&&d?{...d,official_text_mode:'LICENSED_TEXT',official_text:mockOfficial}:d;}};});
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
 record={framework_assessment_id:'a',framework_key:'cis-ig1',definition_id:'1.1',client_id:'demo_brawndo',status:'addressed',implementation:'Current process',technology:'Recorded platform',notes:'Older notes',assessment_history:[],last_assessed:null};
 related={reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]};
 api.get.mockImplementation(async path=>({data:path.endsWith('/related')?related:path==='/frameworks/cis-ig1'?{assessments:[record]}:path==='/organizational-controls'?{items:[],has_more:false,migration_pending:0}:path==='/evidence/catalog'?{items:[{evidence_id:'e',filename:'Validation.txt'}],total:1,page:1,page_size:25}:[]}));
 api.patch.mockImplementation(async(path,body)=>{record={...record,...body,last_assessed:'2026-09-23',assessment_history:[{...body,at:'2026-09-23',by:'u'}]};return {data:record};});
 api.post.mockResolvedValue({data:{}});
});
afterEach(async()=>{mockOfficial=null;await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
async function render(){await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="demo_brawndo" onOpenChange={close} onNext={next} position="2 of 56 in framework order"/>));}

test('activation requires the exact synthetic client, framework, record tenant and Demo identity',()=>{
 expect(isBrawndoCisPrototype('demo_brawndo',record,mockUser)).toBe(true);
 for(const candidate of [{...record,client_id:'demo_dunder'},{...record,framework_key:'iso-27001'}])expect(isBrawndoCisPrototype('demo_brawndo',candidate,mockUser)).toBe(false);
 expect(isBrawndoCisPrototype('demo_dunder',record,mockUser)).toBe(false);
 expect(isBrawndoCisPrototype('demo_brawndo',record,{...mockUser,workspace_mode:'standard'})).toBe(false);
});
const headings=()=>[...container.querySelectorAll('.brawndo-step h3')].map(h=>h.textContent.replace(/^\d/,''));
test('Brawndo overview no longer offers program configuration',async()=>{
 await act(async()=>root.render(<BrawndoCisHeader/>));
 expect(container.textContent).not.toMatch(/Program configuration/i);
 expect(container.querySelector('a[href*="client-profile"]')).toBeNull();
});
async function tick(el){await act(async()=>el.click());}

test('four sections in order; verification remains editable near the top',async()=>{
 await render();expect(container.querySelector('[data-testid="brawndo-cis-assessment"]')).toBeTruthy();
 expect(headings()).toEqual(['What CIS Requires','CIS IG1 Assessment Criteria','Implementation Status','Current Implementation']);
 expect(container.querySelector('[aria-label="Verification result"]').closest('.brawndo-step')).toBeNull();
 for(const gone of ['Evidence','Required actions','Organizational Controls','Remediation','Create Finding','Link Evidence'])expect(container.textContent).not.toContain(gone);
 expect(container.querySelector('h2').textContent).toBe('CIS IG1 1.1 — Establish and Maintain Detailed Enterprise Asset Inventory');
 expect(container.querySelector('header').textContent).not.toContain('Last assessed');
 expect(container.querySelector('[aria-label="Saved verification"]').textContent).toBe('Not verified');
});
test('What CIS Requires labels the summary and links the official reference; official_text renders verbatim when supplied',async()=>{
 await render();expect(container.textContent).toContain('Requirement summary');expect(container.textContent).not.toContain('Omnisciente summary — not official CIS text');
 expect(container.querySelector('[data-testid="cis-official-text"]')).toBeNull();
 const ref=[...container.querySelectorAll('a')].find(a=>a.textContent==='Official CIS reference ↗');expect(ref.href).toMatch(/^https:\/\/cas\.docs\.cisecurity\.org\//);
 for(const gone of ['Source cadence','IG1 ·'])expect(container.textContent).not.toContain(gone);
 mockOfficial='Authorized verbatim text.';
 await act(async()=>root.unmount());root=createRoot(container);await render();
 expect(container.querySelector('[data-testid="cis-official-text"]').textContent).toBe('Authorized verbatim text.');expect(container.textContent).not.toContain('not official CIS text');mockOfficial=null;
});
test('assessment criteria ticks are drafts and never change status or verification',async()=>{
 await render();expect(container.textContent).toContain('They do not introduce additional requirements.');
 expect(container.querySelectorAll('.bcsg-criteria input')).toHaveLength(4);
 const boxes=[...container.querySelectorAll('.bcsg-criteria input')];for(const b of boxes)await tick(b);
 expect(container.querySelectorAll('.bcsg-criteria input:checked')).toHaveLength(4);expect(container.querySelector('input[value="addressed"]').checked).toBe(true);
 expect(container.querySelector('[data-testid="tier-signal"]')).toBeNull();
 expect(container.querySelector('[aria-label="Verification result"]').value).toBe('not_verified');
 expect(container.textContent).toContain('Unsaved assessment changes');
 expect(container.textContent).not.toMatch(/\d+%|score|maturity level|compliant/i);
});
test('status, current implementation, verification and checklist save with the concurrency token',async()=>{
 await render();await tick(container.querySelector('input[value="in_progress"]'));
 await input('Current implementation','Inventory maintained in RMM; reconciled monthly.');
 const sel=container.querySelector('[aria-label="Verification result"]');await act(async()=>{sel.value='needs_validation';sel.dispatchEvent(new Event('change',{bubbles:true}));});
 await tick(container.querySelector('.bcsg-criteria input'));
 await act(async()=>button('Save assessment').click());
 expect(api.patch).toHaveBeenCalledWith('/framework_assessments/a',expect.objectContaining({status:'in_progress',implementation:'Inventory maintained in RMM; reconciled monthly.',verification:'needs_validation',cis_assessment_criteria:['1.1-c1'],notes:'Older notes',technology:'Recorded platform',expected_last_assessed:null}));
 expect(container.textContent).toContain('Assessment saved.');expect(container.querySelector('[aria-label="Saved verification"]').textContent).toBe('Needs validation');
});
test('status labels and N/A are preserved; helper precedes narrative and legacy fields are hidden',async()=>{
 await render();expect([...container.querySelectorAll('input[name="bcsg-status"]')].map(i=>i.parentElement.textContent)).toEqual(['Implemented','Partially Implemented','Not Implemented','Not Assessed','Not Applicable']);
 expect(container.textContent).toContain('Document how the organization currently satisfies this safeguard.');
 expect(container.querySelector('#bcsg-current-help').compareDocumentPosition(container.querySelector('[aria-label="Current implementation"]')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(container.querySelector('[aria-label="N/A Rationale"]')).toBeNull();await tick(container.querySelector('input[value="not_applicable"]'));expect(container.querySelector('[aria-label="N/A Rationale"]')).toBeTruthy();
 expect(container.querySelector('.bcsg-legacy')).toBeNull();expect(container.textContent).not.toContain('Previously recorded');
 expect(record.technology).toBe('Recorded platform');expect(record.notes).toBe('Older notes');
});
test('next and close require explicit draft discard; cancel retains the draft',async()=>{
 await render();await input('Current implementation','Draft');await act(async()=>button('Next').click());expect(next).not.toHaveBeenCalled();
 expect(document.body.textContent).toContain('Leave unsaved changes?');await act(async()=>button('Keep editing').click());
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Draft');await act(async()=>button('Close assessment').click());expect(close).not.toHaveBeenCalled();
 await act(async()=>button('Discard changes').click());expect(close).toHaveBeenCalledWith(false);
});
test('Save & next waits for a successful save and never navigates after failure',async()=>{
 await render();await input('Current implementation','New narrative');api.patch.mockRejectedValueOnce(new Error('Save rejected'));
 await act(async()=>button('Save & next').click());expect(next).not.toHaveBeenCalled();
 expect(container.querySelector('.brawndo-assessment-footer [role="alert"]').textContent).toBe('Save rejected');expect(container.textContent).toContain('Unsaved assessment changes');
 await act(async()=>button('Save & next').click());expect(next).toHaveBeenCalledTimes(1);expect(record.implementation).toBe('New narrative');
});
test.each(['client_readonly','client_contributor'])('unassigned %s cannot edit',async role=>{
 mockUser.role=role;await render();expect(button('Save assessment')).toBeUndefined();expect(container.querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
 expect(container.querySelector('.bcsg-criteria').disabled).toBe(true);
});
test('load failure disables writes and offers retry',async()=>{
 api.get.mockRejectedValue(new Error('Context unavailable'));await render();expect(container.querySelector('[role="alert"]').textContent).toContain('Context unavailable');expect(button('Save assessment').disabled).toBe(true);expect(button('Retry')).toBeTruthy();
});
test('other clients retain their assessment content with explicit modal semantics',async()=>{
 record={...record,client_id:'demo_dunder'};await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="demo_dunder" onOpenChange={close} onNext={next} position="1 of 56"/>));
 expect(container.textContent).toContain('Client status');expect(container.textContent).not.toContain('CIS IG1 Assessment Criteria');expect(container.querySelector('[aria-modal="true"]')).not.toBeNull();
});
test('in-workspace breadcrumb returns to the control, behind the unsaved-changes guard',async()=>{
 const toControl=jest.fn();
 await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="demo_brawndo" onOpenChange={close} onNext={next} position="1 of 56" breadcrumb={[{label:'CIS IG1',onClick:jest.fn()},{label:'Control 1',onClick:toControl},{label:'Safeguard 1.1'}]}/>));
 expect([...container.querySelectorAll('.bcis-crumbs li')].map(l=>l.textContent)).toEqual(['CIS IG1','Control 1','Safeguard 1.1']);
 await input('Current implementation','Draft');await act(async()=>button('Control 1').click());expect(toControl).not.toHaveBeenCalled();
 expect(document.body.textContent).toContain('Leave unsaved changes?');await act(async()=>button('Discard changes').click());expect(toControl).toHaveBeenCalledTimes(1);
});
test('dialog has one source-labelled checklist and no maturity guidance',async()=>{
 record.verification_checklist={foundation:['1.1-f1'],mature:['1.1-m1']};
 await render();
 expect(container.querySelector('[data-testid="brawndo-cis-assessment"]').getAttribute('aria-modal')).toBe('true');
 expect(container.querySelector('[data-testid="criteria-source"]').textContent).toBe('Sources: CIS Safeguard 1.1 · v8.1');
 expect(container.querySelectorAll('.bcsg-criteria')).toHaveLength(1);
 expect(container.querySelectorAll('.bcsg-criteria input:checked')).toHaveLength(0);
 for(const text of ['Foundation','Operational','Mature','Stronger practice','Previously recorded','Manage people'])expect(container.textContent).not.toContain(text);
 await tick(container.querySelector('.bcsg-criteria input'));await act(async()=>button('Save assessment').click());
 expect(record.verification_checklist).toEqual({foundation:['1.1-f1'],mature:['1.1-m1']});
 expect(record.cis_assessment_criteria).toEqual(['1.1-c1']);
 await act(async()=>root.unmount());root=createRoot(container);await render();
 expect(container.querySelector('.bcsg-criteria input').checked).toBe(true);
});
test('a never-assessed safeguard does not name an assessor',async()=>{
 record={...record,last_assessed:null,assessed_by:'u'};await render();
 expect(container.querySelector('.bcsg-meta').textContent).toBe('Last assessed: Not assessed');
});

describe('safeguard Findings',()=>{
 const f=(id,status,extra={})=>({finding_id:id,client_id:'demo_brawndo',title:'Finding '+id,status,severity:'high',framework_assessment_id:'a',...extra});
 test('lists direct open, Pending Validation and closed Findings with their Action state',async()=>{
  related.findings=[f('o','in_remediation'),f('p','remediated',{severity:'medium'}),f('c','closed'),f('x','open',{framework_assessment_id:'other'})];
  related.tasks=[{task_id:'t1',finding_id:'o',client_id:'demo_brawndo',status:'in_progress',due_date:'2026-11-01'},{task_id:'t2',finding_id:'p',client_id:'demo_brawndo',status:'done'}];
  await render();
  const open=container.querySelector('[aria-label="Open Findings"]').textContent;
  expect(open).toContain('Finding o');expect(open).toContain('High · In remediation · Action in progress · due 2026-11-01');
  expect(open).toContain('Moderate · Pending Validation · Action completed');
  expect(open).not.toContain('Finding x');
  expect(container.querySelector('.bcsg-closed summary').textContent).toBe('1 closed / validated');
  await act(async()=>button('Finding p').click());expect(container.querySelector('[data-testid="nested"]').textContent).toContain('findings Finding p');
 });
 test('Raise Finding records the safeguard origin, owner and target date, once per draft',async()=>{
  api.post.mockResolvedValue({data:{}});await render();
  await act(async()=>button('Raise Finding').click());
  expect(container.querySelector('[data-testid="finding-origin"]').textContent).toBe('Origin: CIS IG1 · Safeguard 1.1 — Establish and Maintain Detailed Enterprise Asset Inventory');
  await input('Finding title','Inventory excludes plant devices');await input('Corrective action','Add plant devices to inventory');await input('Finding target date','2026-12-15');
  const sev=container.querySelector('[aria-label="Finding severity"]');await act(async()=>{sev.value='high';sev.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(button('Save & next').disabled).toBe(true);
  await act(async()=>button('Create Finding & Action').click());
  const [path,body]=api.post.mock.calls.find(([p])=>p.endsWith('/findings'));
  expect(path).toBe('/framework_assessments/a/findings');
  expect(body).toMatchObject({title:'Inventory excludes plant devices',remediation_title:'Add plant devices to inventory',severity:'high',due_date:'2026-12-15',request_id:expect.any(String)});
  expect(body).not.toHaveProperty('owner_id');
  expect(container.querySelector('.bcsg-finding-form')).toBeNull();
 });
 test('a failed create keeps the draft and its request id for the retry',async()=>{
  api.post.mockRejectedValueOnce(new Error('Network unavailable'));await render();
  await act(async()=>button('Raise Finding').click());await input('Finding title','Gap');await input('Corrective action','Fix gap');
  await act(async()=>button('Create Finding & Action').click());
  expect(container.textContent).toContain('Network unavailable');expect(container.querySelector('.bcsg-finding-form')).toBeTruthy();
  api.post.mockResolvedValue({data:{}});await act(async()=>button('Create Finding & Action').click());
  const ids=api.post.mock.calls.filter(([p])=>p.endsWith('/findings')).map(([,b])=>b.request_id);
  expect(ids).toHaveLength(2);expect(ids[0]).toBe(ids[1]);
 });
 test.each(['client_readonly','client_contributor'])('%s without assignment cannot raise Findings',async role=>{
  mockUser.role=role;await render();expect(button('Raise Finding')).toBeUndefined();
 });
});
