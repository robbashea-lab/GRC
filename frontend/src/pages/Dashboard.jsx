import { useEffect, useState } from "react";
import api, { API, formatError } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { AlertOctagon, ShieldAlert, Clock, CalendarClock, FileDown, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import DashboardScopeSelector from "@/components/DashboardScopeSelector";
import RecordDrawer from "@/components/RecordDrawer";
import { SCHEMAS } from "@/lib/schemas";
import { loadClientDashboard } from "@/lib/loadClientDashboard";
import { calendarDay } from "@/lib/clientDashboard";

// Attach owner / unassigned + optional extra filters so click-through from a scoped dashboard preserves context.
function withScopeParams(path, scope, extras = {}) {
  const params = new URLSearchParams();
  if (scope && scope.kind === "unassigned") params.set("unassigned", "1");
  else if (scope && (scope.kind === "mine" || scope.kind === "user")) {
    params.set("owner", scope.user_id || "__me__");
  }
  Object.entries(extras || {}).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params.toString() ? `${path}?${params.toString()}` : path;
}

function KpiCard({ label, value, hint, icon: Icon, tone = "neutral", testid, to }) {
  const rails = { critical: "before:bg-semantic-critical", duesoon: "before:bg-semantic-duesoon", high: "before:bg-semantic-critical", info: "before:bg-semantic-info", neutral: "before:bg-line" };
  const iconTones = {
    critical: "text-semantic-critical bg-semantic-critical-bg border-semantic-critical-border",
    high: "text-semantic-critical bg-semantic-critical-bg border-semantic-critical-border",
    duesoon: "text-semantic-duesoon-text bg-semantic-duesoon-bg border-semantic-duesoon-border",
    info: "text-semantic-info bg-semantic-info-bg border-semantic-info-border",
    neutral: "text-ink-secondary bg-surface-subtle border-line",
  };
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-mono uppercase tracking-widest text-ink-secondary">{label}</div>
        <div className={`h-8 w-8 rounded-md border flex items-center justify-center ${iconTones[tone] || iconTones.neutral}`}><Icon className="h-4 w-4" /></div>
      </div>
      <div className="text-3xl font-heading font-semibold tracking-tight text-ink-primary">{value}</div>
      <div className="text-xs text-ink-muted">{hint}</div>
    </>
  );
  const cls = `relative bg-surface-card border border-line rounded-lg p-4 flex flex-col gap-2 hover:border-line-strong transition
    before:content-[''] before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r ${rails[tone] || rails.neutral}`;
  return to ? (
    <Link to={to} data-testid={testid} className={cls}>{inner}</Link>
  ) : (
    <div data-testid={testid} className={cls}>{inner}</div>
  );
}

