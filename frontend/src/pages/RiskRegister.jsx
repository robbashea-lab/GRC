import {isReferenceRegister} from '@/lib/reference';
import {brawndoWorkspacePilot} from '@/lib/brawndoWorkspacePilot';
import BrawndoRiskMatrix,{riskCoordinates} from '@/components/BrawndoRiskMatrix';
import {riskViews,riskMatches,riskColumns,pilotRiskStatus,newRiskDefaults} from '@/lib/brawndoRisks';
import {RiskCategoryField,RiskTreatmentField} from '@/components/BrawndoRiskFields';
import '@/components/ClientWorkDashboard.css';
import '@/components/BrawndoCisAssessment.css';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import AssigneeSelect from '@/components/AssigneeSelect';
import RegisterLoadError from '@/components/RegisterLoadError';
import TableLoadingRow from '@/components/TableLoadingRow';
import { useTableControls, TableFilterChips, FilterEmpty, ColumnControl } from '@/components/TableControls';
import {BrawndoSurface,BrawndoPageHeader,BrawndoChips,plural,shortDate,daysUntil} from '@/components/BrawndoPage';
import './BrawndoRisks.css';
import { tableColumns } from '@/lib/tableColumns';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {useSearchParams} from 'react-router-dom';
import managementRules from '@/lib/managementRules.json';
import api, { formatError } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import {RiskSourceFields,RiskScheduleFields} from "@/components/RiskGovernanceFields";
import RecordDrawer from "@/components/RecordDrawer";
import { SCHEMAS } from "@/lib/schemas";
import { riskMatchesView, riskStatus } from "@/lib/riskRegister";
import { PrimaryAction, SearchField, SortableHeader } from "@/components/Register";
import { HistoryDate, OwnerCell } from "@/components/RegisterCells";
import StatusBadge from "@/components/StatusBadge";
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

const CATEGORIES = SCHEMAS.risks.fields.find(f => f.name === 'category').options;

// Risk scores are likelihood (1–5) × impact (1–5); see assessedRisk in lib/grcWork.
export const RISK_SCORE_MAX=25;
const rid=r=>r.display_id||'ID pending';
function ScoreCell({r}){
  const a=assessedRisk(r),score=r.risk_score??a.risk_score,level=r.risk_level||a.risk_level;
  if(!score)return <span className="register-empty">Needs assessment</span>;
  return <div className="brisk-score"><span className={`brisk-num is-${level}`}>{score}</span><span className="sr-only">out of {RISK_SCORE_MAX}</span>{level&&<span className={`brisk-level is-${level}`}>{level[0].toUpperCase()+level.slice(1)}</span>}</div>;
}

