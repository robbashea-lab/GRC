import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import RecordListPage from './RecordListPage';
import ActionItems from './ActionItems';
import RiskRegister from './RiskRegister';
import VendorRegister from './VendorRegister';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';
import {cisClientProgram} from '@/lib/cisExperience';
import {brawndoFullRecordEligible} from '@/lib/brawndoFullRecord';
import {frameworkCatalog} from '@/lib/frameworks';
import {rememberClient} from '@/lib/clientSelection';

let mockAuth,mockOrg,mockRecords,mockReadError='',mockPendingRead=null,mockNativeDrawer=null;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn(),put:jest.fn(),delete:jest.fn()},
  formatError:error=>error.message,API:'/api',PREVIEW_MODE:false}));
// Exercise the native route/controller's typed record delivery without opening
// an unrelated editor; editor persistence has its own native workflow suites.
jest.mock('@/components/RecordDrawer',()=>({__esModule:true,default:props=>{
  if(!props.open)return null;
  mockNativeDrawer=props;
  return <button type="button" data-testid="delivered-native-record" onClick={()=>props.onOpenChange(false)}>Close native record</button>;
}}));

const modules=[
  {name:'Reviews',path:'/reviews',collection:'reviews',element:<RecordListPage kind="reviews"/>,
    chart:'.crr-root .v3-quarter-ledger',period:'.v3-quarter-switch b',agenda:'.tl2-lists .tl-item',markers:'.ql-point',
    cards:'.crr-root [data-native-summary]',register:'.crr-root > section.register',savedDay:12,savedLane:'annual',total:1,
    overdue:true,unavailable:'Review dates unavailable.',pending:'.bdr-empty[role="status"]',denied:'.bdr-empty[role="alert"]'},
  {name:'Actions',path:'/action-items',collection:'tasks',element:<ActionItems/>,
    chart:'.cia-page .v3-quarter-ledger',period:'.v3-quarter-switch b',agenda:'.tl2-lists .tl-item',markers:'.ql-point',
    cards:'.cia-page [data-native-summary]',register:'.bda-table-scroll',savedDay:13,savedLane:'medium',total:1,
    overdue:true,unavailable:'Action deadlines unavailable.',pending:'.bda-results [role="status"]',denied:'.bda-results [role="status"]'},
  {name:'Risks',path:'/risks',collection:'risks',element:<RiskRegister/>,
    chart:'.cis-risks-concept .v3-quarter-ledger',period:'.v3-quarter-switch b',agenda:'.tl2-lists .tl-item',markers:'.ql-point',
    cards:'.cis-risks-concept [data-native-summary]',register:'.cis-risks-concept > section.register',matrix:'.cis-risks-concept .matrix-panel',
    savedDay:14,savedLane:'review',total:1,overdue:true,loadingFrame:'[data-testid="risks-navigation-loading"]'},
  {name:'Vendors',path:'/vendors',collection:'vendors',element:<VendorRegister/>,
    chart:'.cv-overview .v3-quarter-ledger',period:'.v3-quarter-switch b',agenda:'.tl2-lists .tl-item',markers:'.ql-point',
    cards:'[aria-label="Vendor summaries"]',register:'[aria-label="Vendor register"]',loadingFrame:'[data-testid="vendors-navigation-loading"]',
    savedDay:15,savedLane:'rev',total:2,overdue:true},
];
let root,container,actorSequence=0;
// Mocked hook values need a fresh element to rerender; keep the same mounted route/controller.
const mount=module=>act(async()=>root.render(<MemoryRouter initialEntries={[`${module.path}?client_id=${mockOrg.currentClientId}`]}>{React.cloneElement(module.element)}</MemoryRouter>));
const click=node=>{expect(node).toBeDefined();expect(node).not.toBeNull();return act(async()=>node.click());};
const chart=module=>container.querySelector(module.chart);
function requiredNode(parent,selector){
  const nodes=parent.querySelectorAll(selector);expect(nodes).toHaveLength(1);return nodes[0];
}
const requiredChart=module=>requiredNode(container,module.chart);
const period=module=>requiredNode(requiredChart(module),module.period).textContent;
const eventTitle=module=>'Retained native '+module.name.slice(0,-1);
function expectSavedMarker(module){
  const overview=requiredChart(module),stamp=new Date(2028,3,module.savedDay).getTime();
  const marker=requiredNode(overview,`[data-k="${module.savedLane}|${stamp}"]`);
  expect(marker.dataset.count).toBe('1');expect(marker.dataset.state).toBe('overdue');
  expect(marker.getAttribute('aria-label')).toContain(`Apr ${module.savedDay}, 2028`);
  expect(overview.querySelector('.vd tbody').textContent).toContain(eventTitle(module));
  return marker;
}
async function expectNativeRecordOpens(module){
  if(!['Actions','Vendors'].includes(module.name))return;
  mockNativeDrawer=null;
  const marker=expectSavedMarker(module);
  await act(async()=>marker.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  const choice=[...requiredChart(module).querySelectorAll('.v3-ledger-tip button')].find(node=>node.textContent.includes(eventTitle(module)));
  expect(choice).toBeTruthy();
  await act(async()=>jest.advanceTimersToNextTimer());expect(document.activeElement).toBe(choice);
  await click(choice);
  expect(mockNativeDrawer).not.toBeNull();
  expect(mockNativeDrawer.kind).toBe(module.collection);
  expect(mockNativeDrawer.clientId).toBe(mockOrg.currentClientId);
  const id=module.name==='Actions'?'task_id':'vendor_id';
  expect(mockNativeDrawer.record[id]).toBe(module.name==='Actions'?'saved-action':'saved-vendor');
  expect(mockNativeDrawer.record.client_id).toBe(mockOrg.currentClientId);
  // Vendor delivery includes native derived deadline signals; every saved field
  // and the independent typed identity must still match the source record.
  expect(mockNativeDrawer.record).toMatchObject(mockRecords[module.collection][0]);
  await click(requiredNode(container,'[data-testid="delivered-native-record"]'));
  expect(container.querySelector('[data-testid="delivered-native-record"]')).toBeNull();
}
function expectNoSelectedQuarterEvents(module){
  const overview=requiredChart(module);
  expect(overview.querySelector('.ql-totals').dataset.total).toBe('0');
  expect(overview.querySelectorAll(module.markers)).toHaveLength(0);
  // Behind schedule stays available across quarter navigation; it is saved work, not a forecast.
  expect(overview.querySelector('.tl2-h[data-mode="overdue"]').textContent).toBe('Behind schedule · 1');
  expect(overview.querySelector('.tl2-lists').textContent).toContain(eventTitle(module));
}
function expectEmptyEvents(module){
  const overview=requiredChart(module);
  expect(overview.querySelectorAll(module.agenda)).toHaveLength(0);
  expect(overview.querySelectorAll(module.markers)).toHaveLength(0);
}
function expectUnavailable(module,error=''){
  if(module.loadingFrame){
    expect(chart(module)).toBeNull();
    const frame=requiredNode(container,module.loadingFrame);
    expect(frame.getAttribute('aria-busy')).toBe(String(!error));
    expect(requiredNode(frame,error?'[role="alert"]':'[role="status"]').textContent).toContain(error||`Loading ${module.collection}…`);
  }else{
    expectEmptyEvents(module);
    expect(requiredNode(requiredChart(module),'[role="status"]').textContent).toBe('Dates unavailable.');
    expect(requiredChart(module).querySelector('.ql-chart')).toBeNull();
    expect(requiredNode(container,error?module.denied:module.pending).textContent).toContain(error?(module.name==='Reviews'?'Reviews unavailable':'Tickets unavailable'):(module.name==='Reviews'?'Loading reviews…':'Loading authorized tickets…'));
  }
}
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
    result[key]=requiredNode(container,module[key]).outerHTML;
  }
  return result;
}
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();jest.setSystemTime(new Date('2028-04-18T12:00:00'));
  sessionStorage.clear();localStorage.clear();mockReadError='';mockPendingRead=null;mockNativeDrawer=null;configure('future-native-client');
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
  '%s uses the quarter ledger for an arbitrary IG%i %s client without changing protected surfaces',async(name,group,mode,module)=>{
    configure(`new-${module.collection}-${group}-${mode}`,group,mode);
    const before=JSON.stringify(mockRecords);await mount(module);
    expect(period(module)).toBe('Q2 2028');
    expect(container.querySelector('.compact-program-timeline')).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/'+module.collection,expect.objectContaining({params:expect.objectContaining({client_id:mockOrg.currentClientId})}));
    expect(mockOrg.clients).toHaveLength(1);expect(mockOrg.clients[0].client_id).not.toContain('brawndo');
    const protectedBefore=protectedMarkup(module);
    expect(requiredChart(module).querySelector('.ql-totals').dataset.total).toBe(String(module.total));
    expect(requiredChart(module).querySelector('.ql-totals').dataset.overdue).toBe('1');
    await click(requiredNode(requiredChart(module),'[aria-label="Previous quarter"]'));
    expect(period(module)).toBe('Q1 2028');expectNoSelectedQuarterEvents(module);
    expect(protectedMarkup(module)).toEqual(protectedBefore);
    await click([...requiredChart(module).querySelectorAll('button')].find(button=>button.textContent==='This quarter'));
    expect(period(module)).toBe('Q2 2028');
    const marker=expectSavedMarker(module);
    await act(async()=>marker.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
    const choice=[...requiredChart(module).querySelectorAll('.v3-ledger-tip button')].find(node=>node.textContent.includes(eventTitle(module)));
    expect(choice).toBeTruthy();
    await act(async()=>jest.advanceTimersToNextTimer());expect(document.activeElement).toBe(choice);
    await act(async()=>choice.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    expect(requiredChart(module).querySelector('.v3-ledger-tip')).toBeNull();expect(document.activeElement).toBe(marker);
    expect(requiredChart(module).querySelectorAll(module.agenda).length).toBeGreaterThan(0);
    expect(requiredChart(module).querySelector(module.agenda).textContent).toContain('Retained native '+name.slice(0,-1));
    await expectNativeRecordOpens(module);
    expect(protectedMarkup(module)).toEqual(protectedBefore);expect(JSON.stringify(mockRecords)).toBe(before);noWrites();
  },
);

test.each(modules)('$name retains common chart data through later CIS enrollment and resets only chart selection across IG changes',async module=>{
  const original=mockOrg.currentClient;
  mockOrg.currentClient={...original,onboarding_baseline:{completed:false,requirements:{}},cis_program:null,shared_programs:[]};mockOrg.clients=[mockOrg.currentClient];
  const retained=JSON.stringify(mockRecords);await mount(module);requiredChart(module);
  expect(period(module)).toBe('Q2 2028');
  expect(cisClientProgram(mockOrg.currentClient)).toBeNull();
  mockOrg.currentClient=cisClient(original.client_id,1);mockOrg.clients=[mockOrg.currentClient];await mount(module);
  expect(cisClientProgram(mockOrg.currentClient).implementationGroup).toBe(1);
  requiredChart(module);const protectedBefore=protectedMarkup(module);
  for(const group of [2,3]){
    await click(requiredNode(requiredChart(module),'[aria-label="Previous quarter"]'));
    expect(period(module)).toBe('Q1 2028');
    mockOrg.currentClient=cisClient(original.client_id,group);mockOrg.clients=[mockOrg.currentClient];await mount(module);
    expect(period(module)).toBe('Q2 2028');
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
    expect(chart(module)).toBeNull();
  }
  mockAuth=auth;mockOrg=org;await mount(module);requiredChart(module);noWrites();
});

test.each(modules)('$name cannot expose an old actor response while replacement native reads are pending',async module=>{
  await mount(module);requiredChart(module);
  let resolveRead;mockPendingRead=new Promise(resolve=>{resolveRead=resolve;});
  mockAuth={...mockAuth,user:{...mockAuth.user,user_id:'replacement-actor'}};
  await mount(module);
  expectUnavailable(module);
  expect(container.textContent).not.toContain('Retained native '+({reviews:'Review',tasks:'Action',risks:'Risk',vendors:'Vendor'}[module.collection]));
  mockPendingRead=null;
  await act(async()=>resolveRead({data:[]}));
  expectEmptyEvents(module);noWrites();
});

test.each(modules)('$name denied native data stays unavailable rather than showing stale saved chart events',async module=>{
  mockReadError='Synthetic native read denied';await mount(module);
  expectUnavailable(module,mockReadError);
  expect(container.textContent).toContain(mockReadError);noWrites();
});

test.each(modules.flatMap(module=>['hipaa','nist-csf-2'].flatMap(frameworkKey=>['demo','standard'].map(mode=>[module.name,frameworkKey,mode,module]))))(
  '%s uses common quarterly presentation for native %s %s records without granting CIS capability',async(name,frameworkKey,mode,module)=>{
    const clientId=`outside-${frameworkKey}-${mode}`;configure(clientId,1,mode);
    mockOrg.currentClient={client_id:clientId,name:'Synthetic outside-scope customer',status:'active',
      onboarding_baseline:{completed:true,requirements:{[frameworkKey]:'applies'}}};mockOrg.clients=[mockOrg.currentClient];
    const retained=JSON.stringify(mockRecords);
    await mount(module);requiredChart(module);
    expect(period(module)).toBe('Q2 2028');
    expectSavedMarker(module);
    expect(cisClientProgram(mockOrg.currentClient)).toBeNull();
    const recordContext={...mockAuth,...mockOrg,pathname:module.path,selectedClientId:clientId,clientId,record:mockRecords[module.collection][0]};
    expect(brawndoFullRecordEligible(recordContext)).toBe(true);
    expect(brawndoFullRecordEligible({...recordContext,record:{...recordContext.record,client_id:'foreign-client'}})).toBe(false);
    expect(container.textContent).toContain('Retained native '+({reviews:'Review',tasks:'Action',risks:'Risk',vendors:'Vendor'}[module.collection]));
    await expectNativeRecordOpens(module);
    expect(JSON.stringify(mockRecords)).toBe(retained);noWrites();
  },
);

const sharedClients=[
  ['demo_dunder','Dunder Mifflin','iso-27001','demo'],
  ['demo_prestige','Prestige Worldwide','soc-2','demo'],
  ...['iso-27001','soc-2','cmmc'].flatMap(frameworkKey=>['demo','standard'].map(mode=>[
    `future-${frameworkKey}-${mode}`,'Synthetic future customer',frameworkKey,mode,
  ])),
];
test.each(modules.flatMap(module=>sharedClients.map(([clientId,clientName,frameworkKey,mode])=>[
  module.name,clientId,frameworkKey,mode,module,clientName,
])))(
  '%s uses native saved dates for %s enrolled in %s in %s without changing records or protected surfaces',async(name,clientId,frameworkKey,mode,module,clientName)=>{
    configure(clientId,1,mode);
    mockOrg.currentClient={client_id:clientId,name:clientName,status:'active',
      onboarding_baseline:{completed:true,requirements:{[frameworkKey]:'applies'}},
      framework_settings:frameworkKey==='soc-2'?{'soc-2':{categories:['security','availability']}}:{},
      shared_programs:[{client_id:clientId,program_id:`${clientId}:${frameworkKey}`,framework_key:frameworkKey,
        version:frameworkCatalog(frameworkKey).version,selected:true}]};
    mockOrg.clients=[mockOrg.currentClient];
    const retained=JSON.stringify({client:mockOrg.currentClient,records:mockRecords});await mount(module);
    expect(period(module)).toBe('Q2 2028');
    expect(container.querySelector('.compact-program-timeline')).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/'+module.collection,expect.objectContaining({params:expect.objectContaining({client_id:clientId})}));
    expectSavedMarker(module);
    await expectNativeRecordOpens(module);
    const protectedBefore=protectedMarkup(module);
    await click(requiredNode(requiredChart(module),'[aria-label="Previous quarter"]'));
    expect(period(module)).toBe('Q1 2028');expectNoSelectedQuarterEvents(module);
    expect(protectedMarkup(module)).toEqual(protectedBefore);
    await click([...requiredChart(module).querySelectorAll('button')].find(button=>button.textContent==='This quarter'));
    expect(period(module)).toBe('Q2 2028');
    expectSavedMarker(module);
    expect(protectedMarkup(module)).toEqual(protectedBefore);
    expect(JSON.stringify({client:mockOrg.currentClient,records:mockRecords})).toBe(retained);noWrites();
  },
);
