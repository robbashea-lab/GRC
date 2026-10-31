import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import FrameworkWorkspace from './FrameworkWorkspace';
import {frameworkCatalog} from '@/lib/frameworks';
import {initialAuditState,auditPackage} from '@/lib/isoAudit';
import api from '@/lib/api';

let mockUser,mockParams;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:mockUser.workspace_mode==='demo'?'demo':'standard'})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
jest.mock('@/components/IsoGuidedAssessor',()=>()=>null);
jest.mock('@/components/FrameworkDrawer',()=>({record,onSaved,onOpenChange,recordManagement})=>{
  const [draft,setDraft]=require('react').useState('Synthetic unsaved native draft');
  return <section data-testid="iso-opened" data-assessment={record.framework_assessment_id} data-client={record.client_id} data-management={recordManagement?'true':'false'}>
    <input aria-label="Synthetic native draft" value={draft} onChange={event=>setDraft(event.target.value)}/>
    <button onClick={onSaved}>Simulate same-origin refresh</button><button onClick={()=>onOpenChange(false)}>Close synthetic editor</button>
  </section>;
});

let root,container;
function data(clientId,extra={}){
  const definitions=frameworkCatalog('iso-27001').requirements;
  return {configured:true,selected:true,definitions,assessments:definitions.map(definition=>({...definition,client_id:clientId,framework_key:'iso-27001',framework_assessment_id:clientId+':'+definition.id,definition_id:definition.id,status:'addressed',soa_applicability:definition.specification==='annex_control'?'included':undefined})),work:{},configuration:{},...extra};
}
function reviews(clientId){
  const state=initialAuditState('governance-risk'),historical=initialAuditState('governance-risk');
  historical.items=Object.fromEntries(auditPackage('governance-risk').items.slice(0,3).map(item=>[item.key,{status:'reviewed',result:'conforming'}]));
  return [{review_id:'qa-audit',client_id:clientId,owner_id:'qa-user',title:'Synthetic audit',status:'in_progress',due_date:'2026-03-31',iso_audit:state,occurrences:[{review_id:'qa-audit',client_id:clientId,occurrence_id:'qa-2025',status:'completed',due_date:'2025-03-31',completed_at:'2025-04-01T12:00:00Z',iso_audit:historical}]}];
}
function serve(response,audits=[]){api.get.mockImplementation(async path=>({data:path==='/frameworks/iso-27001'?response:path==='/iso-audit'?{program:{status:'active',activated_at:'2025-01-01',configuration:{start_date:'2025-01-01'}},reviews:audits}:[]}));}
async function mount(clientId){await act(async()=>root.render(<MemoryRouter initialEntries={['/compliance/iso-27001?'+mockParams.toString()]}><FrameworkWorkspace frameworkKey="iso-27001" clientId={clientId}/></MemoryRouter>));}
const tab=name=>[...container.querySelector('[aria-label="ISO workspace sections"]').querySelectorAll('button')].find(button=>button.textContent===name);
const card=name=>[...container.querySelectorAll('.iso-program-card')].find(button=>button.getAttribute('aria-label')?.startsWith('Open '+name+'.'));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers().setSystemTime(new Date('2026-10-31T10:00:00Z'));
  mockUser={user_id:'qa-user',role:'super_admin',workspace_mode:'demo'};mockParams=new URLSearchParams();
  sessionStorage.clear();localStorage.clear();api.get.mockReset();api.patch.mockReset();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});

