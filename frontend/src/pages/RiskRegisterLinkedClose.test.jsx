import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation,useNavigate} from 'react-router-dom';
import RiskRegister from './RiskRegister';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';
import {rememberClient} from '@/lib/clientSelection';

let mockAuth,mockOrg,mockDelayNavigation,mockCommitNavigation,mockNativeDrawer;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,API:'/api',default:{get:jest.fn(),patch:jest.fn(),post:jest.fn()},formatError:error=>error.message}));
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn(),info:jest.fn()}}));
jest.mock('react-router-dom',()=>{
  const actual=jest.requireActual('react-router-dom');
  return {...actual,useSearchParams:()=>{
    const [params,setParams]=actual.useSearchParams();
    return [params,(next,options)=>{
      // Hold only the URL commit: the native Close render still runs against the prior query.
      if(mockDelayNavigation)mockCommitNavigation=()=>setParams(next,options);
      else setParams(next,options);
    }];
  }};
});
jest.mock('@/components/RecordDrawer',()=>{
  const Actual=jest.requireActual('@/components/RecordDrawer').default;
  return function Drawer(props){
    return mockNativeDrawer?<Actual {...props}/>:<section data-testid="linked-risk" data-kind={props.kind} data-id={props.record.risk_id||props.record.task_id}>
      <button onClick={()=>props.onOpenChange(false)}>Close linked Risk</button>
    </section>;
  };
});

let root,host,risk,otherRisk,navigate;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function Harness(){
  const location=useLocation();navigate=useNavigate();
  return <><output data-testid="location">{location.pathname+location.search}</output><RiskRegister/></>;
}
const render=(entry='/risks?id=risk-a&client_id=demo_brawndo&view=all_active')=>act(async()=>root.render(<MemoryRouter initialEntries={[entry]}><Harness/></MemoryRouter>));
const refresh=()=>act(async()=>root.render(<MemoryRouter><Harness/></MemoryRouter>));
const click=node=>act(async()=>{expect(node).toBeTruthy();node.click();});
const linked=()=>host.querySelector('[data-testid="linked-risk"]');
const location=()=>host.querySelector('[data-testid="location"]').textContent;
const linkReads=()=>api.get.mock.calls.filter(([path])=>path==='/risks/risk-a');
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();rememberClient('demo_brawndo');
  mockAuth={workspaceMode:'demo',loading:false,user:{user_id:'linked-risk-actor',role:'super_admin',workspace_mode:'demo'}};
  const client={...cisClient('demo_brawndo'),name:'Brawndo'};
  mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false};
  mockDelayNavigation=false;mockCommitNavigation=null;mockNativeDrawer=false;
  risk={risk_id:'risk-a',client_id:'demo_brawndo',display_id:'RISK-001',title:'Existing recovery risk',description:'Synthetic recovery risk.',category:'operational',status:'open',likelihood_score:3,impact_score:4,source_type:'manual',treatment:'mitigate',review_cadence:'annual',next_review:'2099-01-01',updated_at:'2026-10-01T12:00:00Z'};
  otherRisk={...risk,risk_id:'risk-b',display_id:'RISK-002',title:'Existing other risk'};
  api.get.mockImplementation(async path=>({data:path==='/risks'?[risk,otherRisk]:path==='/risks/risk-a'?risk:path==='/risks/risk-b'?otherRisk:path==='/related'?{}:path==='/evidence/catalog'?{items:[],counts:{direct:0},total:0,page_size:25}:[]}));
  api.post.mockResolvedValue({data:{}});api.patch.mockResolvedValue({data:{...risk,updated_at:'2026-10-23T12:00:00Z'}});
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});

