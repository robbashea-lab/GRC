import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkProgramCard from '@/components/FrameworkProgramCard';
import FrameworkWorkspace from '@/pages/FrameworkWorkspace';
import {frameworkCatalog} from './frameworks';
import api from './api';

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'analyst',role:'super_admin'}})}));
jest.mock('./api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn()},formatError:e=>e.message}));
jest.mock('@/components/FrameworkDrawer',()=>()=>null);
let mockParams;
jest.mock('react-router-dom',()=>({Link:({to,children,...rest})=><a href={to} {...rest}>{children}</a>,
  useSearchParams:()=>require('react').useState(mockParams),useLocation:()=>({state:null}),useNavigate:()=>jest.fn()}),{virtual:true});
let root,container;
beforeEach(()=>{
  jest.useFakeTimers().setSystemTime(new Date('2026-10-05T12:00:00Z'));
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockReset();api.patch.mockReset();mockParams=new URLSearchParams();
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});

test.each(['existing-iso','new-multi-framework-client'])('ISO dashboard links preserve mixed-tab count-to-record equality for %s',async clientId=>{
  const fixture=[
    ['4.1','addressed',null,'2025-01-01',{evidence_count:0}],
    ['4.2','in_progress',null,'2026-09-01',{direct_findings:0,open_findings:1}],
    ['4.3','needs_attention',null,'2026-09-01',{direct_findings:1}],
    ['4.4','not_assessed',null,null,{}],
    ['A.5.1','addressed','included','2026-09-01',{evidence_count:1}],
    ['A.5.2','needs_attention','included','2026-09-01',{}],
    ['A.5.3','addressed','excluded','2025-01-01',{evidence_count:0}],
    ['A.5.4','not_assessed',null,null,{}],
    ['A.5.5','in_progress',null,'2026-09-01',{}],
  ];
  const definitions=frameworkCatalog('iso-27001').requirements.filter(d=>fixture.some(([id])=>id===d.id));
  const rows=definitions.map(d=>{const [,status,soa_applicability,last_assessed,work]=fixture.find(([id])=>id===d.id);
    return {...d,definition_id:d.id,framework_assessment_id:clientId+d.id,client_id:clientId,framework_key:'iso-27001',status,soa_applicability,last_assessed,work};});
  const data={configured:true,selected:true,definitions,assessments:[...rows,{...rows[0],client_id:'foreign',framework_assessment_id:'foreign',status:'needs_attention'}],
    work:Object.fromEntries(rows.map(r=>[r.framework_assessment_id,r.work])),organizational_controls:[],configuration:{}};
  const before=JSON.stringify(data);
  const cases=[['addressed',['4.1','A.5.1']],['in_progress',['4.2','A.5.5']],['needs_attention',['4.3','A.5.2']],
    ['not_assessed',['4.4','A.5.4']],['not_applicable',['A.5.3']],['unremediated',['4.2','A.5.2','A.5.5']],['stale',['4.1','A.5.3']],['unevidenced',['4.1','A.5.3']]];
  for(const [view,ids] of cases){
    await act(async()=>root.render(<FrameworkProgramCard program={{key:'iso-27001',to:'/compliance/iso-27001'}} rows={rows}/>));
    const link=[...container.querySelectorAll('a')].find(a=>new URL(a.href).searchParams.get('view')===view);
    expect(link).toBeDefined();expect(link.querySelector('strong').textContent).toBe(String(ids.length));
    mockParams=new URL(link.href).searchParams;
    api.get.mockImplementation(async path=>({data:path==='/iso-audit'?{reviews:[]}:data}));
    await act(async()=>root.render(<FrameworkWorkspace frameworkKey="iso-27001" clientId={clientId}/>));
    expect([...container.querySelectorAll('[data-testid^="requirement-"]')].map(el=>el.dataset.testid.replace('requirement-',''))).toEqual(ids);
    if(view==='not_applicable'){
      const search=container.querySelector('input[aria-label="Search requirements"]');
      const type=async value=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,value);search.dispatchEvent(new Event('input',{bubbles:true}));});
      await type('no-matching-control');
      expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(0);
      await type('A.5.3');
      expect([...container.querySelectorAll('[data-testid^="requirement-"]')].map(el=>el.dataset.testid)).toEqual(['requirement-A.5.3']);
    }
    expect(api.get).toHaveBeenCalledWith('/frameworks/iso-27001',expect.objectContaining({params:{client_id:clientId}}));
    expect(api.patch).not.toHaveBeenCalled();
  }
  expect(JSON.stringify(data)).toBe(before);
});
