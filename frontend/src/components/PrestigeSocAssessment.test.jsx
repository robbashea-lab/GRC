import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import socGuidance from '@catalogs/operatorGuidance/socAssessmentGuidance.json';
import socCatalog from '@catalogs/soc2.json';

let mockUser;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:e=>e.message}));
jest.mock('@/lib/recordUuid',()=>({recordUuid:()=> 'test-request-id'}));
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('./AssigneeSelect',()=>({value,onChange,disabled})=><select aria-label="Owner" value={value||''} disabled={disabled} onChange={e=>onChange(e.target.value||null)}><option value="">Unassigned</option><option value="david">David Wallace</option></select>);
jest.mock('./ui/dialog',()=>{const R=require('react');return {Dialog:({children})=><div>{children}</div>,DialogContent:({children,onOpenAutoFocus,onCloseAutoFocus,onPointerDownOutside,...props})=><div {...props}>{children}</div>,DialogTitle:R.forwardRef((props,ref)=><h2 {...props} ref={ref}/>),DialogDescription:({children})=><p>{children}</p>};});

let root,container,record,close,related;
const button=name=>[...document.querySelectorAll('button')].find(b=>b.textContent===name);
const setValue=async(label,value)=>{const el=container.querySelector(`[aria-label="${label}"]`);await act(async()=>{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLSelectElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});};
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;mockUser={user_id:'u',role:'super_admin',workspace_mode:'demo'};close=jest.fn();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 record={framework_assessment_id:'soc-a',framework_key:'soc-2',definition_id:'CC9.2',client_id:'demo_prestige',status:'in_progress',verification:'needs_validation',implementation:'Existing vendor monitoring process.',technology:'Retained legacy field',notes:'Retained note',na_rationale:'',owner_id:null,assessment_history:[],last_assessed:'2026-09-22T12:00:00Z'};
 related={reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]};
 api.get.mockImplementation(async path=>({data:path.endsWith('/related')?related:path==='/frameworks/soc-2'?{assessments:[record],work:{}}:path.includes('/members')?[{user_id:'david',name:'David Wallace'}]:path==='/organizational-controls'?{items:[],has_more:false,migration_pending:0}:[]}));
 api.patch.mockImplementation(async(path,body)=>{record={...record,...body,last_assessed:'2026-10-01T12:00:00Z',assessed_by:'u',assessment_history:[{...body,at:'2026-10-01T12:00:00Z',by:'u'}]};return {data:record};});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
const render=async(clientId='demo_prestige')=>act(async()=>root.render(<FrameworkDrawer open record={{...record,client_id:clientId}} clientId={clientId} onOpenChange={close} position="33 of 38 in framework order" breadcrumb={[{label:'SOC 2',onClick:jest.fn()},{label:'Security',onClick:jest.fn()},{label:'CC9',onClick:jest.fn()},{label:'CC9.2'}]}/>));
const headings=()=>[...container.querySelectorAll('.brawndo-step h3')].map(h=>h.textContent.replace(/^\d/,''));

