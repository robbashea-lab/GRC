import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Evidence from './Evidence';
import api from '@/lib/api';
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'a',currentClient:{name:'Test client'}})}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'owner',role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message}));
jest.mock('@/components/RecordDrawer',()=>()=>null);

test('evidence icon actions announce their purpose and exact file without changing behavior',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  api.get.mockResolvedValue({data:{items:[{client_id:'a',evidence_id:'e',filename:'Quarterly access review.txt',created_at:'2026-09-15T12:00:00Z'}],total:1,unfiltered_total:1,page_size:25,facets:{}}});
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  try {
    await act(async()=>root.render(<Evidence/>));
    for(const [id,label] of [['evidence-download-0','Download Quarterly access review.txt'],['evidence-delete-0','Delete Quarterly access review.txt']]) {
      const button=container.querySelector(`[data-testid="${id}"]`);
      expect(button.getAttribute('aria-label')).toBe(label);
      expect(button.getAttribute('title')).toBe(label);
    }
  } finally {await act(async()=>root.unmount());container.remove();jest.clearAllMocks();}
});
