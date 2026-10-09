import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import LoginWelcome from './LoginWelcome';
import { loginGreeting, loginMenu, loginTopics, loginWelcomeMessage } from './loginEducation';
import { useLoginMotion } from './useLoginMotion';

jest.mock('./useLoginMotion', () => ({ useLoginMotion: jest.fn() }));
let container, root, media;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  media = { matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
  window.matchMedia = jest.fn(() => media);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  Element.prototype.scrollIntoView = jest.fn();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });
async function renderWelcome(children = <main className="login"><label htmlFor="email">Work email</label><input id="email"/></main>) {
  await act(async () => root.render(<LoginWelcome theme="dark" setTheme={jest.fn()}>{children}</LoginWelcome>));
  await act(async () => { for (const image of container.querySelectorAll('#login-standing-art,#login-nova-art')) image.dispatchEvent(new Event('load')); });
}
async function click(label) {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent === label || item.getAttribute('aria-label') === label || item.querySelector('strong')?.textContent === label);
  expect(button).toBeDefined(); await act(async () => button.click());
}
const robotLabel = 'OmniBot. Open quick introductions; drag or use arrow keys to move.';
test('the approved standing scan completes to a greeting and each replay starts standing', async () => {
  await renderWelcome();
  expect(container.querySelector('#omni-login').dataset.loginScan).toBe('scanning');
  expect(container.querySelector('#login-actor').dataset.form).toBe('robot');
  expect(container.querySelector('#login-standing-art').getAttribute('src')).toBe('/login/omni-standing.png');
  expect(container.querySelector('#login-scan-status').textContent).toContain('Visual effect only');
  await act(async () => useLoginMotion.mock.calls.at(-1)[1].onScanComplete());
  expect(container.querySelector('#login-speech').hidden).toBe(false);
  await click('Switch to Omni Orb');
  expect(container.querySelector('#login-actor').dataset.form).toBe('orb');
  await click('↻ Replay scan');
  expect(container.querySelector('#login-actor').dataset.form).toBe('robot');
  expect(container.querySelector('#omni-login').dataset.loginScan).toBe('scanning');
  expect(container.querySelector('#login-speech').hidden).toBe(true);
});
test('all approved menu and dedicated card introductions retain their own content and return navigation', async () => {
  await renderWelcome(); await click(robotLabel);
  expect(container.querySelector('.answer').textContent).toBe(loginWelcomeMessage);
  for (const [key, label] of loginMenu) {
    await click(label);
    expect(container.querySelector('.guide h3').textContent).toBe(loginTopics[key][0]);
    expect(container.querySelector('.answer').textContent).toBe(loginTopics[key][1]);
    expect(container.querySelector('.topic[aria-pressed="true"]').textContent).toBe(label);
    await click('← Omni menu');
  }
  for (const key of ['governance','risk','compliance']) {
    await click(key[0].toUpperCase()+key.slice(1));
    expect(container.querySelector('.answer').textContent).toBe(loginTopics[key][1]);
    expect(container.querySelector('.topics').hidden).toBe(true);
    expect(container.querySelector('#login-actor').getAttribute('aria-hidden')).toBe('false');
    await click('← Omni menu');
    expect(container.querySelector('.topics').hidden).toBe(false);
  }
});
test('education focus, Escape restoration and form focus never trap authentication', async () => {
  await renderWelcome();
  await act(async () => container.querySelector('#login-robotHit').focus());
  await click(robotLabel);
  expect(document.activeElement).toBe(container.querySelector('.guide h3'));
  await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{ key:'Escape',bubbles:true })));
  expect(container.querySelector('.guide').hidden).toBe(true);
  expect(document.activeElement).toBe(container.querySelector('#login-robotHit'));
  await click(robotLabel);
  await act(async () => container.querySelector('#email').focus());
  expect(container.querySelector('.guide').hidden).toBe(true);
  expect(document.activeElement.id).toBe('email');
});

