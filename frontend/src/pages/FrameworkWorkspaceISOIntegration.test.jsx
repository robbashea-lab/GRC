import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation,useNavigate} from 'react-router-dom';
import FrameworkWorkspace from './FrameworkWorkspace';
import {frameworkDashboardFixture} from '@/testUtils/frameworkDashboard';
import {captureDemoReporting,demoCurrentPositions} from '@/preview/portfolioReporting';
import {initialAuditState,auditPackage} from '@/lib/isoAudit';
import api from '@/lib/api';

let mockUser,mockParams;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:mockUser.workspace_mode==='demo'?'demo':'standard'})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),post:jest.fn(),put:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('@/components/IsoGuidedAssessor',()=>()=>null);
jest.mock('@/components/FrameworkDrawer',()=>function MockIsoDrawer(props){
  const React=require('react'),[draft,setDraft]=React.useState('Synthetic unsaved native draft'),lastCloseRequest=React.useRef(props.closeRequest);
  // A clean native-editor boundary. Real dirty/save/CAS guards are exercised by their own suites.
  React.useEffect(()=>{
    if(lastCloseRequest.current!==props.closeRequest){lastCloseRequest.current=props.closeRequest;props.onOpenChange(false);}
  },[props.closeRequest,props.onOpenChange]);
  const {record,onSaved,onOpenChange,recordManagement,breadcrumb,clientId}=props;
  return <section data-testid="iso-opened" data-assessment={record.framework_assessment_id} data-client={record.client_id} data-client-prop={clientId} data-definition={record.definition_id}
    data-framework={record.framework_key} data-version={record.framework_version} data-owner={record.owner_id} data-management={recordManagement?'true':'false'}>
    <input aria-label="Synthetic native draft" value={draft} onChange={event=>setDraft(event.target.value)}/>
    <output data-testid="iso-native-history">{JSON.stringify(record.assessment_history||[])}</output>
    <output data-testid="iso-native-implementation">{record.implementation}</output>
    <button onClick={onSaved}>Simulate same-origin refresh</button><button onClick={()=>onOpenChange(false)}>Close synthetic editor</button>
    <button disabled={!props.onPrevious} onClick={props.onPrevious}>Previous native criterion</button><button disabled={!props.onNext} onClick={props.onNext}>Next native criterion</button>
    {breadcrumb?.filter(crumb=>crumb.onClick).map((crumb,index)=><button key={index} data-drawer-crumb onClick={crumb.onClick}>{crumb.label}</button>)}
  </section>;
});

