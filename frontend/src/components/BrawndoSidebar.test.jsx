import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoSidebar,{sidebarCounts} from './BrawndoSidebar';
import api from '@/lib/api';
jest.mock('react-router-dom',()=>({NavLink:({to,children,className,...rest})=><a href={to} className={typeof className==='function'?className({isActive:to==='/dashboard'}):className} {...rest}>{children}</a>,useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()}}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClient:{name:'Brawndo'},currentClientId:'demo_brawndo'})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{name:'Demo',role:'super_admin'},logout:jest.fn()})}));
jest.mock('./NotificationBell',()=>()=>null);
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('badge counts come from the dashboard summary and zero counts show no badge',()=>{
  expect(sidebarCounts({kpis:{overdue_reviews:1,overdue_actions:2,significant_risks:0},posture:{vendorHealth:[{key:'assurance',total:3}]}})).toEqual({reviews:[1,'critical'],actions:[2,'critical'],risks:[0,'critical'],vendors:[3,'attention']});
});
test('grouped navigation, labelled badges and the shared theme preference',async()=>{
  localStorage.setItem('omnisciente:brawndo-dashboard-theme','dark');
  api.get.mockResolvedValue({data:{client_id:'demo_brawndo',kpis:{overdue_reviews:1,overdue_actions:2,significant_risks:1},posture:{vendorHealth:[]}}});
  await act(async()=>root.render(<BrawndoSidebar complianceItems={[{key:'cis-ig1',label:'CIS IG1',to:'/compliance/cis-ig1'}]} isInternal/>));
  expect([...container.querySelectorAll('.bsb-group > .bsb-group-label')].map(e=>e.textContent)).toEqual(['Work','Program','Client']);
  expect(container.querySelector('[aria-label="2 overdue action items"]').textContent).toBe('2');
  expect(container.querySelector('[data-testid="nav-vendors"] .bsb-badge')).toBeNull();
  expect(container.querySelector('[data-testid="nav-compliance-cis-ig1"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="nav-systems"]')).toBeNull();
  expect(container.querySelector('[data-testid="nav-contacts"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="nav-client-profile"]')).not.toBeNull();
  expect(container.querySelector('aside').dataset.theme).toBe('dark');
  expect(container.querySelector('.is-active').textContent).toContain('Dashboard');
});