test('one Close cannot reopen the linked Risk while the old query remains in the close render',async()=>{
  await render();expect(linked().dataset.id).toBe('risk-a');expect(linkReads()).toHaveLength(1);
  mockDelayNavigation=true;
  await click(linked().querySelector('button'));
  expect(linked()).toBeNull();expect(linkReads()).toHaveLength(1);
  expect(location()).toContain('id=risk-a');
  await act(async()=>mockCommitNavigation());
  expect(location()).toBe('/risks?client_id=demo_brawndo&view=all_active');expect(linked()).toBeNull();
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('real router query removal closes once and deliberate later navigation can open the same Risk again',async()=>{
  await render();await click(linked().querySelector('button'));
  expect(linked()).toBeNull();expect(new URL(location(),'https://example.test').searchParams.has('id')).toBe(false);
  await act(async()=>navigate('/risks?id=risk-a&client_id=demo_brawndo'));
  expect(linked().dataset.id).toBe('risk-a');
});

test('ordinary row entry without an id query closes once without starting a linked read',async()=>{
  await render('/risks?client_id=demo_brawndo&view=all_active');
  await click([...host.querySelectorAll('tbody button')].find(button=>button.textContent==='Existing recovery risk'));
  expect(linked().dataset.id).toBe('risk-a');
  await click(linked().querySelector('button'));
  expect(linked()).toBeNull();expect(linkReads()).toHaveLength(0);
  expect(location()).toBe('/risks?client_id=demo_brawndo&view=all_active');
});

test.each(['resolve','reject'])('a dismissed pending linked read cannot %s back into the drawer or its error',async outcome=>{
  const pending=deferred(),original=api.get.getMockImplementation();
  api.get.mockImplementation((path,...args)=>path==='/risks/risk-a'?pending.promise:original(path,...args));
  await render();
  await click([...host.querySelectorAll('tbody button')].find(button=>button.textContent==='Existing other risk'));
  expect(linked().dataset.id).toBe('risk-b');
  expect(api.get.mock.calls.find(([path])=>path==='/risks/risk-a')[1].signal.aborted).toBe(true);
  mockDelayNavigation=true;await click(linked().querySelector('button'));
  await act(async()=>outcome==='resolve'?pending.resolve({data:risk}):pending.reject(new Error('Late linked failure')));
  expect(linked()).toBeNull();expect(host.textContent).not.toContain('Late linked failure');
  await act(async()=>mockCommitNavigation());expect(linked()).toBeNull();
});

test('an actor scope reset still resolves a fresh authorized link after clearing the old drawer',async()=>{
  await render();expect(linked().dataset.id).toBe('risk-a');
  const pending=deferred(),original=api.get.getMockImplementation();
  api.get.mockImplementation((path,...args)=>path==='/risks/risk-a'?pending.promise:original(path,...args));
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'fresh-authorized-actor'}};
  await refresh();expect(linked()).toBeNull();expect(linkReads()).toHaveLength(2);
  await act(async()=>pending.resolve({data:risk}));expect(linked().dataset.id).toBe('risk-a');
});

test.each(['client','actor','mode'])('a pending linked read cannot install the previous %s scope',async change=>{
  const pending=deferred(),original=api.get.getMockImplementation();let reads=0;
  api.get.mockImplementation((path,...args)=>path==='/risks/risk-a'&&++reads===1?pending.promise:original(path,...args));
  await render();
  if(change==='client')mockOrg={...mockOrg,currentClientId:'other-client',currentClient:{client_id:'other-client',name:'Other'},clients:[]};
  if(change==='actor')mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'other-actor'}};
  if(change==='mode')mockAuth={...mockAuth,workspaceMode:'standard',user:{...mockAuth.user,workspace_mode:'standard'}};
  // Subsequent requests remain pending so only the previous origin can resolve.
  api.get.mockImplementation((path,...args)=>path==='/risks/risk-a'?deferred().promise:original(path,...args));
  await refresh();await act(async()=>pending.resolve({data:risk}));expect(linked()).toBeNull();
});

test('wrong-client query and response retain native refusal rather than opening a record',async()=>{
  await render('/risks?id=risk-a&client_id=other-client');
  expect(linked()).toBeNull();expect(linkReads()).toHaveLength(0);expect(host.textContent).toContain('This link belongs to another client');
  api.get.mockImplementation(async path=>({data:path==='/risks/risk-a'?{...risk,client_id:'other-client'}:path==='/risks'?[risk]:[]}));
  await act(async()=>navigate('/risks?id=risk-a&client_id=demo_brawndo'));
  expect(linked()).toBeNull();expect(host.textContent).toContain('Record belongs to another client');
});

