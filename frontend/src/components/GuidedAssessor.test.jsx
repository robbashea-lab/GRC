import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import GuidedAssessor from './GuidedAssessor';
import {control1Catalog as guidedCatalog,versionForSafeguard} from '@/lib/guidedAssessment';
import api from '@/lib/api';
import {isWorkspacePresentation} from '@/lib/reference';
import workspacePilotConfiguration from '@/lib/brawndoWorkspacePilot.json';
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:e=>e.message}));
let mockWorkspaceMode;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'pilot-test',workspace_mode:mockWorkspaceMode}})}));
let root,container,draft;
const row={framework_assessment_id:'pilot',definition_id:'1.1',title:'Establish and Maintain Detailed Enterprise Asset Inventory',status:'not_assessed'};
const props={clientId:'demo_brawndo',framework:'cis-ig1',configuration:{implementation_group:1}};
const button=name=>[...document.querySelectorAll('button')].find(el=>el.textContent===name);
async function render(p={}){await act(async()=>root.render(<GuidedAssessor {...props} {...p}/>));}
async function click(name){await act(async()=>button(name).click());}
async function open(){await act(async()=>document.querySelector('[aria-label="Open Omni guided assessment"]').click());}
async function select(value){const el=document.querySelector('.guided-panel select');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('change',{bubbles:true}));});}
beforeEach(()=>{
  mockWorkspaceMode=undefined;
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  draft={version:guidedCatalog.version,answers:{},step:0,completed:false,revision:0};
  api.get.mockImplementation(async()=>({data:draft}));
  api.put.mockImplementation(async(_path,body)=>({data:draft={...body,revision:draft.revision+1,generated_at:'2026-10-07T12:00:00Z'}}));
});
test.each([['demo_brawndo','demo'],[workspacePilotConfiguration.stagingClientIds[0],'standard']])('approved Omni boundary %s uses the canonical interview and preserves unsaved answers across window minimize',async(clientId,mode)=>{
  mockWorkspaceMode=mode;const onDraftChange=jest.fn();await render({clientId,record:row,onDraftChange});await open();
  expect(document.querySelector('.omni-workspace-window').getAttribute('aria-modal')).toBe('false');
  expect(document.querySelector('.omni-approved')).toBeTruthy();
  expect(document.querySelector('.omni-free-dock')).toBeTruthy();
  await select('Not sure');expect(onDraftChange).toHaveBeenLastCalledWith(true);
  await act(async()=>document.querySelector('[aria-label="Minimize Omni Guide"]').click());await open();
  expect(document.querySelector('.guided-panel select').value).toBe('Not sure');expect(api.put).not.toHaveBeenCalled();
  await click('Save and exit');expect(draft.answers.inventory).toBe('Not sure');expect(draft.version).toBe(guidedCatalog.version);
});

