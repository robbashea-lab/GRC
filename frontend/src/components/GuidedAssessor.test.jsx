import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import GuidedAssessor from './GuidedAssessor';
import {control1Catalog as guidedCatalog,versionForSafeguard} from '@/lib/guidedAssessment';
import api from '@/lib/api';
import {isWorkspacePresentation} from '@/lib/reference';
import workspacePilotConfiguration from '@catalogs/omniWorkspacePilot.json';
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:e=>e.message}));
let mockWorkspaceMode;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'pilot-test',workspace_mode:mockWorkspaceMode}})}));
let root,container,draft;
const row={framework_assessment_id:'pilot',definition_id:'1.1',title:'Establish and Maintain Detailed Enterprise Asset Inventory',status:'not_assessed'};
const props={clientId:'demo_brawndo',framework:'cis-ig1',configuration:{implementation_group:1}};
const button=name=>[...document.querySelectorAll('button')].find(el=>el.textContent===name);
async function render(p={}){await act(async()=>root.render(<GuidedAssessor {...props} {...p}/>));}
async function click(name){await act(async()=>button(name).click());}
async function open(){await act(async()=>document.querySelector('[aria-label="Open OmniBot guide"], [aria-label="Open Omni guided assessment"]').click());}
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
  mockWorkspaceMode=mode;const onDraftChange=jest.fn();
  draft={...draft,version:versionForSafeguard('1.1',true),current_assessment_token:null,current_scope_fingerprint:'a'.repeat(64),base_assessment_token:null,base_scope_fingerprint:'a'.repeat(64),lineage_known:true,lineage_stale:false};
  const current={...row,client_id:clientId,assessment_history:[],work:{context_complete:true,finding_ids:[],task_ids:[],review_ids:[],open_findings:0,open_actions:0,overdue_reviews:0,overdue_actions:0}};
  await render({clientId,record:current,current,contextComplete:true,onDraftChange});await open();
  expect(document.querySelector('.omni-workspace-window').getAttribute('aria-modal')).toBe('false');
  expect(document.querySelector('.omni-approved')).toBeTruthy();
  expect(document.querySelector('.omni-free-dock')).toBeTruthy();
  expect(document.querySelector('.guided-panel legend').textContent).toBe('Does an enterprise asset inventory exist?');expect(api.put).not.toHaveBeenCalled();
  await select('Not sure');expect(onDraftChange).toHaveBeenLastCalledWith(true);
  await act(async()=>document.querySelector('[aria-label="Minimize OmniBot Guide"]').click());await open();
  expect(document.querySelector('.guided-panel select').value).toBe('Not sure');expect(api.put).not.toHaveBeenCalled();
  await click('Save and exit');expect(draft.answers.inventory).toBe('Not sure');expect(draft.version).toBe(versionForSafeguard('1.1',true));
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

test('single focused answer saves interview and stages the real native narrative without status application',async()=>{
  mockWorkspaceMode='demo';draft={...draft,version:versionForSafeguard('1.1',true)};
  const update=jest.fn(()=>true),apply=jest.fn();
  await render({record:row,current:row,form:{...row,implementation:''},onUpdateImplementation:update,onApply:apply});await open();await select('Yes');
  await click('Save answer & update implementation draft');
  expect(api.put).toHaveBeenCalledWith('/framework_assessments/pilot/guided-assessment',expect.objectContaining({completed:false,answers:{inventory:'Yes'},expected_revision:0}));
  expect(update).toHaveBeenCalledWith(expect.stringContaining('enterprise asset inventory'),'');expect(apply).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('unsaved native draft');expect(document.querySelector('.guided-panel legend').textContent).toContain('coverage');
});

