import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import AIGovernance from './AIGovernance';
import api from '@/lib/api';
import {cisClient} from '@/testUtils/cisExperience';
import {frameworkDashboardFixture} from '@/testUtils/frameworkDashboard';
import {sharedProgramProjection} from '@/preview/clientRelationships';
import {aiProjection,catalog} from '@/lib/aiGovernance';

let mockAuth, mockOrg, mockNativeProps, host, root;
jest.mock('@/context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('@/context/OrgContext', () => ({useOrg: () => mockOrg}));
jest.mock('@/lib/clientSelection', () => ({selectedClient: () => mockOrg.currentClientId}));
jest.mock('@/lib/api', () => ({__esModule: true, PREVIEW_MODE: true, API: '/api',
  default: {get: jest.fn(), post: jest.fn(), patch: jest.fn()}, formatError: error => error.message}));
jest.mock('react-router-dom', () => ({Link: ({children}) => <span>{children}</span>,
  useLocation: () => ({pathname: '/ai-governance', search: ''}), useNavigate: () => jest.fn(),
  useSearchParams: () => require('react').useState(new URLSearchParams())}), {virtual: true});
// Verify real page/register dispatch; complete native editor commands have their own retained suites.
jest.mock('@/components/AIDrawer', () => function NativeEditor(props) {
  mockNativeProps = props;
  const [value, setValue] = require('react').useState('Original native draft');
  return <input aria-label="Native AI editor" value={value} onChange={event => setValue(event.target.value)}/>;
});
jest.mock('@/components/AIOnboardingWizard', () => ({onClose}) => <aside data-testid="guided-AI-create"><button onClick={onClose}>Cancel guided draft</button></aside>);
jest.mock('@/components/AIRecordView', () => ({onClose}) => <aside data-testid="guided-AI-record"><button onClick={onClose}>Close guided record</button></aside>);
jest.mock('@/components/AIProfileDialog', () => ({onClose}) => <aside data-testid="guided-AI-profile"><button onClick={onClose}>Close AI profile</button></aside>);
jest.mock('@/components/AIIntake', () => ({useAIIntake: () => ({}), AIIntakeView: () => <aside data-testid="native-intake-editor"/>}));

const id = 'arbitrary-common-AI-client';
const row = {ai_system_id: 'existing-system', client_id: id, name: 'Existing native AI system', status: 'active'};
const lowScreening=Object.fromEntries(catalog.questions.map(question=>[question.key,!!question.protective]));
function projectedRow(record,nextReview,risks=[]) {
  const saved={...row,owner_id:'operator',screening:{...lowScreening},...record};
  const reviews=nextReview?[{client_id:id,ai_system_id:saved.ai_system_id,status:'not_started',due_date:nextReview}]:[];
  return aiProjection(saved,reviews,risks);
}
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockAuth = {workspaceMode: 'standard', user: {user_id: 'operator', role: 'super_admin'}, loading: false};
  mockNativeProps = null;
  api.get.mockImplementation(async path => ({data: path === '/ai_systems' ? [row]
    : path === '/ai-intake' ? {client_id: id, usage: 'yes', indicators: []} : []}));
  api.post.mockReset(); api.patch.mockReset();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); jest.clearAllMocks();});
const render = () => act(async () => root.render(<AIGovernance/>));
const click = node => act(async () => node.click());
function context(mode, framework, role = 'super_admin') {
  mockAuth = {workspaceMode: mode, user: {user_id: 'operator', role, ...(mode === 'demo' ? {workspace_mode: 'demo'} : {})}, loading: false};
  const nativeFramework=framework==='general'?null:framework;
  let client = {client_id: id, name: 'Arbitrary organization', status: framework ? 'active' : 'onboarding',
    cis_program: null, shared_programs: [], onboarding_baseline: {completed: !!framework, requirements: nativeFramework ? {[nativeFramework]: 'applies'} : {}}};
  if (framework === 'cis-ig1') client = cisClient(id, 1);
  if (['iso-27001', 'soc-2'].includes(framework)) {
    const fixture = frameworkDashboardFixture(framework, undefined, id);
    client = {...fixture.client, shared_programs: sharedProgramProjection(fixture.db, fixture.client)};
  }
  mockOrg = {currentClientId: id, currentClient: client, clients: [client], loading: false};
}

