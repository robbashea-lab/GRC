import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ClientWorkDashboard from './ClientWorkDashboard';
jest.mock('react-router-dom',()=>({Link:({to,children,...rest})=><a href={to} {...rest}>{children}</a>}),{virtual:true});
jest.mock('@/lib/api',()=>({formatError:e=>e.message}));
let root,container;
beforeEach(()=>{jest.useFakeTimers().setSystemTime(new Date('2026-09-27T12:00:00Z'));global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});
const queue={as_of:'2026-09-27',groups:{all:{total:0,items:[]},pastDue:{total:0,items:[]},due30:{total:0,items:[]},unassigned:{total:0,items:[]}}};
const cisRows=[{status:'addressed',last_assessed:'2026-01-01',work:{evidence_count:1,latest_evidence_at:'2026-06-01'}},{status:'addressed'},{status:'in_progress'},
  {status:'needs_attention',work:{open_findings:0}},{status:'needs_attention',work:{finding_ids:['f'],open_findings:1}},{status:'not_assessed'},{status:'not_applicable'}];
const aside=()=>{
  const card=container.querySelector('.bd-aside').cloneNode(true);
  // Optional development instrumentation is not part of the approved UI contract.
  card.querySelectorAll('[data-ve-dynamic]').forEach(node=>node.replaceWith(...node.childNodes));
  card.querySelectorAll('*').forEach(node=>[...node.attributes].filter(a=>a.name.startsWith('x-')).forEach(a=>node.removeAttribute(a.name)));
  return card.innerHTML;
};
// All frameworks share the compact metrics and approved ring/status shell.
test('CIS IG1 programme card uses compact shared metrics',async()=>{
  await act(async()=>root.render(<ClientWorkDashboard queue={queue} programs={[{key:'cis-ig1',label:'CIS Controls v8.1 IG1',name:'CIS Controls v8.1 IG1',to:'/compliance/cis-ig1'}]} cisRows={cisRows} filter="all" onFilter={()=>{}} onOpen={()=>{}} loadDetail={async()=>({})}/>));
  expect(container.querySelector('.bd-eyebrow').textContent).toBe('CIS IG1 program');
  expect(aside()).toMatchSnapshot();
});
test('pilot distribution uses the same applicable counts without changing assessments',async()=>{
  await act(async()=>root.render(<ClientWorkDashboard workspacePilot queue={queue} programs={[{key:'cis-ig1',label:'CIS IG1'}]} cisRows={cisRows} filter="all" onFilter={()=>{}} onOpen={()=>{}}/>));
  const bar=container.querySelector('.bwp-program-bar');expect(bar.getAttribute('aria-label')).toContain('2 Implemented, 1 Partially Implemented, 2 Not Implemented, 1 Not Assessed');
  expect([...bar.children].reduce((sum,n)=>sum+parseFloat(n.style.width),0)).toBeCloseTo(100);
  expect(container.querySelectorAll('.bd-gaps a')).toHaveLength(4);expect(cisRows[6].status).toBe('not_applicable');
  expect(container.querySelector('.bd-donut-value').textContent).toBe('33.3%');
  expect(container.querySelector('circle.bd-seg-addressed').getAttribute('pathLength')).toBe('100');
  expect(parseFloat(container.querySelector('circle.bd-seg-addressed').getAttribute('stroke-dasharray'))).toBeCloseTo(100/3-.9);
});
const render=async programs=>act(async()=>root.render(<ClientWorkDashboard queue={queue} programs={programs} programRows={Object.fromEntries(programs.map(p=>[p.key,cisRows]))} filter="all" onFilter={()=>{}} onOpen={()=>{}} loadDetail={async()=>({})}/>));
test('donut segments expose calculated tooltips on focus without putting them on navigation labels',async()=>{
  await render([{key:'cis-ig1',label:'CIS Controls v8.1 IG1'}]);
  const segment=container.querySelector('circle.bd-seg-addressed');
  expect(segment.getAttribute('tabindex')).toBe('0');
  await act(async()=>segment.dispatchEvent(new FocusEvent('focusin',{bubbles:true})));
  expect(container.querySelector('[role=tooltip]').textContent).toBe('Implemented33.3% · 2 of 6 safeguards');
  expect(container.querySelector('.bd-legend a').hasAttribute('title')).toBe(false);
  await act(async()=>segment.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(container.querySelector('[role=tooltip]')).toBeNull();
});
test('SOC 2 uses the same card shell with SOC 2 vocabulary and workspace links',async()=>{
  await render([{key:'soc-2',label:'SOC 2',to:'/compliance/soc-2'}]);
  const card=container.querySelector('.bd-aside .bd-card');
  expect(container.querySelector('.bd-eyebrow').textContent).toBe('SOC 2 program');
  expect(card.querySelector('h2').textContent).toBe('SOC 2');
  expect(card.querySelector('.bd-donut')).not.toBeNull();
  expect(card.textContent).toContain('Partially Implemented');
  expect(card.textContent).toContain('Implemented33%2 of 6');
  expect(card.querySelector('.bd-program-note').textContent).toBe('Internal readiness, not an auditor opinion.');
  expect(card.querySelector('.bd-gaps a[href="/compliance/soc-2?view=needs_attention"]').textContent).toContain('Not Implemented');
  // Same structure as the approved CIS card: class list of every element is identical.
  const shape=el=>[...el.querySelectorAll('*')].map(e=>e.tagName+'.'+(e.className.baseVal??e.className));
  const soc=shape(card);
  await render([{key:'cis-ig1',label:'CIS Controls v8.1 IG1',name:'CIS Controls v8.1 IG1',to:'/compliance/cis-ig1'}]);
  expect(soc).toEqual(shape(container.querySelector('.bd-aside .bd-card')));
});
test('ISO 27001 uses the same shell and whole-program filtered destinations',async()=>{
  await render([{key:'iso-27001',label:'ISO/IEC 27001:2022',to:'/compliance/iso-27001'}]);
  const card=container.querySelector('.bd-aside .bd-card');
  expect(container.querySelector('.bd-eyebrow').textContent).toBe('ISO 27001 program');
  expect(card.querySelector('h2').textContent).toBe('ISO 27001');
  expect(card.querySelector('a[href="/compliance/iso-27001?dashboard=1&view=addressed"]')).not.toBeNull();
  expect(card.querySelectorAll('.bd-gaps a')).toHaveLength(4);
  // Detailed ISMS modules stay in their workspace.
  expect(card.textContent).not.toMatch(/Management Review|Objectives|Statement of Applicability|Internal Audit/);
});
test.each(['cis-ig1','iso-27001','soc-2'])('%s hides calculation explanations without changing progress or N/A counts',async key=>{
  await render([{key,label:key}]);
  const card=container.querySelector('.bd-aside .bd-card');
  expect(card.querySelector('details')).toBeNull();
  expect(card.textContent).not.toMatch(/How is this calculated|excluded from progress denominators/);
  expect([...card.querySelectorAll('.assessment-metric strong')].map(n=>n.textContent)).toEqual(['33%','83%']);
  expect([...card.querySelectorAll('.assessment-metric dd > span')].map(n=>n.textContent)).toEqual(['2 of 6','5 of 6']);
  expect(card.querySelector('.bd-legend li:last-child strong').textContent).toBe('1');
  expect(card.querySelector('.bd-program-note').textContent).toBe(key==='soc-2'?'Internal readiness, not an auditor opinion.':'Assessment progress, not a compliance determination.');
});
test.each([['no records',[]],['all N/A',[{status:'not_applicable'},{status:'not_applicable'}]]])('%s: readiness is not calculated rather than shown as 0%%',async(_,rows)=>{
  await act(async()=>root.render(<ClientWorkDashboard queue={queue} programs={[{key:'soc-2',label:'SOC 2',to:'/compliance/soc-2'}]} programRows={{'soc-2':rows}} filter="all" onFilter={()=>{}} onOpen={()=>{}} loadDetail={async()=>({})}/>));
  const card=container.querySelector('.bd-aside .bd-card');
  expect(card.querySelector('.bd-donut-value').textContent).toBe('—');
  expect(card.querySelector('[data-testid="readiness-empty"]').textContent).toBe('No applicable criteria yet: readiness not calculated.');
  expect(card.querySelector('.assessment-metrics')).toBeNull();
  expect(card.querySelector('details')).toBeNull();
  expect(card.querySelector('.bd-program-note').textContent).toBe('Internal readiness, not an auditor opinion.');
});
test('ISO donut and legend use the same applicable population as the percentage',async()=>{
  const rows=[{specification:'isms_clause',status:'addressed'},
    {specification:'annex_control',soa_applicability:'included',status:'not_assessed'},
    {specification:'annex_control',soa_applicability:'excluded',status:'addressed'}];
  await act(async()=>root.render(<ClientWorkDashboard queue={queue} programs={[{key:'iso-27001',label:'ISO 27001'}]} programRows={{'iso-27001':rows}} filter="all" onFilter={()=>{}}/>));
  const card=container.querySelector('.bd-aside .bd-card');
  expect(card.querySelector('.bd-donut-value').textContent).toBe('50%');
  expect(card.querySelector('circle.bd-seg-addressed').getAttribute('stroke-dasharray')).toBe('50 50');
  expect(card.querySelector('.bd-donut').getAttribute('aria-label')).toContain('1 Implemented');
  expect([...card.querySelectorAll('.bd-legend strong')].map(n=>n.textContent)).toEqual(['1','0','0','1','1']);
  expect(card.querySelector('.assessment-metrics').textContent).toContain('Implemented50%1 of 2');
  expect(rows[2].status).toBe('addressed');
});

test('programs precede Priority overview and retain every configured framework',async()=>{
  await render([{key:'cis-ig1',implementation_group:3,label:'CIS Controls v8.1 IG3'},{key:'soc-2',label:'SOC 2'},{key:'iso-27001',label:'ISO 27001'}]);
  const layout=container.querySelector('.bd-grid');
  expect(layout.firstElementChild.getAttribute('aria-label')).toBe('Program condition');
  expect(layout.lastElementChild.id).toBe('client-priority-queue');
  expect([...layout.querySelectorAll('.bd-program h2')].map(n=>n.textContent)).toEqual(['CIS IG3','SOC 2','ISO 27001']);
  expect(layout.querySelectorAll('.bd-program-progress .assessment-metrics')).toHaveLength(3);
});

test.each(['hipaa','nist-csf-2'])('%s retains static status and attention rows in the shared card',async key=>{
  await render([{key,label:key}]);
  const card=container.querySelector('.bd-program');
  expect(card.querySelectorAll('.bd-legend .bd-static')).toHaveLength(5);
  expect(card.querySelectorAll('.bd-gaps .bd-static')).toHaveLength(4);
  expect(card.querySelectorAll('.bd-legend a,.bd-gaps a')).toHaveLength(0);
  expect([...card.querySelectorAll('.bd-legend strong')].map(n=>n.textContent)).toEqual(['2','1','2','1','1']);
});
