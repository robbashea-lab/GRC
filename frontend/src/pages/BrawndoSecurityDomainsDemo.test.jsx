import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation} from 'react-router-dom';
import FrameworkWorkspace from './FrameworkWorkspace';
import api from '@/lib/api';
import {readStore} from '@/preview/store';
import {securityDomainsEnabled,securityDomainModel} from '@/lib/brawndoSecurityDomains';
import {cisSummary} from '@/lib/cisVerification';

// Exercise the production Demo adapter and seed, not a recreated mockup dataset.
let mockUser;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>{
  const axios=require('axios').default;
  const {previewAdapter}=require('@/preview/adapter');
  return {__esModule:true,default:axios.create({adapter:previewAdapter}),formatError:error=>error.response?.data?.detail||error.message};
});
jest.mock('@catalogs/brawndoSecurityDomainsPilot.json',()=>({...jest.requireActual('@catalogs/brawndoSecurityDomainsPilot.json'),enabled:true}));

const CLIENT='demo_brawndo';
let root,container,currentCase;
const query=selector=>document.querySelector(selector);
const native=()=>query('[data-testid="brawndo-cis-assessment"]');
const button=(name,scope=document)=>[...scope.querySelectorAll('button')].find(element=>element.textContent.trim()===name);
const route=()=>JSON.parse(query('[data-testid="demo-route"]').textContent);
const clone=value=>JSON.parse(JSON.stringify(value));
function RouteProbe(){const location=useLocation();return <output data-testid="demo-route">{JSON.stringify({search:location.search,state:location.state})}</output>;}
const ensureCurrent=owner=>{if(!owner.active||owner!==currentCase)throw new Error('Demo native case has ended');};
const workspace=async(clientId=CLIENT,framework='cis-ig1')=>{const owner=currentCase;const response=await api.get('/frameworks/'+framework,{params:{client_id:clientId}});ensureCurrent(owner);return response.data;};
// This is the same public response projection consumed by FrameworkWorkspace.
const rowsOf=data=>data.definitions.map(definition=>({...definition,...data.assessments.find(row=>row.definition_id===definition.id),work:data.work[data.assessments.find(row=>row.definition_id===definition.id).framework_assessment_id]}));
const modelOf=data=>securityDomainModel(data,rowsOf(data),CLIENT);
async function settle(owner=currentCase){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});ensureCurrent(owner);}
async function click(element){const owner=currentCase;expect(element).toBeTruthy();await act(async()=>element.click());ensureCurrent(owner);await settle(owner);}
async function value(label,text){const owner=currentCase,element=query(`[aria-label="${label}"]`);expect(element).toBeTruthy();const prototype=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,text);element.dispatchEvent(new Event('input',{bubbles:true}));});ensureCurrent(owner);}
async function mount(clientId=CLIENT,framework='cis-ig1'){
  const owner=currentCase;await act(async()=>root.render(<MemoryRouter initialEntries={['/compliance/'+framework]}><RouteProbe/><FrameworkWorkspace frameworkKey={framework} clientId={clientId}/></MemoryRouter>));
  ensureCurrent(owner);await settle(owner);
}
async function openDomain(id){const domain=modelOf(await workspace()).find(value=>value.safeguardIds.includes(id));const toggle=query(`[data-testid="security-domain-${domain.id}"]`);if(toggle.getAttribute('aria-expanded')!=='true')await click(toggle);await click(query(`[data-testid="domain-safeguard-${id}"]`));expect(native()).toBeTruthy();}
async function openControl(id){const current=query(`[data-testid="requirement-${id}"]`);if(!current){const crumb=[...container.querySelectorAll('.bcis-crumbs button')].find(element=>element.textContent==='CIS IG1');if(crumb)await click(crumb);await click(query(`[data-testid="control-row-${id.split('.')[0]}"]`));}await click(query(`[data-testid="requirement-${id}"]`));expect(native()).toBeTruthy();}
const snapshot=()=>({id:new URLSearchParams(route().search).get('assessment'),title:native().querySelector('h2').textContent,implementation:native().querySelector('[aria-label="Current implementation"]').value,status:native().querySelector('input[type="radio"]:checked')?.value});

