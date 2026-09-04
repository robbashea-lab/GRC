import { useEffect, useRef, useState } from "react";
import api, { formatError } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { UploadCloud, Trash2, Download, File as FileIcon } from "lucide-react";
import { toast } from "sonner";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function Evidence() {
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const canWrite = ["super_admin", "platform_admin", "client_contributor"].includes(user?.role);
  const canDelete = ["super_admin", "platform_admin"].includes(user?.role);

  const load = async () => {
    if (!currentClientId) return;
    const { data } = await api.get("/evidence", { params: { client_id: currentClientId } });
    setRows(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentClientId]);

  async function handleFiles(files) {
    if (!canWrite) { toast.error("Read-only role"); return; }
    for (const f of files) {
      try {
        const b64 = await fileToBase64(f);
        await api.post("/evidence", { filename: f.name, client_id: currentClientId, content_base64: b64, mime_type: f.type });
        toast.success(`Uploaded ${f.name}`);
      } catch (e) { toast.error(formatError(e)); }
    }
    load();
  }

  async function download(row) {
    const { data } = await api.get(`/evidence/${row.evidence_id}/download`);
    const a = document.createElement("a");
    a.href = data.content_base64.startsWith("data:") ? data.content_base64 : `data:${data.mime_type};base64,${data.content_base64}`;
    a.download = data.filename;
    a.click();
  }

  async function remove(row) {
    if (!confirm(`Delete "${row.filename}"?`)) return;
    try { await api.delete(`/evidence/${row.evidence_id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatError(e)); }
  }

  return (
    <div>
      <PageHeader title="Evidence & Documents" subtitle={`${currentClient?.name || ""} · Drag and drop artifacts, linked to reviews, findings, policies and vendors.`} />
      <div className="p-8 space-y-6">
        <div
          data-testid="evidence-dropzone"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(Array.from(e.dataTransfer.files)); }}
          onClick={() => inputRef.current?.click()}
          className={`rounded-lg border-2 border-dashed p-10 text-center cursor-pointer transition ${dragOver ? "border-brand-charcoal bg-surface-subtle" : "border-line-strong bg-surface-card hover:bg-surface-app"}`}
        >
          <UploadCloud className="h-8 w-8 mx-auto text-slate-500 mb-2" />
          <div className="text-sm font-medium text-slate-900">Drop files here or click to upload</div>
          <div className="text-xs text-slate-500 mt-1">Any file type. Stored securely, versioned per client.</div>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(Array.from(e.target.files || []))} data-testid="evidence-file-input" />
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead><tr>
              <th className="tbl-head">File</th><th className="tbl-head">Type</th>
              <th className="tbl-head">Uploaded by</th><th className="tbl-head">When</th>
              <th className="tbl-head">Linked to</th><th className="tbl-head w-24">Actions</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="tbl-cell py-8 text-center text-slate-400">No evidence uploaded yet.</td></tr>}
              {rows.map((r, i) => (
                <tr key={r.evidence_id} className="row-hover" data-testid={`evidence-row-${i}`}>
                  <td className="tbl-cell font-medium text-slate-900 flex items-center gap-2"><FileIcon className="h-3.5 w-3.5 text-slate-400" />{r.filename}</td>
                  <td className="tbl-cell text-slate-600 font-mono">{r.mime_type || "—"}</td>
                  <td className="tbl-cell text-slate-600">{r.uploaded_by_email}</td>
                  <td className="tbl-cell font-mono text-slate-600">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="tbl-cell text-slate-500">{r.linked_type ? `${r.linked_type} · ${r.linked_id}` : "—"}</td>
                  <td className="tbl-cell">
                    <button data-testid={`evidence-download-${i}`} onClick={() => download(r)} className="p-1 mr-1 rounded hover:bg-slate-100 text-slate-500"><Download className="h-3.5 w-3.5" /></button>
                    {canDelete && <button data-testid={`evidence-delete-${i}`} onClick={() => remove(r)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
