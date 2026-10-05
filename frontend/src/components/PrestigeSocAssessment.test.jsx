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
const setValue=async(label,value)=>{const el=container.querySelector(`[aria-label="${label}"]`);await act(async()=>{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});};
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;mockUser={user_id:'u',role:'super_admin',workspace_mode:'demo'};close=jest.fn();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 record={framework_assessment_id:'soc-a',framework_key:'soc-2',definition_id:'CC9.2',client_id:'demo_prestige',status:'in_progress',verification:'needs_validation',implementation:'Existing vendor monitoring process.',technology:'Retained legacy field',notes:'Retained note',na_rationale:'',owner_id:null,assessment_history:[],last_assessed:'2026-09-22T12:00:00Z'};
 related={reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]};
 api.get.mockImplementation(async path=>({data:path.endsWith('/related')?related:path==='/frameworks/soc-2'?{assessments:[record],work:{}}:path.includes('/members')?[{user_id:'david',name:'David Wallace'}]:path==='/organizational-controls'?{items:[],has_more:false,migration_pending:0}:[]}));
 api.patch.mockImplementation(async(path,body)=>{const judgment=body.record_assessment||body.status!==record.status&&body.status!=='not_assessed';record={...record,...body,last_saved:'2026-10-01T12:00:00Z',assessment_recorded_at:judgment?'2026-10-01T12:00:00Z':record.assessment_recorded_at??null,last_assessed:'2026-10-01T12:00:00Z',assessed_by:'u',assessment_history:[{...body,at:'2026-10-01T12:00:00Z',by:'u'}]};return {data:record};});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
const render=async(clientId='demo_prestige')=>act(async()=>root.render(<FrameworkDrawer open record={{...record,client_id:clientId}} clientId={clientId} onOpenChange={close} position="33 of 38 in framework order" breadcrumb={[{label:'SOC 2',onClick:jest.fn()},{label:'Security',onClick:jest.fn()},{label:'CC9',onClick:jest.fn()},{label:'CC9.2'}]}/>));
const criteriaTab=async()=>act(async()=>[...container.querySelectorAll('[role=tab]')].find(t=>t.textContent==='Assessment criteria').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));

test('removed control editor retains saved descriptions and mapped record access in linked work',async()=>{
 record.management_controls=[{control_id:'legacy',name:'Saved vendor monitoring',description:'Quarterly provider assurance',frequency:'quarterly',design:'adequate',operating:'effective'}];
 const get=api.get.getMockImplementation();
 api.get.mockImplementation(async(path,options)=>path==='/frameworks/soc-2'?{data:{assessments:[record],work:{},organizational_controls:[{control_id:'shared-saved',assessment_ids:['soc-a']},{control_id:'unrelated',assessment_ids:['other']}]}}:get(path,options));
 await render();
 expect(container.textContent).toContain('Saved vendor monitoring');
 expect(container.textContent).toContain('Quarterly provider assurance');
 expect(container.textContent).toContain('Open retained supporting record · shared-saved');
 expect(container.textContent).not.toContain('Open retained supporting record · unrelated');
 expect(container.textContent).not.toContain('Client organizational Controls');
 expect(api.patch).not.toHaveBeenCalled();
});

test('first narrative save does not claim an assessment when absent metadata becomes null',async()=>{
 record.status='not_assessed';await render();
 await setValue('Current implementation','Draft context only');
 await act(async()=>button('Save assessment').click());
 expect(container.textContent).toContain('Changes saved; assessment date unchanged.');
 expect(record.assessment_recorded_at).toBeNull();
 expect(record.assessment_recorded_at).toBeNull();
});

test('Prestige SOC criterion workspace is focused, source-qualified and ordered',async()=>{
 await render();
 expect(container.querySelector('[data-testid="prestige-soc-assessment"]')).toBeTruthy();
 expect([...container.querySelectorAll('[role=tab]')].map(t=>t.textContent)).toEqual(['Requirement & implementation','Assessment criteria']);
 expect(container.querySelector('[role=tabpanel][data-state=active]').textContent).toContain('What SOC 2 requires');
 expect(container.querySelector('h2').textContent).toBe('SOC 2 CC9.2 — Third-party risk oversight');
 expect(container.querySelector('.assessment-summary').open).toBe(false);
 expect(container.querySelector('.assessment-summary').querySelectorAll('summary')).toHaveLength(1);
 expect(container.querySelector('[data-source-kind="authored"]').textContent).toBe(socGuidance.criteria['CC9.2'].practical.summary);
 expect(container.textContent).toContain('Requirement summary · Omnisciente');
 expect(container.querySelector('[data-source-kind="official"]')).toBeNull();
 expect([...container.querySelectorAll('a')].find(a=>a.textContent==='Official AICPA source').href).toBe(socGuidance.source.document_url);
 expect(container.querySelector('[aria-label="Verification result"]')).toBeNull();
 expect(container.querySelector('.bcsg-metadata')).toBeNull();
 for(const removed of ['Examples of supporting evidence','What good looks like','Where should I start?','What should I ask IT or our provider?'])expect(container.textContent).not.toContain(removed);
 expect(container.querySelector('.assessment-implementation').children).toHaveLength(2);
 expect(container.querySelector('.bcsg-findings').parentElement.textContent).toContain('Current implementation');

});

