import TableLoadingRow from '@/components/TableLoadingRow';
import { HeaderActions, PrimaryAction, SearchField, ViewTabs, RegisterCount, SortableHeader } from "@/components/Register";
import { DueDate, OwnerCell } from "@/components/RegisterCells";
import StatusBadge, { SeverityBadge } from "@/components/StatusBadge";
import RegisterLoadError from '@/components/RegisterLoadError';
import { useTableControls, TableFilterChips, FilterEmpty } from '@/components/TableControls';
import { tableColumns } from '@/lib/tableColumns';
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {useActionRegisterData} from '@/lib/useActionRegisterData';
import { ACTION_VIEWS, SOURCE_TYPES, actionMatches, actionOrder, actionStatus, taskSource } from "@/lib/actionItems";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RecordDrawer from "@/components/RecordDrawer";
import { SCHEMAS } from "@/lib/schemas";
import {isReferenceRegister} from '@/lib/reference';
import BrawndoActionItems from './BrawndoActionItems';

// Only authoritative Task records are displayed here.
const VIEWS = ACTION_VIEWS.map(id => ({id, label: id === "active" ? "Active" : id === "overdue" ? "Overdue" : id === "completed" ? "Completed" : actionStatus(id)}));


const closedTask = ["done", "cancelled"];



function priorityLabel(p) {
  if (!p) return "—";
  const map = { critical: "Immediate", high: "High", medium: "Moderate", moderate: "Moderate", low: "Low", immediate: "Immediate" };
  return map[p] || (p.charAt(0).toUpperCase() + p.slice(1));
}

