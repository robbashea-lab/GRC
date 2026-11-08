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

const email = "Synthetic.User+login@Example.invalid";
const password = "  päss🔒 e\u0301  ";
const demoSelectors = ["[data-testid='explore-demo-top']", "[data-testid='explore-demo']"];
let container, root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockLogin.mockReset(); mockExploreDemo.mockReset(); mockNavigate.mockReset(); mockToastError.mockReset();
  require("@/lib/api").STANDARD_AUTH_ENABLED = true;
  require("@/lib/api").DEMO_AVAILABLE = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

const render = () => act(async () => root.render(<Login />));
const submit = () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
const click = selector => act(async () => container.querySelector(selector).click());
const fill = (selector, value) => act(async () => {
  const input = container.querySelector(selector);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const fillCredentials = async () => { await fill("#email", email); await fill("#password", password); };

test("the pinned public composition retains labelled native credentials and recovery navigation", async () => {
  await render();
  expect(container.querySelector("h1").textContent).toBe("Govern confidently.Turn complexity into clarity.");
  expect(container.querySelector(".card > .sub").textContent).toBe("Sign in to continue to GoverNara.");
  expect(container.querySelector(".logo").textContent.trim()).toBe("GoverNara");
  expect(container.querySelector("[data-testid='env-identifier']").textContent).toBe("Welcome back");
  expect(container.querySelector("label[for='email']").textContent).toBe("Work email");
  expect(container.querySelector("label[for='password']").textContent).toBe("Password");
  expect(container.querySelector("#email").value).toBe("");
  expect(container.querySelector("#password").value).toBe("");
  expect(container.querySelector("#email").autocomplete).toBe("username");
  expect(container.querySelector("#password").autocomplete).toBe("current-password");
  expect(container.querySelector("#email").required).toBe(true);
  expect(container.querySelector("#password").required).toBe(true);
  expect(container.querySelector("#password").hasAttribute("minlength")).toBe(false);
  expect(container.querySelector("#password").hasAttribute("maxlength")).toBe(false);
  expect(container.querySelector("[data-testid='forgot-password-link']").getAttribute("href")).toBe("/forgot-password");
  expect(container.querySelector("#status").getAttribute("role")).toBe("status");
  expect(container.querySelector("#status").getAttribute("aria-live")).toBe("polite");
  expect(container.querySelector("#status").textContent).toBe("");
  expect(container.querySelector(".topic-trigger, .card-watermark, #motion, iframe")).toBeNull();
  expect(container.textContent).not.toMatch(/See clearly|A clearer path through GRC|Concept only|Interactive concept|No live sign-in|In the product, this sends a reset link|Brawndo|Initech/);
  expect(mockLogin).not.toHaveBeenCalled();
  expect(mockExploreDemo).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
});

test.each([[true, true], [true, false], [false, true], [false, false]])(
  "native eligibility remains independent: standard=%s, demo=%s",
  async (standardEnabled, demoAvailable) => {
    require("@/lib/api").STANDARD_AUTH_ENABLED = standardEnabled;
    require("@/lib/api").DEMO_AVAILABLE = demoAvailable;
    await render();
    for (const selector of ["#email", "#password", "[data-testid='submit-auth']", "[data-testid='toggle-password']"]) {
      expect(container.querySelector(selector).disabled).toBe(!standardEnabled);
    }
    for (const selector of demoSelectors) expect(!!container.querySelector(selector)).toBe(demoAvailable);
    expect(!!container.querySelector("[data-testid='demo-entry']")).toBe(demoAvailable);
    expect(!!container.querySelector("[data-testid='forgot-password-link']")).toBe(standardEnabled);
    const notice = container.querySelector("#standard-auth-notice");
    if (standardEnabled) {
      expect(notice).toBeNull();
    } else {
      expect(notice.textContent).toBe("Standard sign-in is not enabled in this preview.");
      for (const selector of ["#email", "#password", "[data-testid='submit-auth']"]) {
        expect(container.querySelector(selector).getAttribute("aria-describedby").split(" ")).toContain("standard-auth-notice");
      }
      await act(async () => submit());
      expect(mockLogin).not.toHaveBeenCalled();
    }
    if (demoAvailable) {
      mockExploreDemo.mockResolvedValue({ role: "super_admin" });
      await click(demoSelectors[0]);
      expect(mockExploreDemo).toHaveBeenCalledWith();
      expect(mockNavigate).toHaveBeenCalledWith("/clients");
    } else {
      expect(mockExploreDemo).not.toHaveBeenCalled();
    }
    expect(mockLogin).not.toHaveBeenCalled();
  },
);

test("demo entry does not present disabled standard authentication as a sign-in attempt", async () => {
  require("@/lib/api").STANDARD_AUTH_ENABLED = false;
  let resolve;
  mockExploreDemo.mockReturnValue(new Promise(done => { resolve = done; }));
  await render();
  await click(demoSelectors[0]);
  expect(container.querySelector("[data-testid='submit-auth']").textContent).toBe("Sign in");
  expect(container.querySelector("#standard-auth-notice")).not.toBeNull();
  expect(mockLogin).not.toHaveBeenCalled();
  await act(async () => resolve({ role: "super_admin" }));
  expect(mockNavigate).toHaveBeenCalledWith("/clients");
});

test("required and email-format errors prevent authentication and focus the first invalid field", async () => {
  await render();
  await act(async () => submit());
  expect(container.querySelector("#email-err").textContent).toBe("Enter your work email.");
  expect(container.querySelector("#pw-err").textContent).toBe("Enter your password.");
  expect(document.activeElement).toBe(container.querySelector("#email"));
  expect(container.querySelector("#email").getAttribute("aria-invalid")).toBe("true");
  expect(container.querySelector("#password").getAttribute("aria-invalid")).toBe("true");

  await fill("#email", "invalid-address");
  expect(container.querySelector("#email-err").textContent).toBe("Enter a valid work email.");
  await fill("#email", email);
  expect(container.querySelector("#email-err").textContent).toBe("");
  expect(container.querySelector("#email").getAttribute("aria-invalid")).toBe("false");
  await act(async () => submit());
  expect(document.activeElement).toBe(container.querySelector("#password"));
  expect(mockLogin).not.toHaveBeenCalled();
  expect(mockExploreDemo).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();

  await fill("#password", password);
  expect(container.querySelector("#pw-err").textContent).toBe("");
  expect(container.querySelector("#password").getAttribute("aria-invalid")).toBe("false");
  mockLogin.mockResolvedValue({ role: "client_readonly" });
  await act(async () => submit());
  expect(mockLogin).toHaveBeenCalledWith(email, password);
});

test("inline validation retains native email validity and leaves password policy to the server", async () => {
  await render();
  await fill("#email", "person@intranet");
  await fill("#password", "  ");
  expect(container.querySelector("#email").validity.valid).toBe(true);
  mockLogin.mockRejectedValue(new Error("Invalid credentials"));
  await act(async () => submit());
  expect(mockLogin).toHaveBeenCalledWith("person@intranet", "  ");
  expect(container.querySelector("#email-err").textContent).toBe("");
  expect(container.querySelector("#pw-err").textContent).toBe("");
  expect(container.querySelector("#status").textContent).toBe("Invalid credentials");
});

test("password reveal retains exact whitespace and Unicode without submitting or entering Demo", async () => {
  await render();
  await fill("#password", password);
  await click("[data-testid='toggle-password']");
  expect(container.querySelector("#password").type).toBe("text");
  expect(container.querySelector("[data-testid='toggle-password']").getAttribute("aria-label")).toBe("Hide password");
  expect(container.querySelector("[data-testid='toggle-password']").getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelector("#password").value).toBe(password);
  await click("[data-testid='toggle-password']");
  expect(container.querySelector("#password").type).toBe("password");
  expect(container.querySelector("[data-testid='toggle-password']").getAttribute("aria-label")).toBe("Show password");
  expect(container.querySelector("[data-testid='toggle-password']").getAttribute("aria-pressed")).toBe("false");
  expect(container.querySelector("#password").value).toBe(password);
  expect(mockLogin).not.toHaveBeenCalled();
  expect(mockExploreDemo).not.toHaveBeenCalled();
});

test("Caps Lock follows keyboard modifier state and clears on blur without changing the password", async () => {
  await render();
  await fill("#password", password);
  const input = container.querySelector("#password");
  expect(input.getAttribute("aria-describedby").split(" ")).not.toContain("caps");
  for (const [type, active] of [["keydown", true], ["keyup", false], ["keydown", true]]) {
    const event = new KeyboardEvent(type, { key: "a", bubbles: true });
    Object.defineProperty(event, "getModifierState", { value: modifier => modifier === "CapsLock" && active });
    await act(async () => input.dispatchEvent(event));
    expect(container.querySelector("#caps").classList.contains("on")).toBe(active);
    expect(input.getAttribute("aria-describedby").split(" ").includes("caps")).toBe(active);
  }
  await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  expect(container.querySelector("#caps").classList.contains("on")).toBe(false);
  expect(input.getAttribute("aria-describedby").split(" ")).not.toContain("caps");
  expect(input.value).toBe(password);
  expect(mockLogin).not.toHaveBeenCalled();
  expect(mockExploreDemo).not.toHaveBeenCalled();
});

test("standard submission immediately excludes repeated submits and both Demo entry points", async () => {
  let resolve;
  mockLogin.mockReturnValue(new Promise(done => { resolve = done; }));
  await render();
  await fillCredentials();
  await act(async () => {
    submit(); submit();
    for (const selector of demoSelectors) container.querySelector(selector).click();
  });
  expect(mockLogin).toHaveBeenCalledTimes(1);
  expect(mockLogin).toHaveBeenCalledWith(email, password);
  expect(mockExploreDemo).not.toHaveBeenCalled();
  expect(container.querySelector("form").getAttribute("aria-busy")).toBe("true");
  expect(container.querySelector("[data-testid='submit-auth']").getAttribute("aria-busy")).toBe("true");
  for (const selector of ["[data-testid='submit-auth']", ...demoSelectors]) expect(container.querySelector(selector).disabled).toBe(true);
  await act(async () => resolve({ role: "super_admin" }));
  // Routing/permissions after this native entry route belong to App, not this mocked unit.
  expect(mockNavigate).toHaveBeenCalledWith("/");
  expect(container.querySelector("form").getAttribute("aria-busy")).toBe("false");
});

test("failed standard sign-in retains exact credentials, announces the actual error and permits retry", async () => {
  mockLogin.mockRejectedValueOnce(new Error("Unable to sign in."));
  await render();
  await fillCredentials();
  await act(async () => submit());
  expect(mockToastError).toHaveBeenCalledWith("Unable to sign in.");
  expect(container.querySelector("#status").textContent).toBe("Unable to sign in.");
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(container.querySelector("#password").value).toBe(password);
  expect(container.querySelector("#email").value).toBe(email);
  expect(container.querySelector("[data-testid='submit-auth']").disabled).toBe(false);
  mockLogin.mockResolvedValueOnce({ role: "super_admin" });
  await act(async () => submit());
  expect(mockLogin).toHaveBeenCalledTimes(2);
  expect(mockLogin).toHaveBeenLastCalledWith(email, password);
  expect(mockNavigate).toHaveBeenCalledWith("/");
  expect(container.querySelector("#status").textContent).toBe("");
});

test.each(demoSelectors)("%s immediately excludes both Demo repeats and standard submission, then permits retry", async selector => {
  let reject;
  mockExploreDemo.mockReturnValueOnce(new Promise((resolve, fail) => { reject = fail; }));
  await render();
  await fillCredentials();
  await act(async () => {
    container.querySelector(selector).click();
    for (const other of demoSelectors) container.querySelector(other).click();
    submit();
  });
  expect(mockExploreDemo).toHaveBeenCalledTimes(1);
  expect(mockExploreDemo).toHaveBeenCalledWith();
  expect(mockLogin).not.toHaveBeenCalled();
  for (const button of ["[data-testid='submit-auth']", ...demoSelectors]) expect(container.querySelector(button).disabled).toBe(true);
  await act(async () => reject(new Error("Demo storage unavailable.")));
  expect(mockToastError).toHaveBeenCalledWith("Demo storage unavailable.");
  expect(container.querySelector("#status").textContent).toBe("Demo storage unavailable.");
  expect(mockNavigate).not.toHaveBeenCalled();
  for (const button of demoSelectors) expect(container.querySelector(button).disabled).toBe(false);
  expect(container.querySelector("#password").value).toBe(password);
  mockExploreDemo.mockResolvedValueOnce({ role: "super_admin" });
  await click(selector);
  expect(mockExploreDemo).toHaveBeenCalledTimes(2);
  expect(mockNavigate).toHaveBeenCalledWith("/clients");
  expect(container.querySelector("#status").textContent).toBe("");
  expect(mockLogin).not.toHaveBeenCalled();
});

test("Microsoft only announces its exact unavailable status and leaves credential and native entry state untouched", async () => {
  const xhrOpen = jest.spyOn(XMLHttpRequest.prototype, "open");
  const previousFetch = global.fetch;
  const fetch = jest.fn();
  global.fetch = fetch;
  try {
    await render();
    await fillCredentials();
    await click("#sso");
    expect(container.querySelector("#status").textContent).toBe("Microsoft sign-in is not available yet.");
    expect(container.querySelector("#email").value).toBe(email);
    expect(container.querySelector("#password").value).toBe(password);
    expect(container.querySelector("form").getAttribute("aria-busy")).toBe("false");
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockExploreDemo).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
  } finally {
    if (previousFetch === undefined) delete global.fetch;
    else global.fetch = previousFetch;
  }
});

test("unsupported persistence and footer controls retain the reference layout without inventing behavior", async () => {
  await render();
  await fillCredentials();
  const keep = container.querySelector("#keep");
  expect(keep.getAttribute("aria-disabled")).toBe("true");
  expect(keep.title).toMatch(/not supported/);
  await click("#keep");
  expect(keep.checked).toBe(false);
  const links = [...container.querySelectorAll("footer nav a")];
  expect(links.map(link => link.textContent)).toEqual(["Privacy", "Terms", "Security & trust", "System status"]);
  for (const link of links) {
    expect(link.getAttribute("aria-disabled")).toBe("true");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => link.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
  }
  expect(container.querySelector("#password").value).toBe(password);
  expect(mockLogin).not.toHaveBeenCalled();
  expect(mockExploreDemo).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  mockLogin.mockResolvedValue({ role: "super_admin" });
  await act(async () => submit());
  expect(mockLogin.mock.calls).toEqual([[email, password]]);
});

test("Login metadata restores its previous title without overriding a newer owner", async () => {
  const previous = document.title;
  await render();
  expect(document.title).toBe("GoverNara Sign In");
  await act(async () => root.render(<div>Other route</div>));
  expect(document.title).toBe(previous);
  await render();
  document.title = "Other route title";
  await act(async () => root.render(<div>Other route</div>));
  expect(document.title).toBe("Other route title");
  document.title = previous;
});