test('manual native prose cannot be replaced before explicit reconciliation; failed save remains retryable',async()=>{
  mockWorkspaceMode='demo';draft={...draft,version:versionForSafeguard('1.1',true)};
  const update=jest.fn(()=>true),native={...row,implementation:'Manual fact: hosted assets are managed by the provider.'};
  await render({record:row,current:native,form:native,onUpdateImplementation:update});await open();await select('Yes');await click('Save answer & update implementation draft');
  expect(api.put).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
  const group=document.querySelector('[aria-label="Reconcile implementation narrative"]'),textarea=group.querySelector('textarea');
  expect(textarea.value).toBe(native.implementation);expect(group.querySelector('button').disabled).toBe(true);
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,native.implementation+' Client reports an inventory; coverage needs confirmation.');textarea.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>group.querySelector('input').click());
  api.put.mockRejectedValueOnce(new Error('Interview changed: reopen to reconcile.'));
  await act(async()=>group.querySelector('button').click());
  expect(update).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Interview changed');expect(document.querySelector('.guided-panel select').value).toBe('Yes');
  await act(async()=>group.querySelector('button').click());expect(update).toHaveBeenCalledWith(expect.stringContaining('Manual fact:'),native.implementation);
});

test('an explicit new-base restart can retain confirmed relevant answers without carrying a completion conclusion',async()=>{
  mockWorkspaceMode='demo';draft={...draft,version:versionForSafeguard('1.1',true),revision:3,answers:{inventory:'Yes',system:'Reported inventory tool'},current_assessment_token:'native-new',current_scope_fingerprint:'a'.repeat(64),base_assessment_token:'native-old',base_scope_fingerprint:'a'.repeat(64),lineage_stale:true,lineage_known:true};
  await render({record:row,current:{...row,last_saved:'native-new'}});await open();await click('Start a new review');
  const reuse=[...document.querySelectorAll('label')].find(el=>el.textContent.includes('I confirmed these answers remain current'));
  await act(async()=>reuse.querySelector('input').click());await click('Confirm restart');
  expect(api.put).toHaveBeenNthCalledWith(1,expect.any(String),expect.objectContaining({restart:true,answers:{},expected_revision:3,base_assessment_token:'native-new'}));
  expect(api.put).toHaveBeenNthCalledWith(2,expect.any(String),expect.objectContaining({answers:{inventory:'Yes',system:'Reported inventory tool'},completed:false,result:null,expected_revision:4}));
  expect(draft.completed).toBe(false);expect(document.querySelector('.guided-panel legend').textContent).toContain('coverage');
});

test('focused Partly stores the existing versioned value and read-only users cannot save or stage',async()=>{
  mockWorkspaceMode='demo';draft={...draft,version:versionForSafeguard('1.1',true)};
  await render({record:row,disabled:true,onUpdateImplementation:jest.fn()});await open();
  expect(document.querySelector('.guided-panel fieldset').disabled).toBe(true);expect(button('Save answer & update implementation draft').disabled).toBe(true);expect(button('Save and exit').disabled).toBe(true);expect(api.put).not.toHaveBeenCalled();
  await render({record:row,disabled:false});await select('Partially');
  expect(document.querySelector('.guided-panel select').selectedOptions[0].textContent).toBe('Partly');
  await click('Save and exit');expect(draft.answers.inventory).toBe('Partially');
});

test('focused historical completion with contradictory answers cannot offer Implemented',async()=>{
  mockWorkspaceMode='demo';draft={...draft,version:versionForSafeguard('1.1',true),revision:3,completed:true,answers:{inventory:'No'},result:{status:'addressed',narrative:'Historical report',gaps:[],unknowns:[],basis:[],nextSteps:[],evidence:[],answers:[]}};
  await render({record:{...row,status:'addressed'},current:{...row,status:'addressed'}});await open();
  expect(document.body.textContent).toContain('prior completion recommendation is not supported');expect(button('Apply to Assessment')).toBeUndefined();
  expect(document.querySelector('.guided-panel select').value).toBe('No');expect(api.put).not.toHaveBeenCalled();
});

