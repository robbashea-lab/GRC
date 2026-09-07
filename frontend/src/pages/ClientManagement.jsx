import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import api, { PREVIEW_MODE, formatError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import ClientDialog from "@/components/ClientDialog";
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
  const [users, setUsers] = useState([]);
  const [programs, setPrograms] = useState({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(async () => {
    if (!authorized) return;
    setLoading(true); setError("");
    try {
      const [records, members, directory] = await Promise.all([
        api.get("/clients", { params: { include_archived: true } }),
        api.get("/users"),
        api.get("/clients/directory", { params: { include_archived: true } }),
      ]);
      setClients(records.data);
      setUsers(members.data.filter(u => ["super_admin", "platform_admin"].includes(u.role)));
      setPrograms(Object.fromEntries(directory.data.clients.map(c => [c.client_id, c.program_status])));
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  }, [authorized]);
  useEffect(() => { load(); }, [load]);
  const rows = useMemo(() => clients.filter(c => {
    if (status !== "all" && c.status !== status) return false;
    const lead = users.find(u => u.user_id === c.assigned_owner_id);
    return [c.name, c.industry, c.primary_contact, lead?.name, lead?.email]
      .some(v => (v || "").toLowerCase().includes(query.trim().toLowerCase()));
  }), [clients, users, query, status]);
  async function saved(client) {
    setDialog(null);
    toast.success(`${client.name} saved`);
    await load(); await refresh();
  }
  async function archive(client) {
    const restoring = client.status === "archived";
    if (!window.confirm(`${restoring ? "Restore" : "Archive"} ${client.name}?`)) return;
    setBusy(client.client_id);
    try {
      const { data } = await api.patch(`/clients/${client.client_id}`, { status: restoring ? "active" : "archived" });
      await saved(data);
    } catch (e) { toast.error(formatError(e)); }
    finally { setBusy(null); }
  }
  if (!authorized) return <div role="alert" className="p-8">Client Management is available to platform administrators only.</div>;
  return <div>
    <PageHeader title="Client Management" subtitle="Manage client organizations, ownership, and lifecycle."
      action={<Button size="sm" onClick={() => setDialog({ client: null })} data-testid="add-client-button" className="bg-brand-charcoal hover:bg-brand-charcoal-hover"><Plus className="h-3.5 w-3.5 mr-1" /> Add Client</Button>} />
    <div className="px-8 py-4 space-y-4">
      {PREVIEW_MODE && <p className="text-xs text-ink-help">Interactive demo: changes are temporary for this browser session. Reset Demo restores the sample data.</p>}
      <div className="flex items-center gap-3 flex-wrap">
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search client, industry, GRC lead..." aria-label="Search client organizations" className="max-w-sm" />
        <select aria-label="Client status" value={status} onChange={e => setStatus(e.target.value)} className="rounded-md border border-line bg-surface-card p-2 text-sm">
          <option value="all">All statuses</option><option value="active">Active</option><option value="onboarding">Onboarding</option><option value="inactive">Inactive</option><option value="archived">Archived</option>
        </select>
        <span className="text-xs text-ink-help">{rows.length} clients</span>
      </div>
      {error && <div role="alert">{error} <Button variant="outline" onClick={load}>Retry</Button></div>}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface-card">
        <table className="w-full text-sm" data-testid="client-management-table">
          <thead className="bg-surface-subtle"><tr>{["Client", "Industry", "GRC Lead", "Program Status", "Client Status", "Actions"].map(h => <th key={h} className="tbl-cell text-left font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={6} className="tbl-cell">Loading clients…</td></tr> : rows.map(c => <tr key={c.client_id} className="row-hover">
              <td className="tbl-cell"><button className="text-link hover:text-link-hover" onClick={() => { switchClient(c.client_id); navigate("/dashboard"); }}>{c.name}</button></td>
              <td className="tbl-cell">{c.industry || "—"}</td>
              <td className="tbl-cell">{users.find(u => u.user_id === c.assigned_owner_id)?.name || "Unassigned"}</td>
              <td className="tbl-cell capitalize">{(programs[c.client_id] || "—").replaceAll("_", " ")}</td>
              <td className="tbl-cell capitalize">{c.status || "active"}</td>
              <td className="tbl-cell"><div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setDialog({ client: c })}>Edit</Button>
                <Button size="sm" variant="outline" disabled={busy === c.client_id} onClick={() => archive(c)}>{c.status === "archived" ? "Restore" : "Archive"}</Button>
              </div></td>
            </tr>)}
            {!loading && !rows.length && <tr><td colSpan={6} className="tbl-cell text-ink-help">No clients match this filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
    <ClientDialog open={!!dialog} client={dialog?.client || null} onOpenChange={open => { if (!open) setDialog(null); }} users={users} onCreated={saved} />
  </div>;
}