test('checklist selections save and reopen while preserving legacy responses and hidden conclusions',async()=>{
 record.owner_id='david';record.soc_assessment_checks=['CC9.2-v1-r1','CC9.2-v1-o1'];
 await render();await criteriaTab();
 const previous=container.querySelector('.assessment-criteria-columns details');
 expect(previous.open).toBe(false);
 expect([...previous.querySelectorAll('li')].map(el=>el.textContent)).toEqual(record.soc_assessment_checks.map(id=>`${id} · ${socGuidance.criteria['CC9.2'].items.find(item=>item.id===id).text}`));
 await act(async()=>container.querySelector('.assessment-check input').click());
 const check=socGuidance.criteria['CC9.2'].assessment_criteria[0].id;
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe(record.implementation);
 expect(container.querySelector('input[value="in_progress"]').checked).toBe(true);
 expect(api.patch).not.toHaveBeenCalled();
 await act(async()=>button('Save assessment').click());
 expect(api.patch).toHaveBeenCalledWith('/framework_assessments/soc-a',expect.objectContaining({soc_assessment_checks:['CC9.2-v1-r1','CC9.2-v1-o1',check],owner_id:'david',status:'in_progress',verification:'needs_validation',implementation:'Existing vendor monitoring process.'}));
 expect(record.assessment_history[0].soc_assessment_checks).toEqual(record.soc_assessment_checks);
 await act(async()=>root.unmount());root=createRoot(container);await render();await criteriaTab();
 expect(container.querySelector('.assessment-check input').checked).toBe(true);
 expect(record.owner_id).toBe('david');expect(record.verification).toBe('needs_validation');

});

test('removed enhanced guidance does not hide historical checklist responses',async()=>{
 const [id,entry]=Object.entries(socGuidance.criteria).find(([,entry])=>!entry.practical.enhanced.length&&entry.items.some(i=>i.id.includes('-v1-')));
 record={...record,definition_id:id,soc_assessment_checks:[entry.items[0].id]};await render();await criteriaTab();
 expect(container.textContent).not.toContain('Enhanced Assurance');
 expect(container.querySelector('.assessment-criteria-columns details').textContent).toContain(entry.items[0].id);

});

test('unrecognized historical IDs remain visible instead of being dropped or relabeled',async()=>{
 record.soc_assessment_checks=['CC9.2-retired-response'];await render();await criteriaTab();
 expect(container.querySelector('.assessment-criteria-columns details li').textContent).toBe('CC9.2-retired-response');
 expect(record.soc_assessment_checks).toEqual(['CC9.2-retired-response']);expect(api.patch).not.toHaveBeenCalled();

});
test('shared context distinguishes selected controls, evidence alternatives and Type 2 operation',async()=>{
 await render();await criteriaTab();
 const columns=container.querySelector('.assessment-criteria-columns');
 expect([...columns.children].map(section=>section.querySelector('h3').textContent)).toEqual(['CC9.2 checklist','Review guidance','Expected outcome']);
 expect([...columns.children[1].querySelectorAll('li')].map(el=>el.textContent)).toEqual(socGuidance.criteria['CC9.2'].practical.review);
 expect([...columns.children[2].querySelectorAll('li')].map(el=>el.textContent)).toEqual(socGuidance.criteria['CC9.2'].practical.outcome);
 expect(api.patch).not.toHaveBeenCalled();

});

