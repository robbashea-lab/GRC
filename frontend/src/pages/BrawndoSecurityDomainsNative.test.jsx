import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation} from 'react-router-dom';
import FrameworkWorkspace from './FrameworkWorkspace';
import api from '@/lib/api';
import {cis} from '@/lib/frameworks';
import {versionForSafeguard,visibleQuestions} from '@/lib/guidedAssessment';
import {focusedResult} from '@/lib/focusedOmni';
import mapping from '@catalogs/brawndoSecurityDomains.json';
import pilot from '@catalogs/brawndoSecurityDomainsPilot.json';

// Real routing, dialogs, native editor, items, findings and Omnibot are retained.
// The actor, network/persistence boundary and rollout flag are synthetic. Canonical
// targeting metadata remains real so a gate-only rollback can still run this suite.
let mockUser;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),put:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('@catalogs/brawndoSecurityDomainsPilot.json',()=>({...jest.requireActual('@catalogs/brawndoSecurityDomainsPilot.json'),enabled:true}));

const CLIENT=pilot.clientId,TOKEN='2026-10-14T12:00:00Z',FINGERPRINT='a'.repeat(64);
const definitions=cis.requirements.filter(definition=>definition.implementation_group===1);
const clone=value=>JSON.parse(JSON.stringify(value));
const emptyRelated=()=>({reviews:[],evidence:[],findings:[],tasks:[],risks:[],policies:[]});
let root,container,records,interviews,related,group,workspaceClient,deniedContext,saveRevision;
const query=selector=>document.querySelector(selector);
const button=(name,scope=document)=>[...scope.querySelectorAll('button')].find(element=>element.textContent.trim()===name);
const native=()=>query('[data-testid="brawndo-cis-assessment"]');
const omni=()=>native()?.querySelector('[aria-label="CIS assessment interview"]');
const route=()=>JSON.parse(query('[data-testid="native-route"]').textContent);
function RouteProbe(){const location=useLocation();return <output data-testid="native-route">{JSON.stringify({search:location.search,state:location.state})}</output>;}
const record=id=>records.find(value=>value.definition_id===id);
const interview=id=>({client_id:CLIENT,assessment_id:'native-'+id,user_id:'native-actor',version:versionForSafeguard(id),revision:0,answers:{},step:0,completed:false,narrative:'',result:null,base_assessment_token:TOKEN,current_assessment_token:TOKEN,base_scope_fingerprint:FINGERPRINT,current_scope_fingerprint:FINGERPRINT,lineage_known:true,lineage_stale:false});
function workspace(){
  const keys=['addressed','in_progress','needs_attention','not_assessed'];
  const counts=keys.map(key=>({key,count:records.filter(value=>value.status===key).length}));
  const excluded=records.filter(value=>value.status==='not_applicable').length;
  return {framework:{key:'cis-ig1',version:'8.1'},selected:true,configured:true,configuration:{implementation_group:group},definitions,
    assessments:clone(records),active_definition_ids:definitions.map(value=>value.id),guided_assessment_drafts:{},organizational_controls:[],
    work:Object.fromEntries(records.map(value=>[value.framework_assessment_id,{context_complete:true,evidence_count:(related[value.definition_id]?.evidence||[]).length,review_ids:[],finding_ids:[],task_ids:[],priority_records:[]}])),
    implementation_position:{program_id:CLIENT+':cis-ig1',availability:'available',total:records.length,denominator:records.length-excluded,excluded,implemented:counts[0].count,counts,missing_records:0,unrecognized_status_count:0}};
}
function readInterview(id){return {...clone(interviews[id]),current_assessment_token:record(id).last_saved,current_scope_fingerprint:FINGERPRINT,lineage_stale:interviews[id].base_assessment_token!==record(id).last_saved};}
function completedInterview(id){
  const version=versionForSafeguard(id),rootAnswer={[id==='1.1'?'inventory':'process']:'Yes'};
  const today=new Date(),day=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  const answers=Object.fromEntries(visibleQuestions(id,rootAnswer,version).map(question=>[question.id,question.optional?'No':question.type==='matrix'?Object.fromEntries(question.rows.map(row=>[row,'Yes'])):question.type==='text'?question.id==='system'?'Synthetic inventory':question.id==='owner'?'Synthetic owner':'':question.type==='date'?day:question.type==='multi'?['Quarantine or isolate']:question.id==='frequency'?(id==='1.1'?'Every six months':'Weekly'):question.id==='sources'?'One source':question.id==='unresolved'?'No':'Yes']));
  const result=focusedResult(id,answers,version);expect(result.status).toBe('addressed');
  return {...interview(id),revision:2,answers,completed:true,result,narrative:result.narrative,generated_at:'2026-10-14T12:10:00Z'};
}
async function click(element){expect(element).toBeTruthy();await act(async()=>element.click());}
async function clickName(name,scope=document){await click(button(name,scope));}
async function value(label,text){const element=query(`[aria-label="${label}"]`);expect(element).toBeTruthy();const prototype=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,text);element.dispatchEvent(new Event('input',{bubbles:true}));});}
async function mount(clientId=CLIENT,initialSearch=''){
  workspaceClient=clientId;
  await act(async()=>root.render(<MemoryRouter initialEntries={['/compliance/cis-ig1'+initialSearch]}><RouteProbe/><FrameworkWorkspace frameworkKey="cis-ig1" clientId={clientId}/></MemoryRouter>));
}
async function remount(clientId=workspaceClient,search=''){
  await act(async()=>root.unmount());root=createRoot(container);await mount(clientId,search);
}
async function expandDomain(id){const toggle=query(`[data-testid="security-domain-${id}"]`);expect(toggle).toBeTruthy();if(toggle.getAttribute('aria-expanded')!=='true')await click(toggle);}
async function openDomain(id){const domain=mapping.domains.find(value=>value.safeguardIds.includes(id));await expandDomain(domain.id);await click(query(`[data-testid="domain-safeguard-${id}"]`));expect(native()).toBeTruthy();}
async function closeNative(){await clickName('Close',native());expect(native()).toBeNull();}
async function frame(){await act(async()=>{await new Promise(resolve=>requestAnimationFrame(resolve));});}
async function openControl(id){
  const control=id.split('.')[0];
  const current=query(`[data-testid="requirement-${id}"]`);
  if(!current){
    const crumb=[...container.querySelectorAll('.bcis-crumbs button')].find(element=>element.textContent==='CIS IG1');
    if(crumb)await click(crumb);
    await click(query(`[data-testid="control-row-${control}"]`));
  }
  await click(query(`[data-testid="requirement-${id}"]`));expect(native()).toBeTruthy();
}
function editorSnapshot(){return {title:native().querySelector('h2').textContent,official:native().querySelector('[data-source-kind="official"]').textContent,implementation:native().querySelector('[aria-label="Current implementation"]').value,status:native().querySelector('input[name="bcsg-status"]:checked').value,verification:native().querySelector('[aria-label="Saved verification"]').textContent,items:native().querySelector('[aria-label="Items to address"]').textContent,findings:native().querySelector('.bcsg-findings').textContent};}
async function tab(name){const target=[...native().querySelectorAll('[role="tab"]')].find(element=>element.textContent===name);expect(target).toBeTruthy();await act(async()=>target.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));}
async function openOmni(){
  const summary=native().querySelector('.assessment-summary');
  if(!summary.open)await click(summary.querySelector('summary'));
  await act(async()=>summary.dispatchEvent(new Event('toggle')));
  expect(omni()).toBeTruthy();expect(omni().hidden).toBe(false);
}

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();group=1;deniedContext=false;saveRevision=0;pilot.enabled=true;
  mockUser={user_id:'native-actor',role:'super_admin'};
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  records=definitions.map(definition=>({client_id:CLIENT,framework_key:'cis-ig1',framework_version:'8.1',framework_assessment_id:'native-'+definition.id,definition_id:definition.id,status:'not_assessed',verification:'needs_validation',owner_id:'native-owner',implementation:'Original native '+definition.id,technology:'Recorded native platform',notes:'Preserved original notes '+definition.id,last_saved:TOKEN,last_assessed:null,items_to_address:[],items_revision:0,assessment_history:[],related_links:[]}));
  interviews=Object.fromEntries(definitions.map(definition=>[definition.id,interview(definition.id)]));related={};
  api.get.mockImplementation(async(path,options)=>{
    if(path==='/frameworks/cis-ig1'){
      if(deniedContext)throw new Error('Access denied for this client program');
      expect(options.params.client_id).toBe(workspaceClient);return {data:workspace()};
    }
    const assessment=path.match(/^\/framework_assessments\/native-([^/]+)\/(related|activity|guided-assessment)(\/history)?$/);
    if(assessment){const [,id,kind,history]=assessment;return {data:kind==='related'?clone(related[id]||emptyRelated()):kind==='activity'?[]:history?{items:[],next_before_revision:null}:readInterview(id)};}
    if(path.endsWith('/members'))return {data:[{user_id:'native-owner',name:'Synthetic owner',role:'client_contributor'}]};
    if(path==='/organizational-controls')return {data:{items:[],has_more:false,migration_pending:0}};
    return {data:[]};
  });
  api.patch.mockImplementation(async(path,body)=>{
    const id=path.replace('/framework_assessments/native-','');const previous=record(id);
    if(!previous)throw new Error('Unexpected write target '+path);
    if(body.expected_last_assessed!==previous.last_saved)throw new Error('Assessment changed in another window');
    const {expected_last_assessed,...fields}=body;
    const savedAt=`2026-10-14T13:00:${String(++saveRevision).padStart(2,'0')}Z`;
    const updated={...previous,...clone(fields),last_saved:savedAt,last_assessed:savedAt,assessment_history:[...previous.assessment_history,{...clone(fields),at:savedAt,by:mockUser.user_id}]};
    records=records.map(value=>value.definition_id===id?updated:value);return {data:clone(updated)};
  });
  api.put.mockImplementation(async(path,body)=>{
    const id=path.match(/^\/framework_assessments\/native-(.+)\/guided-assessment$/)?.[1];
    if(!id)throw new Error('Unexpected interview target '+path);
    const previous=interviews[id];if(body.expected_revision!==previous.revision)throw new Error('Interview changed in another window');
    interviews[id]={...previous,...clone(body),revision:previous.revision+1,generated_at:body.completed?'2026-10-14T12:20:00Z':null};return {data:readInterview(id)};
  });
  api.post.mockImplementation(async path=>{throw new Error('Unexpected creation '+path);});
  api.delete.mockImplementation(async path=>{throw new Error('Unexpected deletion '+path);});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('all 56 domain and Controls shortcuts enter the exact same native editor and route without writes',async()=>{
  await mount();
  const seen=[];
  for(const domain of mapping.domains){
    await expandDomain(domain.id);
    for(const id of domain.safeguardIds){
      await openDomain(id);const domainRoute=route();const domainView=editorSnapshot();
      expect(document.querySelectorAll('[data-testid="brawndo-cis-assessment"]')).toHaveLength(1);
      expect(new URLSearchParams(domainRoute.search).get('assessment')).toBe('native-'+id);
      expect(domainRoute.state).toEqual({fromWorkspace:true});
      expect(domainView.title).toBe(definitions.find(definition=>definition.id===id).title);
      expect(domainView.official).toBe(definitions.find(definition=>definition.id===id).official_text);
      await closeNative();await openControl(id);
      expect(route()).toEqual(domainRoute);expect(editorSnapshot()).toEqual(domainView);
      expect(api.get.mock.calls.filter(([path])=>path===`/framework_assessments/native-${id}/related`).length).toBeGreaterThanOrEqual(2);
      await closeNative();seen.push(id);
    }
  }
  expect(new Set(seen).size).toBe(56);expect(seen).toEqual(mapping.domains.flatMap(domain=>domain.safeguardIds));
  expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
},90000);

