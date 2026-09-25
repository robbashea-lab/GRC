import { useSearchParams } from 'react-router-dom';
import AssigneeSelect from '@/components/AssigneeSelect';
import { StatusPill } from '@/components/StatusBadge';
import TableLoadingRow from '@/components/TableLoadingRow';
import { useTableControls, ColumnControl, TableFilterChips, FilterEmpty } from '@/components/TableControls';
import {vendorSignals,VENDOR_DATA_TYPES,ASSURANCE_TYPES} from '@/lib/vendorGovernance';
import { tableColumns } from '@/lib/tableColumns';
import { useEffect, useMemo, useState, useRef } from "react";
import api, { formatError } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import RecordDrawer from "@/components/RecordDrawer";
import { SCHEMAS } from "@/lib/schemas";
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
  high: "pill-high",
  medium: "pill-moderate",
  moderate: "pill-moderate",
  low: "bg-surface-subtle text-ink-secondary border-line",
};
const CRIT_LABEL = { critical: "Critical", high: "High", medium: "Moderate", moderate: "Moderate", low: "Low" };
const CATEGORIES = ["SaaS", "Cloud / Hosting", "Managed Service Provider", "Security Provider", "HR / Payroll",
  "Financial", "Legal", "Marketing", "Communications", "Infrastructure", "Professional Services", "Other"];
const DATA_TYPES = VENDOR_DATA_TYPES;
const VIEWS = [
  { id: "all_active", label: "All Active" },
  { id: "review_due", label: "Reviews Due" },
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "contract_soon", label: "Contracts Expiring" },
  { id: "assurance", label: "Security Assurance Due" },
  { id: "inactive", label: "Inactive" },
];

const displayDate = value => new Date(String(value).slice(0,10)+"T12:00:00").toLocaleDateString();

