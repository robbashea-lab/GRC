import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AdminSurface from './AdminSurface';
import AdminSecurity from '@/pages/AdminSecurity';
let root, host;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); host = document.createElement('div'); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); });
test('Admin uses the shared theme and portal controls without unsupported security claims', async () => {
  await act(async () => root.render(<AdminSurface><AdminSecurity /></AdminSurface>));
  expect(host.querySelector('.admin-surface').dataset.theme).toBe('light');
  expect(document.documentElement.dataset.brawndoPortal).toBe('light');
  await act(async () => host.querySelector('[aria-label="Switch to dark mode"]').click());
  expect(host.querySelector('.admin-surface').dataset.theme).toBe('dark');
  expect(document.documentElement.dataset.brawndoPortal).toBe('dark');
  expect(host.textContent).toContain('15–128 characters');
  expect(host.textContent).not.toMatch(/MFA|coming soon|future/i);
});
