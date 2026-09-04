import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import api, { formatError } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { X, ArrowUpRight, Zap, UploadCloud, Download, Trash2, CheckCircle2, XCircle, Send } from "lucide-react";
import { Link } from "react-router-dom";

const ID_FIELD = {
  reviews: "review_id", findings: "finding_id", risks: "risk_id", policies: "policy_id",
  vendors: "vendor_id", assets: "asset_id", tasks: "task_id", exceptions: "exception_id",
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function RecordDrawer({ open, onOpenChange, kind, record, schema, clientId, users = [], onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("overview");
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [activity, setActivity] = useState([]);
  const [related, setRelated] = useState({});
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const inputRef = useRef(null);
  const { user } = useAuth();
  const isEdit = !!record;
  const idField = ID_FIELD[kind];
  const isPlatformAdmin = ["super_admin", "platform_admin"].includes(user?.role);
  const canWrite = ["super_admin", "platform_admin", "client_contributor"].includes(user?.role);
  const singular = kind.slice(0, -1);

  useEffect(() => {
    if (open) {
      const base = {};
      schema.forEach((f) => {
        let v = record?.[f.name] ?? f.default ?? "";
        if (f.type === "date" && typeof v === "string" && v.length > 10) v = v.slice(0, 10);
        base[f.name] = v;
      });
      base.client_id = record?.client_id || clientId;
      setForm(base);
      setTab("overview");
      if (isEdit) {
        loadComments();
        loadActivity();
        loadRelated();
        loadEvidence();
      } else {
        setComments([]); setActivity([]); setRelated({}); setEvidenceItems([]);
      }
    }
    // eslint-disable-next-line
  }, [open, record]);

  async function loadComments() {
    try {
      const { data } = await api.get("/comments", { params: { entity_type: kind, entity_id: record[idField] } });
      setComments(data);
    } catch (e) { void e; }
  }
  async function loadActivity() {
    try {
      const { data } = await api.get("/audit-logs");
      setActivity(data.filter((a) => a.entity_id === record[idField]).slice(0, 30));
    } catch (e) { void e; }
  }
  async function loadRelated() {
    try {
      const { data } = await api.get("/related", { params: { entity_type: kind, entity_id: record[idField] } });
      setRelated(data);
    } catch (e) { void e; }
  }
  async function loadEvidence() {
    try {
      const { data } = await api.get("/evidence", { params: { client_id: record.client_id, linked_type: singular, linked_id: record[idField] } });
      setEvidenceItems(data);
    } catch (e) { void e; }
  }

  async function save() {
    setSaving(true);
    try {
      const clean = {};
      Object.entries(form).forEach(([k, v]) => { clean[k] = v === "__none__" ? null : v; });
      if (isEdit) {
        await api.patch(`/${kind}/${record[idField]}`, clean);
        toast.success("Saved");
      } else {
        await api.post(`/${kind}`, clean);
        toast.success("Created");
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  }

  async function submitComment() {
    if (!newComment.trim()) return;
    try {
      await api.post("/comments", { entity_type: kind, entity_id: record[idField], body: newComment });
      setNewComment("");
      await loadComments();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function quickCreateFinding() {
    try {
      await api.post(`/reviews/${record[idField]}/create-finding`, { title: `Finding from: ${record.title}`, severity: "medium" });
      toast.success("Finding created and linked to this review");
      onSaved?.(); loadRelated();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function completeReview() {
    if (!confirm(`Mark "${record.title}" as complete? This will spawn the next occurrence if recurring.`)) return;
    try {
      const { data } = await api.post(`/reviews/${record[idField]}/complete`, { spawn_next: true });
      toast.success(data.spawned ? "Review completed · next occurrence scheduled" : "Review completed");
      if (data.review) {
        record.status = data.review.status;
        record.completion_date = data.review.completion_date;
        record.next_occurrence_id = data.review.next_occurrence_id;
        setForm((p) => ({ ...p, status: data.review.status, completion_date: data.review.completion_date }));
      }
      onSaved?.();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function quickCreateTask() {
    try {
      await api.post(`/findings/${record[idField]}/create-task`, {});
      toast.success("Remediation task created and finding moved to In Remediation");
      if (record) record.status = "in_remediation";
      setForm((p) => ({ ...p, status: "in_remediation" }));
      onSaved?.(); loadRelated();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function raiseAsRisk() {
    if (record?.risk_id) { toast.info("A risk is already linked to this finding"); return; }
    if (!confirm(`Raise a risk from "${record.title}"? Likelihood/impact will default from the finding severity — you can refine on the Risk Register.`)) return;
    try {
      const { data } = await api.post(`/findings/${record[idField]}/raise-risk`);
      toast.success(`Risk raised · Score ${data.risk?.risk_score} · Level ${data.risk?.risk_level}`);
      if (record) record.risk_id = data.risk?.risk_id;
      onSaved?.();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function markRiskReviewed() {
    try {
      const { data } = await api.post(`/risks/${record[idField]}/mark-reviewed`);
      toast.success("Marked as reviewed · next review in 12 months");
      if (record) { record.last_reviewed = data.last_reviewed; record.next_review = data.next_review; }
      setForm((p) => ({ ...p, last_reviewed: data.last_reviewed, next_review: data.next_review }));
      onSaved?.();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function acceptRisk() {
    const rationale = prompt("Acceptance rationale (required):");
    if (!rationale) return;
    const expiry = prompt("Review / expiry date (YYYY-MM-DD, optional):") || "";
    try {
      const body = { rationale };
      if (expiry) body.expiry_date = new Date(expiry).toISOString();
      const { data } = await api.post(`/risks/${record[idField]}/accept`, body);
      toast.success("Risk accepted");
      if (record) Object.assign(record, data);
      setForm((p) => ({ ...p, status: "accepted", treatment: "accept" }));
      onSaved?.();
    } catch (e) { toast.error(formatError(e)); }
  }

  // ---- Policy approval workflow ----
  async function policyAction(action, body = {}) {
    try {
      const { data } = await api.post(`/policies/${record[idField]}/${action}`, body);
      toast.success(`Policy ${action === "submit-review" ? "sent for review" : action + "d"}`);
      if (data) {
        // Mutate current record so header + history render fresh values live.
        if (data.status) { record.status = data.status; setForm((p) => ({ ...p, status: data.status })); }
        if (data.approval_history) record.approval_history = data.approval_history;
        if (data.approved_at) record.approved_at = data.approved_at;
        if (data.approver_id) record.approver_id = data.approver_id;
      }
      onSaved?.(); loadActivity();
    } catch (e) { toast.error(formatError(e)); }
  }
  async function submitReject() {
    if (!rejectReason.trim()) return;
    await policyAction("reject", { reason: rejectReason });
    setRejectOpen(false); setRejectReason("");
  }

  // ---- Evidence upload/download in drawer ----
  async function uploadFiles(files) {
    for (const f of files) {
      try {
        const b64 = await fileToBase64(f);
        await api.post("/evidence", {
          filename: f.name, client_id: record.client_id, content_base64: b64,
          mime_type: f.type, linked_type: singular, linked_id: record[idField],
        });
        toast.success(`Uploaded ${f.name}`);
      } catch (e) { toast.error(formatError(e)); }
    }
    loadEvidence();
  }
  async function downloadEv(ev) {
    const { data } = await api.get(`/evidence/${ev.evidence_id}/download`);
    const a = document.createElement("a");
    a.href = data.content_base64.startsWith("data:") ? data.content_base64 : `data:${data.mime_type};base64,${data.content_base64}`;
    a.download = data.filename; a.click();
  }
  async function deleteEv(ev) {
    if (!confirm(`Delete "${ev.filename}"?`)) return;
    try { await api.delete(`/evidence/${ev.evidence_id}`); loadEvidence(); }
    catch (e) { toast.error(formatError(e)); }
  }

  const relatedTotal = Object.values(related).reduce((a, b) => a + (b?.length || 0), 0);
  const evidenceCount = evidenceItems.length;
  const isPolicy = kind === "policies";
  const status = form.status || record?.status;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col" data-testid={`${kind}-drawer`}>
        <SheetHeader className="px-6 py-4 border-b border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">{singular}</div>
              <SheetTitle className="font-heading text-xl">{isEdit ? (record.title || record.name) : `New ${singular}`}</SheetTitle>
              {isEdit && status && <div className="mt-2"><StatusBadge value={status} /></div>}
            </div>
            <button onClick={() => onOpenChange(false)} className="p-1 rounded hover:bg-slate-100" data-testid="drawer-close"><X className="h-4 w-4" /></button>
          </div>
          {isEdit && (
            <div className="flex gap-1 mt-3 -mb-3 overflow-x-auto">
              {["overview", "related", "evidence", "comments", "activity"].map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`drawer-tab whitespace-nowrap ${tab === t ? "active" : ""}`} data-testid={`tab-${t}`}>
                  {t === "related" ? `Related${relatedTotal ? ` (${relatedTotal})` : ""}` :
                   t === "evidence" ? `Evidence${evidenceCount ? ` (${evidenceCount})` : ""}` :
                   t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "overview" && (
            <div className="space-y-4">
              {isEdit && kind === "reviews" && (
                <div className="border border-line bg-surface-subtle rounded-md p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-ink-primary">
                      <Zap className="h-4 w-4 text-brand-charcoal" /> Review actions
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canWrite && record?.status !== "completed" && record?.status !== "cancelled" && (
                        <Button size="sm" onClick={completeReview} data-testid="review-complete">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark complete
                        </Button>
                      )}
                      {canWrite && (
                        <Button size="sm" variant="outline" onClick={quickCreateFinding} data-testid="quick-create-finding">
                          Raise finding
                        </Button>
                      )}
                    </div>
                  </div>
                  {(record?.parent_review_id || record?.next_occurrence_id) && (
                    <div className="pt-2 border-t border-line text-xs text-ink-secondary space-y-1" data-testid="review-lineage">
                      {record?.parent_review_id && (
                        <div>
                          <span className="font-mono text-ink-help mr-1">previous:</span>
                          <span className="font-mono">{record.parent_review_id}</span>
                        </div>
                      )}
                      {record?.next_occurrence_id && (
                        <div>
                          <span className="font-mono text-ink-help mr-1">next:</span>
                          <span className="font-mono">{record.next_occurrence_id}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {isEdit && kind === "findings" && canWrite && (
                <div className="border border-line bg-surface-subtle rounded-md p-3 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm text-ink-primary"><Zap className="h-4 w-4 text-brand-charcoal" /> Finding actions</div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={quickCreateTask} data-testid="quick-create-task">Create remediation task</Button>
                    <Button size="sm" variant="outline" onClick={raiseAsRisk} data-testid="finding-raise-risk" disabled={!!record?.risk_id}>
                      {record?.risk_id ? "Linked to risk" : "Raise as risk"}
                    </Button>
                  </div>
                </div>
              )}
              {isEdit && kind === "risks" && canWrite && (
                <div className="border border-line bg-surface-subtle rounded-md p-3 flex items-center justify-between gap-2 flex-wrap" data-testid="risk-actions-panel">
                  <div className="flex items-center gap-2 text-sm text-ink-primary"><Zap className="h-4 w-4 text-brand-charcoal" /> Risk actions</div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={markRiskReviewed} data-testid="risk-mark-reviewed">Mark reviewed</Button>
                    {record?.status !== "accepted" && (
                      <Button size="sm" onClick={acceptRisk} data-testid="risk-accept" className="bg-brand-charcoal hover:bg-brand-charcoal-hover">
                        Accept risk
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {isEdit && isPolicy && (
                <div className="border border-slate-200 bg-slate-50/50 rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-800">Approval workflow</div>
                    <StatusBadge value={status || "draft"} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {status === "draft" && canWrite && (
                      <Button size="sm" variant="outline" onClick={() => policyAction("submit-review")} data-testid="policy-submit-review">
                        <Send className="h-3.5 w-3.5 mr-1" /> Submit for review
                      </Button>
                    )}
                    {status === "in_review" && isPlatformAdmin && (
                      <>
                        <Button size="sm" onClick={() => policyAction("approve")} data-testid="policy-approve">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)} data-testid="policy-reject">
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Send back
                        </Button>
                      </>
                    )}
                    {status === "approved" && canWrite && (
                      <Button size="sm" variant="outline" onClick={() => policyAction("submit-review")}>
                        <Send className="h-3.5 w-3.5 mr-1" /> Submit new revision
                      </Button>
                    )}
                  </div>
                  {rejectOpen && (
                    <div className="pt-2 space-y-2">
                      <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for sending back to draft…" data-testid="policy-reject-reason" className="text-sm" />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
                        <Button size="sm" onClick={submitReject} data-testid="policy-reject-confirm">Send back</Button>
                      </div>
                    </div>
                  )}
                  {record?.approval_history?.length > 0 && (
                    <div className="pt-2 border-t border-slate-200">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">History</div>
                      <ul className="space-y-1.5">
                        {record.approval_history.map((h, i) => (
                          <li key={i} className="text-xs text-slate-700 flex items-center gap-2">
                            <span className="font-mono text-slate-400">{new Date(h.at).toLocaleString()}</span>
                            <span className="font-medium">{h.by_email}</span>
                            <span className="text-slate-500">{h.action}</span>
                            {h.reason && <span className="text-red-600 italic">"{h.reason}"</span>}
                            {h.comment && <span className="italic">"{h.comment}"</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {schema.map((f) => {
                if (f.showIf) {
                  const [k, v] = Object.entries(f.showIf)[0];
                  if (form[k] !== v) return null;
                }
                return (
                <div key={f.name} className="space-y-1.5">
                  <Label className="text-xs text-slate-600">{f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}</Label>
                  {f.type === "textarea" ? (
                    <Textarea value={form[f.name] || ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} data-testid={`field-${f.name}`} className="text-sm" />
                  ) : f.type === "select" ? (
                    <Select value={form[f.name] || ""} onValueChange={(v) => setForm({ ...form, [f.name]: v })}>
                      <SelectTrigger data-testid={`field-${f.name}`} className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {(f.options || []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : f.type === "user" ? (
                    <Select value={form[f.name] || "__none__"} onValueChange={(v) => setForm({ ...form, [f.name]: v })}>
                      <SelectTrigger data-testid={`field-${f.name}`} className="text-sm"><SelectValue placeholder="Assign…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input type={f.type || "text"} value={form[f.name] || ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} data-testid={`field-${f.name}`} className="text-sm" />
                  )}
                </div>
                );
              })}
            </div>
          )}

          {tab === "related" && (
            <div className="space-y-5">
              {relatedTotal === 0 && <div className="text-sm text-slate-500">No related records yet.</div>}
              {Object.entries(related).map(([k, list]) => (
                (list && list.length > 0) ? (
                  <div key={k}>
                    <Link to={`/${k}`} className="text-[10px] font-mono uppercase tracking-widest text-slate-500 hover:text-slate-900 flex items-center gap-1">{k} <ArrowUpRight className="h-3 w-3" /></Link>
                    <ul className="mt-1.5 space-y-1.5">
                      {list.map((it) => (
                        <li key={it[ID_FIELD[k]] || it.evidence_id} className="border border-slate-200 rounded-md p-2.5 text-sm flex items-center justify-between hover:bg-slate-50" data-testid={`related-${k}-item`}>
                          <div className="min-w-0">
                            <div className="text-slate-900 font-medium truncate">{it.title || it.name || it.filename}</div>
                            <div className="text-[11px] text-slate-500 font-mono">{it[ID_FIELD[k]] || it.evidence_id}</div>
                          </div>
                          {it.status && <StatusBadge value={it.status} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null
              ))}
            </div>
          )}

          {tab === "evidence" && (
            <div className="space-y-4">
              {canWrite && (
                <div
                  data-testid="drawer-evidence-dropzone"
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(Array.from(e.dataTransfer.files)); }}
                  onClick={() => inputRef.current?.click()}
                  className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition ${dragOver ? "border-slate-900 bg-slate-100" : "border-slate-300 hover:bg-slate-50"}`}
                >
                  <UploadCloud className="h-6 w-6 mx-auto text-slate-500 mb-1" />
                  <div className="text-sm font-medium text-slate-900">Drop files here to attach</div>
                  <div className="text-xs text-slate-500 mt-0.5">They will be linked to this {singular}.</div>
                  <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => uploadFiles(Array.from(e.target.files || []))} data-testid="drawer-evidence-input" />
                </div>
              )}
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {evidenceItems.length === 0 && <li className="p-4 text-center text-slate-400 text-sm">No evidence attached yet.</li>}
                {evidenceItems.map((ev, i) => (
                  <li key={ev.evidence_id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50" data-testid={`drawer-evidence-item-${i}`}>
                    <div className="min-w-0">
                      <div className="text-sm text-slate-900 font-medium truncate">{ev.filename}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{ev.uploaded_by_email} · {new Date(ev.created_at).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => downloadEv(ev)} className="p-1 rounded hover:bg-slate-100 text-slate-500" title="Download"><Download className="h-3.5 w-3.5" /></button>
                      {isPlatformAdmin && <button onClick={() => deleteEv(ev)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "comments" && (
            <div className="space-y-4">
              <div className="space-y-3">
                {comments.length === 0 && <div className="text-sm text-slate-500">No comments yet.</div>}
                {comments.map((c) => (
                  <div key={c.comment_id} className="border border-slate-200 rounded-md p-3 bg-white">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span className="font-medium text-slate-800">{c.user_name || c.user_email}</span>
                      <span className="font-mono">{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap">{c.body}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment… use @email to mention" data-testid="comment-input" className="text-sm" />
                <Button onClick={submitComment} data-testid="comment-submit" size="sm">Post comment</Button>
              </div>
            </div>
          )}

          {tab === "activity" && (
            <div className="space-y-2">
              {activity.length === 0 && <div className="text-sm text-slate-500">No activity yet.</div>}
              {activity.map((a) => (
                <div key={a.log_id} className="text-xs flex items-center gap-3 py-2 border-b border-slate-100">
                  <span className="font-mono text-slate-400">{new Date(a.at).toLocaleString()}</span>
                  <span className="text-slate-700 font-medium">{a.user_email}</span>
                  <span className="text-slate-500">{a.action}</span>
                  <span className="text-slate-400">{a.entity_type}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="drawer-cancel">Cancel</Button>
          {tab === "overview" && (
            <Button size="sm" onClick={save} disabled={saving} data-testid="drawer-save">{saving ? "Saving…" : isEdit ? "Save changes" : "Create"}</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
