import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MyAccount from './MyAccount';

const mockPatch = jest.fn();
const mockRefresh = jest.fn();
const mockSuccess = jest.fn();
const mockUser = { name: 'Synthetic user', password_change_required: true };
jest.mock('@/lib/api', () => ({ __esModule: true, default: { patch: (...args) => mockPatch(...args) }, formatError: e => e.message }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refresh: mockRefresh }) }));
jest.mock('sonner', () => ({ toast: { success: (...args) => mockSuccess(...args), error: jest.fn() } }));

test('password change refreshes the invalidated current session and accurately explains sign-out', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MyAccount />));
    for (const [id, value] of [['me-current-pw', 'current synthetic phrase'], ['me-new-pw', 'replacement synthetic phrase'], ['me-confirm-pw', 'replacement synthetic phrase']]) {
      const input = container.querySelector(`[data-testid="${id}"]`);
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await act(async () => container.querySelector('[data-testid="me-change-pw"]').click());
    expect(mockPatch).toHaveBeenCalledWith('/me/password', { current_password: 'current synthetic phrase', new_password: 'replacement synthetic phrase' });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockSuccess).toHaveBeenCalledWith('Password changed. Sign in again to continue.');
    expect(container.textContent).not.toMatch(/MFA|coming next/);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
