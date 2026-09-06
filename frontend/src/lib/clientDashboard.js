// Presentation-only view of records returned by tenant-authorized API endpoints.
// Nothing here creates or updates an obligation.
export const DASHBOARD_KINDS = ["reviews", "findings", "tasks", "risks", "policies", "vendors", "exceptions", "requirements"];
const IDS = { reviews: "review_id", findings: "finding_id", tasks: "task_id", risks: "risk_id", policies: "policy_id", vendors: "vendor_id", exceptions: "exception_id", requirements: "requirement_id" };
const OWNERS = { reviews: ["owner_id", "reviewer_id"], tasks: ["assignee_id", "owner_id"], policies: ["owner_id", "approver_id"], vendors: ["business_owner_id", "owner_id"], exceptions: ["owner_id", "approver_id"] };
const CLOSED = new Set(["completed", "cancelled", "done", "closed", "remediated", "retired", "archived", "inactive", "terminated", "offboarding", "revoked", "not_applicable"]);

// Compare calendar dates, not the current time of day. Date-only values must
// not shift to yesterday in a browser west of UTC.
export function calendarDay(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.getTime() / 86400000;
}

export function aggregateClientDashboard(records, { clientId, user, scope = { kind: "org" }, members = [], today = new Date() }) {
  if (!clientId) throw new Error("Select a client to view its dashboard.");
  const currentDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000;
  const userMap = new Map(members.map(u => [u.user_id, u.name || u.email]));
  if (user) userMap.set(user.user_id, user.name || user.email);
  const ownerIds = (r, kind) => (OWNERS[kind] || ["owner_id"]).map(k => r[k]).filter(Boolean);
  const target = scope.kind === "mine" ? user?.user_id : scope.user_id;
  const scoped = (r, kind) => scope.kind === "unassigned" ? !ownerIds(r, kind).length
    : ["mine", "user"].includes(scope.kind) ? ownerIds(r, kind).includes(target) : true;
  const active = {};
  for (const kind of DASHBOARD_KINDS) {
    const list = records[kind] || [];
    if (!Array.isArray(list) || list.some(r => r.client_id !== clientId)) {
      throw new Error("The dashboard received records for a different client. Please reload.");
    }
    active[kind] = list.filter(r => !CLOSED.has(r.status) && !(kind === "findings" && r.status === "accepted"));
  }
  const candidates = [];
  function add(record, kind, event, type, date, action, severity = null, allowUndated = false) {
    const id = record[IDS[kind]];
    if (!id) return;
    const day = calendarDay(date);
    if (day == null && !allowUndated) return;
    const owners = ownerIds(record, kind);
    candidates.push({ key: `${kind}:${id}:${event}`, id, kind, record, event, type, action,
      title: record.title || record.name || type, due_date: day == null ? null : date,
      day, severity, owner: owners.length ? (userMap.get(owners[0]) || "Assigned user") : "Unassigned",
      unassigned: !owners.length, status: record.status });
  }
  for (const r of active.reviews) {
    add(r, "reviews", "due", "Review", r.due_date, "Open Review");
    // Only use a separately modeled next date when no child occurrence already
    // represents it. No recurrence dates are calculated here.
    if (r.recurrence && r.recurrence !== "none" && calendarDay(r.next_review_date) > calendarDay(r.due_date)
      && !r.next_occurrence_id && !active.reviews.some(child => child.parent_review_id === r.review_id && calendarDay(child.due_date) === calendarDay(r.next_review_date))) {
      add(r, "reviews", "next", "Review", r.next_review_date, "Open Review");
    }
  }
  for (const r of active.tasks) add(r, "tasks", "due", "Action Item", r.due_date, "Open Action", r.priority, true);
  for (const r of active.findings) {
    // A linked open remediation task is the authoritative action. Retain a
    // finding when its separately dated deadline is not represented by a task.
    const linked = active.tasks.filter(t => t.finding_id === r.finding_id);
    const represented = linked.some(t => {
      const day = calendarDay(t.due_date);
      const sameDeadline = !r.due_date || day === calendarDay(r.due_date);
      const taskNeedsAttention = (day != null && day <= currentDay + 14) || ["critical", "high"].includes(t.priority);
      // A low-priority, undated task must not hide a material open finding.
      return sameDeadline && (!["critical", "high"].includes(r.severity) || taskNeedsAttention);
    });
    if (!represented) add(r, "findings", "due", "Finding", r.due_date, "View Finding", r.severity, true);
  }
  for (const r of active.risks) {
    const represented = r.status === "accepted" && active.exceptions.some(e => e.risk_id === r.risk_id && ["approved", "expired"].includes(e.status) && calendarDay(e.expires_at) != null && calendarDay(e.expires_at) === calendarDay(r.next_review));
    if (!represented) add(r, "risks", "review", r.status === "accepted" ? "Risk Acceptance Review" : (r.next_review ? "Risk Review" : "Risk"), r.next_review, "View Risk", r.status === "accepted" ? null : r.risk_level, r.status !== "accepted");
  }
  for (const r of active.policies) {
    const represented = active.reviews.some(v => v.policy_id === r.policy_id && calendarDay(v.due_date) === calendarDay(r.next_review_date));
    if (!represented) add(r, "policies", "review", "Policy Review", r.next_review_date, "Open Policy");
  }
  for (const r of active.vendors) {
    const represented = active.reviews.some(v => v.vendor_id === r.vendor_id && calendarDay(v.due_date) === calendarDay(r.next_review));
    if (!represented) add(r, "vendors", "review", "Vendor Review", r.next_review, "Open Vendor");
    add(r, "vendors", "renewal", "Contract Renewal", r.contract_renewal, "Open Vendor");
    const expiration = r.contract_expiration || r.contract_end;
    // Legacy contract_end and current contract_expiration describe one event.
    if (calendarDay(expiration) !== calendarDay(r.contract_renewal)) add(r, "vendors", "expiration", "Contract Expiration", expiration, "Open Vendor");
    add(r, "vendors", "assurance", "Assurance Expiry", r.assurance_expires_at, "Open Vendor");
  }
  for (const r of active.exceptions) if (["approved", "expired"].includes(r.status)) {
    add(r, "exceptions", "expiry", r.risk_id ? "Risk Acceptance Expiry" : "Exception Expiry", r.expires_at, "Open Acceptance");
  }
  for (const r of active.requirements) if (r.applicability !== "not_applicable") {
    add(r, "requirements", "review", "Requirement Review", r.next_review_date, "Open Requirement");
  }
  const unique = [...new Map(candidates.map(r => [r.key, r])).values()].filter(r => scoped(r.record, r.kind));
  const urgent = r => ["critical", "high"].includes(r.severity);
  const attention = unique.filter(r => (r.day != null && r.day <= currentDay + 14) || urgent(r));
  const rank = r => {
    const severity = r.severity === "critical" ? 0 : r.severity === "high" ? 1 : 2;
    if (r.day != null && r.day < currentDay) return severity;
    if (r.day != null && r.day <= currentDay + 14) return 3 + severity;
    return urgent(r) ? 6 : 7;
  };
  const compare = (a, b) => (a.day ?? Infinity) - (b.day ?? Infinity) || a.title.localeCompare(b.title) || a.key.localeCompare(b.key);
  attention.sort((a, b) => rank(a) - rank(b) || compare(a, b));
  for (const r of attention) {
    const timing = r.day != null && r.day < currentDay ? "Overdue" : r.day != null && r.day <= currentDay + 14 ? "Due within 14 days" : "Open";
    r.priority_label = `${urgent(r) ? r.severity[0].toUpperCase() + r.severity.slice(1) + " · " : ""}${timing}`;
  }
  const keys = new Set(attention.map(r => r.key));
  const upcoming = unique.filter(r => !keys.has(r.key) && r.day > currentDay + 14 && r.day <= currentDay + 90).sort(compare);
  return { attention, upcoming };
}
