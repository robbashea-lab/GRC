import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ClientWorkDashboard from './ClientWorkDashboard';
import {operatorStatuses} from '@/lib/frameworkOperator';
jest.mock('react-router-dom',()=>({Link:({to,children,...rest})=><a href={to} {...rest}>{children}</a>}),{virtual:true});
jest.mock('@/lib/api',()=>({formatError:e=>e.message}));
let root,container;
beforeEach(()=>{jest.useFakeTimers().setSystemTime(new Date('2026-09-27T12:00:00Z'));global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});
const queue={as_of:'2026-09-27',groups:{all:{total:0,items:[]},pastDue:{total:0,items:[]},due30:{total:0,items:[]},unassigned:{total:0,items:[]}}};
const cisRows=[{status:'addressed',last_assessed:'2026-01-01',work:{evidence_count:1,latest_evidence_at:'2026-06-01'}},{status:'addressed'},{status:'in_progress'},
  {status:'needs_attention',work:{open_findings:0}},{status:'needs_attention',work:{finding_ids:['f'],open_findings:1}},{status:'not_assessed'},{status:'not_applicable'}];
const render=async programs=>act(async()=>root.render(<ClientWorkDashboard queue={queue} programs={programs} programRows={Object.fromEntries(programs.map(p=>[p.key,cisRows]))} filter="all" onFilter={()=>{}} onOpen={()=>{}} loadDetail={async()=>({})}/>));
const card=()=>container.querySelector('.bd-program');
const distribution=()=>[...card().querySelectorAll('.bfb-row')].map(row=>({label:row.querySelector('.bfb-name').textContent,count:row.querySelector('.bfb-count').textContent,share:row.querySelector('.bfb-pct').textContent}));
const expectPopulation=()=>{
  expect(card().querySelector('.bfb-big').textContent).toBe('33.3%');expect(card().querySelector('.bfb-hero p').textContent).toMatch(/^2 of 6 /);
  expect(card().querySelector('.bfb-coverage p').textContent).toBe('5 of 6 assessed');expect(card().querySelector('.bfb-coverage strong').textContent).toBe('83.3%');
  expect(distribution().map(({count,share})=>[count,share])).toEqual([['2','33.3%'],['1','16.7%'],['2','33.3%'],['1','16.7%']]);
};

