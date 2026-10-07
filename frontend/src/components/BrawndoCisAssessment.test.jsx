import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import {frameworkWorkspace} from '@/lib/frameworks';
import api from '@/lib/api';
import {BrawndoCisHeader} from './BrawndoCisOverview';
import guide from '@catalogs/operatorGuidance/cisRequirementGuide.json';
import catalog from '@catalogs/cisIG1.json';
import criteriaData from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';

let mockUser,mockOfficial=null;
jest.mock('@/lib/frameworks',()=>{const a=jest.requireActual('@/lib/frameworks');return {...a,frameworkDefinition:(k,id)=>{const d=a.frameworkDefinition(k,id);return mockOfficial&&d?{...d,official_text_mode:'LICENSED_TEXT',official_text:mockOfficial}:d;}};});
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:e=>e.message}));
jest.mock('./RecordDrawer',()=>({kind,record,initialValues,onOpenChange})=><div data-testid="nested">{kind} {record.title}{initialValues?.occurrence?.occurrence_id}<button onClick={()=>onOpenChange(false)}>Close linked record</button></div>);
jest.mock('./AssigneeSelect',()=>()=>null);
jest.mock('./ui/dialog',()=>{
 const R=require('react'),Close=R.createContext(null);return {Dialog:({children,onOpenChange})=><Close.Provider value={onOpenChange}><div>{children}</div></Close.Provider>,DialogContent:({children,onOpenAutoFocus,onCloseAutoFocus,onPointerDownOutside,...props})=><div {...props}>{children}<Close.Consumer>{close=><button onClick={()=>close(false)}>Close</button>}</Close.Consumer></div>,DialogTitle:R.forwardRef(({children,...props},ref)=><h2 {...props} ref={ref}>{children}</h2>),DialogDescription:({children})=><p>{children}</p>};
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

test('normal saves do not reapply historical guided provenance after an interview changes',async()=>{
 record={...record,guided_assessment_source:{version:'brawndo-cis-pilot-1',revision:1,generated_at:'2026-10-07',origin:'guided-assessment-pilot',answers:{inventory:'No'}}};
 await render();await act(async()=>button('Save assessment').click());
 expect(api.patch.mock.calls[0][1]).not.toHaveProperty('guided_assessment_source');
 expect(record.guided_assessment_source.answers.inventory).toBe('No');
});

test('retained IG2 assessment keeps its safeguard identity and content inside the assessment dialog',async()=>{
 record={...record,definition_id:'18.2'};
 await render();
 expect(container.querySelector('h2').textContent).toBe(catalog.requirements.find(row=>row.id==='18.2').title);
 expect(container.querySelector('.assessment-criteria-intro').textContent).toContain('Safeguard 18.2');
 expect(container.querySelector('[data-source-kind="official"]').textContent).toBe(catalog.requirements.find(row=>row.id==='18.2').official_text);
 expect(record.definition_id).toBe('18.2');expect(api.patch).not.toHaveBeenCalled();
});

test.each(['client_grc_manager','client_contributor'])('%s can edit an assigned assessment without admin-only relationship actions',async role=>{
 mockUser={...mockUser,role};record={...record,owner_id:mockUser.user_id};
 related.evidence=[{evidence_id:'e',filename:'Validation.txt',linked_type:'framework_assessment',linked_id:record.framework_assessment_id}];
 await render();
 expect(container.querySelector('[aria-label="Current implementation"]').disabled).toBe(false);
 expect(button('Create or link recurring Review')).toBeUndefined();
 expect(button('Link Evidence')).toBeUndefined();expect(button('Unlink')).toBeUndefined();
 expect(container.textContent).not.toContain('Validation.txt');
 expect(related.evidence[0].filename).toBe('Validation.txt');
});

test('framework configuration selects distinct workspaces without tenant identities',()=>{
 expect(frameworkWorkspace('cis-ig1')).toBe('cis');
 expect(frameworkWorkspace('soc-2')).toBe('soc');
 expect(frameworkWorkspace('iso-27001')).toBe('iso');
 expect(frameworkWorkspace('unknown')).toBe('generic');
});
const criteriaTab=async()=>act(async()=>{const tab=[...container.querySelectorAll('[role=tab]')].find(t=>t.textContent==='Assessment criteria');if(tab)tab.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));else{const disclosure=container.querySelector('.assessment-inline-criteria');if(!disclosure.open)disclosure.querySelector('summary').click();}});
const implementationTab=async()=>act(async()=>[...container.querySelectorAll('[role=tab]')].find(t=>t.textContent==='Requirement & implementation').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));
test('Brawndo overview no longer offers program configuration',async()=>{
 await act(async()=>root.render(<BrawndoCisHeader/>));
 expect(container.textContent).not.toMatch(/Program configuration/i);
 expect(container.querySelector('a[href*="client-profile"]')).toBeNull();
});
async function tick(el){await act(async()=>el.click());}

