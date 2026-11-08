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
const click=element=>act(async()=>element.click());

test('shared implementation snapshot preserves native applicable counts, assessed coverage, qualification and N/A filtering',async()=>{
  const rows=['addressed','addressed','in_progress','needs_attention','not_assessed','not_applicable'].map(status=>Object.freeze({status}));
  const onFilter=jest.fn(),summary=Object.freeze(cisSummary(rows)),before=JSON.stringify(summary);
  await render(<SocProgramSnapshot summary={summary} filter="addressed" onFilter={onFilter}/>);
  expect(container.querySelector('.now-label').textContent).toBe('Current implementation');
  expect(container.querySelector('.now-value').textContent).toBe('40.0%');
  expect(container.querySelector('.now-head p').textContent).toBe('2 of 5 criteria implemented');
  expect(container.querySelector('.bd-head').textContent).toContain('Assessed 4 of 5 · 80.0%');
  expect([...container.querySelectorAll('.lg-label')].map(element=>element.textContent)).toEqual(['Implemented','Partially implemented','Implementation not established','Not assessed']);
  expect(container.querySelector('.card-foot').textContent).toContain('Assessment progress, not a compliance percentage, certification or audit opinion. Freshness is separate from saved verification.');
  const selected=container.querySelector('.lg-cell[aria-pressed="true"]');
  expect(selected.querySelector('.lg-val b').textContent).toBe('40.0%');
  expect(selected.querySelector('.lg-val > span').textContent).toBe('2 of 5');
  await click(selected);expect(onFilter).toHaveBeenLastCalledWith('all');
  await click(container.querySelector('.card-foot button'));expect(onFilter).toHaveBeenLastCalledWith('not_applicable');
  expect(container.querySelector('.card-foot').textContent).toContain('1 not applicable, excluded from implementation totals.');
  expect(container.textContent).not.toContain('Addressed');expect(JSON.stringify(summary)).toBe(before);
});

test('native summary segment buttons and legend buttons filter the same stored SOC conclusions',async()=>{
  const summary=cisSummary(['addressed','in_progress','needs_attention','not_assessed'].map(status=>({status}))),onFilter=jest.fn();
  const view=filter=><SocProgramSnapshot {...{summary,filter,onFilter}}/>;
  await render(view('all'));
  const partial=container.querySelector('.sbar button.s-part');
  expect(partial.tagName).toBe('BUTTON');expect(partial.type).toBe('button');expect(partial.tabIndex).toBe(0);
  expect(partial.getAttribute('aria-label')).toBe('Partially implemented: 1 of 4');
  expect(partial.title).toBe('Partially implemented: 1 of 4');
  partial.focus();expect(document.activeElement).toBe(partial);
  await click(partial);expect(onFilter).toHaveBeenLastCalledWith('in_progress');
  await click(container.querySelector('.sbar button.s-not'));expect(onFilter).toHaveBeenLastCalledWith('needs_attention');
  expect(container.querySelector('.sbar button.s-not').title).toBe('Implementation not established: 1 of 4');
  await render(view('needs_attention'));
  expect(container.querySelector('.sbar button.s-not').getAttribute('aria-pressed')).toBe('true');
  await click(container.querySelector('.sbar button.s-not'));expect(onFilter).toHaveBeenLastCalledWith('all');
  const negative=[...container.querySelectorAll('.lg-cell')].find(element=>element.querySelector('.lg-label').textContent==='Implementation not established');
  await click(negative);expect(onFilter).toHaveBeenLastCalledWith('all');
});

test('zero applicable and unavailable source never render a fabricated percentage, date or status mix',async()=>{
  const onFilter=jest.fn();
  await render(<SocProgramSnapshot summary={cisSummary([{status:'not_applicable'}])} filter="all" onFilter={onFilter}/>);
  expect(container.querySelector('.now-value').textContent).toBe('—');
  expect(container.querySelector('.now-head p').textContent).toBe('0 of 0 criteria implemented');
  expect(container.querySelector('.now-head small').textContent).toBe('Assessment date unavailable');
  await render(<SocProgramSnapshot summary={{available:false,reason:'Saved position is unavailable'}} filter="all" onFilter={onFilter}/>);
  expect(container.querySelector('.now-value').textContent).toBe('—');
  expect(container.querySelector('.card-foot').textContent).toContain('Saved position is unavailable');
  expect(container.querySelector('.sbar').getAttribute('aria-label')).toBe('Status mix unavailable');
  expect(container.querySelectorAll('.sbar button')).toHaveLength(0);
  expect(container.querySelector('.card-foot button')).toBeNull();
  expect(container.textContent).not.toMatch(/undefined|NaN|Infinity/);
});

