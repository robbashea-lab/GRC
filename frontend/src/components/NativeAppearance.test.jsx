import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import NativeAppearance from './NativeAppearance';
import {APPEARANCE_KEY, MODE_KEY, appearances, readAppearance, setAppearance, useAppearance} from '@/lib/nativeAppearance';
import {readTheme} from '@/lib/brawndoTheme';

function Picker() {
  const {choice, mode} = useAppearance();
  return <NativeAppearance choice={choice} mode={mode}/>;
}

let host, root;
beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete document.documentElement.dataset.previewTheme;
  localStorage.clear();
});

test('new profiles start with Glass ’07, existing native mode and saved preview choices are retained', () => {
  expect(readAppearance()).toEqual({theme:'glass07', mode:'light'});
  localStorage.setItem(MODE_KEY, 'dark');
  expect(readAppearance()).toEqual({theme:'teal', mode:'dark'});
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify({theme:'aubergine', mode:'dark'}));
  expect(readAppearance()).toEqual({theme:'aubergine', mode:'dark'});
  setAppearance('tiles12', 'dark');
  document.documentElement.dataset.previewTheme = 'tiles12';
  expect(readTheme()).toBe('light');
  expect(JSON.parse(localStorage.getItem(APPEARANCE_KEY))).toEqual({theme:'tiles12',mode:'light'});
});

test('gallery offers twelve real choices, synchronizes mode, and closes back to its trigger', async () => {
  await act(async () => root.render(<Picker/>));
  const trigger = host.querySelector('#theme-gallery-trigger');
  await act(async () => trigger.click());
  const panel = document.getElementById('theme-gallery-panel');
  expect(panel.querySelectorAll('.theme-gallery-card')).toHaveLength(12);
  expect(panel.querySelector('[data-gallery-mode="dark"]').disabled).toBe(true);
  expect(document.activeElement.dataset.galleryTheme).toBe('glass07');
  for (const choice of appearances) {
    const button = panel.querySelector('[data-gallery-theme="' + choice.id + '"]');
    await act(async () => button.click());
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(trigger.getAttribute('aria-label')).toBe('Appearance. Current theme ' + choice.name);
    expect(panel.querySelector('[data-gallery-mode="dark"]').disabled).toBe(!!choice.fixed);
  }
  await act(async () => panel.querySelector('[data-gallery-theme="midnight"]').click());
  expect(readAppearance()).toEqual({theme:'midnight',mode:'dark'});
  await act(async () => panel.querySelector('[data-gallery-mode="light"]').click());
  expect(readAppearance()).toEqual({theme:'midnight',mode:'light'});
  await act(async () => {
    panel.querySelector('#theme-gallery-close').click();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(document.getElementById('theme-gallery-panel')).toBeNull();
});
