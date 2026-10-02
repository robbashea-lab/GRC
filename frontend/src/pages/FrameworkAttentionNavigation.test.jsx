import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkProgramCard from '@/components/FrameworkProgramCard';
import FrameworkWorkspace from './FrameworkWorkspace';
import {loadClientDashboard} from '@/lib/loadClientDashboard';
import {frameworkCatalog} from '@/lib/frameworks';
import {socConfiguration} from '@/lib/socReadiness';
import api from '@/lib/api';

const mockUser={user_id:'analyst',role:'super_admin',workspace_mode:'demo'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn()},formatError:e=>e.message}));
jest.mock('@/components/FrameworkDrawer',()=>()=>null);
let mockParams;
jest.mock('react-router-dom',()=>({
  Link:({to,children,...rest})=><a href={to} {...rest}>{children}</a>,
  useSearchParams:()=>require('react').useState(mockParams),
  useLocation:()=>({pathname:'/compliance/soc-2',state:null}),useNavigate:()=>jest.fn(),
}),{virtual:true});
let root,container;
beforeEach(()=>{
  jest.useFakeTimers().setSystemTime(new Date('2026-10-02T12:00:00Z'));
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  mockParams=new URLSearchParams();api.get.mockReset();api.patch.mockReset();
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});

function frameworkData(clientId){
  const fixtures=[
    ['CC1.1','needs_attention','2026-09-01',{}],
    ['CC1.2','needs_attention','2026-09-01',{direct_findings:1,open_findings:1}],
    // A related Review's Finding does not track the criterion's implementation gap.
    ['CC1.3','in_progress','2025-09-01',{direct_findings:0,open_findings:1}],
    ['CC1.4','addressed','2025-01-01',{evidence_count:0}],
    // Exactly 365 days is not older than the existing freshness threshold.
    ['CC1.5','addressed','2025-10-02T12:00:00Z',{evidence_count:1}],
    ['CC2.1','not_assessed','2024-01-01',{}],
    ['A1.1','needs_attention','2024-01-01',{}],
  ];
  const definitions=frameworkCatalog('soc-2').requirements.filter(d=>fixtures.some(([id])=>d.id===id));
  const assessments=fixtures.map(([id,status,date])=>({definition_id:id,framework_assessment_id:clientId+id,framework_key:'soc-2',client_id:clientId,status,last_assessed:date}));
  return {configured:true,selected:true,definitions,assessments,configuration:socConfiguration(),organizational_controls:[],
    active_definition_ids:definitions.filter(d=>d.category==='security').map(d=>d.id),
    work:Object.fromEntries(fixtures.map(([id,,,work])=>[clientId+id,work]))};
}

test.each(['demo_prestige','new-soc-client'])('SOC attention links open exactly the displayed scoped records for %s',async clientId=>{
  const data=frameworkData(clientId),before=JSON.stringify(data);
  api.get.mockImplementation(async path=>({data:path==='/frameworks/soc-2'?data:path.endsWith('/members')?[]:
    path==='/onboarding/baseline'?{state:{completed:true}}:path==='/frameworks/summary'?{client_id:clientId,items:[]}:
    {contract_version:2,client_id:clientId,posture:{},groups:{},applicable_requirements:[{client_id:clientId,baseline_key:'soc-2',baseline_response:'applies'}]}}));
  const dashboard=await loadClientDashboard(api,{clientId,user:mockUser,scope:{kind:'org'},workQueue:true});
  const cases=[
    ['unremediated','Gaps without a Finding',['CC1.1','CC1.3'],'critical'],
    ['needs_attention','Not Implemented',['CC1.1','CC1.2'],'critical'],
    ['stale','Validation older than 12 months',['CC1.3','CC1.4'],'attention'],
    ['unevidenced','Implemented without evidence',['CC1.4'],'attention'],
  ];
  for(const [view,label,ids,tone] of cases){
    await act(async()=>root.render(<FrameworkProgramCard program={dashboard.programs[0]} rows={dashboard.programRows['soc-2']}/>));
    const link=container.querySelector(`.bd-gaps a[href="/compliance/soc-2?view=${view}"]`);
    expect(link).not.toBeNull();expect(link.querySelector('strong').textContent).toBe(String(ids.length));
    expect(link.classList.contains(`is-${tone}`)).toBe(true);expect(link.tabIndex).toBe(0);
    mockParams=new URL(link.href).searchParams;
    // The workspace must also reject a foreign row with a colliding definition ID.
    api.get.mockImplementation(async path=>({data:path.endsWith('/members')?[]:{...data,assessments:[...data.assessments,
      {...data.assessments[4],client_id:'another-client',framework_assessment_id:'foreign',status:'needs_attention'}]}}));
    await act(async()=>root.render(<FrameworkWorkspace frameworkKey="soc-2" clientId={clientId}/>));
    expect([...container.querySelectorAll('[data-testid^="requirement-"]')].map(row=>row.dataset.testid.replace('requirement-',''))).toEqual(ids);
    expect(container.querySelector('.bcis-crumbs').textContent).toContain(label);
    expect(api.get).toHaveBeenCalledWith('/frameworks/soc-2',expect.objectContaining({params:{client_id:clientId}}));
    expect(api.patch).not.toHaveBeenCalled();
  }
  expect(JSON.stringify(data)).toBe(before);
});
