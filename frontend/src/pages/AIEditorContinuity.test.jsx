import {questions,screeningScope} from '@/lib/aiOnboarding';
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
  await act(async()=>container.querySelector('.system-name').click());
  await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Open system record').click());
  await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Edit details').click());
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
    expect(!!container.querySelector('[data-testid="ai-register-first"]')).toBe(!loading);
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
  await act(async()=>container.querySelector('.archive-toggle input').click());
  const names=()=>[...container.querySelectorAll('.system-name strong')].map(node=>node.textContent);
  const expected=['AI continuity pending','Archived AI continuity'];expect(names()).toEqual(expected);
  for(const loading of [true,false]){
    mockOrg={...mockOrg,loading};await act(async()=>root.render(page()));
    expect(!!container.querySelector('[data-testid="ai-register-first"]')).toBe(!loading);
    if(loading){
      expect(container.querySelector('[data-presentation-state="pending"] [role="status"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="ai-system-search"]')).toBeNull();expect(names()).toEqual([]);
    }else{
      expect(container.querySelector('[data-testid="ai-system-search"]').value).toBe('continuity');
      expect(container.querySelector('[data-testid="ai-system-view-pending"]').getAttribute('aria-pressed')).toBe('true');
      expect(container.querySelector('.archive-toggle input').checked).toBe(true);expect(names()).toEqual(expected);
    }
  }
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('unsaved native intake choices survive appearance withdrawal and keep explicit versioned save errors',async()=>{
  await act(async()=>root.render(page()));
  const button=text=>[...container.querySelectorAll('button')].find(node=>node.textContent===text);
  await act(async()=>container.querySelector('.profile-button').click());
  await act(async()=>button('Not sure').click());
  await act(async()=>container.querySelector('.dialog-body .chip input').click());
  const indicator=container.querySelector('.dialog-body .chip').textContent;
  const intakeReads=api.get.mock.calls.filter(([path])=>path==='/ai-intake').length;
  for(const loading of [true,false]){
    mockOrg={...mockOrg,loading};await act(async()=>root.render(page()));
    expect(container.querySelector('[data-testid="appearance-status"]').textContent).toBe(loading?'none':'ai-governance');
    if(loading)expect(container.querySelector('.dialog-body fieldset').disabled).toBe(true);
  }
  expect(button('Not sure').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('.dialog-body .chip input').checked).toBe(true);
  expect(api.get.mock.calls.filter(([path])=>path==='/ai-intake')).toHaveLength(intakeReads);
  expect(api.post).not.toHaveBeenCalled();
  api.post.mockRejectedValueOnce(new Error('Intake save unavailable'));
  await act(async()=>button('Save profile').click());
  expect(api.post).toHaveBeenLastCalledWith('/ai-intake',expect.objectContaining({client_id:'demo_brawndo',usage:'unsure',indicators:[indicator],expected_updated_at:'intake-v1'}));
  expect(container.textContent).toContain('Intake save unavailable');expect(button('Not sure').getAttribute('aria-pressed')).toBe('true');
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'actor-two'}};await act(async()=>root.render(page()));
  expect(container.querySelector('.dialog-body')).toBeNull();
  await act(async()=>container.querySelector('.profile-button').click());
  expect(button('Yes').getAttribute('aria-pressed')).toBe('true');expect(container.querySelector('.dialog-body .chip input').checked).toBe(false);expect(container.textContent).not.toContain('Intake save unavailable');
});

