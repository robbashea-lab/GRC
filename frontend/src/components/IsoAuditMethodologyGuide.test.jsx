import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import IsoAuditMethodologyGuide,{auditMethodClarification} from './IsoAuditMethodologyGuide';
import {auditPackage,initialAuditState} from '@/lib/isoAudit';

let root,container;
const button=name=>[...container.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
const copy=value=>JSON.parse(JSON.stringify(value));
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test.each(['governance-risk','people-access-suppliers','physical-technology','operations-improvement'])('%s guidance reuses the exact native methodology without creating or completing work',async packageKey=>{
  const item=auditPackage(packageKey).items[0],review={review_id:'synthetic-review-'+packageKey,client_id:'synthetic-audit-client',due_date:'2030-12-31',iso_audit:initialAuditState(packageKey)},before=copy(review),openReview=jest.fn();
  await act(async()=>root.render(<IsoAuditMethodologyGuide enabled review={review} item={item} summary="Native workpaper introduction" onOpen={openReview}/>));
  const launcher=button('Begin audit guidance');expect(launcher.getAttribute('aria-expanded')).toBe('false');expect(button('Pause & return')).toBeUndefined();
  await act(async()=>launcher.click());
  const panel=container.querySelector('[aria-label="Audit methodology content"]');
  expect(panel.hidden).toBe(false);expect(document.activeElement.textContent).toBe('Prepare this audit workpaper');
  expect(panel.querySelector('[data-testid="iso-audit-guide"]')).not.toBeNull();
  for(const value of [item.intent,item.verify,item.inspect,item.questions].filter(Boolean))expect(panel.textContent).toContain(value);
  expect(panel.querySelectorAll('input,textarea,select')).toHaveLength(0);
  expect(container.textContent).not.toMatch(/Resume guided assessment|Interview progress saved|Apply to assessment/);
  expect(openReview).not.toHaveBeenCalled();expect(review).toEqual(before);
  await act(async()=>button('Open normal Review').click());expect(openReview).toHaveBeenCalledTimes(1);expect(review).toEqual(before);
});

test('Pause restores the visible launcher after each ordinary local opening without implying saved progress',async()=>{
  const review={review_id:'synthetic-audit',due_date:'2030-12-31',iso_audit:initialAuditState('governance-risk')},item=auditPackage('governance-risk').items[0],before=copy(review);
  await act(async()=>root.render(<IsoAuditMethodologyGuide enabled review={review} item={item} summary="Native introduction"/>));
  for(let cycle=0;cycle<2;cycle++){
    const launcher=button(cycle?'Open audit guidance':'Begin audit guidance');
    await act(async()=>launcher.click());expect(container.querySelector('[aria-label="Audit methodology content"]').hidden).toBe(false);
    await act(async()=>button('Pause & return').click());
    const returned=button('Open audit guidance');expect(document.activeElement).toBe(returned);expect(returned.closest('[hidden]')).toBeNull();expect(returned.getAttribute('aria-expanded')).toBe('false');
  }
  expect(review).toEqual(before);expect(container.textContent).toContain('save conclusions in the workpaper');
});

test('unavailable native guidance retains the original requirement summary without a replacement interview',async()=>{
  await act(async()=>root.render(<IsoAuditMethodologyGuide enabled={false} summary="Exact retained audit summary"/>));
  const summary=container.querySelector('.assessment-summary');expect(summary.tagName).toBe('DETAILS');expect(summary.open).toBe(false);expect(summary.textContent).toBe('Requirement summaryExact retained audit summary');
  expect(button('Begin audit guidance')).toBeUndefined();expect(container.querySelector('[data-testid="iso-audit-guide"]')).toBeNull();
});

test('only the current governance scope method gets the authorized conditional-certificate clarification',async()=>{
  const review={review_id:'synthetic-audit',due_date:'2030-12-31',iso_audit:initialAuditState('governance-risk')},item=auditPackage('governance-risk').items.find(row=>row.key==='4-3');
  const note='Compare scope against relevant certificate wording only if a current certificate exists. Absence of certification is not an automatic scope failure or a requirement to obtain a certificate.';
  expect(auditMethodClarification(review,item)).toBe(note);expect(auditMethodClarification(review,item,true)).toBeNull();
  expect(auditMethodClarification(review,{...item,key:'4-2'})).toBeNull();expect(auditMethodClarification({...review,iso_audit:initialAuditState('operations-improvement')},item)).toBeNull();
  await act(async()=>root.render(<IsoAuditMethodologyGuide key="current" enabled review={review} item={item} summary="Scope method"/>));
  await act(async()=>button('Begin audit guidance').click());expect(container.querySelector('[role="note"]').textContent).toBe(note);expect(container.textContent).toContain(item.verify);expect(container.textContent).toContain(item.inspect);
  await act(async()=>root.render(<IsoAuditMethodologyGuide key="history" enabled historical review={review} item={item} summary="Retained scope method"/>));
  await act(async()=>button('Begin audit guidance').click());expect(container.querySelector('[role="note"]')).toBeNull();expect(container.textContent).toContain(item.verify);expect(container.textContent).toContain(item.inspect);
});

test.each([{completed_at:'2026-11-01T12:00:00Z'},{status:'completed'},{status:'cancelled'}])('retained current-slot audit record %j keeps its original methodology without prospective clarification',async retained=>{
  const review={review_id:'retained-current-slot',due_date:'2026-10-31',iso_audit:initialAuditState('governance-risk'),...retained},item=auditPackage('governance-risk').items.find(row=>row.key==='4-3'),before=copy(review);
  expect(auditMethodClarification(review,item)).toBeNull();
  await act(async()=>root.render(<IsoAuditMethodologyGuide enabled review={review} item={item} summary="Retained scope method"/>));
  await act(async()=>button('Begin audit guidance').click());
  expect(container.querySelector('[role="note"]')).toBeNull();expect(container.textContent).toContain(item.verify);expect(container.textContent).toContain(item.inspect);expect(review).toEqual(before);
});
