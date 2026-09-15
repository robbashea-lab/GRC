import React, { act } from "react";
import { createRoot } from "react-dom/client";
import Login from "./Login";

const mockLogin = jest.fn();
const mockExploreDemo = jest.fn();
const mockNavigate = jest.fn();
jest.mock("@/context/AuthContext", () => ({ useAuth: () => ({ login: mockLogin, exploreDemo: mockExploreDemo }) }));
jest.mock("@/lib/api", () => ({ DEMO_AVAILABLE: true, STANDARD_AUTH_ENABLED: false, STANDARD_AUTH_NOTICE: 'Standard sign-in is not enabled in this preview.', formatError: e => e.message }));
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate, Link: ({ children }) => <a>{children}</a> }), { virtual: true });

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
    expect(container.querySelector('#email').hasAttribute('placeholder')).toBe(false);
    expect(container.querySelector('#password').hasAttribute('placeholder')).toBe(false);
    expect(container.querySelector('#email').disabled).toBe(true);
    expect(container.querySelector('#password').disabled).toBe(true);
    expect(container.querySelector('[data-testid="submit-auth"]').disabled).toBe(true);
    expect(container.textContent).toContain('Standard sign-in is not enabled in this preview.');
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