test('one shared overall header keeps exact native edition, actual as-of and scope without repeated category paragraphs',async()=>{
  const rows=frameworkCatalog('soc-2').requirements,summary=cisSummary(rows),resume={definition_id:'P1.1',title:'Native privacy criterion'};
  const onContinue=jest.fn(),onTheme=jest.fn(),edition=frameworkCatalog('soc-2').version,asOf='Oct 12, 2026, 6:00 PM';
  await render(<SocProgramHeader categories={groupRequirements('soc-2',rows)} {...{summary,resume,onContinue,onTheme,edition,asOf}} theme="light" sourceLabel="SOC 2 Type 2"/>);
  expect(container.querySelectorAll('h1')).toHaveLength(1);expect(container.querySelector('h1').textContent).toBe('SOC 2');
  expect(container.querySelector('header').className).toBe('page-head soc-program-heading');
  const captions=container.querySelectorAll('.page-head p');expect(captions).toHaveLength(1);
  expect(captions[0].textContent).toBe(`SOC 2 Type 2 · ${edition} · 5 selected Trust Services Categories · ${rows.length} criteria in scope · As of ${asOf}`);
  expect(captions[0].textContent).not.toContain('Privacy');expect(captions[0].textContent).not.toContain('Processing Integrity');
  expect([...container.querySelectorAll('button')].find(element=>element.textContent==='Back to SOC 2')).toBeUndefined();
  const next=container.querySelector('.head-actions .primary');expect(next.textContent).toBe('Continue: P1.1 Native privacy criterion');
  await click(next);expect(onContinue).toHaveBeenCalledTimes(1);
  await click(container.querySelector('[aria-label="Switch to dark theme"]'));expect(onTheme).toHaveBeenCalledTimes(1);
});

test('category heading retains exact native title, focus target, category count and overview action',async()=>{
  const rows=frameworkCatalog('soc-2').requirements.filter(row=>row.category==='security'),onOverview=jest.fn(),edition='Native edition string · unchanged';
  await render(<SocProgramHeader categories={groupRequirements('soc-2',rows)} summary={cisSummary(rows)} categoryLabel="Security — Common Criteria" onOverview={onOverview} sourceLabel="SOC 2 Type 2" edition={edition}/>);
  expect(container.querySelectorAll('h1')).toHaveLength(1);
  const heading=container.querySelector('h1');expect(heading.textContent).toBe('Security — Common Criteria');
  heading.focus();expect(document.activeElement).toBe(heading);
  expect(container.querySelector('.page-head p').textContent).toBe(`SOC 2 Type 2 · ${edition} · 33 criteria in this category`);
  expect(container.textContent).not.toContain('selected Trust Services');
  await click([...container.querySelectorAll('button')].find(element=>element.textContent==='Back to SOC 2'));expect(onOverview).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.head-actions .primary')).toBeNull();
});

test('missing native scope/date is unavailable rather than a fabricated zero or current date',async()=>{
  await render(<SocProgramHeader categories={[]} summary={{available:false}} sourceLabel="SOC 2 Type 2" edition="Native edition"/>);
  expect(container.querySelector('p').textContent).toBe('SOC 2 Type 2 · Native edition · Criterion count unavailable');
  expect(container.textContent).not.toContain('As of');expect(container.textContent).not.toContain('0 criteria');
  expect(container.querySelector('.head-actions .primary')).toBeNull();
});

test('Continue appears only in the header while unassessed counts and concise native qualification remain intact',async()=>{
  const rows=frameworkCatalog('soc-2').requirements.map(row=>({...row,status:'not_assessed'})),summary=cisSummary(rows),resume={definition_id:'CC1.1',title:'Native criterion'};
  await render(<><SocProgramHeader categories={groupRequirements('soc-2',rows)} summary={summary} resume={resume}/><SocProgramSnapshot summary={summary} filter="all" onFilter={jest.fn()}/></>);
  expect(container.querySelectorAll('.head-actions .primary')).toHaveLength(1);
  const snapshot=container.querySelector('[aria-labelledby="bcis-summary-heading"]');expect(snapshot.textContent).not.toContain('Continue');
  expect(snapshot.querySelector('.bd-head').textContent).toContain('Assessed 0 of 61 · 0.0%');
  const unassessed=[...snapshot.querySelectorAll('.lg-cell')].find(element=>element.querySelector('.lg-label').textContent==='Not assessed');
  expect(unassessed.querySelector('.lg-val b').textContent).toBe('100.0%');expect(unassessed.querySelector('.lg-val > span').textContent).toBe('61 of 61');
  expect(snapshot.querySelector('.card-foot').textContent).toBe('Assessment progress, not a compliance percentage, certification or audit opinion. Freshness is separate from saved verification.');
});
