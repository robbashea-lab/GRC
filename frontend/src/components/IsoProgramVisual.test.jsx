import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {IsoProgramHeader,IsoProgramSnapshot,IsoSoaSnapshot,ISO_PROGRAM_STATUS_LABELS} from './IsoProgramVisual';
import {isoProgramPresentation} from '@/lib/isoProgramPresentation';
import {frameworkDashboardFixture} from '@/testUtils/frameworkDashboard';
import {frameworkCatalog} from '@/lib/frameworks';
import * as frameworks from '@/lib/frameworks';

let root,container;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  jest.useFakeTimers().setSystemTime(new Date('2026-10-31T10:00:00Z'));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});
const present=fixture=>isoProgramPresentation(fixture.source,fixture.client.client_id);
const fixture=()=>frameworkDashboardFixture('iso-27001',undefined,'synthetic-iso-visual');
const render=async children=>act(async()=>root.render(<div className="bcis iso-cis-program-visual" data-theme="light">{children}</div>));
const click=node=>act(async()=>node.click());
const button=label=>[...container.querySelectorAll('button')].find(node=>node.textContent===label);
const statusButton=label=>[...container.querySelectorAll('.lg button')].find(node=>node.querySelector('.lg-label').textContent===label);

test.each([
  ['overview','ISO 27001','123 requirements and controls'],
  ['soa','Statement of Applicability','93 Annex A controls'],
  ['isms_clause','ISMS Requirements','30 ISMS requirements'],
  ['annex_control','Annex A Controls','93 Annex A reference controls'],
  ['audit','Internal Audit','Planned audit work'],
])('%s header uses one approved program heading and native section metadata',async(view,title,metadata)=>{
  const source=fixture(),presentation=present(source),onOverview=jest.fn();
  await render(<IsoProgramHeader {...{view,presentation,onOverview}} theme="light" onTheme={()=>{}}/>);
  expect(container.querySelectorAll('h1')).toHaveLength(1);expect(container.querySelector('h1').textContent).toBe(title);
  expect(container.querySelector('.page-head p').textContent).toContain('ISO/IEC 27001:2022 · Amendment 1:2024');
  expect(frameworkCatalog('iso-27001').version).toBe('2022 + Amd 1:2024');
  expect(container.querySelector('.page-head p').textContent).toContain(metadata);
  expect(container.querySelector('.page-head p').textContent).not.toContain('CIS Controls');
  if(view==='overview')expect(button('Back to ISO overview')).toBeUndefined();
  else{await click(button('Back to ISO overview'));expect(onOverview).toHaveBeenCalledTimes(1);}
});

test('readable reference follows configured edition metadata without changing the catalog or native inventory',async()=>{
  const source=fixture(),presentation=present(source),catalog=frameworkCatalog('iso-27001');
  const configured=jest.spyOn(frameworks,'frameworkCatalog').mockReturnValue({...catalog,version:'2028 + Amd 2:2030'});
  try{
    await render(<IsoProgramHeader view="overview" presentation={presentation} theme="light" onTheme={()=>{}}/>);
    expect(container.querySelector('.page-head p').textContent).toContain('ISO/IEC 27001:2028 · Amendment 2:2030 · 123 requirements and controls');
    expect(catalog.version).toBe('2022 + Amd 1:2024');
  }finally{configured.mockRestore();}
});

test('Audit subtitle uses only its selected native plan count and workpaper save date, never the implementation timestamp',async()=>{
  const presentation=present(fixture()),asOf='2026-10-27T15:30:00Z';
  const date=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(asOf));
  await render(<IsoProgramHeader view="audit" presentation={presentation} auditSummary={{total:28,asOf}} theme="light" onTheme={()=>{}}/>);
  expect(container.querySelector('.page-head p').textContent).toBe(`ISO/IEC 27001:2022 · Amendment 1:2024 · 28 planned audit checks · As of ${date}`);
  await render(<IsoProgramHeader view="audit" presentation={presentation} auditSummary={{total:0,asOf:null}} theme="light" onTheme={()=>{}}/>);
  expect(container.querySelector('.page-head p').textContent).toBe('ISO/IEC 27001:2022 · Amendment 1:2024 · 0 planned audit checks');
});

test('Continue and theme actions retain their supplied native callbacks and criterion identity',async()=>{
  const source=fixture(),definition=source.source.definitions.find(row=>row.id==='A.5.1');
  const resume={...definition,...source.source.assessments.find(row=>row.definition_id===definition.id)};
  const onContinue=jest.fn(),onOverview=jest.fn(),onTheme=jest.fn(),before=JSON.stringify(source.source);
  await render(<IsoProgramHeader view="annex_control" presentation={present(source)} {...{resume,onContinue,onOverview,onTheme}} theme="dark"/>);
  const next=button(`Continue: ${resume.definition_id} ${resume.title}`);
  expect(next.parentElement.className).toBe('head-actions');await click(next);expect(onContinue).toHaveBeenCalledTimes(1);
  await click(container.querySelector('[aria-label="Switch to light theme"]'));expect(onTheme).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(source.source)).toBe(before);
});

