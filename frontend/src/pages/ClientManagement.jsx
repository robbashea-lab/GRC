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
import {primaryContact, grcLead} from '@/lib/clientRelationships';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function ClientManagement() {
  const { user } = useAuth();
  const { switchClient, refresh } = useOrg();
  const navigate = useNavigate();
  const authorized = ["super_admin", "platform_admin"].includes(user?.role);
  const [clients, setClients] = useState([]);
  const [programs, setPrograms] = useState({});
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null);
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
  return <div>
    <PageHeader title="Client Management" subtitle="Manage client organizations, ownership, and lifecycle."
      action={<Button ref={addClientButton} size="sm" onClick={event => {dialogOpener.current=event.currentTarget; setDialog({ client: null });}} data-testid="add-client-button" className="bg-primary hover:bg-primary/90"><Plus className="h-3.5 w-3.5 mr-1" /> Add Client</Button>} />
    <div className="page-gutter py-4 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search client, industry, GRC lead..." aria-label="Search client organizations" className="max-w-sm" />
        <select aria-label="Client status" value={status} onChange={e => setStatus(e.target.value)} className="rounded-md border border-line bg-surface-card p-2 text-sm">
          <option value="all">All statuses</option><option value="active">Active</option><option value="onboarding">Onboarding</option><option value="inactive">Inactive</option><option value="archived">Archived</option>
        </select>
        <span className="text-xs text-ink-help">{rows.length} clients</span>
      </div>
      {error && <div role="alert">{error} <Button variant="outline" onClick={load}>Retry</Button></div>}
      <TableFilterChips table={table} />
      <div className="register-table-frame overflow-x-auto rounded-lg border border-line bg-surface-card">
        <table className="w-full text-sm" data-testid="client-management-table">
          <thead className="bg-surface-subtle"><tr>{columns.map(c => <th key={c.key} className="tbl-cell text-left font-medium"><ColumnControl table={table} column={c} /></th>)}<th className="tbl-cell text-left font-medium">Actions</th></tr></thead>
          <tbody className="divide-y divide-line">
            {loading ? <tr><td colSpan={6} className="tbl-cell">Loading clients…</td></tr> : rows.slice((currentPage - 1) * 25, currentPage * 25).map(c => <tr key={c.client_id} className="row-hover">
              <td className="tbl-cell"><button className="text-link hover:text-link-hover" onClick={() => { switchClient(c.client_id); navigate("/dashboard"); }}>{c.name}</button></td>
              <td className="tbl-cell">{c.industry || "—"}</td>
              <td className="tbl-cell"><ClientRelationshipValue client={c} /></td>
              <td className="tbl-cell capitalize">{(programs[c.client_id] || "—").replaceAll("_", " ")}</td>
              <td className="tbl-cell capitalize">{c.status || "active"}</td>
              <td className="tbl-cell"><div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={event => {dialogOpener.current=event.currentTarget; setDialog({ client: c });}}>Edit</Button>
                <Button size="sm" variant="outline" disabled={busy === c.client_id} onClick={event => {dialogOpener.current=event.currentTarget; setConfirmation(c);}}>{c.status === "archived" ? "Restore" : "Archive"}</Button>
              </div></td>
            </tr>)}
            {!loading && !rows.length && <tr><td colSpan={6} className="tbl-cell text-ink-help"><FilterEmpty table={table} name="clients" onClear={() => { setQuery(''); setStatus('all'); }} /></td></tr>}
          </tbody>
        </table>
      </div>
      <TablePagination page={currentPage} onPageChange={setPage} total={rows.length} />
    </div>
    <Dialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null); }}>
      <DialogContent onCloseAutoFocus={returnFocus}><DialogHeader><DialogTitle>{confirmation?.status === 'archived' ? 'Restore' : 'Archive'} {confirmation?.name}</DialogTitle>
        <DialogDescription>{confirmation?.status === 'archived' ? 'Restore this client to active views and permit authorized program work.' : 'Remove this client from active views. Assessments, evidence and history remain available; ordinary program changes are blocked until restored.'}</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setConfirmation(null)}>Cancel</Button><Button variant={confirmation?.status === 'archived' ? 'default' : 'destructive'} onClick={() => archive(confirmation)}>Confirm {confirmation?.status === 'archived' ? 'restore' : 'archive'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <ClientDialog onCloseAutoFocus={returnFocus} open={!!dialog} client={dialog?.client || null} onOpenChange={open => { if (!open) setDialog(null); }} onCreated={saved} />
  </div>;
}
