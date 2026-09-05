import { useEffect, useState, useMemo } from "react";
import api, { formatError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, ScrollText } from "lucide-react";

// Platform-level audit view: shows every audit entry across all tenants and
// platform activity. Read-only. Tenant admins have the client-scoped /audit page.
export default function AdminAudit() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/audit-logs", { params: { limit: 500 } });
        setRows(data || []);
      } catch (e) { toast.error(formatError(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => (
      (r.action || "").toLowerCase().includes(s) ||
      (r.entity_type || "").toLowerCase().includes(s) ||
      (r.entity_id || "").toLowerCase().includes(s) ||
      (r.user_email || "").toLowerCase().includes(s) ||
      (r.client_id || "").toLowerCase().includes(s)
    ));
  }, [rows, q]);

  return (
    <div>
      <PageHeader eyebrow="Administration" title="Platform Audit Log" subtitle="Every material change across every client tenant and platform action." />
      <div className="px-8 py-4">
        <div className="relative w-96 mb-3">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter action, entity, user, tenant..." className="pl-8 h-9 text-sm" data-testid="admin-audit-search" />
        </div>
        <div className="bg-surface-card border border-line rounded-lg overflow-hidden" data-testid="admin-audit-table">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-[10px] font-mono uppercase tracking-widest text-ink-secondary border-b border-line">
              <tr>
                <th className="tbl-cell text-left">Time</th>
                <th className="tbl-cell text-left">Actor</th>
                <th className="tbl-cell text-left">Action</th>
                <th className="tbl-cell text-left">Entity</th>
                <th className="tbl-cell text-left">Entity ID</th>
                <th className="tbl-cell text-left">Tenant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (<tr><td colSpan={6} className="tbl-cell text-center text-ink-help py-8">Loading...</td></tr>)}
              {!loading && filtered.length === 0 && (<tr><td colSpan={6} className="tbl-cell text-center text-ink-help py-8">No entries match this filter.</td></tr>)}
              {!loading && filtered.slice(0, 500).map((r, i) => (
                <tr key={r.log_id || i} className="row-hover" data-testid={`admin-audit-row-${i}`}>
                  <td className="tbl-cell text-xs font-mono text-ink-help whitespace-nowrap">{r.at ? new Date(r.at).toLocaleString() : "-"}</td>
                  <td className="tbl-cell text-xs">{r.user_name || r.user_email || "-"}</td>
                  <td className="tbl-cell text-xs text-ink-primary capitalize">{(r.action || "-").replace(/-/g, " ")}</td>
                  <td className="tbl-cell text-xs capitalize text-ink-secondary">{r.entity_type || "-"}</td>
                  <td className="tbl-cell text-xs font-mono text-ink-help">{r.entity_id || "-"}</td>
                  <td className="tbl-cell text-xs font-mono text-ink-help">{r.client_id || "platform"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
