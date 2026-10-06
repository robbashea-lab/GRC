import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import IsoAuditWorkspace from './IsoAuditWorkspace';
import {initialAuditState,auditPackage} from '@/lib/isoAudit';
import api from '@/lib/api';
let mockUser;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn()},formatError:e=>e.message}));
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('react-router-dom',()=>({useSearchParams:()=>require('react').useState(new URLSearchParams('package=governance-risk')),Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
let root,container,review;
const button=name=>[...document.querySelectorAll('button')].find(b=>b.textContent===name);
async function fill(label,value){await act(async()=>{const el=document.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;global.crypto=require('crypto').webcrypto;
  mockUser={user_id:'u',role:'super_admin'};
  review={review_id:'r',client_id:'c',title:'Audit',owner_id:'u',due_date:'2030-12-31',updated_at:'v1',current_occurrence_id:'o1',recurrence:'annual',iso_audit:initialAuditState('governance-risk'),occurrences:[]};
  api.get.mockImplementation(async path=>({data:path==='/iso-audit'?{program:{status:'active',activated_at:'2030-10-01',configuration:{start_date:'2030-10-01'}},reviews:[review]}:path==='/related'?{findings:[],tasks:[]}:path==='/evidence/catalog'?{items:[],total:0,page:1,page_size:25}:[]}));
  api.patch.mockImplementation(async(path,body)=>{review={...review,updated_at:'v2',iso_audit:{...review.iso_audit,items:{...review.iso_audit.items,[path.split('/').at(-1)]:body}}};return {data:review};});
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  await act(async()=>root.render(<IsoAuditWorkspace clientId="c"/>));
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.startsWith('4.1 ·')).click());
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('wide audit shell separates result and progress and preserves a failed-save draft',async()=>{
  const dialog=document.querySelector('[data-assessment-shell]');
  expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
  await fill('Audit progress','reviewed');await fill('Auditor notes','Synthetic workpaper draft');
  api.patch.mockRejectedValueOnce(new Error('Audit package changed; reload before saving'));
  await act(async()=>button('Save & next').click());
  expect(document.querySelector('[role="alert"]').textContent).toContain('changed');
  expect(document.querySelector('[aria-label="Auditor notes"]').value).toBe('Synthetic workpaper draft');
  expect(document.querySelector('[role="dialog"] h2').textContent).toContain('4.1');
  await act(async()=>button('Save & next').click());
  expect(api.patch).toHaveBeenLastCalledWith('/reviews/r/iso-audit/'+auditPackage('governance-risk').items[0].key,expect.objectContaining({status:'reviewed',result:'',expected_updated_at:'v1',occurrence_id:'o1'}));
  expect(document.querySelector('[role="dialog"] h2').textContent).toContain('4.2');
});
test('unfinished Finding and narrative drafts cannot silently navigate or close',async()=>{
  await fill('Auditor notes','Keep my audit draft');
  await act(async()=>button('Findings').click());await act(async()=>button('Raise Finding').click());
  expect(button('Save & next').disabled).toBe(true);
  await act(async()=>button('Close assessment').click());
  expect(document.body.textContent).toContain('Leave unsaved changes?');
  await act(async()=>button('Keep editing').click());
  expect(document.querySelector('[aria-label="Auditor notes"]').value).toBe('Keep my audit draft');
  expect(api.patch).not.toHaveBeenCalled();
});

test('audit criteria tab saves selections without changing progress or result',async()=>{
  await act(async()=>button('Assessment criteria').click());
  expect(document.querySelectorAll('.assessment-summary')).toHaveLength(1);
  expect(document.body.textContent).toContain('Review guidance');expect(document.body.textContent).toContain('Expected outcome');
  await act(async()=>document.querySelector('.assessment-check input').click());
  expect(api.patch).not.toHaveBeenCalled();
  expect(document.querySelector('[aria-label="Audit progress"]').value).toBe('not_started');
  expect(document.querySelector('[aria-label="Audit result"]').value).toBe('');
  await act(async()=>button('Save assessment').click());
  expect(api.patch).toHaveBeenLastCalledWith('/reviews/r/iso-audit/4-1',expect.objectContaining({assessment_checks:['4.1:context'],status:'not_started',result:'',occurrence_id:'o1',expected_updated_at:'v1'}));
});

test('audit checklist retains saved unknown selections while editing known checks',async()=>{
  await act(async()=>button('Close assessment').click());
  review.iso_audit.items['4-1']={status:'not_started',result:'',notes:'',na_rationale:'',evidence_ids:[],finding_ids:[],assessment_checks:['retired:audit-context']};
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.startsWith('4.1 ·')).click());
  await act(async()=>button('Assessment criteria').click());
  expect(document.body.textContent).toContain('Previous checklist responses');
  await act(async()=>document.querySelector('.assessment-check input').click());
  await act(async()=>button('Save assessment').click());
  expect(api.patch).toHaveBeenLastCalledWith('/reviews/r/iso-audit/4-1',expect.objectContaining({assessment_checks:['retired:audit-context','4.1:context']}));
});

test('read-only audit retains criteria and disables workpaper mutation',async()=>{
  mockUser.role='client_readonly';await act(async()=>root.render(<IsoAuditWorkspace clientId="c"/>));
  expect(button('Save assessment')).toBeUndefined();expect(button('Raise Finding')).toBeUndefined();
  expect(document.querySelector('[aria-label="Auditor notes"]').closest('fieldset').disabled).toBe(true);
  await act(async()=>button('Assessment criteria').click());
  expect(document.querySelector('.assessment-check input').closest('fieldset').disabled).toBe(true);
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('historical audit selections remain frozen and do not rewrite current cycle',async()=>{
  await act(async()=>button('Close assessment').click());
  review.occurrences=[{...review,occurrence_id:'history-o',completed_at:'2029-12-30',iso_audit:{...initialAuditState('governance-risk'),items:{'4-1':{status:'reviewed',result:'conforming',notes:'Historical evidence',na_rationale:'',evidence_ids:[],finding_ids:[],assessment_checks:['4.1:context']}}}}];
  await act(async()=>root.render(<IsoAuditWorkspace clientId="c"/>));
  await fill('Audit occurrence','history-o');
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.startsWith('4.1 ·')).click());
  await act(async()=>button('Assessment criteria').click());
  expect(document.querySelector('.assessment-check input').checked).toBe(true);
  expect(document.querySelector('.assessment-check input').closest('fieldset').disabled).toBe(true);
  expect(button('Save assessment')).toBeUndefined();expect(document.body.textContent).toContain('Historical workpaper');
  expect(api.patch).not.toHaveBeenCalled();
});

test('sequential navigation provides a stable return target on the current audit item',async()=>{
  await act(async()=>button('Next').click());
  const key=auditPackage('governance-risk').items[1].key;
  expect(document.querySelector('[role="dialog"] h2').textContent).toContain('4.2');
  await act(async()=>button('Close assessment').click());
  await act(async()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  expect(document.activeElement.getAttribute('data-audit-item')).toBe(key);
});

test('package cards distinguish completed history from the upcoming cycle',async()=>{
  review.status='upcoming';review.occurrences=[{occurrence_id:'old-cycle',iso_audit:initialAuditState('governance-risk'),completed_at:'2029-12-30',finding_count:1}];
  await act(async()=>button('Close assessment').click());
  await act(async()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  await act(async()=>button('All audit packages').click());
  expect(container.textContent).toContain('Last completed 2029-12-30 · Findings raised');
  expect(container.textContent).toContain('0 / 28 complete');
  const card=container.querySelector('.framework-category-row');card.focus();
  await act(async()=>card.click());
  expect(document.activeElement.tagName).toBe('H3');
  expect(document.activeElement.textContent).toBe(auditPackage('governance-risk').title);
});

test('switching clients clears the old audit while the next authorized programme loads',async()=>{
  api.get.mockImplementation(()=>new Promise(()=>{}));
  await act(async()=>root.render(<IsoAuditWorkspace clientId="another-iso-client"/>));
  expect(document.querySelector('[data-assessment-shell]')).toBeNull();
  expect(container.textContent).toContain('Loading audit program');
  expect(container.textContent).not.toContain('governance-risk');
  expect(api.patch).not.toHaveBeenCalled();
});

const selectTab=async name=>act(async()=>button(name).click());
test('audit three-tab round trip retains workpaper, checklist, full Finding draft and evidence fields without saving',async()=>{
 expect([...document.querySelectorAll('[role=tab]')].map(t=>t.textContent)).toEqual(['Requirement & implementation','Assessment criteria','Findings']);
 expect(button('Requirement & implementation').getAttribute('aria-selected')).toBe('true');
 await fill('Auditor notes','Unsaved audit notes');await fill('Audit progress','in_progress');
 await selectTab('Assessment criteria');await act(async()=>document.querySelector('.assessment-check input').click());
 await selectTab('Findings');await act(async()=>button('Raise Finding').click());
 await fill('Finding title','Unsaved audit gap');await fill('Finding description','Audit observation');await fill('Corrective action','Investigate audit gap');await fill('Finding target date','2030-12-30');
 await selectTab('Requirement & implementation');
 expect(document.querySelector('[aria-label="Auditor notes"]').value).toBe('Unsaved audit notes');
 expect(document.querySelector('[aria-label="Audit progress"]').value).toBe('in_progress');
 expect(document.querySelector('[aria-label="Audit result"]').value).toBe('');
 expect(document.body.textContent).toContain('Evidence & validation');expect(document.body.textContent).toContain('Scope & objectivity');
 await selectTab('Assessment criteria');expect(document.querySelector('.assessment-check input').checked).toBe(true);
 await selectTab('Findings');expect(document.querySelector('[aria-label="Finding title"]').value).toBe('Unsaved audit gap');
 expect(document.querySelector('[aria-label="Finding description"]').value).toBe('Audit observation');
 expect(document.querySelector('[aria-label="Finding target date"]').value).toBe('2030-12-30');
 expect(button('Save & next').disabled).toBe(true);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});
