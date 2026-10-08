import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import LoginWelcome from './LoginWelcome';
import { loginGreeting, loginLessons, loginMenu, loginTopics } from './loginEducation';

let container, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = jest.fn(() => ({ matches:false, addEventListener:jest.fn(), removeEventListener:jest.fn() }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function renderWelcome() {
  await act(async () => root.render(<LoginWelcome theme="light" setTheme={jest.fn()}><main className="login"><label htmlFor="email">Work email</label><input id="email"/></main></LoginWelcome>));
  // Pausing uses the immediate, non-animated presentation for deterministic inspection.
  await click('Pause motion');
  await click('↻ Replay welcome');
}
async function click(text) {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent === text || item.querySelector('strong')?.textContent === text);
  expect(button).toBeDefined(); await act(async () => button.click());
}
test('all authored main topics and dedicated questions retain their answers, examples and return navigation', async () => {
  await renderWelcome();
  for (const [key,label] of loginMenu) {
    await click(label);
    expect(container.querySelector('.guide h3').textContent).toBe(loginTopics[key][0]);
    expect(container.querySelector('.answer').textContent).toBe(loginTopics[key][1]);
    expect(container.querySelector('.topic[aria-pressed="true"]').textContent).toBe(label);
    if (loginTopics[key][2]) {
      expect(container.querySelector('.source').getAttribute('href')).toBe(loginTopics[key][2]);
      expect(container.querySelector('.source').getAttribute('rel')).toBe('noopener noreferrer');
    }
    await click('← Omni menu');
  }
  for (const [key,lesson] of Object.entries(loginLessons)) {
    await click(lesson.name);
    for (const [question,title,answer,example] of lesson.questions) {
      await click(question);
      expect(container.querySelector('.guide h3').textContent).toBe(title);
      expect(container.querySelector('.answer').textContent).toBe(answer);
      expect(container.querySelector('.lesson-example').textContent).toBe(`For example: ${example}`);
      expect(container.querySelector('.topic[aria-pressed="true"]').textContent).toBe(question);
    }
    await click('← Omni menu');
    expect(container.querySelectorAll('.topic').length).toBe(4);
    expect(container.querySelector('.lesson-example')).toBeNull();
    expect(container.querySelector('.source')).toBeNull();
  }
});
test('login focus dismisses welcome and Escape restores focus without trapping authentication', async () => {
  await renderWelcome();
  expect(container.querySelector('.guide').hidden).toBe(false);
  await act(async () => container.querySelector('#email').focus());
  expect(container.querySelector('.guide').hidden).toBe(true);
  expect(document.activeElement.id).toBe('email');
  await click('↻ Replay welcome');
  await act(async () => container.querySelector('.topic').dispatchEvent(new KeyboardEvent('keydown',{ key:'Escape',bubbles:true })));
  expect(container.querySelector('.guide').hidden).toBe(true);
  expect(document.activeElement).toBe(container.querySelector('.bot'));
});
test('reduced motion begins with docked accessible welcome and tracks preference changes', async () => {
  let change;
  const media = { matches:true, addEventListener:(_,listener) => { change = listener; }, removeEventListener:jest.fn() };
  window.matchMedia = jest.fn(() => media);
  await act(async () => root.render(<LoginWelcome theme="dark" setTheme={jest.fn()}><input id="email"/></LoginWelcome>));
  expect(container.querySelector('#omni-login').classList.contains('motion-off')).toBe(true);
  expect(container.querySelector('.guide').hidden).toBe(false);
  expect(container.querySelector('.bot').style.left).toBe('27px');
  expect(container.textContent).toContain('Reduced motion enabled');
  expect(typeof change).toBe('function');
  media.matches = false;
  await act(async () => change());
  expect(container.querySelector('#omni-login').classList.contains('motion-off')).toBe(false);
});
test.each([[8,'Good morning'],[14,'Good afternoon'],[22,'Good evening']])('greeting uses local hour %i', (hour,expected) => {
  expect(loginGreeting(new Date(2026,9,8,hour))).toBe(`${expected}—I’m Omni.`);
});
test('ready action focuses the available Demo entry when standard sign-in is disabled', async () => {
  window.matchMedia = jest.fn(() => ({ matches:true, addEventListener:jest.fn(), removeEventListener:jest.fn() }));
  await act(async () => root.render(<LoginWelcome theme="light" setTheme={jest.fn()}><input id="email" disabled/><button data-testid="explore-demo">Explore the demo</button></LoginWelcome>));
  await click('Ready to sign in →');
  expect(container.querySelector('.guide').hidden).toBe(true);
  expect(document.activeElement).toBe(container.querySelector('[data-testid="explore-demo"]'));
});
