import React, { act } from "react";
import { createRoot } from "react-dom/client";
import Login from "./Login";

const mockLogin = jest.fn();
const mockExploreDemo = jest.fn();
const mockNavigate = jest.fn();
jest.mock("@/context/AuthContext", () => ({ useAuth: () => ({ login: mockLogin, exploreDemo: mockExploreDemo }) }));
jest.mock("@/lib/api", () => ({ DEMO_AVAILABLE: true, formatError: e => e.message }));
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
    expect(container.querySelector('form').checkValidity()).toBe(false);
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