test.each(['1.1','1.2','12.1'])('%s saves from each entry path, reloads the native record and refreshes original progress plus domain counts',async id=>{
  const domain=mapping.domains.find(value=>value.safeguardIds.includes(id));
  record(id).items_to_address=[{item_id:'existing-item',text:'Preserve native item',state:'open',resolution:'Original resolution',history:[]}];
  related[id]={...emptyRelated(),evidence:[{evidence_id:'existing-evidence',filename:'Original evidence.txt',client_id:CLIENT,linked_type:'framework_assessment',linked_id:'native-'+id}],findings:[{finding_id:'existing-finding',title:'Original linked finding',status:'open',severity:'medium',client_id:CLIENT,framework_assessment_id:'native-'+id}]};
  const preserved=clone({items:record(id).items_to_address,related:related[id],owner:record(id).owner_id,verification:record(id).verification});
  await mount();await openDomain(id);
  expect(native().textContent).toContain('Preserve native item');expect(native().textContent).toContain('Original linked finding');
  await value('Current implementation','Exact manual domain wording '+id);await click(native().querySelector('input[value="addressed"]'));await clickName('Save assessment',native());
  expect(api.patch).toHaveBeenLastCalledWith('/framework_assessments/native-'+id,expect.objectContaining({implementation:'Exact manual domain wording '+id,status:'addressed',verification:'needs_validation',owner_id:'native-owner',expected_last_assessed:TOKEN}));
  expect(native().textContent).toContain('Assessment saved.');await closeNative();
  expect(container.querySelector('[data-testid="bcis-seg-addressed"]').getAttribute('aria-label')).toContain('1 of 56');
  expect(query(`[data-testid="security-domain-${domain.id}"]`).textContent).toContain('1 of '+domain.safeguardIds.length);
  await openControl(id);expect(editorSnapshot().implementation).toBe('Exact manual domain wording '+id);
  await value('Current implementation','Exact manual Controls wording '+id);await clickName('Save assessment',native());await closeNative();await openDomain(id);
  expect(editorSnapshot().implementation).toBe('Exact manual Controls wording '+id);expect(editorSnapshot().status).toBe('addressed');
  await closeNative();await remount();await openControl(id);
  expect(editorSnapshot().implementation).toBe('Exact manual Controls wording '+id);
  expect(record(id).assessment_history).toHaveLength(2);expect(record(id).items_to_address).toEqual(preserved.items);expect(related[id]).toEqual(preserved.related);expect(record(id).owner_id).toBe(preserved.owner);expect(record(id).verification).toBe(preserved.verification);
  expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
});

