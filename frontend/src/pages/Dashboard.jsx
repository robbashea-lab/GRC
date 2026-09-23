import { useTableControls, ColumnControl } from '@/components/TableControls';
import { ranks } from '@/lib/tableFilters';
import { useEffect, useState } from "react";
import {Link} from 'react-router-dom';
import api, { PREVIEW_MODE, API, formatError } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { FileDown, X } from "lucide-react";
import DashboardManagement from "@/components/DashboardManagement";
import { toast } from "sonner";
import DashboardScopeSelector from "@/components/DashboardScopeSelector";
import RecordDrawer from "@/components/RecordDrawer";
import { SCHEMAS } from "@/lib/schemas";
import { loadClientDashboard, labelDashboardRows } from "@/lib/loadClientDashboard";
import { calendarDay } from "@/lib/clientDashboard";

const ORGANIZATION_SCOPE = {kind:'org'};

function OperationalTable({ items, upcoming = false, onOpen }) {
  const { user } = useAuth();
  const { currentClientId } = useOrg();
  const columns = [{key:'priority',label:'Priority',rank:ranks,value:r=>r.severity},{key:'type',label:'Type'},{key:'owner',label:'Owner'},{key:'due_date',label:upcoming?'Due / Review Date':'Due',dateKind:'due'},{key:'status',label:'Status'}];
  const table = useTableControls({ columns, rows:items, module:upcoming?'dashboard-watch':'dashboard-attention', scope:`${user?.user_id}:${currentClientId}` });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-subtle border-b border-line"><tr>
          <th className="tbl-head"><ColumnControl table={table} columnKey={upcoming ? "due_date" : "priority"} /></th>
          <th className="tbl-head">Item</th><th className="tbl-head"><ColumnControl table={table} columnKey="type" /></th>
          <th className="tbl-head"><ColumnControl table={table} columnKey="owner" /></th>
          {!upcoming && <th className="tbl-head"><ColumnControl table={table} columnKey="due_date" /></th>}
          <th className="tbl-head"><ColumnControl table={table} columnKey="status" /></th><th className="tbl-head">Action</th>
        </tr></thead>
        <tbody className="divide-y divide-line">
          {table.apply(items).map(item => (
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
  const [scopeSelection, setScopeSelection] = useState(null);
  const scope = scopeSelection?.clientId === currentClientId ? scopeSelection.value : ORGANIZATION_SCOPE;
  const setScope = value => setScopeSelection({clientId:currentClientId,value});
  const [frameworkSelection, setFrameworkSelection] = useState(null);

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
  if (!currentClientId) return <div className="page-content text-sm text-ink-muted">Select a client to view its GRC program.</div>;
  if (error?.key === requestKey) return <div className="page-content space-y-3" role="alert"><p>{error.message}</p><Button variant="outline" onClick={() => setRevision(n => n + 1)}>Retry dashboard</Button></div>;
  if (!data) return <div className="page-content text-sm text-ink-muted">Loading dashboard…</div>;

  const framework = frameworkSelection?.clientId === currentClientId && data.programs?.some(p=>p.key===frameworkSelection.key) ? frameworkSelection.key : null;
  const view = framework ? {kind:"framework",key:framework} : scope;
  function changeView(next) {
    setFrameworkSelection(next.kind==="framework"?{clientId:currentClientId,key:next.key}:null);
    setSelected(null);
    setScope(next.kind==="framework"?{kind:"org"}:next);
  }
  const clientSubtitle = scope.kind === "org"
    ? `${currentClient?.name || "All clients"} · Current GRC program status, priorities, and upcoming activity`
    : `${currentClient?.name || "All clients"} · ${data.scope_label || ""}`;

  async function downloadBoardReport() {
    if (PREVIEW_MODE) { toast.info("Board PDF generation requires the reporting server and is not available in this browser demo."); return; }
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

  async function openItem(item) {
    if (data.contract_version !== 2 && item.record) {setSelected(item);return;}
    try {
      const {data:record}=await api.get(`/${item.kind}/${encodeURIComponent(item.id)}`);
      if(record.client_id!==currentClientId) throw new Error('Record belongs to another client.');
      setSelected({...item,record});
    } catch(error) {toast.error(formatError(error));}
  }
  async function loadDetail(key,offset,signal) {
    const {data:result}=await api.get('/dashboard',{params:{client_id:currentClientId,scope:scope.kind,user_id:scope.user_id,detail:key,offset,limit:25},signal});
    if(result.client_id!==currentClientId) throw new Error('Dashboard detail belongs to another client.');
    return {...result,items:labelDashboardRows(result.items,data.members)};
  }

  return (
    <div>
      <PageHeader
        title="GRC Program Overview"
        subtitle={clientSubtitle}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DashboardScopeSelector clientId={currentClientId} value={view} onChange={changeView} programs={data.programs || []} />
            <Button variant="outline" onClick={downloadBoardReport} data-testid="download-board-report">
              <FileDown className="h-4 w-4 mr-1" /> Board Report PDF
            </Button>
          </div>
        }
      />

      {scope.kind !== "org" && (
        <div className="page-gutter pt-4">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-semantic-info-border bg-semantic-info-bg text-semantic-info text-xs font-medium"
            data-testid="active-scope-chip"
          >
            <span className="text-xs font-mono uppercase tracking-widest">Viewing</span>
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

      <div className="page-gutter pt-4 text-sm">
        {!data.onboardingCompleted ? <div className="border border-line rounded-lg bg-surface-card p-3"><strong>Program setup not complete.</strong> <span className="text-ink-secondary">An empty work queue does not indicate a fully configured program. </span><Link className="text-link underline" to="/client-profile">Continue onboarding</Link></div> : <Link className="text-link underline" to="/client-profile?tab=program">View Client Profile & program configuration</Link>}
      </div>
      <DashboardManagement key={requestKey+":"+framework} clientId={currentClientId} posture={data.posture} programs={data.programs} framework={framework} onOpen={openItem} loadDetail={data.contract_version===2?loadDetail:undefined} Table={OperationalTable} />
      {selected && selected.record.client_id === currentClientId && (
        <RecordDrawer key={selected.key} open onOpenChange={open => { if (!open) setSelected(null); }}
          kind={selected.kind} record={selected.record} schema={SCHEMAS[selected.kind]?.fields}
          clientId={currentClientId} users={data.members}
          onSaved={() => { setSelected(null); setRevision(n => n + 1); }} />
      )}
    </div>
  );
}
