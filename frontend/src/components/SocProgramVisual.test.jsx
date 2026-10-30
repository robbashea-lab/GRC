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

test('scope heading derives all selected native categories and criterion counts without a demo identity',async()=>{
  const rows=frameworkCatalog('soc-2').requirements,summary=cisSummary(rows),resume={definition_id:'P1.1',title:'Native privacy criterion'};
  const onContinue=jest.fn(),onTheme=jest.fn();
  await render(<SocProgramHeader categories={groupRequirements('soc-2',rows)} summary={summary} resume={resume} onContinue={onContinue} theme="light" onTheme={onTheme}/>);
  expect(container.querySelector('h1').textContent).toBe('SOC 2');
  expect(container.textContent).toContain('5 selected Trust Services Categories');
  expect(container.textContent).toContain(`${rows.length} criteria in scope`);
  expect(container.textContent).toContain('Privacy');expect(container.textContent).toContain('Processing Integrity');
  await act(async()=>container.querySelector('[aria-label="Continue assessment: P1.1 Native privacy criterion"]').click());expect(onContinue).toHaveBeenCalledTimes(1);
  await act(async()=>container.querySelector('[aria-label="Switch to dark mode"]').click());expect(onTheme).toHaveBeenCalledTimes(1);
});
