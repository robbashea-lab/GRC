import AssigneeSelect from '@/components/AssigneeSelect';
import RegisterLoadError from '@/components/RegisterLoadError';
import TableLoadingRow from '@/components/TableLoadingRow';
import { useTableControls, TableFilterChips, FilterEmpty } from '@/components/TableControls';
import { tableColumns } from '@/lib/tableColumns';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {useSearchParams} from 'react-router-dom';
import managementRules from '@/lib/managementRules.json';
import api, { formatError, API } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import {RiskSourceFields,RiskScheduleFields} from "@/components/RiskGovernanceFields";
import PageHeader from "@/components/PageHeader";
import RecordDrawer from "@/components/RecordDrawer";
import { SCHEMAS } from "@/lib/schemas";
import { RISK_VIEWS, RISK_LINKED_VIEWS, riskMatchesView, riskViewCounts, riskStatus } from "@/lib/riskRegister";
import { HeaderActions, PrimaryAction, SecondaryAction, SearchField, ViewTabs, RegisterCount, SortableHeader } from "@/components/Register";
import { DueDate, HistoryDate, OwnerCell } from "@/components/RegisterCells";
import StatusBadge, { SeverityBadge } from "@/components/StatusBadge";
import { assessedRisk, riskLevel } from "@/lib/grcWork";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Grid3x3, Download, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const LIKELIHOOD_LABELS = { 1: "Rare", 2: "Unlikely", 3: "Possible", 4: "Likely", 5: "Almost Certain" };
const IMPACT_LABELS = { 1: "Minimal", 2: "Minor", 3: "Moderate", 4: "Major", 5: "Severe" };
const LEVEL_TONE = {
  critical: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border",
  high: "pill-high",
  moderate: "pill-moderate",
  low: "bg-surface-subtle text-ink-secondary border-line",
};

// Backend threshold: score >=15 critical; >=10 high; >=5 moderate; else low.
function levelFromScore(s) {
  return riskLevel(s);
}

const VIEWS = RISK_VIEWS;

const CATEGORIES = SCHEMAS.risks.fields.find(f => f.name === 'category').options;

