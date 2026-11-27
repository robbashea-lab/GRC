import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation,useNavigate} from 'react-router-dom';
import Dashboard from './Dashboard';
import {useOrg} from '@/context/OrgContext';
import {loadClientDashboard} from '@/lib/loadClientDashboard';
import {frameworkDashboardFixture} from '@/testUtils/frameworkDashboard';
import api from '@/lib/api';

jest.mock('@/context/OrgContext',()=>({useOrg:jest.fn()}));
const mockReader={user_id:'synthetic-reader',role:'client_readonly'};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({workspaceMode:'standard',user:mockReader})}));
jest.mock('@/lib/loadClientDashboard',()=>({loadClientDashboard:jest.fn()}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:error=>error.message}));
// The full profile/history/popovers are exercised in SharedFrameworkDashboard.test.jsx.
jest.mock('@/components/BrawndoDemoProgram',()=>({program})=><section data-testid="selected-native-program" data-program={program.framework_key}>{program.program_label}: {program.current.implemented} of {program.current.denominator}</section>);

let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);loadClientDashboard.mockReset();api.get.mockReset();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();localStorage.clear();sessionStorage.clear();});

function Navigation(){const location=useLocation(),navigate=useNavigate();return <><output data-testid="url">{location.pathname+location.search}</output><button onClick={()=>navigate(-1)}>Back</button><button onClick={()=>navigate(1)}>Forward</button><Dashboard/></>;}
function fixture(){
  const clientId='synthetic-mixed-dashboard';
  const fixtures=['iso-27001','soc-2'].map(key=>frameworkDashboardFixture(key,undefined,clientId));
  const client={...fixtures[1].client,onboarding_baseline:{completed:true,requirements:{'iso-27001':'applies','soc-2':'applies'}},
    shared_programs:fixtures.map(({source})=>({client_id:clientId,program_id:clientId+':'+source.framework.key,framework_key:source.framework.key,version:source.framework.version,selected:true}))};
  const queue={as_of:'2026-10-26',groups:Object.fromEntries(['all','pastDue','due30','unassigned'].map(key=>[key,{total:0,items:[]}]))};
  const programs=fixtures.map(({source})=>({id:clientId+':'+source.framework.key,key:source.framework.key,label:source.framework.label,implementation_position:source.implementation_position}));
  const metadata=Object.fromEntries(fixtures.map(({source})=>[source.framework.key,source]));
  const snapshot={members:[],programs,programMetadata:metadata,programSources:metadata,queue};
  useOrg.mockReturnValue({currentClientId:clientId,currentClient:client,clients:[client],loading:false});
  localStorage.setItem('grc_client_id',clientId);sessionStorage.setItem('grc_client_id',clientId);
  loadClientDashboard.mockResolvedValue(snapshot);
  api.get.mockImplementation(async(_path,{params})=>({data:{client_id:clientId,items:[],total:0,offset:params.offset,limit:params.limit,has_more:false}}));
  return {clientId,snapshot};
}

test('mixed Dashboard selection preserves client/work URL, native separate scores and Back/Forward history',async()=>{
  const {clientId}=fixture();
  await act(async()=>root.render(<MemoryRouter initialEntries={[`/dashboard?client_id=${clientId}&program=soc-2&work=due30`]}><Navigation/></MemoryRouter>));
  const selected=()=>host.querySelector('[data-testid=selected-native-program]');
  expect(selected().dataset.program).toBe('soc-2');expect(selected().textContent).toContain('of 38');
  const tab=()=>[...host.querySelectorAll('[role=tab]')].find(node=>node.textContent==='ISO 27001');
  await act(async()=>tab().dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));
  expect(selected().dataset.program).toBe('iso-27001');expect(selected().textContent).toContain('of 123');
  let url=new URL(host.querySelector('[data-testid=url]').textContent,'https://local.invalid');
  expect(url.searchParams.get('client_id')).toBe(clientId);expect(url.searchParams.get('work')).toBe('due30');expect(url.searchParams.get('program')).toBe('iso-27001');
  await act(async()=>[...host.querySelectorAll('button')].find(node=>node.textContent==='Back').click());
  expect(selected().dataset.program).toBe('soc-2');
  await act(async()=>[...host.querySelectorAll('button')].find(node=>node.textContent==='Forward').click());
  expect(selected().dataset.program).toBe('iso-27001');
  expect(loadClientDashboard).toHaveBeenCalledTimes(1);
  expect(host.querySelector('#bdd-work-heading').textContent).toBe('Priority work');
});

test('a foreign or unsupported URL program cannot open an unassigned posture',async()=>{
  const {clientId}=fixture();
  await act(async()=>root.render(<MemoryRouter initialEntries={[`/dashboard?client_id=${clientId}&program=foreign-program`]}><Navigation/></MemoryRouter>));
  const selected=host.querySelector('[data-testid=selected-native-program]');
  expect(selected.dataset.program).toBe('iso-27001');expect(selected.textContent).not.toContain('foreign-program');
  expect(host.querySelectorAll('[role=tab]')).toHaveLength(2);
});