test('Prestige SOC criterion workspace is focused, source-qualified and ordered',async()=>{
 await render();expect(container.querySelector('[data-testid="prestige-soc-assessment"]')).toBeTruthy();expect(headings()).toEqual(['What SOC 2 Requires','SOC 2 Assessment Guidance','Implementation Status','Current Implementation']);
 expect(container.querySelector('h2').textContent).toBe('SOC 2 CC9.2 — Third-party risk oversight');expect(container.textContent).toContain('Security · Common Criteria');
 expect(container.textContent).not.toContain('Omnisciente explanation — not official AICPA text');expect(container.querySelector('[data-testid="soc-official-text"]')).toBeNull();
 const ref=[...container.querySelectorAll('a')].find(a=>a.textContent==='AICPA Reference ↗');expect(ref.href).toMatch(/^https:\/\/www\.aicpa-cima\.com\//);
 expect(container.querySelectorAll('.psoc-tier')).toHaveLength(3);expect(container.textContent).toContain('do not represent additional SOC 2 requirements');
 expect(container.textContent).toContain('Requirement summary · Omnisciente');
 expect(container.querySelector('[data-testid="soc-requirement-summary"]').textContent).toBe(socGuidance.criteria['CC9.2'].practical.summary);
 expect(container.querySelector('.psoc-guidance').dataset.guidanceVersion).toBe(socGuidance.version);
 expect(container.textContent).toContain('Internal readiness, not an auditor opinion.');
 expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
 expect(container.querySelector('.psoc-previous-checks')).toBeNull();
 for(const gone of ['Client organizational Controls','Scope and observation period settings','Required actions','Create Finding','Link Evidence'])expect(container.textContent).not.toContain(gone);
});

test('read-only guidance preserves previous responses without changing conclusions or narrative',async()=>{
 record.soc_assessment_checks=['CC9.2-v1-r1','CC9.2-v1-o1'];
 await render();
 const previous=container.querySelector('.psoc-previous-checks');
 expect(previous.open).toBe(false);expect(previous.textContent).toContain('Previous checklist responses · 2');
 expect([...previous.querySelectorAll('li')].map(el=>el.textContent)).toEqual(socGuidance.criteria['CC9.2'].items.slice(0,2).map(item=>item.text));
 expect(container.querySelector('[aria-label$=" completion"]')).toBeNull();
 await act(async()=>previous.querySelector('summary').click());
 expect(previous.open).toBe(true);
 expect(api.patch).not.toHaveBeenCalled();
 await act(async()=>button('Save assessment').click());
 expect(api.patch).toHaveBeenCalledWith('/framework_assessments/soc-a',expect.objectContaining({soc_assessment_checks:['CC9.2-v1-r1','CC9.2-v1-o1'],status:'in_progress',verification:'needs_validation',implementation:'Existing vendor monitoring process.'}));
 expect(record.assessment_history[0].soc_assessment_checks).toEqual(['CC9.2-v1-r1','CC9.2-v1-o1']);
});

test('empty enhanced tier is hidden without hiding prior responses',async()=>{
 const [id,entry]=Object.entries(socGuidance.criteria).find(([,entry])=>!entry.practical.enhanced.length);
 record={...record,definition_id:id,soc_assessment_checks:[entry.items[0].id]};
 await render();
 expect(container.querySelector('#psoc-guidance-enhanced')).toBeNull();
 expect(container.querySelector('.psoc-previous-checks').textContent).toContain(entry.items[0].text);
 expect(container.querySelector('.psoc-previous-checks').open).toBe(false);
});

test('unrecognized historical IDs remain visible instead of being dropped or relabeled',async()=>{
 record.soc_assessment_checks=['CC9.2-retired-response'];
 await render();
 expect(container.querySelector('.psoc-previous-checks li').textContent).toBe('CC9.2-retired-response');
 expect(record.soc_assessment_checks).toEqual(['CC9.2-retired-response']);
 expect(api.patch).not.toHaveBeenCalled();
});

test('shared context distinguishes selected controls, evidence alternatives and Type 2 operation',async()=>{
 await render();
 const context=container.querySelector('.psoc-guidance-context');
 expect(context.open).toBe(false);
 await act(async()=>context.querySelector('summary').click());
 for(const key of ['categories','obligations','type2','gaps'])expect(context.textContent).toContain(socGuidance.context[key]);
 expect(container.querySelector('#psoc-guidance-evidence').closest('section').textContent).toContain(socGuidance.context.evidence);
 expect(api.patch).not.toHaveBeenCalled();
});

test('all in-scope criteria have stable, classified guidance and no forced empty panels',()=>{
 expect(socGuidance.tiers.map(t=>t.key)).toEqual(['criterion_requirements','operational_practices','enhanced_assurance']);
 expect(Object.keys(socGuidance.criteria)).toHaveLength(38);
 expect(Object.keys(socGuidance.criteria).sort()).toEqual(socCatalog.requirements.filter(d=>['security','availability','confidentiality'].includes(d.category)).map(d=>d.id).sort());
 const ids=[];
 for(const [criterion,entry] of Object.entries(socGuidance.criteria)){
   expect(entry.source_reference).toBe(criterion);expect(entry.source_page).toBeGreaterThan(0);expect(entry.review_note).toBeTruthy();
   expect(entry.items.some(i=>i.tier==='criterion_requirements')).toBe(true);
   for(const item of entry.items){
     ids.push(item.id);expect(item.id.startsWith(criterion+'-v1-')).toBe(true);expect(item.text).toBeTruthy();expect(item.source_reference).toBeTruthy();
     expect(item.tier==='criterion_requirements'?['criterion','point_of_focus']:item.tier==='operational_practices'?['operational_guidance']:['enhanced_assurance']).toContain(item.source_type);
   }
 }
 expect(new Set(ids).size).toBe(ids.length);
 expect(Object.values(socGuidance.criteria).filter(c=>!c.items.some(i=>i.tier==='enhanced_assurance'))).toHaveLength(8);
});

test('read-only reviewers can read practical guidance and cannot edit the assessment',async()=>{
 mockUser={...mockUser,role:'client_viewer'};
 await render();
 expect(container.querySelectorAll('.psoc-guidance-group')).toHaveLength(3);
 expect(container.querySelectorAll('.psoc-tier input')).toHaveLength(0);
 expect(container.querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
 expect(container.querySelector('[aria-label="Verification result"]').disabled).toBe(true);
 expect(button('Save assessment')).toBeUndefined();
});

test.each(Object.keys(socGuidance.criteria))('%s renders exactly its practical guidance and populated tiers',async id=>{
 record={...record,definition_id:id};
 await render();
 const guidance=socGuidance.criteria[id].practical;
 expect(container.querySelectorAll('.psoc-tier input')).toHaveLength(0);
 expect(container.querySelectorAll('.psoc-tier')).toHaveLength(1+Number(!!guidance.operational.length)+Number(!!guidance.enhanced.length));
 for(const key of ['review','evidence','outcome','operational','enhanced']){
   const heading=container.querySelector(`#psoc-guidance-${key}`);
   expect(heading? [...heading.closest('section').querySelectorAll('li')].map(el=>el.textContent):[]).toEqual(guidance[key]);
 }
 expect(container.querySelector('[data-testid="soc-requirement-summary"]').textContent).toBe(guidance.summary);
});

test('Save & Next advances only after saving the narrative and preserving previous responses',async()=>{
 record.soc_assessment_checks=['CC9.2-v1-r1'];
 const next=jest.fn();
 await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="demo_prestige" onOpenChange={close} onNext={next}/>));
 await setValue('Current implementation','Reviewed dated provider records and escalation results.');
 api.patch.mockRejectedValueOnce(new Error('Save failed'));
 await act(async()=>button('Save & next').click());
 expect(next).not.toHaveBeenCalled();expect(container.textContent).toContain('Save failed');
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Reviewed dated provider records and escalation results.');
 await act(async()=>button('Save & next').click());
 expect(next).toHaveBeenCalledTimes(1);
 expect(record.soc_assessment_checks).toEqual(['CC9.2-v1-r1']);
 expect(record.implementation).toBe('Reviewed dated provider records and escalation results.');
});

