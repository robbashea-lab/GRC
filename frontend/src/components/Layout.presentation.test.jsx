import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Layout from './Layout';

let mockPath='/clients';
const mockOrg={clients:[{client_id:'synthetic-client',name:'Unfamiliar client',status:'active'}],currentClientId:'synthetic-client',currentClient:{client_id:'synthetic-client',name:'Unfamiliar client'},loading:false,error:'',switchClient:jest.fn(),refresh:jest.fn()};
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'owner',role:'super_admin',name:'Native owner'},workspaceMode:'standard'})}));
jest.mock('@/context/ComplianceContext',()=>({ComplianceProvider:({children})=>children,useCompliance:()=>({items:[]})}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:false,default:{get:path=>Promise.resolve({data:path==='/dashboard'?{client_id:'synthetic-client',kpis:{}}:[]})},formatError:error=>error.message}));
jest.mock('@/preview/DemoNotice',()=>()=>null);
jest.mock('./NotificationBell',()=>()=>null);
jest.mock('./ClientSurface',()=>({children})=><div data-native-client-surface>{children}</div>);
jest.mock('./AdminSurface',()=>({children})=><div data-native-admin-surface>{children}</div>);
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:mockPath}),useNavigate:()=>jest.fn(),Outlet:()=> <div>Existing page</div>,Link:({to,children,...props})=><a href={to} {...props}>{children}</a>,NavLink:({to,children,end,...props})=><a href={to} {...props}>{children}</a>}),{virtual:true});

test('every protected route uses the same R4 shell and retains the native routed page',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div'),root=createRoot(container);
  document.body.appendChild(container);
  try{
    for(const route of ['/clients','/dashboard','/admin/clients','/clients/new','/account','/calendar','/clients']){
      mockPath=route;await act(async()=>root.render(<Layout/>));
      const shell=container.querySelector('.native-standard.app-shell');
      expect(shell).not.toBeNull();
      expect(shell.querySelector('.topbar')).not.toBeNull();
      expect(shell.querySelector('.main').textContent).toContain('Existing page');
      expect(shell.classList.contains('governara-portfolio-shell')).toBe(false);
      expect(shell.classList.contains('governara-operational-shell')).toBe(false);
      expect(!!container.querySelector('[data-native-admin-surface]')).toBe(route.startsWith('/admin/'));
    }
  }finally{await act(async()=>root.unmount());container.remove();}
  expect(document.documentElement.hasAttribute('data-native-standard')).toBe(false);
});