test.each(['demo', 'standard'].flatMap(mode => [null, 'general', 'hipaa', 'nist-csf-2', 'cmmc'].map(key => [mode, key])))(
  '%s %s exposes guided AI before enrollment without creating records on open or cancel', async (mode, framework) => {
    context(mode, framework); await render();
    expect(host.querySelector('[data-testid=ai-register-first]')).not.toBeNull();
    expect(host.querySelector('.profile-button')).not.toBeNull();
    expect(host.textContent).toContain('Approval not recorded');
    await click(host.querySelector('[data-testid=new-ai-system]'));
    expect(host.querySelector('[data-testid=guided-AI-create]')).not.toBeNull();
    expect(mockNativeProps).toBeNull();
    await click([...host.querySelectorAll('button')].find(node=>node.textContent==='Cancel guided draft'));
    await click(host.querySelector('.system-name'));
    await click(host.querySelector('.inline-actions .button'));
    expect(host.querySelector('[data-testid=guided-AI-record]')).not.toBeNull();
    await click([...host.querySelectorAll('button')].find(node=>node.textContent==='Close guided record'));
    await click(host.querySelector('.profile-button'));
    expect(host.querySelector('[data-testid=guided-AI-profile]')).not.toBeNull();
    expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled();
  });

test.each(['demo', 'standard'].flatMap(mode => ['cis-ig1', 'iso-27001', 'soc-2'].map(key => [mode, key])))(
  '%s %s retained native enrollment keeps the original guided creation path', async (mode, framework) => {
    context(mode, framework); await render();
    expect(host.querySelector('.profile-button')).not.toBeNull();
    await click(host.querySelector('[data-testid=new-ai-system]'));
    expect(host.querySelector('[data-testid=guided-AI-create]')).not.toBeNull();
    expect(mockNativeProps).toBeNull(); expect(api.post).not.toHaveBeenCalled();
  });

test('common appearance retains no-usage intake and read-only creation denial', async () => {
  context('standard', null, 'client_readonly');
  const get = api.get.getMockImplementation();
  api.get.mockImplementation(path => path === '/ai-intake'
    ? Promise.resolve({data: {client_id: id, usage: 'no', indicators: []}}) : get(path));
  await render();
  expect(host.querySelector('[data-testid=new-ai-system]')).toBeNull();
  expect(host.querySelector('.profile-button')).not.toBeNull();
  await click(host.querySelector('.profile-button'));
  expect(host.querySelector('[data-testid=guided-AI-profile]')).not.toBeNull();
  expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled();
});

