import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoCisSafeguard from './BrawndoCisSafeguard';
import catalog from '@catalogs/cisIG1.json';

let mockGuide,mockItems,mockFindings,mockShell,mockBrawndo=true;
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>mockBrawndo}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'operator',role:'platform_admin',workspace_mode:'demo'}})}));
jest.mock('./AssessmentShell',()=>({__esModule:true,default:props=>{mockShell=props;return <section className={props.className}>{props.crumbs}{props.status}{props.children}<footer>{props.footer}</footer></section>;},AssessmentStep:({title,children})=><section><h3>{title}</h3>{children}</section>}));
jest.mock('./GuidedAssessor',()=>props=>{mockGuide=props;return <div/>;});
jest.mock('./AssessmentItems',()=>props=>{mockItems=props;return <div/>;});
jest.mock('./BrawndoCisFindings',()=>({__esModule:true,default:props=>{mockFindings=props;return <div/>;},directFindings:()=>[]}));

let root,container,state,actions;
const render=()=>act(async()=>root.render(<BrawndoCisSafeguard {...{state,actions}}/>));
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockBrawndo=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  const record={client_id:'demo_brawndo',framework_key:'cis-ig1',framework_version:'8.1',definition_id:'1.1',framework_assessment_id:'native-a',status:'in_progress',verification:'gap_identified',implementation:'Preserved manual narrative',notes:'Retained notes',items_to_address:[],work:{context_complete:true}};
  state={record,current:record,form:{...record},definition:catalog.requirements.find(row=>row.id==='1.1'),ctx:{current:record,configuration:{implementation_group:1},users:[]},visualReference:true,writable:true,busy:false,dirty:false,related:{findings:[]},manageRecord:jest.fn()};
  actions=Object.fromEntries(['put','save','saveAndNext','close','previous','next','retry','run','setFinding','setNested','setFeedback','applyGuided','saveGuidedAssessment','setGuidedDraft','stageGuidedImplementation','itemsSaved','createItemFinding','setItemsDraft'].map(name=>[name,jest.fn()]));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('the accepted pilot presents the complete native requirement and passes existing draft and command bindings',async()=>{
  await render();
  expect(mockShell.className).toBe('brawndo-cis-visual-safeguard brawndo-safeguard11');
  expect(container.querySelector('.sg11-requirement blockquote').textContent).toBe(state.definition.official_text);
  expect(container.querySelector('.sg11-native-guidance').textContent).toContain('working checklist');
  expect(container.querySelector('[role=tab][data-state=active]').textContent).toBe('Assessment');
  expect(container.querySelector('[aria-label="Current implementation"]').value).toBe('Preserved manual narrative');
  expect(container.querySelector('[aria-label="Previously recorded notes"]').value).toBe('Retained notes');
  expect(mockGuide.safeguard11).toBe(true);expect(mockItems.safeguard11).toBe(true);expect(mockFindings.safeguard11).toBe(true);
  expect(mockGuide.onSaveAssessment).toBe(actions.saveGuidedAssessment);
  expect(mockGuide.onUpdateImplementation).toBe(actions.stageGuidedImplementation);
  expect(mockItems.onSaved).toBe(actions.itemsSaved);expect(mockItems.onCreateFinding).toBe(actions.createItemFinding);
  const save=[...container.querySelectorAll('button')].find(node=>node.textContent==='Save assessment');
  await act(async()=>save.click());expect(actions.save).toHaveBeenCalledTimes(1);expect(actions.close).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain('Assessed today');
});

test.each(['visual','fullRecord','context','assessment','client','version','definition','ig2'])('pilot appearance fails closed on %s while native draft survives',async mismatch=>{
  if(mismatch==='visual')state.visualReference=false;
  if(mismatch==='fullRecord')mockBrawndo=false;
  if(mismatch==='context')state.ctx=null;
  if(mismatch==='ig2')state.ctx.configuration.implementation_group=2;
  const key={assessment:'framework_assessment_id',client:'client_id',version:'framework_version',definition:'definition_id'}[mismatch];
  if(key)state.current={...state.current,[key]:'different'};
  await render();
  expect(mockShell.className||'').not.toContain('brawndo-safeguard11');
  expect(container.querySelector('.sg11-requirement')).toBeNull();
  expect(mockItems.safeguard11).toBe(false);expect(mockFindings.safeguard11).toBe(false);
  expect(container.querySelector('[aria-label="Current implementation"]').value).toBe(state.form.implementation);
});

test('another native safeguard retains its existing presentation and exact callbacks',async()=>{
  state.record={...state.record,definition_id:'1.2'};state.current=state.record;state.form={...state.record};state.ctx.current=state.record;state.definition=catalog.requirements.find(row=>row.id==='1.2');
  await render();expect(mockShell.className).toBe('brawndo-cis-visual-safeguard');
  expect(container.querySelector('.brawndo-cis-visual-requirement')).toBeTruthy();
  expect(container.querySelector('[role=tab][data-state=active]').textContent).toBe('Requirement & implementation');
  expect(mockGuide.safeguard11).toBe(false);expect(mockShell.next).toBe(actions.next);
});

test('pilot breadcrumb uses the catalog control name and retains the guarded native action',async()=>{
  const openControl=jest.fn();
  state.breadcrumb=[{label:'CIS IG1'},{label:'Control 1',onClick:openControl},{label:'Safeguard 1.1'}];
  await render();
  const control=[...container.querySelectorAll('button')].find(node=>node.textContent==='Control 1 · Inventory and Control of Enterprise Assets');
  expect(control).toBeDefined();await act(async()=>control.click());expect(openControl).toHaveBeenCalledTimes(1);
  state.visualReference=false;await render();
  expect([...container.querySelectorAll('button')].some(node=>node.textContent==='Control 1')).toBe(true);
});