test('Brawndo two-tab layout retains checklist disclosure, saved badges and supporting workflows',async()=>{
 await render();expect(container.querySelector('[data-testid="brawndo-cis-assessment"]')).toBeTruthy();
 expect([...container.querySelectorAll('[role=tab]')].map(t=>t.textContent)).toEqual(['Requirement & implementation','Findings']);
 expect(container.querySelector('.assessment-inline-criteria')).not.toBeNull();
 expect(container.querySelector('[role=tab][data-state=active]').textContent).toBe('Requirement & implementation');
 expect(container.querySelector('[aria-label="Verification result"]')).toBeNull();expect(container.querySelector('.bcsg-metadata')).toBeNull();
 expect(container.querySelector('[data-testid="cis-supporting-records"]')).toBeNull();expect(container.querySelector('[data-testid="cis-operation"]')).toBeNull();
 expect(container.querySelector('h2').textContent).toBe('Establish and Maintain Detailed Enterprise Asset Inventory');
 expect(container.querySelector('[aria-label="Saved verification"]').textContent).toBe('Not verified');
 expect(container.querySelector('.assessment-summary').open).toBe(false);
 expect(container.querySelector('.assessment-implementation').children).toHaveLength(2);
 expect(container.querySelector('.bcsg-findings').closest('[role=tabpanel]').id).toMatch(/findings$/);

});
test('What CIS Requires labels the summary and links the official reference; official_text renders verbatim when supplied',async()=>{
 await render();expect(container.textContent).toContain('Requirement summary');
 expect(container.querySelector('[data-source-kind="official"]').textContent).toBe(catalog.requirements.find(d=>d.id===record.definition_id).official_text);
 const ref=[...container.querySelectorAll('a')].find(a=>a.textContent==='Official CIS source');expect(ref.href).toMatch(/^https:\/\/cas\.docs\.cisecurity\.org\//);
 expect(ref.nextSibling).toBeNull();mockOfficial='Authorized verbatim text.';
 await act(async()=>root.unmount());root=createRoot(container);await render();
 expect(container.querySelector('[data-source-kind="official"]').textContent).toBe(mockOfficial);

});
test('guidance is visible, noninteractive and never changes status, verification or draft state',async()=>{
 await render();await criteriaTab();
 const columns=container.querySelector('.assessment-criteria-columns');
 expect([...columns.children].map(c=>c.querySelector('h3').textContent)).toEqual(['Safeguard 1.1 checklist','Review guidance','Expected outcome']);
 expect(columns.children[1].querySelector('input,button,select,textarea')).toBeNull();expect(columns.children[2].querySelector('input,button,select,textarea')).toBeNull();
 expect(container.querySelector('input[value="addressed"]').checked).toBe(true);
 expect(container.querySelector('[aria-label="Saved verification"]').textContent).toBe('Not verified');
 expect(container.textContent).not.toContain('Unsaved assessment changes');expect(api.patch).not.toHaveBeenCalled();
 for(const removed of ['Examples of supporting evidence','What good looks like','Where should I start?'])expect(container.textContent).not.toContain(removed);

});
test('status, narrative and verification save while retaining prior criteria and the concurrency token',async()=>{
 record.owner_id='u';record.verification='needs_validation';record.cis_assessment_criteria=['1.1-c1'];
 await render();await tick(container.querySelector('input[value="in_progress"]'));await input('Current implementation','Inventory maintained in RMM; reconciled monthly.');
 await act(async()=>button('Save assessment').click());
 expect(api.patch).toHaveBeenCalledWith('/framework_assessments/a',expect.objectContaining({status:'in_progress',implementation:'Inventory maintained in RMM; reconciled monthly.',verification:'needs_validation',owner_id:'u',cis_assessment_criteria:['1.1-c1'],notes:'Older notes',technology:'Recorded platform',expected_last_assessed:null}));
 expect(container.textContent).toContain('Assessment saved.');expect(container.querySelector('[aria-label="Saved verification"]').textContent).toBe('Needs validation');

});

test('single requirement summary opens without writes and resets on safeguard/client changes',async()=>{
 await render();const before=JSON.stringify(record);const disclosure=container.querySelector('.assessment-summary');await tick(disclosure.querySelector('summary'));
 expect(disclosure.querySelector('p').textContent).toBe(guide.requirements['1.1'].plain);expect(disclosure.querySelector('button,select')).toBeNull();
 expect(JSON.stringify(record)).toBe(before);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
 record={...record,framework_assessment_id:'b',definition_id:'14.1'};await render();expect(container.querySelector('.assessment-summary').open).toBe(false);expect(container.querySelector('.assessment-summary p').textContent).toBe(guide.requirements['14.1'].plain);
 record={...record,client_id:'new-cis-client',framework_assessment_id:'c'};await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="new-cis-client" onOpenChange={close}/>));
 expect(container.querySelector('.assessment-summary').open).toBe(false);expect(container.querySelector('.assessment-summary p').textContent).toBe(guide.requirements['14.1'].plain);

});

