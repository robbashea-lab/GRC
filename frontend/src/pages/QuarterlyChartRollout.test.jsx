import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import RecordListPage from './RecordListPage';
import ActionItems from './ActionItems';
import RiskRegister from './RiskRegister';
import VendorRegister from './VendorRegister';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';
import {rememberClient} from '@/lib/clientSelection';

let mockAuth,mockOrg,mockRecords,mockReadError='',mockPendingRead=null;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),put:jest.fn(),delete:jest.fn()},
  formatError:error=>error.message,API:'/api',PREVIEW_MODE:false}));

const modules=[
  {name:'Reviews',path:'/reviews',collection:'reviews',element:<RecordListPage kind="reviews"/>,cards:'.bdr-kstrip',register:'.bdr-register'},
  {name:'Actions',path:'/action-items',collection:'tasks',element:<ActionItems/>,cards:'.bda-summary',register:'.bda-table-scroll'},
  {name:'Risks',path:'/risks',collection:'risks',element:<RiskRegister/>,cards:'.bdr-figures',register:'.register-table-frame',matrix:'.bdr-matrix-region'},
  {name:'Vendors',path:'/vendors',collection:'vendors',element:<VendorRegister/>,cards:'.bapv-kstrip',register:'[aria-label="Vendor register"]'},
];
let root,container,actorSequence=0;
// Mocked hook values need a fresh element to rerender; keep the same mounted route/controller.
const mount=module=>act(async()=>root.render(<MemoryRouter initialEntries={[`${module.path}?client_id=${mockOrg.currentClientId}`]}>{React.cloneElement(module.element)}</MemoryRouter>));
const click=node=>act(async()=>node.click());
const chart=()=>container.querySelector('.quarterly-program-timeline');
const noWrites=()=>{for(const verb of ['post','patch','put','delete'])expect(api[verb]).not.toHaveBeenCalled();};
function configure(clientId,group=1,mode='standard'){
  const client={...cisClient(clientId,group),name:'Synthetic future customer'};
  mockAuth={workspaceMode:mode,loading:false,error:'',user:{user_id:`quarter-actor-${++actorSequence}`,role:'super_admin',workspace_mode:mode,client_ids:[clientId]}};
  mockOrg={currentClientId:clientId,currentClient:client,clients:[client],loading:false,error:''};
  rememberClient(clientId);
  mockRecords={
    reviews:[{client_id:clientId,review_id:'saved-review',title:'Retained native Review',status:'upcoming',recurrence:'annual',due_date:'2028-04-12'}],
    tasks:[{client_id:clientId,task_id:'saved-action',title:'Retained native Action',status:'open',priority:'medium',source_type:'manual',due_date:'2028-04-13'}],
    findings:[],policies:[],
    risks:[{client_id:clientId,risk_id:'saved-risk',display_id:'RISK-001',title:'Retained native Risk',status:'assessed',likelihood_score:2,impact_score:3,next_review:'2028-04-14'}],
    vendors:[{client_id:clientId,vendor_id:'saved-vendor',name:'Retained native Vendor',status:'active',criticality:'low',next_review:'2028-04-15',contract_renewal:'2028-06-12',assurance_records:[]}],
  };
}
function protectedMarkup(module){
  const result={};
  for(const key of ['cards','register','matrix'])if(module[key]){
    const node=container.querySelector(module[key]);
    expect(node).not.toBeNull();result[key]=node.outerHTML;
  }
  return result;
}
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();jest.setSystemTime(new Date('2028-04-18T12:00:00'));
  sessionStorage.clear();localStorage.clear();mockReadError='';mockPendingRead=null;configure('future-native-client');
  api.get.mockImplementation(async path=>{
    const collection=path.slice(1);
    if(mockPendingRead&&Object.hasOwn(mockRecords,collection))return mockPendingRead;
    if(mockReadError&&Object.hasOwn(mockRecords,collection))throw new Error(mockReadError);
    if(path.endsWith('/members'))return {data:[{user_id:mockAuth.user.user_id,name:'Synthetic operator',status:'active',client_ids:[mockOrg.currentClientId],assignment_eligible:true}]};
    if(path==='/onboarding/state')return {data:{assessments:[]}};
    if(path==='/related')return {data:{tasks:[],reviews:[],risks:[],vendors:[],findings:[],policies:[]}};
    return {data:mockRecords[collection]||[]};
  });
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();jest.clearAllMocks();});

