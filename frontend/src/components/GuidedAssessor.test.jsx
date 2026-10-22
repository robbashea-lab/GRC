import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import GuidedAssessor from './GuidedAssessor';
import {nativeCisQuestionTitle} from './RefinedOmniInterview';
import {guidedCatalog,control1Catalog,versionForSafeguard} from '@/lib/guidedAssessment';
import {omniCisSummary} from '@/lib/omniCisSummary';
import api from '@/lib/api';
import {isWorkspacePresentation} from '@/lib/reference';
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:e=>e.message}));
let mockWorkspaceMode;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'pilot-test',workspace_mode:mockWorkspaceMode}})}));
let root,container,draft,props;
const fingerprint='a'.repeat(64);
const record=(id='1.1',clientId='demo_brawndo')=>({client_id:clientId,framework_key:'cis-ig1',framework_assessment_id:'pilot-'+id,definition_id:id,title:guidedCatalog.definitions[id].title,status:'not_assessed',implementation:'',verification:'not_verified',last_saved:null,assessment_history:[],work:{context_complete:true,open_findings:0,open_actions:0,overdue_reviews:0,priority_records:[]}});
const interview=id=>({client_id:props.clientId,assessment_id:'pilot-'+id,user_id:'pilot-test',version:versionForSafeguard(id),answers:{},step:0,completed:false,revision:0,narrative:'',result:null,base_assessment_token:null,current_assessment_token:null,base_scope_fingerprint:fingerprint,current_scope_fingerprint:fingerprint,lineage_known:true,lineage_stale:false});
const button=name=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===name);
async function render(p={}){props={...props,...p};await act(async()=>root.render(<GuidedAssessor {...props}/>));}
async function click(name){expect(button(name)).toBeTruthy();expect(button(name).disabled).toBe(false);await act(async()=>button(name).click());}
async function open(){await act(async()=>document.querySelector('[aria-label="Open Omnibot guide"]').click());}
function reviewClock(today){
  const RealDate=Date;
  global.Date=class extends RealDate{
    constructor(...args){super(...(args.length?args:[today.getTime()]));}
    static now(){return today.getTime();}
  };
  return()=>{global.Date=RealDate;};
}
function complete(id){return Object.fromEntries(guidedCatalog.safeguards[id].map(q=>[q.id,q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='text'?'':q.type==='date'?new Date().toISOString().slice(0,10):q.type==='multi'?['Quarantine or isolate']:q.id==='frequency'?(id==='1.1'?'Every six months':'Weekly'):q.id==='sources'?'One source':q.id==='unresolved'?'No':q.choices.includes('Yes')?'Yes':q.choices[0]]));}
function savedComplete(id){const answers=complete(id),result=omniCisSummary(id,answers,versionForSafeguard(id),'The organization').result;draft={...interview(id),answers,result,narrative:result.narrative,completed:true,revision:2,generated_at:'2026-10-09T12:00:00Z'};}
beforeEach(()=>{
  mockWorkspaceMode=undefined;global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();window.history.replaceState({},'', '/');
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  const current=record();props={clientId:'demo_brawndo',framework:'cis-ig1',configuration:{implementation_group:1},record:current,current,form:{...current},contextComplete:true,onApply:jest.fn(),onSaveAssessment:jest.fn(async()=>true),onDraftChange:jest.fn()};
  draft=interview('1.1');api.get.mockImplementation(async()=>({data:draft}));
  api.put.mockImplementation(async(_path,body)=>({data:draft={...draft,...body,revision:draft.revision+1,generated_at:body.completed?'2026-10-09T12:00:00Z':null}}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each([['demo_dunder','demo'],['demo_prestige','demo'],['demo_initech','demo'],['existing-authenticated-client','standard'],['future-client','standard'],['newly-onboarded-synthetic-client','standard']])('approved presentation preserves legacy interview version and reported answers for %s',async(clientId,mode)=>{
  mockWorkspaceMode=mode;expect(isWorkspacePresentation(clientId,{workspace_mode:mode})).toBe(true);
  const current=record('1.1',clientId);props={...props,clientId,record:current,current,form:{...current}};
  draft={...interview('1.1'),version:control1Catalog.version,answers:{inventory:'Not sure'},revision:3};
  await render();await open();expect(document.querySelector('.omni-workspace-window')).toBeTruthy();expect(document.querySelector('.omni-approved')).toBeTruthy();
  expect(button('Not sure').getAttribute('aria-pressed')).toBe('true');expect(document.body.textContent).toContain('Updated assessment guidance is available');
  expect(api.put).not.toHaveBeenCalled();await click('Save & close');
  expect(api.put).toHaveBeenCalledWith('/framework_assessments/pilot-1.1/guided-assessment',expect.objectContaining({answers:{inventory:'Not sure'},version:control1Catalog.version,expected_revision:3,completed:false}));
  expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('dashboard greeting, actual recommendation navigation, dismissal and reopening use the approved flow',async()=>{
  const first=record(),second=record('1.2'),onSelect=jest.fn();
  await render({record:undefined,current:undefined,rows:[first,second],onSelect});
  expect(document.body.textContent).toContain('Hi, I’m Omnibot.');expect(document.querySelectorAll('.guided-context-prompt button')).toHaveLength(1);
  await open();expect(document.body.textContent).toContain('Omnibot’s recommended next steps');await click('Open safeguard 1.1');expect(onSelect).toHaveBeenCalledWith(expect.objectContaining(first));
  await open();await act(async()=>document.querySelector('[aria-label="Close Omnibot Guide"]').click());expect(document.querySelector('.omni-workspace-window')).toBeNull();
  await open();expect(document.body.textContent).toContain('Omnibot’s recommended next steps');expect(api.get).not.toHaveBeenCalled();
});
test.each([['other','cis-ig1','99.1'],['demo_brawndo','soc-2','1.1'],['demo_brawndo','iso-27001','1.1'],['demo_brawndo','cis-ig1','1.3']])('scope exclusions %s %s %s',async(clientId,framework,id)=>{
  await render({clientId,framework,record:{...record(),client_id:clientId,definition_id:id}});expect(document.querySelector('[data-testid="guided-pilot"]')).toBeNull();expect(api.get).not.toHaveBeenCalled();
});
test.each(['1.1','1.2'])('%s interview saves progress, resumes, and requires explicit native replacement confirmation',async id=>{
  const current={...record(id),implementation:'Existing narrative'};props={...props,record:current,current,form:{...current}};draft=interview(id);
  await render();await open();await click('No');await click('Save & close');expect(draft.answers[id==='1.1'?'inventory':'process']).toBe('No');expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await open();expect(button('No').getAttribute('aria-pressed')).toBe('true');
  while(button('Save & next'))await click('Save & next');expect(document.body.textContent).toContain('Not Implemented');
  await click('Update assessment');await click('Cancel');expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await click('Update assessment');await click('Yes, update assessment');expect(props.onSaveAssessment).toHaveBeenCalledWith(expect.objectContaining({status:'needs_attention',guided_assessment_source:expect.objectContaining({version:versionForSafeguard(id)})}),JSON.stringify(current));
  expect(props.onSaveAssessment.mock.calls[0][0].verification).toBeUndefined();expect(props.onApply).not.toHaveBeenCalled();
});
test('empty critical answers remain unknown and no tool or native result is invented',async()=>{
  draft={...draft,answers:{inventory:'Not sure'},revision:1};await render();await open();
  while(button('Save & next'))await click('Save & next');expect(document.body.textContent).toContain('Not Assessed');
  expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).not.toContain('NinjaOne');expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
test('thinking is tied to an outstanding save and minimizing preserves answers',async()=>{
  await render();await open();await click('Yes');let finish;
  api.put.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await click('Save & next');expect(document.querySelector('.omni-thinking')).toBeTruthy();
  await act(async()=>finish({data:{...draft,answers:{inventory:'Yes'},step:1,revision:1}}));expect(document.querySelector('.omni-thinking')).toBeNull();
  await act(async()=>document.querySelector('[aria-label="Minimize Omnibot Guide"]').click());await open();await click('Back');expect(button('Yes').getAttribute('aria-pressed')).toBe('true');
});
test('complete state restores persisted summary, status and source without a write',async()=>{
  const current=record('1.2');props={...props,record:current,current,form:{...current}};savedComplete('1.2');const original=JSON.stringify(draft);
  await render();await open();expect(document.body.textContent).toContain('Implemented');expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(draft.narrative);
  expect(JSON.stringify(draft)).toBe(original);expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test('review clock keeps the displayed and committed CIS status across midnight without refreshing manual wording',async()=>{
  const today=new Date(2026,9,15,0,1);
  const restoreClock=reviewClock(today);
  try{
    expect(new Date().getTime()).toBe(today.getTime());
    const answers={...complete('1.1'),last_review:'2026-04-12'},result=omniCisSummary('1.1',answers,versionForSafeguard('1.1'),'The organization',new Date(2026,9,12,23,59)).result;
    result.narrative='Reviewer wording retained across midnight.\n\nControls in place\n• Recorded inventory practices.';
    draft={...draft,answers,result,narrative:result.narrative,completed:true,revision:2,generated_at:'2026-10-12T23:59:00Z'};
    await render({inline:true,inlineOpen:true});
    expect(document.body.textContent).toContain('Proposed Implementation Status: Implemented');
    expect(document.body.textContent).not.toContain('prior completion recommendation is not supported');
    expect(document.querySelector('[aria-label="Omnibot implementation summary"]').value).toBe(result.narrative);
    expect(api.put).not.toHaveBeenCalled();
    await click('Save assessment');
    expect(api.put.mock.calls.at(-1)[1].result).toEqual(result);
    expect(props.onSaveAssessment).toHaveBeenCalledWith(expect.objectContaining({status:'addressed',implementation:result.narrative}),JSON.stringify(props.form));
    expect(document.body.textContent).toContain('Proposed Implementation Status: Implemented');
  }finally{restoreClock();}
});

test('review clock survives own applied native rebase before an unchanged old-date save',async()=>{
  const today=new Date(2026,9,15,0,1);
  const restoreClock=reviewClock(today);
  try{
    expect(new Date().getTime()).toBe(today.getTime());
    const answers={...complete('1.1'),last_review:'2026-04-12'},result=omniCisSummary('1.1',answers,versionForSafeguard('1.1'),'The organization',new Date(2026,9,12,23,59)).result;
    const generated_at='2026-10-12T23:59:00Z',last_saved='2026-10-13T00:00:00Z';
    const current={...record(),status:'addressed',implementation:result.narrative,last_saved,guided_assessment_source:{version:versionForSafeguard('1.1'),revision:2,generated_at,answers,by:'pilot-test',origin:'guided-assessment-pilot'}};
    props={...props,record:current,current,form:{...current}};
    draft={...interview('1.1'),answers,result,narrative:result.narrative,completed:true,revision:2,generated_at,current_assessment_token:last_saved,lineage_stale:true};
    api.put.mockImplementation(async(_path,body)=>({data:draft={...draft,...body,revision:draft.revision+1,result:body.completed?body.result:null,generated_at:body.completed?generated_at:null}}));
    await render({inline:true,inlineOpen:true});
    expect(document.body.textContent).toContain('Proposed Implementation Status: Implemented');
    expect(document.body.textContent).not.toContain('Recorded answers do not support');
    await click('Update assessment');await click('Yes, update assessment');
    expect(api.put.mock.calls.map(([,body])=>body.completed)).toEqual([false,true]);
    expect(api.put.mock.calls[0][1].rebase).toBe(true);
    expect(api.put.mock.calls[1][1].result).toEqual(result);
    expect(props.onSaveAssessment).toHaveBeenCalledWith(expect.objectContaining({status:'addressed',implementation:result.narrative}),JSON.stringify(props.form));
  }finally{restoreClock();}
});
test('Omni SVG is local, decorative and motion and responsive styles are defined',()=>{
  const fs=require('node:fs'),path=require('node:path'),asset=fs.readFileSync(path.join(__dirname,'OmniCharacter.jsx'),'utf8'),css=fs.readFileSync(path.join(__dirname,'GuidedAssessor.css'),'utf8');
  expect(asset).toContain('aria-hidden="true"');expect(asset).not.toMatch(/https?:|paperclip|clippy|microsoft/i);expect(asset).toContain("import naraOwl from '@/assets/nara-owl.webp'");expect(asset).toContain("import naraAvatar from '@/assets/nara-avatar.webp'");expect(asset).toContain('href={naraOwl}');expect(asset).toContain('href={naraAvatar}');expect(asset).not.toContain('omni-approved-shell.png');
  expect(css).toContain('prefers-reduced-motion:reduce');expect(css).toContain('animation:none');expect(css).toContain('max-width:800px');expect(css).toContain('width:48px; height:48px');
});
test.each(['2.1','7.3','11.2','14.1','17.2','18.5'])('%s reuses approved save failure, replacement protection and resume behavior',async id=>{
  const current={...record(id),implementation:'Preserve original narrative'};props={...props,configuration:{implementation_group:3},record:current,current,form:{...current}};draft=interview(id);
  await render();await open();await click('No');api.put.mockRejectedValueOnce(new Error('Synthetic save failure'));await click('Save & next');
  expect(document.querySelector('[role="alert"]').textContent).toContain('Synthetic save failure');expect(button('No').getAttribute('aria-pressed')).toBe('true');expect(draft.revision).toBe(0);
  await click('Save & next');await click('Save & close');await open();while(button('Save & next'))await click('Save & next');
  expect(document.body.textContent).toContain('Not Implemented');await click('Update assessment');await click('Cancel');expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await click('Update assessment');await click('Yes, update assessment');expect(props.onSaveAssessment).toHaveBeenCalledWith(expect.objectContaining({status:'needs_attention',guided_assessment_source:expect.objectContaining({version:versionForSafeguard(id)})}),JSON.stringify(current));expect(props.onApply).not.toHaveBeenCalled();
});
test('overview uses supplied user-scoped draft summaries without fetching every interview',async()=>{
  await render({record:undefined,current:undefined,rows:[record('2.1'),record()],draftSummaries:{'2.1':{revision:2,completed:false}},onSelect:jest.fn()});await open();
  expect(button('Open safeguard 2.1')).toBeTruthy();expect(api.get).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('· Control 1');
});

test.each(['1.1','1.2'])('original v1 safeguard %s opens the approved window and saves exact historical progress without native mutation',async id=>{
  const current=record(id);props={...props,record:current,current,form:{...current}};
  draft={...interview(id),version:'brawndo-cis-pilot-1',answers:{[id==='1.1'?'inventory':'process']:'Not sure',gaps:'Mixed missing-or-unknown historical notes'},narrative:'Retained manual interview text.\nExact second line.',revision:4};
  const original={...draft};await render();await open();expect(document.querySelector('.omni-workspace-window')).toBeTruthy();expect(button('Not sure').getAttribute('aria-pressed')).toBe('true');
  expect(api.put).not.toHaveBeenCalled();await click('Save & close');expect(draft.version).toBe(original.version);expect(draft.answers).toEqual(original.answers);expect(draft.narrative).toBe(original.narrative);expect(props.onSaveAssessment).not.toHaveBeenCalled();
});

test.each([['demo_brawndo','demo'],['existing-authenticated-client','standard']])('sequential presentation for %s retains explicit checkpoints, pause/resume and native summary save boundary',async(clientId,mode)=>{
  mockWorkspaceMode=mode;const current=record('1.1',clientId);props={...props,clientId,record:current,current,form:{...current}};draft=interview('1.1');
  await render({inline:true,inlineOpen:true,sequential:true});
  expect(container.querySelector('[aria-label="CIS assessment interview"]').hidden).toBe(true);expect(api.put).not.toHaveBeenCalled();
  await click('Begin guided assessment');const first=guidedCatalog.safeguards['1.1'][0];
  expect(container.querySelector('legend').textContent).toBe(nativeCisQuestionTitle('1.1',first));
  await act(async()=>{const select=container.querySelector('.cis-sequential-interview select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'No');select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
  await click('Continue');expect(api.put).not.toHaveBeenCalled();
  await click('Pause & return');expect(container.querySelector('[aria-label="CIS assessment interview"]').hidden).toBe(true);expect(api.put).not.toHaveBeenCalled();await click('Resume guided assessment');await click('Save & close');expect(api.put).toHaveBeenCalledWith('/framework_assessments/pilot-1.1/guided-assessment',expect.objectContaining({answers:{inventory:'No'},completed:false}));expect(container.querySelector('[aria-label="CIS assessment interview"]').hidden).toBe(true);await click('Resume guided assessment');
  expect(container.querySelector('[aria-label="CIS assessment interview"]').hidden).toBe(false);
  for(let count=0;count<50&&button('Continue');count++)await click('Continue');
  await click('Review answers');expect(container.querySelector('.cis-answer-review').textContent).toContain(nativeCisQuestionTitle('1.1',first));
  await click('Edit answer 1');expect(container.querySelector('legend').textContent).toBe(nativeCisQuestionTitle('1.1',first));expect(container.querySelector('select').value).toBe('No');
  expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(current.status).toBe('not_assessed');expect(current.implementation).toBe('');
});

test('sequential empty root cannot checkpoint; local pause and summary review keep draft answers and manual assessment unchanged until explicit replacement confirmation',async()=>{
  const current={...record(),implementation:'Retain the original manual assessment.'};props={...props,record:current,current,form:{...current}};draft=interview('1.1');
  await render({inline:true,inlineOpen:true,sequential:true});await click('Begin guided assessment');await click('Continue');
  expect(document.body.textContent).toContain('Choose an answer before continuing. Not sure is a valid response.');expect(api.put).not.toHaveBeenCalled();
  const answer=async value=>act(async()=>{const select=container.querySelector('.cis-sequential-interview select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,value);select.dispatchEvent(new Event('change',{bubbles:true}));});
  await answer('No');await click('Pause & return');expect(container.querySelector('[aria-label="CIS assessment interview"]').hidden).toBe(true);expect(api.put).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('Save your progress?');expect(current.implementation).toBe('Retain the original manual assessment.');
  await click('Resume guided assessment');expect(container.querySelector('.cis-sequential-interview select').value).toBe('No');
  expect(api.put).not.toHaveBeenCalled();expect(props.onSaveAssessment).not.toHaveBeenCalled();
  for(let count=0;count<50&&button('Continue');count++)await click('Continue');await click('Review answers');await click('Review summary');
  expect(props.onSaveAssessment).not.toHaveBeenCalled();expect(current.implementation).toBe('Retain the original manual assessment.');expect(current.status).toBe('not_assessed');
  await click('Update assessment');expect(document.body.textContent).toContain('Update this assessment?');await click('Cancel');expect(props.onSaveAssessment).not.toHaveBeenCalled();
});
