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
  await act(async()=>button('Expand all audit areas').click());
  await act(async()=>container.querySelector('[data-audit-item="4-1"]').click());
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
  await act(async()=>container.querySelector('[data-audit-item="4-1"]').click());
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
  await act(async()=>button('Expand all audit areas').click());
  await act(async()=>container.querySelector('[data-audit-item="4-1"]').click());
  await act(async()=>button('Assessment criteria').click());
  expect(document.querySelector('.assessment-check input').checked).toBe(true);
  expect(document.querySelector('.assessment-check input').closest('fieldset').disabled).toBe(true);
  expect(button('Save assessment')).toBeUndefined();expect(document.body.textContent).toContain('Historical workpaper');
  expect(api.patch).not.toHaveBeenCalled();
});

test('sequential navigation provides a stable return target on the current audit item',async()=>{
  // jsdom has no layout; model rendered boxes while retaining real modal/hidden attributes.
  const layout=jest.spyOn(HTMLElement.prototype,'getClientRects').mockImplementation(function(){return this.closest('[hidden]')?[]:[{}];});
  try{
    await act(async()=>button('Next').click());
    const key=auditPackage('governance-risk').items[1].key;
    expect(document.querySelector('[role="dialog"] h2').textContent).toContain('4.2');
    await act(async()=>button('Close assessment').click());
    await act(async()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    // Closing reloads the programme, so identify the current row after that reload.
    const currentRow=document.querySelector('[data-audit-item="'+key+'"]');
    expect(currentRow).not.toBeNull();expect(currentRow.isConnected).toBe(true);
    expect(currentRow.closest('[hidden],[aria-hidden="true"],[inert]')).toBeNull();
    expect(currentRow.matches(':disabled')).toBe(false);expect(currentRow.getClientRects().length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(currentRow);
    expect(document.activeElement.getAttribute('data-audit-item')).toBe(key);
  }finally{layout.mockRestore();}
});

test('package cards distinguish completed history from the upcoming cycle',async()=>{
  review.status='upcoming';review.occurrences=[{occurrence_id:'old-cycle',iso_audit:initialAuditState('governance-risk'),completed_at:'2029-12-30',finding_count:1}];
  await act(async()=>button('Close assessment').click());
  await act(async()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  await act(async()=>button('All audit packages').click());
  expect(container.textContent).toContain('Last completed 2029-12-30 · Findings raised');
  expect(container.querySelector('.iso-audit-packages .g-impl b').textContent).toBe('0 of '+auditPackage('governance-risk').items.length);
  const card=container.querySelector('.iso-audit-packages .grow');card.focus();
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

test('native audit area buttons preserve keyboard focus and catalogue workpaper order without writes',async()=>{
  await act(async()=>button('Close assessment').click());
  await act(async()=>button('Collapse all audit areas').click());
  const pack=auditPackage('governance-risk'),labels=[...new Set(pack.items.map(item=>item.area))],before=JSON.stringify(review);
  expect([...container.querySelectorAll('.iso-audit-areas [data-control]')].map(element=>element.dataset.control)).toEqual(labels);
  expect(container.querySelectorAll('[data-audit-item]')).toHaveLength(0);
  const area=container.querySelector('.iso-audit-areas [data-control]');expect(area.tagName).toBe('BUTTON');expect(area.tabIndex).toBe(0);area.focus();expect(document.activeElement).toBe(area);
  // JSDOM does not synthesize a native button click from Enter; retain native button semantics.
  await act(async()=>area.click());
  expect(area.getAttribute('aria-expanded')).toBe('true');
  expect(document.getElementById(area.getAttribute('aria-controls'))).not.toBeNull();
  expect([...container.querySelectorAll('[data-audit-item]')].map(element=>element.dataset.auditItem)).toEqual(pack.items.filter(item=>item.area===labels[0]).map(item=>item.key));
  await act(async()=>button('Expand all audit areas').click());
  expect([...container.querySelectorAll('[data-audit-item]')].map(element=>element.dataset.auditItem)).toEqual(pack.items.map(item=>item.key));
  expect(JSON.stringify(review)).toBe(before);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('audit search reveals exact workpapers with truthful full-area counts and clear restores expansion',async()=>{
  await act(async()=>button('Close assessment').click());
  await fill('Search audit items','4.2');
  expect([...container.querySelectorAll('[data-audit-item]')].map(element=>element.dataset.auditItem)).toEqual(['4-2']);
  const area=container.querySelector('.iso-audit-areas [data-control]');
  expect(area.disabled).toBe(true);expect(area.getAttribute('aria-expanded')).toBe('true');
  expect(area.textContent).toContain('0 of 4 checks complete');
  await act(async()=>area.click());
  expect(container.querySelectorAll('[data-audit-item]')).toHaveLength(1);
  await act(async()=>button('Clear audit search').click());
  expect(container.querySelector('[aria-label="Search audit items"]').value).toBe('');
  expect(container.querySelector('.iso-audit-areas [data-control]').disabled).toBe(false);
  expect(container.querySelectorAll('[data-audit-item]')).toHaveLength(auditPackage('governance-risk').items.length);
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('Next reveals the destination audit area and preserves the workpaper return target',async()=>{
  const layout=jest.spyOn(HTMLElement.prototype,'getClientRects').mockImplementation(function(){return this.closest('[hidden]')?[]:[{}];});
  try{
    await act(async()=>button('Close assessment').click());await act(async()=>button('Collapse all audit areas').click());
    const pack=auditPackage('governance-risk'),firstArea=pack.items[0].area,lastIndex=pack.items.findIndex(item=>item.area!==firstArea)-1;
    const last=pack.items[lastIndex],destination=pack.items[lastIndex+1];
    await act(async()=>container.querySelector('.iso-audit-areas [data-control]').click());
    await act(async()=>container.querySelector(`[data-audit-item="${last.key}"]`).click());
    await act(async()=>button('Next').click());
    expect(container.querySelector(`.iso-audit-areas [data-control="${destination.area}"]`).getAttribute('aria-expanded')).toBe('true');
    await act(async()=>button('Close assessment').click());await act(async()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    const target=container.querySelector(`[data-audit-item="${destination.key}"]`);
    expect(target).not.toBeNull();expect(document.activeElement).toBe(target);
    expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
  }finally{layout.mockRestore();}
});

test('selected audit year and historical occurrence survive grouped workpaper opening and closing',async()=>{
  await act(async()=>button('Close assessment').click());
  review.occurrences=[{...review,occurrence_id:'retained-period',due_date:'2029-12-31',completed_at:'2029-12-30',iso_audit:{...initialAuditState('governance-risk',3),items:{'4-1':{status:'reviewed',result:'observation',notes:'Frozen period notes',na_rationale:'',evidence_ids:[],finding_ids:['retained-finding'],assessment_checks:[]}}}}];
  const historical=JSON.stringify(review.occurrences);
  await act(async()=>root.render(<IsoAuditWorkspace clientId="c"/>));
  await fill('Audit-program year','2029');await fill('Audit occurrence','retained-period');
  await act(async()=>button('Expand all audit areas').click());
  await act(async()=>container.querySelector('[data-audit-item="4-1"]').click());
  expect(document.querySelector('[aria-label="Auditor notes"]').value).toBe('Frozen period notes');
  expect(document.querySelector('[aria-label="Auditor notes"]').closest('fieldset').disabled).toBe(true);
  expect(button('Save assessment')).toBeUndefined();
  await act(async()=>button('Close assessment').click());
  expect(container.querySelector('[aria-label="Audit-program year"]').value).toBe('2029');
  expect(container.querySelector('[aria-label="Audit occurrence"]').value).toBe('retained-period');
  expect(JSON.stringify(review.occurrences)).toBe(historical);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('collapsible audit source preserves the native workpaper form without saving or changing results',async()=>{
  const source=document.querySelector('[data-testid="iso-audit-workpaper"] .iso-audit-source');
  expect(source.open).toBe(false);expect(source.querySelector('.assessment-requirement')).not.toBeNull();
  const before=JSON.stringify(review);await act(async()=>source.querySelector('summary').click());
  expect(source.open).toBe(true);
  expect(document.querySelector('[aria-label="Audit progress"]').value).toBe('not_started');
  expect(document.querySelector('[aria-label="Audit result"]').value).toBe('');
  expect(document.body.textContent).toContain('Evidence & validation');expect(document.body.textContent).toContain('Open central Review');
  expect(JSON.stringify(review)).toBe(before);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('package progress presentation counts examined workpapers without closing findings or activating a schedule',async()=>{
  review.status='upcoming';review.iso_audit.items['4-1']={status:'reviewed',result:'nonconformity',notes:'Recorded examination',na_rationale:'',evidence_ids:[],finding_ids:[],assessment_checks:[]};
  await act(async()=>button('Close assessment').click());await act(async()=>button('All audit packages').click());
  const card=container.querySelector('.iso-audit-packages .grow');
  expect(card.querySelector('.g-impl b').textContent).toBe('1 of '+auditPackage('governance-risk').items.length);expect(card.textContent).toContain('1 Nonconformities');
  expect(card.querySelector('[role="img"]').getAttribute('aria-label')).toContain('Reviewed: 1');
  expect(card.querySelector('.g-ass b').textContent).toBe('1 of '+auditPackage('governance-risk').items.length);
  expect(review.status).toBe('upcoming');expect(review.iso_audit.items['4-1'].finding_ids).toEqual([]);
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('audit summary preserves native statuses and separates valid results from workpaper completion',async()=>{
  const definitions=auditPackage('governance-risk').items;
  review.iso_audit.items={
    [definitions[0].key]:{status:'reviewed',result:'',notes:'Reviewed without result',na_rationale:'',evidence_ids:[],finding_ids:[]},
    [definitions[1].key]:{status:'not_applicable',result:'',notes:'Outside agreed scope',na_rationale:'Documented scope exclusion',evidence_ids:[],finding_ids:[]},
    [definitions[2].key]:{status:'in_progress',result:'observation',notes:'Examination in progress',na_rationale:'',evidence_ids:[],finding_ids:[]},
    [definitions[3].key]:{status:'reviewed',result:'conforming',notes:'Examined',na_rationale:'',evidence_ids:[],finding_ids:[]},
  };
  const before=JSON.stringify(review);
  await act(async()=>button('Close assessment').click());
  const summary=container.querySelector('.iso-audit-program > [aria-labelledby]');
  expect(summary.querySelector('.now-value').textContent).toBe((2/definitions.length*100).toFixed(1)+'%');
  expect(summary.textContent).toContain('2 of '+definitions.length+' planned checks complete');expect(summary.textContent).toContain('2 results recorded');
  expect(summary.querySelector('[aria-label^="Audit workpaper status"]').getAttribute('aria-label')).toContain('Reviewed: 2');
  expect(summary.querySelector('[aria-label^="Audit workpaper status"]').getAttribute('aria-label')).toContain('N/A: 1');
  expect(summary.textContent).not.toMatch(/Not implemented|Not assessed/);expect(summary.querySelectorAll('.lg button')).toHaveLength(0);
  expect(container.querySelector('.iso-audit-register select')).toBeNull();expect(JSON.stringify(review)).toBe(before);
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('no audit plan or work remains Not scheduled with an undefined completion percentage and no implicit activation',async()=>{
  const get=api.get.getMockImplementation();
  api.get.mockImplementation((path,...args)=>path==='/iso-audit'?Promise.resolve({data:{program:null,reviews:[]}}):get(path,...args));
  await act(async()=>button('Close assessment').click());
  const summary=container.querySelector('.iso-audit-program > [aria-labelledby]');
  expect(summary.querySelector('.now-value').textContent).toBe('—');expect(summary.textContent).toContain('0 of 0 planned checks complete');
  expect(summary.textContent).toContain('Not scheduled');expect(summary.querySelectorAll('.sbar i')).toHaveLength(0);
  expect(container.querySelectorAll('.iso-audit-quarter')).toHaveLength(4);
  for(const quarter of container.querySelectorAll('.iso-audit-quarter'))expect(quarter.textContent).toContain('Not scheduled');
  expect(container.textContent).toContain('Program not activated');expect(container.querySelectorAll('.iso-audit-packages .grow')).toHaveLength(0);
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test.each([[30,'Upcoming'],[-30,'Overdue']])('audit package timing follows its actual due date offset %s, not its quarter or workpaper status',async(offset,label)=>{
  review.due_date=new Date(Date.now()+offset*86400000).toISOString().slice(0,10);review.status='upcoming';const before=JSON.stringify(review);
  await act(async()=>button('Close assessment').click());await act(async()=>button('All audit packages').click());
  const card=container.querySelector('.iso-audit-packages .grow');expect(card.querySelector('.gname small').textContent).toContain(label);
  expect(card.querySelector('.g-impl b').textContent).toBe('0 of '+auditPackage('governance-risk').items.length);
  expect(card.textContent).not.toContain('Not implemented');expect(JSON.stringify(review)).toBe(before);
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});
