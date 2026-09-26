import TableLoadingRow from '@/components/TableLoadingRow';
import {SETUP_FILTERS} from '@/lib/onboardingHandoff';
import { useTableControls, ColumnControl, TableFilterChips, FilterEmpty } from '@/components/TableControls';
import { tableColumns } from '@/lib/tableColumns';
import { reviewMatches } from '@/lib/tableFilters';
import { reviewDisplayValue } from '@/lib/reviewPresentation';
import { displayDay } from '@/lib/managementDates';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import api, { formatError, API, PREVIEW_MODE } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import { ContactAccessStatus, useContactAccess } from '@/components/ContactAccess';
import { contactResponsibilities } from '@/lib/contactAccess';
import PageHeader from "@/components/PageHeader";
import RegisterSignalBar from "@/components/RegisterSignalBar";
import ContactCoverage from "@/components/ContactCoverage";
import { registerSignals } from "@/lib/registerSignals";
import { isBrawndoReference } from "@/lib/reference";
import { frameworkCatalog } from "@/lib/frameworks";

// Catalog-owned policy → safeguard mappings (reference workspace shows CIS relevance).
const policySupports = row => { const ids = [...new Set((frameworkCatalog("cis-ig1")?.policy_mappings || []).filter(m => m.policy_key === row.baseline_key).flatMap(m => m.safeguards))]; return ids.length ? (ids.length > 4 ? `${ids.slice(0, 4).join(", ")} +${ids.length - 4}` : ids.join(", ")) : ""; };
import PolicyPendingDecisions from '@/components/PolicyPendingDecisions';
import StatusBadge from "@/components/StatusBadge";
import RecordDrawer from "@/components/RecordDrawer";
import { SCHEMAS } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import AssigneeSelect from "@/components/AssigneeSelect";
import { Plus, Search, Trash2, Download, MoreHorizontal, CheckCircle2, UserPlus, UserRound, CircleDashed, X, CalendarDays, MoreVertical, Pencil, Filter, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";

const ID_FIELD = {
  reviews: "review_id", findings: "finding_id", risks: "risk_id", policies: "policy_id",
  vendors: "vendor_id", assets: "asset_id", tasks: "task_id", exceptions: "exception_id",
};

// Default sort per module. Falls back to `due_date` desc if module missing.
const DEFAULT_SORT = {
  reviews: { by: "due_date", dir: "asc" },
  tasks: { by: "due_date", dir: "asc" },
  findings: { by: "severity", dir: "desc" },
  risks: { by: "risk_level", dir: "desc" },
  policies: { by: "next_review_date", dir: "asc" },
  vendors: { by: "next_review", dir: "asc" },
  exceptions: { by: "expires_on", dir: "asc" },
};

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
// Findings open on current deficiencies; closed and accepted history stays one selection away.
const DEFAULT_STATUS = { findings: "active" };
const TERMINAL_STATUS = { findings: ["closed", "accepted"] };
// Cells show a field's vocabulary label, as the form and the column filter do; unknown values show as recorded.
const optionLabel = (schema, key, value) => schema.fields?.find((f) => f.name === key)?.options?.find((o) => o.value === value)?.label ?? value;

// Human-friendly due-date helper. Returns { primary, secondary, tone }.
// `closed` records get neutral treatment (no "overdue" callout).
function formatDue(iso, closed = false) {
  if (!iso) return { primary: "—", secondary: "", tone: "neutral" };
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return { primary: "—", secondary: "", tone: "neutral" };
  const primary = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (closed) return { primary, secondary: "", tone: "neutral" };
  const now = new Date();
  const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const midnightDue = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((midnightDue - midnightToday) / 86400000);
  let secondary = "";
  let tone = "neutral";
  if (days < 0) { secondary = `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`; tone = "critical"; }
  else if (days === 0) { secondary = "today"; tone = "duesoon"; }
  else if (days <= 7) { secondary = `in ${days} day${days === 1 ? "" : "s"}`; tone = "duesoon"; }
  else if (days <= 30) { secondary = `in ${days} days`; tone = "info"; }
  else { secondary = `in ${days} days`; tone = "neutral"; }
  return { primary, secondary, tone };
}

function DueCell({ iso, closed = false }) {
  const { primary, secondary, tone } = formatDue(iso, closed);
  const toneCls = {
    critical: "text-semantic-critical", duesoon: "text-semantic-duesoon-text",
    info: "text-ink-secondary", neutral: "text-ink-secondary",
  }[tone] || "text-ink-secondary";
  if (primary === "—") return <span className="text-ink-help">—</span>;
  return (
    <span className="register-date inline-flex flex-col leading-tight">
      <span className={`font-mono text-xs ${toneCls}`}>{primary}</span>
      {secondary && <span className={`text-xs ${toneCls} opacity-80`}>{secondary}</span>}
    </span>
  );
}

import {basisSummary} from '@/lib/requirementBasis';
// Tab definitions for reviews — order matters (displayed as segmented control)
const REVIEW_TABS = [
  { id: "all", label: "All" },
  { id: "overdue", label: "Overdue" },
  { id: "upcoming", label: "Upcoming" },
  { id: "needs_scheduling", label: "Needs Scheduling" },
  { id: "in_progress", label: "In Progress" },
];

// Reviews are the historical record — delete is admin-only from the ... menu.
function isReviewOverdue(row) {
  if (!row?.due_date || row.status === "needs_scheduling") return false;
  if (row.status === "completed" || row.status === "cancelled") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(row.due_date.slice(0, 10) + "T00:00:00").getTime() < today.getTime();
}

export default function RecordListPage({ kind }) {
  const schema = SCHEMAS[kind];
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadSequence = useRef(0);
  // URL-backed filter/sort state so back-nav restores what the user had.
  const q = params.get("q") || "";
  const statusFilter = params.get("status") || DEFAULT_STATUS[kind] || "all";
  const reference = isBrawndoReference(currentClientId, user);
  const signals = useMemo(() => reference ? registerSignals(kind) : [], [reference, kind]);
  const signal = useMemo(() => signals.find(x => x.id === params.get("signal")), [signals, params]);
  const reviewTab = params.get("tab") === "completed" ? "history" : params.get("tab") === "active" ? "all" : params.get("tab") || "all";
  const defaultSort = DEFAULT_SORT[kind] || { by: "due_date", dir: "desc" };
  const sortBy = params.get("sortBy") || defaultSort.by;
  const sortDir = params.get("sortDir") || defaultSort.dir;

  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value == null || value === "" || (key === "status" && value === (DEFAULT_STATUS[kind] || "all"))) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }
  const setQ = (v) => setParam("q", v);
  const setStatusFilter = (v) => { table.setFilter("status", []); setParam("status", v); };
  const setReviewTab = (v) => { table.setFilter("status", []); setParam("tab", v); };
  function toggleSort(nextBy) {
    const next = new URLSearchParams(params);
    if (sortBy === nextBy) {
      // Same column → flip direction
      const nd = sortDir === "asc" ? "desc" : "asc";
      if (nd === defaultSort.dir && nextBy === defaultSort.by) { next.delete("sortBy"); next.delete("sortDir"); }
      else { next.set("sortBy", nextBy); next.set("sortDir", nd); }
    } else {
      // New column → sensible starting direction
      const dateFields = ["due_date", "next_review", "expires_on", "created_at", "updated_at"];
      const nd = dateFields.includes(nextBy) ? "asc" : "desc";
      if (nextBy === defaultSort.by && nd === defaultSort.dir) { next.delete("sortBy"); next.delete("sortDir"); }
      else { next.set("sortBy", nextBy); next.set("sortDir", nd); }
    }
    setParams(next, { replace: true });
  }

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState(new Set());
  const [ownerPicker, setOwnerPicker] = useState(false);
  const [pickedOwner, setPickedOwner] = useState("");
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false);
  const [pickedDueDate, setPickedDueDate] = useState("");

  // Register-wide creation, scheduling and bulk actions require program administration.
  const canWrite = ["super_admin", "platform_admin"].includes(user?.role);
  const canDelete = ["super_admin", "platform_admin"].includes(user?.role);
  const idField = ID_FIELD[kind];
  const ownerField = kind === "tasks" ? "assignee_id" : "owner_id";
  const isReviews = kind === "reviews";
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
      const { data } = await api.get(`/${kind}`, { params: { client_id: currentClientId,...(kind==='reviews'?{include_basis:true}:{}) } });
      if (kind === "policies") {
        const { data: reviews } = await api.get("/reviews", { params: { client_id: currentClientId } });
        data.forEach(policy => {
          const linked = reviews.filter(r => r.policy_id === policy.policy_id);
          const next = linked.filter(r => !["completed", "cancelled"].includes(r.status) && r.due_date).sort((a,b) => a.due_date.localeCompare(b.due_date))[0];
          if (linked.length) { policy.next_review_date = next?.due_date || null; policy.schedule_from_reviews = true; }
        });
      }
      if (sequence !== loadSequence.current) return;
      setRows(data);
      setChecked(new Set());
    } catch (e) { if (sequence === loadSequence.current) { setRows([]); toast.error(formatError(e)); } }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [kind, currentClientId]);

  useEffect(() => { const sequence = loadSequence; setOpen(false); setSelected(null); setRows([]); load(); return () => { sequence.current++; }; }, [load]);
  useEffect(() => {
    (async () => {
      try { const { data } = await api.get("/users"); setUsers(data); }
      catch { setUsers([]); }
    })();
  }, []);

  const statusOptions = useMemo(() => schema.fields.find((x) => x.name === "status")?.options || [], [schema]);
  const filterClient = useRef(currentClientId);
  const carriedClientChanged = filterClient.current !== currentClientId;
  useEffect(() => {
    if (filterClient.current === currentClientId) return;
    filterClient.current = currentClientId;
    const next = new URLSearchParams(params);
    next.delete('owner'); next.delete('unassigned');
    setParams(next, { replace: true });
  }, [currentClientId, params, setParams]);

  // Carried-scope filters from URL (?owner=<uid>|__me__ &unassigned=1 &severity=critical,high &status=open)
  const urlFilters = useMemo(() => {
    const p = new URLSearchParams(location.search);
    const rawOwner = carriedClientChanged ? "" : p.get("owner") || "";
    let owner = rawOwner;
    if (owner === "__me__") owner = user?.user_id || "";
    return {
      rawOwner,
      owner,
      unassigned: !carriedClientChanged && p.get("unassigned") === "1",
      severities: (p.get("severity") || "").split(",").map((s) => s.trim()).filter(Boolean),
      status: p.get("status") || "",
      setup: SETUP_FILTERS[kind]?.[p.get('setup')] || null,
    };
  }, [location.search, user, carriedClientChanged, kind]);

  const hasUrlFilters = urlFilters.owner || urlFilters.unassigned || urlFilters.severities.length > 0 || urlFilters.status || urlFilters.setup;
  const carriedScopeLabel = useMemo(() => {
    if (!hasUrlFilters) return "";
    const parts = [];
    if (urlFilters.owner) {
      const name = urlFilters.rawOwner === "__me__"
        ? (user?.name || user?.email || "You")
        : (userMap[urlFilters.owner] || urlFilters.owner);
      parts.push(`Owner: ${name}`);
    }
    if (urlFilters.unassigned) parts.push("Unassigned");
    if (urlFilters.severities.length) parts.push(`Severity: ${urlFilters.severities.join(" / ")}`);
    if (urlFilters.status) parts.push(`Status: ${urlFilters.status}`);
    if (urlFilters.setup) parts.push(urlFilters.setup.label);
    return parts.join(" · ");
  }, [hasUrlFilters, urlFilters, userMap, user]);

  const tableSource = rows.filter(r => r.client_id === currentClientId);
  const contactAccessContext = useContactAccess(currentClientId, kind === 'contacts', rows);
  const columnCount = schema.columns.length + (kind === 'contacts' ? 3 : 2);
  const columns = tableColumns(kind, { rows: tableSource, users });
  const table = useTableControls({ columns, rows: tableSource, module: kind, scope: `${user?.user_id}:${currentClientId}`, onFilterChange: (key, values) => {
    if (key !== 'status' || !values.length) return;
    const next = new URLSearchParams(params);
    next.delete('status');
    if (isReviews) next.set('tab', 'all');
    setParams(next, { replace: true });
  } });
  const columnStatusActive = !!table.state.filters.status?.length;
  const setupEntry = useRef('');
  useEffect(() => {
    const key = `${currentClientId}:${kind}:${params.get('setup') || ''}`;
    if (setupEntry.current !== key) {
      setupEntry.current = key;
      // A handoff link is a deliberate precise view, not an intersection with stale session filters.
      if (urlFilters.setup) table.clear();
    }
  });
  const presetRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const passed = rows.filter((r) => {
      if (r.client_id !== currentClientId) return false;
      if (urlFilters.setup && !urlFilters.setup.matches(r)) return false;
      if (isReviews && !reviewMatches(r, reviewTab === 'history' ? 'history' : 'all')) return false;
      // URL-carried filters (from the scoped dashboard). These are additive.
      if (urlFilters.owner) {
        const rOwner = r[ownerField] || r.owner_id || r.assignee_id;
        if (rOwner !== urlFilters.owner) return false;
      }
      if (urlFilters.unassigned) {
        if (r[ownerField] || r.owner_id || r.assignee_id) return false;
      }
      if (urlFilters.severities.length && !urlFilters.severities.includes(r.severity)) return false;
      if (!columnStatusActive && urlFilters.status && r.status !== urlFilters.status) return false;

      if (signal && !signal.test(r)) return false;
      if (isReviews && !signal && !columnStatusActive && !reviewMatches(r, reviewTab)) return false;
      if (!isReviews && !columnStatusActive && statusFilter !== "all" && r.status && (statusFilter === "active" ? (TERMINAL_STATUS[kind] || []).includes(r.status) : r.status !== statusFilter)) return false;
      if (!s) return true;
      const {occurrences, ...searchable} = r;
      return JSON.stringify(searchable).toLowerCase().includes(s);
    });
    // Sort — always float overdue reviews to the top when viewing "All" / non-overdue tabs.
    const dir = sortDir === "asc" ? 1 : -1;
    const key = sortBy;
    const isUserKey = (schema.columns.find((c) => c.key === key) || {}).user;
    const sorted = [...passed].sort((a, b) => {
      if (isReviews && reviewTab === "active" && !params.has("sortBy")) {
        const oa = isReviewOverdue(a), ob = isReviewOverdue(b);
        if (oa !== ob) return oa ? -1 : 1; // overdue first, always
      }
      const va = a?.[key], vb = b?.[key];
      const na = va == null || va === "";
      const nb = vb == null || vb === "";
      if (na && nb) return 0;
      if (na) return 1;   // nulls last
      if (nb) return -1;
      // severity/risk_level: rank-based
      if (key === "severity" || key === "risk_level" || key === "criticality" || key === "priority") {
        const ra = SEVERITY_RANK[va] || 0;
        const rb = SEVERITY_RANK[vb] || 0;
        return (ra - rb) * dir;
      }
      // date-like keys
      if (/(_date|_review|_on|created_at|updated_at)$/.test(key)) {
        return (new Date(va) - new Date(vb)) * dir;
      }
      // user id → display name
      if (isUserKey) {
        const la = (userMap[va] || String(va)).toLowerCase();
        const lb = (userMap[vb] || String(vb)).toLowerCase();
        return la.localeCompare(lb) * dir;
      }
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    return sorted;
  }, [rows, q, statusFilter, reviewTab, isReviews, urlFilters, ownerField, sortBy, sortDir, schema.columns, userMap, params, currentClientId, columnStatusActive, signal, kind]);
  const filtered = table.apply(presetRows);

  const reviewTabCounts = useMemo(() => {
    if (!isReviews) return {};
    const c = Object.fromEntries(REVIEW_TABS.map(t => [t.id, rows.filter(r => reviewMatches(r,t.id)).length]));
    return c;
  }, [rows, isReviews]);

  const allChecked = filtered.length > 0 && filtered.every((r) => checked.has(r[idField]));
  const someChecked = checked.size > 0 && !allChecked;
  function toggleAll() {
    if (allChecked) setChecked(new Set());
    else setChecked(new Set(filtered.map((r) => r[idField])));
  }
  function toggleOne(id) {
    const n = new Set(checked);
    n.has(id) ? n.delete(id) : n.add(id);
    setChecked(n);
  }

  async function markComplete(row) {
    if (!confirm(`Mark "${row.title}" as complete? This will advance the same Review if recurring.`)) return;
    try {
      const { data } = await api.post(`/reviews/${row[idField]}/complete`, { occurrence_id: row.current_occurrence_id || "occ_" + row.review_id });
      toast.success(data.review.status !== "completed" ? "Review completed · next occurrence scheduled" : "Review completed");
      load();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function remove(row) {
    if (!confirm("Delete this record? This action is logged.")) return;
    try { await api.delete(`/${kind}/${row[idField]}`, {data:{expected_updated_at:row.updated_at??null}}); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatError(e)); }
  }

  async function exportCsv() {
    if (PREVIEW_MODE) {
      const { exportDemoCsv } = await import("@/preview/export");
      try { const { data } = await api.get(`/${kind}`, { params: { client_id: currentClientId } }); exportDemoCsv(data, kind); toast.success("Demo CSV downloaded"); } catch(e) { toast.error(formatError(e)); }
      return;
    }
    try {
      const token = localStorage.getItem("grc_token");
      const resp = await fetch(`${API}/export/${kind}?client_id=${encodeURIComponent(currentClientId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error(`Export failed (${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url); toast.success("CSV downloaded");
    } catch (e) { toast.error(e.message || "Export failed"); }
  }

  async function bulk(action, payload) {
    const ids = [...checked];
    if (!ids.length) return;
    try {
      const expected_versions=Object.fromEntries(rows.filter(row=>checked.has(row[idField])).map(row=>[row[idField],row.updated_at??null]));
      const { data } = await api.post("/bulk", { kind, ids, action, payload, expected_versions });
      toast.success(`${data.count} record(s) updated`);
      setChecked(new Set());
      setOwnerPicker(false); setPickedOwner("");
      load();
    } catch (e) { toast.error(formatError(e)); }
  }

  return (
    <div className="register-surface" data-layout={isReviews ? 'reviews' : undefined}>
      <PageHeader
        title={schema.title}
        subtitle={`${currentClient?.name || ""} · ${schema.subtitle}`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={!currentClientId || rows.length === 0}
              data-testid={`export-${kind}-button`}
            >
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            {canWrite && (
              <Button data-testid={`create-${kind}-button`} onClick={() => { setSelected(null); setOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> New {kind === "policies" ? "policy" : kind === "assets" ? "system" : kind.slice(0, -1)}
              </Button>
            )}
          </div>
        }
      />
      {kind==='policies'&&<PolicyPendingDecisions clientId={currentClientId} rows={rows} onOpen={row=>{setSelected(row);setOpen(true);}}/>}
      {kind === "contacts" && isBrawndoReference(currentClientId, user) && <ContactCoverage rows={rows.filter(r => r.client_id === currentClientId)} />}
      {signals.length > 0 && <RegisterSignalBar signals={signals} rows={rows.filter(r => r.client_id === currentClientId)} active={signal?.id} onPick={id => setParam("signal", signal?.id === id ? null : id)} />}
      <div className="sticky top-0 z-20 register-toolbar">
        <div className="register-search relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-help" />
          <Input aria-label={isReviews ? 'Search reviews' : undefined} data-testid={`${kind}-search`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-8 h-9 w-72 text-sm" />
        </div>
        {hasUrlFilters && (
          <div
            className="inline-flex items-center gap-2 px-2.5 h-9 rounded-md border border-semantic-info-border bg-semantic-info-bg text-semantic-info text-xs font-medium"
            data-testid="carried-scope-chip"
          >
            <Filter className="h-3 w-3" />
            <span>{carriedScopeLabel}</span>
            <button
              onClick={() => navigate(location.pathname, { replace: true })}
              aria-label="Clear filter"
              className="ml-1 hover:text-semantic-critical"
              data-testid="clear-carried-scope"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {isReviews ? (
          <div className="quick-filters inline-flex items-center rounded-md border border-line bg-surface-card p-0.5 gap-0.5" data-testid="reviews-tabs">
            {REVIEW_TABS.map((t) => {
              const active = !columnStatusActive && reviewTab === t.id;
              const count = reviewTabCounts[t.id] ?? 0;
              return (
                <button
                  key={t.id}
                  onClick={() => setReviewTab(t.id)}
                  data-testid={`reviews-tab-${t.id}`}
                  aria-pressed={active}
                  className={`px-3 h-8 text-xs rounded-[6px] transition ${active ? "bg-primary text-primary-foreground font-medium" : "text-ink-secondary hover:bg-surface-subtle"}`}
                >
                  {t.label}
                  <span className={`ml-1.5 font-mono text-xs ${active ? "text-ink-onDarkMuted" : "text-ink-help"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        ) : (
          statusOptions.length > 0 && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger aria-label="Filter by status" data-testid={`${kind}-status-filter`} className="w-44 h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                {DEFAULT_STATUS[kind] === "active" && <SelectItem value="active">Active</SelectItem>}
                <SelectItem value="all">All statuses</SelectItem>
                {statusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )
        )}
        {isReviews && <Button variant="link" size="sm" onClick={() => setReviewTab(reviewTab === 'history' ? 'all' : 'history')} data-testid="reviews-history-link">{reviewTab === 'history' ? 'Back to active Reviews' : 'Review history'}</Button>}
        <div className="register-count text-xs text-ink-muted ml-auto font-mono">{filtered.length} / {isReviews ? rows.filter(r => reviewMatches(r,reviewTab === 'history' ? 'history' : 'all')).length : rows.length}</div>
      </div>

      {/* Bulk action bar */}
      {checked.size > 0 && (
        <div className="mx-8 mt-4 rounded-lg border border-brand-charcoal bg-primary text-primary-foreground px-4 py-2.5 flex items-center gap-3" data-testid="bulk-action-bar">
          <div className="text-sm"><span className="font-heading font-semibold text-primary-foreground" data-testid="bulk-selected-count">{checked.size}</span> selected</div>
          <div className="h-4 w-px bg-brand-metallic-3" />
          {canWrite && !isReviews && (
            <button onClick={() => bulk("close")} data-testid="bulk-close" className="inline-flex items-center gap-1 rounded-md border border-brand-metallic-3 bg-brand-metallic hover:bg-brand-metallic-2 px-2.5 h-8 text-xs text-primary-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" /> Close
            </button>
          )}
          {canWrite && (
            <DropdownMenu open={ownerPicker} onOpenChange={setOwnerPicker}>
              <DropdownMenuTrigger asChild>
                <button data-testid="bulk-set-owner" className="inline-flex items-center gap-1 rounded-md border border-brand-metallic-3 bg-brand-metallic hover:bg-brand-metallic-2 px-2.5 h-8 text-xs text-primary-foreground">
                  <UserPlus className="h-3.5 w-3.5" /> Set {ownerField === "assignee_id" ? "assignee" : "owner"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
                <DropdownMenuLabel className="text-xs">Choose a user</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="p-2"><AssigneeSelect clientId={currentClientId} label="Bulk owner" value={null} onChange={v=>bulk("set-owner",{owner_id:v})}/></div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {statusOptions.length > 0 && canWrite && !isReviews && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-testid="bulk-set-status" className="inline-flex items-center gap-1 rounded-md border border-brand-metallic-3 bg-brand-metallic hover:bg-brand-metallic-2 px-2.5 h-8 text-xs text-primary-foreground">
                  <MoreHorizontal className="h-3.5 w-3.5" /> Set status
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {statusOptions.map((o) => (
                  <DropdownMenuItem key={o.value} onClick={() => bulk("set-status", { status: o.value })} data-testid={`bulk-status-${o.value}`} className="text-sm">
                    {o.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canDelete && (
            <button onClick={() => confirm(`Delete ${checked.size} record(s)?`) && bulk("delete")} data-testid="bulk-delete" className="inline-flex items-center gap-1 rounded-md border border-semantic-critical bg-semantic-critical hover:bg-semantic-critical/90 px-2.5 h-8 text-xs text-primary-foreground">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          {canWrite && schema.fields.some((f) => f.name === "due_date") && (
            <DropdownMenu open={dueDatePickerOpen} onOpenChange={(v) => { setDueDatePickerOpen(v); if (v) setPickedDueDate(""); }}>
              <DropdownMenuTrigger asChild>
                <button data-testid="bulk-set-due-date" className="inline-flex items-center gap-1 rounded-md border border-brand-metallic-3 bg-brand-metallic hover:bg-brand-metallic-2 px-2.5 h-8 text-xs text-primary-foreground">
                  <CalendarDays className="h-3.5 w-3.5" /> Set due date
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="p-3 w-64">
                <DropdownMenuLabel className="text-xs px-0 pt-0">Pick a new due date</DropdownMenuLabel>
                <div className="mt-2 space-y-2">
                  <Input type="date" value={pickedDueDate} onChange={(e) => setPickedDueDate(e.target.value)} data-testid="bulk-due-date-input" className="text-sm h-9" />
                  <Button size="sm" className="w-full bg-primary hover:bg-primary/90" disabled={!pickedDueDate} onClick={() => { bulk("set-due-date", { due_date: pickedDueDate }); setDueDatePickerOpen(false); }} data-testid="bulk-due-date-apply">
                    Apply to {checked.size} record(s)
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="ml-auto">
            <button onClick={() => setChecked(new Set())} className="p-1 rounded hover:bg-brand-metallic-2 text-ink-onDarkMuted" data-testid="bulk-clear"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <div className="register-body page-gutter py-6">
        <TableFilterChips table={table} />
        <div className="register-table-frame bg-surface-card border border-line rounded-lg overflow-x-auto" data-layout={isReviews ? 'reviews' : undefined}>
          <table className="w-full">
            {isReviews && <colgroup><col className="register-col-check" />{schema.columns.map(c => <col key={c.key} className={c.primary ? 'register-col-title' : c.user ? 'register-col-owner' : c.date ? 'register-col-date' : `register-col-${c.key}`} />)}<col className="register-col-actions" /></colgroup>}
            <thead>
              <tr>
                <th className="tbl-head w-8">
                  <Checkbox
                    checked={allChecked || (someChecked ? "indeterminate" : false)}
                    onCheckedChange={toggleAll}
                    data-testid={`${kind}-select-all`}
                    aria-label={`Select all ${kind.replaceAll('_',' ')}`}
                  />
                </th>
                {columns.map(c => <th key={c.key} data-column={isReviews ? c.key : undefined} className="tbl-head" aria-sort={table.state.sort?.key === c.key ? (table.state.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}><ColumnControl table={table} column={c} /></th>)}
                {kind === 'contacts' && <th className="tbl-head">Platform access</th>}
                <th className="tbl-head w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <TableLoadingRow colSpan={columnCount} />}
              {!loading && filtered.length === 0 && <tr><td colSpan={columnCount} className="empty-state">{rows.length ? <FilterEmpty table={table} name={kind.replaceAll('_',' ')} onClear={() => { const next = new URLSearchParams(params); ['q','tab','status','owner','unassigned','severity','setup'].forEach(k => next.delete(k)); if (isReviews) next.set('tab','all'); setParams(next,{replace:true}); }} /> : kind === 'contacts' ? <><p>No business contacts yet.</p><p className="mt-1 text-xs text-ink-secondary">Add people and GRC responsibilities for this client. Platform accounts are optional and separate.</p></> : `No ${kind.replaceAll("_", " ")} have been added for this client.`}</td></tr>}
              {!loading && filtered.map((row, i) => {
                const overdueReview = isReviews && isReviewOverdue(row);
                return (
                <tr
                  key={row[idField] || `row-${i}`}
                  className="row-hover cursor-pointer"
                  data-testid={`${kind}-row-${i}`}
                  data-selected={isReviews ? checked.has(row[idField]) : undefined}
                  onClick={() => { setSelected(row); setOpen(true); }}
                >
                  <td className="tbl-cell" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={checked.has(row[idField])}
                      onCheckedChange={() => toggleOne(row[idField])}
                      data-testid={`${kind}-select-${i}`}
                      aria-label={`Select ${row.title || row.name || 'record'}`}
                    />
                  </td>
                  {schema.columns.map((c) => {
                    const isDueLike = c.date && /(_date|_review|_on)$/.test(c.key);
                    const closed = row.status === "completed" || row.status === "cancelled" || row.status === "closed";
                    return (
                    <td key={`${row[idField] || i}-${c.key}`} data-column={isReviews ? c.key : undefined} className={`tbl-cell ${c.primary ? "font-medium text-ink-primary" : ""}`}>
                      {c.badge ? (
                        overdueReview && c.key === "status"
                          ? <StatusBadge value="overdue" testid={`${kind}-status-${i}`} />
                          : row[c.key] ? <StatusBadge value={row[c.key]} tone={isReviews && row[c.key] === 'needs_scheduling' ? 'duesoon' : undefined} testid={`${kind}-status-${i}`} /> : <span className="text-ink-help">—</span>
                      ) :
                       c.user ? (
                         isReviews ? <span className={`register-owner ${row[c.key] ? '' : 'register-owner--unassigned'}`} data-testid={!row[c.key] ? `${kind}-unassigned-${i}` : undefined}>
                           {row[c.key] ? <UserRound aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}<span>{row[c.key] ? userMap[row[c.key]] || row[c.key] : 'Unassigned'}</span>
                         </span> : row[c.key]
                           ? <span className="text-ink-secondary">{userMap[row[c.key]] || row[c.key]}</span>
                           : <span
                               className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-semantic-duesoon-border bg-semantic-duesoon-bg text-semantic-duesoon-text text-xs font-mono uppercase tracking-wider"
                               data-testid={`${kind}-unassigned-${i}`}
                             >Unassigned</span>
                       ) :
                       isReviews && c.key==='basis' ? <span className="text-xs text-ink-secondary" title={basisSummary(row)}>{basisSummary(row)}</span> :
                       isDueLike ? <DueCell iso={row[c.key]} closed={closed} /> :
                       c.date ? (displayDay(row[c.key]) ? <span className="font-mono text-ink-secondary">{displayDay(row[c.key])}</span> : <span className="text-ink-help">—</span>) :
                       (
                         <span className="inline-flex items-center gap-2">
                           {isReviews && c.primary ? <button type="button" className="register-record-link">{row[c.key]}</button>
                             : isReviews && ['review_type','recurrence'].includes(c.key) ? <span className="register-value">{reviewDisplayValue(c.key,row[c.key])}</span>
                             : kind === 'contacts' && c.key === 'role' ? <span className="whitespace-normal">{contactResponsibilities(row)}</span>
                             : c.primary && kind === "policies" && signals.length && policySupports(row) ? <span className="inline-flex flex-col"><span>{row[c.key]}</span><span className="text-xs text-ink-secondary">Supports CIS {policySupports(row)}</span></span>
                             : c.primary && kind === "findings" && row.source ? <span className="inline-flex flex-col"><span>{row[c.key]}</span><span className="text-xs text-ink-secondary" data-testid={`finding-source-${i}`}>From {row.source}</span></span>
                             : <span>{row[c.key] ? optionLabel(schema, c.key, row[c.key]) : <span className="text-ink-help">—</span>}</span>}
                           {c.primary && kind === "findings" && row.risk_id && (
                             <span
                               className="inline-flex items-center px-1.5 py-0 rounded-full border border-semantic-info-border bg-semantic-info-bg text-semantic-info text-xs font-mono uppercase tracking-widest"
                               data-testid={`finding-risk-chip-${i}`}
                               title={`Linked to risk ${row.risk_id}`}
                             >
                               → Risk
                             </span>
                           )}
                         </span>
                       )}
                    </td>
                  );
                  })}
                  {kind === 'contacts' && <td className="tbl-cell"><ContactAccessStatus contact={row} clientId={currentClientId} context={contactAccessContext} /></td>}
                  <td className="tbl-cell text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          data-testid={`${kind}-row-menu-${i}`}
                          className="p-1 rounded hover:bg-surface-subtle text-ink-help"
                          aria-label="Row actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => { setSelected(row); setOpen(true); }}
                          data-testid={`${kind}-row-open-${i}`}
                          className="text-sm"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Open / edit
                        </DropdownMenuItem>
                        {isReviews && canWrite && row.status !== "completed" && row.status !== "cancelled" && (
                          <DropdownMenuItem
                            onClick={() => markComplete(row)}
                            data-testid={`${kind}-row-complete-${i}`}
                            className="text-sm"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Mark complete
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => remove(row)}
                              data-testid={`${kind}-delete-${i}`}
                              className="text-sm text-semantic-critical focus:text-semantic-critical"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                              {isReviews && <span className="ml-auto text-xs font-mono text-ink-help">admin</span>}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <RecordDrawer
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        record={selected}
        schema={schema.fields}
        clientId={currentClientId}
        users={users}
        onSaved={load}
      />
    </div>
  );
}