test('a row opening supersedes an unresolved linked read even if its transport resolves after cancellation',async()=>{
  const pending=deferred(),original=api.get.getMockImplementation();
  api.get.mockImplementation((path,...args)=>path==='/risks/risk-a'?pending.promise:original(path,...args));
  await render();await click([...host.querySelectorAll('tbody button')].find(button=>button.textContent==='Existing other risk'));
  expect(linked().dataset.id).toBe('risk-b');await act(async()=>pending.resolve({data:risk}));
  expect(linked().dataset.id).toBe('risk-b');
});

test.each(['risks','tasks'].flatMap(kind=>['resolve','reject'].map(outcome=>[kind,outcome])))('upcoming %s cancels a pending deep link before its opener settles, ignoring late %s',async(kind,outcome)=>{
  otherRisk.next_review=new Date().toISOString().slice(0,10);
  const task={task_id:'selected-task',client_id:'demo_brawndo',title:'Selected upcoming task',status:'open',due_date:otherRisk.next_review};
  const oldLink=deferred(),chosen=deferred(),original=api.get.getMockImplementation();
  const chosenPath=kind==='risks'?'/risks/risk-b':'/tasks/selected-task';
  api.get.mockImplementation((path,...args)=>path==='/risks/risk-a'?oldLink.promise:path===chosenPath?chosen.promise
    :path==='/related'?Promise.resolve({data:{tasks:kind==='tasks'?[task]:[]}}):original(path,...args));
  await render();
  const title=kind==='risks'?otherRisk.title:task.title;
  await click([...host.querySelectorAll('.qpt-coming button')].find(button=>button.textContent.includes(title)));
  expect(api.get.mock.calls.find(([path])=>path==='/risks/risk-a')[1].signal.aborted).toBe(true);
  await act(async()=>chosen.resolve({data:kind==='risks'?otherRisk:task}));
  expect(linked().dataset).toMatchObject({kind,id:kind==='risks'?'risk-b':'selected-task'});
  await act(async()=>outcome==='resolve'?oldLink.resolve({data:risk}):oldLink.reject(new Error('Late deep-link failure')));
  expect(host.querySelectorAll('[data-testid="linked-risk"]')).toHaveLength(1);
  expect(linked().dataset).toMatchObject({kind,id:kind==='risks'?'risk-b':'selected-task'});
  expect(host.textContent).not.toContain('Late deep-link failure');
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('native dirty Close Cancel retains its draft; Discard closes once despite delayed URL cleanup',async()=>{
  mockNativeDrawer=true;await render();
  let drawer=document.querySelector('[data-testid="risks-drawer"]');expect(drawer).toBeTruthy();
  const title=drawer.querySelector('[aria-label="Title"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'Unsaved recovery draft');title.dispatchEvent(new Event('input',{bubbles:true}));});
  const footerClose=()=>[...drawer.querySelectorAll('button')].filter(button=>button.textContent==='Close').at(-1);
  mockDelayNavigation=true;await click(footerClose());
  let discard=document.querySelector('[role="alertdialog"]');expect(discard).toBeTruthy();
  await click([...discard.querySelectorAll('button')].find(button=>button.textContent==='Keep editing'));
  expect(title.value).toBe('Unsaved recovery draft');expect(location()).toContain('id=risk-a');expect(mockCommitNavigation).toBeNull();
  await click(footerClose());discard=document.querySelector('[role="alertdialog"]');
  await click([...discard.querySelectorAll('button')].find(button=>button.textContent==='Discard changes'));
  expect(document.querySelector('[data-testid="risks-drawer"]')).toBeNull();
  await act(async()=>mockCommitNavigation());expect(document.querySelector('[data-testid="risks-drawer"]')).toBeNull();
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('a changed linked id cannot replace an already open native dirty draft',async()=>{
  mockNativeDrawer=true;await render();
  const title=document.querySelector('[data-testid="risks-drawer"] [aria-label="Title"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'Keep this unsaved draft');title.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>navigate('/risks?id=risk-b&client_id=demo_brawndo'));
  expect(title.isConnected).toBe(true);expect(title.value).toBe('Keep this unsaved draft');
  expect(api.get.mock.calls.some(([path])=>path==='/risks/risk-b')).toBe(false);
  expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});
