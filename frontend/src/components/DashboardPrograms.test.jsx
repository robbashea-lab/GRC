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
test('percentage explains exact resolution, counts drill to authoritative assessments and overdue opens Review',async()=>{
  const open=jest.fn();api.get.mockResolvedValue({data:{client_id:'a',total:1,items:[{id:'assessment-1',definition_id:'1.1',title:'Inventory',status:'addressed',kind:'framework_assessments'}]}});
  await act(async()=>root.render(<DashboardPrograms clientId="a" programs={[program]} onOpen={open}/>));
  expect(container.textContent).toContain('Needs Attention');
  await act(async()=>container.querySelector('button[aria-label]').click());
  const dialog=document.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain('2 resolved / 5 tracked requirements = 40%');
  expect(dialog.textContent).toContain('not certification or a determination of compliance');
  expect(dialog.querySelector('a[href="/compliance/cis-ig1?assessment=assessment-1"]')).not.toBeNull();
  await act(async()=>[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Past Due (1)').click());
  expect(api.get.mock.calls.at(-1)[1].params).toMatchObject({client_id:'a',program:'cis-ig1',detail:'past_due',limit:25});
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
  await act(async()=>container.querySelector('button[aria-label]').click());
  expect(document.querySelector('[role="alert"]').textContent).toContain('another client');
  expect(document.body.textContent).not.toContain('Private assessment');
});
