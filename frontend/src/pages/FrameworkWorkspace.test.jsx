import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkWorkspace from './FrameworkWorkspace';
import {cis} from '@/lib/frameworks';
import api from '@/lib/api';
let mockUser;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message}));
jest.mock('@/components/FrameworkDrawer',()=>({record,onNext})=><div data-testid="opened">{record.definition_id}<button onClick={onNext}>Next</button></div>);
jest.mock('react-router-dom',()=>({useSearchParams:()=>require('react').useState(new URLSearchParams()),Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
let root,container;
beforeEach(()=>{
 mockUser={user_id:'u',role:'super_admin'};
 global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 api.get.mockResolvedValue({data:{configured:true,selected:true,definitions:cis.requirements,assessments:cis.requirements.map((d,i)=>({framework_assessment_id:'a'+i,definition_id:d.id,client_id:'a',status:i===1?'not_assessed':'addressed'})),work:{}}});
});

test('only Brawndo Demo gets consistent filters, automatic result expansion and reset',async()=>{
 mockUser.workspace_mode='demo';
 const response=(await api.get()).data;
 response.assessments=response.assessments.map(a=>({...a,client_id:'demo_brawndo'}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="demo_brawndo"/>));
 expect(buttons('Partially Implemented')).toHaveLength(1);expect(buttons('In Progress')).toHaveLength(0);
 await act(async()=>buttons('Not Assessed')[0].click());
 expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(1);
 expect(container.textContent).toContain('Showing 1 of 56 safeguards');
 await act(async()=>buttons('Clear search and filters')[0].click());
 expect(buttons('Clear search and filters')).toHaveLength(0);
 const search=container.querySelector('[aria-label="Search safeguards"]');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'no-result');search.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(container.textContent).toContain('Showing 0 of 56 safeguards');
 expect(container.querySelector('a[href="/client-profile?tab=program"]')).toBeTruthy();
});

test('Brawndo can reopen last viewed implemented safeguard without changing next-work logic',async()=>{
 mockUser.workspace_mode='demo';const response=(await api.get()).data;
 response.assessments=response.assessments.map(a=>({...a,client_id:'demo_brawndo'}));
 sessionStorage.setItem('framework-workspace:u:demo_brawndo:cis-ig1',JSON.stringify({lastId:'a0'}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="demo_brawndo"/>));
 const back=[...container.querySelectorAll('button')].find(b=>b.textContent.startsWith('Return to last opened: 1.1'));
 expect(back).toBeTruthy();await act(async()=>back.click());expect(container.querySelector('[data-testid="opened"]').textContent).toContain('1.1');
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const buttons=label=>[...container.querySelectorAll('button')].filter(b=>b.textContent===label);
test('native groups start collapsed and expand/collapse all without changing assessment data',async()=>{
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="a"/>));
 expect(buttons('Expand')).toHaveLength(15);expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(0);
 await act(async()=>buttons('Expand all')[0].click());expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(56);
 await act(async()=>buttons('Needs Attention')[0].click());expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(1);
 expect(container.querySelector('[data-testid="requirement-1.2"]')).toBeTruthy();
 await act(async()=>buttons('All')[0].click());await act(async()=>buttons('Collapse all')[0].click());expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(0);
 await act(async()=>buttons('Continue Assessment')[0].click());expect(container.querySelector('[data-testid="opened"]').textContent).toContain('1.2');
 await act(async()=>buttons('Next')[0].click());expect(container.querySelector('[data-testid="opened"]').textContent).toContain('2.1');
 expect(JSON.parse(sessionStorage.getItem('framework-workspace:u:a:cis-ig1')).lastId).toBe('a2');
});
test('a mismatched client response cannot populate the workspace or resume selection',async()=>{
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="b"/>));
 expect(buttons('Expand')).toHaveLength(0);expect(container.textContent).toContain('No pending assessments');
});
