import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import api, { formatError } from "@/lib/api";
import { representedFinding } from "@/lib/grcWork";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ListChecks } from "lucide-react";
import { toast } from "sonner";
import RecordDrawer from "@/components/RecordDrawer";
import { SCHEMAS } from "@/lib/schemas";

// Action Items is a UNIFIED WORK QUEUE that surfaces existing Task / Finding / Review records —
// it never creates duplicates. Rows link back to their underlying records via the same drawers.

const VIEWS = [
  { id: "all", label: "All" },
  { id: "my", label: "Assigned to Me" },
  { id: "all_open", label: "All Open" },
  { id: "in_progress", label: "In Progress" },
  { id: "findings", label: "Findings" },
  { id: "reviews", label: "Reviews" },
  { id: "due_soon", label: "Due Soon" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];

const PRIORITY_TONE = {
  immediate: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border",
  critical: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border",
  high: "bg-semantic-duesoon-bg text-semantic-duesoon-text border-semantic-duesoon-border",
  medium: "bg-semantic-info-bg text-semantic-info border-semantic-info-border",
  moderate: "bg-semantic-info-bg text-semantic-info border-semantic-info-border",
  low: "bg-surface-subtle text-ink-secondary border-line",
};

const closedTask = ["done", "cancelled"];
const closedReview = ["completed", "cancelled"];

function isOverdue(due, status, closed) {
  if (!due) return false;
  if (closed.includes(status)) return false;
  return daysUntil(due) < 0;
}

function daysUntil(due) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return due ? Math.round((new Date(due.slice(0, 10) + "T00:00:00") - today) / 86400000) : Infinity;
}

function priorityLabel(p) {
  if (!p) return "—";
  const map = { critical: "Immediate", high: "High", medium: "Moderate", moderate: "Moderate", low: "Low", immediate: "Immediate" };
  return map[p] || (p.charAt(0).toUpperCase() + p.slice(1));
}

