import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ClientDirectory from "./ClientDirectory";
import ClientManagement from "./ClientManagement";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import mockFixtures from "@/preview/fixtures.json";
import {seedStore} from '@/preview/store';
import {portfolio} from '@/preview/summaries';

const mockNavigate = jest.fn(), mockSwitch = jest.fn(), mockRefresh = jest.fn();
let mockUser;
jest.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: mockUser, logout: jest.fn() }) }));
let mockClients;
jest.mock("@/context/OrgContext", () => ({ useOrg: () => ({ clients: mockClients, switchClient: mockSwitch, refresh: mockRefresh }) }));
jest.mock("@/components/NotificationBell", () => () => null);
jest.mock("@/lib/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() }, PREVIEW_MODE: false, formatError: e => e.message }));
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate, useLocation: () => ({ pathname: "/clients" }), Outlet: () => null, NavLink: ({ children, to }) => <a href={to}>{typeof children === "function" ? children({ isActive: false }) : children}</a> }), { virtual: true });

let root, container;
beforeAll(() => {Object.defineProperty(global, 'crypto', {configurable:true,value:require('crypto').webcrypto});});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo=jest.fn();
  mockUser = {...mockFixtures.responses["/auth/me"]};
  mockClients = mockFixtures.responses["/clients"];
  api.get.mockImplementation(async path => ({ data: path==='/clients/directory'?portfolio(seedStore(),false):mockFixtures.responses[path] }));
  api.post.mockResolvedValue({ data: { client_id: "new", name: "Sample" } });
  api.patch.mockResolvedValue({ data: { ...mockFixtures.responses["/clients"][0] } });
  mockNavigate.mockClear(); mockSwitch.mockClear(); api.post.mockClear(); api.patch.mockClear();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const render = async component => { await act(async () => root.render(component)); };