test('closing after a form switch restores focus to the visible enabled character', async () => {
  await renderWelcome();
  await act(async () => container.querySelector('#login-robotHit').focus());
  await click(robotLabel);
  await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true})));
  await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(container.querySelector('.guide').hidden).toBe(true);
  expect(document.activeElement).toBe(container.querySelector('#login-orbHit'));
});

test('opening after a moved, partially offscreen character reanchors instead of retaining stale coordinates', async () => {
  let centered = false;
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const offset = centered ? 220 : 0;
    if (this.id === 'login-landing-zone') return {left:40,right:420,top:30+offset,bottom:390+offset,width:380,height:360};
    if (this.classList.contains('hero-copy')) return {bottom:-120+offset};
    if (this.classList.contains('hero-footer')) return {top:680+offset};
    if (this.classList.contains('top')) return {bottom:-100};
    return {left:800,right:1000,top:90,bottom:700,width:200,height:610};
  });
  await renderWelcome();
  Element.prototype.scrollIntoView.mockImplementation(() => { centered = true; });
  await act(async () => container.querySelector('#login-robotHit').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',shiftKey:true,bubbles:true})));
  const movedTop = container.querySelector('#login-actor').style.top;
  await click(robotLabel);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  expect(container.querySelector('#login-actor').style.top).not.toBe(movedTop);
  expect(container.querySelector('#login-actor').style.top).toBe('610px');
  expect(parseFloat(container.querySelector('.guide').style.maxHeight)).toBeGreaterThan(160);
});
test('reduced motion skips the scan, keeps the robot standing and removes preference listeners', async () => {
  media.matches = true; await renderWelcome();
  expect(container.querySelector('#omni-login').classList.contains('motion-paused')).toBe(true);
  expect(container.querySelector('#omni-login').dataset.loginScan).toBe('idle');
  expect(container.querySelector('#login-speech').hidden).toBe(false);
  expect(container.textContent).toContain('Reduced motion enabled');
  const change = media.addEventListener.mock.calls[0][1];
  media.matches = false; await act(async () => change());
  expect(container.querySelector('#omni-login').classList.contains('motion-paused')).toBe(false);
  await act(async () => root.unmount());
  expect(media.removeEventListener).toHaveBeenCalledWith('change', change);
  root = createRoot(container);
});

test('pause ends the decorative scan and resume does not leave a completed scan running', async () => {
  await renderWelcome();
  await act(async () => useLoginMotion.mock.calls.at(-1)[1].onScanComplete());
  await click('Pause motion');
  expect(container.querySelector('#omni-login').dataset.loginScan).toBe('idle');
  await click('Resume motion');
  expect(container.querySelector('#omni-login').dataset.loginScan).toBe('idle');
  await click('↻ Replay scan');
  expect(container.querySelector('#omni-login').dataset.loginScan).toBe('scanning');
  await click('Pause motion');
  expect(container.querySelector('#omni-login').dataset.loginScan).toBe('idle');
  expect(container.querySelector('#login-speech').hidden).toBe(false);
});
test.each([[8,'Good morning'],[14,'Good afternoon'],[22,'Good evening']])('greeting uses local hour %i', (hour, expected) => {
  expect(loginGreeting(new Date(2026,9,9,hour))).toBe(`${expected}, I’m Omni.`);
});
test('ready shortcut uses explicit Demo entry when standard sign-in is disabled', async () => {
  await renderWelcome(<main className="login"><input id="email" disabled/><button data-testid="explore-demo">Explore the demo</button></main>);
  await click(robotLabel); await click('Ready to sign in →');
  expect(document.activeElement).toBe(container.querySelector('[data-testid="explore-demo"]'));
  expect(container.querySelector('.guide').hidden).toBe(true);
});
test('letter shortcuts are local and do not intercept typing in the login form', async () => {
  await renderWelcome();
  await act(async () => container.querySelector('#email').dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true})));
  expect(container.querySelector('#login-actor').dataset.form).toBe('robot');
  await act(async () => container.querySelector('#login-robotHit').dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true})));
  expect(container.querySelector('#login-actor').dataset.form).toBe('orb');
  await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'r',bubbles:true})));
  expect(container.querySelector('#login-actor').dataset.form).toBe('orb');
});
