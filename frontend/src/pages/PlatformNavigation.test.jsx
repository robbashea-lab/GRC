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
let mockClients;
jest.mock("@/context/OrgContext", () => ({ useOrg: () => ({ clients: mockClients, switchClient: mockSwitch, refresh: mockRefresh }) }));
jest.mock("@/components/NotificationBell", () => () => null);
jest.mock("@/lib/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() }, PREVIEW_MODE: false, formatError: e => e.message }));
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate, useLocation: () => ({ pathname: "/clients" }), Outlet: () => null, Link: ({children,to,...props})=><a href={to} {...props}>{children}</a>, NavLink: ({ children, to }) => <a href={to}>{typeof children === "function" ? children({ isActive: false }) : children}</a> }), { virtual: true });

const AT = '2026-10-13T12:00:00Z';
const position = (implemented, denominator) => ({availability: 'available', measure_version: 'native-implementation-v1', implemented, denominator,
  included_counts: [{key: 'addressed', label: 'Implemented', count: implemented}, {key: 'in_progress', label: 'Partially Implemented', count: 0}, {key: 'needs_attention', label: 'Needs Attention', count: 0}, {key: 'not_assessed', label: 'Not Assessed', count: denominator - implemented}],
  source_revision: `current-${implemented}`, scope_signature: `scope-${denominator}`, captured_at: AT, retrieved_at: AT});
const program = (client, key, implemented, before) => {
  const soc = key === 'soc-2', denominator = soc ? 38 : 153;
  const baseline = {...position(before, denominator), effective_at: '2026-07-15T12:00:00Z'};
  return {client_id: client.client_id, program_id: `${client.client_id}:${soc ? key : 'cis-ig1'}`, program_key: key, framework_key: soc ? key : 'cis-ig1',
    program_label: soc ? 'SOC 2' : 'CIS IG3', scope_label: soc ? 'Security and Availability' : 'Cumulative IG3 safeguards', to: `/compliance/${soc ? key : 'cis-ig1'}`,
    current: position(implemented, denominator), snapshots_90d: [], scope_changes_90d: [],
    comparison_90d: {baseline, baseline_effective_at_start: true, comparable: true, change_pp: (implemented - before) / denominator * 100}};
};
let root, container, mockPortfolio;
beforeAll(() => {Object.defineProperty(global, 'crypto', {configurable:true,value:require('crypto').webcrypto});});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  window.scrollTo=jest.fn();
  mockUser = {...mockFixtures.responses["/auth/me"]};
  mockClients = mockFixtures.responses["/clients"];
  const clients = mockClients.map((client, index) => ({...client, assigned_owner_id: index ? 'another-user' : mockUser.user_id,
    grc_lead_id: index ? 'another-user' : mockUser.user_id, grc_lead: {name: index ? 'Another Lead' : mockUser.name},
    last_activity: {at: index ? '2026-09-01T12:00:00Z' : '2026-10-12T12:00:00Z', label: 'Assessment updated'}}));
  mockPortfolio = {as_of: AT, clients, programs: [program(clients[0], 'cis-ig3', 138, 80), program(clients[0], 'soc-2', 4, 10), program(clients[1], 'cis-ig3', 31, 28)]};
  api.get.mockImplementation(async (path, options) => {
    if(path==='/portfolio/reporting/overview') return {data:mockPortfolio};
    if(path==='/portfolio/reporting/history') {
      const selected=mockPortfolio.programs.find(value=>value.client_id===options.params.client_id&&value.program_key===options.params.program_key);
      return {data:{...selected,as_of:AT,snapshots:[],forecast_snapshots:[],scope_changes:[],forecast_scope_changes:[],comparison:{comparable:false,reason:'No retained period boundary'}}};
    }
    return {data:mockFixtures.responses[path]};
  });
  api.post.mockResolvedValue({ data: { client_id: "new", name: "Sample" } });
  api.patch.mockResolvedValue({ data: { ...mockFixtures.responses["/clients"][0] } });
  mockNavigate.mockClear(); mockSwitch.mockClear(); api.get.mockClear(); api.post.mockClear(); api.patch.mockClear();
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
const select = async (label,value) => { const node=container.querySelector(`select[aria-label="${label}"]`); expect(node).toBeTruthy(); await act(async()=>{node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));}); };
const scopeButton = label => [...container.querySelectorAll('[aria-label="Client scope"] button')].find(node=>node.textContent===label);
const visibleClients = () => [...container.querySelectorAll('.gp-first-row')].map(node=>node.dataset.clientId);

