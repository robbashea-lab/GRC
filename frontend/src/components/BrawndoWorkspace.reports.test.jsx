import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoWorkspace from './BrawndoWorkspace';

let mockUser;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,logout:jest.fn()})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'new-client',currentClient:{name:'New client'}})}));
jest.mock('@/context/ComplianceContext',()=>({useCompliance:()=>({items:[]})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:error=>error.message}));
jest.mock('./NotificationBell',()=>()=>null);
jest.mock('react-router-dom',()=>({Link:({to,children,onClick,...props})=><a href={to} onClick={event=>{event.preventDefault();onClick?.(event);}} {...props}>{children}</a>,useNavigate:()=>jest.fn(),useLocation:()=>({pathname:'/reports'})}),{virtual:true});
let root,node;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;mockUser={role:'client_readonly',name:'Reader'};node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();});
test('keyboard workspace search includes one authorized Reports link immediately before Evidence Library',async()=>{
  await act(async()=>root.render(<BrawndoWorkspace><div>Reports page</div></BrawndoWorkspace>));
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true})));
  const input=node.querySelector('input[type="search"]');expect(document.activeElement).toBe(input);
  const reports=node.querySelectorAll('#bwp-search-results a[href="/reports"]');expect(reports).toHaveLength(1);expect(reports[0].nextElementSibling.getAttribute('href')).toBe('/evidence');
  reports[0].focus();expect(document.activeElement).toBe(reports[0]);
  await act(async()=>reports[0].click());expect(node.querySelector('#bwp-search-results')).toBeNull();
});
test('unsupported roles are not offered a Reports workspace-search destination',async()=>{
  mockUser={...mockUser,role:'unknown'};await act(async()=>root.render(<BrawndoWorkspace><div>Page</div></BrawndoWorkspace>));
  await act(async()=>node.querySelector('input[type="search"]').focus());expect(node.querySelector('#bwp-search-results a[href="/reports"]')).toBeNull();expect(node.querySelector('#bwp-search-results a[href="/evidence"]')).toBeTruthy();
});
