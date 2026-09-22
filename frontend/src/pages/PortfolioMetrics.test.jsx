import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ClientDirectory from './ClientDirectory';
import api from '@/lib/api';
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn(),Link:({children})=>children}),{virtual:true});
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({switchClient:jest.fn()})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'u',role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message}));

test('client-row drills retain full populations beyond the old queue cap, including empty results',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;window.scrollTo=jest.fn();
  const item=(i,c='a')=>({key:'tasks:'+i+':due',entity_type:'task',entity_id:String(i),client_id:c,client_name:c,title:'Action '+i,type:'Action Item',due_date:'2026-11-01',status:'open',priority:'due_soon'});
  const overdue=Array.from({length:25},(_,i)=>({...item(i),due_date:'2026-09-01'})),future=[item(30)];
  const metrics={past_due:overdue,due_30d:future,due_31_90d:[],critical_high_open:[],critical_high_issues:[],significant_risks:[],unassigned:[]};
  api.get.mockImplementation(async path=>({data:path==='/users'?[]:{portfolio:{past_due:25,due_30d:0,due_31_90d:1,critical_high_open:0,unassigned:0,clients_requiring_attention:2,total_clients:3},
    metric_items:metrics,attention_queue:overdue.slice(0,15),clients:[{client_id:'a',name:'Alpha',program_status:'action_required',past_due:25,due_30d:1,critical_high_open:0,critical_high_issues:0,significant_risks:0,unassigned:0,metric_items:metrics},{client_id:'b',name:'Beta',program_status:'needs_attention'},{client_id:'c',name:'Gamma',program_status:'healthy'}]}}));
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  const click=async selector=>act(async()=>document.querySelector(selector).click());
  const close=async()=>act(async()=>document.querySelector('[data-testid="drill-dialog"] button').click());
  try {
    await act(async()=>root.render(<ClientDirectory/>));
    await click('[data-client-id="a"] [data-metric="due_30d"]');
    expect(document.querySelector('[data-testid="drill-dialog"]').textContent).toContain('Action 30');
    expect(document.querySelectorAll('[data-testid^="drill-row-"]')).toHaveLength(1);await close();
    await click('[data-client-id="a"] [data-metric="past_due"]');
    expect(document.querySelectorAll('[data-testid^="drill-row-"]')).toHaveLength(25);
    expect(document.querySelector('[data-testid="drill-dialog"]').textContent).toContain('Past Due — Alpha');
    expect([...document.querySelectorAll('[data-record-key]')].map(r=>r.dataset.recordKey).sort()).toEqual(overdue.map(r=>r.key).sort());await close();
    await click('[data-client-id="a"] [data-metric="unassigned"]');
    expect(document.querySelector('[data-testid="drill-dialog"]').textContent).toContain('No items contribute to this metric.');await close();
    expect(container.textContent).not.toContain('Needs Attention Across Clients');
    expect(container.querySelector('[data-testid="portfolio-cards"]')).toBeNull();
  } finally {await act(async()=>root.unmount());container.remove();jest.clearAllMocks();}
});