test('all in-scope criteria have stable, classified guidance and no forced empty panels',()=>{
 expect(socGuidance.tiers.map(t=>t.key)).toEqual(['criterion_requirements','operational_practices','enhanced_assurance']);
 expect(Object.keys(socGuidance.criteria)).toHaveLength(61);
 expect(Object.keys(socGuidance.criteria).sort()).toEqual(socCatalog.requirements.map(d=>d.id).sort());
 const ids=[];
 for(const [criterion,entry] of Object.entries(socGuidance.criteria)){
   expect(entry.source_reference).toBe(criterion);expect(entry.source_page).toBeGreaterThan(0);expect(entry.review_note).toBeTruthy();
   if(entry.items.length)expect(entry.items.some(i=>i.tier==='criterion_requirements')).toBe(true);
   for(const item of entry.items){
     ids.push(item.id);expect(item.id.startsWith(criterion+'-v1-')||item.id.startsWith(criterion+'-assessment-v1-')).toBe(true);expect(item.text).toBeTruthy();expect(item.source_reference).toBeTruthy();
     expect(item.tier==='criterion_requirements'?['criterion','point_of_focus']:item.tier==='operational_practices'?['operational_guidance']:['enhanced_assurance']).toContain(item.source_type);
   }
 }
 expect(new Set(ids).size).toBe(ids.length);
 expect(Object.values(socGuidance.criteria).every(c=>c.assessment_criteria.length)).toBe(true);
});