test.each(catalog.requirements)('approved layout applies to safeguard $id for a non-Brawndo CIS client',async definition=>{
 record={...record,client_id:'new-cis-client',definition_id:definition.id,framework_assessment_id:'new-'+definition.id};await render('new-cis-client');
 expect(container.querySelector('.assessment-layout')).toBeTruthy();expect(container.querySelector('[data-source-kind="official"]').textContent).toBe(definition.official_text);
 expect(container.querySelector('.assessment-summary p').textContent).toBe(guide.requirements[definition.id].plain);expect(container.querySelector('.assessment-summary').open).toBe(false);
 await criteriaTab();expect(container.querySelector('.assessment-criteria-columns').children).toHaveLength(3);
 expect(container.querySelectorAll('.assessment-check')).toHaveLength(criteriaData.requirements[definition.id].criteria.length);
 expect(container.querySelector('.bcsg-findings').closest('[role=tabpanel]').id).toMatch(/findings$/);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();

});

test('static guide remains usable while an assessment draft is being edited',async()=>{
 await render();await input('Current implementation','Retain this unsaved draft');await tick(container.querySelector('.assessment-summary summary'));await criteriaTab();
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Retain this unsaved draft');expect(container.textContent).toContain('Unsaved assessment changes');expect(api.patch).not.toHaveBeenCalled();
 await implementationTab();expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Retain this unsaved draft');

});
test('status labels and N/A are preserved; legacy notes remain in a collapsed disclosure',async()=>{
 await render();expect([...container.querySelectorAll('input[name="bcsg-status"]')].map(i=>i.parentElement.textContent)).toEqual(['Implemented','Partially Implemented','Not Implemented','Not Assessed','Not Applicable']);
 expect(container.querySelector('.assessment-summary')).toBeTruthy();
 expect(container.querySelector('[aria-label="Current implementation"]')).toBeTruthy();
 expect(container.querySelector('[aria-label="N/A Rationale"]')).toBeNull();await tick(container.querySelector('input[value="not_applicable"]'));expect(container.querySelector('[aria-label="N/A Rationale"]')).toBeTruthy();
 expect(container.querySelector('.bcsg-legacy')).toBeNull();
 const notes=container.querySelector('[aria-label="Previously recorded notes"]');expect(notes.value).toBe('Older notes');expect(notes.closest('details').open).toBe(false);
 expect(record.technology).toBe('Recorded platform');expect(record.notes).toBe('Older notes');
});
test('next and close require explicit draft discard; cancel retains the draft',async()=>{
 await render();await input('Current implementation','Draft');await act(async()=>button('Next').click());expect(next).not.toHaveBeenCalled();
 expect(document.body.textContent).toContain('Leave unsaved changes?');await act(async()=>button('Keep editing').click());
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Draft');await act(async()=>button('Close').click());expect(close).not.toHaveBeenCalled();
 await act(async()=>button('Discard changes').click());expect(close).toHaveBeenCalledWith(false);
});
test('Save & next waits for a successful save and never navigates after failure',async()=>{
 await render();await input('Current implementation','New narrative');api.patch.mockRejectedValueOnce(new Error('Save rejected'));
 await act(async()=>button('Save & next').click());expect(next).not.toHaveBeenCalled();
 expect(container.querySelector('.brawndo-assessment-footer [role="alert"]').textContent).toBe('Save rejected');expect(container.textContent).toContain('Unsaved assessment changes');
 await act(async()=>button('Save & next').click());expect(next).toHaveBeenCalledTimes(1);expect(record.implementation).toBe('New narrative');
});
test.each(['client_readonly','client_contributor'])('unassigned %s cannot edit',async role=>{
 mockUser.role=role;await render();await criteriaTab();expect(button('Save assessment')).toBeUndefined();expect(container.querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
 expect(container.querySelector('.assessment-criteria-columns').textContent).toContain('Expected outcome');
 expect([...container.querySelectorAll('.assessment-check input')].every(input=>input.matches(':disabled'))).toBe(true);
 expect(container.querySelector('.assessment-summary summary')).toBeTruthy();

});
test('load failure disables writes and offers retry',async()=>{
 api.get.mockRejectedValue(new Error('Context unavailable'));await render();expect(container.querySelector('[role="alert"]').textContent).toContain('Context unavailable');expect(button('Save assessment').disabled).toBe(true);expect(button('Retry')).toBeTruthy();
});
test('other clients retain their assessment content with explicit modal semantics',async()=>{
 record={...record,client_id:'demo_dunder'};await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="demo_dunder" onOpenChange={close} onNext={next} position="1 of 56"/>));
 expect(container.textContent).toContain('Implementation status');expect(container.textContent).toContain('CIS assessment criteria');expect(container.querySelector('.assessment-inline-criteria summary')).toBeTruthy();expect(container.querySelector('[aria-modal="true"]')).not.toBeNull();
});
test('ISO assessments omit supplemental organizational controls without changing stored records',async()=>{
 record={...record,client_id:'demo_dunder',framework_key:'iso-27001',definition_id:'4.1'};
 await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="demo_dunder" onOpenChange={close} position="1 of 30"/>));
 expect(container.textContent).not.toContain('Organizational Controls');
  expect(container.querySelector('.assessment-summary').open).toBe(false);
  expect(container.querySelector('.assessment-summary p').textContent).toBeTruthy();
});
test('in-workspace breadcrumb returns to the control, behind the unsaved-changes guard',async()=>{
 const toControl=jest.fn();
 await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="demo_brawndo" onOpenChange={close} onNext={next} position="1 of 56" breadcrumb={[{label:'CIS IG1',onClick:jest.fn()},{label:'Control 1',onClick:toControl},{label:'Safeguard 1.1'}]}/>));
 expect([...container.querySelectorAll('.bcis-crumbs li')].map(l=>l.textContent)).toEqual(['CIS IG1','Control 1','Safeguard 1.1']);
 await input('Current implementation','Draft');await act(async()=>button('Control 1').click());expect(toControl).not.toHaveBeenCalled();
 expect(document.body.textContent).toContain('Leave unsaved changes?');await act(async()=>button('Discard changes').click());expect(toControl).toHaveBeenCalledTimes(1);
});
test('readable guidance preserves previous criteria, legacy checks and historical snapshots after save/reopen',async()=>{
 record.owner_id='u';record.verification='verified';record.verification_checklist={foundation:['1.1-f1'],mature:['1.1-m1']};record.cis_assessment_criteria=['historical-response'];
 await render();await criteriaTab();const item=criteriaData.requirements['1.1'].criteria[0];await tick(container.querySelector('.assessment-check input'));
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Current process');expect(container.querySelector('input[value="addressed"]').checked).toBe(true);expect(api.patch).not.toHaveBeenCalled();
 await implementationTab();await input('Current implementation','Retained legacy responses');await tick(button('Save assessment'));
 expect(record.verification_checklist).toEqual({foundation:['1.1-f1'],mature:['1.1-m1']});expect(record.cis_assessment_criteria).toEqual(['historical-response',item.id]);expect(record.owner_id).toBe('u');expect(record.verification).toBe('verified');
 expect(record.assessment_history[0].cis_assessment_criteria).toEqual(record.cis_assessment_criteria);
 await act(async()=>root.unmount());root=createRoot(container);await render();await criteriaTab();expect(container.querySelector('.assessment-check input').checked).toBe(true);expect(container.querySelector('.assessment-criteria-columns details').textContent).toContain('historical-response');
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Retained legacy responses');

});