const change = async (node, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const click = async node => { expect(node).toBeTruthy(); await act(async () => node.click()); };

test("portfolio is a compact triage index: one heading, one view bar, the table, and drill-downs", async () => {
  await render(<ClientDirectory />);
  expect(container.querySelector('[data-testid="add-client-button"]')).toBeNull();
  expect(container.querySelector("h1").textContent).toBe("Client Portfolio");
  // No eyebrow, explanatory subtitle or summary cards above the table.
  expect(container.textContent).not.toMatch(/Platform|Where each client program needs attention/);
  expect(container.querySelector(".register-signal, [data-testid=\"portfolio-cards\"]")).toBeNull();
  const filters = container.querySelector('[data-testid="client-directory-filters"]');
  expect([...filters.querySelectorAll(".portfolio-view")].map(b => b.textContent)).toEqual(["All Clients", "Assigned to Me", "Past Due", "Critical / High", "Significant Risks", "Unassigned"]);
  const rows = portfolio(seedStore(),false).clients;
  // The Client column identifies the client; status text is not repeated there.
  expect(container.querySelector('[data-testid^="client-status-"]')).toBeNull();
  expect(container.textContent).not.toMatch(/Action required|Needs attention|On track/);
  const shown = () => container.querySelectorAll('[data-testid^="client-open-"]').length;
  await click(container.querySelector('[data-testid="client-filter-assigned_to_me"]'));
  const mine = rows.filter(r=>r.grc_lead_id===mockUser.user_id);
  expect(shown()).toBe(mine.length);
  // Assigned to Me combines with a work view; All Clients clears both.
  await click(container.querySelector('[data-testid="client-filter-past_due"]'));
  expect(shown()).toBe(mine.filter(r=>r.past_due>0).length);
  await click(container.querySelector('[data-testid="client-filter-all"]'));
  expect(shown()).toBe(rows.length);
  for(const key of ['past_due','critical_high_issues','significant_risks','unassigned']){
    await click(container.querySelector(`[data-testid="client-filter-${key}"]`));
    expect(container.querySelector(`[data-testid="client-filter-${key}"]`).getAttribute('aria-pressed')).toBe('true');
    expect(shown()).toBe(rows.filter(r=>r[key]>0).length);
    await click(container.querySelector(`[data-testid="client-filter-${key}"]`));
  }
  // Numbers open the exact contributing records; Significant Risks opens the filtered Risk register.
  const first = rows[0];
  const metric = key => container.querySelector(`[data-client-id="${first.client_id}"] [data-metric="${key}"]`);
  expect(metric('due_31_90d').textContent).toBe(String(first.due_31_90d));
  await click(metric('due_31_90d'));
  expect(document.querySelector('[data-testid="drill-dialog"]').textContent).toContain(`${first.due_31_90d} contributing items`);
  expect(document.querySelectorAll('[data-testid^="drill-row-"]').length).toBe(first.due_31_90d);
  await click(metric('significant_risks'));
  expect(mockSwitch).toHaveBeenCalledWith(first.client_id);
  expect(mockNavigate).toHaveBeenCalledWith("/risks?portfolio=significant");
  await click(container.querySelector(`[data-testid="client-open-${first.client_id}"]`));
  expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  expect(container.querySelector('button[aria-label="GRC Lead: sort and filter"]')).toBeTruthy();
  await change(container.querySelector('[data-testid="client-directory-search"]'), first.name);
  expect(shown()).toBe(1);
});

test("sidebar removes favorites and preserves ALL/MINE and navigation", async () => {
  await render(<Layout />);
  expect(container.textContent).not.toMatch(/Favorites|Fav/);
  expect(container.querySelector('[data-testid="sidebar-filter-all"]').textContent).toBe("ALL");
  await click(container.querySelector('[data-testid="sidebar-filter-assigned"]'));
  const mine = mockFixtures.responses["/clients"].filter(c => c.assigned_owner_id === mockUser.user_id && c.status !== "archived");
  expect(container.querySelectorAll('[data-testid^="sidebar-open-"]').length).toBe(mine.length);
  await click(container.querySelector('[data-testid="sidebar-filter-all"]'));
  expect(container.querySelector('a[href="/admin/clients"]')).toBeTruthy();
  const client = mockFixtures.responses["/clients"][0];
  expect(container.querySelector('[data-testid="sidebar-client-search"]')).toBeNull(); // two clients: nothing to search
  await click(container.querySelector(`[data-testid="sidebar-open-${client.client_id}"]`));
  expect(mockSwitch).toHaveBeenCalledWith(client.client_id);
});

test("sidebar search appears once the client list is long enough to scan", async () => {
  mockClients = Array.from({length: 9}, (_, i) => ({client_id: 'c' + i, name: 'Client ' + i, status: 'active'}));
  await render(<Layout />);
  await change(container.querySelector('[data-testid="sidebar-client-search"]'), 'Client 7');
  expect(container.querySelectorAll('[data-testid^="sidebar-open-"]').length).toBe(1);
});

test("management reuses client form for add and edit; client role gets no controls", async () => {
  await render(<ClientManagement />);
  await click(container.querySelector('[data-testid="add-client-button"]'));
  expect(document.querySelector('[data-testid="new-client-name"]').value).toBe("");
  await change(document.querySelector('[data-testid="new-client-name"]'), "New organization");
  await click(document.querySelector('[data-testid="new-client-save"]'));
  expect(api.post).toHaveBeenCalledWith("/clients", expect.objectContaining({ name: "New organization" }), {headers:{'Idempotency-Key':expect.any(String)}});
  api.post.mockClear();
  await click([...container.querySelectorAll("button")].find(b => b.textContent === "Edit"));
  const c = mockFixtures.responses["/clients"][0];
  expect(document.querySelector('[data-testid="new-client-name"]').value).toBe(c.name);
  await click(document.querySelector('[data-testid="new-client-save"]'));
  expect(api.patch).toHaveBeenCalledWith(`/clients/${c.client_id}`, expect.objectContaining({ name: c.name, industry: c.industry }));
  expect(api.post).not.toHaveBeenCalled();
  mockUser = { role: "client_readonly" };
  await render(<ClientManagement />);
  expect(container.querySelector('[data-testid="add-client-button"]')).toBeNull();
  expect(container.querySelector('[role="alert"]')).toBeTruthy();
});
