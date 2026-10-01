import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';

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
 await render();expect(container.querySelector('[data-testid="prestige-soc-assessment"]')).toBeTruthy();expect(headings()).toEqual(['What SOC 2 Requires','SOC 2 Assessment Criteria','Implementation Status','Current Implementation']);
 expect(container.querySelector('h2').textContent).toBe('SOC 2 CC9.2 — Third-party risk oversight');expect(container.textContent).toContain('Security · Common Criteria');
 expect(container.textContent).toContain('Omnisciente explanation — not official AICPA text');expect(container.querySelector('[data-testid="soc-official-text"]')).toBeNull();
 const ref=[...container.querySelectorAll('a')].find(a=>a.textContent==='AICPA Reference ↗');expect(ref.href).toMatch(/^https:\/\/www\.aicpa-cima\.com\//);
 expect(container.querySelectorAll('.psoc-criteria li')).toHaveLength(2);expect(container.textContent).toContain('Source wording and points of focus are not reproduced');
 for(const gone of ['Client organizational Controls','Scope and observation period settings','Required actions','Create Finding','Link Evidence'])expect(container.textContent).not.toContain(gone);
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

test('the SOC-specific experience is gated to Prestige Demo only',async()=>{
 await render('demo_dunder');expect(container.querySelector('[data-testid="prestige-soc-assessment"]')).toBeNull();expect(container.querySelector('[data-testid="framework-assessment-workspace"]')).toBeTruthy();
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
