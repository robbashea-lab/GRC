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
jest.mock("@/context/OrgContext", () => ({ useOrg: () => ({ clients: mockFixtures.responses["/clients"], switchClient: mockSwitch, refresh: mockRefresh }) }));
jest.mock("@/components/NotificationBell", () => () => null);
jest.mock("@/lib/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() }, PREVIEW_MODE: false, formatError: e => e.message }));
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate, useLocation: () => ({ pathname: "/clients" }), Outlet: () => null, NavLink: ({ children, to }) => <a href={to}>{typeof children === "function" ? children({ isActive: false }) : children}</a> }), { virtual: true });

let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo=jest.fn();
  mockUser = {...mockFixtures.responses["/auth/me"]};
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

test("portfolio is the dashboard, with combinable operational filters and preserved navigation", async () => {
  await render(<ClientDirectory />);
  expect(container.querySelector('[data-testid="add-client-button"]')).toBeNull();
  const filters = container.querySelector('[data-testid="client-directory-filters"]');
  expect([...filters.querySelectorAll("button")].map(b => b.textContent)).toEqual(["Past Due", "Critical / High", "Significant Risks", "Unassigned"]);
  expect(container.querySelector('[data-testid="portfolio-cards"]')).toBeNull();
  const rows = portfolio(seedStore(),false).clients;
  await click(container.querySelector('[data-testid="client-filter-assigned_to_me"]'));
  expect(container.querySelectorAll('[data-testid^="client-open-"]').length).toBe(rows.filter(r=>r.grc_lead_id===mockUser.user_id).length);
  await click(container.querySelector('[data-testid="client-filter-all"]'));
  for(const key of ['past_due','critical_high_issues','significant_risks','unassigned']){
    await click(container.querySelector(`[data-testid="client-filter-${key}"]`));
    expect(container.querySelectorAll('[data-testid^="client-open-"]').length).toBe(rows.filter(r=>r[key]>0).length);
    await click(container.querySelector(`[data-testid="client-filter-${key}"]`));
  }
  await click(container.querySelector(`[data-testid="client-open-${rows[0].client_id}"]`));
  expect(mockSwitch).toHaveBeenCalledWith(rows[0].client_id);
  expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  expect(container.textContent).not.toContain("Needs Attention Across Clients");
  expect(container.querySelector('button[aria-label="GRC Lead: sort and filter"]')).toBeTruthy();
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
