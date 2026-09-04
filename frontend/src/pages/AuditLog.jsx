import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import PageHeader from "@/components/PageHeader";

export default function AuditLog() {
  const { currentClient, currentClientId } = useOrg();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!currentClientId) return;
    (async () => {
      const { data } = await api.get("/audit-logs", { params: { client_id: currentClientId } });
      setRows(data);
    })();
  }, [currentClientId]);

  return (
    <div>
      <PageHeader title="Audit Log" subtitle={`${currentClient?.name || ""} · Immutable record of every create, update, upload and delete.`} />
      <div className="p-8">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead><tr>
              <th className="tbl-head">When</th><th className="tbl-head">Who</th>
              <th className="tbl-head">Action</th><th className="tbl-head">Entity</th>
              <th className="tbl-head">ID</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="tbl-cell py-8 text-center text-slate-400">No activity yet.</td></tr>}
              {rows.map((r, i) => (
                <tr key={r.log_id} className="row-hover" data-testid={`audit-row-${i}`}>
                  <td className="tbl-cell font-mono">{new Date(r.at).toLocaleString()}</td>
                  <td className="tbl-cell">{r.user_email}</td>
                  <td className="tbl-cell"><span className="inline-flex rounded-md px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-mono">{r.action}</span></td>
                  <td className="tbl-cell">{r.entity_type}</td>
                  <td className="tbl-cell font-mono text-slate-500">{r.entity_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