function daysUntil(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

export default function VendorRegister() {
  const { user } = useAuth();
  const { currentClient, currentClientId } = useOrg();
  const [rows, setRows] = useState([]);
  const [reviews,setReviews] = useState([]);
  const generation=useRef(0);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [searchParams] = useSearchParams();
  // ?view= deep links (dashboard signals) open the register already filtered.
  const [view, setView] = useState(() => VIEWS.some(v => v.id === searchParams.get("view")) ? searchParams.get("view") : "all_active");
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState({ open: false, record: null });
  const [addOpen, setAddOpen] = useState(false);

  const canWrite = ["super_admin", "platform_admin"].includes(user?.role);
  const userMap = useMemo(() => { const m = {}; users.forEach((u) => { m[u.user_id] = u.name || u.email; }); return m; }, [users]);

  async function load() {
    if (!currentClientId) return;
    const token=++generation.current;
    setLoading(true);
    try {
      const [v, u, r] = await Promise.all([
        api.get("/vendors", { params: { client_id: currentClientId } }).then((r) => r.data),
        api.get(`/clients/${currentClientId}/members`).then((r) => r.data),
        api.get("/reviews",{params:{client_id:currentClientId}}).then(r=>r.data),
      ]);
      if(token!==generation.current) return;
      setRows(v || []); setUsers(u || []); setReviews(r||[]);
    } catch (e) { toast.error(formatError(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { const activeGeneration=generation; setRows([]);setUsers([]);setReviews([]);setDrawer({open:false,record:null});setAddOpen(false);setQ("");setView("all_active");load();return()=>{activeGeneration.current++;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClientId]);

  const enriched = useMemo(() => rows.map(v=>{const value=vendorSignals(v,reviews);return {...value,_attention:value._reviewDue||value._contractSoon||value._assuranceIssue};}),[rows,reviews]);

  const presetRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return enriched.filter((v) => {
      const status = v.status || "active";
      if (view !== "inactive" && view !== "all" && status === "inactive") return false;
      if (view === "critical" && v.criticality !== "critical") return false;
      if (view === "high" && v.criticality !== "high") return false;
      if (view === "review_due" && !v._reviewDue) return false;
      if (view === "contract_soon" && !v._contractSoon) return false;
      if (view === "assurance" && !v._assuranceIssue) return false;
      if (view === "inactive" && status !== "inactive") return false;
      if (!s) return true;
      return (v.name || "").toLowerCase().includes(s) || (v.service || v.services || "").toLowerCase().includes(s) || (v.category || "").toLowerCase().includes(s) || (userMap[v.business_owner_id] || "").toLowerCase().includes(s);
    }).sort((a, b) => (b._attention - a._attention) || ({critical:0,high:1,medium:2,moderate:2,low:3}[a.criticality]??9) - ({critical:0,high:1,medium:2,moderate:2,low:3}[b.criticality]??9) || (a.name || "").localeCompare(b.name || ""));
  }, [enriched, q, view, userMap]);

  const tableSource = enriched.filter(r => r.client_id === currentClientId);
  const columns = tableColumns('vendor-register', { rows: tableSource, users,  });
  const table = useTableControls({ columns, rows: tableSource, module: 'vendor-register', scope: `${user?.user_id}:${currentClientId}`, onFilterChange: key => { if (key === 'status' || key === 'criticality') setView('all'); } });
  const filtered = table.apply(presetRows.filter(r => r.client_id === currentClientId));

  function selectView(id) { const key = ({all_active:'status',inactive:'status',critical:'criticality',high:'criticality',review_due:'next_review',contract_soon:'contract_renewal'})[id]; if (key) table.setFilter(key, []); setView(id); }
  const toggleView = id => selectView(view === id ? 'all_active' : id);
  const summary = useMemo(() => {
    const s = { critical: 0, review_due: 0, contract_soon: 0, assurance: 0 };
    enriched.forEach((v) => {
      const active = v.status !== "inactive";
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
        eyebrow="Client workspace"
        title="Vendor Register"
        subtitle={`${currentClient?.name || ""} · Central register for third-party services, criticality, data handling, security assurance, and review status.`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} data-testid="vendors-export"><Download className="h-3.5 w-3.5 mr-1" /> Export CSV</Button>
            {canWrite && <Button size="sm" onClick={() => setAddOpen(true)} data-testid="new-vendor" className="bg-primary hover:bg-primary/90"><Plus className="h-3.5 w-3.5 mr-1" /> New Vendor</Button>}
          </div>
        }
      />
      <div className="page-gutter pt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="vendor-summary">
          <SummaryCard label="Critical Vendors" value={summary.critical} icon={Building2} tone="critical" onClick={() => toggleView("critical")} pressed={view === "critical"} />
          <SummaryCard label="Reviews Due" value={summary.review_due} icon={CalendarClock} tone="duesoon" onClick={() => toggleView("review_due")} pressed={view === "review_due"} />
          <SummaryCard label="Contracts Expiring" value={summary.contract_soon} icon={FileSignature} tone="duesoon" onClick={() => toggleView("contract_soon")} pressed={view === "contract_soon"} />
          <SummaryCard label="Security Assurance Due" value={summary.assurance} icon={AlertOctagon} tone="critical" onClick={() => toggleView("assurance")} pressed={view === "assurance"} />
        </div>
      </div>
      <div className="register-toolbar">
        <div className="register-search relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-help" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendors…" className="pl-8 h-9 w-72 text-sm" data-testid="vendor-search" />
        </div>
        <div className="quick-filters inline-flex items-center rounded-md border border-line bg-surface-card p-0.5 gap-0.5" data-testid="vendor-views">
          {VIEWS.map((v) => (
            <button key={v.id} aria-pressed={view === v.id} onClick={() => selectView(v.id)} data-testid={`vendor-view-${v.id}`}
              className={`px-3 h-8 text-xs rounded-[6px] transition ${view === v.id ? "bg-primary text-primary-foreground font-medium" : "text-ink-secondary hover:bg-surface-subtle"}`}>{v.label}</button>
          ))}
        </div>
        <div className="text-xs text-ink-muted ml-auto font-mono">{filtered.length} / {rows.length}</div>
      </div>
      <div className="register-body">
        <TableFilterChips table={table} />
        <div className="register-table-frame bg-surface-card border border-line rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-xs font-mono uppercase tracking-widest text-ink-secondary border-b border-line">
              <tr>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="name" /></th>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="service" /></th>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="criticality" /></th>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="data_types" /></th>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="business_owner_id" /></th>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="last_review" /></th>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="next_review" /></th>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="contract_renewal" /></th>
                <th className="tbl-cell text-left font-medium"><ColumnControl table={table} columnKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && <TableLoadingRow colSpan={9} />}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} className="tbl-cell text-center text-ink-help py-10"><FilterEmpty table={table} name="vendors" onClear={() => { setQ(''); setView('all_active'); }} /></td></tr>}
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
                    <td className="tbl-cell text-xs text-ink-secondary">{v.service || v.services || <span className="text-ink-help">—</span>}</td>
                    <td className="tbl-cell">
                      <span className={`pill ${tone}`}>{CRIT_LABEL[v.criticality] || v.criticality}</span>
                    </td>
                    <td className="tbl-cell text-xs text-ink-secondary">
                      {dt.length ? dt.slice(0, 2).join(", ") + (dt.length > 2 ? ` +${dt.length - 2}` : "") : <span className="text-ink-help">—</span>}
                    </td>
                    <td className="tbl-cell text-xs text-ink-secondary">{userMap[v.business_owner_id] || <span className="text-ink-help">—</span>}</td>
                    <td className="tbl-cell text-xs font-mono text-ink-secondary">{v.last_review ? displayDate(v.last_review) : <span className="text-ink-help">—</span>}</td>
                    <td className="tbl-cell text-xs font-mono">
                      {v.next_review ? (
                        <span className={v._nextReviewDays < 0 ? "text-semantic-critical font-medium" : v._reviewDue ? "text-semantic-duesoon-text font-medium" : "text-ink-secondary"}>
                          {displayDate(v.next_review)}
                        </span>
                      ) : <span className="text-ink-help">—</span>}
                    </td>
                    <td className="tbl-cell text-xs font-mono">
                      {(v.contract_renewal || v.contract_expiration || v.contract_end) ? (
                        <span className={v._contractSoon ? "text-semantic-duesoon-text font-medium" : "text-ink-secondary"}>
                          {displayDate(v.contract_renewal || v.contract_expiration || v.contract_end)}
                        </span>
                      ) : <span className="text-ink-help">—</span>}
                    </td>
                    <td className="tbl-cell">
                      <StatusPill className="border-line bg-surface-subtle">
                        {(v.status || "active").replace("_", " ")}
                      </StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {drawer.open && <RecordDrawer open={drawer.open} onOpenChange={(x) => setDrawer((p) => ({ ...p, open: x }))} kind="vendors" record={drawer.record} schema={SCHEMAS.vendors.fields} clientId={currentClientId} users={users} onSaved={load} />}
      <NewVendorDialog open={addOpen} onOpenChange={setAddOpen} clientId={currentClientId} users={users} onCreated={() => { setAddOpen(false); load(); }} />
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone, onClick, pressed }) {
  const tones = {
    critical: "text-semantic-critical bg-semantic-critical-bg border-semantic-critical-border",
    duesoon: "text-semantic-duesoon-text bg-semantic-duesoon-bg border-semantic-duesoon-border",
    info: "text-semantic-info bg-semantic-info-bg border-semantic-info-border",
    neutral: "text-ink-secondary bg-surface-subtle border-line",
  };
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} aria-label={`${label}: ${value}. Show in register`} className={`summary-card-button bg-surface-card border rounded-lg p-3.5 flex items-start justify-between gap-3 text-left w-full ${pressed ? 'border-ink-primary shadow-sm' : 'border-line'}`}>
      <div>
        <div className="metric-label">{label}</div>
        <div className="metric-value mt-1">{value}</div>
      </div>
      <div className={`h-8 w-8 rounded-md border flex items-center justify-center ${tones[tone] || tones.neutral}`}><Icon className="h-4 w-4" /></div>
    </button>
  );
}