test.each([
  ['demo_dunder','demo'],['new-iso-client','demo'],['later-enrolled-iso','demo'],['mixed-framework-client','demo'],
  ['existing-auth-iso','standard'],['new-auth-iso','standard'],['later-auth-iso','standard'],['mixed-auth-iso','standard'],
])('%s in %s receives the four native ISO destinations through shared framework selection',async(clientId,mode)=>{
  mockUser.workspace_mode=mode;serve(data(clientId));await mount(clientId);
  expect(container.querySelector('.iso-program-visual')).toBeTruthy();expect(container.querySelectorAll('button.iso-program-card')).toHaveLength(4);
  for(const [title,view] of [['Statement of Applicability','soa'],['ISMS Requirements','isms_clause'],['Annex A Controls','annex_control'],['Internal Audit','audit']]){
    await act(async()=>card(title).click());expect(tab(title).getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby')).toBe('iso-tab-'+view);
    await act(async()=>tab('Overview').click());
  }
  expect(api.patch).not.toHaveBeenCalled();
});

test('historical audit year survives overview card → audit → overview navigation',async()=>{
  const clientId='qa-year';serve(data(clientId),reviews(clientId));await mount(clientId);
  await act(async()=>{const field=container.querySelector('[aria-label="Audit-program year"]');field.value='2025';field.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(card('Internal Audit').textContent).toContain('3 of');
  await act(async()=>card('Internal Audit').click());
  expect(container.querySelector('[aria-label="Audit-program year"]').value).toBe('2025');
  await act(async()=>tab('Overview').click());
  expect(container.querySelector('[aria-label="Audit-program year"]').value).toBe('2025');expect(card('Internal Audit').textContent).toContain('3 of');
});

test('actor change withdraws the old ISO view until its current authorized response arrives',async()=>{
  const response=data('qa-context');serve(response);await mount('qa-context');expect(card('Statement of Applicability')).toBeTruthy();
  let finish;api.get.mockImplementation(path=>path==='/frameworks/iso-27001'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({data:[]}));
  mockUser={user_id:'qa-reader',role:'client_readonly',workspace_mode:'demo'};await mount('qa-context');
  expect(container.querySelector('.iso-program-visual')).toBeNull();expect(container.textContent).toContain('Loading program workspace');
  serve(response);await act(async()=>finish({data:response}));expect(card('Statement of Applicability')).toBeTruthy();
});

test('a retained year without this client’s audit records remains explicit in both views without creating history',async()=>{
  const clientId='qa-retained-year',current=reviews(clientId);current[0].occurrences=[];
  const before=JSON.stringify(current);mockParams=new URLSearchParams('audit_year=2025');serve(data(clientId),current);await mount(clientId);
  expect(container.querySelector('[aria-label="Audit-program year"]').value).toBe('2025');
  expect(card('Internal Audit').textContent).toContain('0 of 0 planned audit checks completed · 2025');
  await act(async()=>card('Internal Audit').click());
  expect(container.querySelector('[aria-label="Audit-program year"]').value).toBe('2025');
  expect(container.textContent).toContain('Not scheduled');expect(JSON.stringify(current)).toBe(before);expect(api.patch).not.toHaveBeenCalled();
});

test('same-origin refresh preserves an open editor and its unsaved local draft',async()=>{
  const clientId='qa-draft',response=data(clientId);mockParams=new URLSearchParams('iso_view=isms_clause&assessment='+encodeURIComponent(clientId+':4.1'));
  serve(response);await mount(clientId);const draft=container.querySelector('[aria-label="Synthetic native draft"]');expect(draft).toBeTruthy();
  let finish;api.get.mockImplementation(path=>path==='/frameworks/iso-27001'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({data:[]}));
  await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Simulate same-origin refresh').click());
  expect(container.querySelector('[aria-label="Synthetic native draft"]')).toBe(draft);
  await act(async()=>finish({data:{...response,work:{refreshed:true}}}));
  expect(container.querySelector('[aria-label="Synthetic native draft"]')).toBe(draft);expect(draft.value).toBe('Synthetic unsaved native draft');
});

test('current-client filtering precedes the definition join and exact ISO record opening',async()=>{
  const clientId='qa-scope',response=data(clientId);response.assessments[1].status='needs_attention';
  response.assessments.push({...response.assessments[0],client_id:'foreign-client',framework_assessment_id:'foreign-record',status:'needs_attention'});
  mockParams=new URLSearchParams('iso_view=isms_clause&view=needs_attention');serve(response);await mount(clientId);
  const matches=[...container.querySelectorAll('[data-testid^="requirement-"]')];expect(matches).toHaveLength(1);
  await act(async()=>matches[0].querySelector('button').click());
  expect(container.querySelector('[data-testid="iso-opened"]').dataset.assessment).toBe(response.assessments[1].framework_assessment_id);
  expect(container.querySelector('[data-testid="iso-opened"]').dataset.client).toBe(clientId);expect(api.patch).not.toHaveBeenCalled();
});

test('unconfigured onboarding and deselected historical access keep their native states',async()=>{
  serve(data('qa-unconfigured',{configured:false,definitions:[],assessments:[]}));await mount('qa-unconfigured');
  expect(container.textContent).toContain('Configure in Client Profile');expect(container.querySelector('.iso-program-card')).toBeNull();
  serve(data('qa-historical',{selected:false}));await mount('qa-historical');
  expect(container.textContent).toContain('Historical program');expect(card('Statement of Applicability')).toBeTruthy();expect(api.patch).not.toHaveBeenCalled();
});