test.each([['demo_dunder','demo'],['demo_prestige','demo'],['demo_initech','demo'],['existing-authenticated-client','standard'],['future-client','standard'],['newly-onboarded-synthetic-client','standard']])('shared presentation preserves legacy Omni and saved interview for %s',async(clientId,mode)=>{
  mockWorkspaceMode=mode;
  expect(isWorkspacePresentation(clientId,{workspace_mode:mode})).toBe(true);
  document.documentElement.dataset.brawndoWorkspace='dark';
  try {
    draft={...draft,answers:{inventory:'Not sure'},revision:3};
    await render({clientId,record:row});
    expect(document.querySelector('[aria-label="Open Omni guided assessment"]')).toBeTruthy();
    await open();
    expect(document.querySelector('.guided-panel').getAttribute('role')).toBe('dialog');
    expect(document.querySelector('.ui-overlay[data-state="open"]')).toBeTruthy();
    expect(container.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.omni-approved')).toBeNull();
    expect(document.querySelector('.omni-free-dock')).toBeNull();
    expect(document.querySelector('.omni-workspace-window')).toBeNull();
    expect(button('Minimize')).toBeTruthy();expect(button('Dismiss assistant')).toBeTruthy();
    expect(document.querySelector('.guided-panel select').value).toBe('Not sure');
    expect(api.get).toHaveBeenCalledWith('/framework_assessments/pilot/guided-assessment',expect.objectContaining({signal:expect.any(AbortSignal)}));
    expect(api.put).not.toHaveBeenCalled();
    await click('Save and exit');
    expect(api.put).toHaveBeenCalledWith('/framework_assessments/pilot/guided-assessment',expect.objectContaining({answers:{inventory:'Not sure'},version:guidedCatalog.version,expected_revision:3}));
  } finally {delete document.documentElement.dataset.brawndoWorkspace;}
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
test('dashboard greeting, direct pilot options, dismiss and reopen',async()=>{
  const onSelect=jest.fn();await render({rows:[row,{...row,definition_id:'1.2'}],onSelect});
  expect(document.body.textContent).toContain('Hi, I’m Omni.');
  expect(document.querySelector('.omni-idle')).toBeTruthy();
  await open();expect(document.body.textContent).toContain('Not Assessed');
  await click('Start safeguard 1.1');expect(onSelect).toHaveBeenCalledWith(row);
  await open();expect(document.querySelector('.omni-helpful')).toBeTruthy();
  expect(document.querySelector('[aria-label="Open Omni guided assessment"]').getAttribute('aria-expanded')).toBe('true');
  await click('Dismiss assistant');expect(document.querySelector('[aria-label="Open Omni guided assessment"]')).toBeNull();
  await click('Show Omni');await open();expect(document.body.textContent).toContain('Guided Assessment with Omni');
});
test.each([['other','cis-ig1','99.1'],['demo_brawndo','soc-2','1.1'],['demo_brawndo','iso-27001','1.1'],['demo_brawndo','cis-ig1','1.3']])('scope exclusions %s %s %s',async(clientId,framework,id)=>{
  await render({clientId,framework,record:{...row,definition_id:id}});expect(document.querySelector('[data-testid="guided-pilot"]')).toBeNull();expect(api.get).not.toHaveBeenCalled();
});
test.each(['1.1','1.2'])('%s branches, persists, resumes, and requires explicit replacement approval',async id=>{
  const onApply=jest.fn(),onDraftChange=jest.fn();await render({record:{...row,definition_id:id},form:{implementation:'Existing narrative'},onApply,onDraftChange});
  await open();await select('No');expect(document.body.textContent).toContain('who can verify');
  expect(document.querySelector('.omni-gap')).toBeTruthy();
  await click('Continue');expect(document.body.textContent).toContain('What');
  await click('Save and exit');expect(draft.answers[id==='1.1'?'inventory':'process']).toBe('No');
  await open();for(let n=0;button('Continue')&&n<10;n++)await click('Continue');await click('Generate review');
  expect(document.body.textContent).toContain('Not Implemented');
  expect(button('Apply to Assessment').disabled).toBe(true);
  const check=document.querySelector('.guided-replacement input');await act(async()=>check.click());
  await click('Apply to Assessment');
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({status:'needs_attention',guided_assessment_source:expect.objectContaining({version:guidedCatalog.version})}));
  expect(onApply.mock.calls[0][0].verification).toBeUndefined();
  await open();await click('Restart assessment');await click('Confirm restart');expect(draft.answers).toEqual({});
});
test('empty critical answers remain unknown and completed results restore',async()=>{
  draft={...draft,completed:true,answers:{inventory:'Not sure'},revision:1,generated_at:'2026-10-07T12:00:00Z'};
  await render({record:row,form:{implementation:''},onApply:jest.fn()});await open();
  expect(document.body.textContent).toContain('Not Assessed');
  expect(document.querySelector('.omni-verification')).toBeTruthy();
  expect(document.body.textContent).toContain('Still Unknown');
  expect(document.querySelector('textarea').value).not.toContain('NinjaOne');
});
test('thinking is tied to an outstanding save and minimize preserves answers',async()=>{
  await render({record:row});await open();await select('Yes');
  let finish;api.put.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  await click('Continue');expect(document.querySelector('.omni-thinking')).toBeTruthy();
  await act(async()=>finish({data:{...draft,answers:{inventory:'Yes'},step:1,revision:1}}));
  expect(document.querySelector('.omni-thinking')).toBeNull();
  await click('Minimize');expect(document.querySelector('.is-minimized')).toBeTruthy();
  await open();expect(document.body.textContent).toContain('authoritative inventory');
});
test('complete state restores from saved answers without changing recommendation or source',async()=>{
  const answers=Object.fromEntries(guidedCatalog.safeguards['1.2'].map(q=>[q.id,q.type==='text'?(q.critical?'IT':''):q.type==='multi'?['Quarantine or isolate']:q.id==='frequency'?'Weekly':q.id==='unresolved'?'No':'Yes']));
  draft={...draft,completed:true,answers,revision:2,generated_at:'2026-10-07T12:00:00Z'};
  await render({record:{...row,definition_id:'1.2'}});await open();
  expect(document.querySelector('.omni-complete')).toBeTruthy();
  expect(document.body.textContent).toContain('Assessment complete');
  expect(document.body.textContent).toContain('Implemented');
  expect(api.put).not.toHaveBeenCalled();
});
test('Omni SVG is local, decorative and motion and responsive styles are defined',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const asset=fs.readFileSync(path.join(__dirname,'OmniCharacter.jsx'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'GuidedAssessor.css'),'utf8');
  expect(asset).toContain('aria-hidden="true"');expect(asset).not.toMatch(/https?:|paperclip|clippy|microsoft/i);
  expect(asset).toContain("import approvedShell from '@/assets/omni-approved-shell.png'");
  expect(asset).toContain('<image href={approvedShell}');
  expect(css).toContain('prefers-reduced-motion:reduce');expect(css).toContain('animation:none');
  expect(css).toContain('max-width:800px');expect(css).toContain('width:48px; height:48px');
});

test.each(['2.1','7.3','11.2','14.1','17.2','18.5'])('%s reuses approved save, failure protection, replacement and resume behavior',async id=>{
  draft={...draft,version:versionForSafeguard(id)};
  const onApply=jest.fn();
  await render({configuration:{implementation_group:3},record:{...row,definition_id:id},form:{implementation:'Preserve original narrative'},onApply});
  await open();await select('No');
  api.put.mockRejectedValueOnce(new Error('Synthetic save failure'));
  await click('Continue');
  expect(document.querySelector('[role="alert"]').textContent).toContain('Synthetic save failure');
  expect(document.querySelector('select').value).toBe('No');
  expect(document.body.textContent).toContain('Question group 1');
  await click('Continue');
  await click('Save and exit');await open();
  for(let n=0;button('Continue')&&n<12;n++)await click('Continue');
  await click('Generate review');
  expect(document.body.textContent).toContain('Not Implemented');
  expect(button('Apply to Assessment').disabled).toBe(true);
  await act(async()=>document.querySelector('.guided-replacement input').click());
  await click('Apply to Assessment');
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({status:'needs_attention',guided_assessment_source:expect.objectContaining({version:versionForSafeguard(id)})}));
  expect(onApply.mock.calls[0][0].verification).toBeUndefined();
});

test('overview uses supplied user-scoped draft summaries without fetching every interview',async()=>{
  await render({rows:[{...row,definition_id:'2.1'},row],draftSummaries:{'2.1':{revision:2,completed:false}},onSelect:jest.fn()});
  await open();
  expect(button('Resume safeguard 2.1')).toBeTruthy();
  expect(api.get).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('· Control 1');
});
