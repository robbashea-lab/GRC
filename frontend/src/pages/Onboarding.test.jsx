import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Onboarding from './Onboarding';
import api from '@/lib/api';
import catalog from '@/lib/onboardingCatalog.json';
let mockState;
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'a',currentClient:{name:'Northstar'}})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'admin',role:'super_admin'}})}));
jest.mock('@/context/ComplianceContext',()=>({useCompliance:()=>({refresh:jest.fn()})}));
jest.mock('@/components/AIIntake',()=>()=>null);
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()},formatError:e=>e.message}));
jest.mock('react-router-dom',()=>({Link:({to,children,...props})=><a href={to} {...props}>{children}</a>}),{virtual:true});
let root,container;
const button=text=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent===text);
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  mockState={version:3,step:1,policies:{},requirements:{'cis-ig1':'does_not_apply'},reviews:[],completed:false};
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockImplementation(async path=>({data:path==='/onboarding/baseline'?{catalog,state:mockState}:{client:{client_id:'a',name:'Northstar'},people:{contacts:0,active_client_users:0,eligible_assignees_available:true},records:{reviews:[],policies:[],requirements:[],framework_assessments:[]}}}));
  api.post.mockImplementation(async(_,body)=>{mockState={...body.state,completed:!!body.finalize};return {data:mockState};});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('Policy step reports omissions immediately, blocks Next and accepts Unsure',async()=>{
  // A real partial draft keeps the saved Policy step (untouched drafts begin on Compliance).
  mockState.policies[catalog.policies[0].key]='unsure';
  await act(async()=>root.render(<Onboarding/>));
  expect(container.textContent).toContain('1 of 17 answered');
  await act(async()=>button('Next').click());
  expect(container.querySelector('[role="alert"]').textContent).toContain('each unanswered Policy');
  expect(document.activeElement.textContent).toBe('Yes');
  for(const group of container.querySelectorAll('[role="group"]')) await act(async()=>Array.from(group.querySelectorAll('button')).find(b=>b.textContent==='Unsure').click());
  expect(container.textContent).toContain('17 of 17 answered');
  await act(async()=>button('Next').click());
  expect(container.querySelector('h2').textContent).toBe('Recurring Reviews');
});
test('successful completion becomes a read-only baseline and operational handoff, not another wizard',async()=>{
  mockState.step=3;mockState.policies=Object.fromEntries(catalog.policies.map(p=>[p.key,'unsure']));
  await act(async()=>root.render(<Onboarding/>));
  expect(container.textContent).toContain('17 to create');
  await act(async()=>button('Complete onboarding').click());
  expect(container.querySelector('[data-testid="onboarding-handoff"]')).toBeTruthy();
  expect(button('Complete onboarding')).toBeUndefined();
  expect(container.textContent).toContain('View onboarding baseline');
  expect(container.querySelector('a[href="/dashboard"]')).toBeTruthy();
});
