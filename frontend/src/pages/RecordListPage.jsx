import { useEffect, useMemo, useState } from "react";
import api, { formatError, API } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import RecordDrawer from "@/components/RecordDrawer";
import { SCHEMAS } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

export default function RecordListPage({ kind }) {
  const schema = SCHEMAS[kind];
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const canWrite = ["super_admin", "platform_admin", "client_contributor"].includes(user?.role);
  const canDelete = ["super_admin", "platform_admin"].includes(user?.role);

  const load = async () => {
    if (!currentClientId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/${kind}`, { params: { client_id: currentClientId } });
      setRows(data);
    } catch (e) { toast.error(formatError(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind, currentClientId]);
  useEffect(() => {
    (async () => {
      try { const { data } = await api.get("/users"); setUsers(data); }
      catch { setUsers([]); }
    })();
  }, []);

  const idField = {
    reviews: "review_id", findings: "finding_id", risks: "risk_id", policies: "policy_id",
    vendors: "vendor_id", assets: "asset_id", tasks: "task_id",
  }[kind];

  const statusOptions = useMemo(() => {
    const f = schema.fields.find((x) => x.name === "status");
    return f?.options || [];
  }, [schema]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status && r.status !== statusFilter) return false;
      if (!s) return true;
      return JSON.stringify(r).toLowerCase().includes(s);
    });
  }, [rows, q, statusFilter]);

  async function remove(row) {
    if (!confirm("Delete this record? This action is logged.")) return;
    try { await api.delete(`/${kind}/${row[idField]}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatError(e)); }
  }

  async function exportCsv() {
    try {
      const token = localStorage.getItem("grc_token");
      const resp = await fetch(`${API}/export/${kind}?client_id=${encodeURIComponent(currentClientId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error(`Export failed (${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch (e) { toast.error(e.message || "Export failed"); }
  }

  return (
    <div>
      <PageHeader
        title={schema.title}
        subtitle={`${currentClient?.name || ""} · ${schema.subtitle}`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={!currentClientId || rows.length === 0}
              data-testid={`export-${kind}-button`}
            >
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            {canWrite && (
              <Button data-testid={`create-${kind}-button`} onClick={() => { setSelected(null); setOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> New {kind.slice(0, -1)}
              </Button>
            )}
          </div>
        }
      />
      <div className="px-8 py-4 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/60">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input data-testid={`${kind}-search`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-8 h-9 w-72 text-sm" />
        </div>
        {statusOptions.length > 0 && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid={`${kind}-status-filter`} className="w-44 h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="text-xs text-slate-500 ml-auto font-mono">{filtered.length} / {rows.length}</div>
      </div>

      <div className="px-8 py-6">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                {schema.columns.map((c) => <th key={c.key} className="tbl-head">{c.label}</th>)}
                <th className="tbl-head w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={schema.columns.length + 1} className="tbl-cell text-center py-8 text-slate-400">Loading…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={schema.columns.length + 1} className="tbl-cell text-center py-8 text-slate-400">No records.</td></tr>}
              {!loading && filtered.map((row, i) => (
                <tr
                  key={row[idField] || `row-${i}`}
                  className="row-hover cursor-pointer"
                  data-testid={`${kind}-row-${i}`}
                  onClick={() => { setSelected(row); setOpen(true); }}
                >
                  {schema.columns.map((c) => (
                    <td key={`${row[idField] || i}-${c.key}`} className={`tbl-cell ${c.primary ? "font-medium text-slate-900" : ""}`}>
                      {c.badge ? <StatusBadge value={row[c.key]} /> :
                       c.date ? (row[c.key] ? <span className="font-mono text-slate-600">{new Date(row[c.key]).toLocaleDateString()}</span> : <span className="text-slate-300">—</span>) :
                       (row[c.key] || <span className="text-slate-300">—</span>)}
                    </td>
                  ))}
                  <td className="tbl-cell text-right" onClick={(e) => e.stopPropagation()}>
                    {canDelete && (
                      <button data-testid={`${kind}-delete-${i}`} onClick={() => remove(row)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <RecordDrawer
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        record={selected}
        schema={schema.fields}
        clientId={currentClientId}
        users={users}
        onSaved={load}
      />
    </div>
  );
}
