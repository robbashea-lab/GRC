import React, { act } from "react";
import { createRoot } from "react-dom/client";
import Login from "./Login";
import { PREVIEW_MODE } from "@/lib/api";

const mockLogin = jest.fn();
const mockNavigate = jest.fn();
jest.mock("@/context/AuthContext", () => ({ useAuth: () => ({ login: mockLogin }) }));
jest.mock("@/lib/api", () => ({ PREVIEW_MODE: true, formatError: e => e.message }));
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate, Link: ({ children }) => <a>{children}</a> }), { virtual: true });

test("one click without fields enters the portfolio", async () => {
  expect(PREVIEW_MODE).toBe(true);
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockLogin.mockResolvedValue({ role: "super_admin" });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Login />));
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector('[data-testid="google-signin"]')).toBeNull();
    await act(async () => container.querySelector('[data-testid="preview-signin"]').click());
    expect(mockLogin).toHaveBeenCalledWith("", "");
    expect(mockNavigate).toHaveBeenCalledWith("/clients");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
