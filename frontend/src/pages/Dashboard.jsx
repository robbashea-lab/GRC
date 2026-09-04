import { useEffect, useState } from "react";
import api, { API } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { AlertOctagon, CalendarClock, ShieldAlert, Clock, ArrowUpRight, FileDown } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

function KpiCard({ label, value, hint, icon: Icon, tone = "neutral", testid }) {
  // Neutral card body — a thin left rail conveys severity/attention only.
  const rails = {
    critical: "before:bg-semantic-critical",
    duesoon: "before:bg-semantic-duesoon",
    info: "before:bg-semantic-info",
    neutral: "before:bg-line",
  };
  const iconTones = {
    critical: "text-semantic-critical bg-semantic-critical-bg border-semantic-critical-border",
    duesoon: "text-semantic-duesoon-text bg-semantic-duesoon-bg border-semantic-duesoon-border",
    info: "text-semantic-info bg-semantic-info-bg border-semantic-info-border",
    neutral: "text-ink-secondary bg-surface-subtle border-line",
  };
  return (
    <div
      data-testid={testid}
      className={`relative bg-surface-card border border-line rounded-lg p-4 flex flex-col gap-2 hover:border-line-strong transition
        before:content-[''] before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r ${rails[tone] || rails.neutral}`}
    >
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-mono uppercase tracking-widest text-ink-secondary">{label}</div>
        <div className={`h-8 w-8 rounded-md border flex items-center justify-center ${iconTones[tone] || iconTones.neutral}`}><Icon className="h-4 w-4" /></div>
      </div>
      <div className="text-3xl font-heading font-semibold tracking-tight text-ink-primary">{value}</div>
      <div className="text-xs text-ink-muted">{hint}</div>
    </div>
  );
}

export default function Dashboard() {
  const { currentClient, currentClientId } = useOrg();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!currentClientId) return;
    (async () => {
      const { data } = await api.get("/dashboard", { params: { client_id: currentClientId } });
      setData(data);
    })();
  }, [currentClientId]);

  if (!data) return <div className="p-8 text-sm text-slate-500">Loading dashboard…</div>;

  async function downloadBoardReport() {
    try {
      const token = localStorage.getItem("grc_token");
      const resp = await fetch(`${API}/reports/board?client_id=${encodeURIComponent(currentClientId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error(`Report failed (${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `board-report-${(currentClient?.name || "client").replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Board report downloaded");
    } catch (e) { toast.error(e.message || "Report failed"); }
  }

  return (
    <div>
      <PageHeader
        title="Command Center"
        subtitle={`${currentClient?.name || "All clients"} · Operational GRC health, not vanity gauges.`}
        action={
          <Button variant="outline" onClick={downloadBoardReport} data-testid="download-board-report">
            <FileDown className="h-4 w-4 mr-1" /> Board Report PDF
          </Button>
        }
      />
      <div className="p-8 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard testid="kpi-overdue" label="Overdue reviews" value={data.kpis.overdue_reviews} hint="Past due date, not completed" icon={Clock} tone="critical" />
          <KpiCard testid="kpi-open-findings" label="Open findings" value={data.kpis.open_findings} hint="Open + in remediation" icon={AlertOctagon} tone="duesoon" />
          <KpiCard testid="kpi-critical" label="Critical / high findings" value={data.kpis.critical_findings} hint="Priority for the week" icon={AlertOctagon} tone="critical" />
          <KpiCard testid="kpi-risks" label="Significant risks" value={data.kpis.significant_risks} hint="High impact, not closed" icon={ShieldAlert} tone="info" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <header className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-sm font-heading font-semibold text-slate-900 flex items-center gap-2"><CalendarClock className="h-4 w-4 text-slate-500" /> Upcoming reviews</div>
                <div className="text-xs text-slate-500">Next 30 days</div>
              </div>
              <Link to="/reviews" data-testid="see-all-reviews" className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1">See all <ArrowUpRight className="h-3 w-3" /></Link>
            </header>
            <table className="w-full">
              <thead><tr>
                <th className="tbl-head">Review</th><th className="tbl-head">Type</th>
                <th className="tbl-head">Due</th><th className="tbl-head">Status</th>
              </tr></thead>
              <tbody>
                {data.upcoming_reviews.length === 0 && (
                  <tr><td colSpan={4} className="tbl-cell text-center text-slate-400 py-6">Nothing scheduled in the next 30 days.</td></tr>
                )}
                {data.upcoming_reviews.map((r) => (
                  <tr key={r.review_id} className="row-hover">
                    <td className="tbl-cell font-medium text-slate-900">{r.title}</td>
                    <td className="tbl-cell text-slate-600">{r.review_type}</td>
                    <td className="tbl-cell font-mono">{r.due_date ? new Date(r.due_date).toLocaleDateString() : "—"}</td>
                    <td className="tbl-cell"><StatusBadge value={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <header className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div className="text-sm font-heading font-semibold text-slate-900 flex items-center gap-2"><AlertOctagon className="h-4 w-4 text-slate-500" /> Open findings</div>
              <Link to="/findings" data-testid="see-all-findings" className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1">See all <ArrowUpRight className="h-3 w-3" /></Link>
            </header>
            <ul className="divide-y divide-slate-100">
              {data.recent_findings.length === 0 && <li className="p-5 text-center text-slate-400 text-sm">No open findings.</li>}
              {data.recent_findings.map((f) => (
                <li key={f.finding_id} className="px-5 py-3 flex items-start justify-between gap-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-900 font-medium truncate">{f.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 font-mono">{f.due_date ? `Due ${new Date(f.due_date).toLocaleDateString()}` : "No due date"}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1"><StatusBadge value={f.severity} /><StatusBadge value={f.status} /></div>
                </li>
              ))}
            </ul>
          </section>

          <section className="lg:col-span-12 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <header className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div className="text-sm font-heading font-semibold text-slate-900 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-slate-500" /> Top risks</div>
              <Link to="/risks" data-testid="see-all-risks" className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1">See all <ArrowUpRight className="h-3 w-3" /></Link>
            </header>
            <table className="w-full">
              <thead><tr>
                <th className="tbl-head">Risk</th><th className="tbl-head">Category</th>
                <th className="tbl-head">Likelihood</th><th className="tbl-head">Impact</th><th className="tbl-head">Status</th>
              </tr></thead>
              <tbody>
                {data.top_risks.length === 0 && <tr><td colSpan={5} className="tbl-cell text-center text-slate-400 py-6">No open risks.</td></tr>}
                {data.top_risks.map((r) => (
                  <tr key={r.risk_id} className="row-hover">
                    <td className="tbl-cell font-medium text-slate-900">{r.title}</td>
                    <td className="tbl-cell text-slate-600">{r.category}</td>
                    <td className="tbl-cell"><StatusBadge value={r.likelihood} /></td>
                    <td className="tbl-cell"><StatusBadge value={r.impact} /></td>
                    <td className="tbl-cell"><StatusBadge value={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
