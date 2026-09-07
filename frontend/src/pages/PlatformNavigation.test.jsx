import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ClientDirectory from "./ClientDirectory";
import ClientManagement from "./ClientManagement";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import mockFixtures from "@/preview/fixtures.json";

const mockNavigate = jest.fn(), mockSwitch = jest.fn(), mockRefresh = jest.fn();
let mockUser;
jest.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: mockUser, logout: jest.fn() }) }));
jest.mock("@/context/OrgContext", () => ({ useOrg: () => ({ clients: mockFixtures.responses["/clients"], switchClient: mockSwitch, refresh: mockRefresh }) }));
jest.mock("@/components/NotificationBell", () => () => null);
jest.mock("@/lib/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() }, PREVIEW_MODE: false, formatError: e => e.message }));
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate, useLocation: () => ({ pathname: "/clients" }), Outlet: () => null, NavLink: ({ children, to }) => <a href={to}>{typeof children === "function" ? children({ isActive: false }) : children}</a> }), { virtual: true });

let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockUser = mockFixtures.responses["/auth/me"];
  api.get.mockImplementation(async path => ({ data: mockFixtures.responses[path] }));
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

test("portfolio retains metrics and only operational quick filters", async () => {
  await render(<ClientDirectory />);
  expect(container.querySelector('[data-testid="add-client-button"]')).toBeNull();
  const filters = container.querySelector('[data-testid="client-directory-filters"]');
  expect([...filters.querySelectorAll("button")].map(b => b.textContent)).toEqual(["All Clients", "Assigned to Me", "Past Due", "Critical / High", "Unassigned"]);
  const p = mockFixtures.responses["/clients/directory"].portfolio;
  for (const [id, value] of [["past-due",p.past_due],["due-30d",p.due_30d],["due-31-90",p.due_31_90d],["critical-high",p.critical_high_open],["unassigned",p.unassigned]]) {
    expect(container.querySelector(`[data-testid="card-${id}"]`).textContent).toContain(String(value));
  }
  expect(container.querySelector('[data-testid="card-attention-clients"]').textContent).toContain(`${p.clients_requiring_attention} of ${p.total_clients}`);
  const rows = mockFixtures.responses["/clients/directory"].clients;
  for (const [id, predicate] of [["all", () => true], ["assigned_to_me",r => r.grc_lead_id === mockUser.user_id], ["past_due",r => r.past_due > 0], ["critical_high",r => r.critical_high_open > 0], ["unassigned",r => r.unassigned > 0]]) {
    await click(container.querySelector(`[data-testid="client-filter-${id}"]`));
    expect(container.querySelectorAll('[data-testid^="client-open-"]').length).toBe(rows.filter(predicate).length);
  }
  await click(container.querySelector('[data-testid="client-filter-all"]'));
  await click(container.querySelector(`[data-testid="client-open-${rows[0].client_id}"]`));
  expect(mockSwitch).toHaveBeenCalledWith(rows[0].client_id);
  expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  expect(container.textContent).toContain("Needs Attention Across Clients");
  expect(container.querySelector('[data-testid="client-lead-filter"]')).toBeTruthy();
  await change(container.querySelector('[data-testid="client-directory-search"]'), rows[0].name);
  expect(container.querySelectorAll('[data-testid^="client-open-"]').length).toBe(1);
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
  await change(container.querySelector('[data-testid="sidebar-client-search"]'), client.name);
  expect(container.querySelectorAll('[data-testid^="sidebar-open-"]').length).toBe(1);
  await click(container.querySelector(`[data-testid="sidebar-open-${client.client_id}"]`));
  expect(mockSwitch).toHaveBeenCalledWith(client.client_id);
});

test("management reuses client form for add and edit; client role gets no controls", async () => {
  await render(<ClientManagement />);
  await click(container.querySelector('[data-testid="add-client-button"]'));
  expect(document.querySelector('[data-testid="new-client-name"]').value).toBe("");
  await change(document.querySelector('[data-testid="new-client-name"]'), "New organization");
  await click(document.querySelector('[data-testid="new-client-save"]'));
  expect(api.post).toHaveBeenCalledWith("/clients", expect.objectContaining({ name: "New organization" }));
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
