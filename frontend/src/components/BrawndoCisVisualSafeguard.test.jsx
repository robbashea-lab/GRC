import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoCisSafeguard from './BrawndoCisSafeguard';
import catalog from '@catalogs/cisIG1.json';
import guide from '@catalogs/operatorGuidance/cisRequirementGuide.json';
import criteria from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';

let mockGuideProps,mockShellProps;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'u',role:'super_admin',workspace_mode:'demo'}})}));
jest.mock('./AssessmentShell',()=>({__esModule:true,default:props=>{mockShellProps=props;const {className,title,status,children,footer}=props;return <section className={className} data-testid="native-shell"><h2>{title}</h2>{status}{children}<footer>{footer}</footer></section>;},AssessmentStep:({title,children})=><section><h3>{title}</h3>{children}</section>}));
jest.mock('./GuidedAssessor',()=>props=>{mockGuideProps=props;return <section hidden={!props.inlineOpen} data-testid="native-interview"><button onClick={props.onInlineClose}>Close interview</button></section>;});
jest.mock('./BrawndoCisFindings',()=>({__esModule:true,default:()=> <p>Native Findings</p>,directFindings:(record,related)=>related?.findings||[]}));
jest.mock('./AssessmentItems',()=>()=> <p>Native items</p>);

let root,container,state,actions;
const button=name=>[...container.querySelectorAll('button')].find(element=>element.textContent===name);
beforeEach(()=>{
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
  expect(container.querySelector('.brawndo-cis-visual-requirement').textContent).toContain(guide.requirements['1.1'].plain);
  expect(container.querySelector('.brawndo-cis-native-guidance').textContent).toContain(guide.requirements['1.1'].evidence);
  expect(container.querySelector('.brawndo-cis-native-guidance').textContent).toContain('Previous checklist responses');
  await act(async()=>container.querySelector('.assessment-check input').click());
  expect(actions.put).toHaveBeenCalledWith('cis_assessment_criteria',['historical-id',criteria.requirements['1.1'].criteria[0].id]);
  expect(container.querySelector('[aria-label="Current implementation"]').value).toBe(state.form.implementation);
  expect(container.querySelector('[aria-label="Previously recorded notes"]').value).toBe(state.form.notes);
  expect(actions.save).not.toHaveBeenCalled();
});

test('native guide callbacks and tab transitions retain manual drafts and distinct save actions',async()=>{
  await render();
  expect(mockGuideProps.visualReference).toBe(true);
  expect(mockGuideProps.onFreshInterviewReady).toEqual(expect.any(Function));
  expect(mockGuideProps.onApply).toBe(actions.applyGuided);
  expect(mockGuideProps.onSaveAssessment).toBe(actions.saveGuidedAssessment);
  expect(mockGuideProps.onUpdateImplementation).toBe(actions.stageGuidedImplementation);
  const details=container.querySelector('.assessment-summary');
  await act(async()=>{details.open=true;details.dispatchEvent(new Event('toggle'));});
  expect(mockGuideProps.inlineOpen).toBe(true);
  await tab('Items to address');await tab('Requirement & implementation');
  expect(container.querySelector('[aria-label="Current implementation"]').value).toBe(state.form.implementation);
  await act(async()=>button('Close interview').click());
  expect(details.open).toBe(false);expect(document.activeElement).toBe(details.querySelector('summary'));
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
  expect(container.querySelector('.assessment-check input').closest('fieldset').disabled).toBe(true);
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
  expect(container.querySelector('.assessment-summary summary').textContent).toBe('Requirement summary');
  expect([...container.querySelectorAll('[role="tab"]')].map(element=>element.textContent)).toEqual(['Requirement & implementation','Items to address','Findings']);
  expect(mockGuideProps.visualReference).toBe(false);
  expect(mockGuideProps.onFreshInterviewReady).toBeUndefined();
  expect(mockShellProps.closeInNavigation).toBe(false);expect(mockShellProps.close).toBe(actions.close);
});
