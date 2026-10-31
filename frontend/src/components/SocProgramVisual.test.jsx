import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {SocProgramHeader,SocProgramSnapshot} from './SocProgramVisual';
import {cisSummary} from '@/lib/cisVerification';
import {frameworkCatalog} from '@/lib/frameworks';
import {groupRequirements} from '@/lib/frameworkWorkspace';

let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const render=element=>act(async()=>root.render(element));

test('readiness uses native applicable counts and keeps assessed, verification and N/A distinct',async()=>{
  const rows=['addressed','addressed','in_progress','needs_attention','not_assessed','not_applicable'].map(status=>({status}));
  const onFilter=jest.fn(),summary=cisSummary(rows);
  await render(<SocProgramSnapshot summary={summary} filter="addressed" onFilter={onFilter}/>);
  expect(container.querySelector('[data-testid="soc-readiness-percentage"]').textContent).toBe('40.0%');
  expect(container.textContent).toContain('2 of 5 applicable criteria addressed');
  expect(container.textContent).toContain('Assessed 4 of 5');
  expect(container.textContent).toContain('Saved verification is separate from readiness');
  const partial=container.querySelector('[data-testid="psoc-seg-partial"]');
  expect(partial.getAttribute('aria-label')).toBe('Partially Addressed: 1 of 5 criteria, 20%');
  expect(partial.tabIndex).toBe(0);
  const selected=container.querySelector('.soc-readiness-legend [aria-pressed="true"]');
  expect(selected.querySelector('.soc-readiness-legend-value strong').textContent).toBe('40.0%');
  expect(selected.querySelector('.soc-readiness-legend-value small').textContent).toBe('2 of 5');
  await act(async()=>selected.click());expect(onFilter).toHaveBeenLastCalledWith('all');
  await act(async()=>container.querySelector('.bcis-legend-na').click());expect(onFilter).toHaveBeenLastCalledWith('not_applicable');
  expect(container.textContent).toContain('Not Applicable 1 · excluded from applicable totals');
});

test('zero applicable and unavailable source never render a fabricated successful percentage',async()=>{
  const onFilter=jest.fn();
  await render(<SocProgramSnapshot summary={cisSummary([{status:'not_applicable'}])} filter="all" onFilter={onFilter}/>);
  expect(container.querySelector('[data-testid="soc-readiness-percentage"]').textContent).toBe('—');
  expect(container.textContent).toContain('0 of 0 applicable criteria addressed');
  await render(<SocProgramSnapshot summary={{available:false,reason:'Saved position is unavailable'}} filter="all" onFilter={onFilter}/>);
  expect(container.querySelector('[data-testid="soc-readiness-percentage"]').textContent).toBe('—');
  expect(container.textContent).toContain('Saved position is unavailable');
  expect(container.querySelectorAll('[data-testid^="psoc-seg-"]')).toHaveLength(0);
  expect(container.textContent).not.toContain('undefined');
});

test('one overall heading keeps native edition and scope without repeating category helper paragraphs',async()=>{
  const rows=frameworkCatalog('soc-2').requirements,summary=cisSummary(rows),resume={definition_id:'P1.1',title:'Native privacy criterion'};
  const onContinue=jest.fn(),onTheme=jest.fn();
  const edition=frameworkCatalog('soc-2').version;
  await render(<SocProgramHeader categories={groupRequirements('soc-2',rows)} summary={summary} resume={resume} onContinue={onContinue} theme="light" onTheme={onTheme} sourceLabel="SOC 2 Type 2" edition={edition}/>);
  expect(container.querySelectorAll('h1')).toHaveLength(1);
  expect(container.querySelector('h1').textContent).toBe('SOC 2');
  const captions=container.querySelectorAll('.soc-program-heading p');expect(captions).toHaveLength(1);
  expect(captions[0].textContent).toBe(`SOC 2 Type 2 · ${edition} · 5 selected Trust Services Categories · ${rows.length} criteria in scope`);
  expect(captions[0].textContent).not.toContain('Privacy');expect(captions[0].textContent).not.toContain('Processing Integrity');
  expect(container.querySelector('.soc-program-back')).toBeNull();
  await act(async()=>container.querySelector('[aria-label="Continue assessment: P1.1 Native privacy criterion"]').click());expect(onContinue).toHaveBeenCalledTimes(1);
  await act(async()=>container.querySelector('[aria-label="Switch to dark mode"]').click());expect(onTheme).toHaveBeenCalledTimes(1);
});

test('category heading exposes its exact native title, category count and overview action',async()=>{
  const rows=frameworkCatalog('soc-2').requirements.filter(row=>row.category==='security'),onOverview=jest.fn();
  const edition='Native edition string · unchanged';
  await render(<SocProgramHeader categories={groupRequirements('soc-2',rows)} summary={cisSummary(rows)} categoryLabel="Security — Common Criteria" onOverview={onOverview} sourceLabel="SOC 2 Type 2" edition={edition}/>);
  expect(container.querySelectorAll('h1')).toHaveLength(1);
  const heading=container.querySelector('h1');expect(heading.textContent).toBe('Security — Common Criteria');
  heading.focus();expect(document.activeElement).toBe(heading);
  expect(container.querySelector('.soc-program-heading p').textContent).toBe(`SOC 2 Type 2 · ${edition} · 33 criteria in this category`);
  expect(container.textContent).not.toContain('selected Trust Services');
  await act(async()=>container.querySelector('.soc-program-back').click());expect(onOverview).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[aria-label^="Continue assessment"]')).toBeNull();
});

test('Continue appears once in the header while snapshot counts and native qualification remain intact',async()=>{
  const rows=frameworkCatalog('soc-2').requirements.map(row=>({...row,status:'not_assessed'})),summary=cisSummary(rows),resume={definition_id:'CC1.1',title:'Native criterion'};
  await render(<><SocProgramHeader categories={groupRequirements('soc-2',rows)} summary={summary} resume={resume}/><SocProgramSnapshot summary={summary} filter="all" onFilter={jest.fn()} resume={resume}/></>);
  expect(container.querySelectorAll('[aria-label^="Continue assessment"]')).toHaveLength(1);
  const snapshot=container.querySelector('.soc-program-snapshot');
  expect(snapshot.textContent).not.toContain('Continue');
  expect(snapshot.textContent).toContain('61 still to assess');
  expect(snapshot.textContent).toContain('not a compliance percentage, certification or audit opinion');
  expect(snapshot.textContent).toContain('Saved verification is separate from readiness');
});
