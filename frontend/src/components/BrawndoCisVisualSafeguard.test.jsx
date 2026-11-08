import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoCisSafeguard from './BrawndoCisSafeguard';
import catalog from '@catalogs/cisIG1.json';

let mockGuideProps,mockShellProps,mockBrawndoRecord=true;
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>mockBrawndoRecord}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'u',role:'super_admin',workspace_mode:'demo'}})}));
jest.mock('./AssessmentShell',()=>({__esModule:true,default:props=>{mockShellProps=props;const {className,title,status,children,footer}=props;return <section className={className} data-testid="native-shell"><h2>{title}</h2>{status}{children}<footer>{footer}</footer></section>;},AssessmentStep:({title,children})=><section><h3>{title}</h3>{children}</section>}));
jest.mock('./GuidedAssessor',()=>props=>{mockGuideProps=props;return <section hidden={!props.inlineOpen} data-testid="native-interview"><button onClick={props.onInlineClose}>Close interview</button></section>;});
jest.mock('./BrawndoCisFindings',()=>({__esModule:true,default:()=> <p>Native Findings</p>,directFindings:(record,related)=>related?.findings||[]}));
jest.mock('./AssessmentItems',()=>()=> <p>Native items</p>);

let root,container,state,actions;
const button=name=>[...container.querySelectorAll('button')].find(element=>element.textContent===name);
beforeEach(()=>{
  mockBrawndoRecord=true;
  global.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  const record={client_id:'demo_brawndo',framework_key:'cis-ig1',framework_assessment_id:'a',definition_id:'1.1',status:'in_progress',verification:'needs_validation',implementation:'Keep the exact manual wording.',notes:'Native prior notes',items_to_address:[{item_id:'open',state:'open'},{item_id:'resolved',state:'resolved'},{item_id:'old',state:'superseded'}],work:{context_complete:true}};
  state={open:true,record,definition:catalog.requirements.find(row=>row.id==='1.1'),form:{...record,cis_assessment_criteria:['historical-id']},current:record,ctx:{configuration:{implementation_group:1},users:[]},writable:true,busy:false,dirty:false,related:{findings:[{finding_id:'f'}]},visualReference:true};
  actions=Object.fromEntries(['put','save','saveAndNext','close','previous','next','retry','run','setFinding','setNested','setFeedback','applyGuided','saveGuidedAssessment','setGuidedDraft','stageGuidedImplementation','itemsSaved','createItemFinding','setItemsDraft'].map(name=>[name,jest.fn()]));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
const render=()=>act(async()=>root.render(<BrawndoCisSafeguard state={state} actions={actions}/>));
async function tab(name){await act(async()=>[...container.querySelectorAll('[role="tab"]')].find(element=>element.textContent.startsWith(name)).dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));}

test('visual requirement retains native official text, complete guidance and editable historical checklist',async()=>{
  await render();
  expect(container.querySelector('[data-testid="native-shell"]').className).toBe('brawndo-cis-visual-safeguard');
  expect(mockShellProps.closeInNavigation).toBe(true);expect(mockShellProps.close).toBe(actions.close);
  expect(mockShellProps.previous).toBe(actions.previous);expect(mockShellProps.next).toBe(actions.next);
  expect(container.querySelector('[data-source-kind="official"]').textContent).toBe(state.definition.official_text);
  const requirement=container.querySelector('.cis-collapsible-requirement');
  expect(requirement.open).toBe(false);expect(requirement.querySelector('summary').textContent).toContain('What CIS requires');
  expect(container.textContent).not.toContain('Assessment guidance & working checklist');
  expect(container.querySelector('.assessment-check')).toBeNull();
  expect(state.form.cis_assessment_criteria).toEqual(['historical-id']);
  expect(actions.put).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-label="Current implementation"]').value).toBe(state.form.implementation);
  expect(container.querySelector('[aria-label="Previously recorded notes"]').value).toBe(state.form.notes);
  expect(actions.save).not.toHaveBeenCalled();
});

test('native guide callbacks and tab transitions retain manual drafts and distinct save actions',async()=>{
  await render();
  expect(mockGuideProps.visualReference).toBe(true);
  expect(mockGuideProps.onFreshInterviewReady).toBeUndefined();expect(mockGuideProps.sequential).toBe(true);
  expect(mockGuideProps.onApply).toBe(actions.applyGuided);
  expect(mockGuideProps.onSaveAssessment).toBe(actions.saveGuidedAssessment);
  expect(mockGuideProps.onUpdateImplementation).toBe(actions.stageGuidedImplementation);
  expect(mockGuideProps.inlineOpen).toBe(true);
  await tab('Items to address');await tab('Requirement & implementation');
  expect(container.querySelector('[aria-label="Current implementation"]').value).toBe(state.form.implementation);
  await act(async()=>button('Close interview').click());
  expect(state.form.cis_assessment_criteria).toEqual(['historical-id']);
  await act(async()=>button('Save assessment').click());await act(async()=>button('Save & next').click());
  expect(actions.save).toHaveBeenCalledTimes(1);expect(actions.saveAndNext).toHaveBeenCalledTimes(1);
  expect(actions.put).not.toHaveBeenCalled();
});

