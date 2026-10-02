import React, { act } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./Dashboard";
import { useOrg } from "@/context/OrgContext";
import { loadClientDashboard } from "@/lib/loadClientDashboard";
import { aggregateClientDashboard } from "@/lib/clientDashboard";
import { dashboardPosture } from "@/lib/dashboardPosture";
import api from '@/lib/api';

jest.mock("@/context/OrgContext", () => ({ useOrg: jest.fn() }));
jest.mock("@/context/AuthContext", () => {
  const user = { user_id: "test-user", role: "super_admin" };
  return { useAuth: () => ({ user }) };
});
jest.mock("@/lib/loadClientDashboard", () => ({ loadClientDashboard: jest.fn(), labelDashboardRows:rows=>rows }));
// Demo mode is switchable: the legacy layout now renders only for the live backend.
const mockMode = { preview: false };
jest.mock("@/lib/api", () => ({ __esModule: true, default: {get:jest.fn()}, get PREVIEW_MODE() { return mockMode.preview; }, API: "/api", formatError: err => err.message }));
jest.mock("react-router-dom", () => ({ Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a> }),{virtual:true});
jest.mock("@/components/DashboardScopeSelector", () => () => null);
jest.mock("@/components/RecordDrawer", () => props => <><div data-testid="record-drawer">{props.kind}:{props.record.task_id}:{props.clientId}</div><button onClick={()=>props.onOpenChange(false)}>Close test record</button></>);

const empty = { members: [], programs: [], posture: dashboardPosture(aggregateClientDashboard({}, {clientId:'a'})) };
let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  useOrg.mockReturnValue({ currentClientId: "a", currentClient: { name: "Client A" } });
  loadClientDashboard.mockReset();
  mockMode.preview = false;
  api.get.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test("minimal client: attention strip, priority panel and three health panels, all empty", async () => {
  loadClientDashboard.mockResolvedValue(empty);
  await act(async () => root.render(<Dashboard />));
  expect(container.textContent).toContain("No items require immediate attention right now.");
  expect(container.textContent).not.toContain("Upcoming & Watch");
  expect(container.textContent).not.toContain("Compliance & Readiness");
  // Reference layout for every client: Requires attention, Highest priority items, three health panels.
  expect(container.querySelectorAll("section")).toHaveLength(5);
  expect(container.textContent).toContain("Requires attention");
  expect(container.querySelector('[data-testid="kpi-overdue"]')).toBeNull();
  expect(container.querySelector('button[aria-label="Past Due: 0 items"]')).not.toBeNull();
});

test('every Demo client gets the queue dashboard; opening and closing a record retains its filter',async()=>{
  mockMode.preview=true;
  const item={key:'tasks:t',id:'t',kind:'tasks',title:'Brawndo work',status:'open',owner:'Unassigned',unassigned:true};
  const queue={as_of:'2026-09-27',groups:Object.fromEntries(['all','pastDue','due30','unassigned'].map(key=>[key,{total:1,items:[item]}]))};
  useOrg.mockReturnValue({currentClientId:'demo_brawndo',currentClient:{name:'Brawndo'}});
  loadClientDashboard.mockResolvedValue({...empty,contract_version:2,queue});
  api.get.mockResolvedValue({data:{client_id:'demo_brawndo',task_id:'t',title:'Brawndo work'}});
  await act(async()=>root.render(<Dashboard/>));
  expect(container.textContent).toContain('Brawndo Dashboard');
  expect(container.textContent).not.toContain('Board Report PDF');
  expect(loadClientDashboard.mock.calls.at(-1)[1].workQueue).toBe(true);
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.startsWith('Unassigned')).click());
  await act(async()=>container.querySelector('tbody button').click());
  expect(container.querySelector('[data-testid="record-drawer"]').textContent).toBe('tasks:t:demo_brawndo');
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Close test record').click());
  expect(container.querySelector('[data-testid="record-drawer"]')).toBeNull();
  expect(container.querySelector('[aria-pressed=true]').textContent).toContain('Unassigned');
  // Dunder (and any other Demo client) uses the same composition, not the legacy layout.
  useOrg.mockReturnValue({currentClientId:'demo_dunder',currentClient:{name:'Dunder Mifflin'}});
  loadClientDashboard.mockResolvedValue({...empty,contract_version:2,queue});
  await act(async()=>root.render(<Dashboard/>));
  expect(container.textContent).toContain('Dunder Mifflin Dashboard');
  expect(container.textContent).not.toContain('Requires attention');
  expect(loadClientDashboard.mock.calls.at(-1)[1].workQueue).toBe(true);
  // The live backend has no work_queue contract yet and keeps the older layout.
  mockMode.preview=false;
  useOrg.mockReturnValue({currentClientId:'live_client',currentClient:{name:'Live'}});
  loadClientDashboard.mockResolvedValue(empty);
  await act(async()=>root.render(<Dashboard/>));
  expect(container.textContent).toContain('Board Report PDF');
  expect(container.textContent).toContain('Requires attention');
  expect(loadClientDashboard.mock.calls.at(-1)[1].workQueue).toBe(false);
});