test('transient context loss retains guided draft and blocks final Add without exposing legacy direct create',async()=>{
  await act(async()=>root.render(page()));
  await act(async()=>container.querySelector('[data-testid="new-ai-system"]').click());
  await act(async()=>container.querySelector('.picker-trigger').click());
  await act(async()=>container.querySelector('[role="option"]').click());
  const name=container.querySelector('.dialog-body input[maxlength="150"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(name,'Retained guided draft');name.dispatchEvent(new Event('input',{bubbles:true}));});
  mockOrg={...mockOrg,loading:true};await act(async()=>root.render(page()));
  expect(container.querySelector('[data-testid="ai-drawer"]')).toBeNull();
  expect(name.isConnected).toBe(true);expect(name.value).toBe('Retained guided draft');
  expect(container.querySelector('.dialog-body fieldset').disabled).toBe(true);
  mockOrg={...mockOrg,loading:false};await act(async()=>root.render(page()));
  expect(name.isConnected).toBe(true);expect(name.value).toBe('Retained guided draft');
  expect(container.querySelector('.dialog-body fieldset').disabled).toBe(false);
  expect(api.post).not.toHaveBeenCalled();
});

test('versioned screening requires confirmation and invalidates it when answers change back',async()=>{
  const get=api.get.getMockImplementation();
  const row={ai_system_id:'ai-one',client_id:'demo_brawndo',name:'AI continuity record',status:'active',data_types:['Public'],updated_at:'v1'};
  row.onboarding_screening={schema_version:1,catalog_version:'2026-10-25',answers:Object.fromEntries(questions.map(q=>[q.id,false])),scope:screeningScope(row),recorded_at:'original',recorded_by:'creator'};
  api.get.mockImplementation(path=>path==='/ai_systems'?Promise.resolve({data:[row]}):get(path));
  await openDirtyDrawer();
  const section=container.querySelector('[aria-label="Deployment screening review"]');
  expect(section.querySelectorAll('select')).toHaveLength(10);
  expect(container.querySelector('.aic-questions')).toBeNull();
  expect(container.querySelector('[aria-label="Product / Model"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Technical Owner"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Third-party product or service?"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Customer-facing use?"]')).not.toBeNull();
  const select=section.querySelector('select'),confirm=section.querySelector('input[type="checkbox"]');
  const choose=async value=>act(async()=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});
  const save=()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Save Changes');
  await choose('yes');await act(async()=>save().click());
  expect(api.patch).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Review the ten screening answers');
  await act(async()=>confirm.click());expect(confirm.checked).toBe(true);
  await choose('no');await choose('yes');expect(confirm.checked).toBe(false);
  await act(async()=>confirm.click());await act(async()=>save().click());
  expect(api.patch).toHaveBeenCalledTimes(1);
  const body=api.patch.mock.calls[0][1];
  expect(body.expected_updated_at).toBe('v1');
  expect(body.onboarding_screening).toEqual({schema_version:1,catalog_version:'2026-10-25',answers:{...row.onboarding_screening.answers,[questions[0].id]:true},reviewed:true});
});

test.each(['not-a-date','2026-02-30',42])('retained invalid review date %s does not crash the register',async next_review=>{
  const get=api.get.getMockImplementation();
  api.get.mockImplementation(path=>path==='/ai_systems'?Promise.resolve({data:[{ai_system_id:'ai-one',client_id:'demo_brawndo',name:'Retained AI',status:'active',next_review}]}):get(path));
  await act(async()=>root.render(page()));
  await act(async()=>container.querySelector('.system-name').click());
  expect(container.querySelector('.expanded-row').textContent).toContain('Not recorded');
});

test('a delayed linked record cannot open after its originating AI view closes',async()=>{
  const get=api.get.getMockImplementation();let finish;
  const risk={risk_id:'risk-one',client_id:'demo_brawndo',title:'Delayed Risk',status:'open'};
  api.get.mockImplementation(path=>path==='/related'?Promise.resolve({data:{risks:[risk]}}):path==='/risks/risk-one'?new Promise(resolve=>{finish=resolve;}):get(path));
  await act(async()=>root.render(page()));
  await act(async()=>container.querySelector('.system-name').click());
  await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Open system record').click());
  await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Linked risk').click());
  await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Open linked risk').click());
  await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Close').click());
  await act(async()=>finish({data:risk}));
  expect(container.textContent).not.toContain('Delayed Risk');
});

test('a retained owner missing from the directory is not reported as unassigned',async()=>{
  const get=api.get.getMockImplementation();
  api.get.mockImplementation(path=>path==='/ai_systems'?Promise.resolve({data:[{ai_system_id:'ai-one',client_id:'demo_brawndo',name:'Retained AI',status:'active',owner_id:'former-owner'}]}):get(path));
  await act(async()=>root.render(page()));
  expect(container.querySelector('.owner').textContent).toContain('Owner unavailable (former-owner)');
});
