import { useEffect, useMemo, useState } from "react";
import api, { formatError } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import RecordDrawer from "@/components/RecordDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Download, Building2, CalendarClock, FileSignature, AlertOctagon } from "lucide-react";
import { toast } from "sonner";

const CRIT_TONE = {
  critical: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border",
  high: "bg-semantic-duesoon-bg text-semantic-duesoon-text border-semantic-duesoon-border",
  medium: "bg-semantic-info-bg text-semantic-info border-semantic-info-border",
  moderate: "bg-semantic-info-bg text-semantic-info border-semantic-info-border",
  low: "bg-surface-subtle text-ink-secondary border-line",
};
const CRIT_LABEL = { critical: "Critical", high: "High", medium: "Moderate", moderate: "Moderate", low: "Low" };
const CATEGORIES = ["SaaS", "Cloud / Hosting", "Managed Service Provider", "Security Provider", "HR / Payroll",
  "Financial", "Legal", "Marketing", "Communications", "Infrastructure", "Professional Services", "Other"];
const DATA_TYPES = ["No Sensitive Data", "Internal", "Confidential", "PII", "PHI", "Financial",
  "Customer Data", "Employee Data", "Credentials", "Source Code / IP", "Operational Data", "Other"];
const VIEWS = [
  { id: "all_active", label: "All Active" },
  { id: "critical", label: "Critical" },
  { id: "review_due", label: "Reviews Due" },
  { id: "contract_soon", label: "Contracts Expiring" },
  { id: "assurance", label: "Assurance Needs Attention" },
  { id: "inactive", label: "Inactive" },
];

const soonMs = 60 * 86400000; // 60 days