beforeEach(async()=>{
  currentCase={active:true};global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();
  mockUser=(await api.post('/demo/enter')).data.user;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{currentCase.active=false;await act(async()=>root.unmount());container.remove();});

test('the actual Explore Demo seed supplies the exact 56-record native domain model and current assessment totals',async()=>{
  const data=await workspace(),rows=rowsOf(data),domains=securityDomainModel(data,rows,CLIENT);
  expect(mockUser).toMatchObject({user_id:'demo_admin',workspace_mode:'demo'});
  expect(data).toMatchObject({selected:true,configured:true,framework:{key:'cis-ig1',version:'8.1'},configuration:{implementation_group:1},implementation_position:{program_id:CLIENT+':cis-ig1',denominator:56,excluded:0,implemented:41}});
  expect(rows).toHaveLength(56);expect(new Set(rows.map(row=>row.framework_assessment_id)).size).toBe(56);
  expect(cisSummary(rows)).toMatchObject({total:56,applicable:56,addressed:41,partial:8,gap:4,notAssessed:3,assessed:53,na:0});
  expect(securityDomainsEnabled(CLIENT,'cis-ig1',data,mockUser)).toBe(true);
  expect(domains).toHaveLength(11);expect(domains.every(domain=>domain.available)).toBe(true);
  expect(domains.flatMap(domain=>domain.rows)).toHaveLength(56);
  for(const domain of domains){
    expect(domain.addressed).toBe(domain.rows.filter(row=>row.status==='addressed').length);
    expect(domain.assessed).toBe(domain.rows.filter(row=>!['not_assessed','not_applicable'].includes(row.status)).length);
    expect(domain.applicable).toBe(domain.rows.filter(row=>row.status!=='not_applicable').length);
    for(const row of domain.rows)expect(row).toBe(rows.find(nativeRow=>nativeRow.framework_assessment_id===row.framework_assessment_id));
  }
});

test.each(['domain','Controls'])('the actual Demo %s entry opens the canonical seeded record below the original progress section',async entry=>{
  const before=readStore(),data=await workspace(),row=data.assessments.find(value=>value.definition_id==='1.1');
  await mount();const progress=container.querySelector('.bcis-summary'),domains=query('.bcis-domains'),controls=container.querySelector('.bcis-controls');
  expect(domains).toBeTruthy();expect(controls).toBeTruthy();expect(progress).toBeTruthy();
  expect(progress.contains(domains)).toBe(true);expect(domains.compareDocumentPosition(controls)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  if(entry==='domain')await openDomain('1.1');else await openControl('1.1');
  expect(snapshot()).toEqual({id:row.framework_assessment_id,title:data.definitions.find(definition=>definition.id==='1.1').title,implementation:row.implementation,status:row.status});
  expect(route().state).toEqual({fromWorkspace:true});
  expect(readStore().framework_assessments).toEqual(before.framework_assessments);
});

test.each(['domain','Controls'])('an actual Demo %s save updates the canonical session record while retaining other native records and history',async entry=>{
  const before=await workspace(),original=before.assessments.find(row=>row.definition_id==='1.1'),otherRows=before.assessments.filter(row=>row.definition_id!=='1.1');
  const beforeStore=readStore(),unrelated=clone({evidence:beforeStore.evidence,findings:beforeStore.findings,tasks:beforeStore.tasks,guided:beforeStore.guided_assessment_pilot});
  await mount();if(entry==='domain')await openDomain('1.1');else await openControl('1.1');
  const implementation='Demo-only reviewed '+entry+' wording';await value('Current implementation',implementation);
  await click(native().querySelector('input[value="addressed"]'));await click(button('Save assessment',native()));
  expect(native().textContent).toContain('Assessment saved.');expect(snapshot().implementation).toBe(implementation);
  const after=await workspace(),saved=after.assessments.find(row=>row.definition_id==='1.1');
  expect(saved.framework_assessment_id).toBe(original.framework_assessment_id);expect(saved.client_id).toBe(CLIENT);
  expect(saved.implementation).toBe(implementation);expect(saved.assessment_history.slice(0,original.assessment_history.length)).toEqual(original.assessment_history);expect(saved.assessment_history).toHaveLength(original.assessment_history.length+1);
  for(const field of ['notes','owner_id','verification','items_to_address','related_links'])expect(saved[field]).toEqual(original[field]);
  expect(after.assessments.filter(row=>row.definition_id!=='1.1')).toEqual(otherRows);
  const afterStore=readStore();expect({evidence:afterStore.evidence,findings:afterStore.findings,tasks:afterStore.tasks,guided:afterStore.guided_assessment_pilot}).toEqual(unrelated);
  expect(saved.status).toBe('addressed');expect(after.implementation_position.implemented).toBe(before.implementation_position.implemented+(original.status==='addressed'?0:1));expect(modelOf(after).every(domain=>domain.available)).toBe(true);
  // A fresh adapter read uses the retained browser session, never a backend write.
  expect((await api.get('/auth/me')).data.workspace_mode).toBe('demo');
});

test('the native Demo record is read back from retained session state by a fresh workspace mount',async()=>{
  const before=await workspace(),row=before.assessments.find(value=>value.definition_id==='1.1');
  const saved=(await api.patch('/framework_assessments/'+row.framework_assessment_id,{implementation:'Session-local Demo wording after reload',status:'in_progress',expected_last_assessed:row.last_saved??row.last_assessed??null})).data;
  await mount();await openDomain('1.1');expect(snapshot()).toMatchObject({id:row.framework_assessment_id,implementation:saved.implementation,status:'in_progress'});
  expect((await api.get('/framework_assessments/'+row.framework_assessment_id)).data).toEqual(saved);
});

test('native Demo applicability excludes a justified safeguard without partial credit or invented coverage',async()=>{
  const before=await workspace(),row=before.assessments.find(value=>value.status==='not_assessed');
  await api.patch('/framework_assessments/'+row.framework_assessment_id,{status:'not_applicable',na_rationale:'Isolated test rationale for this Demo session only.',expected_last_assessed:row.last_saved??row.last_assessed??null});
  const after=await workspace(),domains=modelOf(after),domain=domains.find(value=>value.safeguardIds.includes(row.definition_id));
  expect(after.implementation_position).toMatchObject({total:56,denominator:55,excluded:1,implemented:41});
  expect(after.implementation_position.percentage).toBeCloseTo(41/55*100);
  expect(cisSummary(rowsOf(after))).toMatchObject({total:56,assessed:53,notAssessed:2,addressed:41,partial:8,gap:4,na:1,applicable:55});
  expect(domains.every(value=>value.available)).toBe(true);expect(domain.na).toBe(1);expect(domain.applicable).toBe(domain.total-1);
  expect(domain.addressed).toBe(domain.rows.filter(value=>value.status==='addressed').length);
});

test('the actual Demo filter intersection clears only the domain and retains native search and status',async()=>{
  const data=await workspace(),row=data.assessments.find(value=>value.definition_id==='1.2');
  const labels={addressed:'Implemented',in_progress:'Partial',needs_attention:'Not implemented',not_assessed:'Not assessed'};
  await mount();const legend=[...container.querySelectorAll('.bcis-legend button')].find(element=>element.textContent.startsWith(labels[row.status]));
  await click(legend);await value('Search safeguards','1.2');
  const results=()=>[...container.querySelectorAll('[data-testid^="requirement-"]')].map(element=>element.dataset.testid),original=results();expect(original).toContain('requirement-1.2');
  await click(query('[data-testid="security-domain-assets"]'));await click(query('[aria-label="View mapped controls for Asset & Software Management"]'));
  expect(results()).toEqual(['requirement-1.2']);await click(button('Clear domain filter'));
  expect(query('[aria-label="Search safeguards"]').value).toBe('1.2');expect(legend.getAttribute('aria-pressed')).toBe('true');expect(results()).toEqual(original);
});

test('actual Demo stale writes are rejected and interview checkpoint reads do not replace manual assessment text',async()=>{
  const data=await workspace(),row=data.assessments.find(value=>value.definition_id==='1.2'),path='/framework_assessments/'+row.framework_assessment_id;
  const draft=(await api.get(path+'/guided-assessment')).data;
  const checkpoint=(await api.put(path+'/guided-assessment',{version:draft.version,answers:{process:'No'},step:0,completed:false,expected_revision:draft.revision,base_assessment_token:draft.current_assessment_token,base_scope_fingerprint:draft.current_scope_fingerprint})).data;
  expect((await api.get(path)).data).toEqual(row);expect((await api.get(path+'/guided-assessment')).data.answers).toEqual({process:'No'});
  const winning=(await api.patch(path,{implementation:'Demo native winning wording',expected_last_assessed:row.last_saved??row.last_assessed??null})).data;
  await expect(api.patch(path,{implementation:'Rejected stale Demo wording',expected_last_assessed:row.last_saved??row.last_assessed??null})).rejects.toMatchObject({response:{status:409}});
  expect((await api.get(path)).data).toEqual(winning);
  const reopened=(await api.get(path+'/guided-assessment')).data;expect(reopened.answers).toEqual(checkpoint.answers);expect(reopened.revision).toBe(checkpoint.revision);expect(reopened.lineage_stale).toBe(true);
});

test.each([['demo_prestige','soc-2'],['demo_dunder','iso-27001']])('actual Demo client %s / %s retains its native workspace without pilot domains',async(clientId,framework)=>{
  const before=readStore().framework_assessments;await mount(clientId,framework);
  expect(container.querySelectorAll('.bcis-domains')).toHaveLength(0);expect(container.textContent).not.toContain('Loading program workspace.');
  expect(readStore().framework_assessments).toEqual(before);
});


test('actual Initech IG2 retains its complete native CIS domains without mutations',async()=>{
 const before=readStore().framework_assessments;
 await mount('demo_initech','cis-ig1');
 expect(container.querySelector('.bcis-domains')).toBeTruthy();
 expect(container.textContent).toContain('CIS IG2');
 const data=await workspace('demo_initech');
 expect(data.configuration.implementation_group).toBe(2);
 expect(data.active_definition_ids).toHaveLength(130);
 expect(readStore().framework_assessments).toEqual(before);
});
