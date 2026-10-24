import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AIGovernance from './AIGovernance';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';
import {AdditionalSectionsProvider,useAdditionalSectionsAppearance} from '@/lib/brawndoAdditionalScope';

let mockAuth,mockOrg,container,root;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/clientSelection',()=>({selectedClient:()=>mockOrg.currentClientId}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:error=>error.message,API:'/api',PREVIEW_MODE:true}));
jest.mock('react-router-dom',()=>({Link:({children})=><span>{children}</span>,useLocation:()=>({pathname:'/ai-governance',search:''}),useNavigate:()=>jest.fn(),useSearchParams:()=>require('react').useState(new URLSearchParams())}),{virtual:true});
jest.mock('@/lib/recordUuid',()=>({recordUuid:()=> 'ai-continuity-intent'}));
// Keep the complete native editor; inline only its unrelated portal/focus container.
jest.mock('@/components/ui/dialog',()=>{
  const {forwardRef}=require('react');
  return {Dialog:({open,children})=>open?<>{children}</>:null,
    DialogContent:forwardRef(({children,className,'data-testid':testId},ref)=><section ref={ref} className={className} data-testid={testId}>{children}</section>),
    DialogTitle:forwardRef(({children,...props},ref)=><h2 ref={ref} {...props}>{children}</h2>),DialogDescription:({children})=><p>{children}</p>};
});

