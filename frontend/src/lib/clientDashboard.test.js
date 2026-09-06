import { aggregateClientDashboard, calendarDay, DASHBOARD_KINDS } from "./clientDashboard";
import { loadClientDashboard } from "./loadClientDashboard";

const today = new Date(2026, 8, 6, 12);
const user = { user_id: "owner-a", name: "Test Owner" };
const options = { clientId: "client-a", user, today };
const date = offset => new Date(Date.UTC(2026, 8, 6 + offset)).toISOString().slice(0, 10);
const task = (id, offset, priority = "medium", extra = {}) => ({ task_id: id, client_id: "client-a", title: id, status: "open", priority, due_date: offset == null ? null : date(offset), ...extra });
const aggregate = records => aggregateClientDashboard(records, options);

test("empty and future clients receive the same empty result without configuration", () => {
  expect(aggregate({})).toEqual({ attention: [], upcoming: [] });
  expect(aggregateClientDashboard({}, { ...options, clientId: "new-client" })).toEqual({ attention: [], upcoming: [] });
  expect(aggregate({ tasks: [task("first", 1)] }).attention[0].id).toBe("first");
});

test("calendar boundaries, priorities, undated work and closed records", () => {
  const result = aggregate({ tasks: [task("other-overdue", -1), task("high-overdue", -1, "high"), task("critical-overdue", -1, "critical"),
    task("today", 0), task("day14", 14), task("day15", 15), task("day90", 90), task("day91", 91),
    task("high-now", 14, "high"), task("critical-now", 14, "critical"), task("high-undated", null, "high"),
    task("low-undated", null, "low"), task("closed", -10, "critical", { status: "done" }),
    task("high-future", 45, "high")] });
  expect(result.attention.slice(0, 3).map(r => r.id)).toEqual(["critical-overdue", "high-overdue", "other-overdue"]);
  expect(result.attention.slice(3, 5).map(r => r.id)).toEqual(["critical-now", "high-now"]);
  expect(result.attention.find(r => r.id === "today").priority_label).toBe("Due within 14 days");
  expect(result.upcoming.map(r => r.id)).toEqual(["day15", "day90"]);
  expect(result.attention.map(r => r.id)).toEqual(expect.arrayContaining(["day14", "high-undated", "high-future"]));
  expect(result.attention.map(r => r.id)).not.toEqual(expect.arrayContaining(["closed"]));
  expect(new Set([...result.attention, ...result.upcoming].map(r => r.key)).size).toBe(result.attention.length + result.upcoming.length);
});

test("uses real review, policy, vendor, risk, acceptance and contract dates", () => {
  const result = aggregate({ reviews: [{ client_id: "client-a", review_id: "rev", title: "Vendor review", vendor_id: "vendor", status: "upcoming", due_date: date(20) }],
    vendors: [{ client_id: "client-a", vendor_id: "vendor", name: "Provider", status: "active", criticality: "critical", next_review: date(20), contract_expiration: date(40), contract_end: date(40), contract_renewal: date(40), assurance_expires_at: date(50) }],
    policies: [{ client_id: "client-a", policy_id: "policy", title: "Policy", status: "approved", next_review_date: date(14) }],
    risks: [{ client_id: "client-a", risk_id: "risk", title: "Risk", status: "accepted", risk_level: "critical", next_review: date(60) }],
    exceptions: [{ client_id: "client-a", exception_id: "exception", title: "Acceptance", risk_id: "other-risk", status: "approved", expires_at: date(-1) }],
  });
  expect(result.upcoming.filter(r => r.kind === "vendors").map(r => r.event)).toEqual(["renewal", "assurance"]);
  expect(result.upcoming.map(r => r.type)).toContain("Risk Acceptance Review");
  expect(result.attention.map(r => r.type)).toEqual(["Risk Acceptance Expiry", "Policy Review"]);
  expect(result.upcoming.find(r => r.id === "rev").record.vendor_id).toBe("vendor");
});

