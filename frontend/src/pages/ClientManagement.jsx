import { useTableControls, ColumnControl, TableFilterChips, FilterEmpty } from '@/components/TableControls';
import { tableColumns } from '@/lib/tableColumns';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import api, { formatError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import ClientDialog from "@/components/ClientDialog";
import TablePagination from '@/components/TablePagination';
import ClientRelationshipValue from '@/components/ClientRelationshipValue';
import ClientIdentityMark from '@/components/ClientIdentityMark';
import {primaryContact, grcLead} from '@/lib/clientRelationships';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

export default function ClientManagement() {
  const { user } = useAuth();
  const { switchClient, refresh } = useOrg();
  const navigate = useNavigate();
  const authorized = ["super_admin", "platform_admin"].includes(user?.role);
  const canCreateClient = user?.role === "super_admin";
  const [clients, setClients] = useState([]);
  const [programs, setPrograms] = useState({});
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null);
  useEffect(() => {
    if (!canCreateClient) setDialog(current => current?.client ? current : null);
  }, [canCreateClient]);
  const dialogOpener = useRef(null);
  const addClientButton = useRef(null);
  const returnFocus = event => { event.preventDefault(); (dialogOpener.current?.isConnected ? dialogOpener.current : addClientButton.current)?.focus(); };
  const [busy, setBusy] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const load = useCallback(async () => {
    if (!authorized) return;
    setLoading(true); setError("");
    try {
      const [records, directory] = await Promise.all([
        api.get("/clients", { params: { include_archived: true } }),
        api.get("/clients/directory", { params: { include_archived: true } }),
      ]);
      setClients(records.data);
      setPrograms(Object.fromEntries(directory.data.clients.map(c => [c.client_id, c.program_status])));
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  }, [authorized]);
  useEffect(() => { load(); }, [load]);
  const presetRows = useMemo(() => clients.filter(c => {
    if (status !== "all" && c.status !== status) return false;
    const lead = grcLead(c);
    return [c.name, c.industry, primaryContact(c).name, lead.name, lead.detail]
      .some(v => (v || "").toLowerCase().includes(query.trim().toLowerCase()));
  }), [clients, query, status]);
  const columns = tableColumns('client-management', { rows: clients, programs });
  const table = useTableControls({ columns, rows: clients, module: 'client-management', scope: `${user?.user_id}:platform` });
  const rows = table.apply(presetRows);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 25)));
  async function saved(client) {
    const created = dialog && !dialog.client;
    setDialog(null);
    toast.success(`${client.name} saved`, created ? {position:'top-right', closeButton:true, duration:10000, action:{label:'Open Client Profile',onClick:()=>{switchClient(client.client_id);navigate('/client-profile');}}} : undefined);
    await load(); await refresh();
  }
  async function archive(client) {
    const restoring = client.status === "archived";

    setConfirmation(null);
    setBusy(client.client_id);
    try {
      const { data } = await api.patch(`/clients/${client.client_id}`, { status: restoring ? "active" : "archived", expected_updated_at:client.updated_at??null });
      await saved(data);
    } catch (e) { toast.error(formatError(e)); }
    finally { setBusy(null); }
  }
  if (!authorized) return <div role="alert" className="page-content">Client Management is available to platform administrators only.</div>;
  return <div className="admin-page admin-clients-page">
    <PageHeader title="Client Management" subtitle="Manage client organizations, ownership, and lifecycle."
      action={canCreateClient && <Button ref={addClientButton} size="sm" onClick={event => {dialogOpener.current=event.currentTarget; setDialog({ client: null });}} data-testid="add-client-button" className="bg-primary hover:bg-primary/90"><Plus className="h-3.5 w-3.5 mr-1" /> Add Client</Button>} />
    <div className="admin-body">
      <section className="admin-panel" aria-label="Client organizations">
      <div className="admin-panel-head"><div><h2>Client organizations</h2><p>Ownership, program condition and client lifecycle.</p></div><span className="admin-record-meta">{clients.length} clients</span></div>
      <div className="admin-toolbar">
        <div className="admin-search"><Search aria-hidden="true" /><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search client, industry, GRC lead..." aria-label="Search client organizations" /></div>
        <select aria-label="Client status" value={status} onChange={e => setStatus(e.target.value)} className="rounded-md border border-line bg-surface-card p-2 text-sm">
          <option value="all">All statuses</option><option value="active">Active</option><option value="onboarding">Onboarding</option><option value="inactive">Inactive</option><option value="archived">Archived</option>
        </select>
        <span className="admin-matching">{rows.length} matching</span>
      </div>
      {error && <div role="alert">{error} <Button variant="outline" onClick={load}>Retry</Button></div>}
      <TableFilterChips table={table} />
      <div className="admin-table-wrap">
        <table className="admin-table admin-clients-table" data-testid="client-management-table">
          <thead className="bg-surface-subtle"><tr>{columns.map(c => <th key={c.key} className="tbl-cell text-left font-medium"><ColumnControl table={table} column={c} /></th>)}<th className="tbl-cell text-left font-medium">Actions</th></tr></thead>
          <tbody className="divide-y divide-line">
            {loading ? <tr><td colSpan={6} className="tbl-cell">Loading clients…</td></tr> : rows.slice((currentPage - 1) * 25, currentPage * 25).map(c => <tr key={c.client_id} className="row-hover">
              <td className="tbl-cell"><div className="admin-client-identity"><span className="admin-client-logo" aria-hidden="true"><ClientIdentityMark client={c} /></span><button className="admin-record-link" onClick={() => { switchClient(c.client_id); navigate("/dashboard"); }}>{c.name}</button></div></td>
              <td className="tbl-cell">{c.industry || "—"}</td>
              <td className="tbl-cell"><ClientRelationshipValue client={c} /></td>
              <td className="tbl-cell capitalize"><span className="admin-badge" data-status={programs[c.client_id]}>{(programs[c.client_id] || "—").replaceAll("_", " ")}</span></td>
              <td className="tbl-cell capitalize"><span className="admin-badge" data-status={c.status || 'active'}>{c.status || "active"}</span></td>
              <td className="tbl-cell"><div className="admin-row-actions">
                <Button size="sm" variant="outline" onClick={event => {dialogOpener.current=event.currentTarget; setDialog({ client: c });}}>Edit</Button>
                <Button size="sm" variant="outline" disabled={busy === c.client_id} onClick={event => {dialogOpener.current=event.currentTarget; setConfirmation(c);}}>{c.status === "archived" ? "Restore" : "Archive"}</Button>
              </div></td>
            </tr>)}
            {!loading && !rows.length && <tr><td colSpan={6} className="tbl-cell text-ink-help"><FilterEmpty table={table} name="clients" onClear={() => { setQuery(''); setStatus('all'); }} /></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="admin-pagination"><TablePagination page={currentPage} onPageChange={setPage} total={rows.length} /></div>
      </section>
    </div>
    <Dialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null); }}>
      <DialogContent onCloseAutoFocus={returnFocus}><DialogHeader><DialogTitle>{confirmation?.status === 'archived' ? 'Restore' : 'Archive'} {confirmation?.name}</DialogTitle>
        <DialogDescription>{confirmation?.status === 'archived' ? 'Restore this client to active views and permit authorized program work.' : 'Remove this client from active views. Assessments, evidence and history remain available; ordinary program changes are blocked until restored.'}</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setConfirmation(null)}>Cancel</Button><Button variant={confirmation?.status === 'archived' ? 'default' : 'destructive'} onClick={() => archive(confirmation)}>Confirm {confirmation?.status === 'archived' ? 'restore' : 'archive'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <ClientDialog onCloseAutoFocus={returnFocus} open={!!dialog && (!!dialog.client || canCreateClient)} client={dialog?.client || null} onOpenChange={open => { if (!open) setDialog(null); }} onCreated={saved} />
  </div>;
}