test('focused dashboard invitation introduces OmniBot and restricts recommendations to 1.1 and 1.2',async()=>{
  mockWorkspaceMode='demo';await render({rows:[row,{...row,definition_id:'1.2'},{...row,definition_id:'3.5'}]});
  expect(document.querySelector('.guided-context-prompt').textContent).toContain('Hi, I’m OmniBot.');
  await open();expect(button('Open safeguard 1.1')).toBeTruthy();expect(button('Open safeguard 1.2')).toBeTruthy();expect(button('Open safeguard 3.5')).toBeUndefined();
  expect(document.body.textContent).not.toContain('Default work order');
});

test('a native edit during an interview request prevents a stale implementation replacement',async()=>{
  mockWorkspaceMode='demo';draft={...draft,version:versionForSafeguard('1.1',true)};
  let finish;api.put.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const oldUpdate=jest.fn(()=>true),currentUpdate=jest.fn(()=>false);
  await render({record:row,form:{...row,implementation:''},onUpdateImplementation:oldUpdate});await open();await select('Yes');
  await act(async()=>button('Save answer & update implementation draft').click());
  await render({record:row,form:{...row,implementation:'Concurrent native edit'},onUpdateImplementation:currentUpdate});
  await act(async()=>finish({data:{...draft,answers:{inventory:'Yes'},revision:1}}));
  expect(oldUpdate).not.toHaveBeenCalled();expect(currentUpdate).toHaveBeenCalledWith(expect.any(String),'');
  expect(document.body.textContent).toContain('native implementation draft changed');expect(document.querySelector('.guided-panel select').value).toBe('Yes');
});
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

