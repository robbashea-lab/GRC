import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkAssessmentWorkspace from './FrameworkAssessmentWorkspace';
import {frameworkDefinition} from '@/lib/frameworks';
import {isoGuideEntry} from './IsoRequirementGuide';
import {operatorGuidance} from '@/lib/frameworkOperator';
import {sourcePresentation} from '@/lib/frameworkWorkspace';
import isoCriteria from '@catalogs/operatorGuidance/isoAssessmentCriteria.json';
import api from '@/lib/api';

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'iso-rollout-reviewer',role:'super_admin'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClient:{client_id:'synthetic-iso-rollout',name:'Synthetic ISO rollout'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:error=>error.message}));
jest.mock('./AssessmentItems',()=>()=>null);
jest.mock('./BrawndoCisFindings',()=>()=>null);

let root,container,state,actions;
const button=name=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
async function render(){await act(async()=>root.render(<FrameworkAssessmentWorkspace state={state} actions={actions}/>));}
async function openDetails(){await act(async()=>button('Assessment details').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));return document.querySelector('[role="menu"]');}
function configure(id='A.5.1'){
  const record={client_id:'synthetic-iso-rollout',framework_key:'iso-27001',framework_assessment_id:'synthetic-iso-'+id,definition_id:id,
    status:'in_progress',implementation:'Retained native implementation.',verification:'needs_validation',soa_applicability:'included',soa_justification:'Retained deliberate rationale.',notes:'Retained native notes.'};
  state={assessmentRollout:true,open:true,record,current:record,definition:frameworkDefinition('iso-27001',id),form:{...record},ctx:{configuration:{__program_active:true}},related:{},writable:true,busy:false,dirty:false};
  actions=Object.fromEntries(['put','save','saveAndNext','saveGuidedAssessment','stageGuidedImplementation','setGuidedDraft','run','setFinding','setNested','close','retry','setFeedback','setItemsDraft','itemsSaved','createItemFinding'].map(key=>[key,jest.fn()]));
}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);configure();
  api.get.mockResolvedValue({data:{version:'iso27001-omni-2',answers:{},step:0,revision:0,completed:false,narrative:'',lineage_stale:false}});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('held ISO disclosure retains both exact native fragments and the original trigger in the shared presentation',async()=>{
  await render();const definition=state.definition,source=sourcePresentation(definition),guide=operatorGuidance('iso-27001',definition);
  const disclosure=document.querySelector('.cis-collapsible-requirement');
  expect(disclosure.open).toBe(false);expect(disclosure.textContent).toContain(isoGuideEntry(definition.id)?.plain||guide.meaning);
  expect(disclosure.querySelector('.assessment-requirement').textContent).toContain(source.text||guide.meaning);
  const trigger=isoCriteria.requirements[definition.id].trigger;
  if(trigger)expect(disclosure.textContent).toContain(trigger);else expect(disclosure.querySelector('.gn-trigger')).toBeNull();
  expect(document.querySelector('[aria-label="SoA applicability"]').value).toBe('included');expect(document.querySelector('[aria-label="SoA justification"]').value).toBe(state.form.soa_justification);
  expect(document.querySelector('[aria-label="Current implementation"]').value).toBe(state.form.implementation);
  expect(actions.save).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test.each(['inactive','wrong-current-identity'])('%s native guide predicate disables History instead of opening an empty destination',async scenario=>{
  if(scenario==='inactive')state.ctx.configuration.__program_active=false;
  else state.current={...state.current,framework_assessment_id:'different-native-record'};
  await render();expect(document.querySelector('[data-testid="iso-guided-assessment"]')).toBeNull();
  const menu=await openDetails(),history=[...menu.querySelectorAll('[role="menuitem"]')].find(node=>node.textContent==='Interview history');
  expect(history.getAttribute('aria-disabled')).toBe('true');expect(api.get).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('recorded notes retain equivalent native access in Assessment details and return to its trigger',async()=>{
  await render();const menu=await openDetails(),notes=[...menu.querySelectorAll('[role="menuitem"]')].find(node=>node.textContent==='Recorded notes');
  await act(async()=>notes.click());expect(document.querySelector('[aria-label="Recorded notes"]').value).toBe(state.form.notes);
  expect(document.querySelector('[aria-label="Previously recorded notes"]')).toBeNull();
  await act(async()=>button('Back to assessment').click());expect(document.activeElement).toBe(button('Assessment details'));
  expect(actions.put).not.toHaveBeenCalled();expect(actions.save).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('shared ISO frame keeps final native save and manual status separate from narrative staging',async()=>{
  configure('4.1');await render();
  const partial=document.querySelector('input[value="in_progress"]');expect(partial.checked).toBe(true);
  const addressed=document.querySelector('input[value="addressed"]');await act(async()=>addressed.click());expect(actions.put).toHaveBeenCalledWith('status','addressed');
  await act(async()=>button('Save assessment').click());expect(actions.save).toHaveBeenCalledTimes(1);
  expect(actions.stageGuidedImplementation).not.toHaveBeenCalled();expect(actions.saveGuidedAssessment).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});

test('validated SoA view changes presentation context while retaining the same native Annex record and decision controller',async()=>{
  await render();const guide=document.querySelector('[data-testid="iso-guided-assessment"]'),identity=state.record.framework_assessment_id,native=JSON.stringify(state.current);
  expect(document.querySelector('[aria-label="Saved applicability"]')).toBeNull();
  state={...state,isoView:'soa'};await render();
  expect(document.querySelector('[aria-label="Saved applicability"]').textContent).toBe('Applicability: Included');
  expect(document.querySelector('.cis-collapsible-requirement summary').textContent).toContain('ISO 27001 SoA');
  expect(document.body.textContent).toContain('The native SoA decision and implementation remain distinct.');
  expect(document.querySelector('[data-testid="iso-guided-assessment"]')).toBe(guide);
  expect(document.querySelector('[aria-label="SoA applicability"]').value).toBe('included');expect(document.querySelector('[aria-label="SoA justification"]').value).toBe(state.form.soa_justification);
  expect(state.record.framework_assessment_id).toBe(identity);expect(JSON.stringify(state.current)).toBe(native);expect(api.get).toHaveBeenCalledTimes(1);
  state={...state,isoView:'annex_control'};await render();expect(document.querySelector('[aria-label="Saved applicability"]')).toBeNull();expect(document.querySelector('[data-testid="iso-guided-assessment"]')).toBe(guide);
  expect(api.put).not.toHaveBeenCalled();expect(actions.saveGuidedAssessment).not.toHaveBeenCalled();expect(actions.put).not.toHaveBeenCalled();
});

test('SoA guidance accompanies only the three existing native assessment fields without new answers or save semantics',async()=>{
  const native=JSON.stringify(state.current);state={...state,isoView:'soa'};await render();
  expect([...document.querySelectorAll('[data-soa-guidance]')].map(node=>node.dataset.soaGuidance)).toEqual(['necessary','rationale','implementation']);
  expect(document.querySelector('[data-soa-guidance="necessary"]').textContent).toContain('Is this control necessary for the organization’s selected treatments or applicable obligations?');
  expect(document.querySelector('[data-soa-guidance="rationale"]').textContent).toContain('What is the organization-specific reason for including this control or excluding it from the Annex A reference set?');
  expect(document.querySelector('[data-soa-guidance="implementation"]').textContent).toContain('If necessary, is the control implemented?');
  for(const node of document.querySelectorAll('[data-soa-guidance]'))expect(node.textContent).toContain('ISO/IEC 27001:2022 · 6.1.3(d)');
  const applicability=document.querySelector('[aria-label="SoA applicability"]'),rationale=document.querySelector('[aria-label="SoA justification"]');
  expect(applicability.value).toBe('included');expect([...applicability.options].map(option=>option.value)).toEqual(['','included','excluded']);expect(rationale.value).toBe(state.form.soa_justification);expect(rationale.maxLength).toBe(4000);
  expect(document.querySelectorAll('input[name="brawndo-assessment-status"]')).toHaveLength(5);expect(document.querySelector('[data-soa-guidance] input')).toBeNull();
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(applicability,'excluded');applicability.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(actions.put).toHaveBeenCalledWith('soa_applicability','excluded');expect(actions.save).not.toHaveBeenCalled();expect(actions.saveGuidedAssessment).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(JSON.stringify(state.current)).toBe(native);
  state={...state,isoView:'annex_control'};await render();expect(document.querySelectorAll('[data-soa-guidance]')).toHaveLength(0);expect(document.querySelector('[aria-label="SoA justification"]').value).toBe(state.form.soa_justification);
});
