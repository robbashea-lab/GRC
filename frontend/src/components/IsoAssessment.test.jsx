import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import guide from '@catalogs/operatorGuidance/isoRequirementGuide.json';
import criteria from '@catalogs/operatorGuidance/isoAssessmentCriteria.json';

let mockUser,root,container,record,related,next;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:e=>e.message}));
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('./IsoGuidedAssessor',()=>({inline,inlineOpen,disabled})=><section data-testid="iso-inline-interview" data-inline={inline} hidden={!inlineOpen}><textarea aria-label="Retained ISO interview" defaultValue="Existing tailored interview" disabled={disabled}/></section>);
jest.mock('./AssigneeSelect',()=>({label,value,disabled,onChange})=><select aria-label={label} value={value||''} disabled={disabled} onChange={e=>onChange(e.target.value)}><option value="">Unassigned</option><option value="u">Pam</option></select>);
jest.mock('./ui/dialog',()=>{const R=require('react'),Close=R.createContext(null);return {Dialog:({children,onOpenChange})=><Close.Provider value={onOpenChange}><div>{children}</div></Close.Provider>,DialogContent:({children,onOpenAutoFocus,onCloseAutoFocus,onPointerDownOutside,onEscapeKeyDown,...props})=><div {...props}>{children}<Close.Consumer>{close=><button onClick={()=>close(false)}>Close</button>}</Close.Consumer></div>,DialogTitle:R.forwardRef(({children,...props},ref)=><h2 {...props} ref={ref}>{children}</h2>),DialogDescription:({children})=><p>{children}</p>};});
const button=name=>[...container.querySelectorAll('button')].find(b=>b.textContent===name);
const tick=async el=>act(async()=>el.click());
async function guidance(){const disclosure=container.querySelector('.assessment-summary');expect(disclosure).not.toBeNull();if(!disclosure.open)await tick(disclosure.querySelector('summary'));await act(async()=>disclosure.dispatchEvent(new Event('toggle')));expect(disclosure.open).toBe(true);}
async function input(value){const el=container.querySelector('[aria-label="Current implementation"]');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
async function render(){await act(async()=>root.render(<FrameworkDrawer open record={record} clientId={record.client_id} onOpenChange={jest.fn()} onNext={next}/>));}
beforeEach(()=>{
 global.crypto=require('node:crypto').webcrypto;global.IS_REACT_ACT_ENVIRONMENT=true;
 mockUser={user_id:'u',role:'super_admin',workspace_mode:'demo'};next=jest.fn();
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 record={framework_assessment_id:'iso-a',client_id:'demo_dunder',framework_key:'iso-27001',definition_id:'4.1',status:'in_progress',owner_id:'u',implementation:'Current context',assessment_history:[],last_assessed:null};
 related={reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]};
 api.get.mockImplementation(async path=>({data:path.endsWith('/related')?related:path.startsWith('/organizational-controls')?{items:[],migration_pending:0}:path.startsWith('/frameworks/')?{assessments:[record]}:path.endsWith('/members')?[{user_id:'u',name:'Pam'}]:[]}));
 api.patch.mockImplementation(async(path,body)=>({data:{...record,...body,last_assessed:'2026-10-02'}}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.resetAllMocks();});

test('ISO inline interview and Items placement preserve stored ownership and mandatory status',async()=>{
 await render();expect(record.owner_id).toBe('u');expect(container.querySelector('[aria-label="Assessment Owner"]')).toBeNull();
 expect([...container.querySelectorAll('[role="tab"]')].map(t=>t.textContent)).toEqual(['Requirement & implementation','Items to address','Findings']);
 expect(container.querySelectorAll('.assessment-summary')).toHaveLength(1);
 expect(container.querySelector('input[value="in_progress"]').checked).toBe(true);
 expect(container.querySelector('input[value="not_applicable"]')).toBeNull();
 expect(container.querySelector('.bcsg-findings').closest('[role=tabpanel]').id).toMatch(/findings$/);
 expect(container.textContent).not.toContain('Evidence & verification');
 expect(container.textContent).not.toContain('Organizational Controls');
 expect(button('Create organizational Control')).toBeUndefined();
 expect(container.querySelector('.assessment-inline-criteria')).toBeNull();expect(container.querySelector('[data-testid="iso-inline-interview"]').closest('.assessment-summary')).toBeTruthy();
 expect(container.querySelector('[aria-label="Open Omnibot guide"]')).toBeNull();
});

test('legacy mandatory-clause N/A is reported without rewriting its saved value',async()=>{
 record.status='not_applicable';await render();
 expect(container.querySelector('[role="alert"]').textContent).toContain('Legacy conflict');
 expect(container.querySelector('input[value="not_applicable"]')).toBeNull();
 expect(record.status).toBe('not_applicable');expect(api.patch).not.toHaveBeenCalled();
});

test('inline summary and Items tabs preserve draft without writes and reset across requirements and clients',async()=>{
 await render();await input('Retain my draft');await guidance();
 expect(container.querySelector('[data-testid="iso-inline-interview"]').hidden).toBe(false);expect(container.textContent).toContain(guide.entries['4.1'].plain);
 await act(async()=>button('Items to address').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));expect(container.textContent).toContain('No current items to address are recorded.');
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Retain my draft');
 expect(container.textContent).toContain('Unsaved assessment changes');
 expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
 record={...record,framework_assessment_id:'iso-b',definition_id:'A.5.1'};await render();
 expect(button('Requirement & implementation').getAttribute('aria-selected')).toBe('true');
 expect(container.querySelector('.assessment-summary p').textContent).toBe(guide.entries['A.5.1'].plain);
 await guidance();record={...record,framework_assessment_id:'iso-c',client_id:'new-iso'};await render();
 expect(button('Requirement & implementation').getAttribute('aria-selected')).toBe('true');
});

test('failed ISO save keeps narrative and blocks next; retry keeps concurrency token',async()=>{
 await render();await input('New implementation');api.patch.mockRejectedValueOnce(new Error('Stale assessment'));
 await tick(button('Save & next'));expect(next).not.toHaveBeenCalled();expect(container.textContent).toContain('Stale assessment');
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('New implementation');
 await tick(button('Save & next'));expect(next).toHaveBeenCalledTimes(1);
 expect(api.patch).toHaveBeenLastCalledWith('/framework_assessments/iso-a',expect.objectContaining({implementation:'New implementation',expected_last_assessed:null,owner_id:'u'}));
});

test('read-only ISO assessment retains interview and linked findings without write affordances',async()=>{
 mockUser.role='client_readonly';related.findings=[{finding_id:'f',client_id:record.client_id,title:'Context gap',status:'open'}];await render();
 expect(container.textContent).toContain('Context gap');expect(button('Raise Finding')).toBeUndefined();expect(button('Save assessment')).toBeUndefined();
 expect(container.querySelector('[aria-label="Assessment Owner"]')).toBeNull();
 expect(container.querySelector('[aria-label="Current implementation"]').closest('fieldset').disabled).toBe(true);
 await guidance();expect(container.querySelector('[aria-label="Retained ISO interview"]').disabled).toBe(true);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('removing the old checklist surface preserves status and all previously saved selections',async()=>{
 record.iso_assessment_checks=['retired:context',criteria.requirements['4.1'].criteria[0].id];await render();await guidance();
 expect(container.querySelector('.assessment-inline-criteria')).toBeNull();expect(container.querySelector('.assessment-check')).toBeNull();
 expect(api.patch).not.toHaveBeenCalled();expect(container.querySelector('input[value="in_progress"]').checked).toBe(true);
 await tick(button('Save assessment'));
 expect(api.patch).toHaveBeenLastCalledWith('/framework_assessments/iso-a',expect.objectContaining({status:'in_progress',iso_assessment_checks:['retired:context',criteria.requirements['4.1'].criteria[0].id],expected_last_assessed:null}));
});

test('SoA decision, status and retained notes remain independent editable fields',async()=>{
 record={...record,definition_id:'A.5.1',soa_applicability:'included',soa_justification:'Risk treatment',notes:'Prior record'};await render();
 expect(container.querySelector('[aria-label="SoA applicability"]').value).toBe('included');
 expect(container.querySelector('[aria-label="SoA justification"]').value).toBe('Risk treatment');
 expect(container.querySelector('[aria-label="Previously recorded notes"]').value).toBe('Prior record');
 await guidance();expect(container.querySelectorAll('.assessment-check input')).toHaveLength(0);
 await tick(button('Save assessment'));expect(api.patch).toHaveBeenLastCalledWith('/framework_assessments/iso-a',expect.objectContaining({status:'in_progress',soa_applicability:'included',soa_justification:'Risk treatment',notes:'Prior record'}));
});

test('context load failure disables ISO save and offers retry',async()=>{
 const successful=api.get.getMockImplementation();
 api.get.mockImplementation((path,...args)=>path.endsWith('/related')?Promise.reject(new Error('Context unavailable')):successful(path,...args));await render();
 expect(container.querySelector('[role="alert"]').textContent).toContain('Context unavailable');
 expect(button('Save assessment').disabled).toBe(true);expect(button('Retry')).toBeTruthy();
});