test("linked remediation suppresses duplicate finding; independent deadlines remain", () => {
  const finding = { client_id: "client-a", finding_id: "f", title: "Gap", status: "in_remediation", severity: "high", due_date: date(5) };
  expect(aggregate({ findings: [finding], tasks: [task("remediate", 5, "high", { finding_id: "f" })] }).attention.map(r => r.kind)).toEqual(["tasks"]);
  expect(aggregate({ findings: [finding], tasks: [task("independent", 10, "high", { finding_id: "f" })] }).attention).toHaveLength(2);
  expect(aggregate({ findings: [finding], tasks: [task("done", 5, "high", { finding_id: "f", status: "done" })] }).attention.map(r => r.kind)).toEqual(["findings"]);
  expect(aggregate({ findings: [{ ...finding, due_date: null }], tasks: [task("low-undated", null, "low", { finding_id: "f" })] }).attention.map(r => r.kind)).toEqual(["findings"]);
});

test("linked acceptance expiry appears once and modeled requirement reviews are included", () => {
  const result = aggregate({ risks: [{ client_id: "client-a", risk_id: "risk", title: "Risk", status: "accepted", next_review: date(30) }],
    exceptions: [{ client_id: "client-a", exception_id: "acceptance", risk_id: "risk", title: "Acceptance", status: "approved", expires_at: date(30) }],
    requirements: [{ client_id: "client-a", requirement_id: "req", title: "Contract obligation", status: "active", next_review_date: date(2) }],
  });
  expect(result.upcoming.map(r => r.kind)).toEqual(["exceptions"]);
  expect(result.attention.map(r => r.type)).toEqual(["Requirement Review"]);
});

test("recurring child prevents duplicate occurrence and titles alone never deduplicate", () => {
  const review = { client_id: "client-a", review_id: "r", title: "Same title", status: "upcoming", due_date: date(1), recurrence: "monthly", next_review_date: date(31) };
  const result = aggregate({ reviews: [review, { ...review, review_id: "child", parent_review_id: "r", due_date: date(31), next_review_date: null }], tasks: [task("same", 1, "low", { title: "Same title" })] });
  expect(result.upcoming.map(r => r.id)).toEqual(["child"]);
  expect(result.attention).toHaveLength(2);
});

test("owner names, person scope, unassigned work and cross-tenant rejection", () => {
  const records = { tasks: [task("mine", 1, "medium", { assignee_id: user.user_id }), task("unassigned", 1)] };
  expect(aggregateClientDashboard(records, { ...options, scope: { kind: "mine" } }).attention.map(r => r.owner)).toEqual(["Test Owner"]);
  expect(aggregateClientDashboard(records, { ...options, scope: { kind: "unassigned" } }).attention.map(r => r.owner)).toEqual(["Unassigned"]);
  expect(() => aggregate({ tasks: [task("foreign", 1, "high", { client_id: "client-b" })] })).toThrow("different client");
  expect(calendarDay("2026-02-30")).toBeNull();
  expect(calendarDay("2026-09-06T23:59:00Z")).toBe(calendarDay("2026-09-06"));
});

test("loader scopes every record request and preserves existing summary metrics", async () => {
  const kpis = { overdue_actions: 7, critical_high_findings: 3, significant_risks: 2, due_next_30: 11 };
  const api = { get: jest.fn(async (path) => ({ data: path === "/dashboard" ? { kpis } : [] })) };
  const result = await loadClientDashboard(api, { ...options, scope: { kind: "org" } });
  expect(result.kpis).toBe(kpis);
  for (const kind of DASHBOARD_KINDS) expect(api.get).toHaveBeenCalledWith(`/${kind}`, expect.objectContaining({ params: { client_id: "client-a" } }));
  expect(api.get).toHaveBeenCalledWith("/clients/client-a/members", expect.anything());
  api.get.mockRejectedValueOnce(new Error("Forbidden"));
  await expect(loadClientDashboard(api, { ...options, scope: { kind: "org" } })).rejects.toThrow("Forbidden");
});
