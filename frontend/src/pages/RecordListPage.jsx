import { useEffect, useMemo, useState } from "react";
import api, { formatError, API } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
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
import { Plus, Search, Trash2, Download, MoreHorizontal, CheckCircle2, UserPlus, X, CalendarDays, MoreVertical, Pencil } from "lucide-react";
import { toast } from "sonner";

const ID_FIELD = {
  reviews: "review_id", findings: "finding_id", risks: "risk_id", policies: "policy_id",
  vendors: "vendor_id", assets: "asset_id", tasks: "task_id", exceptions: "exception_id",
};

// Tab definitions for reviews — order matters (displayed as segmented control)
const REVIEW_TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "overdue", label: "Overdue" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "all", label: "All" },
];

// Reviews are the historical record — delete is admin-only from the ... menu.
function isReviewOverdue(row) {
  if (!row?.due_date) return false;
  if (row.status === "completed" || row.status === "cancelled") return false;
  return new Date(row.due_date).getTime() < Date.now();
}

export default function RecordListPage({ kind }) {
  const schema = SCHEMAS[kind];
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewTab, setReviewTab] = useState("upcoming");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState(new Set());
  const [ownerPicker, setOwnerPicker] = useState(false);
  const [pickedOwner, setPickedOwner] = useState("");
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false);
  const [pickedDueDate, setPickedDueDate] = useState("");

  const canWrite = ["super_admin", "platform_admin", "client_contributor"].includes(user?.role);
  const canDelete = ["super_admin", "platform_admin"].includes(user?.role);
  const idField = ID_FIELD[kind];
  const ownerField = kind === "tasks" ? "assignee_id" : "owner_id";
  const isReviews = kind === "reviews";
  const userMap = useMemo(() => {
    const m = {};
    users.forEach((u) => { m[u.user_id] = u.name || u.email; });
    return m;
  }, [users]);

  const load = async () => {
    if (!currentClientId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/${kind}`, { params: { client_id: currentClientId } });
      setRows(data);
      setChecked(new Set());
    } catch (e) { toast.error(formatError(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind, currentClientId]);
  useEffect(() => {
    (async () => {
      try { const { data } = await api.get("/users"); setUsers(data); }
      catch { setUsers([]); }
    })();
  }, []);

  const statusOptions = useMemo(() => schema.fields.find((x) => x.name === "status")?.options || [], [schema]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (isReviews) {
        const overdue = isReviewOverdue(r);
        if (reviewTab === "upcoming") {
          if (r.status !== "upcoming") return false;
          if (overdue) return false; // overdue upcoming go to Overdue tab
        } else if (reviewTab === "overdue") {
          if (!overdue) return false;
        } else if (reviewTab === "in_progress") {
          if (r.status !== "in_progress") return false;
        } else if (reviewTab === "completed") {
          if (r.status !== "completed" && r.status !== "cancelled") return false;
        }
      } else if (statusFilter !== "all" && r.status && r.status !== statusFilter) {
        return false;
      }
      if (!s) return true;
      return JSON.stringify(r).toLowerCase().includes(s);
    });
  }, [rows, q, statusFilter, reviewTab, isReviews]);

  const reviewTabCounts = useMemo(() => {
    if (!isReviews) return {};
    const c = { upcoming: 0, overdue: 0, in_progress: 0, completed: 0, all: rows.length };
    rows.forEach((r) => {
      const overdue = isReviewOverdue(r);
      if (overdue) c.overdue += 1;
      if (r.status === "upcoming" && !overdue) c.upcoming += 1;
      if (r.status === "in_progress") c.in_progress += 1;
      if (r.status === "completed" || r.status === "cancelled") c.completed += 1;
    });
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
    if (!confirm(`Mark "${row.title}" as complete? This will spawn the next occurrence if recurring.`)) return;
    try {
      const { data } = await api.post(`/reviews/${row[idField]}/complete`, { spawn_next: true });
      toast.success(data.spawned ? "Review completed · next occurrence scheduled" : "Review completed");
      load();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function remove(row) {
    if (!confirm("Delete this record? This action is logged.")) return;
    try { await api.delete(`/${kind}/${row[idField]}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatError(e)); }
  }

  async function exportCsv() {
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
      const { data } = await api.post("/bulk", { kind, ids, action, payload });
      toast.success(`${data.count} record(s) updated`);
      setChecked(new Set());
      setOwnerPicker(false); setPickedOwner("");
      load();
    } catch (e) { toast.error(formatError(e)); }
  }

  return (
    <div>
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
                <Plus className="h-4 w-4 mr-1" /> New {kind.slice(0, -1)}
              </Button>
            )}
          </div>
        }
      />
      <div className="px-8 py-4 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/60">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input data-testid={`${kind}-search`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-8 h-9 w-72 text-sm" />
        </div>
        {isReviews ? (
          <div className="inline-flex items-center rounded-md border border-line bg-surface-card p-0.5 gap-0.5" data-testid="reviews-tabs">
            {REVIEW_TABS.map((t) => {
              const active = reviewTab === t.id;
              const count = reviewTabCounts[t.id] ?? 0;
              return (
                <button
                  key={t.id}
                  onClick={() => setReviewTab(t.id)}
                  data-testid={`reviews-tab-${t.id}`}
                  className={`px-3 h-8 text-xs rounded-[6px] transition ${active ? "bg-brand-charcoal text-ink-onDark font-medium" : "text-ink-secondary hover:bg-surface-subtle"}`}
                >
                  {t.label}
                  <span className={`ml-1.5 font-mono text-[10px] ${active ? "text-ink-onDarkMuted" : "text-ink-help"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        ) : (
          statusOptions.length > 0 && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid={`${kind}-status-filter`} className="w-44 h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )
        )}
        <div className="text-xs text-slate-500 ml-auto font-mono">{filtered.length} / {rows.length}</div>
      </div>

      {/* Bulk action bar */}
      {checked.size > 0 && (
        <div className="mx-8 mt-4 rounded-lg border border-brand-charcoal bg-brand-charcoal text-ink-onDark px-4 py-2.5 flex items-center gap-3" data-testid="bulk-action-bar">
          <div className="text-sm"><span className="font-heading font-semibold text-ink-onDark" data-testid="bulk-selected-count">{checked.size}</span> selected</div>
          <div className="h-4 w-px bg-brand-metallic-3" />
          {canWrite && (
            <button onClick={() => bulk("close")} data-testid="bulk-close" className="inline-flex items-center gap-1 rounded-md border border-brand-metallic-3 bg-brand-metallic hover:bg-brand-metallic-2 px-2.5 h-8 text-xs text-ink-onDark">
              <CheckCircle2 className="h-3.5 w-3.5" /> Close
            </button>
          )}
          {canWrite && (
            <DropdownMenu open={ownerPicker} onOpenChange={setOwnerPicker}>
              <DropdownMenuTrigger asChild>
                <button data-testid="bulk-set-owner" className="inline-flex items-center gap-1 rounded-md border border-brand-metallic-3 bg-brand-metallic hover:bg-brand-metallic-2 px-2.5 h-8 text-xs text-ink-onDark">
                  <UserPlus className="h-3.5 w-3.5" /> Set {ownerField === "assignee_id" ? "assignee" : "owner"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
                <DropdownMenuLabel className="text-xs">Choose a user</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => bulk("set-owner", { owner_id: null })} className="text-sm">Unassigned</DropdownMenuItem>
                {users.map((u) => (
                  <DropdownMenuItem
                    key={u.user_id}
                    onClick={() => bulk("set-owner", { owner_id: u.user_id })}
                    data-testid={`bulk-owner-${u.user_id}`}
                    className="text-sm"
                  >
                    {u.name || u.email}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {statusOptions.length > 0 && canWrite && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-testid="bulk-set-status" className="inline-flex items-center gap-1 rounded-md border border-brand-metallic-3 bg-brand-metallic hover:bg-brand-metallic-2 px-2.5 h-8 text-xs text-ink-onDark">
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
            <button onClick={() => confirm(`Delete ${checked.size} record(s)?`) && bulk("delete")} data-testid="bulk-delete" className="inline-flex items-center gap-1 rounded-md border border-semantic-critical bg-semantic-critical hover:bg-semantic-critical/90 px-2.5 h-8 text-xs text-white">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          {canWrite && schema.fields.some((f) => f.name === "due_date") && (
            <DropdownMenu open={dueDatePickerOpen} onOpenChange={(v) => { setDueDatePickerOpen(v); if (v) setPickedDueDate(""); }}>
              <DropdownMenuTrigger asChild>
                <button data-testid="bulk-set-due-date" className="inline-flex items-center gap-1 rounded-md border border-brand-metallic-3 bg-brand-metallic hover:bg-brand-metallic-2 px-2.5 h-8 text-xs text-ink-onDark">
                  <CalendarDays className="h-3.5 w-3.5" /> Set due date
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="p-3 w-64">
                <DropdownMenuLabel className="text-xs px-0 pt-0">Pick a new due date</DropdownMenuLabel>
                <div className="mt-2 space-y-2">
                  <Input type="date" value={pickedDueDate} onChange={(e) => setPickedDueDate(e.target.value)} data-testid="bulk-due-date-input" className="text-sm h-9" />
                  <Button size="sm" className="w-full bg-brand-charcoal hover:bg-brand-charcoal-hover" disabled={!pickedDueDate} onClick={() => { bulk("set-due-date", { due_date: pickedDueDate }); setDueDatePickerOpen(false); }} data-testid="bulk-due-date-apply">
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

      <div className="px-8 py-6">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="tbl-head w-8">
                  <Checkbox
                    checked={allChecked || (someChecked ? "indeterminate" : false)}
                    onCheckedChange={toggleAll}
                    data-testid={`${kind}-select-all`}
                  />
                </th>
                {schema.columns.map((c) => <th key={c.key} className="tbl-head">{c.label}</th>)}
                <th className="tbl-head w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={schema.columns.length + 2} className="tbl-cell text-center py-8 text-slate-400">Loading…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={schema.columns.length + 2} className="tbl-cell text-center py-8 text-slate-400">No records.</td></tr>}
              {!loading && filtered.map((row, i) => {
                const overdueReview = isReviews && isReviewOverdue(row);
                return (
                <tr
                  key={row[idField] || `row-${i}`}
                  className="row-hover cursor-pointer"
                  data-testid={`${kind}-row-${i}`}
                  onClick={() => { setSelected(row); setOpen(true); }}
                >
                  <td className="tbl-cell" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={checked.has(row[idField])}
                      onCheckedChange={() => toggleOne(row[idField])}
                      data-testid={`${kind}-select-${i}`}
                    />
                  </td>
                  {schema.columns.map((c) => (
                    <td key={`${row[idField] || i}-${c.key}`} className={`tbl-cell ${c.primary ? "font-medium text-slate-900" : ""}`}>
                      {c.badge ? (
                        overdueReview && c.key === "status"
                          ? <StatusBadge value="overdue" testid={`${kind}-status-${i}`} />
                          : <StatusBadge value={row[c.key]} testid={`${kind}-status-${i}`} />
                      ) :
                       c.user ? (row[c.key] ? <span className="text-slate-700">{userMap[row[c.key]] || row[c.key]}</span> : <span className="text-slate-300">—</span>) :
                       c.date ? (row[c.key] ? <span className="font-mono text-slate-600">{new Date(row[c.key]).toLocaleDateString()}</span> : <span className="text-slate-300">—</span>) :
                       (row[c.key] || <span className="text-slate-300">—</span>)}
                    </td>
                  ))}
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
                              {isReviews && <span className="ml-auto text-[10px] font-mono text-ink-help">admin</span>}
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
