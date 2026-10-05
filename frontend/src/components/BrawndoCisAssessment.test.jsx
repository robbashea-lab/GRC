import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import {frameworkWorkspace} from '@/lib/frameworks';
import api from '@/lib/api';
import {BrawndoCisHeader} from './BrawndoCisOverview';
import guide from '@catalogs/operatorGuidance/cisRequirementGuide.json';
import catalog from '@catalogs/cisIG1.json';
import {GUIDE_QUESTIONS} from './CisRequirementGuide';

let mockUser,mockOfficial=null;
jest.mock('@/lib/frameworks',()=>{const a=jest.requireActual('@/lib/frameworks');return {...a,frameworkDefinition:(k,id)=>{const d=a.frameworkDefinition(k,id);return mockOfficial&&d?{...d,official_text_mode:'LICENSED_TEXT',official_text:mockOfficial}:d;}};});
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:e=>e.message}));
jest.mock('./RecordDrawer',()=>({kind,record,initialValues,onOpenChange})=><div data-testid="nested">{kind} {record.title}{initialValues?.occurrence?.occurrence_id}<button onClick={()=>onOpenChange(false)}>Close linked record</button></div>);
jest.mock('./AssigneeSelect',()=>()=>null);
jest.mock('./ui/dialog',()=>{
 const R=require('react');return {Dialog:({children})=><div>{children}</div>,DialogContent:({children,onOpenAutoFocus,onCloseAutoFocus,onPointerDownOutside,...props})=><div {...props}>{children}</div>,DialogTitle:R.forwardRef(({children,...props},ref)=><h2 {...props} ref={ref}>{children}</h2>),DialogDescription:({children})=><p>{children}</p>};
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
 api.get.mockImplementation(async path=>({data:path.endsWith('/related')?related:path.startsWith('/frameworks/')?{assessments:[record]}:path==='/organizational-controls'?{items:[],has_more:false,migration_pending:0}:path==='/evidence/catalog'?{items:[{evidence_id:'e',filename:'Validation.txt'}],total:1,page:1,page_size:25}:[]}));
 api.patch.mockImplementation(async(path,body)=>{record={...record,...body,last_assessed:'2026-09-23',assessment_history:[{...body,at:'2026-09-23',by:'u'}]};return {data:record};});
 api.post.mockResolvedValue({data:{}});
});
afterEach(async()=>{mockOfficial=null;await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
async function render(clientId='demo_brawndo'){await act(async()=>root.render(<FrameworkDrawer open record={record} clientId={clientId} onOpenChange={close} onNext={next} position="2 of 56 in framework order"/>));}

test('retained IG2 assessment identifies its scope inside the assessment dialog',async()=>{
 record={...record,definition_id:'18.2'};
 await render();
 expect(container.querySelector('[data-testid="brawndo-cis-assessment"]').textContent).toContain('Retained out-of-scope safeguard');
});

test.each(['client_grc_manager','client_contributor'])('%s can edit an assigned assessment without admin-only relationship actions',async role=>{
 mockUser={...mockUser,role};record={...record,owner_id:mockUser.user_id};
 related.evidence=[{evidence_id:'e',filename:'Validation.txt',linked_type:'framework_assessment',linked_id:record.framework_assessment_id}];
 await render();
 expect(container.querySelector('[aria-label="Current implementation"]').disabled).toBe(false);
 expect(button('Create or link recurring Review')).toBeUndefined();
 expect(button('Link Evidence')).toBeUndefined();expect(button('Unlink')).toBeUndefined();
 expect(container.textContent).toContain('Validation.txt');
});

test('framework configuration selects distinct workspaces without tenant identities',()=>{
 expect(frameworkWorkspace('cis-ig1')).toBe('cis');
 expect(frameworkWorkspace('soc-2')).toBe('soc');
 expect(frameworkWorkspace('iso-27001')).toBe('iso');
 expect(frameworkWorkspace('unknown')).toBe('generic');
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
 expect(headings()).toEqual(['What CIS Requires','CIS Assessment Criteria','Implementation Status','Current Implementation']);
 expect(container.querySelector('[aria-label="Verification result"]').closest('.brawndo-step')).toBeNull();
 for(const gone of ['Required actions','Organizational Controls','Remediation','Create Finding'])expect(container.textContent).not.toContain(gone);
 expect(container.querySelector('[data-testid="cis-supporting-records"]').open).toBe(false);
 expect(container.querySelector('[data-testid="cis-operation"]').open).toBe(false);
 expect(container.querySelector('h2').textContent).toBe('CIS IG1 1.1 — Establish and Maintain Detailed Enterprise Asset Inventory');
 expect(container.querySelector('header').textContent).not.toContain('Last assessed');
 expect(container.querySelector('[aria-label="Saved verification"]').textContent).toBe('Not verified');
 const disclosure=container.querySelector('.cis-guide-disclosure');
 expect(disclosure.open).toBe(false);
 expect(disclosure.compareDocumentPosition(container.querySelector('.brawndo-step')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 const implementation=container.querySelector('.cis-implementation-layout');
 expect(implementation.children).toHaveLength(2);
 expect(implementation.nextElementSibling).toBe(container.querySelector('.bcsg-findings'));
});
test('What CIS Requires labels the summary and links the official reference; official_text renders verbatim when supplied',async()=>{
 await render();expect(container.textContent).toContain('Requirement summary');expect(container.textContent).not.toContain('Omnisciente summary — not official CIS text');
 expect(container.querySelector('[data-testid="cis-official-text"]').textContent).toBe(catalog.requirements.find(d=>d.id===record.definition_id).official_text);
 const ref=[...container.querySelectorAll('a')].find(a=>a.textContent==='Official CIS reference ↗');expect(ref.href).toMatch(/^https:\/\/cas\.docs\.cisecurity\.org\//);
 for(const gone of ['Source cadence','IG1 ·'])expect(container.textContent).not.toContain(gone);
 mockOfficial='Authorized verbatim text.';
 await act(async()=>root.unmount());root=createRoot(container);await render();
 expect(container.querySelector('[data-testid="cis-official-text"]').textContent).toBe('Authorized verbatim text.');expect(container.textContent).not.toContain('not official CIS text');mockOfficial=null;
});
test('guidance is visible, noninteractive and never changes status, verification or draft state',async()=>{
 await render();expect(container.textContent).toContain('not additional CIS requirements');
 const guidance=container.querySelector('.cis-assessment-guidance');
 expect([...guidance.querySelectorAll('h4')].map(h=>h.textContent)).toEqual(['What to review and confirm','Examples of supporting evidence','What good looks like']);
 expect(guidance.querySelector('input,button,details,select,textarea')).toBeNull();
 expect(container.querySelector('input[value="addressed"]').checked).toBe(true);
 expect(container.querySelector('[data-testid="tier-signal"]')).toBeNull();
 expect(container.querySelector('[aria-label="Verification result"]').value).toBe('not_verified');
 expect(container.textContent).not.toContain('Unsaved assessment changes');
 expect(api.patch).not.toHaveBeenCalled();
 expect(container.textContent).not.toMatch(/\d+%|score|maturity level|compliant/i);
});
test('status, narrative and verification save while retaining prior criteria and the concurrency token',async()=>{
 record.cis_assessment_criteria=['1.1-c1'];
 await render();await tick(container.querySelector('input[value="in_progress"]'));
 await input('Current implementation','Inventory maintained in RMM; reconciled monthly.');
 const sel=container.querySelector('[aria-label="Verification result"]');await act(async()=>{sel.value='needs_validation';sel.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>button('Save assessment').click());
 expect(api.patch).toHaveBeenCalledWith('/framework_assessments/a',expect.objectContaining({status:'in_progress',implementation:'Inventory maintained in RMM; reconciled monthly.',verification:'needs_validation',cis_assessment_criteria:['1.1-c1'],notes:'Older notes',technology:'Recorded platform',expected_last_assessed:null}));
 expect(container.textContent).toContain('Assessment saved.');expect(container.querySelector('[aria-label="Saved verification"]').textContent).toBe('Needs validation');
});

test('guide selects one answer without writes or drafts and resets on safeguard/client changes',async()=>{
 await render();const before=JSON.stringify(record);
 container.querySelector('.cis-guide-disclosure').open=true;
 const answer=()=>container.querySelector('.cis-guide-answer p').textContent;
 expect(answer()).toBe(guide.requirements['1.1'].plain);
 for(const [key,label] of GUIDE_QUESTIONS){
  await tick(button(label));expect(answer()).toBe(guide.requirements['1.1'][key]);
  expect(container.querySelectorAll('.cis-guide-questions [aria-pressed="true"]')).toHaveLength(1);
  expect(button(label).getAttribute('aria-pressed')).toBe('true');
  expect(document.getElementById(button(label).getAttribute('aria-controls'))).toBeTruthy();
 }
 expect(JSON.stringify(record)).toBe(before);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
 expect(container.textContent).not.toContain('Unsaved assessment changes');
 record={...record,framework_assessment_id:'b',definition_id:'14.1'};await render();
 expect(container.querySelector('.cis-guide-disclosure').open).toBe(false);
 expect(answer()).toBe(guide.requirements['14.1'].plain);
 await tick(button('What common gaps should I look for?'));
 container.querySelector('.cis-guide-disclosure').open=true;
 record={...record,client_id:'new-cis-client',framework_assessment_id:'c'};
 await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="new-cis-client" onOpenChange={close}/>));
 expect(answer()).toBe(guide.requirements['14.1'].plain);
 expect(container.querySelector('.cis-guide-disclosure').open).toBe(false);
 expect(container.querySelector('.cis-guide-questions [aria-pressed="true"]').textContent).toBe('Explain this in plain language.');
});

test.each(catalog.requirements)('approved layout applies to safeguard $id for a non-Brawndo CIS client',async definition=>{
  record={...record,client_id:'new-cis-client',definition_id:definition.id,framework_assessment_id:'new-'+definition.id};
  await render('new-cis-client');
  expect(container.querySelector('.cis-assessment-layout')).toBeTruthy();
  expect(container.querySelector('[data-testid="cis-official-text"]').textContent).toBe(definition.official_text);
  expect(container.querySelector('[data-testid="cis-authored-summary"]').textContent).toBe(definition.guidance);
  expect(container.querySelector('.cis-guide-disclosure').open).toBe(false);
  expect(container.querySelector('.cis-guide-answer p').textContent).toBe(guide.requirements[definition.id].plain);
  expect(container.querySelector('.cis-assessment-guidance').children).toHaveLength(3);
  expect(container.querySelector('.cis-implementation-layout').nextElementSibling).toBe(container.querySelector('.bcsg-findings'));
 expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('static guide remains usable while an assessment draft is being edited',async()=>{
 await render();await input('Current implementation','Retain this unsaved draft');
 await tick(button('Where should I start?'));
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Retain this unsaved draft');
 expect(container.textContent).toContain('Unsaved assessment changes');expect(api.patch).not.toHaveBeenCalled();
 expect(container.querySelector('[aria-label="Current implementation"]').closest('.cis-guidance-layout')).toBeNull();
});
test('status labels and N/A are preserved; legacy notes remain in a collapsed disclosure',async()=>{
 await render();expect([...container.querySelectorAll('input[name="bcsg-status"]')].map(i=>i.parentElement.textContent)).toEqual(['Implemented','Partially Implemented','Not Implemented','Not Assessed','Not Applicable']);
 expect(container.textContent).toContain('Document how the organization currently satisfies this safeguard.');
 expect(container.querySelector('#bcsg-current-help').compareDocumentPosition(container.querySelector('[aria-label="Current implementation"]')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(container.querySelector('[aria-label="N/A Rationale"]')).toBeNull();await tick(container.querySelector('input[value="not_applicable"]'));expect(container.querySelector('[aria-label="N/A Rationale"]')).toBeTruthy();
 expect(container.querySelector('.bcsg-legacy')).toBeNull();
 const notes=container.querySelector('[aria-label="Previously recorded notes"]');expect(notes.value).toBe('Older notes');expect(notes.closest('details').open).toBe(false);
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
 expect(container.querySelector('.cis-assessment-guidance').textContent).toContain('What good looks like');
 expect(container.querySelector('.cis-assessment-guidance input')).toBeNull();
 expect(button('Where should I start?').disabled).toBe(false);
});
test('load failure disables writes and offers retry',async()=>{
 api.get.mockRejectedValue(new Error('Context unavailable'));await render();expect(container.querySelector('[role="alert"]').textContent).toContain('Context unavailable');expect(button('Save assessment').disabled).toBe(true);expect(button('Retry')).toBeTruthy();
});
test('other clients retain their assessment content with explicit modal semantics',async()=>{
 record={...record,client_id:'demo_dunder'};await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="demo_dunder" onOpenChange={close} onNext={next} position="1 of 56"/>));
 expect(container.textContent).toContain('Implementation Status');expect(container.textContent).toContain('CIS Assessment Criteria');expect(container.querySelector('[aria-modal="true"]')).not.toBeNull();
});
test('ISO assessments expose the existing organizational controls section',async()=>{
 record={...record,client_id:'demo_dunder',framework_key:'iso-27001',definition_id:'4.1'};
 await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="demo_dunder" onOpenChange={close} position="1 of 30"/>));
 expect(container.textContent).toContain('Organizational Controls');
  expect(container.querySelector('.iso-guide-disclosure').open).toBe(false);
  expect(container.querySelector('.cis-requirement-guide')).not.toBeNull();
});
test('in-workspace breadcrumb returns to the control, behind the unsaved-changes guard',async()=>{
 const toControl=jest.fn();
 await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="demo_brawndo" onOpenChange={close} onNext={next} position="1 of 56" breadcrumb={[{label:'CIS IG1',onClick:jest.fn()},{label:'Control 1',onClick:toControl},{label:'Safeguard 1.1'}]}/>));
 expect([...container.querySelectorAll('.bcis-crumbs li')].map(l=>l.textContent)).toEqual(['CIS IG1','Control 1','Safeguard 1.1']);
 await input('Current implementation','Draft');await act(async()=>button('Control 1').click());expect(toControl).not.toHaveBeenCalled();
 expect(document.body.textContent).toContain('Leave unsaved changes?');await act(async()=>button('Discard changes').click());expect(toControl).toHaveBeenCalledTimes(1);
});
test('readable guidance preserves previous criteria, legacy checks and historical snapshots after save/reopen',async()=>{
 record.verification_checklist={foundation:['1.1-f1'],mature:['1.1-m1']};
 record.cis_assessment_criteria=['1.1-c1'];
 await render();
 expect(container.querySelector('[data-testid="brawndo-cis-assessment"]').getAttribute('aria-modal')).toBe('true');
 expect(container.querySelector('[data-testid="criteria-source"]').textContent).toBe('Sources: CIS Safeguard 1.1 · v8.1');
 expect(container.querySelectorAll('.cis-assessment-guidance')).toHaveLength(1);
 expect(container.querySelectorAll('.bcsg-criteria input')).toHaveLength(0);
 for(const text of ['Foundation','Mature','Stronger practice','Manage people'])expect(container.textContent).not.toContain(text);
 await input('Current implementation','Retained legacy responses');await act(async()=>button('Save assessment').click());
 expect(record.verification_checklist).toEqual({foundation:['1.1-f1'],mature:['1.1-m1']});
 expect(record.cis_assessment_criteria).toEqual(['1.1-c1']);
 await act(async()=>root.unmount());root=createRoot(container);await render();
 expect(container.querySelector('.cis-assessment-guidance input')).toBeNull();
 expect(container.textContent).toContain('Assessment criteria: 1.1-c1');
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Retained legacy responses');
});

test.each(['new-cis-client','existing-iso-client'])('shared guidance is identical for %s without client-specific content',async clientId=>{
 await render();const expected=container.querySelector('.cis-assessment-guidance').textContent;
 record={...record,client_id:clientId};
 await act(async()=>root.render(<FrameworkDrawer open record={record} clientId={clientId} onOpenChange={close}/>));
 expect(container.querySelector('.cis-assessment-guidance').textContent).toBe(expected);
 expect(container.querySelector('.cis-assessment-guidance').textContent).not.toContain('Brawndo');
});
test('a never-assessed safeguard does not name an assessor',async()=>{
 record={...record,last_assessed:null,assessed_by:'u'};await render();
 expect(container.querySelector('.bcsg-meta').textContent).toBe('Last assessed: Not assessed');
});

test('optional operating details retain saved information without a confirmation checklist',async()=>{
 record.owner_id='u';record.cis_operation={provider:'Previously saved provider',confirmed:true};await render();
 expect(container.querySelector('[aria-label="Provider involvement"]').value).toBe('Previously saved provider');
 expect(container.textContent).toContain('Previously recorded arrangement confirmation retained');
 expect(container.querySelector('[aria-label="Operating arrangement recorded"]')).toBeNull();
 await input('Provider involvement','MSP weekly quarantine with internal oversight');
 await tick(button('Save assessment'));
 expect(record.cis_operation).toEqual({provider:'MSP weekly quarantine with internal oversight',confirmed:false});
 expect(record.status).toBe('addressed');expect(record.verification).toBe('not_verified');
 await input('Current implementation','Scope changed');
 expect(container.textContent).not.toContain('Previously recorded arrangement confirmation retained');
});
test('supporting records open without losing the assessment draft and history uses its precise occurrence',async()=>{
 related.reviews=[{review_id:'r',client_id:record.client_id,title:'Inventory review',framework_key:'cis-ig1',framework_safeguards:['1.1'],recurrence:'semiannual'}];
 record.related_links=[{kind:'reviews',id:'r'}];
 related.evidence=[{evidence_id:'direct',linked_type:'framework_assessment',linked_id:'a',filename:'Inventory.txt'},{evidence_id:'inherited',linked_type:'reviews',linked_id:'r',occurrence_id:'old',filename:'Review sample.txt'}];
 const get=api.get.getMockImplementation();api.get.mockImplementation(async(path,opts)=>path==='/reviews/r/history'?{data:[{occurrence_id:'old',period:'2025 annual review',completed_at:'2025-10-01'}]}:get(path,opts));
 await render();await input('Current implementation','Retain linked-record draft');
 await tick(button('Inventory review'));expect(container.querySelector('[data-testid="nested"]').textContent).toContain('reviews Inventory review');
 await tick(button('Close linked record'));expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Retain linked-record draft');
 await tick(button('Completed occurrences'));expect(container.textContent).toContain('2025 annual review');
 await tick(button('2025 annual review · Completed 2025-10-01'));expect(container.querySelector('[data-testid="nested"]').textContent).toContain('old');
 await tick(button('Close linked record'));expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Retain linked-record draft');
 expect(container.textContent).toContain('Direct Evidence');expect(container.textContent).toContain('Evidence through linked Reviews');
 expect(container.querySelector('[data-testid="cis-supporting-records"]')).toBeTruthy();expect(api.patch).not.toHaveBeenCalled();
});
test('unfinished recurring Review setup blocks Save & next until cancelled',async()=>{
 await render();await tick(button('Create or link recurring Review'));
 expect(button('Save & next').disabled).toBe(true);await tick(button('Save & next'));expect(next).not.toHaveBeenCalled();
 await tick(button('Cancel Review setup'));expect(button('Save & next').disabled).toBe(false);
});
test.each(['addressed','in_progress','needs_attention','not_assessed','not_applicable'])('implementation %s stays separate across all verification states',async status=>{
 const labels={addressed:'Implemented',in_progress:'Partially Implemented',needs_attention:'Not Implemented',not_assessed:'Not Assessed',not_applicable:'Not Applicable'};
 for(const verification of ['not_verified','needs_validation','gap_identified','verified']){
  record={...record,status,verification};await act(async()=>root.unmount());root=createRoot(container);await render();
  expect(container.querySelector('[aria-label="Saved implementation status"]').textContent).toBe(labels[status]);
  expect(container.querySelector('[aria-label="Verification result"]').value).toBe(verification);expect(api.patch).not.toHaveBeenCalled();
 }
});

describe('safeguard Findings',()=>{
 const f=(id,status,extra={})=>({finding_id:id,client_id:'demo_brawndo',title:'Finding '+id,status,severity:'high',framework_assessment_id:'a',...extra});
 test('lists direct open, Pending Validation and closed Findings with their Action state',async()=>{
  related.findings=[f('o','in_remediation'),f('p','remediated',{severity:'medium'}),f('c','closed'),f('x','open',{framework_assessment_id:'other'})];
  related.tasks=[{task_id:'t1',title:'Correct open issue',finding_id:'o',client_id:'demo_brawndo',status:'in_progress',due_date:'2026-11-01'},{task_id:'t2',title:'Verify correction',finding_id:'p',client_id:'demo_brawndo',status:'done'}];
  await render();
  const open=container.querySelector('[aria-label="Remediation tickets"]').textContent;
  expect(open).toContain('Correct open issue');expect(open).toContain('in progress · Unassigned · Due 2026-11-01');
  expect(open).toContain('pending validation');
  expect(open).not.toContain('Finding x');
  expect(container.querySelectorAll('[data-ticket-id]')).toHaveLength(3);
  expect(open).toContain('completed');
  await act(async()=>button('Verify correction').click());expect(container.querySelector('[data-testid="nested"]').textContent).toContain('findings Finding p');
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