export default function RiskRegister() {
  const [searchParams,setSearchParams]=useSearchParams();
  const portfolioSignificant=searchParams.get('portfolio')==='significant';
  const portfolioEntry=useRef(null);
  const { user } = useAuth();
  const { currentClient, currentClientId } = useOrg();
  const pilot=isReferenceRegister(currentClientId,user);
  const workspacePilot=brawndoWorkspacePilot(currentClientId,user);
  const [matrixSelection,setMatrixSelection]=useState(null);
  useEffect(()=>setMatrixSelection(null),[currentClientId]);
  const generation=useRef(0);
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  // ?view= deep links (dashboard signals) open the register already filtered.
  const linkedView = ["all_active","review_due","critical","high","significant","accepted","closed","upcoming",...(pilot?["overdue","unassigned","all"]:[])].includes(searchParams.get("view")) ? searchParams.get("view") : "all_active";
  const [view, setView] = useState(linkedView);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [drawer, setDrawer] = useState({ open: false, record: null });
  const [addOpen, setAddOpen] = useState(false);
  function closeLinkedDrawer(value){setDrawer(p=>({...p,open:value}));if(!value){const next=new URLSearchParams(searchParams);next.delete('id');setSearchParams(next,{replace:true});}}
  const linkedRecordId=searchParams.get('id'),linkedClientId=searchParams.get('client_id');
  const [recordLinkError,setRecordLinkError]=useState('');
  useEffect(()=>{
    if(!linkedRecordId||!currentClientId||drawer.open)return;
    const controller=new AbortController();setRecordLinkError('');
    if(linkedClientId&&linkedClientId!==currentClientId){setRecordLinkError('This link belongs to another client. Select that client before opening it.');return;}
    api.get('/risks/'+encodeURIComponent(linkedRecordId),{signal:controller.signal}).then(({data})=>{
      if(controller.signal.aborted)return;
      if(data.client_id!==currentClientId)throw new Error('Record belongs to another client.');
      setDrawer({open:true,record:data});
    }).catch(error=>{if(!controller.signal.aborted)setRecordLinkError(formatError(error));});
    return()=>controller.abort();
  },[linkedRecordId,linkedClientId,currentClientId,drawer.open]);

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
        api.get("/risks", { params: { client_id: currentClientId, ...(!pilot&&portfolioSignificant?{portfolio_significant:true}:{}) } }).then((r) => r.data),
        api.get(`/clients/${currentClientId}/members`).then((r) => r.data).catch(() => []),
      ]);
      if(version===generation.current){setRows((r || []).map(assessedRisk)); setUsers(u || []);}
    } catch (e) { if(version===generation.current){setRows([]);setLoadError(formatError(e));} }
    finally { if(version===generation.current)setLoading(false); }
  },[currentClientId,portfolioSignificant,pilot]);
  useEffect(() => { const scopeGeneration=generation;setRows([]);setUsers([]);setView(linkedView);setQ("");setDrawer({open:false,record:null});setAddOpen(false);load();return()=>{scopeGeneration.current++;}; }, [currentClientId,load]); // eslint-disable-line react-hooks/exhaustive-deps -- deep-linked view applies on client change only

  const matches = useCallback((r, id, day) => ['review_due','upcoming'].includes(id) ? riskMatches(r,id,day) : (pilot?riskMatches:riskMatchesView)(r,id,day),[pilot]);
  const now = Date.now();
  const presetRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if(portfolioSignificant&&(r.archived||r.archived_at||managementRules.terminal.includes(r.status)||!['high','critical'].includes(r.risk_level)))return false;
      if (!matches(r, view, new Date(now))) return false;
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
  }, [rows, q, view, userMap, now,portfolioSignificant,matches]);

  const tableSource = rows.filter(r => r.client_id === currentClientId);
  const baseColumns = tableColumns('risk-register', { rows: tableSource, users });
  const columns=riskColumns(baseColumns).map(c=>({...(!pilot?baseColumns.find(base=>base.key===c.key):c),label:c.key==='risk_score'?'Score / Level':c.label}));
  const table = useTableControls({ columns, rows: tableSource, module: pilot?'brawndo-risks':'risk-register', scope: `${user?.user_id}:${currentClientId}`, onFilterChange: (key,values) => { if(pilot){if(key===null||['status','next_review','risk_level','owner_id'].includes(key)&&values.length)setView('all');return;} if (key === null || key === 'status' && !values.length) setView('all_active'); else if (key === 'status') setView('all'); } });
  const matrixRows = table.apply(presetRows.filter(r => r.client_id === currentClientId));
  const filtered = workspacePilot&&matrixSelection?matrixRows.filter(r=>(riskCoordinates(r)||'unrated')===matrixSelection):matrixRows;
  useEffect(()=>{
    const key=portfolioSignificant?currentClientId:null;
    if(key&&portfolioEntry.current!==key){
      table.replaceState({filters:{}});setView('all_active');setQ('');
    }
    portfolioEntry.current=key;
  },[portfolioSignificant,currentClientId,table]);

  function selectView(id) { table.replaceState({...table.state,filters:{...table.state.filters,status:[],next_review:[],risk_level:[],owner_id:[]}});setView(id);if(portfolioSignificant){const next=new URLSearchParams(searchParams);next.delete('portfolio');setSearchParams(next,{replace:true});} }

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

  return <BrawndoSurface className="approved-risk-register">
      <BrawndoPageHeader eyebrow={`${currentClient?.name||'Client'} · Risk register`} title="Risks">
        <button type="button" className="bpage-btn" onClick={()=>setMatrixOpen(true)} data-testid="risk-matrix-btn"><Grid3x3 size={16} aria-hidden="true"/>Risk Scale &amp; Matrix</button>
        <button type="button" className="bpage-btn" onClick={exportCsv} data-testid="risks-export"><Download size={16} aria-hidden="true"/>Export CSV</button>
        {canWrite&&<PrimaryAction label="New Risk" onClick={()=>setAddOpen(true)} testid="new-risk"/>}
      </BrawndoPageHeader>
      {portfolioSignificant&&<p className="bpage-notice" role="status" data-testid="portfolio-risk-filter">Active High / Critical Risks · includes accepted Risks <button className="register-link" onClick={()=>{const next=new URLSearchParams(searchParams);next.delete('portfolio');setSearchParams(next,{replace:true});}}>Clear portfolio filter</button></p>}
      {view==='significant'&&<p className="bpage-notice" role="status" data-testid="significant-risk-filter">High / Critical Risks <button className="register-link" onClick={()=>{selectView('all_active');const next=new URLSearchParams(searchParams);next.delete('view');setSearchParams(next,{replace:true});}}>Clear risk filter</button></p>}
      {workspacePilot&&<BrawndoRiskMatrix rows={matrixRows} selected={matrixSelection} onSelect={setMatrixSelection} loading={loading}/>}
      <div className="register-toolbar">
          <SearchField label="Search risks" placeholder="Search risks…" value={q} onChange={setQ} testid="risk-search"/>
          <BrawndoChips label="Risk views" chips={riskViews.map(v=>({id:v.id,label:v.label[0]+v.label.slice(1).toLowerCase(),count:loading?null:tableSource.filter(r=>matches(r,v.id,new Date(now))).length,pressed:view===v.id,onClick:()=>selectView(v.id),testid:`risk-view-${v.id}`}))}/>
          <div className="brisk-filters"><ColumnControl table={table} columnKey="category"/><ColumnControl table={table} columnKey="risk_level"/></div>
      </div>
      <div className="register-body">
        <TableFilterChips table={table}/>
        <RegisterLoadError error={loadError} onRetry={load} name="risks"/>
        <div className="register-table-frame bg-surface-card border border-line rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[980px]">
            <thead><tr>
              <th scope="col" className="tbl-head">Risk ID</th>
              <SortableHeader table={table} columnKey="title"/>
              <SortableHeader table={table} columnKey="risk_score"/>
              <SortableHeader table={table} columnKey="owner_id"/>
              <SortableHeader table={table} columnKey="status"/>
              <SortableHeader table={table} columnKey="next_review"/>
              <SortableHeader table={table} columnKey="last_reviewed"/>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {loading&&<TableLoadingRow colSpan={7}/>}
              {!loading&&!loadError&&filtered.length===0&&<tr><td colSpan={7} className="tbl-cell text-center text-ink-help py-10"><FilterEmpty table={table} name="risks" onClear={()=>{setQ('');setView('all_active');}}/></td></tr>}
              {!loading&&filtered.map((r,i)=>{const closed=riskMatches(r,'closed'),d=daysUntil(r.next_review,new Date(now));return(
                <tr key={r.risk_id} onClick={()=>setDrawer({open:true,record:r})} className={`row-hover row-open${!closed&&d!==null&&d<0?' bpage-late':''}`} data-testid={`risk-row-${i}`}>
                  <td className="tbl-cell font-mono text-xs text-ink-help whitespace-nowrap">{rid(r)}</td>
                  <td className="tbl-cell font-medium text-ink-primary min-w-0 max-w-sm"><button className="register-record-link text-left" onClick={e=>{e.stopPropagation();setDrawer({open:true,record:r});}}>{r.title}</button></td>
                  <td className="tbl-cell"><ScoreCell r={r}/></td>
                  <td className="tbl-cell"><OwnerCell people={users} id={r.owner_id} status={r.status}/></td>
                  <td className="tbl-cell"><StatusBadge value={r.status||'open'} label={(pilot?pilotRiskStatus:riskStatus)(r.status||'open')}/>{pilot&&r.status==='accepted'&&!riskMatches(r,'accepted')&&<p className="text-xs text-ink-secondary">Acceptance needs review</p>}</td>
                  <td className="tbl-cell whitespace-nowrap">{r.next_review?<><strong className="brisk-date">{shortDate(r.next_review)}</strong><span className="bpage-meta">{closed?'Closed':d===0?'Today':d<0?`${plural(-d,'day')} overdue`:`in ${plural(d,'day')}`}</span></>:<span className="register-empty">Not scheduled</span>}</td>
                  <td className="tbl-cell"><HistoryDate value={r.last_reviewed} empty="Never reviewed"/></td>
                </tr>);})}
            </tbody>
          </table>
          {!loading&&<p className="bpage-foot" data-testid="risk-count">Showing {filtered.length} of {plural(tableSource.length,'risk')}</p>}
        </div>
      </div>
      {recordLinkError&&<p role="alert">{recordLinkError}</p>}
      {drawer.open&&<RecordDrawer open={drawer.open&&drawer.record?.client_id===currentClientId} onOpenChange={closeLinkedDrawer} kind="risks" record={drawer.record} schema={SCHEMAS.risks.fields} clientId={currentClientId} users={users} onSaved={load}/>}
      <RiskMatrixModal open={matrixOpen} onOpenChange={setMatrixOpen}/>
      {addOpen&&<NewRiskDialog pilot={pilot} open={addOpen} onOpenChange={setAddOpen} clientId={currentClientId} users={users} onCreated={()=>{setAddOpen(false);load();}} onOpenMatrix={()=>setMatrixOpen(true)}/>}
    </BrawndoSurface>;
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