export default function RiskRegister() {
  const [searchParams,setSearchParams]=useSearchParams();
  const portfolioSignificant=searchParams.get('portfolio')==='significant';
  const portfolioEntry=useRef(null);
  const { user } = useAuth();
  const { currentClient, currentClientId } = useOrg();
  const generation=useRef(0);
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  // ?view= deep links (dashboard signals) open the register already filtered.
  const linkedView = ["all_active","review_due","critical","high","significant","accepted","closed"].includes(searchParams.get("view")) ? searchParams.get("view") : "all_active";
  const [view, setView] = useState(linkedView);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [drawer, setDrawer] = useState({ open: false, record: null });
  const [addOpen, setAddOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);

  const canWrite = ["super_admin", "platform_admin"].includes(user?.role);
  const userMap = useMemo(() => {
    const m = {}; users.forEach((u) => { m[u.user_id] = u.name || u.email; }); return m;
  }, [users]);

  const load=useCallback(async () => {
    if (!currentClientId) return;
    const version=++generation.current;
    setLoading(true); setLoadError('');
    try {
      const [r, u] = await Promise.all([
        api.get("/risks", { params: { client_id: currentClientId, ...(portfolioSignificant?{portfolio_significant:true}:{}) } }).then((r) => r.data),
        api.get(`/clients/${currentClientId}/members`).then((r) => r.data).catch(() => []),
      ]);
      if(version===generation.current){setRows((r || []).map(assessedRisk)); setUsers(u || []);}
    } catch (e) { if(version===generation.current){setRows([]);setLoadError(formatError(e));} }
    finally { if(version===generation.current)setLoading(false); }
  },[currentClientId,portfolioSignificant]);
  useEffect(() => { const scopeGeneration=generation;setRows([]);setUsers([]);setView(linkedView);setQ("");setDrawer({open:false,record:null});setAddOpen(false);load();return()=>{scopeGeneration.current++;}; }, [currentClientId,load]); // eslint-disable-line react-hooks/exhaustive-deps -- deep-linked view applies on client change only

  const now = Date.now();
  const presetRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if(portfolioSignificant&&(r.archived||r.archived_at||managementRules.terminal.includes(r.status)||!['high','critical'].includes(r.risk_level)))return false;
      if (!riskMatchesView(r, view, new Date(now))) return false;
      if (!s) return true;
      return (r.title || "").toLowerCase().includes(s)
        || (r.risk_id || "").toLowerCase().includes(s)
        || (r.display_id || "").toLowerCase().includes(s)
        || (r.description || "").toLowerCase().includes(s)
        || (r.category || "").toLowerCase().includes(s)
        || (userMap[r.owner_id] || "").toLowerCase().includes(s);
    }).sort((a, b) => {
      const order = { critical: 0, high: 1, moderate: 2, low: 3 };
      return (order[a.risk_level] ?? 9) - (order[b.risk_level] ?? 9) || (b.risk_score || 0) - (a.risk_score || 0);
    });
  }, [rows, q, view, userMap, now,portfolioSignificant]);

  const tableSource = rows.filter(r => r.client_id === currentClientId);
  const columns = tableColumns('risk-register', { rows: tableSource, users,  });
  const table = useTableControls({ columns, rows: tableSource, module: 'risk-register', scope: `${user?.user_id}:${currentClientId}`, onFilterChange: (key,values) => { if (key === null || key === 'status' && !values.length) setView('all_active'); else if (key === 'status') setView('all'); } });
  const filtered = table.apply(presetRows.filter(r => r.client_id === currentClientId));
  useEffect(()=>{
    const key=portfolioSignificant?currentClientId:null;
    if(key&&portfolioEntry.current!==key){
      table.replaceState({filters:{}});setView('all_active');setQ('');
    }
    portfolioEntry.current=key;
  },[portfolioSignificant,currentClientId,table]);

  const counts = useMemo(() => riskViewCounts(tableSource, new Date(now)), [tableSource, now]);
  const tabs = RISK_LINKED_VIEWS[view] ? [...VIEWS, { id: view, label: RISK_LINKED_VIEWS[view] }] : VIEWS;
  function selectView(id) { const key = ({all_active:'status',closed:'status',accepted:'status',critical:'risk_level',high:'risk_level',significant:'risk_level',review_due:'next_review'})[id]; if (key) table.setFilter(key, []); setView(id); }

  async function exportCsv() {
    const cols = ["display_id", "risk_id", "title", "category", "likelihood_score", "impact_score", "risk_score", "risk_level", "owner", "status", "treatment", "date_identified", "last_reviewed", "next_review"];
    const lines = [cols.join(",")];
    rows.forEach((r) => {
      const row = [
        r.display_id || "", r.risk_id || "", (r.title || "").replaceAll(",", ";"), r.category || "",
        r.likelihood_score || "", r.impact_score || "", r.risk_score || "", r.risk_level || "",
        (userMap[r.owner_id] || "").replaceAll(",", ";"),
        r.status || "", r.treatment || "",
        (r.date_identified || "").slice(0, 10),
        (r.last_reviewed || "").slice(0, 10),
        (r.next_review || "").slice(0, 10),
      ].map((v) => `"${(v ?? "").toString().replaceAll('"', '""')}"`);
      lines.push(row.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `risk-register-${(currentClient?.name || "client").replace(/\s+/g, "-")}.csv`; a.click();
  }

  return (
    <div>
      <PageHeader
        title="Risks"
        subtitle="Identified client risks and treatment status."
        action={
          <HeaderActions>
            <SecondaryAction icon={Grid3x3} label="Risk Scale & Matrix" onClick={() => setMatrixOpen(true)} testid="risk-matrix-btn" />
            <SecondaryAction icon={Download} label="Export CSV" onClick={exportCsv} testid="risks-export" />
            {canWrite && <PrimaryAction label="New Risk" onClick={() => setAddOpen(true)} testid="new-risk" />}
          </HeaderActions>
        }
      />
      {portfolioSignificant&&<p className="register-notice" role="status" data-testid="portfolio-risk-filter">Active High / Critical Risks · includes accepted Risks <button className="register-link" onClick={()=>{const next=new URLSearchParams(searchParams);next.delete('portfolio');setSearchParams(next,{replace:true});}}>Clear portfolio filter</button></p>}
      <div className="register-toolbar">
        <SearchField label="Search risks" placeholder="Search risks…" value={q} onChange={setQ} testid="risk-search" />
        <ViewTabs views={tabs} active={view} onPick={selectView} counts={counts} label="Risk views" testid="risk-views" testIdPrefix="risk-view-" />
        <RegisterCount shown={filtered.length} total={tableSource.length} />
      </div>

      <div className="register-body">
        <TableFilterChips table={table} />
        <RegisterLoadError error={loadError} onRetry={load} name="risks" />
        <div className="register-table-frame bg-surface-card border border-line rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className="tbl-head">ID</th>
                <SortableHeader table={table} columnKey="title" />
                <SortableHeader table={table} columnKey="category" />
                <SortableHeader table={table} columnKey="risk_score" className="text-right" />
                <SortableHeader table={table} columnKey="risk_level" />
                <SortableHeader table={table} columnKey="owner_id" />
                <SortableHeader table={table} columnKey="status" />
                <SortableHeader table={table} columnKey="last_reviewed" />
                <SortableHeader table={table} columnKey="next_review" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && <TableLoadingRow colSpan={9} />}
              {!loading && !loadError && filtered.length === 0 && <tr><td colSpan={9} className="tbl-cell text-center text-ink-help py-10"><FilterEmpty table={table} name="risks" onClear={() => { setQ(''); setView('all_active'); }} /></td></tr>}
              {!loading && filtered.map((r, i) => {
                const level = r.risk_level || levelFromScore(r.risk_score);
                return (
                  <tr key={r.risk_id} onClick={() => setDrawer({ open: true, record: r })} className="row-hover row-open" data-testid={`risk-row-${i}`}>
                    <td className="tbl-cell font-mono text-xs text-ink-help whitespace-nowrap">{r.display_id || "ID pending"}</td>
                    <td className="tbl-cell font-medium text-ink-primary min-w-0">{r.title}</td>
                    <td className="tbl-cell text-xs text-ink-secondary">{r.category ? CATEGORIES.find(o => o.value === r.category)?.label || r.category : <span className="text-ink-help">—</span>}</td>
                    <td className="tbl-cell text-right font-mono">{r.risk_score || <span className="text-ink-help">—</span>}</td>
                    <td className="tbl-cell">{level ? <SeverityBadge value={level} /> : <span className="register-empty">—</span>}</td>
                    <td className="tbl-cell"><OwnerCell people={users} id={r.owner_id} status={r.status} /></td>
                    <td className="tbl-cell"><StatusBadge value={r.status || "open"} label={riskStatus(r.status || "open")} /></td>
                    <td className="tbl-cell"><HistoryDate value={r.last_reviewed} empty="Never reviewed" /></td>
                    <td className="tbl-cell">{r.next_review ? <DueDate iso={r.next_review} closed={["closed", "retired"].includes(r.status)} /> : <span className="register-empty">Not scheduled</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {drawer.open && <RecordDrawer open={drawer.open} onOpenChange={(v) => setDrawer((p) => ({ ...p, open: v }))} kind="risks" record={drawer.record} schema={SCHEMAS.risks.fields} clientId={currentClientId} users={users} onSaved={load} />}
      <RiskMatrixModal open={matrixOpen} onOpenChange={setMatrixOpen} />
      <NewRiskDialog open={addOpen} onOpenChange={setAddOpen} clientId={currentClientId} users={users} onCreated={() => { setAddOpen(false); load(); }} onOpenMatrix={() => setMatrixOpen(true)} />
    </div>
  );
}


function RiskMatrixModal({ open, onOpenChange }) {
  const cell = (l, i) => {
    const s = l * i;
    const level = levelFromScore(s);
    return (
      <td key={`${l}-${i}`} className={`text-center py-3 border border-line font-mono text-sm ${LEVEL_TONE[level]}`}>
        <div className="font-semibold">{s}</div>
        <div className="text-xs uppercase tracking-widest opacity-80">{level}</div>
      </td>
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Risk Scale &amp; 5×5 Matrix</DialogTitle>
          <DialogDescription>How likelihood and impact combine into a risk level.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left p-2 text-xs font-mono uppercase tracking-widest text-ink-help">Likelihood ↓ / Impact →</th>
                {[1, 2, 3, 4, 5].map((i) => (
                  <th key={i} className="p-2 text-center text-xs font-mono uppercase tracking-widest text-ink-help">{i} · {IMPACT_LABELS[i]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[5, 4, 3, 2, 1].map((l) => (
                <tr key={l}>
                  <th className="text-left p-2 text-xs font-mono uppercase tracking-widest text-ink-help">{l} · {LIKELIHOOD_LABELS[l]}</th>
                  {[1, 2, 3, 4, 5].map((i) => cell(l, i))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-ink-help mb-2">Likelihood</div>
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="flex gap-3 py-0.5"><span className="font-mono text-ink-help w-3">{n}</span><span className="text-ink-primary">{LIKELIHOOD_LABELS[n]}</span></div>
              ))}
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-ink-help mb-2">Impact</div>
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="flex gap-3 py-0.5"><span className="font-mono text-ink-help w-3">{n}</span><span className="text-ink-primary">{IMPACT_LABELS[n]}</span></div>
              ))}
            </div>
          </div>
          <div className="border-t border-line pt-3 text-xs text-ink-help">
            Level thresholds — <strong>Critical</strong> ≥ 15 · <strong>High</strong> ≥ 10 · <strong>Moderate</strong> ≥ 5 · <strong>Low</strong> &lt; 5. Configured centrally so the register, matrix, and dashboard always agree.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewRiskDialog({ open, onOpenChange, clientId, users, onCreated, onOpenMatrix }) {
  const [form, setForm] = useState({
    title: "", category: "cybersecurity", description: "", impact_description: "", source_type: "manual",
    likelihood_score: null, impact_score: null, owner_id: "", treatment: "mitigate", review_cadence:"annual", next_review:"",
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm({
      title: "", category: "cybersecurity", description: "", impact_description: "", source_type: "manual",
      likelihood_score: null, impact_score: null, owner_id: "", treatment: "mitigate", review_cadence:"annual", next_review:"",
    });
  }, [open]);
  const score = assessedRisk(form).risk_score;
  const level = levelFromScore(score);
  const tone = LEVEL_TONE[level] || LEVEL_TONE.low;

  async function save() {
    if (!form.title.trim() || !form.description.trim() || !form.category || !form.likelihood_score || !form.impact_score) { toast.error("Title, category, description, likelihood and impact are required"); return; }
    if (["review","finding","vendor","audit"].includes(form.source_type) && !form.source_id) { toast.error("Select the source record"); return; }
    setSaving(true);
    try {
      const body = { ...form, client_id: clientId };
      if (!body.owner_id) delete body.owner_id;
      await api.post("/risks", body);
      toast.success(`${form.title} added to the register`);
      onCreated?.();
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="new-risk-dialog">
        <DialogHeader>
          <DialogTitle>New Risk</DialogTitle>
          <DialogDescription>Score and level are calculated automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <Label htmlFor="new-risk-title" className="text-xs text-ink-secondary">Risk title *</Label>
            <Input id="new-risk-title" data-testid="new-risk-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Category *</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger aria-label="Risk category" className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <RiskSourceFields form={form} setForm={setForm} clientId={clientId}/>
          <div className="col-span-2">
            <Label className="text-xs text-ink-secondary">Risk description *</Label>
            <Textarea aria-label="Risk description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="text-sm" rows={2} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-ink-secondary">Impact description</Label>
            <Textarea value={form.impact_description} onChange={(e) => setForm({ ...form, impact_description: e.target.value })} className="text-sm" rows={2} />
          </div>
          <div>
            <Label className="text-xs text-ink-secondary flex items-center justify-between">
              Likelihood <button type="button" onClick={onOpenMatrix} className="text-xs font-mono uppercase tracking-widest text-link hover:underline">Scale</button>
            </Label>
            <Select value={form.likelihood_score ? String(form.likelihood_score) : ''} onValueChange={(v) => setForm({ ...form, likelihood_score: parseInt(v) })}>
              <SelectTrigger aria-label="Likelihood (required)" data-testid="new-risk-likelihood" className="text-sm"><SelectValue placeholder="Select likelihood…" /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} · {LIKELIHOOD_LABELS[n]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Impact</Label>
            <Select value={form.impact_score ? String(form.impact_score) : ''} onValueChange={(v) => setForm({ ...form, impact_score: parseInt(v) })}>
              <SelectTrigger aria-label="Impact (required)" data-testid="new-risk-impact" className="text-sm"><SelectValue placeholder="Select impact…" /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} · {IMPACT_LABELS[n]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex items-center gap-3 py-2 px-3 border border-line rounded-md bg-surface-subtle">
            <div className="text-xs font-mono uppercase tracking-widest text-ink-help">Calculated</div>
            <div className="font-mono text-sm text-ink-primary">Score {score ?? '—'}</div>
            <ArrowRight className="h-3 w-3 text-ink-help" />
            <span className={`pill capitalize ${tone}`} data-testid="new-risk-level">{level || 'Needs assessment'}</span>
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Owner</Label>
            <AssigneeSelect clientId={clientId} value={form.owner_id} onChange={v=>setForm({...form,owner_id:v})} users={users}/>
          </div>
          <div className="col-span-2"><RiskScheduleFields form={form} setForm={setForm}/></div>
          <div className="col-span-2">
            <Label className="text-xs text-ink-secondary">Treatment</Label>
            <Select value={form.treatment} onValueChange={(v) => setForm({ ...form, treatment: v })}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["mitigate", "transfer", "avoid", "monitor"].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="new-risk-save" className="bg-primary hover:bg-primary/90">
            {saving ? "Saving…" : "Add to register"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
