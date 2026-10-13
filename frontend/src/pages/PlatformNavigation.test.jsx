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
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate, useLocation: () => ({ pathname: "/clients" }), Outlet: () => null, Link: ({children,to,...props})=><a href={to} {...props}>{children}</a>, NavLink: ({ children, to }) => <a href={to}>{typeof children === "function" ? children({ isActive: false }) : children}</a> }), { virtual: true });

let root, container;
beforeAll(() => {Object.defineProperty(global, 'crypto', {configurable:true,value:require('crypto').webcrypto});});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo=jest.fn();
  mockUser = {...mockFixtures.responses["/auth/me"]};
  mockClients = mockFixtures.responses["/clients"];
  let directory;
  api.get.mockImplementation(async (path, options) => {
    if(path==='/clients/directory') {
      if(!directory) directory=portfolio(seedStore(),false);
      return {data:directory};
    }
    return {data:path.startsWith('/portfolio/reporting/')?{
      total_clients:new Set((options?.params?.client_ids||'').split(',').filter(Boolean)).size,
      frameworks:[],programs:[],recent_changes_count:0,
    }:mockFixtures.responses[path]};
  });
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

test("approved portfolio cards preserve native All and Assigned to Me scope", async () => {
  await render(<ClientDirectory />);
  expect(container.querySelector('[data-testid="add-client-button"]')).toBeNull();
  expect(container.querySelector("h1").textContent).toBe("Client Portfolio");
  // The approved compact reporting cards preserve the existing operational register.
  expect(container.textContent).not.toMatch(/Platform|Where each client program needs attention/);
  expect(container.querySelector(".register-signal, [data-testid=\"portfolio-cards\"]")).toBeNull();
  const filters = container.querySelector('[data-testid="client-directory-filters"]');
  expect([...filters.querySelectorAll(".portfolio-view")].map(b => b.textContent)).toEqual(["All Clients", "Assigned to Me"]);
  expect(container.querySelector('.gp-hero, .gp-hero-art')).toBeNull();
  const cards=container.querySelector('[data-testid="portfolio-summary-cards"]');
  expect(cards).toBeTruthy();
  expect([...cards.querySelectorAll('.gp-metric-label, .gp-metric-link-title')].map(node=>node.textContent)).toEqual(['Total clients','Active frameworks','Framework progress','Recent changes']);
  expect(cards.querySelectorAll('.gp-metric')).toHaveLength(4);
  await click(container.querySelector('button[aria-label="Portfolio filters"]'));
  expect([...document.querySelectorAll('.gp-work-views .portfolio-view')].map(b=>b.textContent)).toEqual(["Past Due", "Critical / High", "Significant Risks", "Unassigned"]);
  const rows = portfolio(seedStore(),false).clients;
  // The Client column identifies the client; status text is not repeated there.
  expect(container.querySelector('[data-testid^="client-status-"]')).toBeNull();
  expect(container.textContent).not.toMatch(/Action required|Needs attention|On track/);
  const shown = () => container.querySelectorAll('[data-testid^="client-open-"]').length;
  await click(container.querySelector('[data-testid="client-filter-assigned_to_me"]'));
  const mine = rows.filter(r=>r.grc_lead_id===mockUser.user_id);
  expect(shown()).toBe(mine.length);
  // Assigned to Me combines with a work view; All Clients clears both.
  await click(document.querySelector('[data-testid="client-filter-past_due"]'));
  expect(shown()).toBe(mine.filter(r=>r.past_due>0).length);
  await click(container.querySelector('[data-testid="client-filter-all"]'));
  expect(shown()).toBe(rows.length);
});

test.each(['past_due','critical_high_issues','significant_risks','unassigned'])('%s native work view filters the register and clears back to all clients',async key=>{
  await render(<ClientDirectory />);
  const rows=portfolio(seedStore(),false).clients;
  const shown=()=>container.querySelectorAll('[data-testid^="client-open-"]').length;
  await click(container.querySelector('button[aria-label="Portfolio filters"]'));
  await click(document.querySelector(`[data-testid="client-filter-${key}"]`));
  expect(document.querySelector(`[data-testid="client-filter-${key}"]`).getAttribute('aria-pressed')).toBe('true');
  expect(shown()).toBe(rows.filter(r=>r[key]>0).length);
  await click(document.querySelector(`[data-testid="client-filter-${key}"]`));
  expect(document.querySelector(`[data-testid="client-filter-${key}"]`).getAttribute('aria-pressed')).toBe('false');
  expect(shown()).toBe(rows.length);
});

test('portfolio native contributing-item drills, risk links, client portal and search remain connected',async()=>{
  await render(<ClientDirectory />);
  const rows=portfolio(seedStore(),false).clients;
  const shown=()=>container.querySelectorAll('[data-testid^="client-open-"]').length;
  // Numbers open the exact contributing records; Significant Risks opens the filtered Risk register.
  const first = rows[0];
  await act(async()=>container.querySelector('[data-testid="client-row-menu-0"]').dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0,ctrlKey:false})));
  const metric = key => document.querySelector(`[data-client-id="${first.client_id}"][data-metric="${key}"]`) || container.querySelector(`[data-client-id="${first.client_id}"] [data-metric="${key}"]`);
  expect(metric('due_31_90d').lastElementChild.textContent).toBe(String(first.due_31_90d));
  await click(metric('due_31_90d'));
  expect(document.querySelector('[data-testid="drill-dialog"]').textContent).toContain(`${first.due_31_90d} contributing items`);
  expect(document.querySelectorAll('[data-testid^="drill-row-"]').length).toBe(first.due_31_90d);
  await click([...document.querySelector('[data-testid="drill-dialog"]').querySelectorAll('button')].find(button=>button.textContent.trim()==='Close'));
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
  expect(container.querySelector('[data-testid="sidebar-filter-all"]').textContent).toBe("All");
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
  expect(api.post).toHaveBeenCalledWith("/clients", expect.objectContaining({ name: "New organization" }), {headers:{'Idempotency-Key':expect.any(String)},pendingCommandGeneration:expect.any(Number)});
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