test.each(['demo','standard'])('%s genuinely empty clients offer guided onboarding and retain an empty inventory on cancel',async mode=>{
  context(mode,null);
  const get=api.get.getMockImplementation();
  api.get.mockImplementation(path=>path==='/ai_systems'?Promise.resolve({data:[]}):get(path));
  await render();
  expect(host.textContent).toContain('No AI systems recorded yet.');
  expect(host.querySelectorAll('.system-row')).toHaveLength(0);
  await click(host.querySelector('[data-testid=new-ai-system]'));
  expect(host.querySelector('[data-testid=guided-AI-create]')).not.toBeNull();
  await click([...host.querySelectorAll('button')].find(node=>node.textContent==='Cancel guided draft'));
  expect(host.querySelectorAll('.system-row')).toHaveLength(0);
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test.each(['demo','standard'].flatMap(mode=>[null,'general','cis-ig1','iso-27001','soc-2','hipaa','nist-csf-2','cmmc'].map(framework=>[mode,framework])))('%s %s Needing attention uses native alerts rather than inferring an alert from a tier',async(mode,framework)=>{
  context(mode,framework);
  const nextReview=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
  const assessedRisk={risk_id:'assessed-ai-risk',client_id:id,status:'open',likelihood_score:2,impact_score:2};
  const highQuestion=catalog.questions.find(question=>question.high).key;
  const records=[
    projectedRow({ai_system_id:'low-alert',name:'Saved low alert',owner_id:null},nextReview),
    projectedRow({ai_system_id:'high-no-alert',name:'Saved high without alerts',screening:{...lowScreening,[highQuestion]:true},oversight_notes:'Synthetic documented oversight',related_links:[{kind:'risks',id:assessedRisk.risk_id}]},nextReview,[assessedRisk]),
    projectedRow({ai_system_id:'retired-alert',name:'Historical alert',status:'retired',owner_id:null},nextReview),
  ],get=api.get.getMockImplementation();
  api.get.mockImplementation(path=>path==='/ai_systems'?Promise.resolve({data:records}):get(path));
  const before=JSON.stringify(records);await render();
  expect(records[0].risk_tier).toBe('low');expect(records[1].risk_tier).toBe('high');expect(records[1].alerts).toEqual([]);
  const attention=host.querySelector('[aria-label="Needing attention 1"]');expect(attention).not.toBeNull();
  await click(attention);
  expect([...host.querySelectorAll('.system-name strong')].map(node=>node.textContent)).toEqual(['Saved low alert']);
  expect(JSON.stringify(records)).toBe(before);expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test.each(['demo','standard'].flatMap(mode=>['cis-ig1','iso-27001','soc-2'].map(framework=>[mode,framework])))(
  '%s %s preserves the approved Brawndo attention card, filters and register',async(mode,framework)=>{
    context(mode,framework);
    const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10),future=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
    const highQuestion=catalog.questions.find(question=>question.high).key;
    const records=[
      projectedRow({ai_system_id:'high-with-alert',name:'High with a native alert',screening:{...lowScreening,[highQuestion]:true},oversight_notes:'Synthetic documented oversight'},future),
      projectedRow({ai_system_id:'low-without-alert',name:'Low without a native alert'},future),
      projectedRow({ai_system_id:'pending-low',name:'Pending low',owner_id:null,approval_status:'pending_assessment'},future),
      projectedRow({ai_system_id:'overdue-low',name:'Overdue low'},yesterday),
      projectedRow({ai_system_id:'uncertain',name:'Screening not assessed',screening:{}},future),
      projectedRow({ai_system_id:'retired-high',name:'Retired high',status:'retired',screening:{...lowScreening,[highQuestion]:true}},future),
    ],get=api.get.getMockImplementation();
    api.get.mockImplementation(path=>path==='/ai_systems'?Promise.resolve({data:records}):get(path));
    const before=JSON.stringify(records);await render();
    expect([...host.querySelectorAll('.klabel')].map(node=>node.textContent)).toEqual(['AI systems','High risk','Awaiting approval','Review due in 30 days']);
    expect([...host.querySelectorAll('.filter-chip')].map(node=>node.dataset.testid)).toEqual(['active','due','high','third','customer','pending','attention'].map(value=>'ai-system-view-'+value));
    expect([...host.querySelectorAll('.table-scroll .register-headings th')].map(node=>node.textContent)).toEqual(['AI system','Screening','Approval','Owner','Next review','Risk register','Expand']);
    expect(host.textContent).not.toContain('More controls');
    const attention=host.querySelector('[aria-label="Needing attention 4"]');expect(attention).not.toBeNull();
    await click(attention);
    expect([...host.querySelectorAll('.system-name strong')].map(node=>node.textContent)).toEqual(['High with a native alert','Pending low','Overdue low','Screening not assessed']);
    expect(JSON.stringify(records)).toBe(before);expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  });

test.each(['demo','standard'].flatMap(mode=>[null,'general','hipaa','nist-csf-2','cmmc'].map(framework=>[mode,framework])))('%s %s retained generic AI preserves native missing/overdue dates and provider-only Third-Party meaning',async(mode,framework)=>{
  context(mode,framework);
  const today=new Date().toISOString().slice(0,10),day=Date.parse(today+'T12:00:00Z');
  const records=[
    {...row,ai_system_id:'missing-native-date',name:'Missing native date',provider:'Reported provider',screening:{third_party:null},risk_tier:'low'},
    {...row,ai_system_id:'past-native-date',name:'Overdue native date',next_review:new Date(day-86400000).toISOString().slice(0,10),risk_tier:'high'},
    {...row,ai_system_id:'future-native-date',name:'Future native date',next_review:new Date(day+10*86400000).toISOString().slice(0,10),risk_tier:'low'},
  ];
  const get=api.get.getMockImplementation();
  api.get.mockImplementation(path=>path==='/ai_systems'?Promise.resolve({data:records}):get(path));
  const before=JSON.stringify(records);await render();
  // A provider alone already belongs to the original generic preset; do not rewrite this record.
  expect(host.querySelector('[data-testid=ai-system-view-third] span').textContent).toBe('1');
  expect(host.querySelector('[data-testid=ai-system-view-high] span').textContent).toBe('1');
  await click(host.querySelector('[data-testid=ai-system-view-due]'));
  expect([...host.querySelectorAll('.system-name strong')].map(node=>node.textContent)).toEqual(['Missing native date','Overdue native date']);
  expect(host.querySelector('[data-testid=ai-system-view-due] span').textContent).toBe('2');
  await click([...host.querySelectorAll('[aria-label="AI summary"] button')].find(node=>node.textContent.includes('Review due in 30 days')));
  expect([...host.querySelectorAll('.system-name strong')].map(node=>node.textContent)).toEqual(['Future native date']);
  expect(host.querySelector('[aria-label="AI summary"] button[aria-pressed="true"] .kvalue').textContent).toBe('1');
  expect(JSON.stringify(records)).toBe(before);expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test.each(['demo','standard'].flatMap(mode=>[
  [mode,'product_model','Native synthetic model'],[mode,'environment','Native synthetic plan'],[mode,'purposes','Customer-Facing'],
  [mode,'owner_id','Native owner search'],[mode,'related_links','native-risk-search-id'],
]))('%s retained generic AI retains native %s search without changing saved fields',async(mode,field,query)=>{
  context(mode,null);
  const value=field==='purposes'?[query]:field==='related_links'?[{kind:'risks',id:query}]:field==='owner_id'?'saved-owner':query;
  const record={...row,[field]:value},get=api.get.getMockImplementation(),before=JSON.stringify(record);
  api.get.mockImplementation(path=>path==='/ai_systems'?Promise.resolve({data:[record]}):path===`/clients/${id}/members`?Promise.resolve({data:[{user_id:'saved-owner',name:'Native owner search'}]}):get(path));
  await render();
  await act(async()=>{const input=host.querySelector('[data-testid=ai-system-search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,query);input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect([...host.querySelectorAll('.system-name strong')].map(node=>node.textContent)).toEqual([record.name]);
  expect(JSON.stringify(record)).toBe(before);
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test.each(['demo','standard'])('%s renders supplied screening values without reclassification and keeps native High/Customer predicates',async mode=>{
  context(mode,null);
  // Defensive DTO boundary: Critical and the retained non-boolean flag are not current canonical API outputs.
  // Keep their no-reclassification assertions separate from the real aiProjection fixtures above.
  const records=[
    {...row,ai_system_id:'saved-high',name:'Recorded high',risk_tier:'high',answers:{},screening:{...lowScreening,employment:true,customer_facing:'reported'}},
    {...row,ai_system_id:'saved-low',name:'Recorded low',risk_tier:'low',answers:{},screening:{...lowScreening}},
    {...row,ai_system_id:'saved-critical',name:'Recorded critical',risk_tier:'critical'},
    {...row,ai_system_id:'unknown-tier',name:'Unscreened record'},
  ];
  const get=api.get.getMockImplementation();
  api.get.mockImplementation(path=>path==='/ai_systems'?Promise.resolve({data:records}):get(path));
  const before=JSON.stringify(records);await render();
  const screening=()=>[...host.querySelectorAll('.system-row')].map(node=>node.querySelector('td:nth-child(2)').textContent);
  expect(screening()).toEqual(['High','Low','Critical','Not screened']);
  expect(host.querySelector('[data-testid=ai-system-view-high] span').textContent).toBe('1');
  await click(host.querySelector('[data-testid=ai-system-view-high]'));
  expect([...host.querySelectorAll('.system-name strong')].map(node=>node.textContent)).toEqual(['Recorded high']);
  await click(host.querySelector('[data-testid=ai-system-view-customer]'));
  expect([...host.querySelectorAll('.system-name strong')].map(node=>node.textContent)).toEqual(['Recorded high']);
  expect(JSON.stringify(records)).toBe(before);expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test.each(['demo','standard'].flatMap(mode=>['cis-ig1','iso-27001','soc-2'].map(framework=>[mode,framework])))('%s %s enrolled AI retains its approved matching and screening behavior',async(mode,framework)=>{
  context(mode,framework);
  const day=Date.parse(new Date().toISOString().slice(0,10)+'T12:00:00Z');
  const records=[
    projectedRow({ai_system_id:'enrolled-missing',name:'Enrolled missing date',risk_tier:'high',answers:{},product_model:'Only native field query',onboarding_screening:{schema_version:0,catalog_version:'retained-legacy',answers:{},scope:{}}}),
    projectedRow({ai_system_id:'enrolled-future',name:'Enrolled future date'},new Date(day+10*86400000).toISOString().slice(0,10)),
  ];
  const get=api.get.getMockImplementation();
  api.get.mockImplementation(path=>path==='/ai_systems'?Promise.resolve({data:records}):get(path));
  const before=JSON.stringify(records);await render();
  expect(host.querySelector('.system-row td:nth-child(2)').textContent).toBe('Needs assessment');
  expect(host.querySelector('[data-testid=ai-system-view-high] span').textContent).toBe('0');
  await click(host.querySelector('[data-testid=ai-system-view-due]'));
  expect([...host.querySelectorAll('.system-name strong')].map(node=>node.textContent)).toEqual(['Enrolled missing date']);
  expect(host.querySelector('[data-testid=ai-system-view-due] span').textContent).toBe('1');
  await click([...host.querySelectorAll('[aria-label="AI summary"] button')].find(node=>node.textContent.includes('Review due in 30 days')));
  expect([...host.querySelectorAll('.system-name strong')].map(node=>node.textContent)).toEqual(['Enrolled future date']);
  expect(host.querySelector('[aria-label="AI summary"] button[aria-pressed="true"] .kvalue').textContent).toBe('1');
  expect(host.querySelector('.archive-toggle')).not.toBeNull();
  expect(JSON.stringify(records)).toBe(before);expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test.each(['demo','standard'])('%s archived inclusion and inactive-only remain separate native controls',async mode=>{
  context(mode,null);
  const records=[
    projectedRow({ai_system_id:'active-system',name:'Active native record'}),
    projectedRow({ai_system_id:'retired-system',name:'Retained retired record',status:'retired'}),
  ],get=api.get.getMockImplementation();
  api.get.mockImplementation(path=>path==='/ai_systems'?Promise.resolve({data:records}):get(path));
  const before=JSON.stringify(records);await render();
  const names=()=>[...host.querySelectorAll('.system-name strong')].map(node=>node.textContent);
  expect(names()).toEqual(['Active native record']);
  await click(host.querySelector('.archive-toggle input[type="checkbox"]'));
  expect(names()).toEqual(['Active native record','Retained retired record']);
  await click(host.querySelector('[data-testid=ai-system-view-inactive]'));
  expect(names()).toEqual(['Retained retired record']);
  await click(host.querySelector('[data-testid=ai-system-view-due]'));
  expect(names()).toEqual(['Active native record']);
  expect(JSON.stringify(records)).toBe(before);expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