export default function ActionItems() {
  const nav = useNavigate();
  const location = useLocation();
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const view = params.get("view") || (user?.role === "client_contributor" ? "my" : "all_open");
  const sort = params.get("sort") || "due";
  const setParam = (key, value) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }); };
  const setQ = value => setParam("q", value);
  const setView = value => setParam("view", value);
  const [loading, setLoading] = useState(true);
  const loadSequence = useRef(0);
  const [drawer, setDrawer] = useState({ open: false, kind: null, record: null });

  const canWrite = ["super_admin", "platform_admin", "client_contributor"].includes(user?.role);
  const userMap = useMemo(() => {
    const m = {};
    users.forEach((u) => { m[u.user_id] = u.name || u.email; });
    return m;
  }, [users]);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (!currentClientId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [tasks, findings, reviews, u] = await Promise.all([
        api.get("/tasks", { params: { client_id: currentClientId } }).then((r) => r.data),
        api.get("/findings", { params: { client_id: currentClientId } }).then((r) => r.data),
        api.get("/reviews", { params: { client_id: currentClientId } }).then((r) => r.data),
        api.get("/users").then((r) => r.data).catch(() => []),
      ]);
      if (sequence !== loadSequence.current) return;
      setUsers(u || []);

      const items = [];
      // Tasks (native action items)
      for (const t of tasks) {
        items.push({
          _kind: "task", id: t.task_id, raw: t,
          title: t.title, type: t.finding_id ? "Remediation Action" : "General Task",
          priority: t.priority || "medium",
          owner_id: t.assignee_id || t.owner_id,
          due_date: t.due_date, status: t.status || "open",
          source: [reviews.find(r => r.review_id === t.review_id)?.title || t.source, findings.find(f => f.finding_id === t.finding_id)?.title].filter(Boolean).join(" · ") || "Manual",
          closed: closedTask,
        });
      }
      // Findings that require remediation (surface as action rows, not duplicates)
      for (const f of findings) {
        if (representedFinding(f, tasks)) continue;
        items.push({
          _kind: "finding", id: f.finding_id, raw: f,
          title: f.title, type: "Finding / Validation",
          priority: f.severity || "medium",
          owner_id: f.owner_id,
          due_date: f.due_date, status: f.status,
          source: reviews.find(r => r.review_id === f.review_id)?.title || "Finding",
          closed: ["closed", "accepted"],
        });
      }
      // Reviews assigned to someone — appear as actionable rows without duplicating the record
      for (const r of reviews) {
        items.push({
          _kind: "review", id: r.review_id, raw: r,
          title: r.title, type: "Review",
          priority: "medium",
          owner_id: r.owner_id || r.reviewer_id,
          due_date: r.due_date, status: r.status || "upcoming",
          source: r.review_type ? `${r.review_type} review` : "Review",
          closed: closedReview,
        });
      }
      setRows(items);
    } catch (e) { if (sequence === loadSequence.current) { setRows([]); toast.error(formatError(e)); } }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [currentClientId]);

  useEffect(() => { const sequence = loadSequence; setRows([]); setDrawer({ open: false, kind: null, record: null }); load(); return () => { sequence.current++; }; }, [load, location.pathname]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      const overdue = isOverdue(r.due_date, r.status, r.closed);
      if (r.raw.client_id !== currentClientId) return false;
      const isCompleted = r.closed.includes(r.status);
      if (view === "in_progress" && !["in_progress", "in_remediation"].includes(r.status)) return false;
      if (view === "my" && ((r.owner_id !== user?.user_id && !(r._kind === "review" && r.raw.reviewer_id === user?.user_id)) || isCompleted)) return false;
      if (view === "all_open" && isCompleted) return false;
      if (view === "findings" && r._kind !== "finding") return false;
      if (view === "reviews" && r._kind !== "review") return false;
      if (view === "overdue" && !overdue) return false;
      if (view === "completed" && !isCompleted) return false;
      if (view === "due_soon") {
        if (isCompleted) return false;
        if (daysUntil(r.due_date) < 0 || daysUntil(r.due_date) > 7) return false;
      }
      if (!s) return true;
      return (r.title || "").toLowerCase().includes(s)
        || (r.id || "").toLowerCase().includes(s)
        || (r.source || "").toLowerCase().includes(s)
        || (userMap[r.owner_id] || "").toLowerCase().includes(s);
    }).sort((a,b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "priority" ? ({critical:4,high:3,medium:2,low:1}[b.priority] || 0) - ({critical:4,high:3,medium:2,low:1}[a.priority] || 0) : (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  }, [rows, view, q, user, userMap, currentClientId, sort]);

  const counts = useMemo(() => {
    const c = { all: rows.length, in_progress: 0, my: 0, all_open: 0, findings: 0, reviews: 0, due_soon: 0, overdue: 0, completed: 0 };
    rows.forEach((r) => {
      const overdue = isOverdue(r.due_date, r.status, r.closed);
      const isCompleted = r.closed.includes(r.status);
      if (["in_progress", "in_remediation"].includes(r.status)) c.in_progress += 1;
      if (r.owner_id === user?.user_id && !isCompleted) c.my += 1;
      if (!isCompleted) c.all_open += 1;
      if (r._kind === "finding") c.findings += 1;
      if (r._kind === "review") c.reviews += 1;
      if (overdue) c.overdue += 1;
      if (isCompleted) c.completed += 1;
      if (!isCompleted && daysUntil(r.due_date) >= 0 && daysUntil(r.due_date) <= 7) c.due_soon += 1;
    });
    return c;
  }, [rows, user]);

  function open(row) {
    setDrawer({ open: true, kind: row._kind === "task" ? "tasks" : row._kind === "finding" ? "findings" : "reviews", record: row.raw });
  }

  return (
    <div>
      <PageHeader
        title="Action Items"
        subtitle={`${currentClient?.name || ""} · Assigned work, remediation and review obligations.`}
        action={
          canWrite && (
            <Button
              size="sm"
              onClick={() => setDrawer({ open: true, kind: "tasks", record: null })}
              data-testid="new-action-item"
              className="bg-brand-charcoal hover:bg-brand-charcoal-hover"
            >
              <ListChecks className="h-3.5 w-3.5 mr-1" /> New Action Item
            </Button>
          )
        }
      />
      <div className="px-8 py-4 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/60">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-help" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actions, findings, reviews…" className="pl-8 h-9 w-72 text-sm" data-testid="ai-search" />
        </div>
        <div className="inline-flex items-center rounded-md border border-line bg-surface-card p-0.5 gap-0.5" data-testid="ai-views">
          {VIEWS.map((v) => {
            const active = view === v.id;
            const n = counts[v.id] || 0;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                data-testid={`ai-view-${v.id}`}
                className={`px-3 h-8 text-xs rounded-[6px] transition ${active ? "bg-brand-charcoal text-ink-onDark font-medium" : "text-ink-secondary hover:bg-surface-subtle"}`}
              >
                {v.label}
                <span className={`ml-1.5 font-mono text-[10px] ${active ? "text-ink-onDarkMuted" : "text-ink-help"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <Select value={sort} onValueChange={v => setParam("sort", v)}><SelectTrigger className="w-40" aria-label="Sort actions"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="due">Due date</SelectItem><SelectItem value="priority">Priority</SelectItem><SelectItem value="title">Title</SelectItem></SelectContent></Select>
        <div className="text-xs text-slate-500 ml-auto font-mono">{filtered.length} / {rows.length}</div>
      </div>

      <div className="p-8">
        <div className="bg-surface-card border border-line rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-[11px] font-mono uppercase tracking-widest text-ink-secondary border-b border-line">
              <tr>
                <th className="tbl-cell text-left font-medium">Action Item</th>
                <th className="tbl-cell text-left font-medium">Type</th>
                <th className="tbl-cell text-left font-medium">Priority</th>
                <th className="tbl-cell text-left font-medium">Owner</th>
                <th className="tbl-cell text-left font-medium">Due</th>
                <th className="tbl-cell text-left font-medium">Status</th>
                <th className="tbl-cell text-left font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={7} className="tbl-cell text-center text-ink-help py-10">Loading…</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="tbl-cell text-center text-ink-help py-10">No action items in this view.</td></tr>
              )}
              {!loading && filtered.map((r, i) => {
                const overdue = isOverdue(r.due_date, r.status, r.closed);
                const tone = PRIORITY_TONE[(r.priority || "").toLowerCase()] || PRIORITY_TONE.medium;
                return (
                  <tr key={`${r._kind}-${r.id}`} className="row-hover cursor-pointer" onClick={() => open(r)} data-testid={`ai-row-${i}`}>
                    <td className="tbl-cell font-medium text-ink-primary">
                      <button type="button" className="text-left hover:underline focus-visible:underline" onClick={e => { e.stopPropagation(); open(r); }}>{r.title}</button>
                    </td>
                    <td className="tbl-cell text-xs text-ink-secondary">{r.type}</td>
                    <td className="tbl-cell">
                      <span className={`pill ${tone}`}>
                        {priorityLabel(r.priority)}
                      </span>
                    </td>
                    <td className="tbl-cell text-xs text-ink-secondary">{userMap[r.owner_id] || <span className="text-slate-300">—</span>}</td>
                    <td className="tbl-cell text-xs font-mono">
                      {r.due_date ? (
                        <span className={overdue ? "text-semantic-critical font-medium" : "text-ink-secondary"}>
                          {new Date(r.due_date.slice(0, 10) + "T00:00:00").toLocaleDateString()}
                          {overdue && <span className="ml-1 text-[10px] uppercase">overdue</span>}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="tbl-cell">
                      <span className="pill pill-neutral">
                        {r.status === "remediated" ? "Pending validation" : (r.status || "").replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="tbl-cell text-xs text-ink-help">{r.source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {drawer.kind && (
        <RecordDrawer
          open={drawer.open && (!drawer.record || drawer.record.client_id === currentClientId)}
          onOpenChange={(v) => setDrawer((p) => ({ ...p, open: v }))}
          kind={drawer.kind}
          schema={SCHEMAS[drawer.kind]?.fields}
          clientId={currentClientId}
          users={users}
          record={drawer.record}
          onSaved={load}
        />
      )}
    </div>
  );
}
