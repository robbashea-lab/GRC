import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import IsoAuditWorkspace from './IsoAuditWorkspace';
import {initialAuditState,auditPackage} from '@/lib/isoAudit';
import api from '@/lib/api';
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'u',role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn()},formatError:e=>e.message}));
jest.mock('./RecordDrawer',()=>()=>null);
jest.mock('react-router-dom',()=>({useSearchParams:()=>require('react').useState(new URLSearchParams('package=governance-risk')),Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
let root,container,review;
const button=name=>[...document.querySelectorAll('button')].find(b=>b.textContent===name);
async function fill(label,value){await act(async()=>{const el=document.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;global.crypto=require('crypto').webcrypto;
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
  await act(async()=>button('Create Finding').click());
  expect(button('Save & next').disabled).toBe(true);
  await act(async()=>button('Close assessment').click());
  expect(document.body.textContent).toContain('Leave unsaved changes?');
  await act(async()=>button('Keep editing').click());
  expect(document.querySelector('[aria-label="Auditor notes"]').value).toBe('Keep my audit draft');
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