test.each(modules.flatMap(module=>[1,2,3].flatMap(group=>['demo','standard'].map(mode=>[module.name,group,mode,module]))))(
  '%s uses the quarterly chart for an arbitrary IG%i %s client without changing protected surfaces',async(name,group,mode,module)=>{
    configure(`new-${module.collection}-${group}-${mode}`,group,mode);
    const before=JSON.stringify(mockRecords);await mount(module);
    expect(chart()).not.toBeNull();expect(chart().querySelector('.qpt-year').textContent).toContain('Q2 2028');
    expect(container.querySelector('.compact-program-timeline')).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/'+module.collection,expect.objectContaining({params:expect.objectContaining({client_id:mockOrg.currentClientId})}));
    expect(mockOrg.clients).toHaveLength(1);expect(mockOrg.clients[0].client_id).not.toContain('brawndo');
    const protectedBefore=protectedMarkup(module);
    await click(chart().querySelector('[aria-label="Previous quarter"]'));
    expect(chart().querySelector('.qpt-year').textContent).toContain('Q1 2028');
    expect(chart().querySelectorAll('.qpt-coming button')).toHaveLength(0);
    expect(protectedMarkup(module)).toEqual(protectedBefore);
    await click([...chart().querySelectorAll('button')].find(button=>button.textContent==='This quarter'));
    expect(chart().querySelector('.qpt-year').textContent).toContain('Q2 2028');
    expect(chart().querySelectorAll('.qpt-coming button').length).toBeGreaterThan(0);
    expect(protectedMarkup(module)).toEqual(protectedBefore);expect(JSON.stringify(mockRecords)).toBe(before);noWrites();
  },
);

test.each(modules)('$name receives the chart after later CIS enrollment and resets only chart selection across retained IG changes',async module=>{
  const original=mockOrg.currentClient;
  mockOrg.currentClient={...original,onboarding_baseline:{completed:true,requirements:{'soc-2':'applies'}}};mockOrg.clients=[mockOrg.currentClient];
  const retained=JSON.stringify(mockRecords);await mount(module);expect(chart()).toBeNull();
  mockOrg.currentClient=cisClient(original.client_id,1);mockOrg.clients=[mockOrg.currentClient];await mount(module);
  expect(chart()).not.toBeNull();const protectedBefore=protectedMarkup(module);
  for(const group of [2,3]){
    await click(chart().querySelector('[aria-label="Previous quarter"]'));
    expect(chart().querySelector('.qpt-year').textContent).toContain('Q1 2028');
    mockOrg.currentClient=cisClient(original.client_id,group);mockOrg.clients=[mockOrg.currentClient];await mount(module);
    expect(chart().querySelector('.qpt-year').textContent).toContain('Q2 2028');
    expect(protectedMarkup(module)).toEqual(protectedBefore);
  }
  expect(JSON.stringify(mockRecords)).toBe(retained);noWrites();
});

test.each(modules)('$name withholds quarterly appearance while native identity or authorization is unresolved',async module=>{
  const auth=mockAuth,org=mockOrg;
  const cases=[
    ()=>{mockAuth={...auth,loading:true};},()=>{mockOrg={...org,loading:true};},
    ()=>{mockAuth={...auth,error:'Access denied'};},()=>{mockOrg={...org,error:'Access denied'};},
    ()=>{mockOrg={...org,currentClient:{...org.currentClient,client_id:'foreign'}};},
    ()=>{mockOrg={...org,clients:[]};},()=>{mockAuth={...auth,workspaceMode:'demo'};},
  ];
  for(const apply of cases){
    mockAuth=auth;mockOrg=org;apply();await mount(module);
    expect(chart()).toBeNull();
  }
  mockAuth=auth;mockOrg=org;await mount(module);expect(chart()).not.toBeNull();noWrites();
});

test.each(modules)('$name cannot expose an old actor response while replacement native reads are pending',async module=>{
  await mount(module);expect(chart()).not.toBeNull();
  let resolveRead;mockPendingRead=new Promise(resolve=>{resolveRead=resolve;});
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'replacement-actor'}};
  await mount(module);
  expect(chart()?.querySelectorAll('.qpt-coming button').length||0).toBe(0);
  expect(container.textContent).not.toContain('Retained native '+({reviews:'Review',tasks:'Action',risks:'Risk',vendors:'Vendor'}[module.collection]));
  mockPendingRead=null;
  await act(async()=>resolveRead({data:[]}));
  expect(chart()?.querySelectorAll('.qpt-coming button').length||0).toBe(0);noWrites();
});

test.each(modules)('$name denied native data stays unavailable rather than showing stale saved chart events',async module=>{
  mockReadError='Synthetic native read denied';await mount(module);
  expect(chart()?.querySelectorAll('.qpt-coming button').length||0).toBe(0);
  expect(container.textContent).toContain(mockReadError);noWrites();
});

test.each(modules.flatMap(module=>['demo_dunder','demo_prestige'].map(clientId=>[module.name,clientId,module])))(
  '%s leaves the current non-CIS %s native experience outside the quarterly rollout',async(name,clientId,module)=>{
    configure(clientId,1,'demo');
    mockOrg.currentClient={client_id:clientId,name:clientId==='demo_dunder'?'Dunder Mifflin':'Prestige Worldwide',status:'active',
      onboarding_baseline:{completed:true,requirements:{'iso-27001':'applies'}}};mockOrg.clients=[mockOrg.currentClient];
    await mount(module);expect(chart()).toBeNull();
    expect(container.textContent).toContain('Retained native '+({reviews:'Review',tasks:'Action',risks:'Risk',vendors:'Vendor'}[module.collection]));
    noWrites();
  },
);