function NewRiskDialog({ pilot=false, open, onOpenChange, clientId, users, onCreated, onOpenMatrix }) {
  const [form, setForm] = useState({
    title: "", category: "cybersecurity", description: "", impact_description: "", source_type: "manual",
    likelihood_score: null, impact_score: null, owner_id: "", treatment: "mitigate", review_cadence:"annual", next_review:"",
  });
  const [saving, setSaving] = useState(false);
  const baseline=useRef({}),[discard,setDiscard]=useState(false);
  const createLock=useRef(false);
  const dirty=pilot&&JSON.stringify(form)!==JSON.stringify(baseline.current);
  const close=value=>{if(value)onOpenChange(true);else if(!saving){if(dirty)setDiscard(true);else onOpenChange(false);}};
  useEffect(()=>{if(!open||!dirty)return;const warn=e=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[open,dirty]);
  useEffect(() => {
    if(open&&pilot){const next=newRiskDefaults();setForm(next);baseline.current=next;setDiscard(false);return;}
    if (open) setForm({
      title: "", category: "cybersecurity", description: "", impact_description: "", source_type: "manual",
      likelihood_score: null, impact_score: null, owner_id: "", treatment: "mitigate", review_cadence:"annual", next_review:"",
    });
  }, [open,pilot]);
  const score = assessedRisk(form).risk_score;
  const level = levelFromScore(score);
  const tone = LEVEL_TONE[level] || LEVEL_TONE.low;

  async function save() {
    if(createLock.current)return;
    if (!form.title.trim() || !form.description.trim() || !form.category || !form.likelihood_score || !form.impact_score) { toast.error("Title, category, description, likelihood and impact are required"); return; }
    if (["review","finding","vendor","audit"].includes(form.source_type) && !form.source_id) { toast.error("Select the source record"); return; }
    createLock.current=true;setSaving(true);
    try {
      const body = { ...form, client_id: clientId };
      if (!body.owner_id) delete body.owner_id;
      await api.post("/risks", body);
      toast.success(`${form.title} added to the register`);
      onCreated?.();
    } catch (e) { toast.error(formatError(e)); }
    finally { createLock.current=false;setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={pilot?close:onOpenChange}>
      <DialogContent onPointerDownOutside={pilot?e=>e.preventDefault():undefined} className={pilot?"brawndo-cis-assessment bg-surface-card":"max-w-2xl max-h-[90vh] overflow-y-auto"} data-testid="new-risk-dialog">
        <DialogHeader className={pilot?"px-6 py-4 pr-12 border-b border-line":undefined}>
          <DialogTitle>New Risk</DialogTitle>
          <DialogDescription>Score and level are calculated automatically.</DialogDescription>
        </DialogHeader>
        <div className={pilot?"grid grid-cols-2 gap-4 overflow-y-auto min-h-0 flex-1 px-6 py-4":"grid grid-cols-2 gap-3 py-2"}>
          <div className="col-span-2">
            <Label htmlFor="new-risk-title" className="text-xs text-ink-secondary">Risk title *</Label>
            <Input id="new-risk-title" data-testid="new-risk-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="text-sm" />
          </div>
          <div>
            {pilot?<RiskCategoryField form={form} setForm={setForm}/>:<><Label className="text-xs text-ink-secondary">Category *</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger aria-label="Risk category" className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select></>}
          </div>
          <RiskSourceFields pilot={pilot} form={form} setForm={setForm} clientId={clientId}/>
          <div className="col-span-2">
            <Label className="text-xs text-ink-secondary">Risk description *</Label>
            <Textarea aria-label="Risk description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="text-sm" rows={2} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-ink-secondary">Impact description</Label>
            <Textarea aria-label="Impact description" value={form.impact_description} onChange={(e) => setForm({ ...form, impact_description: e.target.value })} className="text-sm" rows={2} />
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
            <Label className="text-xs text-ink-secondary">{pilot?"Assigned Owner":"Owner"}</Label>
            <AssigneeSelect showManagePeople={false} label={pilot?"Assigned Owner":"Owner"} clientId={clientId} value={form.owner_id} onChange={v=>setForm({...form,owner_id:v})} users={users}/>
          </div>
          <div className="col-span-2"><RiskScheduleFields pilot={pilot} creation form={form} setForm={setForm}/></div>
          <div className="col-span-2">
            {pilot?<RiskTreatmentField form={form} setForm={setForm}/>:<><Label className="text-xs text-ink-secondary">Treatment</Label>
            <Select value={form.treatment} onValueChange={(v) => setForm({ ...form, treatment: v })}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["mitigate", "transfer", "avoid", "monitor"].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select></>}
          </div>
        </div>
        <DialogFooter className={pilot?"px-6 py-3 border-t border-line shrink-0":undefined}>
          <Button variant="outline" onClick={() => pilot?close(false):onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="new-risk-save" className="bg-primary hover:bg-primary/90">
            {saving ? "Saving…" : "Add to register"}
          </Button>
        </DialogFooter>
      </DialogContent>
      {pilot&&<AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogTitle>Discard new Risk?</AlertDialogTitle><AlertDialogDescription>This unsaved Risk has not been added to the register.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={()=>{setDiscard(false);onOpenChange(false);}}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
    </Dialog>
  );
}
