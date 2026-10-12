import React, { act } from "react";
import { createRoot } from "react-dom/client";
import Login from "./Login";

const mockLogin = jest.fn();
const mockExploreDemo = jest.fn();
const mockNavigate = jest.fn();
const mockToastError = jest.fn();
jest.mock('sonner', () => ({ toast: { error: (...args) => mockToastError(...args) } }));
jest.mock("@/context/AuthContext", () => ({ useAuth: () => ({ login: mockLogin, exploreDemo: mockExploreDemo }) }));
jest.mock("@/lib/api", () => ({ DEMO_AVAILABLE: true, STANDARD_AUTH_ENABLED: false, STANDARD_AUTH_NOTICE: 'Standard sign-in is not enabled in this preview.', formatError: e => e.message }));
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate, Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a> }), { virtual: true });

test("blank standard sign-in and credentialless demo are separate paths", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockExploreDemo.mockResolvedValue({ role: "super_admin" });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Login />));
    expect(container.querySelector('#email').value).toBe('');
    expect(container.querySelector('#password').value).toBe('');
    expect(container.querySelector('#email').placeholder).toBe('name@company.com');
    expect(container.querySelector('#password').placeholder).toBe('Enter your password');
    expect(container.querySelector('#email').disabled).toBe(true);
    expect(container.querySelector('#password').disabled).toBe(true);
    expect(container.querySelector('[data-testid="submit-auth"]').disabled).toBe(true);
    expect(container.textContent).toContain('Standard sign-in is not enabled in this preview.');
    expect(container.querySelector('h1').textContent).toBe('Clarity acrossyour securityprogram.');
    expect(container.querySelector('#signin').textContent).toBe('Sign in to yourworkspace.');
    expect(container.querySelector('#login-actor')).toBeNull();
    expect(container.querySelector('[aria-label="Open Omnibot guide"]')).toBeNull();
    expect(container.textContent).not.toContain('Interactive design preview');
    // The sign-in page carries no client or program information.
    expect(container.querySelector('.main').textContent).not.toMatch(/fictional client|Brawndo|Dunder|Initech|past due|finding/i);
    const demo=container.querySelector('[data-testid="demo-entry"]'),form=container.querySelector('form');
    expect(form.compareDocumentPosition(demo)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // approved layout keeps Demo visibly separate from standard authentication
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})));
    expect(mockLogin).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="google-signin"]')).toBeNull();
    await act(async () => container.querySelector('[data-testid="explore-demo"]').click());
    expect(mockExploreDemo).toHaveBeenCalledWith();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/clients");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test('password visibility, pending sign-in and failed Demo entry retain the real flow', async () => {
  require('@/lib/api').STANDARD_AUTH_ENABLED = true;
  mockNavigate.mockClear(); mockToastError.mockClear();
  let resolve;
  mockLogin.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Login />));
    await act(async () => container.querySelector('[data-testid="toggle-password"]').click());
    expect(container.querySelector('#password').type).toBe('text');
    expect(container.querySelector('[data-testid="toggle-password"]').textContent).toBe('Hide');
    await act(async () => container.querySelector('[data-testid="toggle-password"]').click());
    expect(container.querySelector('#password').type).toBe('password');
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})));
    expect(container.querySelector('[data-testid="submit-auth"]').disabled).toBe(true);
    expect(container.querySelector('[data-testid="explore-demo"]').disabled).toBe(true);
    expect(container.querySelector('form').getAttribute('aria-busy')).toBe('true');
    await act(async () => resolve({role:'super_admin'}));
    expect(mockNavigate).toHaveBeenCalledWith('/');
    mockNavigate.mockClear();
    mockExploreDemo.mockRejectedValueOnce(new Error('Demo storage unavailable.'));
    await act(async () => container.querySelector('[data-testid="explore-demo"]').click());
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith('Demo storage unavailable.');
    expect(container.querySelector('[data-testid="explore-demo"]').disabled).toBe(false);
  } finally {
    await act(async () => root.unmount()); container.remove();
    require('@/lib/api').STANDARD_AUTH_ENABLED = false;
  }
});

test('motion controls are Login-local and explicit Demo entry respects environment availability', async () => {
  require('@/lib/api').DEMO_AVAILABLE = false;
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Login />));
    expect(container.querySelector('[data-testid="explore-demo"]')).toBeNull();
    await act(async () => container.querySelector('#motion').click());
    expect(container.querySelector('#login-prism').classList.contains('paused')).toBe(true);
    expect(document.body.classList.contains('paused')).toBe(false);
    expect(container.querySelector('#motion').textContent).toBe('Resume motion');
    await act(async () => container.querySelector('#motion').click());
    expect(container.querySelector('#motion').getAttribute('aria-pressed')).toBe('false');
  } finally {
    await act(async () => root.unmount()); container.remove();
    require('@/lib/api').DEMO_AVAILABLE = true;
  }
});

test('a failed normal sign-in leaves credentials and navigation intact and reports the error', async () => {
  require('@/lib/api').STANDARD_AUTH_ENABLED = true;
  mockNavigate.mockClear(); mockToastError.mockClear();
  mockLogin.mockRejectedValueOnce(new Error('Unable to sign in.'));
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Login/>));
    for (const [selector,value] of [['#email','synthetic@example.invalid'],['#password','synthetic-test-value']]) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(container.querySelector(selector),value);
        container.querySelector(selector).dispatchEvent(new Event('input',{bubbles:true}));
      });
    }
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(mockLogin).toHaveBeenLastCalledWith('synthetic@example.invalid','synthetic-test-value');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith('Unable to sign in.');
    expect(container.querySelector('#email').value).toBe('synthetic@example.invalid');
    expect(container.querySelector('#password').value).toBe('synthetic-test-value');
    expect(container.querySelector('[data-testid="submit-auth"]').disabled).toBe(false);
    expect(container.querySelector('[data-testid="forgot-password-link"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="forgot-password-link"]').getAttribute('href')).toBe('/forgot-password');
  } finally {
    await act(async () => root.unmount()); container.remove();
    require('@/lib/api').STANDARD_AUTH_ENABLED = false;
  }
});

test("hosted staging exposes Demo alongside enabled standard sign-in", async () => {
  mockNavigate.mockClear();
  require('@/lib/api').STANDARD_AUTH_ENABLED = true;
  mockLogin.mockClear(); mockExploreDemo.mockClear(); mockNavigate.mockClear();
  mockLogin.mockResolvedValue({ role: 'super_admin' });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Login />));
    expect(container.querySelector('#email').disabled).toBe(false);
    expect(container.querySelector('#password').disabled).toBe(false);
    expect(container.querySelector('[data-testid="submit-auth"]').disabled).toBe(false);
    expect(container.querySelector('[data-testid="explore-demo"]')).not.toBeNull();
    expect(container.querySelector('#standard-auth-notice')).toBeNull();
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})));
    expect(mockLogin).toHaveBeenCalledWith('', '');
    expect(mockNavigate).toHaveBeenCalledWith('/');
    expect(mockExploreDemo).not.toHaveBeenCalled();
    await act(async () => container.querySelector('[data-testid="explore-demo"]').click());
    expect(mockExploreDemo).toHaveBeenCalledWith();
    expect(mockLogin).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount()); container.remove();
    require('@/lib/api').STANDARD_AUTH_ENABLED = false;
  }
});