let root,container,routerKey;
const ROOT='/compliance/iso-27001';
function RouteProbe(){
  const location=useLocation(),navigate=useNavigate();
  return <aside aria-label="Router test controls"><output aria-label="Current ISO workspace URL">{location.pathname+location.search}</output>
    <button onClick={()=>navigate(-1)}>History Back</button><button onClick={()=>navigate(1)}>History Forward</button></aside>;
}
function fixture(clientId){
  const result=frameworkDashboardFixture('iso-27001',undefined,clientId);
  result.source.assessments.forEach(row=>{row.status='addressed';});result.source.work={};result.refresh();
  return result;
}
function reviews(clientId){
  const state=initialAuditState('governance-risk'),historical=initialAuditState('governance-risk');
  historical.items=Object.fromEntries(auditPackage('governance-risk').items.slice(0,3).map(item=>[item.key,{status:'reviewed',result:'conforming'}]));
  return [{review_id:'qa-audit',client_id:clientId,owner_id:'qa-user',title:'Synthetic audit',status:'in_progress',due_date:'2026-03-31',iso_audit:state,occurrences:[{review_id:'qa-audit',client_id:clientId,occurrence_id:'qa-2025',status:'completed',due_date:'2025-03-31',completed_at:'2025-04-01T12:00:00Z',iso_audit:historical}]}];
}
function addOtherPrograms(result){
  const others=[frameworkDashboardFixture('cis-ig1',undefined,result.client.client_id),frameworkDashboardFixture('soc-2',['security'],result.client.client_id)];
  result.db.requirements.push(...others.flatMap(other=>other.db.requirements));
  result.db.framework_assessments=[...result.source.assessments,...others.flatMap(other=>other.source.assessments)];
  captureDemoReporting(result.db,null,'2026-10-26T12:00:00Z');
  result.source.implementation_position=demoCurrentPositions(result.db,[result.client],'2026-10-26T12:00:00Z').find(program=>program.program_id===result.client.client_id+':iso-27001').current;
  return others.flatMap(other=>other.source.assessments);
}
function serve(response,audits=[]){api.get.mockImplementation(async path=>({data:path==='/frameworks/iso-27001'?response:path==='/iso-audit'?{program:{status:'active',activated_at:'2025-01-01',configuration:{start_date:'2025-01-01'}},reviews:audits}:[]}));}
async function mount(clientId,url=ROOT+'?'+mockParams.toString()){
  await act(async()=>root.render(<MemoryRouter key={routerKey} initialEntries={[url]}><FrameworkWorkspace frameworkKey="iso-27001" clientId={clientId}/><RouteProbe/></MemoryRouter>));
}
const button=name=>[...container.querySelectorAll('button')].find(node=>node.textContent===name);
const tab=name=>[...container.querySelector('[aria-label="ISO workspace sections"]').querySelectorAll('button')].find(node=>node.textContent===name);
const card=name=>[...container.querySelectorAll('button.iso-program-card')].find(node=>node.getAttribute('aria-label')?.startsWith('Open '+name+'.'));
const editor=()=>container.querySelector('[data-testid="iso-opened"]');
const row=id=>container.querySelector(`[data-testid="requirement-${id}"]`);
const group=key=>container.querySelector(`[data-control="${key}"]`);
const summary=()=>container.querySelector('[aria-labelledby="bcis-summary-heading"]');
const params=()=>new URL(container.querySelector('[aria-label="Current ISO workspace URL"]').textContent,'http://localhost').searchParams;
const click=node=>act(async()=>node.click());
const ids=()=>[...container.querySelectorAll('[data-testid^="requirement-"]')].map(node=>node.dataset.testid.slice('requirement-'.length));
const noWrites=()=>{for(const method of ['patch','post','put','delete'])expect(api[method]).not.toHaveBeenCalled();};
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers().setSystemTime(new Date('2026-10-31T10:00:00Z'));
  mockUser={user_id:'qa-user',role:'super_admin',workspace_mode:'demo'};mockParams=new URLSearchParams();routerKey=0;
  sessionStorage.clear();localStorage.clear();Object.values(api).forEach(method=>method.mockReset());
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});