function daysUntil(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

export default function VendorRegister() {
  const { user } = useAuth();
  const { currentClient, currentClientId } = useOrg();
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [view, setView] = useState("all_active");
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState({ open: false, record: null });
  const [addOpen, setAddOpen] = useState(false);

  const canWrite = ["super_admin", "platform_admin", "client_contributor"].includes(user?.role);
  const userMap = useMemo(() => { const m = {}; users.forEach((u) => { m[u.user_id] = u.name || u.email; }); return m; }, [users]);

  async function load() {
    if (!currentClientId) return;
    setLoading(true);
    try {
      const [v, u] = await Promise.all([
        api.get("/vendors", { params: { client_id: currentClientId } }).then((r) => r.data),
        api.get("/users").then((r) => r.data).catch(() => []),
      ]);
      setRows(v || []); setUsers(u || []);
    } catch (e) { toast.error(formatError(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentClientId]);

  const enriched = useMemo(() => rows.map((v) => {
    const nextReviewDays = daysUntil(v.next_review);
    const contractDays = daysUntil(v.contract_expiration || v.contract_renewal || v.contract_end);
    const reviewDue = nextReviewDays !== null && nextReviewDays <= 60;
    const contractSoon = contractDays !== null && contractDays <= 60;
    const assuranceIssue = ["expired", "expiring", "missing", "requested"].includes((v.assurance_status || "").toLowerCase());
    const attention = (v.criticality === "critical" && reviewDue) || (nextReviewDays !== null && nextReviewDays < 0) || contractSoon || assuranceIssue;
    return { ...v, _nextReviewDays: nextReviewDays, _contractDays: contractDays, _reviewDue: reviewDue, _contractSoon: contractSoon, _assuranceIssue: assuranceIssue, _attention: attention };
  }), [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return enriched.filter((v) => {
      const status = v.status || "active";
      if (view === "all_active" && ["inactive", "offboarding"].includes(status)) return false;
      if (view === "critical" && v.criticality !== "critical") return false;
      if (view === "review_due" && !v._reviewDue) return false;
      if (view === "contract_soon" && !v._contractSoon) return false;
      if (view === "assurance" && !v._assuranceIssue) return false;
      if (view === "inactive" && !["inactive", "offboarding"].includes(status)) return false;
      if (!s) return true;
      return (v.name || "").toLowerCase().includes(s) || (v.service || v.services || "").toLowerCase().includes(s) || (v.category || "").toLowerCase().includes(s) || (userMap[v.business_owner_id] || "").toLowerCase().includes(s);
    }).sort((a, b) => (b._attention - a._attention) || ({critical:0,high:1,medium:2,moderate:2,low:3}[a.criticality]||9) - ({critical:0,high:1,medium:2,moderate:2,low:3}[b.criticality]||9) || (a.name || "").localeCompare(b.name || ""));
  }, [enriched, q, view, userMap]);

  const summary = useMemo(() => {
    const s = { critical: 0, review_due: 0, contract_soon: 0, assurance: 0 };
    enriched.forEach((v) => {
      const active = !["inactive", "offboarding"].includes(v.status || "active");
      if (v.criticality === "critical" && active) s.critical += 1;
      if (v._reviewDue && active) s.review_due += 1;
      if (v._contractSoon && active) s.contract_soon += 1;
      if (v._assuranceIssue && active) s.assurance += 1;
    });
    return s;
  }, [enriched]);

  function exportCsv() {
    const cols = ["vendor", "service", "category", "criticality", "data_types", "business_owner", "status", "review_frequency", "last_review", "next_review", "contract_start", "contract_renewal", "contract_expiration", "auto_renewal", "assurance_status"];
    const lines = [cols.join(",")];
    rows.forEach((v) => {
      const row = [v.name, v.service || v.services, v.category, v.criticality, (v.data_types || []).join("; "),
        userMap[v.business_owner_id] || "", v.status, v.review_frequency, (v.last_review || "").slice(0, 10),
        (v.next_review || "").slice(0, 10), (v.contract_start || "").slice(0, 10),
        (v.contract_renewal || "").slice(0, 10), (v.contract_expiration || v.contract_end || "").slice(0, 10),
        v.auto_renewal || "", v.assurance_status || ""];
      lines.push(row.map((x) => `"${(x ?? "").toString().replaceAll('"', '""')}"`).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `vendor-register-${(currentClient?.name || "client").replace(/\s+/g, "-")}.csv`; a.click();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Vendor Register"
        title="Vendor Register"
        subtitle={`${currentClient?.name || ""} · Central register for third-party services, criticality, data handling, security assurance, and review status.`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} data-testid="vendors-export"><Download className="h-3.5 w-3.5 mr-1" /> Export CSV</Button>
            {canWrite && <Button size="sm" onClick={() => setAddOpen(true)} data-testid="new-vendor" className="bg-brand-charcoal hover:bg-brand-charcoal-hover"><Plus className="h-3.5 w-3.5 mr-1" /> New Vendor</Button>}
          </div>
        }
      />
      <div className="px-8 pt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="vendor-summary">
          <SummaryCard label="Critical Vendors" value={summary.critical} icon={Building2} tone="critical" />
          <SummaryCard label="Reviews Due" value={summary.review_due} icon={CalendarClock} tone="duesoon" />
          <SummaryCard label="Contracts Expiring" value={summary.contract_soon} icon={FileSignature} tone="duesoon" />
          <SummaryCard label="Assurance Attention" value={summary.assurance} icon={AlertOctagon} tone="critical" />
        </div>
      </div>
      <div className="px-8 py-4 mt-2 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/60">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-help" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendors…" className="pl-8 h-9 w-72 text-sm" data-testid="vendor-search" />
        </div>
        <div className="inline-flex items-center rounded-md border border-line bg-surface-card p-0.5 gap-0.5" data-testid="vendor-views">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => setView(v.id)} data-testid={`vendor-view-${v.id}`}
              className={`px-3 h-8 text-xs rounded-[6px] transition ${view === v.id ? "bg-brand-charcoal text-ink-onDark font-medium" : "text-ink-secondary hover:bg-surface-subtle"}`}>{v.label}</button>
          ))}
        </div>
        <div className="text-xs text-slate-500 ml-auto font-mono">{filtered.length} / {rows.length}</div>
      </div>
      <div className="p-8">
        <div className="bg-surface-card border border-line rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-[11px] font-mono uppercase tracking-widest text-ink-secondary border-b border-line">
              <tr>
                <th className="tbl-cell text-left font-medium">Vendor</th>
                <th className="tbl-cell text-left font-medium">Service / Product</th>
                <th className="tbl-cell text-left font-medium">Criticality</th>
                <th className="tbl-cell text-left font-medium">Data Types</th>
                <th className="tbl-cell text-left font-medium">Business Owner</th>
                <th className="tbl-cell text-left font-medium">Last Review</th>
                <th className="tbl-cell text-left font-medium">Next Review</th>
                <th className="tbl-cell text-left font-medium">Contract Renewal</th>
                <th className="tbl-cell text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={9} className="tbl-cell text-center text-ink-help py-10">Loading…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} className="tbl-cell text-center text-ink-help py-10">No vendors match this view.</td></tr>}
              {!loading && filtered.map((v, i) => {
                const tone = CRIT_TONE[v.criticality] || CRIT_TONE.medium;
                const dt = v.data_types || [];
                return (
                  <tr key={v.vendor_id} className="row-hover cursor-pointer" onClick={() => setDrawer({ open: true, record: v })} data-testid={`vendor-row-${i}`}>
                    <td className="tbl-cell font-medium text-ink-primary">
                      <span className="inline-flex items-center gap-2">
                        {v.name}
                        {v._attention && <span className="inline-block h-1.5 w-1.5 rounded-full bg-semantic-critical" title="Needs attention" />}
                      </span>
                    </td>
                    <td className="tbl-cell text-xs text-ink-secondary">{v.service || v.services || <span className="text-slate-300">—</span>}</td>
                    <td className="tbl-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium ${tone}`}>{CRIT_LABEL[v.criticality] || v.criticality}</span>
                    </td>
                    <td className="tbl-cell text-xs text-ink-secondary">
                      {dt.length ? dt.slice(0, 2).join(", ") + (dt.length > 2 ? ` +${dt.length - 2}` : "") : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="tbl-cell text-xs text-ink-secondary">{userMap[v.business_owner_id] || <span className="text-slate-300">—</span>}</td>
                    <td className="tbl-cell text-xs font-mono text-ink-secondary">{v.last_review ? new Date(v.last_review).toLocaleDateString() : <span className="text-slate-300">—</span>}</td>
                    <td className="tbl-cell text-xs font-mono">
                      {v.next_review ? (
                        <span className={v._nextReviewDays < 0 ? "text-semantic-critical font-medium" : v._reviewDue ? "text-semantic-duesoon-text font-medium" : "text-ink-secondary"}>
                          {new Date(v.next_review).toLocaleDateString()}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="tbl-cell text-xs font-mono">
                      {(v.contract_renewal || v.contract_expiration || v.contract_end) ? (
                        <span className={v._contractSoon ? "text-semantic-duesoon-text font-medium" : "text-ink-secondary"}>
                          {new Date(v.contract_renewal || v.contract_expiration || v.contract_end).toLocaleDateString()}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="tbl-cell">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-line bg-surface-subtle text-[11px] font-medium capitalize">
                        {(v.status || "active").replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {drawer.open && <RecordDrawer open={drawer.open} onOpenChange={(x) => setDrawer((p) => ({ ...p, open: x }))} kind="vendors" record={drawer.record} onSaved={load} />}
      <NewVendorDialog open={addOpen} onOpenChange={setAddOpen} clientId={currentClientId} users={users} onCreated={() => { setAddOpen(false); load(); }} />
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }) {
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
      <div className={`h-8 w-8 rounded-md border flex items-center justify-center ${tones[tone] || tones.neutral}`}><Icon className="h-4 w-4" /></div>
    </div>
  );
}

function NewVendorDialog({ open, onOpenChange, clientId, users, onCreated }) {
  const [form, setForm] = useState({ name: "", service: "", category: "SaaS", criticality: "medium", status: "onboarding", data_types: [], business_owner_id: "", review_frequency: "annual", contract_renewal: "", notes: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm({ name: "", service: "", category: "SaaS", criticality: "medium", status: "onboarding", data_types: [], business_owner_id: "", review_frequency: "annual", contract_renewal: "", notes: "" }); }, [open]);

  function toggleData(dt) {
    const s = new Set(form.data_types); s.has(dt) ? s.delete(dt) : s.add(dt);
    setForm({ ...form, data_types: Array.from(s) });
  }
  async function save() {
    if (!form.name.trim()) { toast.error("Vendor name is required"); return; }
    setSaving(true);
    try {
      const body = { ...form, client_id: clientId };
      if (!body.business_owner_id) delete body.business_owner_id;
      if (body.contract_renewal) body.contract_renewal = new Date(body.contract_renewal).toISOString();
      await api.post("/vendors", body);
      toast.success(`${form.name} added to the register`);
      onCreated?.();
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="new-vendor-dialog">
        <DialogHeader>
          <DialogTitle>New Vendor</DialogTitle>
          <DialogDescription>Add a third party to the Vendor Register.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2"><Label className="text-xs text-ink-secondary">Vendor name</Label><Input data-testid="new-vendor-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs text-ink-secondary">Service / Product</Label><Input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} placeholder="Payroll processing, CRM, hosting…" className="text-sm" /></div>
          <div><Label className="text-xs text-ink-secondary">Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger className="text-sm"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs text-ink-secondary">Criticality</Label><Select value={form.criticality} onValueChange={(v) => setForm({ ...form, criticality: v })}><SelectTrigger data-testid="new-vendor-criticality" className="text-sm"><SelectValue /></SelectTrigger><SelectContent>{["critical","high","medium","low"].map((c) => <SelectItem key={c} value={c}>{CRIT_LABEL[c]}</SelectItem>)}</SelectContent></Select></div>
          <div className="col-span-2">
            <Label className="text-xs text-ink-secondary">Data types (business dependency + data handling)</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {DATA_TYPES.map((dt) => (
                <button key={dt} type="button" onClick={() => toggleData(dt)}
                  className={`px-2 py-0.5 rounded-full border text-[11px] ${form.data_types.includes(dt) ? "bg-brand-charcoal text-ink-onDark border-brand-charcoal" : "bg-surface-card border-line text-ink-secondary hover:bg-surface-subtle"}`}>{dt}</button>
              ))}
            </div>
          </div>
          <div><Label className="text-xs text-ink-secondary">Business owner</Label><Select value={form.business_owner_id || "__none__"} onValueChange={(v) => setForm({ ...form, business_owner_id: v === "__none__" ? "" : v })}><SelectTrigger className="text-sm"><SelectValue placeholder="Assign later" /></SelectTrigger><SelectContent><SelectItem value="__none__">Assign later</SelectItem>{users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs text-ink-secondary">Review frequency</Label><Select value={form.review_frequency} onValueChange={(v) => setForm({ ...form, review_frequency: v })}><SelectTrigger className="text-sm"><SelectValue /></SelectTrigger><SelectContent>{["quarterly","semiannual","annual","biennial","as_needed","custom"].map((f) => <SelectItem key={f} value={f}>{f.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs text-ink-secondary">Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger className="text-sm"><SelectValue /></SelectTrigger><SelectContent>{["onboarding","under_review","active","offboarding","inactive"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs text-ink-secondary">Contract renewal / expiration</Label><Input type="date" value={form.contract_renewal} onChange={(e) => setForm({ ...form, contract_renewal: e.target.value })} className="text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs text-ink-secondary">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="text-sm" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="new-vendor-save" className="bg-brand-charcoal hover:bg-brand-charcoal-hover">{saving ? "Saving…" : "Add to register"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
