import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import DashboardPrograms from './DashboardPrograms';
import api from '@/lib/api';
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message}));
jest.mock('react-router-dom',()=>({Link:({to,children,...rest})=><a href={to} {...rest}>{children}</a>}),{virtual:true});
let root,container;
const program={key:'cis-ig1',label:'CIS IG1',to:'/compliance/cis-ig1',trackingAvailable:true,progress:40,assessment:{total:5,unrecognized_status_count:0,
  assessment_progress:{total:5,resolved:2,valid_na:1,invalid_na:0,percent:40},status_counts:{addressed:1,in_progress:1,not_assessed:1,needs_attention:1,not_applicable:1},ongoing:{total:1,counts:{past_due:1,due_soon:0,current:0,unscheduled:0},next:{id:'r',title:'Access Review',kind:'reviews',due_date:'2026-01-01'}}}};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);api.get.mockReset();});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('status counts retain scoped supporting records and overdue opens the authoritative Review',async()=>{
  const open=jest.fn();api.get.mockResolvedValue({data:{client_id:'a',total:1,items:[{id:'assessment-1',definition_id:'1.1',title:'Inventory',status:'addressed',kind:'framework_assessments'}]}});
  await act(async()=>root.render(<DashboardPrograms clientId="a" programs={[program]} onOpen={open}/>));
  expect(container.textContent).toContain('Needs Attention');
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Implemented1').click());
  const dialog=document.querySelector('[role="dialog"]');
  expect(api.get.mock.calls.at(-1)[1].params).toMatchObject({client_id:'a',program:'cis-ig1',detail:'addressed',offset:0,limit:25});
  expect(dialog.textContent).toContain('Assessment progress, not a compliance determination');
  expect(dialog.textContent).not.toMatch(/Resolved means|denominator|calculat|partial credit/);
  expect(dialog.querySelector('a[href="/compliance/cis-ig1?assessment=assessment-1"]')).not.toBeNull();
  api.get.mockResolvedValue({data:{client_id:'a',total:1,items:[{id:'review-1',title:'Access Review',kind:'reviews',status:'overdue',due_date:'2026-01-01'}]}});
  await act(async()=>[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Past Due (1)').click());
  expect(api.get.mock.calls.at(-1)[1].params).toMatchObject({client_id:'a',program:'cis-ig1',detail:'past_due',limit:25});
  await act(async()=>[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Access Review · 2026-01-01').click());
  expect(open).toHaveBeenCalledWith(expect.objectContaining({id:'review-1',kind:'reviews',key:'reviews:review-1:due'}));
});
test.each([false,true])('metrics retain resolved and assessed values without calculation explanations (reference=%s)',async reference=>{
  await act(async()=>root.render(<DashboardPrograms clientId="a" programs={['cis-ig1','iso-27001','soc-2'].map(key=>({...program,key,to:`/compliance/${key}`}))} onOpen={()=>{}} reference={reference}/>));
  expect(container.textContent).not.toMatch(/How is this calculated|including documented|incl\.|denominator|N\/A/);
  for(const key of ['cis-ig1','iso-27001','soc-2']){
    const card=container.querySelector(`[data-testid="program-${key}"]`),metrics=[...card.querySelectorAll('.assessment-metric')];
    expect(metrics.map(m=>m.querySelector('strong').textContent)).toEqual(['40%','80%']);
    expect(metrics.map(m=>m.querySelector('dd > span').textContent)).toEqual(['2 of 5','4 of 5']);
    expect(metrics[0].querySelector('dt').textContent).toBe(key==='iso-27001'?'Assessment progress':'Reviewed & Addressed');
    expect(card.textContent).toContain(key==='soc-2'?'Internal readiness, not an auditor opinion.':'Assessment progress, not a compliance determination.');
    expect(card.querySelector('.assessment-metrics a, .assessment-metrics button')).toBeNull();
    if(!reference)expect(card.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('40');
  }
  expect(api.get).not.toHaveBeenCalled();
});
test('empty assessment scope avoids a misleading zero percentage',async()=>{
  const empty={...program,progress:null,assessment:{...program.assessment,total:0,assessment_progress:{total:0,resolved:0,valid_na:0,invalid_na:0,percent:null},ongoing:{total:0,counts:{}}}};
  await act(async()=>root.render(<DashboardPrograms clientId="a" programs={[empty]} onOpen={()=>{}}/>));
  expect(container.textContent).toContain('Setup Required');
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
});
test('foreign response is rejected instead of displaying assessment data',async()=>{
  api.get.mockResolvedValue({data:{client_id:'b',items:[{title:'Private assessment'}]}});
  await act(async()=>root.render(<DashboardPrograms clientId="a" programs={[program]} onOpen={()=>{}}/>));
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Implemented1').click());
  expect(document.querySelector('[role="alert"]').textContent).toContain('another client');
  expect(document.body.textContent).not.toContain('Private assessment');
});
