import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import GuidedAssessor from './GuidedAssessor';
import {catalogForVersion,versionForSafeguard,visibleQuestions} from '@/lib/guidedAssessment';
import {focusedResult} from '@/lib/focusedOmni';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},formatError:error=>error.message}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'focused-actor',workspace_mode:'demo'}})}));

const token='2026-10-01T12:00:00Z',newToken='2026-10-02T12:00:00Z',generated='2026-10-01T13:00:00Z',fingerprint='a'.repeat(64);
let root,container,stored,history,props,scopeFingerprint;
const copy=value=>JSON.parse(JSON.stringify(value));
const button=name=>[...document.querySelectorAll('button')].find(element=>element.textContent.trim()===name);
const work=()=>({context_complete:true,finding_ids:[],review_ids:[],task_ids:[],open_findings:0,open_actions:0,overdue_reviews:0,overdue_actions:0,priority_records:[]});
const record=id=>({client_id:'demo_brawndo',framework_key:'cis-ig1',framework_assessment_id:'focused-'+id,definition_id:id,title:'Synthetic lifecycle safeguard '+id,status:'not_assessed',verification:'not_verified',implementation:'',last_saved:token,assessment_history:[],work:work()});
const interview=id=>({client_id:'demo_brawndo',assessment_id:'focused-'+id,user_id:'focused-actor',version:versionForSafeguard(id,true),revision:0,answers:{},step:0,completed:false,narrative:'',result:null,base_assessment_token:token,base_scope_fingerprint:fingerprint,current_scope_fingerprint:fingerprint,lineage_known:true});
function completeAnswers(id){
  const version=versionForSafeguard(id,true),rootAnswer={[id==='1.1'?'inventory':'process']:'Yes'},today=new Date(),day=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  return Object.fromEntries(visibleQuestions(id,rootAnswer,version).map(question=>[question.id,question.type==='matrix'?Object.fromEntries(question.rows.map(row=>[row,'Yes'])):question.type==='text'?question.id==='system'?'OriginalTool':question.id==='owner'?'Synthetic IT team':'':question.type==='date'?day:question.type==='multi'?['Quarantine or isolate']:question.id==='frequency'?(id==='1.1'?'Every six months':'Weekly'):question.id==='sources'?'One source':question.id==='unresolved'?'No':'Yes']));
}
function completedSaved(id){
  const answers=completeAnswers(id),result=focusedResult(id,answers,versionForSafeguard(id,true));
  expect(result.status).toBe('addressed');
  stored={...interview(id),revision:3,answers,completed:true,result,narrative:result.narrative,generated_at:generated,updated_at:generated};
  const current={...record(id),status:'addressed',last_saved:newToken,implementation:result.narrative,guided_assessment_source:{origin:'guided-assessment-pilot',by:'focused-actor',version:stored.version,revision:stored.revision,generated_at:generated}};
  props={...props,record:current,current,form:copy(current)};
}
const readStored=()=>({...copy(stored),current_assessment_token:props.current.last_saved,current_scope_fingerprint:scopeFingerprint,lineage_stale:stored.base_assessment_token!==props.current.last_saved||stored.base_scope_fingerprint!==scopeFingerprint});
async function render(extra={}){props={...props,...extra};await act(async()=>root.render(<GuidedAssessor {...props}/>));}
async function remount(){await act(async()=>root.unmount());root=createRoot(container);await render();}
async function open(){await act(async()=>document.querySelector('[aria-label="Open OmniBot guide"]').click());}
async function click(name){const target=button(name);expect(target).toBeTruthy();expect(target.disabled).toBe(false);await act(async()=>target.click());}
async function value(selector,next){const target=document.querySelector(selector);expect(target).toBeTruthy();const prototype=target.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLTextAreaElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(target,next);target.dispatchEvent(new Event(target.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
async function confirmComparison(){const group=document.querySelector('[aria-label="Compare saved assessment"]');expect(group).toBeTruthy();expect(button('Retain answers & continue').disabled).toBe(true);await act(async()=>group.querySelector('input').click());await click('Retain answers & continue');}
async function updateFact(topic){await value('[aria-label="Fact or requirement to update"]',topic);await click('Update this fact');if(document.querySelector('[aria-label="Compare saved assessment"]'))await confirmComparison();}
async function reconcileProposal(narrative){const group=document.querySelector('[aria-label="Reconcile implementation narrative"]');expect(group).toBeTruthy();expect(group.querySelector('textarea').value).toBe(props.form.implementation);await value('[aria-label="Reconciled native implementation draft"]',narrative);await act(async()=>group.querySelector('input').click());await click('Save reconciled proposal');}

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();window.history.replaceState({},'', '/');
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  const current=record('1.1');stored=interview('1.1');history=[];scopeFingerprint=fingerprint;
  props={clientId:'demo_brawndo',framework:'cis-ig1',configuration:{implementation_group:1},record:current,current,form:copy(current),contextComplete:true,related:{},onApply:jest.fn(),onDraftChange:jest.fn(),onUpdateImplementation:jest.fn(()=>true)};
  api.get.mockImplementation(async path=>({data:path.endsWith('/history')?{items:copy(history),next_before_revision:null}:readStored()}));
  api.put.mockImplementation(async (_path,body)=>{
    if(body.expected_revision!==stored.revision)throw new Error('Interview changed in another window; reload before saving');
    if(stored.revision&&(stored.completed||body.restart)&&!history.some(item=>item.revision===stored.revision))history.push(copy(stored));
    const base=body.restart||!stored.revision?{base_assessment_token:body.base_assessment_token,base_scope_fingerprint:body.base_scope_fingerprint}:{base_assessment_token:stored.base_assessment_token,base_scope_fingerprint:stored.base_scope_fingerprint};
    stored={...stored,...copy(body),...base,revision:stored.revision+1,updated_at:generated,generated_at:body.completed?generated:null};
    return {data:readStored()};
  });
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test.each(['1.1','1.2'])('%s recognizes its current-source completion after native Save without restarting onboarding',async id=>{
  completedSaved(id);await render();
  expect(document.querySelector('.guided-context-prompt').textContent).toContain('Your implementation is saved');
  await open();expect(document.querySelector('[aria-label="Fact or requirement to update"]')).toBeTruthy();
  expect(document.body.textContent).not.toContain('saved assessment changed after this interview began');
  expect(document.querySelector('.guided-panel legend').textContent).toBe('Current change report');
  expect(api.put).not.toHaveBeenCalled();expect(props.onApply).not.toHaveBeenCalled();
});

test.each(['1.1','1.2'].flatMap(id=>['Save answer & update implementation draft','Save interview answer & continue','Save and exit','Review updated proposal'].map(action=>[id,action])))('%s compares its own applied gap source before direct %s',async(id,action)=>{
  completedSaved(id);
  if(id==='1.1')stored.answers.coverage['Cloud-hosted assets']='Partially';else stored.answers.frequency='Monthly';
  stored.result=focusedResult(id,stored.answers,stored.version);stored.narrative=stored.result.narrative;
  const current={...props.current,status:'in_progress',implementation:stored.narrative},original=copy(stored);props={...props,record:current,current,form:copy(current)};
  await render();await open();
  expect(document.body.textContent).not.toContain('saved assessment changed after this interview began');
  const changedPrompt=document.querySelector('.guided-panel legend').textContent;
  await value(id==='1.1'?'.guided-panel fieldset [aria-label="Cloud-hosted assets"]':'.guided-panel fieldset select',id==='1.1'?'Yes':'Weekly');
  await value('[aria-label="Missing elements or verification owner"]','SYNTHETIC resolved gap: the current reported requirement is now met.');
  await click(action);
  expect(document.querySelector('[aria-label="Compare saved assessment"]')).toBeTruthy();
  expect(stored).toEqual(original);expect(history).toEqual([]);expect(props.current).toEqual(current);
  expect(api.put).not.toHaveBeenCalled();expect(props.onUpdateImplementation).not.toHaveBeenCalled();expect(props.onApply).not.toHaveBeenCalled();
  await confirmComparison();
  expect(document.querySelector('.guided-panel legend').textContent).toBe(changedPrompt);
  expect(history[0]).toEqual(original);expect(stored.base_assessment_token).toBe(newToken);expect(stored.completed).toBe(false);
  expect(id==='1.1'?stored.answers.coverage['Cloud-hosted assets']:stored.answers.frequency).toBe(id==='1.1'?'Yes':'Weekly');
  expect(stored.answers[id==='1.1'?'coverage_detail':'frequency_detail']).toContain('resolved gap');
  expect(props.current).toEqual(current);expect(props.current.guided_assessment_source.revision).toBe(original.revision);
  if(action==='Save answer & update implementation draft'){
    await click(action);const group=document.querySelector('[aria-label="Reconcile implementation narrative"]');expect(group).toBeTruthy();
    const proposed=focusedResult(id,stored.answers,stored.version).narrative;await value('[aria-label="Reconciled native implementation draft"]',proposed);await act(async()=>group.querySelector('input').click());await click(action);
    expect(props.onUpdateImplementation).toHaveBeenCalledWith(proposed,current.implementation);await render({form:{...current,implementation:proposed}});
    expect(document.body.textContent).toContain('Current implementation is an unsaved native draft');
    expect(document.body.textContent).not.toContain('saved assessment changed after this interview began');expect(props.current).toEqual(current);expect(history[0]).toEqual(original);
    const checkpoint=copy(stored);await remount();await open();await click('Review interview history');
    expect(document.body.textContent).not.toContain('saved assessment changed after this interview began');expect(document.body.textContent).toContain('Revision '+original.revision+' · '+original.version+' · Completed interview');expect(document.body.textContent).toContain(original.narrative);
    expect(stored).toEqual(checkpoint);expect(history[0]).toEqual(original);expect(props.current).toEqual(current);
    const writes=api.put.mock.calls.length,newer={...current,last_saved:'2026-10-03T12:00:00Z',implementation:'SYNTHETIC newer native edit',guided_assessment_source:null};
    await render({current:newer,form:copy(newer)});
    expect(document.body.textContent).toContain('saved assessment changed after this interview began');await click(action);
    expect(document.querySelector('[aria-label="Compare saved assessment"]')).toBeTruthy();expect(api.put).toHaveBeenCalledTimes(writes);expect(props.current).toEqual(newer);
  }
});

test('a later scope change still requires comparison even when the native record retains the current guided source',async()=>{
  completedSaved('1.1');scopeFingerprint='b'.repeat(64);await render();
  expect(document.querySelector('.guided-context-prompt').textContent).toContain('compare your saved answers');
  expect(document.querySelector('.guided-context-prompt').textContent).not.toContain('Your implementation is saved');
  await open();expect(button('Compare & continue from saved assessment')).toBeTruthy();
  expect(api.put).not.toHaveBeenCalled();expect(props.onApply).not.toHaveBeenCalled();
});

test.each([['1.1','cis-v8.1-control1-2'],['1.2','brawndo-cis-pilot-1']])('%s direct Save and exit keeps older %s answers out of a new current-version review',async(id,legacyVersion)=>{
  const topic=id==='1.1'?'inventory':'process',answers={[topic]:'No'},result=focusedResult(id,answers,legacyVersion);
  stored={...interview(id),version:legacyVersion,revision:7,answers,completed:true,result,narrative:'PERSISTED older-version reviewer wording.',generated_at:generated};
  const original=copy(stored),earlier={...original,revision:2,narrative:'PERSISTED earlier interview history.'};history=[earlier];
  const current={...record(id),last_saved:newToken,implementation:'PERSISTED native position; no replacement authorized.'};props={...props,record:current,current,form:copy(current)};
  await render();await open();await value('.guided-panel fieldset select','Not sure');
  await value('[aria-label="Missing elements or verification owner"]','PENDING older-version explanation; keep it unless I explicitly restart.');
  await click('Save and exit');
  const restart=document.querySelector('[aria-label="Confirm restart"]');expect(restart).toBeTruthy();expect(restart.querySelector('input')).toBeNull();
  expect(document.querySelector('[aria-label="Compare saved assessment"]')).toBeNull();expect(api.put).not.toHaveBeenCalled();
  expect(stored).toEqual(original);expect(history).toEqual([earlier]);expect(props.current).toEqual(current);
  await click('Cancel restart');
  expect(document.querySelector('.guided-panel fieldset select').value).toBe('Not sure');
  expect(document.querySelector('[aria-label="Missing elements or verification owner"]').value).toContain('PENDING older-version explanation');expect(props.onDraftChange).toHaveBeenLastCalledWith(true);
  await click('Save and exit');await click('Confirm restart');
  expect(api.put).toHaveBeenCalledTimes(1);expect(api.put).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({restart:true,version:versionForSafeguard(id,true),answers:{},completed:false,result:null,expected_revision:7}));
  expect(stored.version).toBe(versionForSafeguard(id,true));expect(stored.answers).toEqual({});expect(stored.completed).toBe(false);expect(stored.result).toBeNull();
  expect(history).toEqual([earlier,original]);expect(props.current).toEqual(current);expect(props.onApply).not.toHaveBeenCalled();expect(props.onUpdateImplementation).not.toHaveBeenCalled();
});

test.each(['1.1','1.2'])('%s retains a saved native Implemented position without demanding an initial interview',async id=>{
  stored=interview(id);const current={...record(id),status:'addressed',implementation:'SYNTHETIC existing supported native position; no Omni interview recorded.'};props={...props,record:current,current,form:copy(current)};
  await render();expect(document.querySelector('.guided-context-prompt').textContent).toContain('has a saved Implemented position');expect(document.querySelector('.guided-context-prompt').textContent).toContain('no new interview is required');
  await open();expect(document.querySelector('[aria-label="Fact or requirement to update"]')).toBeTruthy();expect(document.querySelector('.guided-panel legend').textContent).toBe('Current change report');expect(api.put).not.toHaveBeenCalled();expect(props.onApply).not.toHaveBeenCalled();
});

test.each(['saved','discarded'])('staged narrative notice distinguishes a %s native draft from the durable interview',async outcome=>{
  await render();await open();await value('.guided-panel fieldset select','Yes');await click('Save answer & update implementation draft');
  const staged=props.onUpdateImplementation.mock.calls[0][0];
  await render({form:{...props.form,implementation:staged}});
  expect(document.body.textContent).toContain('Current implementation is an unsaved native draft');expect(stored.answers.inventory).toBe('Yes');
  if(outcome==='saved'){
    const current={...props.current,implementation:staged,last_saved:newToken};await render({current,form:copy(current)});
    expect(document.body.textContent).toContain('Interview answers and Current implementation are saved');
  }else{
    await render({form:copy(props.current)});
    expect(document.body.textContent).toContain('The staged narrative is no longer the native draft');expect(props.current.implementation).toBe('');
  }
  expect(document.body.textContent).not.toContain('Current implementation is an unsaved native draft');expect(stored.answers.inventory).toBe('Yes');
});

test('saved implementation text stays saved when another native field changes, while replacement text is distinguished',async()=>{
  await render();await open();await value('.guided-panel fieldset select','Yes');await click('Save answer & update implementation draft');
  const staged=props.onUpdateImplementation.mock.calls[0][0],current={...props.current,implementation:staged,last_saved:newToken};
  await render({current,form:{...current,status:'in_progress'},assessmentDirty:true});
  expect(document.body.textContent).toContain('Interview answers and Current implementation are saved. Other native assessment changes remain unsaved');
  expect(document.body.textContent).not.toContain('Current implementation is an unsaved native draft');
  await render({form:{...props.form,implementation:'SYNTHETIC replacement draft not saved'}});
  expect(document.body.textContent).toContain('The staged narrative is no longer the native draft');
  expect(document.body.textContent).not.toContain('Interview answers and Current implementation are saved');expect(props.current.implementation).toBe(staged);
});

test.each(['1.1','1.2'])('%s targeted tool update compares the saved base, retains criteria and creates an explicit proposal',async id=>{
  completedSaved(id);const original=copy(stored),current=copy(props.current);await render();await open();await updateFact('system');
  expect(api.put.mock.calls.slice(0,2).map(([,body])=>body.expected_revision)).toEqual([3,4]);
  expect(api.put.mock.calls[0][1]).toEqual(expect.objectContaining({restart:true,answers:{},completed:false,base_assessment_token:newToken,base_scope_fingerprint:fingerprint}));
  expect(api.put.mock.calls[1][1]).toEqual(expect.objectContaining({answers:original.answers,completed:false,result:null}));
  expect(history[0]).toEqual(original);expect(props.current).toEqual(current);
  const prompt=visibleQuestions(id,original.answers,stored.version).find(question=>question.id==='system').prompt;
  expect(document.querySelector('.guided-panel legend').textContent).toBe(prompt);
  const tool=id==='1.1'?'NinjaOne':'Updated handling platform';await value('.guided-panel fieldset textarea',tool);await click('Review updated proposal');
  expect(props.onApply).not.toHaveBeenCalled();await reconcileProposal(focusedResult(id,{...original.answers,system:tool},stored.version).narrative);
  expect(stored.answers).toEqual({...original.answers,system:id==='1.1'?'NinjaOne':'Updated handling platform'});
  expect(stored.result.status).toBe('addressed');expect(stored.narrative).not.toContain('OriginalTool');
  expect(props.current).toEqual(current);expect(props.onApply).not.toHaveBeenCalled();expect(props.onUpdateImplementation).not.toHaveBeenCalled();
  expect(button('Apply to Assessment').disabled).toBe(true);
  await act(async()=>document.querySelector('.guided-replacement input').click());await click('Apply to Assessment');
  expect(props.onApply).toHaveBeenCalledWith(expect.objectContaining({status:'addressed',implementation:stored.narrative,guided_assessment_source:expect.objectContaining({revision:stored.revision})}));
  expect(props.onApply.mock.calls[0][0]).not.toHaveProperty('verification');expect(props.current.verification).toBe('not_verified');
});

test.each(['1.1','1.2'])('%s new material gap is a reassessment proposal and never silently changes saved Implemented',async id=>{
  completedSaved(id);const current=copy(props.current);await render();await open();await updateFact('frequency');
  const frequency=id==='1.1'?'Annually':'Monthly';await value('.guided-panel fieldset select',frequency);await click('Review updated proposal');
  await reconcileProposal(focusedResult(id,{...stored.answers,frequency},stored.version).narrative);
  expect(stored.result.status).toBe('in_progress');expect(stored.result.gaps.length).toBeGreaterThan(0);
  expect(document.body.textContent).toContain('Recommended Implementation Status: Partially Implemented');
  expect(props.current).toEqual(current);expect(props.onApply).not.toHaveBeenCalled();expect(props.onUpdateImplementation).not.toHaveBeenCalled();
  await remount();
  expect(document.querySelector('.guided-context-prompt').textContent).toMatch(/gap|unresolved|reassessment/i);
  expect(document.querySelector('.guided-context-prompt').textContent).not.toContain('maintain Safeguard');
});

test('a manually retained fact survives incremental reconciliation and final proposal Apply while gaps still determine status',async()=>{
  const manual='SYNTHETIC unrelated valid fact: the provider maintains the hosted-device scope.';
  const answers=completeAnswers('1.1');answers.coverage.Servers='Partially';answers.frequency='Annually';stored={...interview('1.1'),revision:2,answers};
  const current={...record('1.1'),implementation:manual};props={...props,record:current,current,form:copy(current)};await render();await open();
  await value('.guided-panel fieldset [aria-label="Servers"]','Yes');await click('Save answer & update implementation draft');
  const group=document.querySelector('[aria-label="Reconcile implementation narrative"]');expect(group.querySelector('textarea').value).toBe(manual);
  const chosen=manual+' '+focusedResult('1.1',{...answers,coverage:{...answers.coverage,Servers:'Yes'}},stored.version).narrative;
  await value('[aria-label="Reconciled native implementation draft"]',chosen);await act(async()=>group.querySelector('input').click());await click('Save answer & update implementation draft');
  expect(props.onUpdateImplementation).toHaveBeenCalledWith(chosen,manual);await render({form:{...props.form,implementation:chosen}});
  await click('Review updated proposal');const finalGroup=document.querySelector('[aria-label="Reconcile implementation narrative"]');expect(finalGroup.querySelector('textarea').value).toBe(chosen);
  await act(async()=>finalGroup.querySelector('input').click());await click('Save reconciled proposal');
  expect(stored.narrative).toBe(chosen);expect(stored.result.narrative).toBe(chosen);expect(stored.result.status).toBe('in_progress');expect(stored.result.gaps.length).toBeGreaterThan(0);
  expect(props.onApply).not.toHaveBeenCalled();await act(async()=>document.querySelector('.guided-replacement input').click());await click('Apply to Assessment');
  expect(props.onApply).toHaveBeenCalledWith(expect.objectContaining({implementation:chosen,status:'in_progress'}));expect(props.current.implementation).toBe(manual);expect(props.current.status).toBe('not_assessed');expect(props.current.verification).toBe('not_verified');
});

test('a compare CAS rejection preserves the previous completed interview and its history',async()=>{
  completedSaved('1.1');const original=copy(stored);history=[{...original,revision:1,narrative:'Earlier preserved snapshot'}];const previousHistory=copy(history);
  await render();await open();await value('[aria-label="Fact or requirement to update"]','system');await click('Update this fact');
  api.put.mockRejectedValueOnce(new Error('Interview changed in another window; reload before saving'));await confirmComparison();
  expect(stored).toEqual(original);expect(history).toEqual(previousHistory);expect(document.body.textContent).toContain('Interview changed in another window');
  expect(document.querySelector('[aria-label="Compare saved assessment"]')).toBeTruthy();expect(props.onApply).not.toHaveBeenCalled();expect(props.onUpdateImplementation).not.toHaveBeenCalled();
});

test('a failed retained-answer write exposes its unsaved state and can retry without losing archived completion',async()=>{
  completedSaved('1.1');const original=copy(stored);await render();await open();await value('[aria-label="Fact or requirement to update"]','system');await click('Update this fact');
  const write=api.put.getMockImplementation();api.put.mockImplementationOnce(write).mockRejectedValueOnce(new Error('Interview changed; reload before saving'));await confirmComparison();
  expect(stored.answers).toEqual({});expect(stored.revision).toBe(4);expect(history[0]).toEqual(original);
  expect(document.body.textContent).toContain('Retained answers are still unsaved');expect(document.querySelector('.guided-panel fieldset textarea').value).toBe('OriginalTool');expect(props.onDraftChange).toHaveBeenLastCalledWith(true);
  await click('Save and exit');expect(stored.answers).toEqual(original.answers);expect(stored.revision).toBe(5);expect(history[0]).toEqual(original);expect(props.onApply).not.toHaveBeenCalled();
});

test.each(['1.1','1.2'])('%s skips resolved groups and continues to the next unanswered criterion without losing a reported gap',async id=>{
  const answers=completeAnswers(id),version=versionForSafeguard(id,true);
  const questions=catalogForVersion(version).safeguards[id],topic=id==='1.1'?'coverage':'detection',nextTopic='frequency';
  if(id==='1.1')answers.coverage.Servers='Partially';else answers.detection='No';
  delete answers.frequency;
  stored={...interview(id),revision:2,answers};const current=record(id);props={...props,record:current,current,form:copy(current)};
  await render();await open();expect(document.querySelector('.guided-panel legend').textContent).toBe(questions.find(question=>question.id===topic).prompt);
  await value(id==='1.1'?'.guided-panel fieldset [aria-label="Servers"]':'.guided-panel fieldset select',id==='1.1'?'Partially':'Yes');await click('Save interview answer & continue');
  expect(document.querySelector('.guided-panel legend').textContent).toBe(questions.find(question=>question.id===nextTopic).prompt);
  await value('.guided-panel fieldset select',id==='1.1'?'Every six months':'Weekly');await click('Save interview answer & continue');
  if(id==='1.1'){expect(stored.answers.coverage.Servers).toBe('Partially');expect(stored.answers.attributes).toEqual(answers.attributes);expect(stored.result.status).toBe('in_progress');expect(stored.result.gaps.join(' ')).toContain('Servers');}
  else expect(stored.answers.detection).toBe('Yes');
  expect(props.onApply).not.toHaveBeenCalled();
});

test('1.2 shows the saved 1.1 inventory context without importing answers or changing either record',async()=>{
  const id='1.2',answers=completeAnswers(id);answers.inventory_dependency='Not sure';answers.detection='Not sure';stored={...interview(id),revision:2,answers};
  const current=record(id),inventoryContext={...record('1.1'),status:'in_progress',implementation:'SYNTHETIC inventory context: NinjaOne, server coverage not yet confirmed.'},original=copy(inventoryContext);
  props={...props,record:current,current,form:copy(current),inventoryContext};await render();await open();
  const context=document.querySelector('[aria-label="Saved safeguard 1.1 inventory context"]');expect(context).toBeTruthy();expect(context.textContent).toContain('server coverage not yet confirmed');expect(context.textContent).toContain('not proof of inventory completeness');
  expect(stored.answers.inventory_dependency).toBe('Not sure');expect(inventoryContext).toEqual(original);expect(api.put).not.toHaveBeenCalled();expect(props.onApply).not.toHaveBeenCalled();expect(props.onUpdateImplementation).not.toHaveBeenCalled();
});

test.each(['1.1','1.2'].flatMap(id=>['supported','gap','missing result'].map(kind=>[id,kind])))('%s opening and remounting a completed %s interview preserves its recorded output without applying or saving',async(id,kind)=>{
  const answers=completeAnswers(id),version=versionForSafeguard(id,true);
  if(kind==='gap'){answers.frequency=id==='1.1'?'Annually':'Monthly';answers.frequency_detail='PERSISTED synthetic explanation: required operating interval is not currently met.';}
  const narrative='PERSISTED synthetic narrative '+id+' '+kind+': retain the recorded reviewer wording and original question version.';
  const result=kind==='missing result'?null:{...focusedResult(id,answers,version),narrative,basis:['PERSISTED reviewer-reported basis']};
  stored={...interview(id),revision:7,answers,completed:true,version,narrative,result,generated_at:generated,updated_at:generated};
  const original=copy(stored),current=record(id);props={...props,record:current,current,form:copy(current)};
  await render();await open();
  for(let visit=0;visit<2;visit++){
    expect(stored).toEqual(original);expect(stored.version).toBe(version);expect(stored.narrative).toBe(narrative);expect(stored.result).toEqual(result);
    expect(document.body.textContent).toContain('Question set: '+version);
    if(kind==='supported'){expect(document.querySelector('[aria-label="Guided Current Implementation draft"]').value).toBe(narrative);expect(document.body.textContent).toContain('PERSISTED reviewer-reported basis');}
    if(kind==='gap'){
      const frequency=catalogForVersion(version).safeguards[id].find(question=>question.id==='frequency');
      expect(document.querySelector('.guided-panel legend').textContent).toBe(frequency.prompt);expect(document.querySelector('.guided-panel fieldset select').value).toBe(answers.frequency);expect(document.querySelector('[aria-label="Missing elements or verification owner"]').value).toBe(answers.frequency_detail);
    }
    if(kind==='missing result')expect(button('Apply to Assessment')).toBeUndefined();
    expect(api.put).not.toHaveBeenCalled();expect(props.onApply).not.toHaveBeenCalled();expect(props.onUpdateImplementation).not.toHaveBeenCalled();
    if(visit===0){await remount();await open();}
  }
});
