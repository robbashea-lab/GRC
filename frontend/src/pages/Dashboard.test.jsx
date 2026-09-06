import React, { act } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./Dashboard";
import { useOrg } from "@/context/OrgContext";
import { loadClientDashboard } from "@/lib/loadClientDashboard";

jest.mock("@/context/OrgContext", () => ({ useOrg: jest.fn() }));
jest.mock("@/context/AuthContext", () => {
  const user = { user_id: "test-user", role: "super_admin" };
  return { useAuth: () => ({ user }) };
});
jest.mock("@/lib/loadClientDashboard", () => ({ loadClientDashboard: jest.fn() }));
jest.mock("@/lib/api", () => ({ __esModule: true, default: {}, API: "/api", formatError: err => err.message }));
jest.mock("react-router-dom", () => ({ Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a> }), { virtual: true });
jest.mock("@/components/DashboardScopeSelector", () => () => null);
jest.mock("@/components/RecordDrawer", () => props => <div data-testid="record-drawer">{props.kind}:{props.record.task_id}:{props.clientId}</div>);

const empty = { kpis: { overdue_actions: 0, critical_high_findings: 0, significant_risks: 0, due_next_30: 0 }, members: [], attention: [], upcoming: [] };
let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  useOrg.mockReturnValue({ currentClientId: "a", currentClient: { name: "Client A" } });
  loadClientDashboard.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test("new/minimal client renders zero cards and exact empty states, with only two operational panels", async () => {
  loadClientDashboard.mockResolvedValue(empty);
  await act(async () => root.render(<Dashboard />));
  expect(container.textContent).toContain("No items require immediate attention right now.");
  expect(container.textContent).toContain("No material upcoming GRC items are currently scheduled.");
  expect(container.querySelectorAll("section")).toHaveLength(2);
  for (const id of ["kpi-overdue", "kpi-critical", "kpi-risks", "kpi-due-30"]) expect(container.querySelector(`[data-testid="${id}"]`).textContent).toContain("0");
});

test("populated client row opens the existing authoritative record drawer", async () => {
  const item = { key: "tasks:t:due", id: "t", kind: "tasks", title: "Remediate", type: "Action Item", action: "Open Action", priority_label: "Overdue", owner: "Test Owner", status: "open", due_date: "2026-09-01", record: { task_id: "t", client_id: "a" } };
  loadClientDashboard.mockResolvedValue({ ...empty, attention: [item] });
  await act(async () => root.render(<Dashboard />));
  const button = [...container.querySelectorAll("button")].find(b => b.textContent === "Open Action");
  await act(async () => button.click());
  expect(container.querySelector('[data-testid="record-drawer"]').textContent).toBe("tasks:t:a");
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
  expect(container.textContent).toContain("Client B");
});

test("failed sources show a recoverable error instead of blank panels", async () => {
  loadClientDashboard.mockRejectedValue(new Error("Source unavailable"));
  await act(async () => root.render(<Dashboard />));
  expect(container.querySelector('[role="alert"]').textContent).toContain("Source unavailable");
  loadClientDashboard.mockResolvedValue(empty);
  await act(async () => container.querySelector("button").click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
