import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkDrawer from './FrameworkDrawer';
import api from '@/lib/api';
import guide from '@catalogs/operatorGuidance/isoRequirementGuide.json';

let mockUser,root,container,record,related,next;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:e=>e.message}));
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('./AssigneeSelect',()=>({label,value,disabled,onChange})=><select aria-label={label} value={value||''} disabled={disabled} onChange={e=>onChange(e.target.value)}><option value="">Unassigned</option><option value="u">Pam</option></select>);
jest.mock('./ui/dialog',()=>{const R=require('react');return {Dialog:({children})=><div>{children}</div>,DialogContent:({children,onOpenAutoFocus,onCloseAutoFocus,onPointerDownOutside,...props})=><div {...props}>{children}</div>,DialogTitle:R.forwardRef(({children,...props},ref)=><h2 {...props} ref={ref}>{children}</h2>),DialogDescription:({children})=><p>{children}</p>};});
const button=name=>[...container.querySelectorAll('button')].find(b=>b.textContent===name);
const tick=async el=>act(async()=>el.click());
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

test('ISO ownership, mandatory clause status and findings precede evidence',async()=>{
 await render();expect(container.querySelector('[aria-label="Assessment Owner"]').value).toBe('u');
 expect(container.querySelector('.iso-assessment-metadata')).toBeTruthy();
 expect(container.querySelector('input[value="in_progress"]').checked).toBe(true);
 expect(container.querySelector('input[value="not_applicable"]')).toBeNull();
 const headings=[...container.querySelectorAll('.brawndo-step h3')].map(h=>h.textContent);
 expect(headings.findIndex(t=>t.includes('Findings & corrective actions'))).toBeLessThan(headings.findIndex(t=>t.includes('Evidence & verification')));
 expect(container.textContent).toContain('Organizational Controls');
 expect(button('Create organizational Control')).toBeTruthy();
});

test('legacy mandatory-clause N/A is reported without rewriting its saved value',async()=>{
 record.status='not_applicable';await render();
 expect(container.querySelector('[role="alert"]').textContent).toContain('Legacy conflict');
 expect(container.querySelector('input[value="not_applicable"]')).toBeNull();
 expect(record.status).toBe('not_applicable');expect(api.patch).not.toHaveBeenCalled();
});

test('guide preserves draft without writes and resets across requirements and clients',async()=>{
 await render();await input('Retain my draft');await tick(button('What common gaps should I look for?'));
 expect(container.querySelector('.cis-guide-answer p').textContent).toBe(guide.entries['4.1'].gaps);
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Retain my draft');
 expect(container.textContent).toContain('Unsaved assessment changes');
 expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
 record={...record,framework_assessment_id:'iso-b',definition_id:'A.5.1'};await render();
 expect(container.querySelector('.iso-guide-disclosure').open).toBe(false);
 expect(container.querySelector('.cis-guide-answer p').textContent).toBe(guide.entries['A.5.1'].plain);
 await tick(button('Where should I start?'));record={...record,framework_assessment_id:'iso-c',client_id:'new-iso'};await render();
 expect(container.querySelector('.cis-guide-answer p').textContent).toBe(guide.entries['A.5.1'].plain);
});

test('failed ISO save keeps narrative and blocks next; retry keeps concurrency token',async()=>{
 await render();await input('New implementation');api.patch.mockRejectedValueOnce(new Error('Stale assessment'));
 await tick(button('Save & next'));expect(next).not.toHaveBeenCalled();expect(container.textContent).toContain('Stale assessment');
 expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('New implementation');
 await tick(button('Save & next'));expect(next).toHaveBeenCalledTimes(1);
 expect(api.patch).toHaveBeenLastCalledWith('/framework_assessments/iso-a',expect.objectContaining({implementation:'New implementation',expected_last_assessed:null,owner_id:'u'}));
});

test('read-only ISO assessment retains guide and linked findings without write affordances',async()=>{
 mockUser.role='client_readonly';related.findings=[{finding_id:'f',title:'Context gap',status:'open'}];await render();
 expect(container.textContent).toContain('Context gap');expect(button('Raise Finding')).toBeUndefined();expect(button('Save assessment')).toBeUndefined();
 expect(container.querySelector('[aria-label="Assessment Owner"]').disabled).toBe(true);
 expect(container.querySelector('[aria-label="Current implementation"]').closest('fieldset').disabled).toBe(true);
 await tick(button('Where should I start?'));expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('context load failure disables ISO save and offers retry',async()=>{
 const successful=api.get.getMockImplementation();
 api.get.mockImplementation((path,...args)=>path.endsWith('/related')?Promise.reject(new Error('Context unavailable')):successful(path,...args));await render();
 expect(container.querySelector('[role="alert"]').textContent).toContain('Context unavailable');
 expect(button('Save assessment').disabled).toBe(true);expect(button('Retry')).toBeTruthy();
});
