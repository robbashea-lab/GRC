import React, { act } from "react";
import { createRoot } from "react-dom/client";
import Login from "./Login";

const mockLogin = jest.fn();
const mockExploreDemo = jest.fn();
const mockNavigate = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({ toast: { error: (...args) => mockToastError(...args) } }));
jest.mock("@/context/AuthContext", () => ({ useAuth: () => ({ login: mockLogin, exploreDemo: mockExploreDemo }) }));
jest.mock("@/lib/api", () => ({ DEMO_AVAILABLE: true, STANDARD_AUTH_ENABLED: true, STANDARD_AUTH_NOTICE: "Standard sign-in is not enabled in this preview.", formatError: error => error.message }));
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate, Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a> }), { virtual: true });

let container, root;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockLogin.mockReset(); mockExploreDemo.mockReset(); mockNavigate.mockReset(); mockToastError.mockReset();
  require("@/lib/api").STANDARD_AUTH_ENABLED = true;
  require("@/lib/api").DEMO_AVAILABLE = true;
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.open = true; });
  HTMLDialogElement.prototype.close = jest.fn(function () { this.open = false; this.dispatchEvent(new Event("close")); });
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const render = () => act(async () => root.render(<Login />));
const submit = () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
const click = selector => act(async () => container.querySelector(selector).click());
const fill = async (selector, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(container.querySelector(selector), value);
  container.querySelector(selector).dispatchEvent(new Event("input", { bubbles: true }));
});

test("approved public composition retains live credential semantics and omits unsupported prototype controls", async () => {
  await render();
  expect(container.querySelector("h1").textContent).toBe("See clearly.Govern confidently.");
  expect(container.querySelector(".eyebrow").textContent).toBe("Turn complexity into clarity");
  expect(container.querySelector(".login-intro").textContent).toBe("Sign in to continue to GoverNara.");
  expect(container.querySelector(".top-motto").textContent).toBe("A clearer path through GRC.");
  expect(container.querySelector(".brand-name").textContent).toBe("GoverNara");
  expect(container.querySelector("[data-testid='env-identifier']").textContent).toBe("Welcome back");
  expect(container.querySelector("#email").value).toBe("");
  expect(container.querySelector("#password").value).toBe("");
  expect(container.querySelector("#email").autocomplete).toBe("email");
  expect(container.querySelector("#password").autocomplete).toBe("current-password");
  expect(container.querySelector("#email").required).toBe(true);
  expect(container.querySelector("#password").required).toBe(true);
  expect(container.querySelector("#password").hasAttribute("maxlength")).toBe(false);
  expect(container.querySelector("input[type='checkbox']")).toBeNull();
  expect(container.querySelector("#motion")).toBeNull();
  expect(container.querySelector(".footer-links")).toBeNull();
  expect(container.querySelector("[data-testid='forgot-password-link']").getAttribute("href")).toBe("/forgot-password");
  expect(container.textContent).not.toMatch(/Interactive concept|No live sign-in|Keep me signed in|Higher standards|Brawndo|Initech|Preview only/);
  expect(container.querySelector("[aria-label='Open Omnibot guide']")).toBeNull();
  expect(container.querySelector("iframe")).toBeNull();
  expect(mockLogin).not.toHaveBeenCalled();
  expect(mockExploreDemo).not.toHaveBeenCalled();
});

test("disabled standard authentication keeps Demo separate and retains the existing environment notice", async () => {
  require("@/lib/api").STANDARD_AUTH_ENABLED = false;
  await render();
  for (const selector of ["#email", "#password", "[data-testid='submit-auth']", "[data-testid='toggle-password']"]) expect(container.querySelector(selector).disabled).toBe(true);
  expect(container.querySelector("#standard-auth-notice").textContent).toBe("Standard sign-in is not enabled in this preview.");
  expect(container.querySelector("#email").getAttribute("aria-describedby")).toBe("standard-auth-notice");
  expect(container.querySelector("[data-testid='forgot-password-link']")).toBeNull();
  await act(async () => submit());
  expect(mockLogin).not.toHaveBeenCalled();
  mockExploreDemo.mockResolvedValue({ role: "super_admin" });
  await click("[data-testid='explore-demo']");
  expect(mockExploreDemo).toHaveBeenCalledWith();
  expect(mockNavigate).toHaveBeenCalledWith("/clients");
  expect(mockLogin).not.toHaveBeenCalled();
});