test('Save & next retains an unfinished Finding draft',async()=>{
 const next=jest.fn();
 await act(async()=>root.render(<FrameworkDrawer open record={record} clientId="demo_prestige" onOpenChange={close} onNext={next}/>));
 await act(async()=>container.querySelector('.psoc-linked summary').click());
 await act(async()=>button('Raise Finding').click());
 await act(async()=>button('Save & next').click());
 expect(next).not.toHaveBeenCalled();
 expect(container.querySelector('[aria-label="Finding title"]')).toBeTruthy();
});

test('new SOC tenants retain historical management-Control observations',async()=>{
 record.assessment_history=[{status:'addressed',at:'2027-12-31',by:'former-owner',management_controls:[{control_id:'old-access',name:'Historical access review',description:'Prior control design',design:'adequate',operating:'gap',period_start:'2027-01-01',period_end:'2027-12-31',collected_instances:3,expected_instances:4,testing_notes:'One quarterly sample was missing'}]}];
 await render('new-soc-client');
 await act(async()=>[...container.querySelectorAll('summary')].find(s=>s.textContent==='View History').click());
 for(const text of ['Historical access review','Prior control design','adequate / gap','2027-01-01','2027-12-31','3 / 4 instances','One quarterly sample was missing'])expect(container.textContent).toContain(text);
});