function NewVendorDialog({ open, onOpenChange, clientId, users, onCreated }) {
  const [form, setForm] = useState({ name: "", service: "", category: "SaaS", criticality: "medium", status: "onboarding", data_types: [], business_owner_id: "", review_frequency: "annual", contract_renewal: "", next_review:"", assurance_required:false, assurance_records:[], notes: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm({ name: "", service: "", category: "SaaS", criticality: "medium", status: "onboarding", data_types: [], business_owner_id: "", review_frequency: "annual", contract_renewal: "", next_review:"", assurance_required:false, assurance_records:[], notes: "" }); }, [open]);

  function toggleData(dt) {
    const s = new Set(form.data_types); s.has(dt) ? s.delete(dt) : s.add(dt);
    setForm({ ...form, data_types: Array.from(s) });
  }
  async function save() {
    if (!form.name.trim()||!form.service.trim()) { toast.error("Vendor name and Service / Product are required"); return; }
    setSaving(true);
    try {
      const body = { ...form, client_id: clientId };
      if (!body.business_owner_id) delete body.business_owner_id;
      body.assurance_required=!!form.assurance_required;
      body.assurance_records=form.assurance_records||[];
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
          <div className="col-span-2"><Label htmlFor="new-vendor-name" className="text-xs text-ink-secondary">Vendor name *</Label><Input id="new-vendor-name" required data-testid="new-vendor-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="text-sm" /></div>
          <div className="col-span-2"><Label htmlFor="new-vendor-service" className="text-xs text-ink-secondary">Service / Product *</Label><Input id="new-vendor-service" required value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} placeholder="Payroll processing, CRM, hosting…" className="text-sm" /></div>
          <div><Label className="text-xs text-ink-secondary">Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger className="text-sm"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs text-ink-secondary">Criticality</Label><Select value={form.criticality} onValueChange={(v) => setForm({ ...form, criticality: v })}><SelectTrigger aria-label="Criticality" data-testid="new-vendor-criticality" className="text-sm"><SelectValue /></SelectTrigger><SelectContent>{["critical","high","medium","low"].map((c) => <SelectItem key={c} value={c}>{CRIT_LABEL[c]}</SelectItem>)}</SelectContent></Select></div>
          <div className="col-span-2">
            <Label className="text-xs text-ink-secondary">Data types (business dependency + data handling)</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {DATA_TYPES.map((dt) => (
                <button key={dt} type="button" onClick={() => toggleData(dt)}
                  className={`px-2 py-0.5 rounded-full border text-xs ${form.data_types.includes(dt) ? "bg-primary text-primary-foreground border-brand-charcoal" : "bg-surface-card border-line text-ink-secondary hover:bg-surface-subtle"}`}>{dt}</button>
              ))}
            </div>
          </div>
          <div><Label className="text-xs text-ink-secondary">Business owner</Label><AssigneeSelect clientId={clientId} label="Business owner" value={form.business_owner_id} onChange={v=>setForm({...form,business_owner_id:v})} users={users}/></div>
          <div><Label className="text-xs text-ink-secondary">Review frequency</Label><Select value={form.review_frequency} onValueChange={(v) => setForm({ ...form, review_frequency: v })}><SelectTrigger className="text-sm"><SelectValue /></SelectTrigger><SelectContent>{["quarterly","semiannual","annual","biennial","as_needed"].map((f) => <SelectItem key={f} value={f}>{f.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
          <div><Label htmlFor="new-vendor-next-review" className="text-xs text-ink-secondary">Next Review date</Label><Input id="new-vendor-next-review" type="date" value={form.next_review||""} onChange={e=>setForm({...form,next_review:e.target.value})}/></div>
          <div><Label htmlFor="new-vendor-contract" className="text-xs text-ink-secondary">Contract renewal / expiration</Label><Input id="new-vendor-contract" type="date" value={form.contract_renewal} onChange={(e) => setForm({ ...form, contract_renewal: e.target.value })} className="text-sm" /></div>
          <div className="col-span-2"><label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={!!form.assurance_required} onChange={e=>setForm({...form,assurance_required:e.target.checked})}/>Security Assurance Required</label>
            {form.assurance_required&&<div className="flex flex-wrap gap-3 mt-2">{ASSURANCE_TYPES.map(type=><label key={type} className="text-sm flex gap-1"><input type="checkbox" checked={(form.assurance_records||[]).some(a=>a.type===type)} onChange={e=>setForm({...form,assurance_records:e.target.checked?[...(form.assurance_records||[]),{type,required:true,evidence_ids:[]}]:form.assurance_records.filter(a=>a.type!==type)})}/>{type}</label>)}</div>}
          </div>
          <div className="col-span-2"><Label className="text-xs text-ink-secondary">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="text-sm" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="new-vendor-save" className="bg-primary hover:bg-primary/90">{saving ? "Saving…" : "Add to register"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
