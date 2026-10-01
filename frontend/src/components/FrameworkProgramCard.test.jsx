import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ClientWorkDashboard from './ClientWorkDashboard';
jest.mock('react-router-dom',()=>({Link:({to,children,...rest})=><a href={to} {...rest}>{children}</a>}));
jest.mock('@/lib/api',()=>({formatError:e=>e.message}));
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const queue={as_of:'2026-09-27',groups:{all:{total:0,items:[]},pastDue:{total:0,items:[]},due30:{total:0,items:[]},unassigned:{total:0,items:[]}}};
const cisRows=[{status:'addressed',last_assessed:'2026-01-01',work:{evidence_count:1,latest_evidence_at:'2026-06-01'}},{status:'addressed'},{status:'in_progress'},
  {status:'needs_attention',work:{open_findings:0}},{status:'needs_attention',work:{finding_ids:['f'],open_findings:1}},{status:'not_assessed'},{status:'not_applicable'}];
const aside=()=>container.querySelector('.bd-aside').innerHTML;
// Approved Brawndo reference: the CIS IG1 programme card must not change while the shell is shared.
test('Brawndo CIS IG1 programme card is unchanged',async()=>{
  await act(async()=>root.render(<ClientWorkDashboard queue={queue} programs={[{key:'cis-ig1',label:'CIS Controls v8.1 IG1',name:'CIS Controls v8.1 IG1',to:'/compliance/cis-ig1'}]} cisRows={cisRows} filter="all" onFilter={()=>{}} onOpen={()=>{}} loadDetail={async()=>({})}/>));
  expect(container.querySelector('.bd-eyebrow').textContent).toBe('CIS IG1 program');
  expect(aside()).toMatchSnapshot();
});
const render=async programs=>act(async()=>root.render(<ClientWorkDashboard queue={queue} programs={programs} programRows={Object.fromEntries(programs.map(p=>[p.key,cisRows]))} filter="all" onFilter={()=>{}} onOpen={()=>{}} loadDetail={async()=>({})}/>));
test('SOC 2 uses the same card shell with SOC 2 vocabulary and workspace links',async()=>{
  await render([{key:'soc-2',label:'SOC 2',to:'/compliance/soc-2'}]);
  const card=container.querySelector('.bd-aside .bd-card');
  expect(container.querySelector('.bd-eyebrow').textContent).toBe('SOC 2 program');
  expect(card.querySelector('h2').textContent).toBe('SOC 2');
  expect(card.querySelector('.bd-donut')).not.toBeNull();
  expect(card.textContent).toContain('Addressed (Readiness)');
  expect(card.textContent).toContain('Addressed 2 of 6');
  expect(card.textContent).toContain('Internal readiness, not an auditor opinion.');
  expect(card.querySelector('.bd-gaps a[href="/compliance/soc-2?view=needs_attention"]').textContent).toContain('Needs remediation / validation');
  // Same structure as the approved CIS card: class list of every element is identical.
  const shape=el=>[...el.querySelectorAll('*')].map(e=>e.tagName+'.'+(e.className.baseVal??e.className));
  const soc=shape(card);
  await render([{key:'cis-ig1',label:'CIS Controls v8.1 IG1',name:'CIS Controls v8.1 IG1',to:'/compliance/cis-ig1'}]);
  expect(soc).toEqual(shape(container.querySelector('.bd-aside .bd-card')));
});
test('ISO 27001 uses the same shell; tab-scoped views are counts, not misleading links',async()=>{
  await render([{key:'iso-27001',label:'ISO/IEC 27001:2022',to:'/compliance/iso-27001'}]);
  const card=container.querySelector('.bd-aside .bd-card');
  expect(container.querySelector('.bd-eyebrow').textContent).toBe('ISO 27001 program');
  expect(card.querySelector('h2').textContent).toBe('ISO 27001');
  expect([...card.querySelectorAll('a')].map(a=>a.getAttribute('href'))).toEqual(['/compliance/iso-27001']);
  expect(card.querySelectorAll('.bd-gaps .bd-static')).toHaveLength(4);
  expect(card.textContent).not.toMatch(/Management Review|Objectives|Statement of Applicability|Internal Audit/);
});
