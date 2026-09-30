import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Evidence from './Evidence';
import api from '@/lib/api';
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'a',currentClient:{name:'Test client'}})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'owner',role:'super_admin'}})}));
jest.mock('@/context/ComplianceContext',()=>({useCompliance:()=>({items:[],loading:false,error:''})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message}));
jest.mock('@/components/RecordDrawer',()=>()=>null);

test('evidence icon actions announce their purpose and exact file without changing behavior',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  api.get.mockResolvedValue({data:{items:[{client_id:'a',evidence_id:'e',filename:'Quarterly access review.txt',created_at:'2026-09-15T12:00:00Z'}],total:1,unfiltered_total:1,page_size:25,facets:{}}});
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  try {
    await act(async()=>root.render(<Evidence/>));
    for(const [id,label] of [['evidence-download-0','Download Quarterly access review.txt']]) {
      const button=container.querySelector(`[data-testid="${id}"]`);
      expect(button.getAttribute('aria-label')).toBe(label);
      expect(button.getAttribute('title')).toBe(label);
    }
    expect(container.querySelector('[data-testid="evidence-delete-0"]')).toBeNull(); // Deletion stays in the item detail, not the browse landing page.
    expect(container.querySelectorAll('.evidence-folder')).toHaveLength(10);
    expect(container.textContent).not.toContain('Older than 12 months');
  } finally {await act(async()=>root.unmount());container.remove();jest.clearAllMocks();}
});

test('folders navigate to paged files with clickable breadcrumbs and scoped search',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const folder={area:'Reviews',key:'backup',label:'backup',path:'["Reviews","backup"]',count:1};
  api.get.mockResolvedValue({data:{items:[{evidence_id:'e',filename:'Restore test.txt'}],total:1,unfiltered_total:1,page_size:25,folder_counts:[folder],program_counts:{Reviews:1}}});
  const node=document.createElement('div');document.body.appendChild(node);const root=createRoot(node);
  const click=async text=>act(async()=>[...node.querySelectorAll('button')].find(b=>b.textContent===text).click());
  try{
    await act(async()=>root.render(<Evidence/>));
    await click('Reviews1 file');expect(node.textContent).toContain('Backup / Restore Reviews');
    await click('Backup / Restore Reviews1 file');
    expect(node.querySelector('[aria-current="page"]').textContent).toBe('Backup / Restore Reviews');
    const request=api.get.mock.calls.filter(([url])=>url==='/evidence/catalog').at(-1)[1].params;
    expect(JSON.parse(request.state).filters.folder_paths).toEqual([folder.path]);
    await click('Evidence Library');expect(node.querySelectorAll('.evidence-folder')).toHaveLength(10);
  }finally{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();}
});
