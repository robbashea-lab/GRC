import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ClientDirectory from './ClientDirectory';
import api from '@/lib/api';
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn(),Link:({children})=>children}),{virtual:true});
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({switchClient:jest.fn()})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'u',role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message}));

test('31–90, complete drills, client-row metrics and both attention statuses use supplied populations',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;window.scrollTo=jest.fn();
  const item=(i,c='a')=>({key:'tasks:'+i+':due',entity_type:'task',entity_id:String(i),client_id:c,client_name:c,title:'Action '+i,type:'Action Item',due_date:'2026-11-01',status:'open',priority:'due_soon'});
  const overdue=Array.from({length:25},(_,i)=>({...item(i),due_date:'2026-09-01'})),future=[item(30)];
  const metrics={past_due:overdue,due_30d:[],due_31_90d:future,critical_high_open:[],unassigned:[]};
  api.get.mockImplementation(async path=>({data:path==='/users'?[]:{portfolio:{past_due:25,due_30d:0,due_31_90d:1,critical_high_open:0,unassigned:0,clients_requiring_attention:2,total_clients:3},
    metric_items:metrics,attention_queue:overdue.slice(0,15),clients:[{client_id:'a',name:'Alpha',program_status:'action_required',past_due:25,due_30d:0,critical_high_open:0,unassigned:0,metric_items:metrics},{client_id:'b',name:'Beta',program_status:'needs_attention'},{client_id:'c',name:'Gamma',program_status:'healthy'}]}}));
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  const click=async selector=>act(async()=>document.querySelector(selector).click());
  const close=async()=>act(async()=>document.querySelector('[data-testid="drill-dialog"] button').click());
  try {
    await act(async()=>root.render(<ClientDirectory/>));
    await click('[data-testid="card-due-31-90"]');
    expect(document.querySelector('[data-testid="drill-dialog"]').textContent).toContain('Action 30');
    expect(document.querySelectorAll('[data-testid^="drill-row-"]')).toHaveLength(1);await close();
    await click('[data-testid="card-past-due"]');expect(document.querySelectorAll('[data-testid^="drill-row-"]')).toHaveLength(25);await close();
    await click('[data-testid="client-past-due-0"]');expect(document.querySelector('[data-testid="drill-dialog"]').textContent).toContain('Past Due — Alpha');await close();
    await click('[data-testid="card-attention-clients"]');
    const text=document.querySelector('[data-testid="client-portfolio-table"]').textContent;
    expect(text).toContain('Alpha');expect(text).toContain('Beta');expect(text).not.toContain('Gamma');
  } finally {await act(async()=>root.unmount());container.remove();jest.clearAllMocks();}
});
