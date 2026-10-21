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

test('Portfolio grouped table reflows at its container boundary with neutral metrics and its reviewed status palette',()=>{
  const css=read('pages/GoverNaraPortfolio.css');
  expect(css).toMatch(/\.gp-table-frame\s*\{[^}]*container-type:\s*inline-size/);
  expect(css).toMatch(/\.gp-table thead tr,\.gp-table tbody\s*\{[^}]*display:grid[^}]*grid-template-columns:/);
  expect(css).toMatch(/@container\s*\(max-width:960px\)/);
  expect(css).toContain('font-variant-numeric:tabular-nums');
  expect(css).not.toMatch(/\.gp-(percent|progress-count)[^{}]*\{[^}]*background:\s*var\(--color-(critical|moderate)-bg\)/);
  const palette = [['implemented','--chart-implemented'],['partial','--gp-part'],['not','--gp-not'],['unassessed','--gp-none']];
  for(const [status,color] of palette)
    expect(css).toContain(`.gp-statusbar .is-${status} { background:var(${color}); }`);
  // Portfolio has its own reviewed light/dark palette, independent of the native workspace.
  const sheet = require('postcss').parse(css);
  for(const [selector,expected] of [
    ['.governara-portfolio',['#0F8C69','#CC8B12','#CC4655','#D3DBE5']],
    ['.governara-portfolio[data-theme=dark]',['#2BA688','#D4A13C','#E06A78','#2C3747']]
  ]) {
    const colors = new Map();
    sheet.walkRules(selector, rule => rule.walkDecls(declaration => colors.set(declaration.prop,declaration.value)));
    const actual = palette.map(([,token]) => colors.get(token));
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(4);
  }
  const source=read('pages/ClientDirectory.jsx');expect(source).toContain("import './GoverNaraPortfolio.css'");expect(source).not.toContain("import './BrawndoPortfolio.css'");
});
