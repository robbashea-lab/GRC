import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatError } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, MoreVertical, Building2, ArrowRight, ShieldAlert, AlertOctagon,
  CalendarClock, Archive, ExternalLink, ScrollText, UserX, Users2, Clock, X,
  Star,
} from "lucide-react";
import { toast } from "sonner";

const PROGRAM_TONES = {
  action_required: { label: "Action Required", dot: "bg-semantic-critical",
    chip: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border" },
  needs_attention: { label: "Needs Attention", dot: "bg-semantic-duesoon",
    chip: "bg-semantic-duesoon-bg text-semantic-duesoon-text border-semantic-duesoon-border" },
  healthy: { label: "Healthy", dot: "bg-semantic-success",
    chip: "bg-semantic-success-bg text-semantic-success border-semantic-success-border" },
  onboarding: { label: "Onboarding", dot: "bg-semantic-info",
    chip: "bg-semantic-info-bg text-semantic-info border-semantic-info-border" },
  inactive: { label: "Inactive", dot: "bg-line-strong", chip: "bg-surface-subtle text-ink-secondary border-line" },
  archived: { label: "Archived", dot: "bg-line-strong", chip: "bg-surface-subtle text-ink-help border-line" },
};

const PRIORITY_TONES = {
  critical: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border",
  high: "bg-semantic-duesoon-bg text-semantic-duesoon-text border-semantic-duesoon-border",
  overdue: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border",
  due_soon: "bg-semantic-info-bg text-semantic-info border-semantic-info-border",
};

const ENTITY_ROUTE = {
  review: "/reviews", finding: "/action-items", risk: "/risks", task: "/action-items",
};

const FILTERS = [
  { id: "all", label: "All Clients" },
  { id: "assigned_to_me", label: "Assigned to Me" },
  { id: "action_required", label: "Action Required" },
  { id: "needs_attention", label: "Needs Attention" },
  { id: "past_due", label: "Past Due" },
  { id: "critical_high", label: "Critical / High" },
  { id: "onboarding", label: "Onboarding" },
  { id: "archived", label: "Archived" },
];

function StatusChip({ value }) {
  const tone = PROGRAM_TONES[value] || PROGRAM_TONES.healthy;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium ${tone.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {tone.label}
    </span>
  );
}

function Avatar({ name, logoUrl }) {
  if (logoUrl) return <img src={logoUrl} alt="" className="h-9 w-9 rounded-md object-cover border border-line" />;
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <div className="h-9 w-9 rounded-md bg-brand-charcoal text-ink-onDark flex items-center justify-center text-sm font-semibold border border-brand-metallic-3 shrink-0">
      {initial}
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function relTime(iso) {
  if (!iso) return "just now";
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function AttentionCard({ label, value, subtitle, icon: Icon, tone, onClick, testid }) {
  const tones = {
    critical: "text-semantic-critical bg-semantic-critical-bg border-semantic-critical-border",
    duesoon: "text-semantic-duesoon-text bg-semantic-duesoon-bg border-semantic-duesoon-border",
    info: "text-semantic-info bg-semantic-info-bg border-semantic-info-border",
    neutral: "text-ink-secondary bg-surface-subtle border-line",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className="text-left bg-surface-card border border-line rounded-lg p-3.5 hover:border-brand-charcoal hover:shadow-sm transition group focus:outline-none focus:ring-2 focus:ring-brand-charcoal/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-mono uppercase tracking-widest text-ink-secondary">{label}</div>
          <div className="text-2xl font-heading font-semibold tracking-tight text-ink-primary mt-1">{value}</div>
          {subtitle && <div className="text-[11px] text-ink-help mt-1 leading-tight">{subtitle}</div>}
        </div>
        <div className={`h-8 w-8 rounded-md border flex items-center justify-center ${tones[tone] || tones.neutral}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </button>
  );
}

function MetricCell({ value, tone, onClick, testid }) {
  const tones = {
    critical: "text-semantic-critical",
    duesoon: "text-semantic-duesoon-text",
    info: "text-semantic-info",
    neutral: "text-ink-secondary",
  };
  const showLink = value > 0;
  return (
    <td className="tbl-cell text-right">
      {showLink ? (
        <button
          onClick={onClick}
          data-testid={testid}
          className={`font-mono text-sm font-medium hover:underline underline-offset-2 ${tones[tone] || tones.neutral}`}
        >
          {value}
        </button>
      ) : (
        <span data-testid={testid} className="font-mono text-sm text-slate-300">0</span>
      )}
    </td>
  );
}

export default function ClientDirectory() {
  const nav = useNavigate();
  const { user, setUser } = useAuth();
  const { switchClient, refresh: refreshOrg } = useOrg();
  const [rows, setRows] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [queue, setQueue] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [leadFilter, setLeadFilter] = useState("__all__");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [drillOpen, setDrillOpen] = useState(null); // { scope, title, rows }

  const canCreate = ["super_admin", "platform_admin"].includes(user?.role);

  const favoriteIds = useMemo(
    () => new Set(user?.favorite_client_ids || []),
    [user?.favorite_client_ids]
  );

  async function toggleFavorite(clientId, currentlyFav) {
    try {
      const url = `/me/favorites/${clientId}`;
      const { data } = currentlyFav ? await api.delete(url) : await api.post(url);
      if (data?.favorite_client_ids && setUser) {
        setUser({ ...user, favorite_client_ids: data.favorite_client_ids });
      }
    } catch (e) { toast.error(formatError(e)); }
  }

  async function load() {
    setLoading(true);
    try {
      const [{ data }, { data: usersData }] = await Promise.all([
        api.get("/clients/directory", { params: { include_archived: includeArchived ? "true" : "false" } }),
        api.get("/users").catch(() => ({ data: [] })),
      ]);
      setRows(data.clients || []);
      setPortfolio(data.portfolio || null);
      setQueue(data.attention_queue || []);
      setUsers(usersData || []);
    } catch (e) { toast.error(formatError(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [includeArchived]);

  const userMap = useMemo(() => {
    const m = {}; users.forEach((u) => { m[u.user_id] = u; }); return m;
  }, [users]);
  const admins = useMemo(() => users.filter((u) => ["super_admin", "platform_admin"].includes(u.role)), [users]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (leadFilter !== "__all__" && r.grc_lead_id !== leadFilter) return false;
      if (filter === "assigned_to_me") { if (r.grc_lead_id !== user?.user_id) return false; }
      else if (filter === "past_due")     { if (!(r.past_due > 0)) return false; }
      else if (filter === "critical_high"){ if (!(r.critical_high_open > 0)) return false; }
      else if (filter !== "all" && r.program_status !== filter) return false;
      if (!s) return true;
      return (
        (r.name || "").toLowerCase().includes(s) ||
        (r.industry || "").toLowerCase().includes(s) ||
        (r.primary_contact || "").toLowerCase().includes(s) ||
        (r.grc_lead?.name || "").toLowerCase().includes(s)
      );
    });
  }, [rows, q, filter, leadFilter, user]);

  function enterWorkspace(row, target = "/dashboard") {
    switchClient(row.client_id);
    nav(target);
  }

  function openDrill(scope) {
    const now = new Date();
    let title = "", filterFn = () => true, sort = (a, b) => 0;
    if (scope === "past_due") {
      title = "Past Due — portfolio";
      filterFn = (item) => item.due_date && new Date(item.due_date) < now;
      sort = (a, b) => new Date(a.due_date) - new Date(b.due_date);
    } else if (scope === "due_30d") {
      title = "Due next 30 days — portfolio";
      const h = new Date(now); h.setDate(h.getDate() + 30);
      filterFn = (item) => item.due_date && new Date(item.due_date) >= now && new Date(item.due_date) <= h;
      sort = (a, b) => new Date(a.due_date) - new Date(b.due_date);
    } else if (scope === "critical_high") {
      title = "Critical / High open — portfolio";
      filterFn = (item) => ["critical", "high"].includes(item.priority);
    } else if (scope === "unassigned") {
      title = "Unassigned work — portfolio";
      filterFn = (item) => !item.owner_id;
    } else if (scope === "attention") {
      title = `Clients requiring attention — ${portfolio?.clients_requiring_attention || 0} / ${portfolio?.total_clients || 0}`;
      setFilter("action_required");
      window.scrollTo({ top: document.querySelector('[data-testid="client-portfolio-table"]')?.offsetTop || 0, behavior: "smooth" });
      return;
    }
    const items = [...queue].filter(filterFn).sort(sort);
    setDrillOpen({ scope, title, items });
  }

  const generatedAt = portfolio?.generated_at;

  return (
    <div className="min-h-screen">
      <PageHeader
        eyebrow="Platform"
        title="GRC Portfolio Overview"
        subtitle="High-level view of client program health, upcoming obligations, priority issues, and ownership."
        action={
          canCreate && (
            <Button size="sm" onClick={() => setAddOpen(true)} data-testid="add-client-button"
              className="bg-brand-charcoal hover:bg-brand-charcoal-hover">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Client
            </Button>
          )
        }
      />

      {/* Portfolio alert cards */}
      {portfolio && (
        <div className="px-8 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="portfolio-cards">
            <AttentionCard testid="card-past-due" label="Past Due" value={portfolio.past_due}
              subtitle="Past due across all clients" icon={ShieldAlert} tone="critical"
              onClick={() => openDrill("past_due")} />
            <AttentionCard testid="card-due-30d" label="Due Next 30 Days" value={portfolio.due_30d}
              subtitle="Upcoming GRC work across the portfolio" icon={CalendarClock} tone="duesoon"
              onClick={() => openDrill("due_30d")} />
            <AttentionCard testid="card-due-31-90" label="Due 31–90 Days" value={portfolio.due_31_90d}
              subtitle="Forward planning window" icon={Clock} tone="info"
              onClick={() => openDrill("due_30d")} />
            <AttentionCard testid="card-critical-high" label="Critical / High Open" value={portfolio.critical_high_open}
              subtitle="Highest-priority open issues" icon={AlertOctagon} tone="critical"
              onClick={() => openDrill("critical_high")} />
            <AttentionCard testid="card-unassigned" label="Unassigned" value={portfolio.unassigned}
              subtitle="Work currently missing ownership" icon={UserX} tone="duesoon"
              onClick={() => openDrill("unassigned")} />
            <AttentionCard testid="card-attention-clients"
              label="Clients Requiring Attention"
              value={`${portfolio.clients_requiring_attention} of ${portfolio.total_clients}`}
              subtitle="Clients with material overdue or priority issues" icon={Building2} tone="neutral"
              onClick={() => openDrill("attention")} />
          </div>
          {generatedAt && (
            <div className="text-[11px] font-mono uppercase tracking-widest text-ink-help mt-2">
              Updated {relTime(generatedAt)}
            </div>
          )}
        </div>
      )}

      {/* Client Portfolio */}
      <div className="px-8 pt-4">
        <h2 className="text-lg font-heading font-semibold text-ink-primary mb-2">Client Portfolio</h2>
      </div>

      {/* Filter bar */}
      <div className="px-8 py-4 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/60">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input data-testid="client-directory-search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search client, industry, GRC lead…" className="pl-8 h-9 w-72 text-sm" />
        </div>
        <div className="inline-flex items-center rounded-md border border-line bg-surface-card p-0.5 gap-0.5" data-testid="client-directory-filters">
          {FILTERS.map((t) => {
            const active = filter === t.id;
            return (
              <button key={t.id} onClick={() => setFilter(t.id)} data-testid={`client-filter-${t.id}`}
                className={`px-2.5 h-8 text-xs rounded-[6px] transition ${active ? "bg-brand-charcoal text-ink-onDark font-medium" : "text-ink-secondary hover:bg-surface-subtle"}`}>
                {t.label}
              </button>
            );
          })}
        </div>
        <Select value={leadFilter} onValueChange={setLeadFilter}>
          <SelectTrigger className="h-9 text-sm w-56" data-testid="client-lead-filter">
            <SelectValue placeholder="All GRC leads" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All GRC leads</SelectItem>
            {admins.map((u) => (
              <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-ink-secondary ml-2 select-none">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)}
            data-testid="include-archived-toggle" className="h-3.5 w-3.5" />
          Include archived
        </label>
        <div className="text-xs text-slate-500 ml-auto font-mono">{filtered.length} / {rows.length}</div>
      </div>

      {/* Client Portfolio table */}
      <div className="px-8 py-4">
        <div className="bg-surface-card border border-line rounded-lg overflow-hidden" data-testid="client-portfolio-table">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-[11px] font-mono uppercase tracking-widest text-ink-secondary border-b border-line">
              <tr>
                <th className="tbl-cell text-left font-medium">Client</th>
                <th className="tbl-cell text-left font-medium">GRC Lead</th>
                <th className="tbl-cell text-left font-medium">Program Status</th>
                <th className="tbl-cell text-right font-medium">Past Due</th>
                <th className="tbl-cell text-right font-medium">Due 30d</th>
                <th className="tbl-cell text-right font-medium">Critical / High</th>
                <th className="tbl-cell text-right font-medium">Unassigned</th>
                <th className="tbl-cell text-left font-medium">Next Major Item</th>
                <th className="tbl-cell text-right font-medium w-10">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (<tr><td colSpan={9} className="tbl-cell text-center text-ink-help py-10">Loading directory…</td></tr>)}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="tbl-cell text-center text-ink-help py-10">No clients match this filter.</td></tr>
              )}
              {!loading && filtered.map((r, i) => {
                const isFav = favoriteIds.has(r.client_id);
                return (
                <tr key={r.client_id} className="row-hover" data-testid={`client-row-${i}`}>
                  <td className="tbl-cell">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(r.client_id, isFav); }}
                        className={`p-1 rounded hover:bg-surface-subtle transition ${isFav ? "text-amber-500" : "text-ink-help hover:text-ink-secondary"}`}
                        aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                        data-testid={`row-fav-${r.client_id}`}
                      >
                        <Star className={`h-3.5 w-3.5 ${isFav ? "fill-current" : ""}`} />
                      </button>
                      <button onClick={() => enterWorkspace(r)} className="flex items-center gap-3 min-w-0 text-left group"
                        data-testid={`client-open-${r.client_id}`}>
                        <Avatar name={r.name} logoUrl={r.logo_url} />
                        <div className="min-w-0">
                          <div className="font-medium text-ink-primary group-hover:text-brand-charcoal-hover truncate flex items-center gap-1.5">
                            {r.name}
                            <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-ink-help" />
                          </div>
                          <div className="text-[11px] text-ink-help truncate">
                            {r.industry || "—"}{r.primary_contact ? ` · ${r.primary_contact}` : ""}
                          </div>
                        </div>
                      </button>
                    </div>
                  </td>
                  <td className="tbl-cell">
                    {r.grc_lead ? (
                      <div className="text-xs">
                        <div className="text-ink-primary font-medium">{r.grc_lead.name || r.grc_lead.email}</div>
                        {r.grc_lead.email && r.grc_lead.name && <div className="text-ink-help font-mono">{r.grc_lead.email}</div>}
                      </div>
                    ) : <span className="text-ink-disabled text-xs">Unassigned</span>}
                  </td>
                  <td className="tbl-cell"><StatusChip value={r.program_status} /></td>
                  <MetricCell value={r.past_due} tone={r.past_due > 0 ? "critical" : "neutral"}
                    onClick={() => enterWorkspace(r, "/action-items")} testid={`client-past-due-${i}`} />
                  <MetricCell value={r.due_30d} tone={r.due_30d > 0 ? "duesoon" : "neutral"}
                    onClick={() => enterWorkspace(r, "/action-items")} testid={`client-due-30-${i}`} />
                  <MetricCell value={r.critical_high_open} tone={r.critical_high_open > 0 ? "critical" : "neutral"}
                    onClick={() => enterWorkspace(r, "/action-items")} testid={`client-critical-${i}`} />
                  <MetricCell value={r.unassigned} tone={r.unassigned > 0 ? "duesoon" : "neutral"}
                    onClick={() => enterWorkspace(r, "/action-items")} testid={`client-unassigned-${i}`} />
                  <td className="tbl-cell">
                    {r.next_major_item ? (
                      <button onClick={() => enterWorkspace(r, "/reviews")} className="text-xs text-left hover:underline underline-offset-2">
                        <div className="text-ink-primary truncate max-w-[220px]" title={r.next_major_item.title}>{r.next_major_item.title}</div>
                        <div className="text-ink-help font-mono">{fmtDate(r.next_major_item.due_date)}</div>
                      </button>
                    ) : <span className="text-ink-disabled text-xs">No major item</span>}
                  </td>
                  <td className="tbl-cell text-right">
                    <ClientRowMenu row={r} index={i} onOpen={() => enterWorkspace(r)} onArchived={load} canEdit={canCreate} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Needs Attention Across Clients */}
      <div className="px-8 mt-8">
        <div className="flex items-end justify-between mb-2">
          <div>
            <h2 className="text-lg font-heading font-semibold text-ink-primary">Needs Attention Across Clients</h2>
            <p className="text-xs text-ink-secondary">Highest-priority GRC items requiring action, ownership, or a decision.</p>
          </div>
          <div className="text-xs text-ink-help font-mono">Top {queue.length}</div>
        </div>
        <div className="bg-surface-card border border-line rounded-lg overflow-hidden" data-testid="attention-queue">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-[11px] font-mono uppercase tracking-widest text-ink-secondary border-b border-line">
              <tr>
                <th className="tbl-cell text-left font-medium">Priority</th>
                <th className="tbl-cell text-left font-medium">Client</th>
                <th className="tbl-cell text-left font-medium">Item</th>
                <th className="tbl-cell text-left font-medium">Type</th>
                <th className="tbl-cell text-left font-medium">Owner</th>
                <th className="tbl-cell text-left font-medium">Due</th>
                <th className="tbl-cell text-left font-medium">Status</th>
                <th className="tbl-cell text-right font-medium w-10">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (<tr><td colSpan={8} className="tbl-cell text-center text-ink-help py-6">Loading…</td></tr>)}
              {!loading && queue.length === 0 && (
                <tr><td colSpan={8} className="tbl-cell text-center text-ink-help py-8">
                  No priority portfolio items require attention right now.
                </td></tr>
              )}
              {!loading && queue.map((item, i) => (
                <tr key={item.entity_id || i} className="row-hover" data-testid={`attention-row-${i}`}>
                  <td className="tbl-cell">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium capitalize ${PRIORITY_TONES[item.priority] || PRIORITY_TONES.due_soon}`}>
                      {item.priority.replace("_", " ")}
                    </span>
                  </td>
                  <td className="tbl-cell">
                    <button className="text-ink-primary hover:text-brand-charcoal-hover hover:underline underline-offset-2"
                      onClick={() => enterWorkspace({ client_id: item.client_id })}>
                      {item.client_name}
                    </button>
                  </td>
                  <td className="tbl-cell text-ink-primary truncate max-w-[280px]" title={item.title}>{item.title}</td>
                  <td className="tbl-cell text-ink-secondary text-xs capitalize">{item.entity_type}</td>
                  <td className="tbl-cell text-ink-secondary text-xs">{item.owner_name || <span className="text-slate-300">Unassigned</span>}</td>
                  <td className="tbl-cell text-xs font-mono">
                    {item.due_date ? (
                      <span className={item.overdue ? "text-semantic-critical" : "text-ink-secondary"}>
                        {fmtDate(item.due_date)}{item.overdue ? " · overdue" : ""}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="tbl-cell text-xs text-ink-secondary capitalize">{(item.status || "").replace("_", " ")}</td>
                  <td className="tbl-cell text-right">
                    <button
                      onClick={() => enterWorkspace({ client_id: item.client_id }, ENTITY_ROUTE[item.entity_type] || "/dashboard")}
                      data-testid={`attention-action-${i}`}
                      className="text-xs text-link hover:text-link-hover"
                    >Open →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DrillDialog open={!!drillOpen} data={drillOpen} userMap={userMap}
        onClose={() => setDrillOpen(null)}
        onOpenItem={(item) => { enterWorkspace({ client_id: item.client_id }, ENTITY_ROUTE[item.entity_type] || "/dashboard"); setDrillOpen(null); }} />

      <AddClientDialog open={addOpen} onOpenChange={setAddOpen} users={admins}
        onCreated={async (client) => {
          toast.success(`${client.name} created`);
          await load();
          if (refreshOrg) await refreshOrg();
        }} />
    </div>
  );
}

function DrillDialog({ open, data, onClose, onOpenItem }) {
  if (!open || !data) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl" data-testid="drill-dialog">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{data.title}</DialogTitle>
            <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          <DialogDescription>{data.items.length} items</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-[11px] font-mono uppercase tracking-widest text-ink-secondary border-b border-line sticky top-0">
              <tr>
                <th className="tbl-cell text-left">Client</th>
                <th className="tbl-cell text-left">Item</th>
                <th className="tbl-cell text-left">Type</th>
                <th className="tbl-cell text-left">Owner</th>
                <th className="tbl-cell text-left">Due</th>
                <th className="tbl-cell text-right w-10">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.length === 0 && (
                <tr><td colSpan={6} className="tbl-cell text-center text-ink-help py-6">Nothing matches this filter — nice!</td></tr>
              )}
              {data.items.map((it, i) => (
                <tr key={it.entity_id || i} className="row-hover" data-testid={`drill-row-${i}`}>
                  <td className="tbl-cell text-ink-primary">{it.client_name}</td>
                  <td className="tbl-cell text-ink-primary truncate max-w-[220px]" title={it.title}>{it.title}</td>
                  <td className="tbl-cell text-ink-secondary text-xs capitalize">{it.entity_type}</td>
                  <td className="tbl-cell text-xs">{it.owner_name || <span className="text-slate-300">Unassigned</span>}</td>
                  <td className="tbl-cell text-xs font-mono">
                    {it.due_date ? (
                      <span className={it.overdue ? "text-semantic-critical" : "text-ink-secondary"}>
                        {fmtDate(it.due_date)}{it.overdue ? " · overdue" : ""}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="tbl-cell text-right">
                    <button onClick={() => onOpenItem(it)} className="text-xs text-link hover:text-link-hover">Open →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClientRowMenu({ row, index, onOpen, onArchived, canEdit }) {
  const nav = useNavigate();
  const { switchClient } = useOrg();
  async function archive() {
    if (!confirm(`Archive ${row.name}?`)) return;
    try { await api.patch(`/clients/${row.client_id}`, { status: "archived" }); toast.success(`${row.name} archived`); onArchived?.(); }
    catch (e) { toast.error(formatError(e)); }
  }
  async function unarchive() {
    try { await api.patch(`/clients/${row.client_id}`, { status: "active" }); toast.success(`${row.name} restored`); onArchived?.(); }
    catch (e) { toast.error(formatError(e)); }
  }
  function viewActivity() { nav(`/admin/audit?client=${row.client_id}`); }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button data-testid={`client-row-menu-${index}`} className="p-1 rounded hover:bg-surface-subtle text-ink-help">
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onOpen} className="text-sm" data-testid={`client-menu-open-${index}`}>
          <ExternalLink className="h-3.5 w-3.5 mr-2" /> Open client workspace
        </DropdownMenuItem>
        <DropdownMenuItem onClick={viewActivity} className="text-sm" data-testid={`client-menu-activity-${index}`}>
          <ScrollText className="h-3.5 w-3.5 mr-2" /> View activity
        </DropdownMenuItem>
        {canEdit && (
          <>
            <DropdownMenuSeparator />
            {row.client_status === "archived" ? (
              <DropdownMenuItem onClick={unarchive} className="text-sm" data-testid={`client-menu-unarchive-${index}`}>
                <Archive className="h-3.5 w-3.5 mr-2" /> Restore client
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={archive} className="text-sm text-semantic-critical focus:text-semantic-critical" data-testid={`client-menu-archive-${index}`}>
                <Archive className="h-3.5 w-3.5 mr-2" /> Archive client
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AddClientDialog({ open, onOpenChange, users, onCreated }) {
  const [form, setForm] = useState({
    name: "", industry: "", status: "onboarding", primary_contact: "", environment: "Production",
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm({ name: "", industry: "", status: "onboarding", primary_contact: "", environment: "Production" });
  }, [open]);
  async function save() {
    if (!form.name.trim()) { toast.error("Organization name is required"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/clients", form);
      onCreated?.(data);
      onOpenChange(false);
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="add-client-dialog">
        <DialogHeader>
          <DialogTitle>Add client organization</DialogTitle>
          <DialogDescription>Create a new tenant. You can walk through GRC Program Onboarding right after creation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5 py-2">
          <div>
            <Label className="text-xs text-ink-secondary">Organization name <span className="text-semantic-critical">*</span></Label>
            <Input data-testid="new-client-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" className="text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-ink-secondary">Industry</Label>
              <Input data-testid="new-client-industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Manufacturing" className="text-sm" />
            </div>
            <div>
              <Label className="text-xs text-ink-secondary">Client status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger data-testid="new-client-status" className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Primary contact (optional)</Label>
            <Input data-testid="new-client-contact" value={form.primary_contact} onChange={(e) => setForm({ ...form, primary_contact: e.target.value })} placeholder="Jane Doe · jane@acme.com" className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Assigned GRC Lead (optional)</Label>
            <Select value={form.assigned_owner_id || "__none__"} onValueChange={(v) => setForm({ ...form, assigned_owner_id: v === "__none__" ? undefined : v })}>
              <SelectTrigger data-testid="new-client-owner" className="text-sm"><SelectValue placeholder="Assign later" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Assign later</SelectItem>
                {(users || []).map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="new-client-save" className="bg-brand-charcoal hover:bg-brand-charcoal-hover">
            {saving ? "Creating…" : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
