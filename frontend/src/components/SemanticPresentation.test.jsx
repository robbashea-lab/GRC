import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import StatusBadge,{SeverityBadge,toneFor} from './StatusBadge';
import {CIS_TONE,CisStatusPill} from './CisStatus';
const fs=require('fs'),path=require('path');
const read=file=>fs.readFileSync(path.join(process.cwd(),'src',file),'utf8');

test('shared presentation keeps urgent, attention, processing, confirmed and ordinary states separate',()=>{
  for(const value of ['overdue','critical','immediate'])expect(toneFor(value)).toBe('critical');
  for(const value of ['pending_validation','needs_verification','blocked','expired','needs_attention','partial'])expect(toneFor(value)).toBe('moderate');
  for(const value of ['in_progress','under_review','in_remediation','requested'])expect(toneFor(value)).toBe('info');
  for(const value of ['completed','approved','verified','validated','treated'])expect(toneFor(value)).toBe('success');
  for(const value of ['upcoming','open','active','unassigned','not_assessed','not_applicable'])expect(toneFor(value)).toBe('neutral');
  expect(CIS_TONE.needs_attention).toBe('moderate');expect(CIS_TONE.not_applicable).toBe('neutral');
  const css=read('components/BrawndoCisOverview.css');
  expect(css).toContain('.bcis-bar > .is-critical, .bcis-legend .is-critical > span { background: var(--cs-attention); }');
  expect(css).toContain('var(--page-title-size)/28px');
});

test('tone corrections never change supplied labels, values or accessible text',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div'),root=createRoot(host);
  try{await act(async()=>root.render(<><StatusBadge value="pending_validation" label="Pending Validation"/><SeverityBadge value="high"/><StatusBadge value="accepted" label="Accepted"/><CisStatusPill status="not_applicable"/></>));
    expect(host.querySelector('[data-status="pending_validation"]').textContent).toBe('Pending Validation');
    expect(host.querySelector('[data-status="pending_validation"]').className).toContain('pill-moderate');
    expect(host.querySelector('[data-status="high"]').textContent).toBe('High');
    expect(host.querySelector('[data-status="accepted"]').textContent).toBe('Accepted');
    expect(host.querySelector('.cis-pill').textContent).toBe('Not Applicable');
  }finally{await act(async()=>root.unmount());}
});

test('Risks cannot repaint shared High or Accepted pills in sibling modules',()=>{
  const css=read('pages/BrawndoRisks.css');expect(css).not.toMatch(/\.pill-high|\.pill-accepted/);
  expect(css).toContain('.brisk-num.is-high { color: var(--bp-attention); }');
  const shared=read('design-system.css');expect(shared).toContain('--color-high: #93370D');
  expect(shared).toContain('.pill-accepted { color: var(--color-neutral)');
});

test('Portfolio counts use tabular neutral surfaces and restrained rails, never alarm bubbles',()=>{
  const css=read('pages/BrawndoPortfolio.css');expect(css).not.toMatch(/\.bp-count[^{}]*\{[^}]*background:\s*var\(--bp-(critical|attention)-bg\)/);
  expect(css).toContain('border-inline-start: 2px solid transparent');expect(css).toContain('font-variant-numeric: tabular-nums');
  expect(css).toContain('var(--metric-number-size)');expect(css).toContain('var(--page-title-size)');
  const source=read('pages/ClientDirectory.jsx');expect(source).toContain("critical_high_issues: 'attention'");expect(source).toContain("unassigned: 'neutral'");
});