test('header and snapshot show only the actual source-state timestamp, never today or an assessment-save substitute',async()=>{
  const source=fixture();
  source.source.implementation_position.provenance.source_as_of='2026-10-20T09:15:00-07:00';
  source.source.implementation_position.generated_at='2026-10-30T12:00:00Z';
  source.source.assessments[0].last_assessed='2026-10-31T09:00:00Z';
  source.source.assessments[0].last_saved='2026-10-31T09:00:00Z';
  const date=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date('2026-10-20T16:15:00Z'));
  let presentation=present(source);
  const view=()=> <><IsoProgramHeader view="overview" presentation={presentation} theme="light" onTheme={()=>{}}/><IsoProgramSnapshot summary={presentation.overall} {...{presentation}} filter="all" onFilter={()=>{}}/></>;
  await render(view());
  expect(container.querySelector('.page-head p').textContent).toContain(`As of ${date}`);
  expect(container.querySelector('.now-head small').textContent).toBe(`As of ${date}`);
  expect(container.textContent).not.toContain('Record state as of');
  expect(container.textContent).not.toContain('Assessed today');
  source.source.implementation_position.provenance.source_as_of=null;presentation=present(source);
  await render(view());
  expect(container.querySelector('.page-head p').textContent).not.toMatch(/as of/i);
  expect(container.querySelector('.now-head small').textContent).toBe('Assessment date unavailable');
});

test('implementation snapshot keeps native composite wording, independent assessment counts and functioning status filters',async()=>{
  const source=fixture(),presentation=present(source),records=source.source.assessments,before=JSON.stringify(source.source),onFilter=jest.fn();
  const implemented=records.filter(row=>row.status==='addressed').length,assessed=records.filter(row=>row.status!=='not_assessed').length;
  await render(<IsoProgramSnapshot summary={presentation.overall} {...{presentation,onFilter}} filter="all"/>);
  expect(container.querySelector('.now-label').textContent).toBe('Current implementation');
  expect(container.querySelector('.now-value').textContent).toBe(`${(implemented/records.length*100).toFixed(1)}%`);
  expect(container.querySelector('.now-head p').textContent).toBe(`${implemented} of ${records.length} requirements and controls implemented`);
  expect(container.querySelector('.bd-head').textContent).toContain(`Assessed ${assessed} of ${records.length}`);
  expect(ISO_PROGRAM_STATUS_LABELS.needs_attention).toBe('Not implemented / needs validation');
  const negative=statusButton('Not implemented / needs validation');expect(negative).toBeDefined();
  await click(negative);expect(onFilter).toHaveBeenLastCalledWith('needs_attention');
  const partial=container.querySelector('.sbar button.s-part');await click(partial);expect(onFilter).toHaveBeenLastCalledWith('in_progress');
  await render(<IsoProgramSnapshot summary={presentation.overall} {...{presentation,onFilter}} filter="needs_attention"/>);
  expect(statusButton('Not implemented / needs validation').getAttribute('aria-pressed')).toBe('true');
  await click(statusButton('Not implemented / needs validation'));expect(onFilter).toHaveBeenLastCalledWith('all');
  expect(container.querySelector('.ver')).toBeNull();expect(container.querySelector('.card-foot').textContent).toBe('Assessment progress, not a compliance percentage or certification. Freshness is separate from saved verification.');
  expect(JSON.stringify(source.source)).toBe(before);
});

test('Annex snapshot excludes saved excluded/undetermined implementation claims without hiding their SoA context',async()=>{
  const source=fixture();source.source.assessments.forEach(row=>{row.status='not_assessed';});
  const controls=source.source.assessments.filter(row=>row.definition_id.startsWith('A.'));
  Object.assign(controls[0],{status:'addressed',soa_applicability:'excluded',verification:'verified'});
  Object.assign(controls[1],{status:'addressed',soa_applicability:'',soa_justification:'',verification:'verified'});
  Object.assign(controls[2],{status:'addressed',verification:'not_verified'});
  source.refresh();const presentation=present(source),before=JSON.stringify(source.source);
  await render(<IsoProgramSnapshot summary={presentation.annex} {...{presentation}} noun="controls" filter="addressed" onFilter={()=>{}}/>);
  expect(container.querySelector('.now-head p').textContent).toBe('1 of 91 controls implemented');
  expect(container.querySelector('.now-value').textContent).toBe('1.1%');
  expect(container.querySelector('.card-foot').textContent).toBe('Assessment progress, not a compliance percentage or certification. Freshness is separate from saved verification.');
  expect(presentation.soa).toMatchObject({undetermined:1,excluded:1});
  expect(statusButton('Implemented').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('.ver')).toBeNull();expect(JSON.stringify(source.source)).toBe(before);
});

