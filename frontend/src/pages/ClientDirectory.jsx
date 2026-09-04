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
  ListTodo, CalendarClock, Archive, ExternalLink, ScrollText, Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

const PROGRAM_TONES = {
  action_required: {
    label: "Action Required",
    dot: "bg-semantic-critical",
    chip: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border",
  },
  needs_attention: {
    label: "Needs Attention",
    dot: "bg-semantic-duesoon",
    chip: "bg-semantic-duesoon-bg text-semantic-duesoon-text border-semantic-duesoon-border",
  },
  healthy: {
    label: "Healthy",
    dot: "bg-semantic-success",
    chip: "bg-semantic-success-bg text-semantic-success border-semantic-success-border",
  },
  onboarding: {
    label: "Onboarding",
    dot: "bg-semantic-info",
    chip: "bg-semantic-info-bg text-semantic-info border-semantic-info-border",
  },
  inactive: {
    label: "Inactive",
    dot: "bg-line-strong",
    chip: "bg-surface-subtle text-ink-secondary border-line",
  },
  archived: {
    label: "Archived",
    dot: "bg-line-strong",
    chip: "bg-surface-subtle text-ink-help border-line",
  },
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "action_required", label: "Action Required" },
  { id: "needs_attention", label: "Needs Attention" },
  { id: "healthy", label: "Healthy" },
  { id: "onboarding", label: "Onboarding" },
  { id: "assigned_to_me", label: "Assigned to Me" },
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

function relTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function PortfolioCard({ label, value, icon: Icon, tone = "neutral" }) {
  const tones = {
    critical: "text-semantic-critical bg-semantic-critical-bg border-semantic-critical-border",
    duesoon: "text-semantic-duesoon-text bg-semantic-duesoon-bg border-semantic-duesoon-border",
    info: "text-semantic-info bg-semantic-info-bg border-semantic-info-border",
    neutral: "text-ink-secondary bg-surface-subtle border-line",
  };
  return (
    <div className="bg-surface-card border border-line rounded-lg p-3.5 flex items-start justify-between gap-3">
      <div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-ink-secondary">{label}</div>
        <div className="text-2xl font-heading font-semibold tracking-tight text-ink-primary mt-1">{value}</div>
      </div>
      <div className={`h-8 w-8 rounded-md border flex items-center justify-center ${tones[tone] || tones.neutral}`}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
}

export default function ClientDirectory() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { switchClient, refresh: refreshOrg } = useOrg();
  const [rows, setRows] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const canCreate = ["super_admin", "platform_admin"].includes(user?.role);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/clients/directory", {
        params: { include_archived: includeArchived ? "true" : "false" },
      });
      setRows(data.clients || []);
      setPortfolio(data.portfolio || null);
    } catch (e) { toast.error(formatError(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [includeArchived]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "assigned_to_me") {
        if (r.assigned_owner_id !== user?.user_id) return false;
      } else if (filter !== "all" && r.program_status !== filter) {
        return false;
      }
      if (!s) return true;
      return (
        (r.name || "").toLowerCase().includes(s) ||
        (r.industry || "").toLowerCase().includes(s) ||
        (r.primary_contact || "").toLowerCase().includes(s)
      );
    });
  }, [rows, q, filter, user]);

  function enterWorkspace(row, target = "/dashboard") {
    switchClient(row.client_id);
    nav(target);
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        eyebrow="Platform"
        title="Client Directory"
        subtitle="Portfolio view of all client organizations you can manage. Select a client to enter their GRC workspace."
        action={
          canCreate && (
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              data-testid="add-client-button"
              className="bg-brand-charcoal hover:bg-brand-charcoal-hover"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Client
            </Button>
          )
        }
      />

      {/* Portfolio strip */}
      {portfolio && (
        <div className="px-8 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="portfolio-strip">
            <PortfolioCard label="Total Clients" value={portfolio.total_clients} icon={Building2} tone="neutral" />
            <PortfolioCard label="Action Required" value={portfolio.action_required} icon={ShieldAlert} tone="critical" />
            <PortfolioCard label="Needs Attention" value={portfolio.needs_attention} icon={AlertOctagon} tone="duesoon" />
            <PortfolioCard label="Overdue Reviews" value={portfolio.total_overdue_reviews} icon={ListTodo} tone="critical" />
            <PortfolioCard label="Critical / High Findings" value={portfolio.total_critical_high} icon={AlertOctagon} tone="critical" />
            <PortfolioCard label="Upcoming Reviews (30d)" value={portfolio.upcoming_reviews_30d} icon={CalendarClock} tone="info" />
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="px-8 py-4 mt-2 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/60">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="client-directory-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search client, industry, contact…"
            className="pl-8 h-9 w-80 text-sm"
          />
        </div>
        <div className="inline-flex items-center rounded-md border border-line bg-surface-card p-0.5 gap-0.5" data-testid="client-directory-filters">
          {FILTERS.map((t) => {
            const active = filter === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                data-testid={`client-filter-${t.id}`}
                className={`px-3 h-8 text-xs rounded-[6px] transition ${active ? "bg-brand-charcoal text-ink-onDark font-medium" : "text-ink-secondary hover:bg-surface-subtle"}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-secondary ml-2 select-none">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            data-testid="include-archived-toggle"
            className="h-3.5 w-3.5"
          />
          Include archived
        </label>
        <div className="text-xs text-slate-500 ml-auto font-mono">{filtered.length} / {rows.length}</div>
      </div>

      {/* Table */}
      <div className="px-8 py-4">
        <div className="bg-surface-card border border-line rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-[11px] font-mono uppercase tracking-widest text-ink-secondary border-b border-line">
              <tr>
                <th className="tbl-cell text-left font-medium">Client</th>
                <th className="tbl-cell text-left font-medium">Program Status</th>
                <th className="tbl-cell text-right font-medium">Open Actions</th>
                <th className="tbl-cell text-right font-medium">Open Findings</th>
                <th className="tbl-cell text-right font-medium">Significant Risks</th>
                <th className="tbl-cell text-right font-medium">Upcoming Reviews</th>
                <th className="tbl-cell text-left font-medium">Last Activity</th>
                <th className="tbl-cell text-right font-medium w-10">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={8} className="tbl-cell text-center text-ink-help py-10">Loading directory…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="tbl-cell text-center text-ink-help py-10">No clients match this filter.</td></tr>
              )}
              {!loading && filtered.map((r, i) => (
                <tr key={r.client_id} className="row-hover" data-testid={`client-row-${i}`}>
                  <td className="tbl-cell">
                    <button
                      onClick={() => enterWorkspace(r)}
                      className="flex items-center gap-3 min-w-0 text-left group"
                      data-testid={`client-open-${r.client_id}`}
                    >
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
                  </td>
                  <td className="tbl-cell">
                    <StatusChip value={r.program_status} />
                  </td>
                  <MetricCell value={r.open_actions} tone={r.open_actions > 0 ? "critical" : "neutral"} onClick={() => enterWorkspace(r, "/tasks")} testid={`client-actions-${i}`} />
                  <MetricCell value={r.open_findings} tone={r.open_findings > 0 ? "duesoon" : "neutral"} onClick={() => enterWorkspace(r, "/findings")} testid={`client-findings-${i}`} />
                  <MetricCell value={r.significant_risks} tone={r.significant_risks > 0 ? "critical" : "neutral"} onClick={() => enterWorkspace(r, "/risks")} testid={`client-risks-${i}`} />
                  <MetricCell value={r.upcoming_reviews} tone="info" onClick={() => enterWorkspace(r, "/reviews")} testid={`client-upcoming-${i}`} />
                  <td className="tbl-cell">
                    <div className="text-xs text-ink-primary">
                      {r.last_activity ? (
                        <>
                          <div className="font-medium truncate max-w-[180px]">
                            {r.last_activity.actor ? `${r.last_activity.actor} · ` : ""}
                            <span className="capitalize">{r.last_activity.action}</span>{" "}
                            <span className="text-ink-help">{r.last_activity.entity_type}</span>
                          </div>
                          <div className="text-[11px] text-ink-help font-mono">{relTime(r.last_activity.at)}</div>
                        </>
                      ) : <span className="text-slate-300">—</span>}
                    </div>
                  </td>
                  <td className="tbl-cell text-right">
                    <ClientRowMenu row={r} index={i} onOpen={() => enterWorkspace(r)} onArchived={load} canEdit={canCreate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddClientDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={async (client) => {
          toast.success(`${client.name} created`);
          await load();
          if (refreshOrg) await refreshOrg();
        }}
      />
    </div>
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
        <span className="font-mono text-sm text-slate-300">0</span>
      )}
    </td>
  );
}

function ClientRowMenu({ row, index, onOpen, onArchived, canEdit }) {
  const nav = useNavigate();
  const { switchClient } = useOrg();

  async function archive() {
    if (!confirm(`Archive ${row.name}? Data is preserved; the client is hidden from the active list.`)) return;
    try {
      await api.patch(`/clients/${row.client_id}`, { status: "archived" });
      toast.success(`${row.name} archived`);
      onArchived?.();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function unarchive() {
    try {
      await api.patch(`/clients/${row.client_id}`, { status: "active" });
      toast.success(`${row.name} restored`);
      onArchived?.();
    } catch (e) { toast.error(formatError(e)); }
  }

  function viewActivity() {
    switchClient(row.client_id);
    nav("/audit");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid={`client-row-menu-${index}`}
          className="p-1 rounded hover:bg-surface-subtle text-ink-help"
          aria-label="Client actions"
        >
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
              <DropdownMenuItem
                onClick={archive}
                className="text-sm text-semantic-critical focus:text-semantic-critical"
                data-testid={`client-menu-archive-${index}`}
              >
                <Archive className="h-3.5 w-3.5 mr-2" /> Archive client
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AddClientDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({
    name: "", industry: "", status: "onboarding", primary_contact: "", environment: "Production",
  });
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (!open) return;
    setForm({ name: "", industry: "", status: "onboarding", primary_contact: "", environment: "Production" });
    (async () => {
      try {
        const { data } = await api.get("/users");
        setUsers(data.filter((u) => ["super_admin", "platform_admin"].includes(u.role)));
      } catch { /* non-fatal */ }
    })();
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
          <DialogDescription>Create a new tenant. You can complete baseline configuration after creation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5 py-2">
          <div>
            <Label className="text-xs text-ink-secondary">Organization name <span className="text-semantic-critical">*</span></Label>
            <Input
              data-testid="new-client-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Acme Corp"
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-ink-secondary">Industry</Label>
              <Input
                data-testid="new-client-industry"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                placeholder="Manufacturing"
                className="text-sm"
              />
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
            <Input
              data-testid="new-client-contact"
              value={form.primary_contact}
              onChange={(e) => setForm({ ...form, primary_contact: e.target.value })}
              placeholder="Jane Doe · jane@acme.com"
              className="text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Assigned GRC owner (optional)</Label>
            <Select
              value={form.assigned_owner_id || "__none__"}
              onValueChange={(v) => setForm({ ...form, assigned_owner_id: v === "__none__" ? undefined : v })}
            >
              <SelectTrigger data-testid="new-client-owner" className="text-sm"><SelectValue placeholder="Assign later" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Assign later</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            onClick={save}
            disabled={saving}
            data-testid="new-client-save"
            className="bg-brand-charcoal hover:bg-brand-charcoal-hover"
          >
            {saving ? "Creating…" : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