test('badges count native open items and Findings while N/A keeps its existing rationale binding',async()=>{
  state={...state,form:{...state.form,status:'not_applicable',na_rationale:'Native scope reason'}};
  await render();
  expect(container.querySelector('[role="tab"][data-state="active"]').textContent).toBe('Requirement & implementation');
  expect([...container.querySelectorAll('.assessment-tab-count')].map(element=>element.textContent)).toEqual(['1','1']);
  expect(container.querySelector('[aria-label="N/A Rationale"]').value).toBe('Native scope reason');
  await act(async()=>container.querySelector('input[value="addressed"]').click());
  expect(actions.put).toHaveBeenCalledWith('status','addressed');
  expect(container.querySelector('[aria-label="Saved verification"]').textContent).toBe('Needs validation');
});

test('read-only visual workspace preserves disabled fields and withholds save actions',async()=>{
  const manageRecord=jest.fn();state={...state,writable:false,manageRecord};await render();
  expect(container.querySelector('[aria-label="Current implementation"]').disabled).toBe(true);
  expect(container.querySelector('.assessment-check input')).toBeNull();expect(state.form.cis_assessment_criteria).toEqual(['historical-id']);
  expect(mockGuideProps.disabled).toBe(true);expect(mockGuideProps.onUpdateImplementation).toBeUndefined();
  expect(button('Save assessment')).toBeUndefined();expect(button('Save & next')).toBeUndefined();
  expect(mockShellProps.closeInNavigation).toBe(true);expect(mockShellProps.close).toBe(actions.close);
  await act(async()=>button('Manage').click());expect(manageRecord).toHaveBeenCalledTimes(1);
});

test('missing or incomplete native context does not report unknown item or Finding counts as zero',async()=>{
  state={...state,current:{...state.current,items_to_address:undefined,work:{context_complete:false}},related:{}};await render();
  expect([...container.querySelectorAll('.assessment-tab-count')].map(element=>element.textContent)).toEqual(['—','—']);
  expect(container.querySelector('[aria-label="Item count unavailable"]')).toBeTruthy();
  expect(container.querySelector('[aria-label="Finding count unavailable"]')).toBeTruthy();
});

test.each([false,undefined])('without an explicit visual gate (%s) the existing native presentation remains',async visualReference=>{
  state={...state,visualReference};await render();
  expect(container.querySelector('[data-testid="native-shell"]').className).toBe('');
  expect(container.querySelector('.brawndo-cis-visual-requirement')).toBeNull();
  expect(container.querySelector('.brawndo-cis-native-guidance')).toBeNull();
  expect(container.querySelector('.cis-collapsible-requirement summary').textContent).toContain('What CIS requires');
  expect([...container.querySelectorAll('[role="tab"]')].map(element=>element.textContent)).toEqual(['Requirement & implementation','Items to address','Findings']);
  expect(mockGuideProps.visualReference).toBe(false);
  expect(mockGuideProps.onFreshInterviewReady).toBeUndefined();
  expect(mockShellProps.closeInNavigation).toBe(false);expect(mockShellProps.close).toBe(actions.close);
});

