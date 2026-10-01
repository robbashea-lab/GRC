import { useSearchParams } from 'react-router-dom';
import { HeaderActions, PrimaryAction, SecondaryAction, SearchField, ViewTabs, RegisterCount, SortableHeader } from "@/components/Register";
import { DueDate, HistoryDate, OwnerCell } from "@/components/RegisterCells";
import StatusBadge, { SeverityBadge } from "@/components/StatusBadge";
import RegisterLoadError from '@/components/RegisterLoadError';
import AssigneeSelect from '@/components/AssigneeSelect';
import TableLoadingRow from '@/components/TableLoadingRow';
import { useTableControls, TableFilterChips, FilterEmpty } from '@/components/TableControls';
import {vendorSignals,VENDOR_DATA_TYPES,ASSURANCE_TYPES} from '@/lib/vendorGovernance';
import {isReferencePresentation} from '@/lib/reference';
import {vendorViews,vendorMatches,vendorColumns,assuranceSummary,renewalAction} from '@/lib/brawndoVendors';
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
import { Download,AlertCircle,CalendarDays,ListChecks,UserRound,ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {BrawndoSurface,BrawndoPageHeader,BrawndoTiles,BrawndoChips,shortDate} from '@/components/BrawndoPage';
import './BrawndoVendors.css';

const CRIT_LABEL = { critical: "Critical", high: "High", medium: "Moderate", moderate: "Moderate", low: "Low" };
const CATEGORIES = ["SaaS", "Cloud / Hosting", "Managed Service Provider", "Security Provider", "HR / Payroll",
  "Financial", "Legal", "Marketing", "Communications", "Infrastructure", "Professional Services", "Other"];
const DATA_TYPES = VENDOR_DATA_TYPES;
// Register views. Their counts are the register's summary; Critical-only and High-only stay available
// through ?view= links and the Criticality column filter.
const VIEWS = [
  { id: "all_active", label: "All Active" },
  { id: "review_due", label: "Reviews Due" },
  { id: "review_overdue", label: "Reviews Past Due" },
  { id: "critical_high", label: "Critical / High" },
  { id: "contract_soon", label: "Contracts Expiring" },
  { id: "assurance", label: "Assurance Due" },
  { id: "inactive", label: "Inactive" },
];
const LINKED_VIEWS = { critical: "Critical", high: "High" };
function vendorMatchesView(v, view) {
  const status = v.status || "active";
  if (view !== "inactive" && view !== "all" && status === "inactive") return false;
  if (view === "critical") return v.criticality === "critical";
  if (view === "high") return v.criticality === "high";
  if (view === "critical_high") return ["critical", "high"].includes(v.criticality);
  if (view === "review_due") return !!v._reviewDue;
  if (view === "review_overdue") return !!v._reviewOverdue;
  if (view === "contract_soon") return !!v._contractSoon;
  if (view === "assurance") return !!v._assuranceIssue;
  if (view === "inactive") return status === "inactive";
  return true;
}



// Brawndo summary tiles. Each tile uses the register's own view rule and drives that view.
const PILOT_CHIPS=[['all_active','All active'],['review_due','Reviews due'],['review_overdue','Reviews past due'],['critical_high','Critical / High'],['contract_soon','Contracts expiring'],['renewal_soon','Renewals upcoming'],['assurance','Assurance follow-up due'],['inactive','Inactive']];
const names=list=>list.length?list.slice(0,2).map(v=>v.name).join(', ')+(list.length>2?` +${list.length-2}`:''):'';
const byDate=key=>(a,b)=>String(key(a)||'').localeCompare(String(key(b)||''));
export function vendorTiles(rows,now=new Date()){
  const m=view=>rows.filter(v=>vendorMatches(v,view,now));
  const crit=m('critical_high'),due=m('review_due').sort(byDate(v=>v.next_review)),assur=m('assurance'),exp=m('contract_soon');
  const today=now.toISOString().slice(0,10);
  const nextRenewal=rows.filter(v=>vendorMatches(v,'all_active',now)&&v.contract_renewal&&String(v.contract_renewal).slice(0,10)>=today).sort(byDate(v=>v.contract_renewal))[0];
  return [
    {id:'critical_high',label:'Critical / High',count:crit.length,tone:'critical',context:names(crit)||'No critical or high vendors'},
    {id:'review_due',label:'Review due in 30 days',count:due.length,tone:'attention',context:due.length?`${due[0].name}, ${shortDate(due[0].next_review)}${due.length>1?` +${due.length-1}`:''}`:'No reviews due'},
    {id:'assurance',label:'Assurance follow-up due',count:assur.length,tone:'attention',context:names(assur)||'No assurance follow-ups due'},
    {id:'contract_soon',label:'Contracts expiring',count:exp.length,tone:'attention',context:exp.length?names(exp):nextRenewal?`Next renewal: ${nextRenewal.name}, ${shortDate(nextRenewal.contract_renewal)}`:'No upcoming renewals'},
  ];
}

export default function VendorRegister() {
  const { user } = useAuth();
  const { currentClient, currentClientId } = useOrg();
  const pilot=isReferencePresentation(currentClientId,user);
  const [rows, setRows] = useState([]);
  const [reviews,setReviews] = useState([]);
  const generation=useRef(0);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [searchParams] = useSearchParams();
  // ?view= deep links (dashboard signals) open the register already filtered.
  const linkedView = VIEWS.some(v => v.id === searchParams.get("view")) || LINKED_VIEWS[searchParams.get("view")] || (pilot && vendorViews.some(v => v.id === searchParams.get("view"))) ? searchParams.get("view") : "all_active";
  const [view, setView] = useState(linkedView);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [drawer, setDrawer] = useState({ open: false, record: null });
  const [addOpen, setAddOpen] = useState(false);

  const canWrite = ["super_admin", "platform_admin"].includes(user?.role);
  const userMap = useMemo(() => { const m = {}; users.forEach((u) => { m[u.user_id] = u.name || u.email; }); return m; }, [users]);

  async function load() {
    if (!currentClientId) return;
    const token=++generation.current;
    setLoading(true); setLoadError('');
    try {
      const [v, u, r] = await Promise.all([
        api.get("/vendors", { params: { client_id: currentClientId } }).then((r) => r.data),
        api.get(`/clients/${currentClientId}/members`).then((r) => r.data),
        api.get("/reviews",{params:{client_id:currentClientId}}).then(r=>r.data),
      ]);
      if(token!==generation.current) return;
      setRows(v || []); setUsers(u || []); setReviews(r||[]);
    } catch (e) { if(token===generation.current){setRows([]);setLoadError(formatError(e));} }
    finally { if(token===generation.current)setLoading(false); }
  }
  useEffect(() => { const activeGeneration=generation; setRows([]);setUsers([]);setReviews([]);setDrawer({open:false,record:null});setAddOpen(false);setQ("");setView(linkedView);load();return()=>{activeGeneration.current++;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClientId]);

  const enriched = useMemo(() => rows.map(v=>{const value=vendorSignals(v,reviews);return {...value,_attention:pilot?['review_overdue','review_due','contract_soon','renewal_soon','assurance'].some(view=>vendorMatches(value,view)):value._reviewDue||value._contractSoon||value._assuranceIssue};}),[rows,reviews,pilot]);

  const presetRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return enriched.filter((v) => {
      if (!(pilot?vendorMatches:vendorMatchesView)(v, view)) return false;
      if (!s) return true;
      return (v.name || "").toLowerCase().includes(s) || (v.service || v.services || "").toLowerCase().includes(s) || (v.category || "").toLowerCase().includes(s) || (userMap[v.business_owner_id] || "").toLowerCase().includes(s);
    }).sort((a, b) => (b._attention - a._attention) || ({critical:0,high:1,medium:2,moderate:2,low:3}[a.criticality]??9) - ({critical:0,high:1,medium:2,moderate:2,low:3}[b.criticality]??9) || (a.name || "").localeCompare(b.name || ""));
  }, [enriched, q, view, userMap,pilot]);

  const tableSource = enriched.filter(r => r.client_id === currentClientId);
  const baseColumns = tableColumns('vendor-register', { rows: tableSource, users });
  const columns=pilot?vendorColumns(baseColumns):baseColumns;
  const table = useTableControls({ columns, rows: tableSource, module: 'vendor-register', scope: `${user?.user_id}:${currentClientId}`, onFilterChange: key => { if (key === 'status' || key === 'criticality') setView('all'); } });
  const filtered = table.apply(presetRows.filter(r => r.client_id === currentClientId));

  function selectView(id) { if(pilot){table.replaceState({...table.state,filters:{}});setView(id);return;}const key = ({all_active:'status',inactive:'status',critical:'criticality',high:'criticality',critical_high:'criticality',review_due:'next_review',review_overdue:'next_review',contract_soon:'contract_renewal'})[id]; if (key) table.setFilter(key, []); setView(id); }
  const counts = Object.fromEntries([...(pilot?vendorViews:VIEWS).map(v => v.id),'critical_high','unassigned','all', ...Object.keys(LINKED_VIEWS)].map(id => [id, tableSource.filter(v => (pilot?vendorMatches:vendorMatchesView)(v, id)).length]));
  const tabs = pilot?vendorViews:LINKED_VIEWS[view] ? [...VIEWS, { id: view, label: LINKED_VIEWS[view] }] : VIEWS;

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

  if(pilot){
    const chipDefs=[...PILOT_CHIPS,...(['critical','high'].includes(view)?[[view,view==='critical'?'Critical':'High']]:[])];
    const pick=id=>selectView(view===id?'all_active':id);
    return (
      <BrawndoSurface className="bvendors">
        <BrawndoPageHeader eyebrow={`${currentClient?.name||'Client'} · Third parties`} title="Vendors">
          <button type="button" className="bpage-btn" onClick={exportCsv} data-testid="vendors-export"><Download size={16} aria-hidden="true"/>Export CSV</button>
          {canWrite&&<button type="button" className="bpage-btn bpage-btn-primary" onClick={()=>setAddOpen(true)} data-testid="new-vendor">+ New vendor</button>}
        </BrawndoPageHeader>
        <BrawndoTiles label="Vendor summaries" loading={loading} tiles={vendorTiles(tableSource).map(t=>({...t,pressed:view===t.id,onClick:()=>pick(t.id)}))}/>
        <div className="register-toolbar">
          <SearchField label="Search vendors" placeholder="Search vendors…" value={q} onChange={setQ} testid="vendor-search" />
          <BrawndoChips label="Vendor views" chips={chipDefs.map(([id,label])=>({id,label,count:loading?null:counts[id],pressed:view===id,onClick:()=>selectView(id),testid:`vendor-view-${id}`}))}/>
          {(q||view==='all')&&<button type="button" className="bpage-chip" onClick={()=>{setQ('');selectView('all_active');}}>Clear filters</button>}
        </div>
        <div className="register-body">
          <TableFilterChips table={table} />
          <RegisterLoadError error={loadError} onRetry={load} name="vendors" />
          <div className="register-table-frame overflow-x-auto" role="region" aria-label="Vendors register" tabIndex={0}>
            <table className="w-full text-sm">
              <thead><tr>
                <SortableHeader table={table} columnKey="name" />
                <SortableHeader table={table} columnKey="criticality" />
                <SortableHeader table={table} columnKey="data_types" />
                <SortableHeader table={table} columnKey="business_owner_id" />
                <SortableHeader table={table} columnKey="next_review" />
                <SortableHeader table={table} columnKey="contract_renewal" />
                <SortableHeader table={table} columnKey="last_review" />
              </tr></thead>
              <tbody className="divide-y divide-line">
                {loading && <TableLoadingRow colSpan={7} />}
                {!loading && !loadError && filtered.length === 0 && <tr><td colSpan={7} className="tbl-cell text-center text-ink-help py-10"><FilterEmpty table={table} name="vendors" onClear={() => { setQ(''); setView('all_active'); }} /></td></tr>}
                {!loading && filtered.map((v, i) => {
                  const dt=v.data_types||[],closed=['inactive','terminated'].includes(v.status),assur=vendorMatches(v,'assurance');
                  const meta=[v.service||v.services,v.status&&v.status!=='active'?v.status[0].toUpperCase()+v.status.slice(1):null].filter(Boolean).join(' · ');
                  return (
                    <tr key={v.vendor_id} className={`row-hover row-open${vendorMatches(v,'review_overdue')?' bpage-late':''}`} onClick={() => setDrawer({ open: true, record: v })} data-testid={`vendor-row-${i}`}>
                      <td className="tbl-cell">
                        <button type="button" className="register-record-link hover:underline" onClick={e=>{e.stopPropagation();setDrawer({open:true,record:v});}}>{v.name}</button>
                        {meta&&<span className="bpage-meta">{meta}</span>}
                      </td>
                      <td className="tbl-cell"><SeverityBadge value={v.criticality} label={CRIT_LABEL[v.criticality]} /></td>
                      <td className="tbl-cell">{dt.length?<span className="bvendors-tags">{dt.map(d=><span key={d} className="bvendors-tag">{d}</span>)}</span>:<span className="register-empty">—</span>}</td>
                      <td className="tbl-cell"><OwnerCell people={users} id={v.business_owner_id} status={v.status} /></td>
                      <td className="tbl-cell">{v.next_review ? <DueDate iso={v.next_review} closed={closed} /> : <span className="register-empty">Not scheduled</span>}
                        {assur&&<button type="button" className="bvendors-note" onClick={e=>{e.stopPropagation();setDrawer({open:true,record:v,tab:'assurance'});}}>Assurance follow-up due</button>}</td>
                      <td className="tbl-cell">{v.contract_renewal ? <DueDate iso={v.contract_renewal} closed={closed} /> : <span className="register-empty">No renewal date</span>}{view==='renewal_soon'&&<span className="bpage-meta">{renewalAction(v).label}: {shortDate(renewalAction(v).date)}</span>}</td>
                      <td className="tbl-cell"><HistoryDate value={v.last_review} empty="Never reviewed" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading&&<p className="bpage-foot" data-testid="vendor-foot">Showing {filtered.length} of {counts.all_active} active vendors</p>}
          </div>
        </div>
        {drawer.open && <RecordDrawer open={drawer.open} onOpenChange={(x) => setDrawer((p) => ({ ...p, open: x }))} initialValues={{vendorTab:drawer.tab}} kind="vendors" record={drawer.record} schema={SCHEMAS.vendors.fields} clientId={currentClientId} users={users} onSaved={load} />}
        {addOpen&&<RecordDrawer open onOpenChange={setAddOpen} kind="vendors" schema={SCHEMAS.vendors.fields} clientId={currentClientId} users={users} onSaved={()=>{setAddOpen(false);load();}}/>}
      </BrawndoSurface>
    );
  }
  return (
    <div>
      <PageHeader
        title="Vendors"
        subtitle="Third-party services, criticality, assurance and review status."
        action={
          <HeaderActions>
            <SecondaryAction icon={Download} label="Export CSV" onClick={exportCsv} testid="vendors-export" />
            {canWrite && <PrimaryAction label="New Vendor" onClick={() => setAddOpen(true)} testid="new-vendor" />}
          </HeaderActions>
        }
      />
      {pilot&&<><div className="client-work-filters mx-[var(--register-gutter)] my-4" aria-label="Vendor summaries">{[['review_overdue','Overdue Reviews','pastDue',AlertCircle],['review_due','Reviews Due (30 Days)','due30',CalendarDays],['all_active','All Active','all',ListChecks],['unassigned','Unassigned','unassigned',UserRound]].map(([id,label,tone,Icon])=><button key={id} className={`client-work-filter filter-${tone}`} aria-pressed={view===id} onClick={()=>selectView(view===id?'all':id)}><Icon size={22} aria-hidden="true"/><span>{label}<strong>{loading?'—':counts[id]}</strong></span><ArrowRight size={16} aria-hidden="true"/></button>)}</div><div className="flex gap-2 mx-[var(--register-gutter)] mb-4" aria-label="Vendor criticality summaries">{['critical','high'].map(id=><Button key={id} size="sm" variant={view===id?'secondary':'outline'} aria-pressed={view===id} onClick={()=>selectView(view===id?'all':id)}>{id==='critical'?'Critical':'High'} · {counts[id]}</Button>)}</div></>}
      <div className="register-toolbar">
        <SearchField label="Search vendors" placeholder="Search vendors…" value={q} onChange={setQ} testid="vendor-search" />
        <ViewTabs views={tabs} active={view} onPick={selectView} counts={counts} label="Vendor views" testid="vendor-views" testIdPrefix="vendor-view-" />
        <RegisterCount shown={filtered.length} total={tableSource.length} />
        {pilot&&<Button size="sm" variant="ghost" onClick={()=>{setQ('');selectView('all');}}>Clear filters{view==='unassigned'?' · Unassigned':view==='all'?' · All relationships':''}</Button>}
      </div>
      <div className="register-body">
        <TableFilterChips table={table} />
        <RegisterLoadError error={loadError} onRetry={load} name="vendors" />
        <div className="register-table-frame bg-surface-card border border-line rounded-lg overflow-x-auto" {...(pilot?{role:'region','aria-label':'Vendors register',tabIndex:0}:{})}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <SortableHeader table={table} columnKey="name" />
                <SortableHeader table={table} columnKey="service" />
                <SortableHeader table={table} columnKey="criticality" />
                <SortableHeader table={table} columnKey="data_types" />
                <SortableHeader table={table} columnKey="business_owner_id" />
                <SortableHeader table={table} columnKey="last_review" />
                <SortableHeader table={table} columnKey="next_review" />
                <SortableHeader table={table} columnKey="contract_renewal" />
                <SortableHeader table={table} columnKey={pilot?'security_assurance':'status'} />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && <TableLoadingRow colSpan={9} />}
              {!loading && !loadError && filtered.length === 0 && <tr><td colSpan={9} className="tbl-cell text-center text-ink-help py-10"><FilterEmpty table={table} name="vendors" onClear={() => { setQ(''); setView('all_active'); }} /></td></tr>}
              {!loading && filtered.map((v, i) => {
                const dt = v.data_types || [];
                const renewal = pilot?v.contract_renewal:v.contract_renewal || v.contract_expiration || v.contract_end;
                return (
                  <tr key={v.vendor_id} className="row-hover row-open" onClick={() => setDrawer({ open: true, record: v })} data-testid={`vendor-row-${i}`}>
                    <td className="tbl-cell font-medium text-ink-primary">
                      <span className="inline-flex items-center gap-2">
                        {pilot?<button className="text-left hover:underline focus-visible:outline" onClick={e=>{e.stopPropagation();setDrawer({open:true,record:v});}}>{v.name}</button>:v.name}
                        {v._attention && <><span className="attention-dot" aria-hidden="true" title="Needs attention" /><span className="sr-only">Needs attention</span></>}
                      </span>
                    </td>
                    <td className="tbl-cell text-ink-secondary">{v.service || v.services || <span className="register-empty">—</span>}</td>
                    <td className="tbl-cell"><SeverityBadge value={v.criticality} label={CRIT_LABEL[v.criticality]} /></td>
                    <td className="tbl-cell text-ink-secondary">
                      {dt.length ? dt.slice(0, 2).join(", ") + (dt.length > 2 ? ` +${dt.length - 2}` : "") : <span className="register-empty">—</span>}
                    </td>
                    <td className="tbl-cell"><OwnerCell people={users} id={v.business_owner_id} status={v.status} /></td>
                    <td className="tbl-cell"><HistoryDate value={v.last_review} empty="Never reviewed" /></td>
                    <td className="tbl-cell">{v.next_review ? <DueDate iso={v.next_review} closed={v.status === "inactive"} /> : <span className="register-empty">Not scheduled</span>}</td>
                    <td className="tbl-cell">{renewal ? <DueDate iso={renewal} closed={v.status === "inactive"} /> : <span className="register-empty">{pilot?'No renewal date':'—'}</span>}{pilot&&view==='renewal_soon'&&<p className="text-xs text-ink-secondary">{renewalAction(v).label}: {renewalAction(v).date?.slice(0,10)}</p>}</td>
                    <td className="tbl-cell">{pilot?<button className="text-left text-sm hover:underline" onClick={e=>{e.stopPropagation();setDrawer({open:true,record:v,tab:'assurance'});}}>{assuranceSummary(v)[0]}{assuranceSummary(v).length>1?` +${assuranceSummary(v).length-1}`:''}</button>:<StatusBadge value={v.status || "active"} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {drawer.open && <RecordDrawer open={drawer.open} onOpenChange={(x) => setDrawer((p) => ({ ...p, open: x }))} initialValues={{vendorTab:drawer.tab}} kind="vendors" record={drawer.record} schema={SCHEMAS.vendors.fields} clientId={currentClientId} users={users} onSaved={load} />}
      {pilot?addOpen&&<RecordDrawer open onOpenChange={setAddOpen} kind="vendors" schema={SCHEMAS.vendors.fields} clientId={currentClientId} users={users} onSaved={()=>{setAddOpen(false);load();}}/>:<NewVendorDialog open={addOpen} onOpenChange={setAddOpen} clientId={currentClientId} users={users} onCreated={() => { setAddOpen(false); load(); }} />}
    </div>
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
