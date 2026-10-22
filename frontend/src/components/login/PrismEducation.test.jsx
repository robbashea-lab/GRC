import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import PrismEducation from './PrismEducation';

let container, root;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  // JSDOM has no native top layer. Browser QA separately checks focus trapping/Escape.
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.open = true; });
  HTMLDialogElement.prototype.close = jest.fn(function () { this.open = false; this.dispatchEvent(new Event('close')); });
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<PrismEducation />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const click = async selector => act(async () => container.querySelector(selector).click());

test.each([
  ['governance','Good security startswith clear ownership.',3,'Set expectations'],
  ['risk','Understand exposure.Make informed decisions.',3,'Inherent risk'],
  ['compliance','Know the requirements.Show the work.',2,'Does Omnisciente certify compliance?'],
])('%s card opens complete approved content, closes and restores its trigger', async (topic, title, count, text) => {
  const trigger = container.querySelector(`.card[data-topic="${topic}"]`);
  trigger.focus();
  await click(`.card[data-topic="${topic}"]`);
  expect(container.querySelector('dialog').open).toBe(true);
  expect(container.querySelector('#topicTitle').textContent).toBe(title);
  expect(container.querySelectorAll('details')).toHaveLength(count);
  expect(container.querySelector('#content').textContent).toContain(text);
  expect(container.querySelector(`#tab-${topic}`).getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement.id).toBe(`tab-${topic}`);
  await click('#close');
  expect(container.querySelector('dialog').open).toBe(false);
  expect(document.activeElement).toBe(trigger);
});

test('all three risk stages are selectable and reset when the topic is reopened', async () => {
  await click('.card[data-topic="risk"]');
  for (const [stage, expected] of [['inherent','Inherent exposure'],['residual','Current residual exposure'],['target','Target residual exposure']]) {
    await click(`[data-stage="${stage}"]`);
    expect(container.querySelector('#riskresult').textContent).toContain(expected);
    expect(container.querySelector(`[data-stage="${stage}"]`).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('[data-stage][aria-pressed="true"]')).toHaveLength(1);
  }
  expect(container.querySelector('#riskresult').textContent).toContain('An improvement plan is not an operating control.');
  await click('#tab-governance'); await click('#tab-risk');
  expect(container.querySelector('[data-stage="inherent"]').getAttribute('aria-pressed')).toBe('true');
});

test('all five frameworks preserve approved distinctions and safe source links', async () => {
  await click('.card[data-topic="compliance"]');
  for (const [key, expected] of [['soc','not a certification'],['iso','Statement of Applicability'],['ig1','56 safeguards'],['ig2','130 safeguards total'],['ig3','153 safeguards total']]) {
    await click(`[data-framework="${key}"]`);
    expect(container.querySelector('#framework').textContent).toContain(expected);
    expect(container.querySelector(`[data-framework="${key}"]`).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('[data-framework][aria-pressed="true"]')).toHaveLength(1);
    const link = container.querySelector('#framework a');
    expect(link.href).toMatch(/^https:\/\/(www\.aicpa-cima\.com|www\.iso\.org|www\.cisecurity\.org)\//);
    expect(link.rel).toBe('noopener noreferrer');
  }
  await click('#tab-risk'); await click('#tab-compliance');
  expect(container.querySelector('[data-framework="soc"]').getAttribute('aria-pressed')).toBe('true');
});

test('cyclic previous/next and tab arrows/Home/End preserve selection and focus', async () => {
  await click('.card[data-topic="governance"]');
  await click('.end [data-topic="risk"]');
  expect(container.querySelector('#tab-risk').getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement.id).toBe('tab-risk');
  await click('.end [data-topic="governance"]');
  for (const [key, expected] of [['ArrowRight','risk'],['End','compliance'],['ArrowRight','governance'],['ArrowLeft','compliance'],['Home','governance']]) {
    await act(async () => container.querySelector('.tabs').dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})));
    expect(document.activeElement.id).toBe(`tab-${expected}`);
    expect(container.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
    expect(container.querySelector('#content').getAttribute('aria-labelledby')).toBe(`tab-${expected}`);
  }
});

test('backdrop closes only outside dialog bounds and remount leaves one handler set', async () => {
  await click('.card[data-topic="governance"]');
  const dialog = container.querySelector('dialog');
  dialog.getBoundingClientRect = () => ({left:20,right:100,top:20,bottom:100});
  await act(async () => dialog.dispatchEvent(new MouseEvent('click',{clientX:50,clientY:50,bubbles:true})));
  expect(dialog.open).toBe(true);
  await act(async () => dialog.dispatchEvent(new MouseEvent('click',{clientX:0,clientY:0,bubbles:true})));
  expect(dialog.open).toBe(false);
  await click('.card[data-topic="risk"]');
  expect(container.querySelectorAll('dialog')).toHaveLength(1);
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(2);
});

test('Tab and Shift+Tab wrap at the modal boundaries', async () => {
  await click('.card[data-topic="governance"]');
  for (const control of container.querySelectorAll('button, a, summary')) control.getClientRects = () => [1];
  const first = container.querySelector('#tab-governance'), last = container.querySelector('.end button:last-child');
  last.focus();
  const tab = new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});
  await act(async () => last.dispatchEvent(tab));
  expect(tab.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
  const back = new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});
  await act(async () => first.dispatchEvent(back));
  expect(document.activeElement).toBe(last);
});