test('CIS IG1 program card exposes the approved comparison layout and exact applicable counts',async()=>{
  await render([{key:'cis-ig1',label:'CIS Controls v8.1 IG1',name:'CIS Controls v8.1 IG1',to:'/compliance/cis-ig1'}]);
  expect(container.querySelector('.bd-header .bd-eyebrow').textContent).toBe('CIS IG1 program');expect(card().querySelector('h2').textContent).toBe('CIS IG1 Status');expect(card().querySelector('[aria-label="Status comparison"]')).toBeTruthy();
  expect(distribution()).toEqual([{label:'Implemented',count:'2',share:'33.3%'},{label:'Partially Implemented',count:'1',share:'16.7%'},{label:'Not Implemented',count:'2',share:'33.3%'},{label:'Not Assessed',count:'1',share:'16.7%'}]);expectPopulation();
});
test('pilot distribution uses the same applicable counts without changing assessments',async()=>{
  const before=JSON.stringify(cisRows);
  await act(async()=>root.render(<ClientWorkDashboard workspacePilot queue={queue} programs={[{key:'cis-ig1',label:'CIS IG1'}]} cisRows={cisRows} filter="all" onFilter={()=>{}} onOpen={()=>{}}/>));
  expectPopulation();expect([...card().querySelectorAll('.bfb-fill')].map(n=>n.style.width)).toEqual(['33.3%','16.7%','33.3%','16.7%']);
  expect(card().querySelectorAll('.bd-gaps a')).toHaveLength(4);expect(card().querySelector('a[href$="view=not_applicable"]').textContent).toBe('1 excluded / not applicable');expect(JSON.stringify(cisRows)).toBe(before);
});
test('missing canonical records do not render zero implementation, assessed counts or no-scope claims',async()=>{
  const implementation_position={availability:'partial',total:56,denominator:0,implemented:0,assessed:0,missing_records:56,reason:'Expected native source records are unavailable.',included_counts:['addressed','in_progress','needs_attention','not_assessed'].map(key=>({key,count:0}))};
  await act(async()=>root.render(<ClientWorkDashboard workspacePilot queue={queue} programs={[{key:'cis-ig1',label:'CIS IG1',implementation_position}]} cisRows={[]} filter="all" onFilter={()=>{}} onOpen={()=>{}}/>));
  expect(card().querySelector('[role="status"]').textContent).toBe('Expected native source records are unavailable.');expect(card().querySelector('.bf-bars')).toBeNull();expect(card().textContent).not.toMatch(/0 of 0|0 safeguards|No applicable/);
});
test.each(['soc-2','hipaa','nist-csf-2'])('%s comparison preserves its actual conclusion vocabulary',async key=>{
  await render([{key,label:key}]);const expected=operatorStatuses(key).addressed;expect(distribution()[0].label).toBe(expected);
  expect(card().querySelector('.bfb-hero h3').textContent).toBe(expected.startsWith('Addressed')?'Current readiness':'Current implementation');expectPopulation();
  if(key==='soc-2')expect(card().querySelector('.bd-program-note').textContent).toBe('Internal readiness, not an auditor opinion.');
});
test('status links expose calculated counts and shares to keyboard users and retain distinct filters',async()=>{
  await render([{key:'cis-ig1',label:'CIS Controls v8.1 IG1'}]);const links=[...card().querySelectorAll('.bfb-row')];
  expect(links.map(a=>new URL(a.href).searchParams.get('view'))).toEqual(['addressed','in_progress','needs_attention','not_assessed']);
  for(const link of links){expect(link.tagName).toBe('A');expect(link.hasAttribute('title')).toBe(false);expect(link.getAttribute('aria-label')).toBe(`Open ${link.querySelector('.bfb-name').textContent.toLowerCase()} safeguards (${link.querySelector('.bfb-count').textContent}, ${link.querySelector('.bfb-pct').textContent})`);link.focus();expect(document.activeElement).toBe(link);}
});
test('SOC 2 uses the same card shell with SOC 2 vocabulary and workspace links',async()=>{
  await render([{key:'soc-2',label:'SOC 2',to:'/compliance/soc-2'}]);expect(card().querySelector('h2').textContent).toBe('SOC 2 Status');
  expect(distribution()[1].label).toBe('Partially Addressed');expect(distribution()[0]).toEqual({label:'Addressed (Readiness)',count:'2',share:'33.3%'});expect(card().querySelector('.bd-program-note').textContent).toBe('Internal readiness, not an auditor opinion.');
  expect(card().querySelector('.bd-gaps a[href="/compliance/soc-2?view=needs_attention"]').textContent).toContain('Needs Remediation / Validation');
  const shape=el=>[...el.querySelectorAll('*')].map(e=>e.tagName+'.'+(e.className.baseVal??e.className));const soc=shape(card());await render([{key:'cis-ig1',label:'CIS Controls v8.1 IG1',to:'/compliance/cis-ig1'}]);expect(soc).toEqual(shape(card()));
});
test('ISO 27001 uses the same shell and whole-program filtered destinations',async()=>{
  await render([{key:'iso-27001',label:'ISO/IEC 27001:2022',to:'/compliance/iso-27001'}]);expect(card().querySelector('h2').textContent).toBe('ISO 27001 Status');
  expect(card().querySelector('a[href="/compliance/iso-27001?dashboard=1&view=addressed"]')).toBeTruthy();expect(card().querySelectorAll('.bd-gaps a')).toHaveLength(4);expect(card().textContent).not.toMatch(/Management Review|Objectives|Statement of Applicability|Internal Audit/);
});
test.each(['cis-ig1','iso-27001','soc-2'])('%s keeps validation drilldowns collapsed without changing progress or N/A counts',async key=>{
  await render([{key,label:key}]);const details=card().querySelector('details');expect(details.open).toBe(false);expect(details.querySelector('summary').textContent).toBe('Validation and remediation');expect(details.querySelectorAll('a')).toHaveLength(4);expectPopulation();
  expect(card().querySelector('a[href$="view=not_applicable"]').textContent).toBe('1 excluded / not applicable');expect(card().querySelector('.bd-program-note').textContent).toBe(key==='soc-2'?'Internal readiness, not an auditor opinion.':'Assessment progress, not a compliance determination.');
});
test.each([['no records',[]],['all N/A',[{status:'not_applicable'},{status:'not_applicable'}]]])('%s: readiness is not calculated rather than shown as 0%%',async(_,rows)=>{
  await act(async()=>root.render(<ClientWorkDashboard queue={queue} programs={[{key:'soc-2',label:'SOC 2',to:'/compliance/soc-2'}]} programRows={{'soc-2':rows}} filter="all" onFilter={()=>{}} onOpen={()=>{}} loadDetail={async()=>({})}/>));
  expect(card().querySelector('.bfb-big').textContent).toBe('—');expect(card().querySelector('[data-testid="readiness-empty"]').textContent).toBe('No applicable criteria yet: readiness not calculated.');expect(distribution().map(row=>[row.count,row.share])).toEqual(Array(4).fill(['0','—']));expect(card().querySelector('.bd-program-note').textContent).toBe('Internal readiness, not an auditor opinion.');
});
test('ISO comparison and coverage use the same applicable population as the percentage',async()=>{
  const rows=[{specification:'isms_clause',status:'addressed'},{specification:'annex_control',soa_applicability:'included',status:'not_assessed'},{specification:'annex_control',soa_applicability:'excluded',status:'addressed'}];
  await act(async()=>root.render(<ClientWorkDashboard queue={queue} programs={[{key:'iso-27001',label:'ISO 27001'}]} programRows={{'iso-27001':rows}} filter="all" onFilter={()=>{}}/>));
  expect(card().querySelector('.bfb-big').textContent).toBe('50.0%');expect(card().querySelector('.bfb-coverage p').textContent).toBe('1 of 2 assessed');expect(distribution().map(({count,share})=>[count,share])).toEqual([['1','50.0%'],['0','0.0%'],['0','0.0%'],['1','50.0%']]);
  expect(parseFloat(card().querySelector('.bfb-fill').style.width)).toBe(50);expect(card().querySelector('a[href$="view=not_applicable"]').textContent).toBe('1 excluded / not applicable');expect(rows[2].status).toBe('addressed');
});
test('programs precede Priority overview and retain every configured framework',async()=>{
  await render([{key:'cis-ig1',implementation_group:3,label:'CIS Controls v8.1 IG3'},{key:'soc-2',label:'SOC 2'},{key:'iso-27001',label:'ISO 27001'}]);const layout=container.querySelector('.bd-grid');expect(layout.firstElementChild.getAttribute('aria-label')).toBe('Program condition');expect(layout.lastElementChild.id).toBe('client-priority-queue');expect([...layout.querySelectorAll('.bd-program h2')].map(n=>n.textContent)).toEqual(['CIS IG3 Status','SOC 2 Status','ISO 27001 Status']);expect(layout.querySelectorAll('[aria-label="Status comparison"]')).toHaveLength(3);
});
test.each(['hipaa','nist-csf-2'])('%s status and attention rows retain native filtered workspace destinations',async key=>{
  await render([{key,label:key}]);expectPopulation();expect([...card().querySelectorAll('.bfb-row')].map(a=>new URL(a.href).pathname)).toEqual(Array(4).fill('/compliance/'+key));expect([...card().querySelectorAll('.bd-gaps a')].map(a=>new URL(a.href).searchParams.get('view'))).toEqual(['unremediated','needs_attention','stale','unevidenced']);expect(card().querySelector('a[href$="view=not_applicable"]').textContent).toBe('1 excluded / not applicable');
});