function Panel({ title, subtitle, icon: Icon, action, children, testid }) {
  return (
    <section data-testid={testid} className="bg-surface-card border border-line rounded-lg overflow-hidden">
      <header className="px-5 py-3.5 border-b border-line flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-heading font-semibold text-ink-primary flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-ink-secondary" />} {title}
          </div>
          {subtitle && <div className="text-[11px] text-ink-muted mt-0.5">{subtitle}</div>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <div className="px-5 py-6 text-center text-sm text-ink-muted">{children}</div>;
}

function OperationalTable({ items, upcoming = false, onOpen }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-subtle border-b border-line"><tr>
          <th className="tbl-head">{upcoming ? "Due / Review Date" : "Priority"}</th>
          <th className="tbl-head">Item</th><th className="tbl-head">Type</th>
          <th className="tbl-head">Owner</th>
          {!upcoming && <th className="tbl-head">Due</th>}
          <th className="tbl-head">Status</th><th className="tbl-head">Action</th>
        </tr></thead>
        <tbody className="divide-y divide-line">
          {items.map(item => (
            <tr key={item.key} className="row-hover" data-testid={`obligation-${item.key}`}>
              <td className="tbl-cell text-xs">{upcoming ? <DateCell iso={item.due_date} /> : item.priority_label}</td>
              <td className="tbl-cell font-medium text-ink-primary">{item.title}</td>
              <td className="tbl-cell text-xs text-ink-secondary">{item.type}</td>
              <td className="tbl-cell text-xs text-ink-secondary">{item.owner}</td>
              {!upcoming && <td className="tbl-cell"><DateCell iso={item.due_date} /></td>}
              <td className="tbl-cell">{item.status ? <StatusBadge value={item.status} /> : "—"}</td>
              <td className="tbl-cell"><button type="button" onClick={() => onOpen(item)} className="text-xs text-link hover:text-link-hover whitespace-nowrap">{item.action}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DateCell({ iso }) {
  const day = calendarDay(iso);
  if (day == null) return <span className="text-ink-disabled">—</span>;
  const date = new Date(day * 86400000);
  return <span className="font-mono text-xs text-ink-secondary">{date.toLocaleDateString(undefined, { timeZone: "UTC" })}</span>;
}

export default function Dashboard() {
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  // Default scope per role: client contributors → their own work; everyone else → the org view.
  const [scope, setScope] = useState(() => (
    user?.role === "client_contributor" ? { kind: "mine" } : { kind: "org" }
  ));

  const requestKey = JSON.stringify([currentClientId, scope, user?.user_id, revision]);
  useEffect(() => {
    if (!currentClientId) return;
    const controller = new AbortController();
    setError(null);
    setSelected(null);
    loadClientDashboard(api, { clientId: currentClientId, user, scope, signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setSnapshot({ key: requestKey, result }); })
      .catch(err => { if (!controller.signal.aborted) setError({ key: requestKey, message: formatError(err) }); });
    return () => controller.abort();
  }, [currentClientId, scope, user, requestKey]);

  // Never render the previous tenant's response while a new request is loading.
  const data = snapshot?.key === requestKey ? snapshot.result : null;
  if (!currentClientId) return <div className="p-8 text-sm text-ink-muted">Select a client to view its GRC program.</div>;
  if (error?.key === requestKey) return <div className="p-8 space-y-3" role="alert"><p>{error.message}</p><Button variant="outline" onClick={() => setRevision(n => n + 1)}>Retry dashboard</Button></div>;
  if (!data) return <div className="p-8 text-sm text-ink-muted">Loading dashboard…</div>;

  const clientSubtitle = scope.kind === "org"
    ? `${currentClient?.name || "All clients"} · Current GRC program status, priorities, and upcoming activity`
    : `${currentClient?.name || "All clients"} · ${data.scope_label || ""}`;

  async function downloadBoardReport() {
    try {
      const token = localStorage.getItem("grc_token");
      // Board Report always reflects the entire organization, never a person filter.
      const resp = await fetch(`${API}/reports/board?client_id=${encodeURIComponent(currentClientId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!resp.ok) throw new Error(`Report failed (${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `board-report-${(currentClient?.name || "client").replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("Board report downloaded (organization-wide)");
    } catch (e) { toast.error(e.message || "Report failed"); }
  }

  return (
    <div>
      <PageHeader
        title="GRC Program Overview"
        subtitle={clientSubtitle}
        action={
          <div className="flex items-center gap-2">
            <DashboardScopeSelector clientId={currentClientId} value={scope} onChange={setScope} />
            <Button variant="outline" onClick={downloadBoardReport} data-testid="download-board-report">
              <FileDown className="h-4 w-4 mr-1" /> Board Report PDF
            </Button>
          </div>
        }
      />

      {scope.kind !== "org" && (
        <div className="px-8 pt-4">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-semantic-info-border bg-semantic-info-bg text-semantic-info text-xs font-medium"
            data-testid="active-scope-chip"
          >
            <span className="text-[10px] font-mono uppercase tracking-widest">Viewing</span>
            <span className="text-ink-help">·</span>
            <span>{data.scope_label || "Filtered"}</span>
            <button
              onClick={() => setScope({ kind: "org" })}
              className="ml-1 hover:text-semantic-critical"
              aria-label="Clear dashboard scope"
              data-testid="clear-scope"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div className="p-8 space-y-6">
        {/* Row 1 — Priority summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard testid="kpi-overdue" to={withScopeParams("/reviews", scope)} label="Overdue Actions" value={data.kpis.overdue_actions} hint="Past due and still requiring action" icon={Clock} tone="critical" />
          <KpiCard testid="kpi-critical" to={withScopeParams("/findings", scope, { severity: "critical,high", status: "open" })} label="Critical / High Findings" value={data.kpis.critical_high_findings} hint="Highest-priority findings requiring attention" icon={AlertOctagon} tone="critical" />
          <KpiCard testid="kpi-risks" to={withScopeParams("/risks", scope)} label="Significant Risks" value={data.kpis.significant_risks} hint="Open risks requiring continued attention" icon={ShieldAlert} tone="high" />
          <KpiCard testid="kpi-due-30" to={scope.kind !== "org" ? withScopeParams("/tasks", scope) : "/calendar"} label="Due in Next 30 Days" value={data.kpis.due_next_30} hint="Upcoming reviews and actions" icon={CalendarClock} tone="duesoon" />
        </div>

        <Panel testid="panel-needs-attention" title="Needs Attention"
          subtitle="Highest-priority GRC items requiring action or a decision.">
          {data.attention.length ? <OperationalTable items={data.attention} onOpen={setSelected} />
            : <Empty>No items require immediate attention right now.</Empty>}
        </Panel>
        <Panel testid="panel-watch" title="Upcoming & Watch Items"
          subtitle="Upcoming GRC activity, reviews, deadlines, and items to keep on the radar."
          action={<span className="text-xs text-ink-help whitespace-nowrap">Next 90 Days</span>}>
          {data.upcoming.length ? <OperationalTable items={data.upcoming} upcoming onOpen={setSelected} />
            : <Empty>No material upcoming GRC items are currently scheduled.</Empty>}
        </Panel>
      </div>
      {selected && selected.record.client_id === currentClientId && (
        <RecordDrawer key={selected.key} open onOpenChange={open => { if (!open) setSelected(null); }}
          kind={selected.kind} record={selected.record} schema={SCHEMAS[selected.kind]?.fields}
          clientId={currentClientId} users={data.members}
          onSaved={() => { setSelected(null); setRevision(n => n + 1); }} />
      )}
    </div>
  );
}