test("approved five-column portfolio preserves native All/Mine scope and its shared sidebar", async () => {
  mockClients=mockPortfolio.clients;
  await render(<><Layout/><ClientDirectory /></>);
  expect(container.querySelector('[data-testid="add-client-button"]')).toBeNull();
  expect(container.querySelector("h1").textContent).toBe("Client Portfolio");
  const filters = container.querySelector('[data-testid="client-directory-filters"]');
  expect([...filters.querySelectorAll('[aria-label="Client scope"] button')].map(node=>node.textContent)).toEqual(['All Clients','Assigned to Me']);
  expect([...container.querySelectorAll('.gp-table thead th')].map(node=>node.firstChild.textContent.trim())).toEqual(['Client','GRC Lead','Framework','Implementation progress','Last activity']);
  expect(container.querySelector('[data-testid="portfolio-summary-cards"], .gp-work-views, .gp-hero')).toBeNull();
  expect(container.querySelector('button[aria-label="Portfolio filters"]')).toBeNull();
  expect(container.querySelector('[data-testid^="client-status-"]')).toBeNull();
  expect(container.querySelector('.gp-countbar').textContent).toContain('2 clients · 3 programs');
  expect(container.querySelector('.gp-first-row td').rowSpan).toBe(2);
  await click(scopeButton('Assigned to Me'));
  expect(visibleClients()).toEqual([mockClients[0].client_id]);
  expect(container.querySelector('.gp-countbar').textContent).toContain('1 client · 2 programs');
  expect(container.querySelector('[aria-label="Client list scope"]')).toBeNull();
  expect(container.querySelectorAll('[data-testid^="sidebar-open-"]')).toHaveLength(2);
  await click(scopeButton('All Clients'));
  expect(scopeButton('All Clients').getAttribute('aria-pressed')).toBe('true');
  expect(visibleClients()).toEqual(mockClients.map(client=>client.client_id));
  await change(container.querySelector('[data-testid="client-directory-search"]'),' SOC 2 ');
  await select('Framework','cis-ig3');
  expect(visibleClients()).toEqual([mockClients[0].client_id]);
  expect(container.querySelector('[aria-label="Open SOC 2 for Acme Corp"]')).toBeNull();
  expect(container.querySelector('.gp-countbar').textContent).toContain('1 client · 1 program');
  expect(container.querySelectorAll('[data-testid^="sidebar-open-"]')).toHaveLength(2);
});

test.each([['name',[0,1]],['name-desc',[1,0]],['change-desc',[0,1]],['progress',[0,1]],['progress-desc',[0,1]],['activity-desc',[0,1]]])('%s approved sort keeps client groups and uses the lowest visible program value',async (key,order)=>{
  await render(<ClientDirectory />);
  expect([...container.querySelector('select[aria-label="Sort clients"]').options].map(option=>option.value)).toEqual(['name','name-desc','progress-desc','progress','change-desc','activity-desc']);
  await select('Sort clients',key);
  expect(visibleClients()).toEqual(order.map(index=>mockPortfolio.clients[index].client_id));
  expect(container.querySelectorAll(`[data-client-id="${mockPortfolio.clients[0].client_id}"]`)).toHaveLength(2);
  if(key==='progress') {
    await select('Framework','cis-ig3');
    expect(visibleClients()).toEqual([mockPortfolio.clients[1].client_id,mockPortfolio.clients[0].client_id]);
  }
  await click(scopeButton('Assigned to Me')); await select('Framework','soc-2');
  await change(container.querySelector('[data-testid="client-directory-search"]'),'missing-client');
  await click([...container.querySelectorAll('button')].find(node=>node.textContent==='Clear search and filter'));
  expect(container.querySelector('select[aria-label="Framework"]').value).toBe('all');
  expect(container.querySelector('select[aria-label="Sort clients"]').value).toBe(key);
  expect(scopeButton('Assigned to Me').getAttribute('aria-pressed')).toBe('true');
  expect(visibleClients()).toEqual([mockPortfolio.clients[0].client_id]);
  expect(container.querySelector('.gp-countbar').textContent).toContain('1 client · 2 programs');
});