test('domain entry keeps the native draft leave guard, cancel and explicit discard behavior',async()=>{
  const before=clone(records);await mount();await openDomain('1.1');
  await value('Current implementation','Unsaved native manual text');await clickName('Close',native());
  expect(document.body.textContent).toContain('Leave unsaved changes?');await clickName('Keep editing');
  expect(native().querySelector('[aria-label="Current implementation"]').value).toBe('Unsaved native manual text');
  await clickName('Next',native());await clickName('Discard changes');
  expect(new URLSearchParams(route().search).get('assessment')).toBe('native-1.2');
  expect(native().querySelector('[aria-label="Current implementation"]').value).toBe('Original native 1.2');
  await closeNative();await openControl('1.1');expect(editorSnapshot().implementation).toBe('Original native 1.1');
  expect(records).toEqual(before);expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('domain native save rejects a stale record without overwriting manual wording or history',async()=>{
  await mount();await openDomain('1.1');await value('Current implementation','Locally reviewed native wording');
  record('1.1').last_saved='2026-10-14T12:30:00Z';record('1.1').implementation='Concurrent authoritative wording';
  await clickName('Save assessment',native());
  expect(native().textContent).toContain('Assessment changed in another window');
  expect(native().querySelector('[aria-label="Current implementation"]').value).toBe('Locally reviewed native wording');
  expect(record('1.1').implementation).toBe('Concurrent authoritative wording');expect(record('1.1').assessment_history).toEqual([]);
});

test('clearing only the domain selection retains native status and safeguard search filters',async()=>{
  record('1.1').status='addressed';await mount();
  const statusFilter=()=>[...container.querySelectorAll('.bcis-legend button')].find(element=>element.textContent.startsWith('Not assessed'));
  await click(statusFilter());await value('Search safeguards','1.2');
  const originalResults=[...container.querySelectorAll('[data-testid^="requirement-"]')].map(element=>element.dataset.testid);
  expect(originalResults).toEqual(['requirement-1.2','requirement-11.2']);
  await expandDomain('assets');await click(query('[aria-label="View mapped controls for Asset & Software Management"]'));
  expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(1);
  await clickName('Clear domain filter');
  expect(query('[aria-label="Search safeguards"]').value).toBe('1.2');
  expect(statusFilter().getAttribute('aria-pressed')).toBe('true');
  expect([...container.querySelectorAll('[data-testid^="requirement-"]')].map(element=>element.dataset.testid)).toEqual(originalResults);
});

test('mapped Controls receives focus and a saved row that leaves its filter returns to an available native context',async()=>{
  await mount();await click([...container.querySelectorAll('.bcis-legend button')].find(element=>element.textContent.startsWith('Not assessed')));
  await value('Search safeguards','1.1');await expandDomain('assets');
  const shortcut=query('[aria-label="View mapped controls for Asset & Software Management"]');shortcut.focus();await click(shortcut);await frame();
  const controls=container.querySelector('.bcis-controls');expect(document.activeElement).toBe(controls.querySelector('[aria-current="page"]'));
  const opener=container.querySelector('[data-testid="requirement-1.1"]');opener.focus();await click(opener);
  await click(native().querySelector('input[value="addressed"]'));await clickName('Save assessment',native());
  expect(container.querySelector('[data-testid="requirement-1.1"]')).toBeNull();
  await closeNative();await frame();
  expect(document.activeElement).not.toBe(document.body);expect(controls.contains(document.activeElement)).toBe(true);
  expect(query('[aria-label="Search safeguards"]').value).toBe('1.1');
});

test.each(['client_readonly','client_contributor'])('%s retains native edit restrictions after opening a domain shortcut',async role=>{
  mockUser.role=role;await mount();await openDomain('1.1');
  expect(native().querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
  expect(button('Save assessment',native())).toBeUndefined();
  expect(native().querySelector('fieldset').disabled).toBe(true);
  await tab('Items to address');expect(button('Raise Finding',native())).toBeUndefined();
  expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

test('disabling the pilot removes domains while native Controls and the original safeguard remain safe',async()=>{
  pilot.enabled=false;const before=clone(records);await mount();
  expect(query('.bcis-domains')).toBeNull();expect(container.querySelectorAll('[data-testid^="control-row-"]')).toHaveLength(15);
  await openControl('1.1');expect(new URLSearchParams(route().search).get('assessment')).toBe('native-1.1');
  expect(editorSnapshot()).toEqual(expect.objectContaining({title:definitions.find(definition=>definition.id==='1.1').title,official:definitions.find(definition=>definition.id==='1.1').official_text,implementation:'Original native 1.1',status:'not_assessed',verification:'Needs validation'}));
  await closeNative();expect(records).toEqual(before);expect(pilot.enabled).toBe(false);
  expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
});

test('another client cannot receive pilot shortcuts or resolve a foreign assessment deep link',async()=>{
  await mount('other-client','?assessment=native-1.1');
  expect(query('.bcis-domains')).toBeNull();expect(native()).toBeNull();
  expect(container.textContent).toContain('This assessment is not available in the current client workspace.');
  expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test.each([2,3])('Brawndo IG%s does not activate domains or substitute native group context',async implementationGroup=>{
  group=implementationGroup;await mount();expect(query('.bcis-domains')).toBeNull();
  await openControl('1.1');expect(native().querySelector('.bcis-crumbs').textContent).toContain('CIS IG'+implementationGroup);
  expect(api.patch).not.toHaveBeenCalled();
});

test('native authorization/context rejection does not turn domain entry into a write path',async()=>{
  await mount();deniedContext=true;await openDomain('1.1');
  expect(native().textContent).toContain('Access denied for this client program');
  expect(button('Save assessment',native()).disabled).toBe(true);expect(api.patch).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test.each(['1.1','1.2'])('%s Omnibot interview saving resumes from Controls after domain entry without replacing manual implementation',async id=>{
  const before=clone(record(id));await mount();await openDomain(id);await openOmni();
  await clickName('No',omni());await clickName('Save & close',omni());
  expect(api.put).toHaveBeenCalledWith('/framework_assessments/native-'+id+'/guided-assessment',expect.objectContaining({expected_revision:0,completed:false,answers:expect.objectContaining({[id==='1.1'?'inventory':'process']:'No'})}));
  expect(api.patch).not.toHaveBeenCalled();expect(record(id)).toEqual(before);
  await closeNative();await openControl(id);await openOmni();
  expect(button('No',omni()).getAttribute('aria-pressed')).toBe('true');
  expect(record(id).implementation).toBe(before.implementation);expect(record(id).verification).toBe(before.verification);
});

test.each(['domain','Controls'])('a reviewed Omnibot summary from %s uses native save only after confirming replacement, and reopens from the other path',async entry=>{
  const id='1.1';interviews[id]=completedInterview(id);const before=clone(record(id));await mount();
  if(entry==='domain')await openDomain(id);else await openControl(id);
  await openOmni();await value('Omnibot implementation summary','Exact operator-reviewed Omnibot wording');
  await clickName('Update assessment',omni());
  expect(document.body.textContent).toContain('Update this assessment?');expect(api.patch).not.toHaveBeenCalled();
  await clickName('Cancel',query('.omni-refined-close'));expect(record(id)).toEqual(before);
  await clickName('Update assessment',omni());await clickName('Yes, update assessment',query('.omni-refined-close'));
  expect(api.patch).toHaveBeenCalledTimes(1);expect(api.patch).toHaveBeenCalledWith('/framework_assessments/native-1.1',expect.objectContaining({implementation:'Exact operator-reviewed Omnibot wording',status:'addressed',verification:'needs_validation',expected_last_assessed:TOKEN,guided_assessment_source:expect.objectContaining({version:versionForSafeguard(id),revision:3})}));
  expect(record(id).assessment_history).toHaveLength(1);expect(record(id).notes).toBe(before.notes);expect(record(id).owner_id).toBe(before.owner_id);
  await closeNative();if(entry==='domain')await openControl(id);else await openDomain(id);
  expect(editorSnapshot().implementation).toBe('Exact operator-reviewed Omnibot wording');expect(editorSnapshot().status).toBe('addressed');
});
