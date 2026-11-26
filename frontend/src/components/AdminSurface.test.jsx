import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AdminSurface from './AdminSurface';
import AdminSecurity from '@/pages/AdminSecurity';
import NativeAppearance from './NativeAppearance';
import {useAppearance,setAppearance} from '@/lib/nativeAppearance';
function AppearanceControl(){const {choice,mode}=useAppearance();return <NativeAppearance choice={choice} mode={mode}/>;}
let root, host;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();document.documentElement.dataset.previewTheme='teal';setAppearance('teal','dark');host = document.createElement('div');document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount());host.remove();delete document.documentElement.dataset.previewTheme;localStorage.clear(); });
test('Admin uses the shared theme and portal controls without unsupported security claims', async () => {
  await act(async () => root.render(<><AppearanceControl/><AdminSurface><AdminSecurity /></AdminSurface></>));
  expect(host.querySelector('.admin-surface').dataset.theme).toBe('dark');
  expect(document.documentElement.dataset.brawndoPortal).toBe('dark');
  expect(document.documentElement.dataset.adminPresentation).toBe('true');
  expect(host.querySelector('h1').textContent).toBe('Security & Auth');
  expect(host.querySelector('.platform-page-head .eyebrow').textContent).toBe('Administration');
  await act(async () => host.querySelector('[aria-label="Appearance. Current theme Nordic Teal"]').click());
  await act(async () => document.querySelector('[data-gallery-mode="light"]').click());
  expect(host.querySelector('.admin-surface').dataset.theme).toBe('light');
  expect(document.documentElement.dataset.brawndoPortal).toBe('light');
  expect(localStorage.getItem('omnisciente:brawndo-dashboard-theme')).toBe('light');
  expect(host.textContent).toContain('15–128 characters');
  expect(host.querySelector('[data-testid="admin-security-note"]').textContent).toContain('does not inspect or verify the live environment');
  expect(host.textContent).not.toMatch(/MFA|coming soon|future/i);
});

test('Administration portal styling is removed when returning to native client pages', async () => {
  await act(async () => root.render(<AdminSurface><AdminSecurity /></AdminSurface>));
  expect(document.documentElement.dataset.adminPresentation).toBe('true');
  await act(async () => root.render(<div>Native client workspace</div>));
  expect(document.documentElement.hasAttribute('data-admin-presentation')).toBe(false);
  expect(document.documentElement.hasAttribute('data-brawndo-portal')).toBe(false);
});