test("populated client row opens the existing authoritative record drawer", async () => {
  const item = { key: "tasks:t:due", id: "t", kind: "tasks", title: "Remediate", type: "Action Item", action: "Open Action", priority_label: "Overdue", owner: "Test Owner", status: "open", due_date: "2026-09-01", record: { task_id: "t", client_id: "a" } };
  loadClientDashboard.mockResolvedValue({ ...empty, posture: {...empty.posture, priority:[item], pastDue:[item]} });
  await act(async () => root.render(<Dashboard />));
  const button = [...container.querySelectorAll("tbody button")].find(b => b.textContent === "Remediate");
  await act(async () => button.click());
  expect(container.querySelector('[data-testid="record-drawer"]').textContent).toBe("tasks:t:a");
});

test("cards open exact contributing rows; the priority table is capped at six", async () => {
  const items=Array.from({length:7},(_,i)=>({key:`tasks:${i}:due`,id:String(i),kind:'tasks',title:`Action ${i}`,type:'Action Item',action:'Open Action',owner:'Unassigned',status:'open',priority_label:'Overdue',record:{task_id:String(i),client_id:'a'}}));
  loadClientDashboard.mockResolvedValue({...empty,posture:{...empty.posture,pastDue:items,priority:items,buckets:[{key:'pastDue',label:'Past Due',items}]}});
  await act(async()=>root.render(<Dashboard/>));
  expect(container.querySelectorAll('tbody tr')).toHaveLength(6);
  await act(async()=>container.querySelector('button[aria-label="Past Due: 7 items"]').click());
  const drawer=document.querySelector('[data-testid="dashboard-drilldown"]');
  expect(drawer.textContent).toContain('7 contributing records');
  expect(drawer.querySelectorAll('tbody tr')).toHaveLength(7);
  await act(async()=>[...drawer.querySelectorAll('tbody button')].find(b=>b.textContent==='Action 0').click());
  expect(container.querySelector('[data-testid="record-drawer"]').textContent).toBe('tasks:0:a');
});

test('bounded dashboard displays full totals, pages detail and fetches the authoritative record',async()=>{
  const items=Array.from({length:26},(_,i)=>({key:`tasks:${i}:due`,id:String(i),kind:'tasks',title:`Action ${i}`,type:'Action Item',action:'Open Action',owner:'Unassigned',status:'open',priority_label:'Overdue',record:{task_id:String(i),client_id:'a'}}));
  loadClientDashboard.mockResolvedValue({...empty,contract_version:2,posture:{...empty.posture,pastDue:items.slice(0,25),totals:{pastDue:26},buckets:[{key:'pastDue',label:'Past Due',items:items.slice(0,25),total:26}]}});
  api.get.mockImplementation(async(path,options)=>({data:path==='/dashboard'?{client_id:'a',items:items.slice(options.params.offset,options.params.offset+25),total:26,offset:options.params.offset,limit:25}:{client_id:'a',task_id:'25',title:'Authoritative Action'}}));
  await act(async()=>root.render(<Dashboard/>));
  expect(container.querySelector('button[aria-label="Past Due: 26 items"]')).not.toBeNull();
  await act(async()=>container.querySelector('button[aria-label="Past Due: 26 items"]').click());
  const drawer=document.querySelector('[data-testid="dashboard-drilldown"]');
  expect(drawer.textContent).toContain('Showing 1–25 of 26');
  expect(drawer.querySelectorAll('tbody tr')).toHaveLength(25);
  await act(async()=>[...drawer.querySelectorAll('button')].find(button=>button.textContent==='Next').click());
  expect(drawer.textContent).toContain('Showing 26–26 of 26');
  expect(drawer.querySelectorAll('tbody tr')).toHaveLength(1);
  await act(async()=>[...drawer.querySelectorAll('tbody button')].find(button=>button.textContent==='Action 25').click());
  expect(api.get).toHaveBeenCalledWith('/tasks/25');
  expect(container.querySelector('[data-testid="record-drawer"]').textContent).toBe('tasks:25:a');
});

test("tenant switching hides old data and ignores a late response from the previous tenant", async () => {
  let finishA;
  loadClientDashboard.mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }));
  await act(async () => root.render(<Dashboard />));
  const signal = loadClientDashboard.mock.calls[0][1].signal;
  useOrg.mockReturnValue({ currentClientId: "b", currentClient: { name: "Client B" } });
  loadClientDashboard.mockResolvedValue(empty);
  await act(async () => root.render(<Dashboard />));
  expect(signal.aborted).toBe(true);
  await act(async () => finishA({ ...empty, attention: [{ title: "Client A secret" }] }));
  expect(container.textContent).not.toContain("Client A secret");
  // The rendered snapshot is Client B's (the page no longer repeats the client name the sidebar shows).
  expect(loadClientDashboard.mock.calls.at(-1)[1].clientId).toBe("b");
  expect(container.textContent).toContain("No items require immediate attention right now.");
});

test("failed sources show a recoverable error instead of blank panels", async () => {
  loadClientDashboard.mockRejectedValue(new Error("Source unavailable"));
  await act(async () => root.render(<Dashboard />));
  expect(container.querySelector('[role="alert"]').textContent).toContain("Source unavailable");
  loadClientDashboard.mockResolvedValue(empty);
  await act(async () => container.querySelector("button").click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
