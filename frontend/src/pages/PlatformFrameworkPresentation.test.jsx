import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkWorkspace from './FrameworkWorkspace';
import {cis} from '@/lib/frameworks';
import api from '@/lib/api';

jest.mock('react-router-dom',()=>({useSearchParams:()=>require('react').useState(new URLSearchParams()),useLocation:()=>({state:null}),useNavigate:()=>jest.fn(),Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'reader',role:'client_user'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message}));
jest.mock('@/components/FrameworkDrawer',()=>({record})=><div data-testid="selected-assessment">{record.definition_id}</div>);

test('a newly onboarded authenticated client gets the shared CIS snapshot and navigation from its own records',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const clientId='future-client-with-no-presentation-configuration';
  const definitions=cis.requirements.filter(d=>d.implementation_group===1);
  const assessments=definitions.map((d,i)=>({framework_assessment_id:`future-${i}`,definition_id:d.id,client_id:clientId,status:i<32?'addressed':'not_assessed'}));
  api.get.mockImplementation(async path=>({data:path.endsWith('/members')?[]:{configured:true,selected:true,definitions,assessments,configuration:{implementation_group:1},work:{}}}));
  const container=document.createElement('div');document.body.appendChild(container);
  const root=createRoot(container);
  try{
    await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId={clientId}/>));
    expect(container.querySelector('.bd-donut-value').textContent).toBe('57.1%');
    expect(container.querySelector('.bwp-program-counts').textContent).toContain('Implemented32 of 56');
    expect(container.querySelector('[aria-label="Control filters"]')).not.toBeNull();
    await act(async()=>container.querySelector('[data-testid="control-row-1"]').click());
    await act(async()=>container.querySelector('[data-testid="requirement-1.1"]').click());
    expect(container.querySelector('[data-testid="selected-assessment"]').textContent).toBe('1.1');
    expect(api.get.mock.calls.some(([path,options])=>path==='/frameworks/cis-ig1'&&options.params.client_id===clientId)).toBe(true);
  }finally{await act(async()=>root.unmount());container.remove();}
});