test.each(['new-cis-client','existing-iso-client'])('shared guidance is identical for %s without client-specific content',async clientId=>{
 await render();const expected=container.querySelector('.assessment-criteria-columns').textContent;record={...record,client_id:clientId};await act(async()=>root.render(<FrameworkDrawer open record={record} clientId={clientId} onOpenChange={close}/>));
 expect(container.querySelector('.assessment-criteria-columns').textContent).toBe(expected);expect(expected).not.toContain('Brawndo');

});
test('a never-assessed safeguard does not name an assessor',async()=>{
 record={...record,last_assessed:null,assessed_by:'u'};await render();expect(container.querySelector('.bcsg-metadata')).toBeNull();expect(container.querySelector('header').textContent).not.toContain('assessed by');expect(record.last_assessed).toBeNull();

});

test('removed operating/footer UI preserves saved ownership and evidence links on save',async()=>{
 record.owner_id='u';record.cis_operation={provider:'Previously saved provider',confirmed:true};
 record.related_links=[{kind:'reviews',id:'r'}];
 related.reviews=[{review_id:'r',client_id:record.client_id,title:'Inventory review'}];
 related.evidence=[{evidence_id:'e',linked_type:'framework_assessment',linked_id:'a',filename:'Inventory.txt'}];
 await render();
 for(const label of ['Operational responsibility','Supporting records','View history','Inventory review','Inventory.txt'])expect(container.textContent).not.toContain(label);
 expect(container.querySelector('[aria-label="Provider involvement"]')).toBeNull();
 await input('Current implementation','Scope changed');await tick(button('Save assessment'));
 expect(record.owner_id).toBe('u');expect(record.related_links).toEqual([{kind:'reviews',id:'r'}]);
 expect(record.cis_operation).toEqual({provider:'Previously saved provider',confirmed:false});
 expect(related.evidence[0].filename).toBe('Inventory.txt');expect(api.delete).not.toHaveBeenCalled();
});
test('unfinished Finding blocks Save & next across all three tabs until cancelled',async()=>{
 await render();await tick(button('Findings'));await tick(button('Raise Finding'));await input('Finding title','Keep this draft');
 await implementationTab();expect(button('Save & next').disabled).toBe(true);
 await criteriaTab();expect(container.querySelector('[aria-label="Finding title"]').value).toBe('Keep this draft');
 expect(button('Save & next').disabled).toBe(true);expect(api.post).not.toHaveBeenCalled();
 await tick(button('Findings'));await tick(button('Cancel'));expect(button('Save & next').disabled).toBe(false);
});
test.each(['addressed','in_progress','needs_attention','not_assessed','not_applicable'])('implementation %s stays separate across all verification states',async status=>{
 const labels={addressed:'Implemented',in_progress:'Partially Implemented',needs_attention:'Not Implemented',not_assessed:'Not Assessed',not_applicable:'Not Applicable'};
 for(const verification of ['not_verified','needs_validation','gap_identified','verified']){
  record={...record,status,verification};await act(async()=>root.unmount());root=createRoot(container);await render();
  expect(container.querySelector('[aria-label="Saved implementation status"]').textContent).toBe(labels[status]);
  expect(container.querySelector('[aria-label="Saved verification"]').textContent).toBe({not_verified:'Not verified',needs_validation:'Needs validation',gap_identified:'Gap identified',verified:'Verified'}[verification]);expect(api.patch).not.toHaveBeenCalled();
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
  await act(async()=>button('Findings').click());await act(async()=>button('Raise Finding').click());
  expect(container.querySelector('[data-testid="finding-origin"]').textContent).toBe('Origin: CIS IG1 · safeguard 1.1 — Establish and Maintain Detailed Enterprise Asset Inventory');
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
  await act(async()=>button('Findings').click());await act(async()=>button('Raise Finding').click());await input('Finding title','Gap');await input('Corrective action','Fix gap');
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