test('status, verification, owner and current implementation persist with the concurrency token',async()=>{
 await render();await act(async()=>container.querySelector('input[value="addressed"]').click());await setValue('Verification result','verified');await setValue('Owner','david');await setValue('Current implementation','Prestige reviews critical vendors and tracks exceptions through the existing Findings workflow.');await act(async()=>button('Save assessment').click());
 expect(api.patch).toHaveBeenCalledWith('/framework_assessments/soc-a',expect.objectContaining({status:'addressed',verification:'verified',owner_id:'david',implementation:'Prestige reviews critical vendors and tracks exceptions through the existing Findings workflow.',technology:'Retained legacy field',notes:'Retained note',expected_last_assessed:'2026-09-22T12:00:00Z'}));
 expect(container.textContent).toContain('Assessment saved.');expect(container.querySelector('[aria-label="Saved verification"]').textContent).toBe('Verified');
});

test('helper precedes the implementation field, N/A rationale is preserved and breadcrumbs remain guarded',async()=>{
 await render();expect(container.querySelector('#psoc-current-help').compareDocumentPosition(container.querySelector('[aria-label="Current implementation"]'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect([...container.querySelectorAll('input[name="psoc-status"]')].map(i=>i.parentElement.textContent)).toEqual(['Implemented','Partially Implemented','Not Implemented','Not Assessed','Not Applicable']);
 await act(async()=>container.querySelector('input[value="not_applicable"]').click());expect(container.querySelector('[aria-label="N/A Rationale"]')).toBeTruthy();
 await setValue('Current implementation','Unsaved');await act(async()=>button('CC9').click());expect(document.body.textContent).toContain('Leave unsaved changes?');
});

test.each(['new-soc-client','existing-client-enabling-soc'])('%s receives the same framework-specific practical guidance',async clientId=>{
 await render(clientId);expect(container.querySelector('[data-testid="prestige-soc-assessment"]')).toBeTruthy();
 expect(container.querySelectorAll('.psoc-tier')).toHaveLength(3);
 expect(container.querySelector('#psoc-guidance-review').closest('section').textContent).toContain(socGuidance.criteria['CC9.2'].practical.review[0]);
 expect(container.querySelector('.psoc-previous-checks')).toBeNull();
});

test('the standard workspace receives SOC guidance through framework configuration',async()=>{
 mockUser={...mockUser,workspace_mode:'standard'};
 await render();
 expect(container.querySelector('[data-testid="prestige-soc-assessment"]')).toBeTruthy();
 expect(container.querySelectorAll('.psoc-tier')).toHaveLength(3);
});

test.each(['PI1.1','P1.1'])('%s retains its existing reference and assessment without CC/A/C guidance',async id=>{
 record={...record,definition_id:id};
 await render('other-category-client');
 expect(container.querySelector('h2').textContent).toContain(id);
 expect(container.querySelector('[data-testid="soc-requirement-summary"]').textContent).not.toBe('');
 expect(container.querySelector('.psoc-guidance')).toBeNull();
 expect(container.textContent).toContain('Assessment guidance has not been reviewed for this criterion.');
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe(record.implementation);
 await act(async()=>button('Save assessment').click());
 expect(api.patch).toHaveBeenCalledWith('/framework_assessments/soc-a',expect.objectContaining({status:'in_progress',verification:'needs_validation',implementation:record.implementation}));
});

test('Prestige criterion exposes linked governance work and creates one sourced Finding and Action',async()=>{
 related.reviews=[{review_id:'r1',title:'Vendor review',status:'upcoming'}];
 related.findings=[{finding_id:'f1',title:'Existing deficiency',status:'in_remediation'}];
 related.tasks=[{task_id:'t1',title:'Existing correction',status:'open'}];
 related.evidence=[{evidence_id:'e1',filename:'vendor-report.pdf'}];
 await render();await act(async()=>container.querySelector('.psoc-linked summary').click());
 expect(container.textContent).toContain('Vendor review');expect(container.textContent).toContain('Existing deficiency');
 expect(container.textContent).toContain('Existing correction');expect(container.textContent).toContain('vendor-report.pdf');
 await act(async()=>button('Raise Finding').click());
 await act(async()=>button('Create Finding & Action').click());
 expect(api.post).toHaveBeenCalledWith('/framework_assessments/soc-a/findings',expect.objectContaining({title:expect.stringContaining('CC9.2'),remediation_title:expect.stringContaining('CC9.2'),request_id:expect.any(String)}));
 expect(container.textContent).toContain('Finding and remediation Action created.');
});
