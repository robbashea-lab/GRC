import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import SocSequentialInterview from './SocSequentialInterview';
import {socGuidedCatalog,socGroups,socExtraQuestions} from '@/lib/socGuidedAssessment';

let root,container,props;
const button=name=>[...container.querySelectorAll('button')].find(item=>item.textContent===name);
const render=()=>act(async()=>root.render(<SocSequentialInterview {...props}/>));
const click=name=>act(async()=>button(name).click());
const visibleExtras=(answers,version)=>socExtraQuestions(answers,version).filter(question=>question.id!=='evidence');
function configure(id,answers={},version=socGuidedCatalog.version){
  const refresh=next=>{props={...props,...next};root.render(<SocSequentialInterview {...props}/>);};
  props={groups:socGroups(id,answers,version),extras:visibleExtras(answers,version),answers,step:0,blocked:false,busy:false,
    setStep:jest.fn(step=>refresh({step})),put:jest.fn((key,value)=>{const next={...props.answers,[key]:value};refresh({answers:next,groups:socGroups(id,next,version),extras:visibleExtras(next,version)});}),
    onNext:jest.fn(()=>{if(props.step<props.groups.length-1)refresh({step:props.step+1});}),onPause:jest.fn(),onSaveClose:jest.fn()};
}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test.each(['CC1.1','A1.1','C1.1','PI1.1','P1.1'])('%s presents the exact SOC question order, help and choices and reviews the same identities',async id=>{
  const answers={additional_gap:'No',additional_confirmation:'No',evidence:'Retained supporting record'};
  for(const group of socGuidedCatalog.definitions[id].groups)for(const question of group.questions){answers[question.id]=question.type==='text'?'Retained optional response':question.type==='context'?'Relevant':'Yes';answers[question.id+'_detail']='Exact context for '+question.id;}
  configure(id,answers);await render();
  const questions=[...props.groups.flatMap(group=>group.questions),...props.extras];
  for(const [index,question] of questions.entries()){
    expect(container.querySelectorAll('fieldset')).toHaveLength(1);expect(container.querySelector('fieldset').dataset.questionId).toBe(question.id);
    expect(container.querySelector('legend').textContent).toBe(question.prompt);if(question.help)expect(container.textContent).toContain(question.help);
    if(question.type==='text')expect(document.getElementById('soc-answer-'+question.id)).toBeTruthy();
    else expect([...container.querySelector('select').options].slice(1).map(option=>option.value)).toEqual(question.choices);
    await click(index===questions.length-1?'Review answers':'Continue');
  }
  expect([...container.querySelectorAll('.cis-answer-review strong')].map(item=>item.textContent)).toEqual(questions.map(question=>question.prompt));
  expect(container.querySelectorAll('.cis-answer-review li')).toHaveLength(questions.length);expect(container.textContent).not.toContain('Reported supporting records');
  await click('Edit answer 1');expect(container.querySelector('fieldset').dataset.questionId).toBe(questions[0].id);
  expect(props.answers.evidence).toBe('Retained supporting record');expect(props.onSaveClose).not.toHaveBeenCalled();
});
test('local navigation, group checkpoint, Back, Pause and explicit save remain distinct',async()=>{
  configure('P6.1');await render();const first=props.groups[0].questions;
  await click('Continue');expect(container.querySelector('fieldset').dataset.questionId).toBe(first[1].id);expect(props.onNext).not.toHaveBeenCalled();
  await click('Back');expect(container.querySelector('fieldset').dataset.questionId).toBe(first[0].id);expect(props.onNext).not.toHaveBeenCalled();
  await click('Continue');await act(async()=>props.put(first[1].id,'Relevant'));await click('Continue');expect(props.onNext).toHaveBeenCalledTimes(1);expect(props.step).toBe(1);
  await click('Save & close');expect(props.onSaveClose).toHaveBeenCalledTimes(1);await click('Pause & return');expect(props.onPause).toHaveBeenCalledTimes(1);expect(props.onNext).toHaveBeenCalledTimes(1);
});
test('context branches and notes retain exact native keys without clearing inactive answers',async()=>{
  const answers={'P6.1-responsibility':'Yes','P6.1-disclosure-context':'Relevant','P6.1-consent':'Yes','P6.1-consent_detail':'Retained consent context'};
  configure('P6.1',answers);await render();await click('Continue');
  const select=container.querySelector('select');await act(async()=>{select.value='Outside the selected system';select.dispatchEvent(new Event('change',{bubbles:true}));});
  const note=container.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(note,'Exact scope explanation');note.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(props.put).toHaveBeenLastCalledWith('P6.1-disclosure-context_detail','Exact scope explanation');expect(container.textContent).toContain('required for this scope decision');
  expect(props.groups.flatMap(group=>group.questions).map(question=>question.id)).not.toContain('P6.1-consent');expect(props.answers['P6.1-consent_detail']).toBe('Retained consent context');
  await click('Continue');expect(container.querySelector('fieldset').dataset.questionId).toBe('additional_gap');
  await act(async()=>props.put('additional_gap','Yes'));await click('Continue');expect(container.querySelector('fieldset').dataset.questionId).toBe('gaps');
  expect(props.answers['P6.1-consent']).toBe('Yes');
});
test('read-only responses and forward actions are disabled while safe Pause remains available',async()=>{
  configure('CC1.1');props.blocked=true;await render();expect(container.querySelector('fieldset').disabled).toBe(true);expect(button('Continue').disabled).toBe(true);expect(button('Save & close').disabled).toBe(true);
  await click('Pause & return');expect(props.onPause).toHaveBeenCalledTimes(1);expect(props.put).not.toHaveBeenCalled();expect(props.onNext).not.toHaveBeenCalled();
});
test('retained question versions keep their own optional prompts and order',async()=>{
  configure('CC1.1',{},'soc2-omni-1');props.step=props.groups.length-1;await render();
  const questions=[...props.groups.at(-1).questions,...props.extras];
  for(const [index,question] of questions.entries()){
    expect(container.querySelector('fieldset').dataset.questionId).toBe(question.id);expect(container.querySelector('legend').textContent).toBe(question.prompt);
    await click(index===questions.length-1?'Review answers':'Continue');
  }
  expect([...container.querySelectorAll('.cis-answer-review strong')].slice(-props.extras.length).map(item=>item.textContent)).toEqual(props.extras.map(question=>question.prompt));
  expect(container.textContent).not.toContain('Is there an additional confirmed gap relevant to this requirement?');expect(props.onNext).not.toHaveBeenCalled();
});
