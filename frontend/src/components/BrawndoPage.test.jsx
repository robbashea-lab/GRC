import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {BrawndoPageHeader} from './BrawndoPage';
import SurfaceThemeAction from './SurfaceThemeAction';
import {THEME_KEY} from '@/lib/brawndoTheme';

test('optional page-theme presentation uses the native preference and keeps default headers and commands intact', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const previousTheme = localStorage.getItem(THEME_KEY), command = jest.fn();
  localStorage.removeItem(THEME_KEY);
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  const render = corrected => act(async () => root.render(
    <BrawndoPageHeader title="Native page"
      renderThemeAction={corrected ? props => <SurfaceThemeAction {...props} className="bpage-btn"/> : undefined}>
      <button type="button" data-native-command onClick={command}>Native command</button>
    </BrawndoPageHeader>
  ));
  try {
    await render(false);
    const nativeCommand = host.querySelector('[data-native-command]');
    expect(host.querySelectorAll('.bpage-actions button')).toHaveLength(2);
    expect(host.querySelector('[aria-label="Switch to dark mode"]').getAttribute('aria-pressed')).toBe('false');
    await act(async () => host.querySelector('[aria-label="Switch to dark mode"]').click());
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');

    await render(true);
    expect(host.querySelectorAll('.bpage-actions button')).toHaveLength(2);
    expect(host.querySelector('[aria-label="Switch to light mode"]')).toBeNull();
    const themeAction = host.querySelector('[aria-label="Switch to light theme"]');
    expect(themeAction.textContent).toBe('Light');
    await act(async () => themeAction.click());
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(host.querySelector('[aria-label="Switch to dark theme"]').textContent).toBe('Dark');
    expect(host.querySelector('[data-native-command]')).toBe(nativeCommand);
    await act(async () => nativeCommand.click()); expect(command).toHaveBeenCalledTimes(1);

    await render(false);
    expect(host.querySelector('.surface-theme-action')).toBeNull();
    expect(host.querySelector('[aria-label="Switch to dark mode"]').getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('[data-native-command]')).toBe(nativeCommand);
  } finally {
    await act(async () => root.unmount()); host.remove();
    if (previousTheme === null) localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, previousTheme);
  }
});
