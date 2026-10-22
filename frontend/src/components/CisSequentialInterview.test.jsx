import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import CisSequentialInterview from './CisSequentialInterview';
import {omniGroups} from '@/lib/refinedOmni';
import {nativeCisQuestionTitle} from './RefinedOmniInterview';
import {visibleQuestions,versionForSafeguard,updateGuidedAnswer} from '@/lib/guidedAssessment';
let root,container,props;
const button=name=>[...container.querySelectorAll('button')].find(item=>item.textContent===name);
const render=()=>act(async()=>root.render(<CisSequentialInterview {...props}/>));
const click=name=>act(async()=>button(name).click());
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
function configure(id){const version=versionForSafeguard(id),questions=visibleQuestions(id,{},version);props={id,version,answers:{},step:questions[0].id,blocked:false,busy:false,setStep:jest.fn(value=>{props={...props,step:value};root.render(<CisSequentialInterview {...props}/>);}),put:jest.fn((question,value)=>{props={...props,answers:updateGuidedAnswer(props.answers,question,value)};root.render(<CisSequentialInterview {...props}/>);}),detail:jest.fn(),onNext:jest.fn(),onPause:jest.fn()};return questions;}
test.each(['1.1','18.2','18.5'])('%s uses its exact current native schema, help, choices and individual matrix row identity',async id=>{
  configure(id);const questions=visibleQuestions(id,props.answers,props.version);await render();
  expect(container.querySelector('legend').textContent).toBe(nativeCisQuestionTitle(id,questions[0]));
  expect(container.textContent).toContain(questions[0].help);
  props.answers={[questions[0].id]:'Yes'};const matrix=visibleQuestions(id,props.answers,props.version).find(question=>question.type==='matrix');expect(matrix).toBeDefined();props.step=matrix.id;await render();
  expect(container.querySelectorAll('select')).toHaveLength(1);expect(container.querySelector('select').getAttribute('aria-label')).toBe(matrix.rows[0]);
  await act(async()=>{const select=container.querySelector('select');select.value=matrix.choices.find(value=>value==='Not sure')||matrix.choices[0];select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(props.put).toHaveBeenCalledWith(matrix,{[matrix.rows[0]]:matrix.choices.find(value=>value==='Not sure')||matrix.choices[0]});
  if(matrix.rows.length>1){await click('Continue');expect(container.querySelector('select').getAttribute('aria-label')).toBe(matrix.rows[1]);expect(props.onNext).not.toHaveBeenCalled();await click('Back');expect(container.querySelector('select').getAttribute('aria-label')).toBe(matrix.rows[0]);}
  await click('Pause & return');expect(props.onPause).toHaveBeenCalledTimes(1);
});
test('answer review edits exact question identities, retains current implementation, and delegates native validation and save',async()=>{
  configure('1.3');const questions=visibleQuestions(props.id,props.answers,props.version);props.step=questions.at(-1).id;await render();await click('Review answers');
  expect(container.querySelectorAll('.cis-answer-review li')).toHaveLength(questions.length);
  expect(props.onNext).not.toHaveBeenCalled();await click('Keep current implementation');expect(props.onPause).toHaveBeenCalledTimes(1);
  await click('Edit answer 1');expect(props.setStep).toHaveBeenCalledWith(questions[0].id);
  props.step=questions.at(-1).id;await render();await click('Review answers');await click('Review summary');
  const groups=omniGroups(props.id,props.answers,props.version);expect(props.onNext).toHaveBeenCalledWith(groups.findIndex(group=>group.ids.includes(questions.at(-1).id)),groups);
});
test('permission denial disables response mutation and forward actions without blocking safe pause',async()=>{
  configure('1.1');props.blocked=true;await render();expect(container.querySelector('fieldset').disabled).toBe(true);expect(button('Continue').disabled).toBe(true);await click('Pause & return');expect(props.onPause).toHaveBeenCalledTimes(1);expect(props.put).not.toHaveBeenCalled();expect(props.onNext).not.toHaveBeenCalled();
});


test.each(['1.3','1.5'])('%s preserves non-matrix native question types, branches and exact option values',async id=>{
  configure(id);const initial=visibleQuestions(id,{},props.version);props.answers={[initial[0].id]:'Yes'};
  const questions=visibleQuestions(id,props.answers,props.version);
  for(const question of questions){props.step=question.id;await render();expect(container.querySelector('legend').textContent).toBe(nativeCisQuestionTitle(id,question));
    if(question.type==='select')expect([...container.querySelector('select').options].slice(1).map(option=>option.value)).toEqual(question.choices);
    if(question.type==='text')expect(container.querySelector(`textarea[aria-label="${nativeCisQuestionTitle(id,question)}"]`)).toBeTruthy();
  }
  props.answers={[initial[0].id]:'No'};props.step=initial[0].id;await render();expect(container.querySelector('.cis-sequential-interview').textContent).not.toContain('Implemented status automatically');expect(props.onNext).not.toHaveBeenCalled();
});

test('sequential questions reuse native visible wording and group-note identity without replacing historical context',async()=>{
  configure('1.1');props={...props,step:'system',answers:{inventory:'Yes',inventory_detail:'Existing group uncertainty',system_detail:'Previously reported source context',system:'Native retained system'}};await render();
  expect(container.querySelector('legend').textContent).toBe('Where do you maintain your inventory?');
  expect(container.textContent).toContain('Previously reported context: Previously reported source context');
  expect(container.textContent).toContain('Record anything missing, anything not yet confirmed, or who can help confirm it.');
  const note=container.querySelector('[aria-label="Known gaps or uncertainties"]');expect(note.value).toBe('Existing group uncertainty');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(note,'Reviewed group uncertainty');note.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(props.detail).toHaveBeenCalledWith('inventory_detail','Reviewed group uncertainty');expect(props.answers.system_detail).toBe('Previously reported source context');
});
test('safeguard 1.2 preserves saved 1.1 inventory context only in its native Identification group',async()=>{
  configure('1.2');props={...props,answers:{process:'Yes'},step:'inventory_dependency',inventoryContext:{implementation:'Saved upstream inventory narrative'}};await render();
  const context=container.querySelector('[aria-label="Saved safeguard 1.1 inventory context"]');expect(context).toBeTruthy();expect(context.textContent).toContain('Saved upstream inventory narrative');expect(context.textContent).toContain('This saved context is not proof of completeness and does not change either assessment.');
  props.step='process';await render();expect(container.querySelector('[aria-label="Saved safeguard 1.1 inventory context"]')).toBeNull();expect(props.put).not.toHaveBeenCalled();expect(props.onNext).not.toHaveBeenCalled();
});

test('native critical-question classification follows its existing presentation flag without computing a new status',async()=>{
  configure('1.1');props.visualReference=true;await render();expect(container.querySelector('.cis-omni-criterion').textContent).toBe('Required for Implemented');
  props={...props,step:'system',answers:{inventory:'Yes'}};await render();expect(container.querySelector('.cis-omni-criterion')).toBeNull();expect(props.put).not.toHaveBeenCalled();expect(props.onNext).not.toHaveBeenCalled();
});

test('approved 1.1 matrix label abbreviations retain full native answer values',async()=>{
  configure('1.1');props={...props,step:'coverage',answers:{inventory:'Yes'},safeguard11:true};await render();
  const partly=[...container.querySelector('select').options].find(option=>option.value==='Partially');expect(partly.textContent).toBe('Partly');
  expect(props.put).not.toHaveBeenCalled();
});

test.each([false,true])('1.1 follows native group order across coverage, source-conditioned exclusions and attributes (exclusion=%s)',async exclusion=>{
  configure('1.1');const catalog=visibleQuestions('1.1',{inventory:'Yes'},props.version),coverage=catalog.find(question=>question.id==='coverage');
  props={...props,step:'coverage',answers:{inventory:'Yes',coverage:Object.fromEntries(coverage.rows.map((row,index)=>[row,exclusion&&index===0?'Not applicable':'Yes']))}};await render();
  for(let index=0;index<coverage.rows.length;index++)await click('Continue');
  const groups=omniGroups(props.id,props.answers,props.version),coverageGroup=groups.findIndex(group=>group.ids.includes('coverage'));
  expect(props.onNext).toHaveBeenLastCalledWith(coverageGroup,groups,exclusion?'scope_reason':'attributes');
  if(exclusion){
    // Catalog order places attributes first; the native assessment group requires the explanation first.
    const raw=visibleQuestions(props.id,props.answers,props.version).map(question=>question.id);expect(raw.indexOf('attributes')).toBeLessThan(raw.indexOf('scope_reason'));
    props.step='scope_reason';await render();expect(container.querySelector('legend').textContent).toBe(nativeCisQuestionTitle('1.1',groups[coverageGroup].questions.find(question=>question.id==='scope_reason')));
    const rationale=groups[coverageGroup].questions.find(question=>question.id==='scope_reason'),field=container.querySelector(`textarea[aria-label="${nativeCisQuestionTitle('1.1',rationale)}"]`);expect(field).toBeTruthy();
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'This source condition does not apply to the synthetic fixture.');field.dispatchEvent(new Event('input',{bubbles:true}));});
    expect(props.put).toHaveBeenCalledWith(expect.objectContaining({id:'scope_reason'}),'This source condition does not apply to the synthetic fixture.');
    await click('Continue');expect(props.onNext).toHaveBeenLastCalledWith(coverageGroup,omniGroups(props.id,props.answers,props.version),'attributes');
  }
});