test.each([
  ['demo_dunder','demo'],['new-iso-client','demo'],['later-enrolled-iso','demo'],['mixed-framework-client','demo'],
  ['existing-auth-iso','standard'],['new-auth-iso','standard'],['later-auth-iso','standard'],['mixed-auth-iso','standard'],
])('%s in %s receives the four native ISO destinations through shared framework selection',async(clientId,mode)=>{
  mockUser.workspace_mode=mode;const result=fixture(clientId);serve(result.source);await mount(clientId);
  expect(container.querySelector('.iso-cis-program-visual')).toBeTruthy();expect(container.querySelectorAll('button.iso-program-card')).toHaveLength(4);
  for(const [title,view] of [['Statement of Applicability','soa'],['ISMS Requirements','isms_clause'],['Annex A Controls','annex_control'],['Internal Audit','audit']]){
    await click(card(title));expect(tab(title).getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby')).toBe('iso-tab-'+view);
    expect(params().get('iso_view')).toBe(view);await click(tab('Overview'));
  }
  noWrites();
});

test('historical audit year survives overview card → audit → overview navigation',async()=>{
  const clientId='qa-year',result=fixture(clientId);serve(result.source,reviews(clientId));await mount(clientId);
  await act(async()=>{const field=container.querySelector('[aria-label="Audit-program year"]');field.value='2025';field.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(card('Internal Audit').textContent).toContain('3 of');await click(card('Internal Audit'));
  expect(container.querySelector('[aria-label="Audit-program year"]').value).toBe('2025');await click(tab('Overview'));
  expect(container.querySelector('[aria-label="Audit-program year"]').value).toBe('2025');expect(card('Internal Audit').textContent).toContain('3 of');noWrites();
});

test('actor change withdraws the old ISO view until its current authorized response arrives',async()=>{
  const result=fixture('qa-context');serve(result.source);await mount('qa-context');expect(card('Statement of Applicability')).toBeTruthy();
  let finish;api.get.mockImplementation(path=>path==='/frameworks/iso-27001'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({data:[]}));
  mockUser={user_id:'qa-reader',role:'client_readonly',workspace_mode:'demo'};await mount('qa-context');
  expect(container.querySelector('.iso-program-overview')).toBeNull();expect(editor()).toBeNull();expect(container.textContent).toContain('Loading program workspace');
  serve(result.source);await act(async()=>finish({data:result.source}));expect(card('Statement of Applicability')).toBeTruthy();noWrites();
});

test('a retained year without this client’s audit records stays Not scheduled in both views without creating history',async()=>{
  const clientId='qa-retained-year',result=fixture(clientId),current=reviews(clientId);current[0].occurrences=[];
  const before=JSON.stringify(current);mockParams=new URLSearchParams('audit_year=2025');serve(result.source,current);await mount(clientId);
  expect(container.querySelector('[aria-label="Audit-program year"]').value).toBe('2025');
  expect(card('Internal Audit').querySelector('.iso-card-value').textContent).toBe('—');
  expect(card('Internal Audit').querySelector('.iso-program-metric').textContent).toBe('Not scheduled · 2025');
  await click(card('Internal Audit'));expect(container.querySelector('[aria-label="Audit-program year"]').value).toBe('2025');
  expect(container.textContent).toContain('Not scheduled');expect(JSON.stringify(current)).toBe(before);noWrites();
});

test('same-origin refresh preserves an open editor boundary and its unsaved local draft',async()=>{
  const clientId='qa-draft',result=fixture(clientId);mockParams=new URLSearchParams('iso_view=isms_clause&assessment='+encodeURIComponent(clientId+':4.1'));
  serve(result.source);await mount(clientId);const draft=container.querySelector('[aria-label="Synthetic native draft"]');expect(draft).toBeTruthy();
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(draft,'Synthetic draft kept through refresh');draft.dispatchEvent(new Event('input',{bubbles:true}));});
  let finish;api.get.mockImplementation(path=>path==='/frameworks/iso-27001'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({data:[]}));
  await click(button('Simulate same-origin refresh'));expect(container.querySelector('[aria-label="Synthetic native draft"]')).toBe(draft);
  await act(async()=>finish({data:{...result.source,work:{refreshed:true}}}));
  expect(container.querySelector('[aria-label="Synthetic native draft"]')).toBe(draft);expect(draft.value).toBe('Synthetic draft kept through refresh');noWrites();
});

test('current-client filtering precedes the definition join and exact ISO record opening',async()=>{
  const clientId='qa-scope',result=fixture(clientId);result.source.assessments[1].status='needs_attention';result.refresh();
  result.source.assessments.push({...result.source.assessments[0],client_id:'foreign-client',framework_assessment_id:'foreign-record',status:'needs_attention'});
  const before=JSON.stringify(result.source);mockParams=new URLSearchParams('iso_view=isms_clause&view=needs_attention');serve(result.source);await mount(clientId);
  const matches=[...container.querySelectorAll('[data-testid^="requirement-"]')];expect(matches).toHaveLength(1);await click(matches[0]);
  expect(editor().dataset.assessment).toBe(result.source.assessments[1].framework_assessment_id);expect(editor().dataset.client).toBe(clientId);
  expect(editor().dataset.management).toBe('false');expect(JSON.stringify(result.source)).toBe(before);noWrites();
});

test('unconfigured onboarding and deselected historical access keep their native states',async()=>{
  const unconfigured=fixture('qa-unconfigured');Object.assign(unconfigured.source,{configured:false,definitions:[],assessments:[]});
  serve(unconfigured.source);await mount('qa-unconfigured');expect(container.textContent).toContain('Configure in Client Profile');expect(container.querySelector('.iso-program-card')).toBeNull();
  const historical=fixture('qa-historical');historical.source.selected=false;const before=JSON.stringify(historical.source);
  serve(historical.source);await mount('qa-historical');expect(container.textContent).toContain('Historical program');expect(card('Statement of Applicability')).toBeTruthy();
  await click(card('ISMS Requirements'));await click(button('Expand all'));expect(ids()).toEqual(historical.source.definitions.filter(definition=>definition.specification==='isms_clause').map(definition=>definition.id));
  expect(JSON.stringify(historical.source)).toBe(before);noWrites();
});

test('overview uses the native weighted 123-record population once and section summaries reconcile without SoA or audit credit',async()=>{
  const clientId='qa-weighted-iso',result=fixture(clientId),clauses=result.source.assessments.filter(record=>!record.definition_id.startsWith('A.')),controls=result.source.assessments.filter(record=>record.definition_id.startsWith('A.'));
  controls.forEach(record=>{record.status='not_assessed';});
  Object.assign(controls[0],{status:'addressed'});Object.assign(controls[1],{status:'addressed',soa_applicability:'excluded'});Object.assign(controls[2],{status:'addressed',soa_applicability:'',soa_justification:''});
  result.refresh();const before=JSON.stringify(result.source);serve(result.source);await mount(clientId);
  expect(result.source.assessments).toHaveLength(123);expect(summary().querySelector('.now-head p').textContent).toBe('31 of 121 requirements and controls implemented');
  expect(summary().querySelector('.now-value').textContent).toBe('25.6%');expect(summary().querySelector('.bd-head').textContent).toContain('Assessed 31 of 121');
  expect(card('Internal Audit').querySelector('.iso-program-metric').textContent).toBe('Not scheduled · 2026');
  await click(card('ISMS Requirements'));expect(summary().querySelector('.now-head p').textContent).toBe('30 of 30 ISMS requirements implemented');
  await click(button('Expand all'));expect(ids()).toEqual(clauses.map(record=>record.definition_id));expect(new Set(ids()).size).toBe(clauses.length);
  await click(button('Back to ISO overview'));expect(summary().querySelector('.now-value').textContent).toBe('25.6%');
  await click(card('Annex A Controls'));expect(summary().querySelector('.now-head p').textContent).toBe('1 of 91 applicable controls implemented');
  await click(button('Expand all'));expect(ids()).toEqual(controls.map(record=>record.definition_id));expect(new Set(ids()).size).toBe(controls.length);
  expect(container.textContent).toContain('1 Annex A applicability decisions unresolved; 1 excluded');
  expect(JSON.stringify(result.source)).toBe(before);noWrites();
});

test('overview Continue safely opens the existing SoA record when its retained justification is not text',async()=>{
  const clientId='qa-legacy-justification',result=fixture(clientId),control=result.source.assessments.find(record=>record.definition_id==='A.5.1');
  Object.assign(control,{status:'in_progress',assessment_history:[{status:'in_progress',at:'2026-10-01T12:00:00Z'}]});
  result.refresh();
  // Preserve the canonical position, then model a malformed retained field without normalizing it.
  control.soa_justification=42;
  const before=JSON.stringify(result.source);serve(result.source);await mount(clientId);
  expect(summary().querySelector('.now-head p').textContent).toBe('Implementation source unavailable');
  expect(summary().querySelector('.now-value').textContent).toBe('—');expect(editor()).toBeNull();
  await click([...container.querySelectorAll('.head-actions button')].find(node=>node.textContent.startsWith('Continue: A.5.1 ')));
  expect(params().get('iso_view')).toBe('soa');expect(container.querySelector('.page-head h1').textContent).toBe('Statement of Applicability');
  expect(editor().dataset.assessment).toBe(control.framework_assessment_id);expect(editor().dataset.client).toBe(clientId);
  expect(JSON.parse(container.querySelector('[data-testid="iso-native-history"]').textContent)).toEqual(control.assessment_history);
  expect(JSON.stringify(result.source)).toBe(before);expect(control.soa_justification).toBe(42);noWrites();
});

test('retained duplicated grouping fields cannot remap an Annex record away from its native theme or SoA identity',async()=>{
  const clientId='qa-retained-grouping',result=fixture(clientId),control=result.source.assessments.find(record=>record.definition_id==='A.5.1');
  Object.assign(control,{status:'in_progress',implementation:'Retained native assessment narrative',assessment_history:[{status:'in_progress',at:'2026-10-01T12:00:00Z'}]});
  result.refresh();
  const staleGrouping={specification:'isms_clause',control:'legacy-unknown-group',control_name:'Retained duplicate grouping label',category:'legacy-obsolete-category'};
  Object.assign(control,staleGrouping);
  const before=JSON.stringify(result.source),themeTotal=result.source.definitions.filter(definition=>definition.control==='A.5').length;
  serve(result.source);await mount(clientId);
  expect(summary().querySelector('.now-head p').textContent).toBe('122 of 123 requirements and controls implemented');
  expect(card('ISMS Requirements').textContent).toContain('30 of 30 requirements implemented');
  await click(card('Annex A Controls'));
  expect(summary().querySelector('.now-head p').textContent).toBe('92 of 93 applicable controls implemented');
  const nativeTheme=group('annex_control/A.5');expect(nativeTheme).toBeTruthy();
  expect(nativeTheme.querySelector('.g-impl b').textContent).toBe(`${themeTotal-1} of ${themeTotal}`);
  expect(group('isms_clause/legacy-unknown-group')).toBeNull();await click(nativeTheme);
  expect(ids().filter(id=>id==='A.5.1')).toHaveLength(1);await click(row('A.5.1'));
  expect(editor().dataset.assessment).toBe(control.framework_assessment_id);expect(editor().dataset.client).toBe(clientId);
  expect(JSON.parse(container.querySelector('[data-testid="iso-native-history"]').textContent)).toEqual(control.assessment_history);
  await click(button('Close synthetic editor'));await click(button('Back to ISO overview'));await click(card('Statement of Applicability'));
  await click(group('annex_control/A.5'));await click(row('A.5.1'));
  expect(editor().dataset.assessment).toBe(control.framework_assessment_id);expect(params().get('iso_view')).toBe('soa');
  for(const view of ['', 'soa']){
    routerKey++;await mount(clientId,ROOT+'?'+new URLSearchParams({assessment:control.framework_assessment_id,...(view?{iso_view:view}:{})}));
    expect(editor().dataset.assessment).toBe(control.framework_assessment_id);
    expect(container.querySelector('.page-head h1').textContent).toBe(view?'Statement of Applicability':'Annex A Controls');
    expect(group('annex_control/A.5')).toBeTruthy();expect(group('isms_clause/legacy-unknown-group')).toBeNull();
  }
  expect(JSON.stringify(result.source)).toBe(before);for(const [key,value] of Object.entries(staleGrouping))expect(control[key]).toBe(value);noWrites();
});

test('SoA and Annex open the same native control, Continue, history, owner and management identity',async()=>{
  const clientId='qa-same-control',result=fixture(clientId),control=result.source.assessments.find(record=>record.definition_id==='A.5.1');
  Object.assign(control,{status:'in_progress',owner_id:'qa-native-owner',implementation:'Retained native control narrative',assessment_history:[{status:'in_progress',at:'2026-10-01T12:00:00Z',soa_applicability:'included'}]});
  result.refresh();const before=JSON.stringify(result.source);serve(result.source);await mount(clientId);await click(card('Statement of Applicability'));
  await click([...container.querySelectorAll('.head-actions button')].find(node=>node.textContent.startsWith('Continue: A.5.1 ')));
  expect(editor().dataset.assessment).toBe(control.framework_assessment_id);expect(editor().dataset.framework).toBe('iso-27001');expect(editor().dataset.version).toBe(result.source.framework.version);
  expect(editor().dataset.clientProp).toBe(clientId);expect(editor().dataset.owner).toBe(control.owner_id);expect(editor().dataset.management).toBe('false');
  expect(JSON.parse(container.querySelector('[data-testid="iso-native-history"]').textContent)).toEqual(control.assessment_history);
  expect([...editor().querySelectorAll('[data-drawer-crumb]')].map(node=>node.textContent)).toContain('Statement of Applicability');
  await click(button('Close synthetic editor'));await click(button('Back to ISO overview'));await click(card('Annex A Controls'));await click(group('annex_control/A.5'));await click(row('A.5.1'));
  expect(editor().dataset.assessment).toBe(control.framework_assessment_id);expect(container.querySelector('[data-testid="iso-native-implementation"]').textContent).toBe(control.implementation);
  expect([...editor().querySelectorAll('[data-drawer-crumb]')].map(node=>node.textContent)).toContain('Annex A Controls');
  await click(button('Close synthetic editor'));await click(row('A.5.1').querySelector('[aria-label^="Manage A.5.1 "]'));
  expect(editor().dataset.assessment).toBe(control.framework_assessment_id);expect(editor().dataset.management).toBe('true');
  expect(JSON.stringify(result.source)).toBe(before);noWrites();
});

test('direct control URLs, Back/Forward and a router remount preserve the actual native view and saved source',async()=>{
  const clientId='qa-urls',result=fixture(clientId),control=result.source.assessments.find(record=>record.definition_id==='A.7.1');
  const before=JSON.stringify(result.source);mockParams=new URLSearchParams('assessment='+encodeURIComponent(control.framework_assessment_id));serve(result.source);await mount(clientId);
  expect(editor().dataset.assessment).toBe(control.framework_assessment_id);expect(container.querySelector('.page-head h1').textContent).toBe('Annex A Controls');
  await click(button('Close synthetic editor'));await click(tab('Overview'));await click(card('Statement of Applicability'));await click(button('Back to ISO overview'));
  await click(button('History Back'));expect(container.querySelector('.page-head h1').textContent).toBe('Statement of Applicability');
  await click(button('History Forward'));expect(container.querySelector('.page-head h1').textContent).toBe('ISO 27001');
  await click(card('ISMS Requirements'));const url=container.querySelector('[aria-label="Current ISO workspace URL"]').textContent;
  await act(async()=>root.unmount());root=createRoot(container);routerKey++;await mount(clientId,url);
  expect(container.querySelector('.page-head h1').textContent).toBe('ISMS Requirements');expect(params().get('iso_view')).toBe('isms_clause');
  await click(button('Expand all'));expect(ids()).toEqual(result.source.definitions.filter(record=>record.specification==='isms_clause').map(record=>record.id));
  expect(JSON.stringify(result.source)).toBe(before);noWrites();
});

test('client switching withdraws the prior control and cannot reinterpret its identity under the next native program',async()=>{
  const first=fixture('qa-first-iso'),second=fixture('qa-second-iso');
  mockParams=new URLSearchParams('iso_view=soa&assessment='+encodeURIComponent('qa-first-iso:A.5.1'));serve(first.source);await mount(first.client.client_id);expect(editor().dataset.client).toBe(first.client.client_id);
  let finish;api.get.mockImplementation(path=>path==='/frameworks/iso-27001'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({data:[]}));
  await mount(second.client.client_id);expect(editor()).toBeNull();expect(container.querySelector('.iso-program-overview')).toBeNull();expect(container.textContent).toContain('Loading program workspace');
  serve(second.source);await act(async()=>finish({data:second.source}));expect(editor()).toBeNull();expect(container.textContent).toContain('This assessment is not available in the current client workspace.');
  await click(button('Back to ISO overview'));await click(card('Statement of Applicability'));await click(group('annex_control/A.5'));await click(row('A.5.1'));
  expect(editor().dataset.client).toBe(second.client.client_id);expect(editor().dataset.assessment).toBe('qa-second-iso:A.5.1');
  expect(api.get.mock.calls.filter(([path])=>path==='/frameworks/iso-27001').map(([,options])=>options.params.client_id)).toEqual([first.client.client_id,second.client.client_id]);noWrites();
});

test.each([
  ['missing current identity',result=>{result.source.assessments[0].framework_assessment_id=' ';}],
  ['duplicate current identity',result=>{result.source.assessments.push({...result.source.assessments[0]});}],
  ['foreign-only response',result=>{result.source.assessments=result.source.assessments.map(record=>({...record,client_id:'foreign-only'}));}],
])('%s withholds certified counts while preserving the native section destinations',async(_name,change)=>{
  const result=fixture('qa-invalid-source');change(result);const before=JSON.stringify(result.source);serve(result.source);await mount(result.client.client_id);
  expect(summary().querySelector('.now-head p').textContent).toBe('Implementation source unavailable');
  expect(summary().querySelector('.now-value').textContent).toBe('—');
  expect(card('Statement of Applicability').textContent).toContain('Applicability source unavailable');expect(editor()).toBeNull();
  expect(container.querySelectorAll('button.iso-program-card')).toHaveLength(4);
  await click(card('Internal Audit'));expect(params().get('iso_view')).toBe('audit');expect(editor()).toBeNull();
  expect(JSON.stringify(result.source)).toBe(before);noWrites();
});

test('later ISO enrollment preserves other native CIS and SOC records while the shared ISO views use only their own source',async()=>{
  const result=fixture('qa-later-mixed-iso'),others=addOtherPrograms(result),before=JSON.stringify(others),isoBefore=JSON.stringify(result.source);
  serve(result.source);await mount(result.client.client_id);expect(summary().querySelector('.now-head p').textContent).toBe('123 of 123 requirements and controls implemented');
  await click(card('ISMS Requirements'));await click(button('Expand all'));await click(row('4.1'));
  expect(editor().dataset.assessment).toBe(result.client.client_id+':4.1');expect(editor().dataset.framework).toBe('iso-27001');
  expect(JSON.stringify(others)).toBe(before);expect(JSON.stringify(result.source)).toBe(isoBefore);noWrites();
});
