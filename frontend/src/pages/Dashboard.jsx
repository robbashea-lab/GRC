import { useEffect, useState } from "react";
import api, { API } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import StatusBadge, { toneFor } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { AlertOctagon, ShieldAlert, Clock, CalendarClock, FileDown, ArrowUpRight, Activity, ListTodo, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const KIND_ROUTE = {
  review: "/reviews", finding: "/findings", risk: "/risks", policy: "/policies",
  vendor: "/vendors", asset: "/assets", task: "/tasks", exception: "/exceptions",
};

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

function SeeAll({ to, testid }) {
  return (
    <Link to={to} data-testid={testid} className="text-xs text-link hover:text-link-hover flex items-center gap-1 whitespace-nowrap">
      See all <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}

function DateCell({ iso }) {
  if (!iso) return <span className="text-ink-disabled">—</span>;
  const d = new Date(iso);
  const overdue = d < new Date();
  return <span className={`font-mono text-xs ${overdue ? "text-semantic-critical" : "text-ink-secondary"}`}>{d.toLocaleDateString()}</span>;
}

export default function Dashboard() {
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!currentClientId) return;
    (async () => {
      const { data } = await api.get("/dashboard", { params: { client_id: currentClientId } });
      setData(data);
    })();
  }, [currentClientId]);

  if (!data) return <div className="p-8 text-sm text-ink-muted">Loading dashboard…</div>;

  const isClient = ["client_contributor", "client_readonly"].includes(user?.role);
  const actionsTitle = isClient ? "Your Actions" : "Client Actions";

  async function downloadBoardReport() {
    try {
      const token = localStorage.getItem("grc_token");
      const resp = await fetch(`${API}/reports/board?client_id=${encodeURIComponent(currentClientId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!resp.ok) throw new Error(`Report failed (${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `board-report-${(currentClient?.name || "client").replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("Board report downloaded");
    } catch (e) { toast.error(e.message || "Report failed"); }
  }

  return (
    <div>
      <PageHeader
        title="GRC Program Overview"
        subtitle={`${currentClient?.name || "All clients"} · Current GRC program status, priorities, and upcoming activity`}
        action={
          <Button variant="outline" onClick={downloadBoardReport} data-testid="download-board-report">
            <FileDown className="h-4 w-4 mr-1" /> Board Report PDF
          </Button>
        }
      />

      <div className="p-8 space-y-6">
        {/* Row 1 — Priority summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard testid="kpi-overdue" to="/reviews" label="Overdue Actions" value={data.kpis.overdue_actions} hint="Past due and still requiring action" icon={Clock} tone="critical" />
          <KpiCard testid="kpi-critical" to="/findings" label="Critical / High Findings" value={data.kpis.critical_high_findings} hint="Highest-priority findings requiring attention" icon={AlertOctagon} tone="critical" />
          <KpiCard testid="kpi-risks" to="/risks" label="Significant Risks" value={data.kpis.significant_risks} hint="Open risks requiring continued attention" icon={ShieldAlert} tone="high" />
          <KpiCard testid="kpi-due-30" to="/calendar" label="Due in Next 30 Days" value={data.kpis.due_next_30} hint="Upcoming reviews and actions" icon={CalendarClock} tone="duesoon" />
        </div>

        {/* Row 2 — Needs Your Attention */}
        <Panel
          testid="panel-needs-attention"
          title="Needs Your Attention"
          subtitle="Highest-priority items requiring action or a decision"
          icon={AlertOctagon}
        >
          {data.needs_attention.length === 0 ? (
            <Empty>No priority actions require attention right now.</Empty>
          ) : (
            <table className="w-full">
              <thead><tr>
                <th className="tbl-head">Priority</th>
                <th className="tbl-head">Item</th>
                <th className="tbl-head">Type</th>
                <th className="tbl-head">Due</th>
                <th className="tbl-head">Status</th>
                <th className="tbl-head w-24">Action</th>
              </tr></thead>
              <tbody>
                {data.needs_attention.map((it, i) => (
                  <tr key={`${it.kind}-${it.id}`} className="row-hover" data-testid={`needs-row-${i}`}>
                    <td className="tbl-cell"><StatusBadge value={it.severity || it.priority_tone || "high"} tone={it.priority_tone} /></td>
                    <td className="tbl-cell font-medium text-ink-primary max-w-md truncate">{it.title}</td>
                    <td className="tbl-cell text-ink-secondary capitalize">{it.kind}</td>
                    <td className="tbl-cell"><DateCell iso={it.due_date} /></td>
                    <td className="tbl-cell">{it.status && <StatusBadge value={it.status} />}</td>
                    <td className="tbl-cell"><Link to={KIND_ROUTE[it.kind] || "/"} className="text-link hover:text-link-hover text-xs">{it.action || "View"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* Row 3 — Upcoming reviews + Priority findings */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Panel testid="panel-upcoming" title="Upcoming Reviews" subtitle="Next 30 days" icon={CalendarClock} action={<SeeAll to="/reviews" testid="see-all-reviews" />}>
            {data.upcoming_reviews.length === 0 ? <Empty>No reviews scheduled in the next 30 days.</Empty> : (
              <table className="w-full">
                <thead><tr>
                  <th className="tbl-head">Review</th>
                  <th className="tbl-head">Type</th>
                  <th className="tbl-head">Due</th>
                  <th className="tbl-head">Status</th>
                </tr></thead>
                <tbody>
                  {data.upcoming_reviews.map((r) => (
                    <tr key={r.id} className="row-hover">
                      <td className="tbl-cell font-medium text-ink-primary">{r.title}</td>
                      <td className="tbl-cell text-ink-secondary">{r.review_type}</td>
                      <td className="tbl-cell"><DateCell iso={r.due_date} /></td>
                      <td className="tbl-cell"><StatusBadge value={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="lg:col-span-3" />
          </Panel>

          <div className="lg:col-span-2 flex flex-col">
            <Panel testid="panel-priority-findings" title="Priority Findings" subtitle="Critical, high, overdue or due soon" icon={AlertOctagon} action={<SeeAll to="/findings" testid="see-all-findings" />}>
              {data.priority_findings.length === 0 ? <Empty>No critical, high, or overdue findings.</Empty> : (
                <ul className="divide-y divide-line">
                  {data.priority_findings.map((f) => (
                    <li key={f.id} className="px-5 py-2.5 flex items-start justify-between gap-3 hover:bg-surface-app">
                      <div className="min-w-0">
                        <div className="text-sm text-ink-primary font-medium truncate">{f.title}</div>
                        <div className="text-[11px] text-ink-muted mt-0.5 flex items-center gap-2"><DateCell iso={f.due_date} /></div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {f.severity && <StatusBadge value={f.severity} />}
                        {f.status && <StatusBadge value={f.status} />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        {/* Row 3b — separate upcoming/findings so upcoming spans wider */}
        {/* (Row 3 above uses a 5-col grid so upcoming panel is left-3, findings right-2 visually) */}

        {/* Row 4 — Your Actions + Watch */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel testid="panel-your-actions" title={actionsTitle} subtitle="Items awaiting your response" icon={ListTodo}>
            {data.your_actions.length === 0 ? <Empty>You have no outstanding actions.</Empty> : (
              <table className="w-full">
                <thead><tr>
                  <th className="tbl-head">Action</th>
                  <th className="tbl-head">Related Item</th>
                  <th className="tbl-head">Due</th>
                  <th className="tbl-head">Status</th>
                </tr></thead>
                <tbody>
                  {data.your_actions.map((a) => (
                    <tr key={`${a.kind}-${a.id}`} className="row-hover">
                      <td className="tbl-cell"><Link to={KIND_ROUTE[a.kind] || "/"} className="text-link hover:text-link-hover">{a.action}</Link></td>
                      <td className="tbl-cell text-ink-primary font-medium truncate max-w-xs">{a.title}</td>
                      <td className="tbl-cell"><DateCell iso={a.due_date} /></td>
                      <td className="tbl-cell"><StatusBadge value={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel testid="panel-watch" title="Upcoming & Watch Items" subtitle="Important future dates — no immediate action needed" icon={Eye}>
            {data.watch_items.length === 0 ? <Empty>No material upcoming items are currently being tracked.</Empty> : (
              <ul className="divide-y divide-line">
                {data.watch_items.map((w) => (
                  <li key={`${w.kind}-${w.id}`} className="px-5 py-2.5 flex items-center justify-between gap-3 hover:bg-surface-app">
                    <Link to={KIND_ROUTE[w.kind] || "/"} className="text-sm text-ink-primary hover:text-link truncate min-w-0">{w.title}</Link>
                    <DateCell iso={w.due_date} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Row 5 — Program status + Recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel testid="panel-program-status" title="Program Status" subtitle="Operational snapshot across GRC areas">
            <ul className="divide-y divide-line">
              {data.program_status.map((s) => (
                <li key={s.area} className="px-5 py-2.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink-primary">{s.area}</span>
                  <span className="text-ink-secondary">{s.detail}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel testid="panel-recent" title="Recent Activity" icon={Activity} action={<SeeAll to="/audit" testid="see-all-audit" />}>
            {data.recent_activity.length === 0 ? <Empty>No recent activity.</Empty> : (
              <ul className="divide-y divide-line">
                {data.recent_activity.map((a) => (
                  <li key={a.log_id} className="px-5 py-2 flex items-center gap-3 text-xs">
                    <span className="font-mono text-ink-help whitespace-nowrap">{new Date(a.at).toLocaleString()}</span>
                    <span className="text-ink-primary font-medium truncate">{a.user_email}</span>
                    <span className="text-ink-secondary">{a.action}</span>
                    <span className="text-ink-muted capitalize">{a.entity_type}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
