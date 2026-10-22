import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Layout from './Layout';

let mockPath='/clients';
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'synthetic-client'})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{role:'super_admin'}})}));
jest.mock('@/context/ComplianceContext',()=>({ComplianceProvider:({children})=>children,useCompliance:()=>({items:[]})}));
jest.mock('@/lib/api',()=>({PREVIEW_MODE:false}));
jest.mock('@/preview/DemoNotice',()=>()=>null);
jest.mock('./BrawndoWorkspace',()=>({children})=><div>{children}</div>);
jest.mock('./ClientSurface',()=>({children})=><div>{children}</div>);
jest.mock('./AdminSurface',()=>({children})=><div>{children}</div>);
jest.mock('./BrawndoSidebar',()=>({__esModule:true,default:()=> <aside/>,BrawndoPlatformSidebar:()=> <aside/>}));
// Routing is a fixture here; follow the repository's virtual mocks rather than loading Router's runtime exports.
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:mockPath}),useNavigate:()=>jest.fn(),Outlet:()=> <div>Existing page</div>,NavLink:({children})=> <div>{children}</div>}),{virtual:true});

test('portfolio scenery is removed immediately on client, account, administration and nested-directory navigation',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div'),root=createRoot(container);
  try{
    for(const route of ['/clients','/dashboard','/admin/clients','/clients/new','/account','/calendar','/clients']){
      mockPath=route;await act(async()=>root.render(<Layout/>));
      const shell=container.querySelector('.app-shell');
      expect(shell.classList.contains('governara-portfolio-shell')).toBe(route==='/clients');
      expect(shell.classList.contains('governara-operational-shell')).toBe(route!=='/clients');
      expect(container.textContent).toContain('Existing page');
    }
  }finally{await act(async()=>root.unmount());}
});