export default function ActionItems() {
  const {currentClientId}=useOrg(),{user}=useAuth();
  const [params,setParams]=useSearchParams(),previous=useRef(currentClientId);
  useEffect(()=>{
    const old=previous.current;previous.current=currentClientId;
    if(old!==currentClientId&&(isReferenceRegister(old,user)||isReferenceRegister(currentClientId,user))){
      const next=new URLSearchParams(params);['owner','unassigned','finding_id','id','view','q'].forEach(k=>next.delete(k));setParams(next,{replace:true});
    }
  },[currentClientId,user,params,setParams]);
  return <BrawndoActionItems key={currentClientId}/>;
}
function OriginalActionItems() {
  const location = useLocation();
  const { currentClientId } = useOrg();
  const { user } = useAuth();
  const {data,users,loading,error:loadError,load}=useActionRegisterData(currentClientId);
  const rows=useMemo(()=>(data.tasks||[]).map(task=>{
    const source=taskSource(task,data);
    return {...task,_kind:"task",id:task.task_id,raw:task,owner_id:task.assignee_id??task.owner_id,
      priority:task.priority||"medium",status:task.status||"open",source:source.label,source_type:source.type,sourceRecord:source,closed:closedTask};
  }),[data]);
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const view = (ACTION_VIEWS.includes(params.get("view")) ? params.get("view") : "active");
  const sort = params.get("sort") || "operational";
  const setParam = (key, value) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }); };
  const setQ = value => setParam("q", value);
  const setView = value => setParam("view", value);
  const [drawer, setDrawer] = useState({ open: false, kind: null, record: null });

  const canWrite = ["super_admin", "platform_admin", "client_grc_manager", "client_contributor"].includes(user?.role);
  const userMap = useMemo(() => {
    const m = {};
    users.forEach((u) => { m[u.user_id] = u.name || u.email; });
    return m;
  }, [users]);

  useEffect(() => { setDrawer({ open: false, kind: null, record: null }); }, [currentClientId, location.pathname]);

  const presetRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.raw.client_id !== currentClientId || !actionMatches(r,view)) return false;
      if (!s) return true;
      return (r.title || "").toLowerCase().includes(s)
        || (r.description || "").toLowerCase().includes(s)
        || [r.review_id,r.finding_id,r.risk_id,r.vendor_id,r.policy_id].some(id=>id?.toLowerCase().includes(s))
        || (r.id || "").toLowerCase().includes(s)
        || (r.source || "").toLowerCase().includes(s)
        || (userMap[r.owner_id] || "").toLowerCase().includes(s);
    }).sort((a,b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "priority" ? ({critical:4,high:3,medium:2,low:1}[b.priority] || 0) - ({critical:4,high:3,medium:2,low:1}[a.priority] || 0) : sort === "due" ? (a.due_date || "9999").localeCompare(b.due_date || "9999") : actionOrder(a,b));
  }, [rows, view, q, userMap, currentClientId, sort]);

  const tableSource = rows.filter(r => r.raw.client_id === currentClientId);
  const columns = tableColumns('action-items', { rows: tableSource, users,  });
  const table = useTableControls({ columns, rows: tableSource, module: 'action-items', scope: `${user?.user_id}:${currentClientId}` });
  const carriedClient = useRef(currentClientId);
  const carriedOwner = params.get("owner"), carriedUnassigned = params.get("unassigned");
  useEffect(() => {
    if (carriedClient.current !== currentClientId) {
      carriedClient.current=currentClientId;
      const next=new URLSearchParams(params);next.delete("owner");next.delete("unassigned");setParams(next,{replace:true});return;
    }
    if (carriedUnassigned==="1") table.setFilter("owner_id",["__empty__"]);
    else if (carriedOwner) table.setFilter("owner_id",[carriedOwner==="__me__"?user.user_id:carriedOwner]);
    // URL scope feeds the same shared owner filter; tenant changes discard it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[currentClientId,carriedOwner,carriedUnassigned]);
  const filtered = table.apply(presetRows);

  const counts = Object.fromEntries(ACTION_VIEWS.map(v=>[v,tableSource.filter(r=>actionMatches(r,v)).length]));

  function open(row) {
    setDrawer({ open: true, kind: "tasks", record: row.raw });
  }

  return (
    <div>
      <PageHeader
        title="Action Items"
        subtitle="Remediation and operational work across Findings, Risks, Reviews and assessments."
        action={
          canWrite && <HeaderActions><PrimaryAction label="New Action Item" onClick={() => setDrawer({ open: true, kind: "tasks", record: null })} testid="new-action-item" /></HeaderActions>
        }
      />
      <div className="register-toolbar">
        <SearchField label="Search action items" placeholder="Search action items…" value={q} onChange={setQ} testid="ai-search" />
        <ViewTabs views={VIEWS} active={view} counts={counts} label="Action Item views" testid="ai-views" testIdPrefix="ai-view-"
          onPick={id => { table.setFilter(id === 'overdue' ? 'due_date' : 'status', []); setView(id); }} />
        <Select value={sort} onValueChange={v => { table.setSort(null); setParam("sort", v); }}><SelectTrigger className="w-40" aria-label="Sort actions"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="operational">Operational order</SelectItem><SelectItem value="due">Due date</SelectItem><SelectItem value="priority">Priority</SelectItem><SelectItem value="title">Title</SelectItem></SelectContent></Select>
        <RegisterCount shown={filtered.length} total={rows.length} />
      </div>

      <div className="register-body">
        <TableFilterChips table={table} />
        <RegisterLoadError error={loadError} onRetry={load} name="action items" />
        <div className="register-table-frame bg-surface-card border border-line rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <SortableHeader table={table} columnKey="title" />
                <SortableHeader table={table} columnKey="priority" />
                <SortableHeader table={table} columnKey="owner_id" />
                <SortableHeader table={table} columnKey="due_date" />
                <SortableHeader table={table} columnKey="status" />
                <SortableHeader table={table} columnKey="source_type" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && <TableLoadingRow colSpan={6} />}
              {!loading && !loadError && filtered.length === 0 && (
                <tr><td colSpan={6} className="tbl-cell text-center text-ink-help py-10"><FilterEmpty table={table} name="action items" onClear={() => { const next=new URLSearchParams(params);next.delete('q');next.set('view','all');setParams(next,{replace:true}); }} /></td></tr>
              )}
              {!loading && filtered.map((r, i) => {
                const typeLabel = SOURCE_TYPES[r.source_type] || 'Historical source';
                return (
                  <tr key={`${r._kind}-${r.id}`} className="row-hover row-open" onClick={() => open(r)} data-testid={`ai-row-${i}`}>
                    <td className="tbl-cell font-medium text-ink-primary">
                      <button type="button" className="register-record-link" onClick={e => { e.stopPropagation(); open(r); }}>{r.title}</button>
                    </td>
                    <td className="tbl-cell"><SeverityBadge value={(r.priority || "medium").toLowerCase()} label={priorityLabel(r.priority)} /></td>
                    <td className="tbl-cell"><OwnerCell people={users} id={r.owner_id} status={r.status} /></td>
                    <td className="tbl-cell"><DueDate iso={r.due_date} closed={r.closed.includes(r.status)} /></td>
                    <td className="tbl-cell"><StatusBadge value={r.status} label={actionStatus(r.status)} /></td>
                    <td className="tbl-cell !whitespace-normal">
                      {r.sourceRecord.target && (SCHEMAS[r.sourceRecord.kind]||r.sourceRecord.kind==='assessments')
                        ? <button className="register-link" onClick={e=>{e.stopPropagation();setDrawer({open:true,kind:r.sourceRecord.kind,record:r.sourceRecord.target});}}>{r.source}</button>
                        : <span className="text-ink-secondary">{r.sourceRecord.id?'Linked record unavailable':r.source}</span>}
                      {r.source !== typeLabel && <span className="register-subline">{typeLabel}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {drawer.kind && (
        <RecordDrawer
          open={drawer.open && (!drawer.record || drawer.record.client_id === currentClientId)}
          onOpenChange={(v) => setDrawer((p) => ({ ...p, open: v }))}
          kind={drawer.kind}
          schema={SCHEMAS[drawer.kind]?.fields}
          clientId={currentClientId}
          users={users}
          record={drawer.record}
          onSaved={load}
        />
      )}
    </div>
  );
}