test('mandatory legacy N/A cannot become an invented valid snapshot, and its saved history remains unchanged',async()=>{
  const source=fixture(),legacy=source.source.assessments.find(row=>row.definition_id==='4.1');
  Object.assign(legacy,{status:'not_applicable',na_rationale:'Retained legacy answer',assessment_history:[{status:'not_applicable',at:'2026-10-01T00:00:00Z'}]});
  source.refresh();const presentation=present(source),before=JSON.stringify(source.source);
  await render(<IsoProgramSnapshot summary={presentation.requirements} {...{presentation}} noun="ISMS requirements" filter="all" onFilter={()=>{}}/>);
  expect(container.querySelector('.now-value').textContent).toBe('—');
  expect(container.querySelector('.now-head p').textContent).toBe('Implementation source unavailable');
  expect(container.querySelector('.sbar').getAttribute('aria-label')).toBe('Status mix unavailable');
  expect(container.querySelectorAll('.sbar button')).toHaveLength(0);
  expect([...container.querySelectorAll('.lg-val')].every(node=>node.textContent==='—Unavailable')).toBe(true);
  expect(JSON.stringify(source.source)).toBe(before);
});

test('SoA snapshot measures documented decisions rather than implementation or merely recorded selections',async()=>{
  const source=fixture(),controls=source.source.assessments.filter(row=>row.definition_id.startsWith('A.'));
  controls.forEach(row=>Object.assign(row,{status:'addressed',soa_applicability:'',soa_justification:''}));
  Object.assign(controls[0],{status:'not_assessed',soa_applicability:'included',soa_justification:'Saved necessary-control basis'});
  Object.assign(controls[1],{status:'addressed',soa_applicability:'excluded',soa_justification:'Saved exclusion basis'});
  Object.assign(controls[2],{status:'addressed',soa_applicability:'included',soa_justification:' '});
  source.refresh();const presentation=present(source),before=JSON.stringify(source.source);
  await render(<IsoSoaSnapshot {...{presentation}} onApplicability={()=>{}}/>);
  expect(presentation.overall.available).toBe(false);expect(presentation.soa.countsAvailable).toBe(true);
  expect(container.querySelector('.now-label').textContent).toBe('Annex A decisions documented');
  expect(container.querySelector('.now-head p').textContent).toBe('2 of 93 decisions documented');expect(container.querySelector('.now-value').textContent).toBe('2.2%');
  expect(container.querySelector('.bd-head').textContent).toContain('3 decisions recorded · 91 documentation outstanding');
  expect(container.querySelector('[role="status"]').textContent).toContain('1 recorded decision');
  expect(container.querySelector('[role="status"]').textContent).toContain('native justification');
  expect(container.querySelector('.sbar').getAttribute('aria-label')).toBe('Necessary: 2, Not Necessary: 1, Decision needed: 90');
  expect(container.querySelector('.card-foot').textContent).toBe('Assessment progress, not a compliance percentage or certification.');
  expect(container.querySelector('.ver')).toBeNull();expect(JSON.stringify(source.source)).toBe(before);
});

test('SoA segment and legend filters preserve native applicability keys and toggle back to All without writes',async()=>{
  const source=fixture();source.source.assessments.find(row=>row.definition_id==='A.5.1').soa_applicability='excluded';source.refresh();
  const presentation=present(source),before=JSON.stringify(source.source),onApplicability=jest.fn();
  await render(<IsoSoaSnapshot {...{presentation,onApplicability}}/>);
  await click(statusButton('Necessary'));expect(onApplicability).toHaveBeenLastCalledWith('included');
  await click(container.querySelector('.sbar button.s-part'));expect(onApplicability).toHaveBeenLastCalledWith('excluded');
  await render(<IsoSoaSnapshot {...{presentation,onApplicability}} applicability="included"/>);
  expect(statusButton('Necessary').getAttribute('aria-pressed')).toBe('true');
  await click(statusButton('Necessary'));expect(onApplicability).toHaveBeenLastCalledWith('all');
  await click(container.querySelector('.sbar button.s-impl'));expect(onApplicability).toHaveBeenLastCalledWith('all');
  expect(JSON.stringify(source.source)).toBe(before);
});

test('untrusted native identity suppresses SoA values instead of reporting zero or complete coverage',async()=>{
  const source=fixture();source.source.assessments[0].client_id='foreign';
  const presentation=present(source),before=JSON.stringify(source.source);
  await render(<IsoSoaSnapshot {...{presentation}} onApplicability={()=>{}}/>);
  expect(container.querySelector('.now-value').textContent).toBe('—');
  expect(container.querySelector('.now-head p').textContent).toBe('Applicability source unavailable');
  expect(container.querySelector('.sbar').getAttribute('aria-label')).toBe('Applicability counts unavailable');
  expect(container.querySelectorAll('.sbar button')).toHaveLength(0);
  expect([...container.querySelectorAll('.lg-val')].every(node=>node.textContent==='—Unavailable')).toBe(true);
  expect(container.textContent).not.toContain('0 of 0');expect(JSON.stringify(source.source)).toBe(before);
});
