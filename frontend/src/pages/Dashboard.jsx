import { useTableControls } from '@/components/TableControls';
import { ranks } from '@/lib/tableFilters';
import { useEffect, useState } from "react";
import {Link} from 'react-router-dom';
import api, { PREVIEW_MODE, API, formatError } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { HeaderActions, SecondaryAction, SortableHeader } from "@/components/Register";
import RegisterLoadError from "@/components/RegisterLoadError";
import { DueDate, OwnerCell } from "@/components/RegisterCells";
import { FileDown, X } from "lucide-react";
import DashboardManagement from "@/components/DashboardManagement";
import { toast } from "sonner";
import DashboardScopeSelector from "@/components/DashboardScopeSelector";
import RecordDrawer from "@/components/RecordDrawer";
import { SCHEMAS } from "@/lib/schemas";
import { loadClientDashboard, labelDashboardRows } from "@/lib/loadClientDashboard";
import {dashboardPilot} from '@/lib/dashboardWorkQueue';
import ClientWorkDashboard from '@/components/ClientWorkDashboard';
import DashboardPrograms from '@/components/DashboardPrograms';
import {isPrestigeReference} from '@/lib/reference';

const ORGANIZATION_SCOPE = {kind:'org'};
const SUBTITLE = "Program health, priorities and upcoming work.";