test('read-only reviewers can read practical guidance and cannot edit the assessment',async()=>{
 mockUser={...mockUser,role:'client_viewer'};await render();await criteriaTab();
 expect(container.querySelector('.assessment-criteria-columns').children).toHaveLength(3);
 expect(container.querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
 expect([...container.querySelectorAll('.assessment-check input')].every(input=>input.matches(':disabled'))).toBe(true);
 expect(button('Save assessment')).toBeUndefined();

});

test.each(Object.keys(socGuidance.criteria))('%s renders its requirement-only checklist, review guidance and expected outcome',async id=>{
 record={...record,definition_id:id};await render();await criteriaTab();
 const entry=socGuidance.criteria[id],columns=container.querySelector('.assessment-criteria-columns');
 expect([...columns.children[0].querySelectorAll('.assessment-check span')].map(el=>el.textContent)).toEqual(entry.assessment_criteria.map(item=>item.text));
 expect([...columns.children[1].querySelectorAll('li')].map(el=>el.textContent)).toEqual(entry.practical.review);
 expect([...columns.children[2].querySelectorAll('li')].map(el=>el.textContent)).toEqual(entry.practical.outcome);
 expect(container.querySelector('[data-source-kind="authored"]').textContent).toBe(entry.practical.summary);

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
 record.owner_id='david';await render();await act(async()=>container.querySelector('input[value="addressed"]').click());await setValue('Current implementation','Prestige reviews critical vendors and tracks exceptions through the existing Findings workflow.');await act(async()=>button('Save assessment').click());
 expect(api.patch).toHaveBeenCalledWith('/framework_assessments/soc-a',expect.objectContaining({status:'addressed',verification:'needs_validation',owner_id:'david',implementation:'Prestige reviews critical vendors and tracks exceptions through the existing Findings workflow.',technology:'Retained legacy field',notes:'Retained note',expected_last_assessed:'2026-09-22T12:00:00Z'}));
 expect(container.textContent).toContain('Assessment recorded.');expect(container.querySelector('[aria-label="Saved verification"]').textContent).toBe('Needs validation');

});

test('implementation values and N/A rationale remain available with guarded breadcrumbs',async()=>{
 await render();expect(container.querySelector('[aria-label="Current implementation"]')).toBeTruthy();
 expect([...container.querySelectorAll('input[name="psoc-status"]')].map(i=>i.parentElement.textContent)).toEqual(['Implemented','Partially Implemented','Not Implemented','Not Assessed','Not Applicable']);
 await act(async()=>container.querySelector('input[value="not_applicable"]').click());expect(container.querySelector('[aria-label="N/A Rationale"]')).toBeTruthy();
 await setValue('Current implementation','Unsaved');await act(async()=>button('CC9').click());expect(document.body.textContent).toContain('Leave unsaved changes?');

});

test.each(['new-soc-client','existing-client-enabling-soc'])('%s receives the same framework-specific practical guidance',async clientId=>{
 await render(clientId);await criteriaTab();expect(container.querySelector('[data-testid="prestige-soc-assessment"]')).toBeTruthy();
 expect(container.querySelector('.assessment-criteria-columns').children).toHaveLength(3);
 expect(container.querySelector('.assessment-criteria-columns').children[1].textContent).toContain(socGuidance.criteria['CC9.2'].practical.review[0]);

});

test('the standard workspace receives SOC guidance through framework configuration',async()=>{
 mockUser={...mockUser,workspace_mode:'standard'};await render();await criteriaTab();
 expect(container.querySelector('[data-testid="prestige-soc-assessment"]')).toBeTruthy();expect(container.querySelector('.assessment-criteria-columns').children).toHaveLength(3);

});

test.each(['PI1.1','P1.1'])('%s retains its existing reference and assessment with source-checked category-specific guidance',async id=>{
 record={...record,definition_id:id};await render('other-category-client');await criteriaTab();
 expect(container.querySelector('h2').textContent).toContain(id);
 expect(container.querySelector('[data-source-kind="authored"]').textContent).toBe(socGuidance.criteria[id].practical.summary);
 expect(container.querySelector('.assessment-check')).toBeTruthy();
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe(record.implementation);
 await act(async()=>button('Save assessment').click());expect(api.patch).toHaveBeenCalledWith('/framework_assessments/soc-a',expect.objectContaining({status:'in_progress',verification:'needs_validation',implementation:record.implementation}));

});

test('Prestige criterion exposes linked governance work and creates one sourced Finding and Action',async()=>{
 related.reviews=[{review_id:'r1',title:'Vendor review',status:'upcoming'}];
 related.findings=[{finding_id:'f1',framework_assessment_id:record.framework_assessment_id,client_id:record.client_id,title:'Existing deficiency',description:'Existing deficiency',status:'in_remediation'}];
 related.tasks=[{task_id:'t1',finding_id:'f1',client_id:record.client_id,title:'Existing correction',status:'open'}];
 related.evidence=[{evidence_id:'e1',filename:'vendor-report.pdf'}];
 await render();await act(async()=>container.querySelector('.psoc-linked summary').click());
 expect(container.textContent).toContain('Vendor review');expect(container.textContent).toContain('Existing deficiency');
 expect(container.textContent).toContain('Existing correction');expect(container.textContent).toContain('vendor-report.pdf');
 await act(async()=>button('Raise Finding').click());
 expect(button('Create Finding & Action').disabled).toBe(true);
 expect(container.querySelector('[data-testid="finding-origin"]').textContent).toContain('CC9.2');
 await setValue('Finding title','CC9.2 vendor gap');await setValue('Corrective action','Correct CC9.2 gap');
 await act(async()=>button('Create Finding & Action').click());
 expect(api.post).toHaveBeenCalledWith('/framework_assessments/soc-a/findings',expect.objectContaining({title:expect.stringContaining('CC9.2'),remediation_title:expect.stringContaining('CC9.2'),request_id:expect.any(String)}));
 expect(container.textContent).toContain('Ticket saved. Assessment changes remain separate.');
});
test('static guide is collapsed, read-only, and above the criterion; desktop regions preserve native fields',async()=>{
 await render();const disclosure=container.querySelector('.assessment-summary');expect(disclosure.open).toBe(false);
 expect(disclosure.compareDocumentPosition(container.querySelector('.assessment-requirement'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 await act(async()=>disclosure.querySelector('summary').click());expect(disclosure.open).toBe(true);
 expect(disclosure.querySelector('button,select,input')).toBeNull();expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
 expect(container.textContent).not.toContain('Unsaved assessment changes');
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe(record.implementation);
 expect(container.querySelector('input[value="in_progress"]').checked).toBe(true);
 await act(async()=>button('Close assessment').click());expect(close).toHaveBeenCalledWith(false);expect(document.body.textContent).not.toContain('Leave unsaved changes?');

});
test('guide expansion and selected answer reset when navigating between criteria',async()=>{
 await render();await act(async()=>container.querySelector('.assessment-summary summary').click());await criteriaTab();
 record={...record,framework_assessment_id:'soc-b',definition_id:'A1.3'};await render();
 expect(container.querySelector('.assessment-summary').open).toBe(false);
 expect(container.querySelector('[role=tab][data-state=active]').textContent).toBe('Requirement & implementation');
 expect(container.querySelector('.assessment-summary p').textContent).toContain('Recovery procedures must be tested');
 expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();

});
test('Finding retry preserves request identity and linked record origin',async()=>{
 await render();await act(async()=>button('Raise Finding').click());await setValue('Finding title','Vendor gap');await setValue('Corrective action','Correct vendor gap');
 api.post.mockRejectedValueOnce(new Error('Temporary Finding failure'));
 await act(async()=>button('Create Finding & Action').click());
 expect(container.textContent).toContain('Temporary Finding failure');
 expect(container.querySelector('[aria-label="Finding title"]')).toBeTruthy();
 await act(async()=>button('Create Finding & Action').click());
 expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
 expect(api.post.mock.calls[0][0]).toBe('/framework_assessments/soc-a/findings');
 expect(api.patch).not.toHaveBeenCalled();
});
