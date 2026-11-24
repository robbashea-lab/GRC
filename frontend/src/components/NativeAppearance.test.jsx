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

test('Glass ’07 opens by default even with previous native or preview preferences', () => {
  expect(readAppearance()).toEqual({theme:'glass07', mode:'light'});
  localStorage.setItem(MODE_KEY, 'dark');
  expect(readAppearance()).toEqual({theme:'glass07', mode:'light'});
  localStorage.setItem('governara.appearance.v1', JSON.stringify({theme:'aubergine', mode:'dark'}));
  expect(readAppearance()).toEqual({theme:'glass07', mode:'light'});
  localStorage.setItem('governara.appearance.v2', JSON.stringify({theme:'teal', mode:'dark'}));
  expect(readAppearance()).toEqual({theme:'glass07', mode:'light'});
});

test('choosing Nordic Teal after the upgrade persists when the signed-in app reopens', async () => {
  const previewKey = 'governara.appearance.v2';
  localStorage.setItem(previewKey, JSON.stringify({theme:'teal', mode:'dark'}));
  await act(async () => root.render(<Picker/>));
  const trigger = host.querySelector('#theme-gallery-trigger');
  expect(trigger.getAttribute('aria-label')).toBe('Appearance. Current theme Glass ’07');
  await act(async () => trigger.click());
  await act(async () => document.querySelector('[data-gallery-theme="teal"]').click());
  await act(async () => document.querySelector('[data-gallery-mode="dark"]').click());
  expect(JSON.parse(localStorage.getItem(APPEARANCE_KEY))).toEqual({theme:'teal', mode:'dark'});

  await act(async () => root.render(null));
  localStorage.setItem(previewKey, JSON.stringify({theme:'graphite', mode:'light'}));
  await act(async () => root.render(<Picker/>));
  expect(host.querySelector('#theme-gallery-trigger').getAttribute('aria-label')).toBe('Appearance. Current theme Nordic Teal');
  expect(readAppearance()).toEqual({theme:'teal', mode:'dark'});
});

test('fixed themes keep native portals in their supported light mode', () => {
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