function AppearanceStatus(){
  const appearance=useAdditionalSectionsAppearance();
  return <output data-testid="appearance-status">{appearance?.surface||'none'}</output>;
}
const page=()=> <AdditionalSectionsProvider><AIGovernance/><AppearanceStatus/></AdditionalSectionsProvider>;
const drawerInput=()=>document.querySelector('[data-testid="ai-drawer"] [aria-label="Name"], [data-testid="ai-drawer"] [aria-label="Product / System Name"]');
async function openDirtyDrawer(){
  await act(async()=>root.render(page()));
  await act(async()=>container.querySelector('.baai-name').click());
  const input=drawerInput();
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Unsaved AI name');input.dispatchEvent(new Event('input',{bubbles:true}));});
  return input;
}

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();
  mockOrg={currentClientId:'demo_brawndo',currentClient:{...cisClient(),name:'Brawndo'},clients:[cisClient()],loading:false};
  mockAuth={workspaceMode:'demo',user:{user_id:'actor-one',workspace_mode:'demo',role:'super_admin'}};
  api.get.mockImplementation(async path=>({data:path==='/ai_systems'?[{ai_system_id:'ai-one',client_id:mockOrg.currentClientId,name:'AI continuity record',status:'active',data_types:['Public']}]:path==='/ai-intake'?{client_id:mockOrg.currentClientId,usage:'yes',indicators:[],updated_at:'intake-v1'}:path==='/related'?{}:[]}));
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('organization refresh withdraws appearance while retaining the native dirty drawer and draft',async()=>{
  const input=await openDirtyDrawer(),drawer=input.closest('[data-testid="ai-drawer"]');
  const listLoads=api.get.mock.calls.filter(([path])=>path==='/ai_systems').length;
  for(const loading of [true,false]){
    mockOrg={...mockOrg,loading};await act(async()=>root.render(page()));
    expect(!!container.querySelector('.baai-page:not([data-presentation-state="pending"])')).toBe(!loading);
    if(loading){expect(container.querySelector('[data-presentation-state="pending"] [role="status"]')).not.toBeNull();expect(container.querySelector('[data-presentation-state="pending"] [role="table"]')).toBeNull();}
    expect(container.querySelector('[data-testid="appearance-status"]').textContent).toBe(loading?'none':'ai-governance');
    expect(document.querySelector('[data-testid="ai-drawer"]')===drawer).toBe(true);
    expect(drawerInput().value).toBe('Unsaved AI name');
  }
  expect(api.get.mock.calls.filter(([path])=>path==='/ai_systems')).toHaveLength(listLoads);
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test.each(['actor','client'])('a true %s identity change closes the previous native draft',async change=>{
  const input=await openDirtyDrawer();
  if(change==='actor')mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'actor-two'}};
  else mockOrg={...mockOrg,currentClientId:'demo_other',currentClient:{client_id:'demo_other',name:'Other',status:'active'}};
  await act(async()=>root.render(page()));
  expect(input.isConnected).toBe(false);expect(document.querySelector('[data-testid="ai-drawer"]')).toBeNull();
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('additional search, native pending view and inactive selection survive appearance withdrawal with the same subset',async()=>{
  const get=api.get.getMockImplementation();
  api.get.mockImplementation(path=>path==='/ai_systems'?Promise.resolve({data:[
    {ai_system_id:'one',client_id:'demo_brawndo',name:'AI continuity pending',status:'active',approval_status:'pending_assessment'},
    {ai_system_id:'two',client_id:'demo_brawndo',name:'Other approved AI',status:'active',approval_status:'approved'},
    {ai_system_id:'three',client_id:'demo_brawndo',name:'Archived AI continuity',status:'retired',approval_status:'pending_assessment'},
  ]}):get(path));
  await act(async()=>root.render(page()));
  await act(async()=>{const input=container.querySelector('[data-testid="ai-system-search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'continuity');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>container.querySelector('[data-testid="ai-system-view-pending"]').click());
  await act(async()=>container.querySelector('.baai-summary input').click());
  const names=()=>[...container.querySelectorAll('.baai-name,.brawndo-ai-card h2')].map(node=>node.textContent);
  const expected=['AI continuity pending','Archived AI continuity'];expect(names()).toEqual(expected);
  for(const loading of [true,false]){
    mockOrg={...mockOrg,loading};await act(async()=>root.render(page()));
    expect(!!container.querySelector('.baai-page:not([data-presentation-state="pending"])')).toBe(!loading);
    if(loading){
      expect(container.querySelector('[data-presentation-state="pending"] [role="status"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="ai-system-search"]')).toBeNull();expect(names()).toEqual([]);
    }else{
      expect(container.querySelector('[data-testid="ai-system-search"]').value).toBe('continuity');
      expect(container.querySelector('[data-testid="ai-system-view-pending"]').getAttribute('aria-pressed')).toBe('true');
      expect(container.querySelector('.baai-summary input').checked).toBe(true);expect(names()).toEqual(expected);
    }
  }
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('unsaved native intake choices survive appearance withdrawal and keep explicit versioned save errors',async()=>{
  await act(async()=>root.render(page()));
  const button=text=>[...container.querySelectorAll('button')].find(node=>node.textContent===text);
  await act(async()=>button('Not sure').click());
  await act(async()=>container.querySelector('.baai-indicators button').click());
  const indicator=container.querySelector('.baai-indicators button').textContent;
  const intakeReads=api.get.mock.calls.filter(([path])=>path==='/ai-intake').length;
  for(const loading of [true,false]){
    mockOrg={...mockOrg,loading};await act(async()=>root.render(page()));
    expect(container.querySelector('[data-testid="appearance-status"]').textContent).toBe(loading?'none':'ai-governance');
    if(loading)expect(container.querySelector('[data-testid="ai-intake"]')).toBeNull();
  }
  expect(button('Not sure').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('.baai-indicators button').getAttribute('aria-pressed')).toBe('true');
  expect(api.get.mock.calls.filter(([path])=>path==='/ai-intake')).toHaveLength(intakeReads);
  expect(api.post).not.toHaveBeenCalled();
  api.post.mockRejectedValueOnce(new Error('Intake save unavailable'));
  await act(async()=>button('Save AI intake').click());
  expect(api.post).toHaveBeenLastCalledWith('/ai-intake',expect.objectContaining({client_id:'demo_brawndo',usage:'unsure',indicators:[indicator],expected_updated_at:'intake-v1'}));
  expect(container.textContent).toContain('Intake save unavailable');expect(button('Not sure').getAttribute('aria-pressed')).toBe('true');
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'actor-two'}};await act(async()=>root.render(page()));
  expect(button('Yes').getAttribute('aria-pressed')).toBe('true');expect(container.querySelector('.baai-indicators button').getAttribute('aria-pressed')).toBe('false');expect(container.textContent).not.toContain('Intake save unavailable');
});
