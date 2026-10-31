import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import IsoSequentialInterview from './IsoSequentialInterview';
import {isoGuidedCatalog, isoGroups, isoExtraQuestions} from '@/lib/isoGuidedAssessment';

let root, container, props;
const button = name => [...container.querySelectorAll('button')].find(item => item.textContent === name);
const render = () => act(async () => root.render(<IsoSequentialInterview {...props}/>));
const click = name => act(async () => button(name).click());
const visibleExtras = (answers, version) => isoExtraQuestions(answers, version).filter(question => question.id !== 'evidence');

function configure(id, answers = {}, version = isoGuidedCatalog.version) {
  const refresh = next => { props = {...props, ...next}; root.render(<IsoSequentialInterview {...props}/>); };
  props = {
    groups: isoGroups(id, answers, version), extras: visibleExtras(answers, version), answers, step: 0, blocked: false, busy: false,
    setStep: jest.fn(step => refresh({step})),
    put: jest.fn((key, value) => {
      const next = {...props.answers, [key]: value};
      refresh({answers: next, groups: isoGroups(id, next, version), extras: visibleExtras(next, version)});
    }),
    onNext: jest.fn(() => { if (props.step < props.groups.length - 1) refresh({step: props.step + 1}); }),
    onPause: jest.fn(), onSaveClose: jest.fn(),
  };
}
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test.each(['4.1', 'A.5.1', 'A.6.1', 'A.7.1', 'A.8.13'])('%s preserves native question order, wording, help, choices and answer-review identities', async id => {
  const answers = {additional_gap: 'No', additional_confirmation: 'No', evidence: 'Retained supporting record'};
  for (const group of isoGuidedCatalog.definitions[id].groups) {
    for (const question of group.questions) {
      answers[question.id] = question.type === 'text' ? 'Retained optional response' : question.type === 'context' ? 'Relevant' : 'Yes';
      answers[question.id + '_detail'] = 'Exact context for ' + question.id;
    }
  }
  configure(id, answers); await render();
  const questions = [...props.groups.flatMap(group => group.questions), ...props.extras];
  for (const [index, question] of questions.entries()) {
    expect(container.querySelectorAll('fieldset')).toHaveLength(1);
    expect(container.querySelector('fieldset').dataset.questionId).toBe(question.id);
    expect(container.querySelector('legend').textContent).toBe(question.prompt);
    if (question.help) expect(container.textContent).toContain(question.help);
    if (question.type === 'text') expect(document.getElementById('iso-answer-' + question.id).value).toBe(answers[question.id]);
    else expect([...container.querySelector('select').options].slice(1).map(option => option.value)).toEqual(question.choices);
    await click(index === questions.length - 1 ? 'Review answers' : 'Continue');
  }
  expect([...container.querySelectorAll('.cis-answer-review strong')].map(item => item.textContent)).toEqual(questions.map(question => question.prompt));
  expect(container.querySelectorAll('.cis-answer-review li')).toHaveLength(questions.length);
  expect(container.textContent).not.toContain('Reported supporting records');
  await click('Edit answer 1'); expect(container.querySelector('fieldset').dataset.questionId).toBe(questions[0].id);
  expect(props.answers.evidence).toBe('Retained supporting record'); expect(props.onSaveClose).not.toHaveBeenCalled();
});

test('local Continue, Back, group checkpoint, Pause and explicit save remain distinct', async () => {
  configure('A.6.1'); await render(); const first = props.groups[0].questions;
  await click('Continue'); expect(container.querySelector('fieldset').dataset.questionId).toBe(first[1].id); expect(props.onNext).not.toHaveBeenCalled();
  await click('Back'); expect(container.querySelector('fieldset').dataset.questionId).toBe(first[0].id); expect(props.onNext).not.toHaveBeenCalled();
  await click('Continue'); await click('Continue'); expect(props.onNext).toHaveBeenCalledTimes(1); expect(props.step).toBe(1);
  await click('Save & close'); expect(props.onSaveClose).toHaveBeenCalledTimes(1);
  await click('Pause & return'); expect(props.onPause).toHaveBeenCalledTimes(1); expect(props.onNext).toHaveBeenCalledTimes(1);
});

test('ISO context branches retain inactive answers and exact detail keys without becoming applicability decisions', async () => {
  const answers = {'ISO-A.6.1-external-context': 'Relevant', 'ISO-A.6.1-external-assurance': 'Yes', 'ISO-A.6.1-external-assurance_detail': 'Retained screening assurance'};
  configure('A.6.1', answers); props.step = props.groups.findIndex(group => group.questions.some(question => question.type === 'context')); await render();
  const select = container.querySelector('select');
  await act(async () => { select.value = 'Not relevant here'; select.dispatchEvent(new Event('change', {bubbles: true})); });
  const note = container.querySelector('textarea');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(note, 'Specific scoped context explanation.'); note.dispatchEvent(new Event('input', {bubbles: true})); });
  expect(props.put).toHaveBeenLastCalledWith('ISO-A.6.1-external-context_detail', 'Specific scoped context explanation.');
  expect(container.textContent).toContain('required for this context answer');
  expect(props.groups.flatMap(group => group.questions).map(question => question.id)).not.toContain('ISO-A.6.1-external-assurance');
  expect(props.answers['ISO-A.6.1-external-assurance_detail']).toBe('Retained screening assurance');
  expect(props.answers).not.toHaveProperty('soa_applicability'); expect(props.onSaveClose).not.toHaveBeenCalled();
});

test('optional intent questions keep conditional context in catalog order', async () => {
  configure('4.1'); props.step = props.groups.length - 1; await render();
  for (const question of props.groups.at(-1).questions) { expect(container.querySelector('fieldset').dataset.questionId).toBe(question.id); await click('Continue'); }
  expect(container.querySelector('fieldset').dataset.questionId).toBe('additional_gap');
  await act(async () => props.put('additional_gap', 'Yes')); await click('Continue');
  expect(container.querySelector('fieldset').dataset.questionId).toBe('gaps'); expect(container.querySelector('textarea').maxLength).toBe(2000);
  expect(props.onNext).not.toHaveBeenCalled();
});

test('read-only responses and forward actions remain disabled while safe Pause remains available', async () => {
  configure('4.1'); props.blocked = true; await render();
  expect(container.querySelector('fieldset').disabled).toBe(true); expect(button('Continue').disabled).toBe(true); expect(button('Save & close').disabled).toBe(true);
  await click('Pause & return'); expect(props.onPause).toHaveBeenCalledTimes(1); expect(props.put).not.toHaveBeenCalled(); expect(props.onNext).not.toHaveBeenCalled();
});

test('retained v1 questions keep their own optional prompts and order', async () => {
  configure('4.1', {}, 'iso27001-omni-1'); props.step = props.groups.length - 1; await render();
  const questions = [...props.groups.at(-1).questions, ...props.extras];
  for (const [index, question] of questions.entries()) {
    expect(container.querySelector('fieldset').dataset.questionId).toBe(question.id); expect(container.querySelector('legend').textContent).toBe(question.prompt);
    await click(index === questions.length - 1 ? 'Review answers' : 'Continue');
  }
  expect([...container.querySelectorAll('.cis-answer-review strong')].slice(-props.extras.length).map(item => item.textContent)).toEqual(props.extras.map(question => question.prompt));
  expect(props.extras.map(question => question.id)).toEqual(['gaps', 'unknowns']); expect(props.onNext).not.toHaveBeenCalled();
});