const invitationText=()=>document.querySelector('.guided-context-prompt')?.textContent;
const invitationPreferenceKey='guided-pilot-ui:pilot-test:demo_brawndo:cis-ig1:focused-invitations';
test('focused invitation dismisses only this visit and ignores background data rerenders',async()=>{
  mockWorkspaceMode='demo';await render();
  expect(invitationText()).toContain('Hi, I’m OmniBot. I can help you choose your next safeguard');
  expect(document.querySelector('[aria-label="Open OmniBot guide"]')).toBeTruthy();
  await click('Dismiss this invitation');expect(invitationText()).toBeUndefined();
  await render({rows:[{...row,status:'needs_attention'}]});expect(invitationText()).toBeUndefined();
  await act(async()=>root.render(null));await render();expect(invitationText()).toContain('Hi, I’m OmniBot');
  expect(api.put).not.toHaveBeenCalled();
});
test('Control 1 is a separate invitation visit and uses its own professional wording',async()=>{
  mockWorkspaceMode='demo';await render();await click('Dismiss this invitation');
  await render({invitationContext:'control-1'});expect(invitationText()).toContain('work through Control 1’s safeguards');
  await click('Dismiss this invitation');await render({invitationContext:'control-1',rows:[row]});expect(invitationText()).toBeUndefined();
  await render({invitationContext:'program'});expect(invitationText()).toContain('choose your next safeguard');
});
test.each(['Hide invitations for this session','Turn off automatic invitations'])('%s survives visits, stays scoped and can be reenabled',async choice=>{
  mockWorkspaceMode='demo';await render();await click(choice);expect(invitationText()).toBeUndefined();
  await act(async()=>root.render(null));await render({invitationContext:'control-1'});expect(invitationText()).toBeUndefined();
  expect(document.querySelector('[aria-label="Open OmniBot guide"]')).toBeTruthy();
  expect(localStorage.getItem('guided-pilot-ui:pilot-test:demo_brawndo')).not.toContain('invitationsDisabled');
  await click('Turn on automatic invitations');expect(invitationText()).toContain('Control 1');
  await act(async()=>root.render(null));await render();expect(invitationText()).toContain('Hi, I’m OmniBot');
});
test('session suppression expires while disabled invitations persist',async()=>{
  mockWorkspaceMode='demo';await render();await click('Hide invitations for this session');
  sessionStorage.clear();await act(async()=>root.render(null));await render();expect(invitationText()).toBeTruthy();
  await click('Turn off automatic invitations');sessionStorage.clear();await act(async()=>root.render(null));await render();expect(invitationText()).toBeUndefined();
  expect(JSON.parse(localStorage.getItem(invitationPreferenceKey)).invitationsDisabled).toBe(true);
});
test('safeguard invitation uses saved answers, never unsaved edits, and discloses stale lineage',async()=>{
  mockWorkspaceMode='demo';draft={...draft,version:versionForSafeguard('1.1',true),lineage_known:true,lineage_stale:false,base_assessment_token:null,current_assessment_token:null,base_scope_fingerprint:'a'.repeat(64),current_scope_fingerprint:'a'.repeat(64)};
  await render({record:row,current:{...row,client_id:'demo_brawndo',assessment_history:[],work:{context_complete:true,finding_ids:[],task_ids:[],review_ids:[],open_findings:0,open_actions:0,overdue_reviews:0,overdue_actions:0}},contextComplete:true});
  expect(invitationText()).toContain('Let’s work through Safeguard 1.1 together');await open();await select('Yes');
  await act(async()=>document.querySelector('[aria-label="Close OmniBot Guide"]').click());expect(invitationText()).toBeUndefined();
  draft={...draft,client_id:'demo_brawndo',assessment_id:'pilot',user_id:'pilot-test',revision:2,answers:{inventory:'Not sure'}};await act(async()=>root.render(null));await render({record:row,current:{...row,client_id:'demo_brawndo',assessment_history:[],work:{context_complete:true,finding_ids:[],task_ids:[],review_ids:[],open_findings:0,open_actions:0,overdue_reviews:0,overdue_actions:0}},contextComplete:true});
  expect(invitationText()).toContain('continue your saved assessment of Safeguard 1.1');
  draft={...draft,lineage_stale:true};await act(async()=>root.render(null));await render({record:row,current:{...row,client_id:'demo_brawndo',assessment_history:[],work:{context_complete:true,finding_ids:[],task_ids:[],review_ids:[],open_findings:0,open_actions:0,overdue_reviews:0,overdue_actions:0}},contextComplete:true});
  expect(invitationText()).toContain('compared with the current assessment');expect(api.put).not.toHaveBeenCalled();
});
test('focused suppression never changes legacy invitations and prior disabled preference is honored',async()=>{
  mockWorkspaceMode='demo';localStorage.setItem('guided-pilot-ui:pilot-test:demo_brawndo',JSON.stringify({invitationsDisabled:true}));
  await render();expect(invitationText()).toBeUndefined();await click('Turn on automatic invitations');expect(invitationText()).toBeTruthy();
  expect(JSON.parse(localStorage.getItem('guided-pilot-ui:pilot-test:demo_brawndo')).invitationsDisabled).toBe(true);
  await act(async()=>root.render(null));await render({configuration:{implementation_group:1,focused_omni_enabled:false}});expect(invitationText()).toBeUndefined();
});
test('focused guide titles and window controls use OmniBot while legacy names remain unchanged',async()=>{
  mockWorkspaceMode='demo';await render({rows:[row],contextComplete:true});await open();
  expect(document.querySelector('.guided-panel').textContent).toContain('Guided assessment with OmniBot');
  expect(document.querySelector('.guided-panel').textContent).toContain('OmniBot’s recommended next steps');
  expect(document.querySelector('[aria-label="Reposition OmniBot"]')).toBeTruthy();
  expect(document.querySelector('[aria-label="Minimize OmniBot Guide"]')).toBeTruthy();
  await act(async()=>root.render(null));await render({clientId:'demo_initech'});await open();
  expect(document.querySelector('.guided-panel').textContent).toContain('Guided Assessment with Omni');
  expect(document.querySelector('[aria-label="Reposition OmniBot"]')).toBeNull();
});