test('portfolio client/framework links and whole progress area open exact native destinations and selected-program history',async()=>{
  await render(<ClientDirectory />);
  const first=mockPortfolio.clients[0],selected=mockPortfolio.programs.find(value=>value.client_id===first.client_id&&value.program_key==='soc-2');
  await click(container.querySelector(`[data-client-id="${first.client_id}"] .gp-client-name`));
  expect(mockSwitch).toHaveBeenCalledWith(first.client_id);
  expect(mockNavigate).toHaveBeenLastCalledWith(`/dashboard?client_id=${first.client_id}`);
  await click(container.querySelector(`[data-program-id="${selected.program_id}"] .gp-framework`));
  expect(mockNavigate).toHaveBeenLastCalledWith(`/compliance/soc-2?client_id=${first.client_id}`);
  const progress=container.querySelector(`[data-program-id="${selected.program_id}"] .gp-progress`);
  await click(progress);
  const dialog=document.querySelector('[data-testid="portfolio-history-dialog"]');
  expect(dialog).toBeTruthy(); expect(dialog.querySelector('[role="tab"][data-state="active"]').textContent).toContain('SOC 2');
  expect(api.get).toHaveBeenLastCalledWith('/portfolio/reporting/history',expect.objectContaining({params:{client_id:first.client_id,program_key:'soc-2',range:'6m',include_archived:false}}));
  expect(dialog.querySelector('.ph-current-value').textContent).toContain('4 of 38');
  await click([...dialog.querySelectorAll('button')].find(node=>node.textContent==='Open SOC 2 workspace →'));
  expect(mockSwitch).toHaveBeenLastCalledWith(first.client_id);
  expect(mockNavigate).toHaveBeenLastCalledWith(`/compliance/soc-2?client_id=${first.client_id}`);
  await click([...dialog.querySelectorAll('button')].find(node=>node.textContent==='Open client portal'));
  expect(mockNavigate).toHaveBeenLastCalledWith(`/dashboard?client_id=${first.client_id}`);
  expect(dialog.contains(document.activeElement)).toBe(true);
  // Radix schedules close autofocus on unmount; observe the real focus return.
  const focusReturned=new Promise(resolve=>progress.addEventListener('focus',resolve,{once:true}));
  await click([...dialog.querySelectorAll('button')].find(node=>node.textContent==='Close'));
  expect(document.querySelector('[data-testid="portfolio-history-dialog"]')).toBeNull();
  await focusReturned;
  expect(document.activeElement).toBe(progress);
  await change(container.querySelector('[data-testid="client-directory-search"]'),first.name);
  expect(visibleClients()).toEqual([first.client_id]);
});

test("sidebar removes favorites and keeps client navigation with scope filtering in the portfolio", async () => {
  await render(<Layout />);
  expect(container.textContent).not.toMatch(/Favorites|Fav/);
  expect(container.querySelector('[aria-label="Client list scope"]')).toBeNull();
  const active = mockFixtures.responses["/clients"].filter(c => c.status !== "archived");
  expect(container.querySelectorAll('[data-testid^="sidebar-open-"]').length).toBe(active.length);
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
