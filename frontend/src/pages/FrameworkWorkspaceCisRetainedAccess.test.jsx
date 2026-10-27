import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation} from 'react-router-dom';
import FrameworkWorkspace from './FrameworkWorkspace';
import CisResultTable from '@/components/CisResultTable';
import {cis,FRAMEWORKS} from '@/lib/frameworks';
import api from '@/lib/api';
import {cisClient,cisWorkspace} from '@/testUtils/cisExperience';

let mockAuth,mockOrg,mockOmniProps;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({__esModule:true,PREVIEW_MODE:true,default:{get:jest.fn(),patch:jest.fn(),put:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('@/components/GuidedAssessor',()=>props=>{mockOmniProps=props;return null;});
jest.mock('@/components/AssigneeSelect',()=>()=>null);
jest.mock('@/components/RecordDrawer',()=>()=>null);
// Keep real page/register/table/controller/native fields/manager/history. Guidance and
// dialog focus/portals are independent of this access regression and covered elsewhere.
jest.mock('@/components/AssessmentLayout',()=>({__esModule:true,default:({children})=><div>{children}</div>,AssessmentChecklist:()=>null,AssessmentRequirement:()=>null}));
jest.mock('@/components/ui/dialog',()=>{
  const R=require('react'),CloseContext=R.createContext(()=>{});
  return {Dialog:({open,children,onOpenChange})=>open?<CloseContext.Provider value={onOpenChange}><div>{children}</div></CloseContext.Provider>:null,
    DialogClose:R.forwardRef(({children,...props},ref)=>{const close=R.useContext(CloseContext);return <button ref={ref} type="button" {...props} onClick={()=>close(false)}>{children}</button>;}),
    DialogContent:R.forwardRef(({children,onOpenAutoFocus,onCloseAutoFocus,onPointerDownOutside,onEscapeKeyDown,showCloseButton,...props},ref)=><div ref={ref} {...props}>{children}</div>),
    DialogTitle:R.forwardRef(({children,...props},ref)=><h2 ref={ref} {...props}>{children}</h2>),DialogDescription:({children})=><p>{children}</p>};
});
jest.mock('@/components/ui/sheet',()=>{
  const R=require('react');
  return {Sheet:({open,children})=>open?<div>{children}</div>:null,
    SheetContent:R.forwardRef(({children,onCloseAutoFocus,...props},ref)=><div ref={ref} {...props}>{children}</div>),
    SheetHeader:({children})=><header>{children}</header>,SheetTitle:({children})=><h2>{children}</h2>,SheetDescription:({children})=><p>{children}</p>};
});

const savedAt='2026-10-01T12:00:00Z';
const work=()=>({context_complete:true,evidence_count:0,latest_evidence_at:null,finding_ids:[],review_ids:[],task_ids:[],
  open_findings:0,open_actions:0,overdue_actions:0,overdue_reviews:0,priority_records:[]});
function fixture(){
  const active=cis.requirements.filter(row=>row.implementation_group===1);
  const retained=cis.requirements.filter(row=>['1.3','1.5'].includes(row.id));
  const definitions=[...active,...retained];
  const assessments=definitions.map(definition=>({
    framework_assessment_id:'native-'+definition.id,definition_id:definition.id,client_id:'demo_brawndo',
    framework_key:'cis-ig1',framework_version:'8.1',status:definition.id==='1.3'?'addressed':definition.id==='1.5'?'needs_attention':'not_assessed',
    verification:definition.id==='1.3'?'verified':'not_verified',implementation:definition.implementation_group===1?'':'Retained implementation '+definition.id,
    last_saved:savedAt,last_assessed:definition.implementation_group===1?null:savedAt,
    owner_id:null,process_owner_id:null,technology:'',notes:'',na_rationale:'',cis_assessment_criteria:[],items_to_address:[],items_revision:0,
    assessment_history:definition.implementation_group===1?[]:[{status:'needs_attention',at:'2026-09-20T12:00:00Z',by:'historic-actor',
      implementation:'Historical retained assessment '+definition.id,verification:'gap_identified'}],
  }));
  return {framework:{...FRAMEWORKS.find(row=>row.key==='cis-ig1')},selected:true,configured:true,configuration:{implementation_group:1},
    active_definition_ids:active.map(row=>row.id),definitions,assessments,work:Object.fromEntries(assessments.map(row=>[row.framework_assessment_id,work()])),
    implementation_position:{program_id:'demo_brawndo:cis-ig1',availability:'available',total:56,denominator:56,implemented:0,excluded:0,
      counts:[{key:'addressed',count:0},{key:'in_progress',count:0},{key:'needs_attention',count:0},{key:'not_assessed',count:56}]}};
}
function LocationReceipt(){const location=useLocation();return <output data-testid="location">{location.pathname+location.search}</output>;}
let root,host,data;
const render=(entry='/compliance/cis-ig1')=>act(async()=>root.render(<MemoryRouter initialEntries={[entry]}><LocationReceipt/><FrameworkWorkspace frameworkKey="cis-ig1" clientId={mockOrg.currentClientId}/></MemoryRouter>));
const button=(scope,name)=>[...scope.querySelectorAll('button')].find(element=>element.textContent.trim()===name);
async function click(element){expect(element).toBeTruthy();await act(async()=>element.click());}
async function search(value){
  const input=host.querySelector('input[type="search"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
}
const toggle=()=>[...host.querySelectorAll('label')].find(label=>label.textContent==='Include retained out-of-scope safeguards')?.querySelector('input');
const retained=()=>host.querySelector('[aria-labelledby="cis-retained-heading"]');
function expectActiveScope(){
  expect(host.querySelector('.brawndo-cis-visual')).toBeTruthy();
  expect(host.querySelector('.now-head p').textContent).toBe('0 of 56 safeguards implemented');
  expect(host.querySelector('.bd-head').textContent).toContain('Assessed 0 of 56');
  expect(host.querySelector('.page-head p').textContent).toContain('15 controls · 56 safeguards');
  expect([...host.querySelectorAll('[aria-label="Show safeguards"] button')].find(element=>element.textContent.startsWith('All')).querySelector('.n').textContent).toBe('56');
  expect(host.querySelector('.head-actions .primary').textContent).toContain('Continue: 1.1 ');
  expect(mockOmniProps.rows).toHaveLength(56);
  expect(mockOmniProps.rows.every(row=>row.implementation_group===1)).toBe(true);
}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();sessionStorage.setItem('grc_client_id','demo_brawndo');
  mockAuth={user:{user_id:'retained-access-actor',role:'super_admin',workspace_mode:'demo'},workspaceMode:'demo',loading:false};
  const client={...cisClient('demo_brawndo',1),name:'Brawndo'};
  mockOrg={currentClientId:client.client_id,currentClient:client,clients:[client],loading:false};mockOmniProps=null;data=fixture();
  api.get.mockImplementation(async path=>{
    if(path==='/frameworks/cis-ig1')return {data};
    if(path.endsWith('/related'))return {data:{reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]}};
    if(path.endsWith('/members'))return {data:[{user_id:'historic-actor',name:'Historical Reviewer'}]};
    if(path==='/contacts'||path==='/comments'||path.endsWith('/activity'))return {data:[]};
    throw new Error('Unexpected native read: '+path);
  });
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});

function configureNativeGroup(group){
  const client=cisClient('synthetic-cis-context-'+group,group);
  sessionStorage.setItem('grc_client_id',client.client_id);
  mockOrg={...mockOrg,currentClientId:client.client_id,currentClient:client,clients:[client]};
  data=cisWorkspace(client.client_id,group);
  data.work=Object.fromEntries(data.assessments.map(row=>[row.framework_assessment_id,work()]));
  return client;
}

test.each([1,2,3])('native IG%s assessment breadcrumb matches configured context and retains exact route/close behavior',async group=>{
  const client=configureNativeGroup(group),record=data.assessments.find(row=>row.definition_id==='1.1'),before=JSON.stringify(data);
  const entry='/compliance/cis-ig1?'+new URLSearchParams({client_id:client.client_id,assessment:record.framework_assessment_id});
  await render(entry);
  const assessment=()=>host.querySelector('[data-testid="brawndo-cis-assessment"]');
  expect(assessment()).toBeTruthy();
  const breadcrumb=assessment().querySelector(`[aria-label="CIS IG${group} location"]`);
  expect(breadcrumb).toBeTruthy();
  expect(breadcrumb.querySelector('li').textContent).toBe(`CIS IG${group}`);
  expect(assessment().querySelector('h2').textContent).toBe(cis.requirements.find(row=>row.id==='1.1').title);
  expect(api.get).toHaveBeenCalledWith(`/framework_assessments/${record.framework_assessment_id}/related`,expect.any(Object));
  expect(host.querySelector('[data-testid="location"]').textContent).toBe(entry);
  await click(button(assessment(),'Close'));
  expect(assessment()).toBeNull();
  expect(host.querySelector('[data-testid="location"]').textContent).toBe('/compliance/cis-ig1?client_id='+client.client_id);
  expect(host.querySelector('.now-head p').textContent).toBe(`0 of ${data.active_definition_ids.length} safeguards implemented`);
  await click(host.querySelector('.head-actions .primary'));
  expect(assessment()).toBeTruthy();
  const location=new URL(host.querySelector('[data-testid="location"]').textContent,'http://localhost');
  expect(location.searchParams.get('assessment')).toBe(record.framework_assessment_id);
  expect(location.searchParams.get('client_id')).toBe(client.client_id);
  await click(button(assessment(),`CIS IG${group}`));
  expect(assessment()).toBeNull();
  expect(host.querySelector('[data-testid="location"]').textContent).toBe('/compliance/cis-ig1?client_id='+client.client_id);
  expect(JSON.stringify(data)).toBe(before);
  ['patch','put','post','delete'].forEach(method=>expect(api[method]).not.toHaveBeenCalled());
});

test.each([1,2])('native IG%s retained caption names current scope without including retained records in totals',async group=>{
  const client=configureNativeGroup(group),definition=cis.requirements.find(row=>row.implementation_group===group+1);
  const record={...data.assessments[0],framework_assessment_id:client.client_id+':'+definition.id,definition_id:definition.id};
  data.definitions.push({...definition});data.assessments.push(record);data.work[record.framework_assessment_id]=work();
  const before=JSON.stringify(data),activeCount=data.active_definition_ids.length;
  await render('/compliance/cis-ig1?client_id='+client.client_id);
  expect(retained()).toBeNull();await click(toggle());
  expect(retained().textContent).toContain(`These records are outside the current IG${group} scope and excluded from active program totals.`);
  expect(retained().querySelectorAll('tbody tr')).toHaveLength(1);
  expect(retained().querySelector(`[data-testid="requirement-${definition.id}"]`)).toBeTruthy();
  expect(host.querySelector('.now-head p').textContent).toBe(`0 of ${activeCount} safeguards implemented`);
  expect(JSON.stringify(data)).toBe(before);
  ['patch','put','post','delete'].forEach(method=>expect(api[method]).not.toHaveBeenCalled());
});

test('retained toggle, search and filter open exact native records and management history without changing active IG1 totals',async()=>{
  const before=JSON.stringify(data);await render();expectActiveScope();
  expect(toggle().checked).toBe(false);expect(retained()).toBeNull();
  await click(toggle());expectActiveScope();
  expect(retained().querySelectorAll('tbody tr')).toHaveLength(2);
  expect(retained().textContent).toContain('Showing 2 of 2 retained safeguards');
  // Saved Verified deliberately disagrees with the missing supporting evidence.
  const savedRow=retained().querySelector('[data-testid="requirement-1.3"]');
  expect(savedRow.querySelector('[data-label="Saved verification"]').textContent).toBe('Verified');
  expect(savedRow.querySelector('[data-label="Evidence"]').textContent).toBe('No evidence');
  expect(savedRow.querySelector('[data-label="Remediation"]').textContent).toBe('—');
  expect(retained().querySelector('[data-testid="requirement-1.5"] [data-label="Saved verification"]').textContent).toBe('Not verified');
  const activeRegister=host.querySelector('[aria-labelledby="cis-visual-register"]');
  expect(activeRegister.querySelector('.summary').textContent).toContain('56 safeguards in 11 domains');
  await click(button(activeRegister,'Expand all'));
  expect(activeRegister.querySelectorAll('.sg')).toHaveLength(56);
  expect(activeRegister.querySelector('[data-testid="requirement-1.3"]')).toBeNull();
  expect(activeRegister.querySelector('[data-testid="requirement-1.5"]')).toBeNull();
  await click(button(activeRegister,'CIS control'));
  expect(activeRegister.querySelector('.summary').textContent).toContain('56 safeguards in 15 controls');

  await search('Utilize an Active Discovery Tool');
  await click([...host.querySelectorAll('.lg-cell')].find(element=>element.textContent.startsWith('Implemented')));
  expect(retained().querySelectorAll('tbody tr')).toHaveLength(1);
  expect(retained().querySelector('tr[data-testid="requirement-1.3"]')).toBeTruthy();expectActiveScope();
  await click(retained().querySelector('.cis-results-open'));
  expect(host.querySelector('[data-testid="location"]').textContent).toContain('assessment=native-1.3');
  const assessment=host.querySelector('[data-testid="brawndo-cis-assessment"]');
  expect(assessment).toBeTruthy();expect(assessment.classList.contains('brawndo-cis-visual-safeguard')).toBe(false);
  expect(assessment.querySelector('[aria-label="Current implementation"]').value).toBe('Retained implementation 1.3');
  expect(assessment.querySelector('[aria-label="Current implementation"]').disabled).toBe(false);
  expect(assessment.querySelector('[aria-label="Saved verification"]').textContent).toBe('Verified');
  expect(host.textContent).toContain('Retained out-of-scope safeguard · history and linked work remain available.');
  expect(api.get).toHaveBeenCalledWith('/framework_assessments/native-1.3/related',expect.any(Object));
  await click(button(assessment,'CIS IG1'));
  expect(host.querySelector('[data-testid="brawndo-cis-assessment"]')).toBeNull();
  expect(host.querySelector('[data-testid="location"]').textContent).not.toContain('assessment=');
  expectActiveScope();

  await click(retained().querySelector('[aria-label="Manage 1.3 Utilize an Active Discovery Tool"]'));
  const manager=host.querySelector('[data-testid="framework-record-management"]');
  expect(manager).toBeTruthy();expect(manager.querySelector('h2').textContent).toContain('1.3 · Utilize an Active Discovery Tool');
  const history=[...manager.querySelectorAll('details')].find(element=>element.querySelector('summary')?.textContent==='View History');
  await click(history.querySelector('summary'));expect(history.open).toBe(true);
  expect(history.textContent).toContain('Historical retained assessment 1.3');
  expect(history.textContent).toContain('Historical Reviewer');expect(history.textContent).toContain('2026-09-20');
  expect(history.textContent).toContain('Verification: Gap identified');expect(history.textContent).not.toContain('Historical retained assessment 1.5');
  await click(button(manager,'Close'));expectActiveScope();
  await search('No retained record matches');
  expect(retained().querySelector('[role="status"]').textContent).toBe('No retained safeguards match the current search and filters.');
  await click(toggle());expect(retained()).toBeNull();expectActiveScope();
  expect(JSON.stringify(data)).toBe(before);
  ['patch','put','post','delete'].forEach(method=>expect(api[method]).not.toHaveBeenCalled());
});

test('a retained deep link keeps its native notice and actor-based read-only permissions',async()=>{
  mockAuth={...mockAuth,user:{...mockAuth.user,role:'client_viewer'}};
  await render('/compliance/cis-ig1?assessment=native-1.5');
  const assessment=host.querySelector('[data-testid="brawndo-cis-assessment"]');
  expect(assessment).toBeTruthy();expect(assessment.querySelector('[aria-label="Current implementation"]').value).toBe('Retained implementation 1.5');
  expect(assessment.querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
  expect(button(assessment,'Save assessment')).toBeUndefined();
  expect(assessment.textContent).toContain('Retained assessment');expect(assessment.textContent).toContain('Read-only assessment');
  expect(host.textContent).toContain('Retained out-of-scope safeguard · history and linked work remain available.');
  expect(assessment.classList.contains('brawndo-cis-visual-safeguard')).toBe(false);
  ['patch','put','post','delete'].forEach(method=>expect(api[method]).not.toHaveBeenCalled());
});

test.each([
  ['absent',undefined],
  ['incomplete',{...work(),context_complete:false}],
  ['invalid counts',{...work(),evidence_count:-1,open_findings:'0'}],
])('retained %s work is unavailable without replacing saved verification',async(_case,projection)=>{
  if(projection===undefined)delete data.work['native-1.3'];else data.work['native-1.3']=projection;
  await render();await click(toggle());expectActiveScope();
  const row=retained().querySelector('[data-testid="requirement-1.3"]');
  expect(row.querySelector('[data-label="Saved verification"]').textContent).toBe('Verified');
  expect(row.querySelector('[data-label="Evidence"]').textContent).toBe('Unavailable');
  expect(row.querySelector('[data-label="Remediation"]').textContent).toBe('Unavailable');
  expect(row.textContent).not.toContain('Gap not tracked');
  ['patch','put','post','delete'].forEach(method=>expect(api[method]).not.toHaveBeenCalled());
});

test.each([
  ['addressed','verified','Not verified','Verified'],
  ['needs_attention','not_verified','Gap identified','Not verified'],
  ['not_applicable','needs_validation','Not applicable','Needs validation'],
])('default result-table verification stays derived for %s while retained facts show saved verification',async(status,verification,derived,saved)=>{
  const definition=cis.requirements.find(row=>row.id==='1.3');
  const row={...definition,...data.assessments.find(row=>row.definition_id==='1.3'),status,verification,work:work()};
  const props={rows:[row],onOpen:jest.fn(),label:'Native table'};
  await act(async()=>root.render(<CisResultTable {...props}/>));
  expect(host.querySelector('[data-label="Verification"]').textContent).toBe(derived);
  expect(host.querySelector('[data-label="Saved verification"]')).toBeNull();
  expect(host.querySelector('[data-label="Evidence"]').textContent).toBe('No evidence');
  await act(async()=>root.render(<CisResultTable {...props} nativeFacts/>));
  expect(host.querySelector('[data-label="Saved verification"]').textContent).toBe(saved);
  expect(host.querySelector('[data-label="Verification"]')).toBeNull();
  expect(host.querySelector('[data-label="Evidence"]').textContent).toBe('No evidence');
  ['patch','put','post','delete'].forEach(method=>expect(api[method]).not.toHaveBeenCalled());
});

test('retained complete positive counts remain separate from saved verification and missing evidence dates',async()=>{
  const now=new Date().toISOString();
  data.work['native-1.3']={...work(),evidence_count:2,latest_evidence_at:now,open_findings:4,direct_findings:1,overdue_actions:3};
  data.work['native-1.5']={...work(),evidence_count:1,latest_evidence_at:null};
  await render();await click(toggle());
  const row=retained().querySelector('[data-testid="requirement-1.3"]');
  expect(row.querySelector('[data-label="Saved verification"]').textContent).toBe('Verified');
  expect(row.querySelector('[data-label="Evidence"]').textContent).toBe('2 · '+now);
  expect(row.querySelector('[data-label="Remediation"]').textContent).toContain('3 overdue');
  expect(row.querySelector('[data-label="Remediation"]').textContent).toContain('1 open Finding');
  expect(row.querySelector('[data-label="Remediation"]').textContent).not.toContain('4 open Findings');
  const missingDate=retained().querySelector('[data-testid="requirement-1.5"] [data-label="Evidence"]');
  expect(missingDate.textContent).toBe('1 · Date unavailable');expectActiveScope();
});

test.each([
  ['invalid date string','not-a-calendar-date','Assessment date unavailable'],
  ['numeric date',42,'Assessment date unavailable'],
  ['zero is a malformed date',0,'Assessment date unavailable'],
  ['false is a malformed date',false,'Assessment date unavailable'],
  ['no assessment date',null,'Never'],
])('retained %s is displayed honestly without changing saved data',async(_case,lastAssessed,expected)=>{
  data={...data,assessments:data.assessments.map(row=>row.definition_id==='1.3'?{...row,last_assessed:lastAssessed}:row)};
  const before=JSON.stringify(data);
  await render();await click(toggle());expectActiveScope();
  const row=retained().querySelector('[data-testid="requirement-1.3"]');
  expect(row.querySelector('[data-label="Last assessed"]').textContent).toBe(expected);
  expect(row.querySelector('[data-label="Saved verification"]').textContent).toBe('Verified');
  expect(JSON.stringify(data)).toBe(before);
  ['patch','put','post','delete'].forEach(method=>expect(api[method]).not.toHaveBeenCalled());
});
