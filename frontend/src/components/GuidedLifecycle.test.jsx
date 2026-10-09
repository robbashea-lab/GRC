import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import GuidedAssessor from './GuidedAssessor';
import * as guided from '@/lib/guidedAssessment';
import {omniCisSummary} from '@/lib/omniCisSummary';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:error=>error.message}));
let mockUser;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
let container,root,stored,props,history;
const token='2026-09-01T12:00:00Z',fingerprint='a'.repeat(64),base='/framework_assessments/lifecycle-1.1/guided-assessment';
const copy=value=>JSON.parse(JSON.stringify(value));
const record=extra=>({client_id:'demo_brawndo',framework_key:'cis-ig1',framework_assessment_id:'lifecycle-1.1',definition_id:'1.1',title:'Establish and Maintain Detailed Enterprise Asset Inventory',status:'addressed',verification:'verified',implementation:'Previously saved native position.',last_saved:token,last_assessed:token,assessment_history:[],work:{context_complete:true,finding_ids:[],review_ids:[],task_ids:[],open_findings:0,open_actions:0,overdue_reviews:0,priority_records:[]},...extra});
const interview=extra=>({client_id:'demo_brawndo',assessment_id:'lifecycle-1.1',user_id:'actor-a',version:guided.versionForSafeguard('1.1'),revision:0,answers:{},step:0,completed:false,narrative:'',result:null,base_assessment_token:token,base_scope_fingerprint:fingerprint,current_assessment_token:token,current_scope_fingerprint:fingerprint,lineage_known:true,lineage_stale:false,...extra});
function complete(version=guided.versionForSafeguard('1.1')){
  return Object.fromEntries(guided.catalogForVersion(version).safeguards['1.1'].map(q=>[q.id,q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='text'?(q.critical?'Synthetic recorded support':''):q.type==='date'?new Date().toISOString().slice(0,10):q.type==='multi'?[q.choices[0]]:q.id==='frequency'?'Every six months':q.id==='sources'?'One source':q.id==='unresolved'?'No':q.choices.includes('Yes')?'Yes':q.choices[0]]));
}
function completed(extra={}){
  const version=extra.version||guided.versionForSafeguard('1.1'),answers=complete(version),result=omniCisSummary('1.1',answers,version,'The organization').result;
  return interview({revision:3,version,answers,completed:true,result,narrative:'Original persisted recommendation.',generated_at:'2026-09-02T12:00:00Z',updated_at:'2026-09-02T12:00:00Z',...extra});
}
const button=name=>[...document.querySelectorAll('button')].find(element=>element.textContent.trim()===name);
async function render(extra={}){props={...props,...extra};await act(async()=>root.render(<GuidedAssessor {...props}/>));}
async function click(name){expect(button(name)).toBeTruthy();expect(button(name).disabled).toBe(false);await act(async()=>button(name).click());}
async function open(){await act(async()=>document.querySelector('[aria-label="Open Omnibot guide"]').click());}
async function value(selector,next){const target=document.querySelector(selector);expect(target).toBeTruthy();const prototype=target.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLTextAreaElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(target,next);target.dispatchEvent(new Event(target.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
async function remount(){await act(async()=>root.unmount());root=createRoot(container);await render();}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();window.history.replaceState({},'', '/');
  mockUser={user_id:'actor-a',workspace_mode:'demo'};container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  const current=record();stored=interview();history=[];
  props={clientId:'demo_brawndo',framework:'cis-ig1',configuration:{implementation_group:1},record:current,current,form:copy(current),contextComplete:true,related:{},onApply:jest.fn(),onOpenNative:jest.fn(),onSaveAssessment:jest.fn(async()=>true)};
  api.get.mockImplementation(async path=>({data:path.endsWith('/history')?{items:copy(history),has_more:false,next_before_revision:null}:{...copy(stored),current_assessment_token:props.current.last_saved||null,current_scope_fingerprint:fingerprint,lineage_stale:stored.base_assessment_token!==(props.current.last_saved||null)}}));
  api.put.mockImplementation(async(_path,body)=>{
    if(body.expected_revision!==stored.revision)throw new Error('Interview changed in another window');
    if(stored.revision&&(stored.completed||body.restart||body.rebase))history.push(copy(stored));
    stored={...stored,...copy(body),revision:body.expected_revision+1,generated_at:body.completed?'2026-10-09T12:00:00Z':null,updated_at:'2026-10-09T12:00:00Z'};
    return {data:{...copy(stored),current_assessment_token:props.current.last_saved||null,current_scope_fingerprint:fingerprint,lineage_stale:false}};
  });
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.restoreAllMocks();jest.clearAllMocks();});

test('opening a saved manual assessment preserves its position without an interview or native write',async()=>{
  const current=record({assessment_origin:'manual'}),before=JSON.stringify(current);await render({record:current,current,form:copy(current)});
  expect(document.querySelector('.guided-context-prompt').textContent).toContain('saved Implemented position');expect(document.querySelector('.omni-workspace-window')).toBeNull();
  await open();expect(document.querySelector('.omni-question-group')).toBeTruthy();expect(JSON.stringify(props.current)).toBe(before);expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
test('opening is intentional and minimizing preserves unsaved interview values',async()=>{
  await render();expect(document.querySelector('.omni-question-group')).toBeNull();await open();await click('Not sure');
  await act(async()=>document.querySelector('[aria-label="Minimize Omnibot Guide"]').click());await open();expect(button('Not sure').getAttribute('aria-pressed')).toBe('true');expect(api.put).not.toHaveBeenCalled();
});
test('resume saves the exact historical version and checkpoint without an automatic restart',async()=>{
  const old=guided.control1Catalog.version;stored=interview({version:old,revision:4,answers:{inventory:'Not sure'}});await render();await open();expect(button('Not sure').getAttribute('aria-pressed')).toBe('true');
  await click('Save & close');expect(api.put).toHaveBeenCalledWith(base,expect.objectContaining({version:old,expected_revision:4,answers:{inventory:'Not sure'},completed:false}));expect(api.put.mock.calls[0][1].restart).toBeUndefined();expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
test.each([true,false])('historical output remains unchanged on opening and history view (structured result: %s)',async recorded=>{
  stored=completed({version:guided.control1Catalog.version});if(!recorded)stored.result=null;history=[copy(stored)];const before=copy(stored);
  await render();await open();await click('Review interview history');expect(document.body.textContent).toContain('Original persisted recommendation.');expect(stored).toEqual(before);expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
test('viewing and closing reports no changes to native fields, dates, Findings or approvals',async()=>{
  stored=completed();const before=JSON.stringify(props.current);await render();await open();await act(async()=>document.querySelector('[aria-label="Close Omnibot Guide"]').click());
  expect(JSON.stringify(props.current)).toBe(before);expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(props.onOpenNative).not.toHaveBeenCalled();
});
test('linked native Finding context is read-only in the approved guide and retains the native callback',async()=>{
  const finding={finding_id:'f-a',client_id:'demo_brawndo',title:'Original native Finding',status:'open'};await render({related:{findings:[finding]}});await open();expect(props.related.findings).toEqual([finding]);expect(props.onOpenNative).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
  // Native linked-record navigation is exercised through the actual parent in GuidedLifecycleNative.test.jsx.
  expect(props.onOpenNative).toEqual(expect.any(Function));
});
test('read-only saved interviews allow viewing and block assessment saving and new-review mutations',async()=>{
  stored=completed({version:guided.control1Catalog.version});await render({disabled:true});await open();expect(button('Update assessment').disabled).toBe(true);expect(button('Save & close').disabled).toBe(true);expect(button('Begin a new review').disabled).toBe(true);expect(document.querySelector('[aria-label="Omnibot implementation summary"]').disabled).toBe(true);expect(api.put).not.toHaveBeenCalled();
});
test('failed GET reports unavailable interview context and cannot create an assessment',async()=>{
  api.get.mockRejectedValueOnce(new Error('Synthetic interview unavailable'));await render();await open();expect(document.querySelector('[role="alert"]').textContent).toContain('Synthetic interview unavailable');expect(document.body.textContent).toContain('This saved assessment remains valid without an Omni interview');expect(document.querySelector('.omni-question-group')).toBeNull();expect(button('Save assessment')).toBeUndefined();expect(api.put).not.toHaveBeenCalled();
});
test('reviewed text can be saved exactly but unsaved native edits and stale lineage block authoritative save',async()=>{
  stored=completed();await render();await open();await value('[aria-label="Omnibot implementation summary"]','An exact reviewed interview edit.');expect(button('Update assessment').disabled).toBe(false);
  await render({assessmentDirty:true});expect(button('Update assessment').disabled).toBe(true);await render({assessmentDirty:false,current:record({last_saved:'2026-10-05T12:00:00Z'})});
  expect(button('Update assessment').disabled).toBe(true);expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
test('failed explicit upgrade retains original result, question version and CAS revision',async()=>{
  stored=completed({version:guided.control1Catalog.version});const before=copy(stored);await render();await open();api.put.mockRejectedValueOnce(new Error('Synthetic restart conflict'));await click('Begin a new review');await click('Confirm restart');
  expect(document.querySelector('[role="alert"]').textContent).toContain('Synthetic restart conflict');expect(stored).toEqual(before);expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(before.narrative);expect(api.put).toHaveBeenCalledWith(base,expect.objectContaining({version:guided.versionForSafeguard('1.1'),restart:true,expected_revision:3,answers:{},completed:false,result:null}));
});
test('explicit upgrade after native Save uses the current visible base and preserves old history',async()=>{
  stored=completed({version:guided.control1Catalog.version});const before=copy(stored),nativeToken='2026-10-07T13:00:00Z';await render({current:record({last_saved:nativeToken})});await open();await click('Begin a new review');await click('Confirm restart');
  expect(api.put).toHaveBeenCalledWith(base,expect.objectContaining({restart:true,expected_revision:3,answers:{},completed:false,result:null,base_assessment_token:nativeToken,base_scope_fingerprint:fingerprint}));expect(stored.revision).toBe(4);expect(history[0]).toEqual(before);expect(props.current.implementation).toBe('Previously saved native position.');
});
test('first empty interview uses the refreshed native base without creating synthetic history',async()=>{
  const nativeToken='2026-10-07T13:00:00Z';stored=interview({base_assessment_token:nativeToken});await render({current:record({last_saved:nativeToken})});await open();await click('No');await click('Save & close');
  expect(api.put).toHaveBeenCalledWith(base,expect.objectContaining({expected_revision:0,base_assessment_token:nativeToken,base_scope_fingerprint:fingerprint}));expect(api.put.mock.calls[0][1].restart).toBeUndefined();expect(history).toEqual([]);expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
test.each([{revision:4},{current_assessment_token:'2026-10-07T13:00:00Z'},{current_scope_fingerprint:'b'.repeat(64)}])('changed restart context preserves the original interview and rejects new tokens: %j',async change=>{
  stored=completed({version:guided.control1Catalog.version});const before=copy(stored);await render();await open();api.get.mockResolvedValueOnce({data:{...copy(stored),...change}});await click('Begin a new review');await click('Confirm restart');
  expect(api.put).not.toHaveBeenCalled();expect(stored).toEqual(before);expect(document.querySelector('[role="alert"]').textContent).toContain('Reopen the assessment');expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(before.narrative);
});
test('closing an invitation preserves intentional access and a fresh visit restores the approved greeting',async()=>{
  await render();expect(document.querySelector('.guided-context-prompt')).toBeTruthy();await act(async()=>document.querySelector('[aria-label="Close invitation"]').click());expect(document.querySelector('.guided-context-prompt')).toBeNull();await open();expect(document.querySelector('.omni-workspace-window')).toBeTruthy();await remount();expect(document.querySelector('.guided-context-prompt')).toBeTruthy();expect(api.put).not.toHaveBeenCalled();
});
test.each(['personal invitation preference','quiet session preference'])('%s remains isolated while the approved intentional launcher stays accessible',async kind=>{
  const key='guided-pilot-ui:actor-a:demo_brawndo:cis-ig1:focused-invitations';if(kind==='personal invitation preference')localStorage.setItem(key,JSON.stringify({invitationsDisabled:true}));else sessionStorage.setItem(key+':quiet','1');
  await render();expect(document.querySelector('.guided-context-prompt')).toBeNull();await open();expect(document.querySelector('.omni-workspace-window')).toBeTruthy();expect(api.put).not.toHaveBeenCalled();
});
test('personal invitation preferences and saved interviews are isolated on user switch',async()=>{
  stored=completed();await render();await open();await act(async()=>document.querySelector('[aria-label="Close Omnibot Guide"]').click());localStorage.setItem('guided-pilot-ui:actor-b:demo_brawndo',JSON.stringify({invitationsDisabled:true}));
  stored=interview({user_id:'actor-b'});mockUser={user_id:'actor-b',workspace_mode:'demo'};await render();expect(document.querySelector('.guided-context-prompt')).toBeNull();await open();expect(document.body.textContent).not.toContain('Original persisted recommendation.');expect(api.put).not.toHaveBeenCalled();
});
test('switching users resets a visible invitation to the new user preference',async()=>{
  await render();expect(document.querySelector('.guided-context-prompt')).toBeTruthy();localStorage.setItem('guided-pilot-ui:actor-b:demo_brawndo',JSON.stringify({invitationsDisabled:true}));mockUser={user_id:'actor-b',workspace_mode:'demo'};stored=interview({user_id:'actor-b'});await render();expect(document.querySelector('.guided-context-prompt')).toBeNull();expect(document.querySelector('[aria-label="Open Omnibot guide"]')).toBeTruthy();
});
test('persistent invitation preference survives a new browser session without hiding deliberate access',async()=>{
  localStorage.setItem('guided-pilot-ui:actor-a:demo_brawndo:cis-ig1:focused-invitations',JSON.stringify({invitationsDisabled:true}));await render();sessionStorage.clear();await remount();expect(document.querySelector('.guided-context-prompt')).toBeNull();await open();expect(document.querySelector('.omni-workspace-window')).toBeTruthy();expect(api.put).not.toHaveBeenCalled();
});
test('an aborted earlier user GET cannot overwrite the new user context',async()=>{
  let resolveOld;api.get.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}));await render();mockUser={user_id:'actor-b',workspace_mode:'demo'};stored=interview({user_id:'actor-b'});await render();await open();await act(async()=>resolveOld({data:completed()}));expect(document.body.textContent).not.toContain('Original persisted recommendation.');expect(document.body.textContent).not.toContain('does not match this assessment context');expect(api.put).not.toHaveBeenCalled();
});
test('late prior-user interview history is never displayed to the new actor',async()=>{
  let resolveHistory;await render();await open();api.get.mockImplementationOnce(()=>new Promise(resolve=>{resolveHistory=resolve;}));await click('Review interview history');mockUser={user_id:'actor-b',workspace_mode:'demo'};stored=interview({user_id:'actor-b'});await render();await act(async()=>resolveHistory({data:{items:[completed({narrative:'Private prior-actor interview history.'})],has_more:false,next_before_revision:null}}));expect(document.body.textContent).not.toContain('Private prior-actor interview history.');expect(api.put).not.toHaveBeenCalled();
});
test('switching clients preserves independent interviews and native saved records',async()=>{
  stored=completed();await render();await open();const clientId='configured-other-client',current=record({client_id:clientId,framework_assessment_id:'other-1.1',implementation:'Independent native position.'});stored=interview({client_id:clientId,assessment_id:'other-1.1'});await render({clientId,record:current,current,form:copy(current)});await open();
  expect(document.body.textContent).not.toContain('Original persisted recommendation.');expect(props.current.implementation).toBe('Independent native position.');expect(api.get).toHaveBeenLastCalledWith('/framework_assessments/other-1.1/guided-assessment',expect.objectContaining({signal:expect.any(AbortSignal)}));expect(api.put).not.toHaveBeenCalled();
});
test('explicit reviewed upgrade retains compatible answers and manual text in a new incomplete checkpoint',async()=>{
  stored=completed({version:guided.control1Catalog.version,narrative:'Manual historical multiline context.\nKeep this exact line.'});const before=copy(stored);await render();await open();expect(button('Update assessment').disabled).toBe(true);await click('Begin a new review');await act(async()=>document.querySelector('[aria-label="Confirm restart"] input').click());await click('Confirm restart');
  expect(stored.version).toBe(guided.versionForSafeguard('1.1'));expect(stored.completed).toBe(false);expect(stored.answers.inventory).toBe(before.answers.inventory);expect(stored.narrative).toBe(before.narrative);expect(history[0]).toEqual(before);expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test.each(['brawndo-cis-pilot-1','cis-v8.1-control1-2'])('explicit1.2 reuse upgrade from %s leaves contradictory legacy actions unanswered and preserves historical text',version=>{
  const current=record({definition_id:'1.2',framework_assessment_id:'lifecycle-1.2',title:'Address Unauthorized Assets'});props={...props,record:current,current,form:copy(current)};
  stored=interview({assessment_id:'lifecycle-1.2',version,revision:4,answers:{process:'Yes',frequency:'Weekly',actions:['None','Quarantine or isolate']},narrative:'Historical reviewed manual text.\nKeep this exact line.'});
  const before=copy(stored);return (async()=>{await render();await open();await click('Begin a new review');await act(async()=>document.querySelector('[aria-label="Confirm restart"] input').click());await click('Confirm restart');
    expect(stored.version).toBe(guided.versionForSafeguard('1.2'));expect(stored.completed).toBe(false);expect(stored.answers.process).toBe('Yes');expect(stored.answers.frequency).toBe('Weekly');expect(stored.answers.actions).toBeUndefined();expect(stored.narrative).toBe(before.narrative);expect(history[0]).toEqual(before);expect(props.onSaveAssessment).not.toHaveBeenCalled();
  })();
});
test('explicit1.1 v1 reuse retains optional factual context and safely leaves newly invalid row unanswered',async()=>{
  stored=interview({version:'brawndo-cis-pilot-1',revision:4,answers:{inventory:'Yes',system:'Original inventory system',owner:'Original responsible team',sources:'One source',reconciled:'Yes',attributes:{'Hardware address':'Not applicable'}},narrative:'Unchanged historical manual implementation.'});const before=copy(stored);
  await render();await open();await click('Begin a new review');await act(async()=>document.querySelector('[aria-label="Confirm restart"] input').click());await click('Confirm restart');
  expect(stored.version).toBe(guided.versionForSafeguard('1.1'));for(const key of ['system','owner','sources','reconciled'])expect(stored.answers[key]).toBe(before.answers[key]);
  expect(stored.answers.attributes?.['Hardware address']).toBeUndefined();expect(stored.narrative).toBe(before.narrative);expect(history[0]).toEqual(before);expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('unexpected compatibility preparation failure leaves the saved interview intact and gives an actionable retry',async()=>{
  stored=completed({version:guided.control1Catalog.version});const before=copy(stored);await render();await open();await click('Begin a new review');await act(async()=>document.querySelector('[aria-label="Confirm restart"] input').click());
  jest.spyOn(guided,'compatibleInterviewAnswers').mockImplementationOnce(()=>{throw new Error('Synthetic compatibility preparation failure');});await click('Confirm restart');
  expect(api.put).not.toHaveBeenCalled();expect(stored).toEqual(before);expect(document.querySelector('[role="alert"]').textContent).toContain('Your saved interview is unchanged');expect(document.querySelector('[role="alert"]').textContent).toContain('Cancel this new review and reopen it before retrying');expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