test('clean footer uses confirmed native save with full accessible timestamp, independent of draft and assessment dates',async()=>{
  state.current={...state.current,last_saved:'2026-10-18T09:06:07Z',last_assessed:'2026-09-01T00:00:00Z',assessed_by:'Prior assessor'};
  state.form={...state.form,last_saved:'2030-01-01T00:00:00Z'};await render();
  const time=container.querySelector('footer time');expect(time.dateTime).toBe('2026-10-18T09:06:07.000Z');
  expect(time.title).toBe(time.dateTime);expect(time.getAttribute('aria-label')).toContain(time.dateTime);
  expect(time.textContent).toContain('Oct 18, 2026 · ');expect(time.textContent).toContain('9:06:07');expect(time.textContent).toContain('UTC');
  expect(container.querySelector('footer').textContent).not.toContain('Prior assessor');
  await render();expect(container.querySelector('footer time').dateTime).toBe(time.dateTime);
  state={...state,writable:false};await render();expect(container.querySelector('footer').textContent).toContain('Read-only assessment');
  expect(container.querySelector('footer time').dateTime).toBe(time.dateTime);
});
test.each([undefined,null,'invalid','2026-10-18','2026-10-18T09:06:07'])('legacy unproven timestamp %s is honestly unavailable',async value=>{
  state.current={...state.current,last_saved:value,last_assessed:'2026-10-17T12:00:00Z'};await render();
  expect(container.querySelector('footer').textContent).toContain('Last saved: unavailable');expect(container.querySelector('footer time')).toBeNull();
});
test('dirty, busy, failed and successful states retain native timestamp boundaries',async()=>{
  state.current={...state.current,last_saved:'2026-10-17T12:00:00Z'};
  state={...state,dirty:true,feedback:'Interview checkpoint saved.'};await render();
  expect(container.querySelector('footer').textContent).toContain('Unsaved assessment changes');expect(container.querySelector('footer time')).toBeNull();
  state={...state,busy:true};await render();expect(container.querySelector('footer [role="status"]').textContent).toBe('Working…');
  state={...state,busy:false,error:'Save failed'};await render();expect(container.querySelector('[role="alert"]').textContent).toBe('Save failed');
  expect(state.current.last_saved).toBe('2026-10-17T12:00:00Z');
  state={...state,dirty:false,error:'',feedback:'Assessment saved.'};await render();
  expect(container.querySelector('footer time').dateTime).toBe('2026-10-17T12:00:00.000Z');
  state.current={...state.current,last_saved:'2026-10-18T12:00:00Z'};await render();expect(container.querySelector('footer time').dateTime).toBe('2026-10-18T12:00:00.000Z');
});
test.each(['gate','visual','client','assessment','definition','framework'])('saved footer fails closed on %s mismatch',async mismatch=>{
  state.current={...state.current,last_saved:'2026-10-18T12:00:00Z'};
  if(mismatch==='gate')mockBrawndoRecord=false;if(mismatch==='visual')state.visualReference=false;
  const key={client:'client_id',assessment:'framework_assessment_id',definition:'definition_id',framework:'framework_key'}[mismatch];if(key)state.current={...state.current,[key]:'other'};
  await render();expect(container.querySelector('footer').textContent).not.toContain('Last saved:');
  expect(container.querySelector('footer').textContent).toContain('Changes remain in your draft until saved.');
});

test('eligible clean footer uses explicit matching scenario date, while dirty/busy/failed states preserve saved metadata',async()=>{
  state.current={...state.current,status:'addressed',last_saved:'2026-10-18T09:06:07Z',demo_date_metadata:{
    client_id:'demo_brawndo',framework_key:'cis-ig1',assessment_id:'a',definition_id:'1.1',status:'addressed',before_status:'in_progress',
    kind:'implementation_transition',effective_date:'2026-09-30',provenance:'demo_fixture',scenario_version:'brawndo-cis-ig1-history-v2',scenario_anchor:'2026-10-18T00:00:00Z',event_id:'scenario-1.1-complete',
  }};
  await render();expect(container.querySelector('footer').textContent).toContain('Completed on Sep 30, 2026');
  expect(container.querySelector('footer time').dateTime).toBe('2026-09-30');
  state={...state,dirty:true,feedback:'Interview checkpoint saved.'};await render();
  expect(container.querySelector('footer').textContent).toContain('Unsaved assessment changes');expect(container.querySelector('footer time')).toBeNull();
  state={...state,busy:true};await render();expect(container.querySelector('footer [role="status"]').textContent).toBe('Working…');
  state={...state,busy:false,error:'Save failed'};await render();expect(container.querySelector('footer [role="alert"]').textContent).toBe('Save failed');
  expect(state.current.demo_date_metadata.effective_date).toBe('2026-09-30');
  state={...state,dirty:false,error:'',writable:false,feedback:'Assessment saved.'};await render();
  expect(container.querySelector('footer').textContent).toContain('Completed on Sep 30, 2026');
  expect(container.querySelector('footer').textContent).toContain('Read-only assessment');expect(container.querySelector('footer').textContent).toContain('Assessment saved.');
  expect(actions.save).not.toHaveBeenCalled();expect(actions.put).not.toHaveBeenCalled();
});

test('fresh unassessed footer is honest and draft dates never supply saved metadata',async()=>{
  state.current={...state.current,status:'not_assessed'};
  state.form={...state.form,status:'addressed',last_saved:'2030-01-01T00:00:00Z'};
  await render();expect(container.querySelector('footer').textContent).toContain('Not yet assessed.');expect(container.querySelector('footer time')).toBeNull();
});
