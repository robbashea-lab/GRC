import { useTableControls, ColumnControl, TableFilterChips, FilterEmpty } from '@/components/TableControls';
import { tableColumns } from '@/lib/tableColumns';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import api, { formatError } from "@/lib/api";
import { ACTION_VIEWS, actionMatches, actionOrder, actionStatus, daysDue, taskSource } from "@/lib/actionItems";
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

// Only authoritative Task records are displayed here.
const VIEWS = ACTION_VIEWS.map(id => ({id, label: id === "all" ? "All" : id === "overdue" ? "Overdue" : id === "completed" ? "Completed" : actionStatus(id)}));

const PRIORITY_TONE = {
  immediate: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border",
  critical: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border",
  high: "bg-semantic-duesoon-bg text-semantic-duesoon-text border-semantic-duesoon-border",
  medium: "bg-semantic-info-bg text-semantic-info border-semantic-info-border",
  moderate: "bg-semantic-info-bg text-semantic-info border-semantic-info-border",
  low: "bg-surface-subtle text-ink-secondary border-line",
};

const closedTask = ["done", "cancelled"];

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
  const location = useLocation();
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const view = (ACTION_VIEWS.includes(params.get("view")) ? params.get("view") : "all");
  const sort = params.get("sort") || "operational";
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
      const [tasks, findings, reviews, risks, vendors, policies, assessments, u] = await Promise.all([
        api.get("/tasks", { params: { client_id: currentClientId } }).then((r) => r.data),
        api.get("/findings", { params: { client_id: currentClientId } }).then((r) => r.data),
        api.get("/reviews", { params: { client_id: currentClientId } }).then((r) => r.data),
        ...["risks","vendors","policies"].map(kind => api.get(`/${kind}`, { params: { client_id: currentClientId } }).then(r=>r.data)),
        api.get("/onboarding/state",{params:{client_id:currentClientId}}).then(r=>r.data.assessments||[]),
        api.get(`/clients/${currentClientId}/members`).then((r) => r.data),
      ]);
      if (sequence !== loadSequence.current) return;
      setUsers(u || []);

      const sources = {findings,reviews,risks,vendors,policies,assessments};
      const items = tasks.map(t => {
        const source = taskSource(t,sources);
        return {...t,_kind:"task",id:t.task_id,raw:t,owner_id:t.assignee_id ?? t.owner_id,
          priority:t.priority||"medium",status:t.status||"open",source:source.label,source_type:source.type,sourceRecord:source,closed:closedTask};
      });
      setRows(items);
    } catch (e) { if (sequence === loadSequence.current) { setRows([]); toast.error(formatError(e)); } }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [currentClientId]);

  useEffect(() => { const sequence = loadSequence; setRows([]); setDrawer({ open: false, kind: null, record: null }); load(); return () => { sequence.current++; }; }, [load, location.pathname]);

  const presetRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.raw.client_id !== currentClientId || !actionMatches(r,view)) return false;
      if (!s) return true;
      return (r.title || "").toLowerCase().includes(s)
        || (r.description || "").toLowerCase().includes(s)
        || [r.review_id,r.finding_id,r.risk_id,r.vendor_id,r.policy_id].some(id=>id?.toLowerCase().includes(s))
        || (r.id || "").toLowerCase().includes(s)
        || (r.source || "").toLowerCase().includes(s)
        || (userMap[r.owner_id] || "").toLowerCase().includes(s);
    }).sort((a,b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "priority" ? ({critical:4,high:3,medium:2,low:1}[b.priority] || 0) - ({critical:4,high:3,medium:2,low:1}[a.priority] || 0) : sort === "due" ? (a.due_date || "9999").localeCompare(b.due_date || "9999") : actionOrder(a,b));
  }, [rows, view, q, userMap, currentClientId, sort]);

  const tableSource = rows.filter(r => r.raw.client_id === currentClientId);
  const columns = tableColumns('action-items', { rows: tableSource, users,  });
  const table = useTableControls({ columns, rows: tableSource, module: 'action-items', scope: `${user?.user_id}:${currentClientId}`, onFilterChange: key => { if (key === 'status') setView('all'); } });
  const carriedClient = useRef(currentClientId);
  const carriedOwner = params.get("owner"), carriedUnassigned = params.get("unassigned");
  useEffect(() => {
    if (carriedClient.current !== currentClientId) {
      carriedClient.current=currentClientId;
      const next=new URLSearchParams(params);next.delete("owner");next.delete("unassigned");setParams(next,{replace:true});return;
    }
    if (carriedUnassigned==="1") table.setFilter("owner_id",["__empty__"]);
    else if (carriedOwner) table.setFilter("owner_id",[carriedOwner==="__me__"?user.user_id:carriedOwner]);
    // URL scope feeds the same shared owner filter; tenant changes discard it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[currentClientId,carriedOwner,carriedUnassigned]);
  const filtered = table.apply(presetRows);

  const counts = Object.fromEntries(ACTION_VIEWS.map(v=>[v,tableSource.filter(r=>actionMatches(r,v)).length]));

  function open(row) {
    setDrawer({ open: true, kind: "tasks", record: row.raw });
  }

  return (
    <div>
      <PageHeader
        title="Action Items"
        subtitle={`${currentClient?.name || ""} · Remediation and operational work.`}
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
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action items…" className="pl-8 h-9 w-72 text-sm" data-testid="ai-search" />
        </div>
        <div className="inline-flex items-center rounded-md border border-line bg-surface-card p-0.5 gap-0.5" data-testid="ai-views">
          {VIEWS.map((v) => {
            const active = view === v.id;
            const n = counts[v.id] || 0;
            return (
              <button
                key={v.id}
                onClick={() => { const key = v.id === 'overdue' ? 'due_date' : 'status'; if (key) table.setFilter(key, []); setView(v.id); }}
                data-testid={`ai-view-${v.id}`}
                className={`px-3 h-8 text-xs rounded-[6px] transition ${active ? "bg-brand-charcoal text-ink-onDark font-medium" : "text-ink-secondary hover:bg-surface-subtle"}`}
              >
                {v.label}
                <span className={`ml-1.5 font-mono text-[10px] ${active ? "text-ink-onDarkMuted" : "text-ink-help"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <Select value={sort} onValueChange={v => { table.setSort(null); setParam("sort", v); }}><SelectTrigger className="w-40" aria-label="Sort actions"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="operational">Operational order</SelectItem><SelectItem value="due">Due date</SelectItem><SelectItem value="priority">Priority</SelectItem><SelectItem value="title">Title</SelectItem></SelectContent></Select>
        <div className="text-xs text-slate-500 ml-auto font-mono">{filtered.length} / {rows.length}</div>
      </div>

      <div className="p-8">
        <TableFilterChips table={table} />
        <div className="bg-surface-card border border-line rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-[11px] font-mono uppercase tracking-widest text-ink-secondary border-b border-line">
              <tr>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="title" /></th>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="priority" /></th>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="owner_id" /></th>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="due_date" /></th>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="status" /></th>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="source_type" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={6} className="tbl-cell text-center text-ink-help py-10">Loading…</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="tbl-cell text-center text-ink-help py-10"><FilterEmpty table={table} name="action items" onClear={() => { const next=new URLSearchParams(params);next.delete('q');next.set('view','all');setParams(next,{replace:true}); }} /></td></tr>
              )}
              {!loading && filtered.map((r, i) => {
                const overdue = isOverdue(r.due_date, r.status, r.closed);
                const tone = PRIORITY_TONE[(r.priority || "").toLowerCase()] || PRIORITY_TONE.medium;
                return (
                  <tr key={`${r._kind}-${r.id}`} className="row-hover cursor-pointer" onClick={() => open(r)} data-testid={`ai-row-${i}`}>
                    <td className="tbl-cell font-medium text-ink-primary">
                      <button type="button" className="text-left hover:underline focus-visible:underline" onClick={e => { e.stopPropagation(); open(r); }}>{r.title}</button>
                    </td>
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
                          {overdue && <span className="block text-xs">{Math.abs(daysDue(r))} days overdue</span>}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="tbl-cell">
                      <span className="pill pill-neutral">
                        {actionStatus(r.status)}
                      </span>
                    </td>
                    <td className="tbl-cell text-xs text-ink-help">{r.sourceRecord.target && SCHEMAS[r.sourceRecord.kind] ? <button className="text-left hover:underline" onClick={e=>{e.stopPropagation();setDrawer({open:true,kind:r.sourceRecord.kind,record:r.sourceRecord.target});}}>{r.source}</button> : r.source}</td>
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