function OperationalTable({ items, upcoming = false, onOpen }) {
  const { user } = useAuth();
  const { currentClientId } = useOrg();
  const columns = [{key:'priority',label:'Priority',rank:ranks,value:r=>r.severity},{key:'type',label:'Type'},{key:'owner',label:'Owner'},{key:'due_date',label:upcoming?'Due / Review Date':'Due',dateKind:'due'},{key:'status',label:'Status'}];
  const table = useTableControls({ columns, rows:items, module:upcoming?'dashboard-watch':'dashboard-attention', scope:`${user?.user_id}:${currentClientId}` });
  // Same row grammar as the registers: the title opens the record, the whole row is a click target.
  return (
    <div className="ops-table overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-subtle border-b border-line"><tr>
          <SortableHeader table={table} columnKey={upcoming ? "due_date" : "priority"} />
          <th scope="col" className="tbl-head ops-table-static">Item</th><SortableHeader table={table} columnKey="type" />
          <SortableHeader table={table} columnKey="owner" />
          {!upcoming && <SortableHeader table={table} columnKey="due_date" />}
          <SortableHeader table={table} columnKey="status" />
        </tr></thead>
        <tbody className="divide-y divide-line">
          {table.apply(items).map(item => (
            <tr key={item.key} className="row-hover row-open" data-testid={`obligation-${item.key}`} onClick={() => onOpen(item)}>
              <td className="tbl-cell text-xs" data-label={upcoming ? "Due / Review Date" : "Priority"}>{upcoming ? <DueDate iso={item.due_date} /> : item.priority_label}</td>
              <td className="tbl-cell ops-table-item"><button type="button" className="register-record-link text-left" onClick={event => { event.stopPropagation(); onOpen(item); }}>{item.title}</button></td>
              <td className="tbl-cell text-ink-secondary" data-label="Type">{item.type}</td>
              <td className="tbl-cell" data-label="Owner"><OwnerCell label={item.owner} assigned={!(item.unassigned ?? item.owner === "Unassigned")} /></td>
              {!upcoming && <td className="tbl-cell" data-label="Due"><DueDate iso={item.due_date} /></td>}
              <td className="tbl-cell" data-label="Status">{item.status ? <StatusBadge value={item.status} /> : <span className="register-empty">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  const pilot=dashboardPilot(PREVIEW_MODE,currentClientId);
  const [workSelection,setWorkSelection]=useState(null);
  const workFilter=workSelection?.clientId===currentClientId?workSelection.filter:'all';

  const requestKey = JSON.stringify([currentClientId, scope, user?.user_id, revision]);
  useEffect(() => {
    if (!currentClientId) return;
    const controller = new AbortController();
    setError(null);
    setSelected(null);
    loadClientDashboard(api, { clientId: currentClientId, user, scope, signal: controller.signal, workQueue:pilot })
      .then(result => { if (!controller.signal.aborted) setSnapshot({ key: requestKey, result }); })
      .catch(err => { if (!controller.signal.aborted) setError({ key: requestKey, message: formatError(err) }); });
    return () => controller.abort();
  }, [currentClientId, scope, user, requestKey, pilot]);

  // Never render the previous tenant's response while a new request is loading.
  const data = snapshot?.key === requestKey ? snapshot.result : null;
  // Loading, error and no-client states keep the page header so the layout does not jump.
  const shell = body => <div><PageHeader title={pilot?`${currentClient?.name||'Client'} Dashboard`:'Dashboard'} subtitle={pilot?'Your GRC work, at a glance.':SUBTITLE} /><div className="section-body">{body}</div></div>;
  if (!currentClientId) return shell(<p className="text-sm text-ink-muted">Select a client to view its GRC program.</p>);
  if (error?.key === requestKey) return shell(<RegisterLoadError error={error.message} onRetry={() => setRevision(n => n + 1)} name="Dashboard" />);
  if (!data) return shell(<p role="status" className="text-sm text-ink-muted">Loading dashboard…</p>);

  const framework = frameworkSelection?.clientId === currentClientId && data.programs?.some(p=>p.key===frameworkSelection.key) ? frameworkSelection.key : null;
  const view = framework ? {kind:"framework",key:framework} : scope;
  function changeView(next) {
    setFrameworkSelection(next.kind==="framework"?{clientId:currentClientId,key:next.key}:null);
    setSelected(null);
    setScope(next.kind==="framework"?{kind:"org"}:next);
  }
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
    const {data:result}=await api.get('/dashboard',{params:{client_id:currentClientId,scope:scope.kind,user_id:scope.user_id,detail:key,offset,limit:25,...(pilot?{work_queue:true}:{})},signal});
    if(result.client_id!==currentClientId) throw new Error('Dashboard detail belongs to another client.');
    return {...result,items:pilot?result.items:labelDashboardRows(result.items,data.members)};
  }

  const drawer=selected&&selected.record.client_id===currentClientId&&<RecordDrawer key={selected.key} open onOpenChange={open=>{if(!open)setSelected(null);}}
    kind={selected.kind} record={selected.record} schema={SCHEMAS[selected.kind]?.fields} clientId={currentClientId} users={data.members}
    onSaved={()=>{setSelected(null);setRevision(n=>n+1);}}/>;
  if(pilot)return <>
    <ClientWorkDashboard key={requestKey} queue={data.queue} programs={data.programs} cisRows={data.cisRows} posture={data.posture} clientName={currentClient?.name||'Client'}
      programDetails={isPrestigeReference(currentClientId,user)?<DashboardPrograms clientId={currentClientId} programs={data.programs} onOpen={openItem} reference/>:null}
      filter={workFilter} onFilter={filter=>setWorkSelection({clientId:currentClientId,filter})} onOpen={openItem} loadDetail={loadDetail}/>{drawer}</>;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={SUBTITLE}
        action={
          <HeaderActions>
            <DashboardScopeSelector clientId={currentClientId} value={view} onChange={changeView} programs={data.programs || []} />
            <SecondaryAction label="Board Report PDF" icon={FileDown} onClick={downloadBoardReport} testid="download-board-report" />
          </HeaderActions>
        }
      />

      {scope.kind !== "org" && (
        <div className="page-gutter pt-3">
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

      {!data.onboardingCompleted && <div className="register-notice">
        <span><strong>Program setup not complete.</strong> <span className="text-ink-secondary">An empty work queue does not indicate a fully configured program.</span></span><Link className="register-link" to="/client-profile">Continue onboarding</Link>
      </div>}
      <DashboardManagement key={requestKey+":"+framework} clientId={currentClientId} posture={data.posture} programs={data.programs} framework={framework} onOpen={openItem} loadDetail={data.contract_version===2?loadDetail:undefined} Table={OperationalTable} reference />
      {drawer}
    </div>
  );
}