test("password visibility changes only input visibility and never submits or enters Demo", async () => {
  await render();
  await fill("#password", "synthetic-test-value");
  await click("[data-testid='toggle-password']");
  expect(container.querySelector("#password").type).toBe("text");
  expect(container.querySelector("[data-testid='toggle-password']").getAttribute("aria-label")).toBe("Hide password");
  expect(container.querySelector("[data-testid='toggle-password']").getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelector(".reveal use").getAttribute("href")).toBe("#governara-eye-off");
  await click("[data-testid='toggle-password']");
  expect(container.querySelector("#password").type).toBe("password");
  expect(container.querySelector("#password").value).toBe("synthetic-test-value");
  expect(mockLogin).not.toHaveBeenCalled(); expect(mockExploreDemo).not.toHaveBeenCalled();
});

test("real sign-in arguments, successful routing and immediate duplicate protection remain authoritative", async () => {
  let resolve;
  mockLogin.mockReturnValue(new Promise(done => { resolve = done; }));
  await render();
  await fill("#email", "synthetic@example.invalid"); await fill("#password", "synthetic-test-value");
  await act(async () => { submit(); submit(); container.querySelector("[data-testid='explore-demo']").click(); });
  expect(mockLogin).toHaveBeenCalledTimes(1);
  expect(mockLogin).toHaveBeenCalledWith("synthetic@example.invalid", "synthetic-test-value");
  expect(mockExploreDemo).not.toHaveBeenCalled();
  expect(container.querySelector("form").getAttribute("aria-busy")).toBe("true");
  expect(container.querySelector("[data-testid='submit-auth']").disabled).toBe(true);
  expect(container.querySelector("[data-testid='explore-demo']").disabled).toBe(true);
  await act(async () => resolve({ role: "super_admin" }));
  expect(mockNavigate).toHaveBeenCalledWith("/");
});

test("failed standard sign-in retains fields, reports the real error and permits an explicit retry", async () => {
  mockLogin.mockRejectedValueOnce(new Error("Unable to sign in."));
  await render();
  await fill("#email", "synthetic@example.invalid"); await fill("#password", "synthetic-test-value");
  await act(async () => submit());
  expect(mockToastError).toHaveBeenCalledWith("Unable to sign in.");
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(container.querySelector("#password").value).toBe("synthetic-test-value");
  expect(container.querySelector("#email").value).toBe("synthetic@example.invalid");
  expect(container.querySelector("[data-testid='submit-auth']").disabled).toBe(false);
  mockLogin.mockResolvedValueOnce({ role: "super_admin" });
  await act(async () => submit());
  expect(mockLogin).toHaveBeenCalledTimes(2);
  expect(mockNavigate).toHaveBeenCalledWith("/");
});

test("Demo uses its existing isolation entry, excludes standard sign-in and handles failure without fake success", async () => {
  let reject;
  mockExploreDemo.mockReturnValueOnce(new Promise((resolve, fail) => { reject = fail; }));
  await render();
  await act(async () => { container.querySelector("[data-testid='explore-demo']").click(); container.querySelector("[data-testid='explore-demo']").click(); submit(); });
  expect(mockExploreDemo).toHaveBeenCalledTimes(1);
  expect(mockLogin).not.toHaveBeenCalled();
  await act(async () => reject(new Error("Demo storage unavailable.")));
  expect(mockToastError).toHaveBeenCalledWith("Demo storage unavailable.");
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(container.querySelector("[data-testid='explore-demo']").disabled).toBe(false);
  mockExploreDemo.mockResolvedValueOnce({ role: "super_admin" });
  await click("[data-testid='explore-demo']");
  expect(mockNavigate).toHaveBeenCalledWith("/clients");
});

test("unavailable Demo has no entry or decorative separator/caption", async () => {
  require("@/lib/api").DEMO_AVAILABLE = false;
  await render();
  expect(container.querySelector("[data-testid='demo-entry']")).toBeNull();
  expect(container.querySelector(".or")).toBeNull();
  expect(container.querySelector(".demo-caption")).toBeNull();
});

test("public education leaves entered credentials and both product-entry paths untouched", async () => {
  await render(); await fill("#email", "synthetic@example.invalid"); await fill("#password", "synthetic-test-value");
  await click(".topic-trigger[data-topic='risk']"); await click(".topic-tab[data-topic='compliance']");
  await click("[aria-label='Close information panel']");
  expect(container.querySelector("#email").value).toBe("synthetic@example.invalid");
  expect(container.querySelector("#password").value).toBe("synthetic-test-value");
  expect(mockLogin).not.toHaveBeenCalled(); expect(mockExploreDemo).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("Login metadata restores the existing title when leaving without overriding a newer owner", async () => {
  const previous = document.title;
  await render(); expect(document.title).toBe("GoverNara | Sign in");
  await act(async () => root.render(<div>Other route</div>));
  expect(document.title).toBe(previous);
  await render(); document.title = "Other route title";
  await act(async () => root.render(<div>Other route</div>));
  expect(document.title).toBe("Other route title");
  document.title = previous;
});
