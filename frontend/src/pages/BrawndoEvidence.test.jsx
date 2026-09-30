import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Evidence from './Evidence';
import api from '@/lib/api';
let mockOrg={currentClientId:'demo_brawndo',currentClient:{name:'Brawndo'}};
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn(),Link:({children})=>children}),{virtual:true});
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'u',role:'super_admin',workspace_mode:'demo'}})}));
jest.mock('@/context/ComplianceContext',()=>({useCompliance:()=>({items:[],loading:false,error:''})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message}));
jest.mock('@/components/RecordDrawer',()=>()=>null);

async function mount(){
  global.IS_REACT_ACT_ENVIRONMENT=true;
  api.get.mockResolvedValue({data:{items:[{evidence_id:'e',filename:'Policy.pdf'}],total:1,unfiltered_total:1,page_size:5,program_counts:{}}});
  const node=document.createElement('div');document.body.appendChild(node);const root=createRoot(node);
  await act(async()=>root.render(<Evidence/>));
  return {node,done:async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();}};
}
test('Brawndo renders the themed header and keeps the folder-first landing',async()=>{
  mockOrg={currentClientId:'demo_brawndo',currentClient:{name:'Brawndo'}};
  const {node,done}=await mount();
  try{
    expect(node.querySelector('.bpage[data-theme]')).toBeTruthy();
    expect(node.querySelector('.bpage-head h1').textContent).toBe('Evidence Library');
    expect(node.querySelector('.bpage-eyebrow').textContent).toBe('Brawndo · Evidence repository');
    expect(node.querySelector('[data-testid="add-evidence"]').textContent).toContain('Add Evidence');
    expect(node.querySelectorAll('.evidence-folder')).toHaveLength(10);
    expect(node.textContent).toContain('Recent uploads');
    expect(node.querySelector('.bpage-tiles')).toBeNull();
  }finally{await done();}
});
test('other clients keep the standard page',async()=>{
  mockOrg={currentClientId:'demo_initech',currentClient:{name:'Initech'}};
  const {node,done}=await mount();
  try{
    expect(node.querySelector('.bpage')).toBeNull();
    expect(node.querySelector('h1').textContent).toBe('Evidence Library');
    expect(node.querySelectorAll('.evidence-folder')).toHaveLength(10);
  }finally{await done();}
});
