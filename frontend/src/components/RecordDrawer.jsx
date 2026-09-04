import { useEffect, useMemo, useRef, useState } from "react";
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
import { X, ArrowUpRight, Zap, UploadCloud, Download, Trash2, CheckCircle2, XCircle, Send, ShieldCheck, CalendarPlus } from "lucide-react";
import { Link } from "react-router-dom";

const ID_FIELD = {
  reviews: "review_id", findings: "finding_id", risks: "risk_id", policies: "policy_id",
  vendors: "vendor_id", assets: "asset_id", tasks: "task_id", exceptions: "exception_id",
};

const LIKELIHOOD_LABELS = { 1: "Rare", 2: "Unlikely", 3: "Possible", 4: "Likely", 5: "Almost Certain" };
const IMPACT_LABELS = { 1: "Minimal", 2: "Minor", 3: "Moderate", 4: "Major", 5: "Severe" };
const LEVEL_TONE = {
  critical: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border",
  high: "bg-semantic-duesoon-bg text-semantic-duesoon-text border-semantic-duesoon-border",
  moderate: "bg-semantic-info-bg text-semantic-info border-semantic-info-border",
  low: "bg-surface-subtle text-ink-secondary border-line",
};
const DATA_TYPES = ["No Sensitive Data", "Internal", "Confidential", "PII", "PHI", "Financial",
  "Customer Data", "Employee Data", "Credentials", "Source Code / IP", "Operational Data", "Other"];
const DATA_RELATIONSHIPS = ["Stores", "Processes", "Transmits", "Accesses", "Hosts", "None"];

function levelFromScore(s) {
  if (s == null) return null;
  if (s >= 15) return "critical";
  if (s >= 10) return "high";
  if (s >= 5) return "moderate";
  return "low";
}

const TABS_BY_KIND = {
  risks: [
    { id: "overview", label: "Overview" },
    { id: "assessment", label: "Assessment" },
    { id: "treatment", label: "Treatment" },
    { id: "related", label: "Related" },
    { id: "history", label: "Review History" },
    { id: "activity", label: "Activity" },
  ],
  vendors: [
    { id: "overview", label: "Overview" },
    { id: "data_access", label: "Data & Access" },
    { id: "assurance", label: "Security Assurance" },
    { id: "reviews_tab", label: "Reviews" },
    { id: "actions_tab", label: "Action Items" },
    { id: "risks_tab", label: "Risks" },
    { id: "contract", label: "Contract" },
    { id: "activity", label: "Activity" },
  ],
};
const DEFAULT_TABS = ["overview", "related", "evidence", "comments", "activity"];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function toDateInput(v) {
  if (!v) return "";
  return typeof v === "string" && v.length > 10 ? v.slice(0, 10) : v;
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
  const [linkedReviews, setLinkedReviews] = useState([]);
  const [linkedRisks, setLinkedRisks] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptForm, setAcceptForm] = useState({ rationale: "", expiry_date: "", approver_id: "", compensating_controls: "" });
  const [approverQuery, setApproverQuery] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ due_date: "", owner_id: "", recurrence: "" });
  const inputRef = useRef(null);
  const { user } = useAuth();
  const isEdit = !!record;
  const idField = ID_FIELD[kind];
  const isPlatformAdmin = ["super_admin", "platform_admin"].includes(user?.role);
  const canWrite = ["super_admin", "platform_admin", "client_contributor"].includes(user?.role);
  const singular = kind.slice(0, -1);
  const tabList = TABS_BY_KIND[kind];

  useEffect(() => {
    if (open) {
      const base = {};
      (schema || []).forEach((f) => {
        let v = record?.[f.name] ?? f.default ?? "";
        if (f.type === "date" && typeof v === "string" && v.length > 10) v = v.slice(0, 10);
        base[f.name] = v;
      });
      // Ensure extended risk/vendor fields are always tracked, even if not in the schema list.
      if (kind === "risks") {
        ["likelihood_score","impact_score","treatment","description","impact_description","source",
         "acceptance_rationale","compensating_controls","next_review","last_reviewed","category","notes"
        ].forEach((k) => { if (!(k in base)) base[k] = record?.[k] ?? ""; });
      }
      if (kind === "vendors") {
        ["service","category","criticality","status","contact_name","contact_email","contact_phone","website",
         "data_types","data_relationship","business_owner_id","assurance_status","assurance_expires_at",
         "review_frequency","last_review","next_review","contract_start","contract_renewal","contract_expiration",
         "auto_renewal","related_risk_ids","notes"
        ].forEach((k) => {
          if (!(k in base)) base[k] = record?.[k] ?? (["data_types","data_relationship","related_risk_ids"].includes(k) ? [] : "");
        });
        ["assurance_expires_at","last_review","next_review","contract_start","contract_renewal","contract_expiration"].forEach((k) => {
          base[k] = toDateInput(base[k]);
        });
      }
      base.client_id = record?.client_id || clientId;
      setForm(base);
      setTab("overview");
      if (isEdit) {
        loadComments();
        loadActivity();
        loadRelated();
        loadEvidence();
        if (kind === "vendors") { loadLinkedReviews(); loadLinkedRisks(); }
      } else {
        setComments([]); setActivity([]); setRelated({}); setEvidenceItems([]); setLinkedReviews([]); setLinkedRisks([]);
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
  async function loadLinkedReviews() {
    try {
      const { data } = await api.get("/reviews", { params: { client_id: record.client_id } });
      setLinkedReviews((data || []).filter((r) => r.vendor_id === record[idField] || (r.review_type === "vendor" && (r.scope || "").toLowerCase().includes((record.name || "").toLowerCase()))));
    } catch (e) { void e; }
  }
  async function loadLinkedRisks() {
    try {
      const ids = record.related_risk_ids || [];
      if (!ids.length) { setLinkedRisks([]); return; }
      const { data } = await api.get("/risks", { params: { client_id: record.client_id } });
      setLinkedRisks((data || []).filter((r) => ids.includes(r.risk_id)));
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
      setForm((p) => ({ ...p, last_reviewed: toDateInput(data.last_reviewed), next_review: toDateInput(data.next_review) }));
      onSaved?.();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function acceptRisk() { setAcceptOpen(true); }

  async function submitAcceptRisk() {
    if (!acceptForm.rationale.trim()) { toast.error("Rationale is required"); return; }
    try {
      const body = {
        rationale: acceptForm.rationale,
        approver_id: acceptForm.approver_id || undefined,
        compensating_controls: acceptForm.compensating_controls || undefined,
      };
      if (acceptForm.expiry_date) body.expiry_date = new Date(acceptForm.expiry_date).toISOString();
      const { data } = await api.post(`/risks/${record[idField]}/accept`, body);
      toast.success("Risk accepted");
      if (record) Object.assign(record, data);
      setForm((p) => ({ ...p, status: "accepted", treatment: "accept" }));
      setAcceptOpen(false);
      onSaved?.();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function submitScheduleReview() {
    try {
      const body = {};
      if (scheduleForm.due_date) body.due_date = new Date(scheduleForm.due_date).toISOString();
      if (scheduleForm.owner_id) body.owner_id = scheduleForm.owner_id;
      if (scheduleForm.recurrence) body.recurrence = scheduleForm.recurrence;
      const { data } = await api.post(`/vendors/${record[idField]}/schedule-review`, body);
      toast.success(`Vendor review scheduled for ${new Date(data.review.due_date).toLocaleDateString()}`);
      setScheduleOpen(false);
      setScheduleForm({ due_date: "", owner_id: "", recurrence: "" });
      if (record) record.next_review = data.review.due_date;
      setForm((p) => ({ ...p, next_review: toDateInput(data.review.due_date) }));
      loadLinkedReviews();
      onSaved?.();
    } catch (e) { toast.error(formatError(e)); }
  }

  // ---- Policy approval workflow ----
  async function policyAction(action, body = {}) {
    try {
      const { data } = await api.post(`/policies/${record[idField]}/${action}`, body);
      toast.success(`Policy ${action === "submit-review" ? "sent for review" : action + "d"}`);
      if (data) {
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
  const userMap = useMemo(() => {
    const m = {}; users.forEach((u) => { m[u.user_id] = u.name || u.email; }); return m;
  }, [users]);

  const liveScore = (parseInt(form.likelihood_score) || 0) * (parseInt(form.impact_score) || 0);
  const liveLevel = levelFromScore(liveScore || null);

  function renderField(f) {
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
  }
  function renderFieldsByNames(names) {
    const map = {}; (schema || []).forEach((f) => { map[f.name] = f; });
    return names.map((n) => map[n] ? renderField(map[n]) : null);
  }

  function DateReadonly({ value, label }) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-ink-secondary">{label}</Label>
        <div className="text-sm font-mono text-ink-primary">{value ? new Date(value).toLocaleDateString() : <span className="text-slate-300">—</span>}</div>
      </div>
    );
  }

  // -------- Risk tab renderers --------
  function renderRiskAssessment() {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-ink-secondary">Likelihood (1–5)</Label>
            <Select value={String(form.likelihood_score || "")} onValueChange={(v) => setForm({ ...form, likelihood_score: parseInt(v) })}>
              <SelectTrigger data-testid="field-likelihood_score" className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} · {LIKELIHOOD_LABELS[n]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Impact (1–5)</Label>
            <Select value={String(form.impact_score || "")} onValueChange={(v) => setForm({ ...form, impact_score: parseInt(v) })}>
              <SelectTrigger data-testid="field-impact_score" className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} · {IMPACT_LABELS[n]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-3 py-2 px-3 border border-line rounded-md bg-surface-subtle" data-testid="risk-live-score">
          <div className="text-[10px] font-mono uppercase tracking-widest text-ink-help">Calculated</div>
          <div className="font-mono text-sm text-ink-primary">Score {liveScore || "—"}</div>
          <span className="text-ink-help">→</span>
          {liveLevel ? (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium capitalize ${LEVEL_TONE[liveLevel]}`}>{liveLevel}</span>
          ) : <span className="text-ink-help text-xs">select both</span>}
        </div>
        <div>
          <Label className="text-xs text-ink-secondary">Impact description</Label>
          <Textarea value={form.impact_description || ""} onChange={(e) => setForm({ ...form, impact_description: e.target.value })} rows={3} className="text-sm" data-testid="field-impact_description" />
        </div>
        <div>
          <Label className="text-xs text-ink-secondary">Source / trigger</Label>
          <Input value={form.source || ""} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Annual Risk Assessment, Finding F-14…" className="text-sm" data-testid="field-source" />
        </div>
      </div>
    );
  }

  function renderRiskTreatment() {
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-ink-secondary">Treatment strategy</Label>
          <Select value={form.treatment || ""} onValueChange={(v) => setForm({ ...form, treatment: v })}>
            <SelectTrigger data-testid="field-treatment" className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {["mitigate", "accept", "transfer", "avoid", "monitor"].map((t) => (
                <SelectItem key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-ink-secondary">Acceptance rationale</Label>
          <Textarea value={form.acceptance_rationale || ""} onChange={(e) => setForm({ ...form, acceptance_rationale: e.target.value })} rows={3} className="text-sm" data-testid="field-acceptance_rationale" />
        </div>
        <div>
          <Label className="text-xs text-ink-secondary">Compensating controls</Label>
          <Textarea value={form.compensating_controls || ""} onChange={(e) => setForm({ ...form, compensating_controls: e.target.value })} rows={3} className="text-sm" data-testid="field-compensating_controls" />
        </div>
        <div>
          <Label className="text-xs text-ink-secondary">Notes / mitigation plan</Label>
          <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="text-sm" data-testid="field-notes" />
        </div>
        {record?.acceptance_date && (
          <div className="border border-line rounded-md p-3 bg-surface-subtle text-xs space-y-1" data-testid="risk-acceptance-info">
            <div className="text-[10px] font-mono uppercase tracking-widest text-ink-help">Acceptance</div>
            <div><span className="text-ink-secondary">Approved by:</span> <span className="text-ink-primary font-medium">{userMap[record.accepted_by] || record.accepted_by || "—"}</span></div>
            <div><span className="text-ink-secondary">Accepted on:</span> <span className="font-mono">{new Date(record.acceptance_date).toLocaleDateString()}</span></div>
            {record.next_review && <div><span className="text-ink-secondary">Expires:</span> <span className="font-mono">{new Date(record.next_review).toLocaleDateString()}</span></div>}
          </div>
        )}
      </div>
    );
  }

  function renderRiskHistory() {
    const history = record?.rating_history || [];
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <DateReadonly label="Last reviewed" value={record?.last_reviewed} />
          <DateReadonly label="Next review" value={record?.next_review} />
          <DateReadonly label="Date identified" value={record?.date_identified} />
          <DateReadonly label="Created" value={record?.created_at} />
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-ink-help mb-2">Rating history</div>
          {history.length === 0 ? (
            <div className="text-sm text-ink-muted">No rating changes recorded yet.</div>
          ) : (
            <ul className="space-y-2" data-testid="risk-rating-history">
              {[...history].reverse().map((h, i) => (
                <li key={i} className="border border-line rounded-md p-3 text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-ink-primary">{h.by_name || userMap[h.by] || h.by || "user"}</span>
                    <span className="font-mono text-ink-help">{new Date(h.at).toLocaleString()}</span>
                  </div>
                  <div className="text-ink-secondary">
                    Likelihood {h.prev_likelihood ?? "—"} → <strong>{h.new_likelihood ?? "—"}</strong> · Impact {h.prev_impact ?? "—"} → <strong>{h.new_impact ?? "—"}</strong>
                    {h.prev_score != null && <span className="text-ink-help ml-2">prev score {h.prev_score}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // -------- Vendor tab renderers --------
  function toggleArrayValue(fieldName, value) {
    const arr = new Set(form[fieldName] || []);
    arr.has(value) ? arr.delete(value) : arr.add(value);
    setForm({ ...form, [fieldName]: Array.from(arr) });
  }

  function renderVendorDataAccess() {
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-ink-secondary">Data types stored / processed</Label>
          <div className="flex flex-wrap gap-1 mt-1" data-testid="vendor-data-types">
            {DATA_TYPES.map((dt) => (
              <button key={dt} type="button" onClick={() => toggleArrayValue("data_types", dt)}
                className={`px-2 py-0.5 rounded-full border text-[11px] ${(form.data_types || []).includes(dt) ? "bg-brand-charcoal text-ink-onDark border-brand-charcoal" : "bg-surface-card border-line text-ink-secondary hover:bg-surface-subtle"}`}>{dt}</button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs text-ink-secondary">Data relationship</Label>
          <div className="flex flex-wrap gap-1 mt-1" data-testid="vendor-data-relationship">
            {DATA_RELATIONSHIPS.map((dr) => (
              <button key={dr} type="button" onClick={() => toggleArrayValue("data_relationship", dr)}
                className={`px-2 py-0.5 rounded-full border text-[11px] ${(form.data_relationship || []).includes(dr) ? "bg-brand-charcoal text-ink-onDark border-brand-charcoal" : "bg-surface-card border-line text-ink-secondary hover:bg-surface-subtle"}`}>{dr}</button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs text-ink-secondary">Business owner</Label>
          <Select value={form.business_owner_id || "__none__"} onValueChange={(v) => setForm({ ...form, business_owner_id: v === "__none__" ? "" : v })}>
            <SelectTrigger data-testid="field-business_owner_id" className="text-sm"><SelectValue placeholder="Assign later" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-ink-secondary">Vendor contact — name</Label>
            <Input value={form.contact_name || ""} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Vendor contact — email</Label>
            <Input value={form.contact_email || ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Vendor contact — phone</Label>
            <Input value={form.contact_phone || ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Website</Label>
            <Input value={form.website || ""} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://…" className="text-sm" />
          </div>
        </div>
      </div>
    );
  }

  function renderVendorAssurance() {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-ink-secondary">Assurance status</Label>
            <Select value={form.assurance_status || ""} onValueChange={(v) => setForm({ ...form, assurance_status: v })}>
              <SelectTrigger data-testid="field-assurance_status" className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {["current", "expiring", "expired", "requested", "missing", "under_review"].map((s) => (
                  <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Next assurance renewal</Label>
            <Input type="date" value={form.assurance_expires_at || ""} onChange={(e) => setForm({ ...form, assurance_expires_at: e.target.value })} className="text-sm" data-testid="field-assurance_expires_at" />
            <div className="text-[11px] text-ink-help mt-1">SOC 2 / ISO / DPA renewal cutoff. Alerts trigger 60 days before.</div>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-ink-help mb-1">Assurance documents</div>
          {canWrite && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(Array.from(e.dataTransfer.files)); }}
              onClick={() => inputRef.current?.click()}
              data-testid="vendor-assurance-dropzone"
              className={`rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition ${dragOver ? "border-slate-900 bg-slate-100" : "border-slate-300 hover:bg-slate-50"}`}
            >
              <UploadCloud className="h-5 w-5 mx-auto text-slate-500 mb-1" />
              <div className="text-xs font-medium text-slate-900">Drop SOC 2 / ISO / DPA documents here</div>
              <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => uploadFiles(Array.from(e.target.files || []))} />
            </div>
          )}
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md mt-2">
            {evidenceItems.length === 0 && <li className="p-3 text-center text-slate-400 text-xs">No assurance documents on file yet.</li>}
            {evidenceItems.map((ev, i) => (
              <li key={ev.evidence_id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50" data-testid={`vendor-assurance-item-${i}`}>
                <div className="min-w-0">
                  <div className="text-sm text-slate-900 font-medium truncate">{ev.filename}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{ev.uploaded_by_email} · {new Date(ev.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => downloadEv(ev)} className="p-1 rounded hover:bg-slate-100 text-slate-500"><Download className="h-3.5 w-3.5" /></button>
                  {isPlatformAdmin && <button onClick={() => deleteEv(ev)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  function renderVendorReviews() {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-ink-secondary">Review frequency</Label>
            <Select value={form.review_frequency || "annual"} onValueChange={(v) => setForm({ ...form, review_frequency: v })}>
              <SelectTrigger data-testid="field-review_frequency" className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["quarterly", "semiannual", "annual", "biennial", "as_needed", "custom"].map((f) => (
                  <SelectItem key={f} value={f}>{f.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Last review</Label>
            <Input type="date" value={form.last_review || ""} onChange={(e) => setForm({ ...form, last_review: e.target.value })} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Next review</Label>
            <Input type="date" value={form.next_review || ""} onChange={(e) => setForm({ ...form, next_review: e.target.value })} className="text-sm" data-testid="field-next_review" />
          </div>
        </div>
        {canWrite && (
          <div className="border border-line bg-surface-subtle rounded-md p-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-ink-primary">
              <CalendarPlus className="h-4 w-4 text-brand-charcoal" /> Schedule a full vendor review
            </div>
            <Button size="sm" onClick={() => setScheduleOpen(true)} data-testid="vendor-schedule-review" className="bg-brand-charcoal hover:bg-brand-charcoal-hover">
              Schedule review
            </Button>
          </div>
        )}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-ink-help mb-2 flex items-center justify-between">
            <span>Past & upcoming vendor reviews</span>
            <Link to="/reviews" className="text-link hover:text-link-hover normal-case tracking-normal font-sans text-xs flex items-center gap-1">See all <ArrowUpRight className="h-3 w-3" /></Link>
          </div>
          {linkedReviews.length === 0 ? (
            <div className="text-sm text-ink-muted">No reviews linked to this vendor yet.</div>
          ) : (
            <ul className="space-y-1.5" data-testid="vendor-linked-reviews">
              {linkedReviews.map((r) => (
                <li key={r.review_id} className="border border-line rounded-md p-2.5 text-sm flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-ink-primary font-medium truncate">{r.title}</div>
                    <div className="text-[11px] text-ink-help font-mono">Due {r.due_date ? new Date(r.due_date).toLocaleDateString() : "—"}</div>
                  </div>
                  <StatusBadge value={r.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  function renderVendorActionItems() {
    const findings = related.findings || [];
    const tasks = related.tasks || [];
    if (findings.length === 0 && tasks.length === 0) {
      return <div className="text-sm text-ink-muted">No open findings or tasks linked to this vendor.</div>;
    }
    return (
      <div className="space-y-5">
        {findings.length > 0 && (
          <div>
            <Link to="/findings" className="text-[10px] font-mono uppercase tracking-widest text-slate-500 hover:text-slate-900 flex items-center gap-1">findings <ArrowUpRight className="h-3 w-3" /></Link>
            <ul className="mt-1.5 space-y-1.5">
              {findings.map((f) => (
                <li key={f.finding_id} className="border border-line rounded-md p-2.5 text-sm flex items-center justify-between">
                  <div className="min-w-0"><div className="text-ink-primary font-medium truncate">{f.title}</div><div className="text-[11px] text-ink-help font-mono">{f.finding_id}</div></div>
                  {f.severity && <StatusBadge value={f.severity} />}
                </li>
              ))}
            </ul>
          </div>
        )}
        {tasks.length > 0 && (
          <div>
            <Link to="/action-items" className="text-[10px] font-mono uppercase tracking-widest text-slate-500 hover:text-slate-900 flex items-center gap-1">tasks <ArrowUpRight className="h-3 w-3" /></Link>
            <ul className="mt-1.5 space-y-1.5">
              {tasks.map((t) => (
                <li key={t.task_id} className="border border-line rounded-md p-2.5 text-sm flex items-center justify-between">
                  <div className="min-w-0"><div className="text-ink-primary font-medium truncate">{t.title}</div><div className="text-[11px] text-ink-help font-mono">{t.task_id}</div></div>
                  {t.status && <StatusBadge value={t.status} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  function renderVendorRisks() {
    if (linkedRisks.length === 0) {
      return <div className="text-sm text-ink-muted">No risks linked to this vendor yet. Open a risk from the Risk Register and add this vendor's ID to link.</div>;
    }
    return (
      <ul className="space-y-1.5" data-testid="vendor-linked-risks">
        {linkedRisks.map((r) => {
          const tone = LEVEL_TONE[r.risk_level] || LEVEL_TONE.low;
          return (
            <li key={r.risk_id} className="border border-line rounded-md p-2.5 text-sm flex items-center justify-between">
              <div className="min-w-0"><div className="text-ink-primary font-medium truncate">{r.title}</div><div className="text-[11px] text-ink-help font-mono">{r.risk_id} · score {r.risk_score || "—"}</div></div>
              {r.risk_level && <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium capitalize ${tone}`}>{r.risk_level}</span>}
            </li>
          );
        })}
      </ul>
    );
  }

  function renderVendorContract() {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-ink-secondary">Contract start</Label>
            <Input type="date" value={form.contract_start || ""} onChange={(e) => setForm({ ...form, contract_start: e.target.value })} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Renewal date</Label>
            <Input type="date" value={form.contract_renewal || ""} onChange={(e) => setForm({ ...form, contract_renewal: e.target.value })} className="text-sm" data-testid="field-contract_renewal" />
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Expiration date</Label>
            <Input type="date" value={form.contract_expiration || ""} onChange={(e) => setForm({ ...form, contract_expiration: e.target.value })} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Auto-renewal</Label>
            <Select value={form.auto_renewal || ""} onValueChange={(v) => setForm({ ...form, auto_renewal: v })}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs text-ink-secondary">Notes</Label>
          <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="text-sm" />
        </div>
      </div>
    );
  }

  // -------- Overview renderers per kind --------
  function renderOverview() {
    if (kind === "risks") {
      return (
        <div className="space-y-4">
          {renderRiskActionsPanel()}
          {renderFieldsByNames(["title", "category", "status", "owner_id", "description"])}
        </div>
      );
    }
    if (kind === "vendors") {
      return (
        <div className="space-y-4">
          {renderFieldsByNames(["name", "services", "criticality", "status", "contact_email"])}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-ink-secondary">Service / product</Label>
              <Input value={form.service || ""} onChange={(e) => setForm({ ...form, service: e.target.value })} className="text-sm" data-testid="field-service" />
            </div>
            <div>
              <Label className="text-xs text-ink-secondary">Category</Label>
              <Input value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} className="text-sm" />
            </div>
          </div>
        </div>
      );
    }
    // Default: use full schema
    return (
      <div className="space-y-4">
        {kind === "reviews" && renderReviewActionsPanel()}
        {kind === "findings" && renderFindingActionsPanel()}
        {kind === "policies" && renderPolicyPanel()}
        {(schema || []).map((f) => renderField(f))}
      </div>
    );
  }

  function renderReviewActionsPanel() {
    if (!isEdit) return null;
    return (
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
            {record?.parent_review_id && <div><span className="font-mono text-ink-help mr-1">previous:</span><span className="font-mono">{record.parent_review_id}</span></div>}
            {record?.next_occurrence_id && <div><span className="font-mono text-ink-help mr-1">next:</span><span className="font-mono">{record.next_occurrence_id}</span></div>}
          </div>
        )}
      </div>
    );
  }

  function renderFindingActionsPanel() {
    if (!isEdit || !canWrite) return null;
    return (
      <div className="border border-line bg-surface-subtle rounded-md p-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-ink-primary"><Zap className="h-4 w-4 text-brand-charcoal" /> Finding actions</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={quickCreateTask} data-testid="quick-create-task">Create remediation task</Button>
          <Button size="sm" variant="outline" onClick={raiseAsRisk} data-testid="finding-raise-risk" disabled={!!record?.risk_id}>
            {record?.risk_id ? "Linked to risk" : "Raise as risk"}
          </Button>
        </div>
      </div>
    );
  }

  function renderRiskActionsPanel() {
    if (!isEdit || !canWrite) return null;
    return (
      <div className="border border-line bg-surface-subtle rounded-md p-3 flex items-center justify-between gap-2 flex-wrap" data-testid="risk-actions-panel">
        <div className="flex items-center gap-2 text-sm text-ink-primary"><ShieldCheck className="h-4 w-4 text-brand-charcoal" /> Risk actions</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={markRiskReviewed} data-testid="risk-mark-reviewed">Mark reviewed</Button>
          {record?.status !== "accepted" && (
            <Button size="sm" onClick={acceptRisk} data-testid="risk-accept" className="bg-brand-charcoal hover:bg-brand-charcoal-hover">
              Accept risk
            </Button>
          )}
        </div>
      </div>
    );
  }

  function renderPolicyPanel() {
    if (!isEdit) return null;
    return (
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
              <Button size="sm" onClick={() => policyAction("approve")} data-testid="policy-approve"><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve</Button>
              <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)} data-testid="policy-reject"><XCircle className="h-3.5 w-3.5 mr-1" /> Send back</Button>
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
    );
  }

  // -------- Shared tab renderers --------
  function renderRelated() {
    return (
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
    );
  }
  function renderEvidence() {
    return (
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
                <button onClick={() => downloadEv(ev)} className="p-1 rounded hover:bg-slate-100 text-slate-500"><Download className="h-3.5 w-3.5" /></button>
                {isPlatformAdmin && <button onClick={() => deleteEv(ev)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  function renderComments() {
    return (
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
    );
  }
  function renderActivity() {
    return (
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
    );
  }

  // -------- Tab content dispatch --------
  function renderTabContent() {
    if (tab === "overview") return renderOverview();
    if (tab === "activity") return renderActivity();
    // Kind-specific
    if (kind === "risks") {
      if (tab === "assessment") return renderRiskAssessment();
      if (tab === "treatment") return renderRiskTreatment();
      if (tab === "history") return renderRiskHistory();
      if (tab === "related") return renderRelated();
    }
    if (kind === "vendors") {
      if (tab === "data_access") return renderVendorDataAccess();
      if (tab === "assurance") return renderVendorAssurance();
      if (tab === "reviews_tab") return renderVendorReviews();
      if (tab === "actions_tab") return renderVendorActionItems();
      if (tab === "risks_tab") return renderVendorRisks();
      if (tab === "contract") return renderVendorContract();
    }
    // Default kinds
    if (tab === "related") return renderRelated();
    if (tab === "evidence") return renderEvidence();
    if (tab === "comments") return renderComments();
    return null;
  }

  function renderTabList() {
    if (!isEdit) return null;
    if (tabList) {
      // Entity-specific tabs
      return (
        <div className="flex gap-1 mt-3 -mb-3 overflow-x-auto">
          {tabList.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`drawer-tab whitespace-nowrap ${tab === t.id ? "active" : ""}`} data-testid={`tab-${t.id}`}>
              {t.label}
            </button>
          ))}
        </div>
      );
    }
    return (
      <div className="flex gap-1 mt-3 -mb-3 overflow-x-auto">
        {DEFAULT_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`drawer-tab whitespace-nowrap ${tab === t ? "active" : ""}`} data-testid={`tab-${t}`}>
            {t === "related" ? `Related${relatedTotal ? ` (${relatedTotal})` : ""}` :
             t === "evidence" ? `Evidence${evidenceCount ? ` (${evidenceCount})` : ""}` :
             t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
    );
  }

  const tabIsFormEditable = (
    tab === "overview" ||
    (kind === "risks" && ["assessment", "treatment"].includes(tab)) ||
    (kind === "vendors" && ["data_access", "assurance", "reviews_tab", "contract"].includes(tab))
  );

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
          {renderTabList()}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {renderTabContent()}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="drawer-cancel">Cancel</Button>
          {tabIsFormEditable && (
            <Button size="sm" onClick={save} disabled={saving} data-testid="drawer-save">{saving ? "Saving…" : isEdit ? "Save changes" : "Create"}</Button>
          )}
        </div>
      </SheetContent>

      {/* Accept Risk dialog */}
      {kind === "risks" && (
        <Sheet open={acceptOpen} onOpenChange={setAcceptOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md p-0" data-testid="accept-risk-dialog">
            <SheetHeader className="px-6 py-4 border-b border-line">
              <SheetTitle>Accept risk</SheetTitle>
            </SheetHeader>
            <div className="p-6 space-y-4">
              <div>
                <Label className="text-xs text-ink-secondary">Rationale <span className="text-semantic-critical">*</span></Label>
                <Textarea data-testid="accept-rationale" value={acceptForm.rationale} onChange={(e) => setAcceptForm({ ...acceptForm, rationale: e.target.value })} placeholder="Why is management accepting this risk?" rows={3} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs text-ink-secondary">Approver</Label>
                <div className="relative">
                  <Input
                    value={approverQuery || (users.find((u) => u.user_id === acceptForm.approver_id)?.name || users.find((u) => u.user_id === acceptForm.approver_id)?.email || "")}
                    onChange={(e) => { setApproverQuery(e.target.value); setAcceptForm({ ...acceptForm, approver_id: "" }); }}
                    placeholder="Search users…" className="text-sm" data-testid="accept-approver-search"
                  />
                  {approverQuery && !acceptForm.approver_id && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-surface-card border border-line rounded-md shadow-lg" data-testid="approver-suggestions">
                      {users.filter((u) => (u.name || u.email || "").toLowerCase().includes(approverQuery.toLowerCase())).slice(0, 8).map((u) => (
                        <button key={u.user_id} onClick={() => { setAcceptForm({ ...acceptForm, approver_id: u.user_id }); setApproverQuery(""); }} data-testid={`approver-option-${u.user_id}`} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-subtle">
                          <div className="text-ink-primary">{u.name || u.email}</div>
                          <div className="text-[11px] text-ink-help">{(u.role || "").replace("_", " ")}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-ink-secondary">Review / expiry date</Label>
                <Input type="date" data-testid="accept-expiry" value={acceptForm.expiry_date} onChange={(e) => setAcceptForm({ ...acceptForm, expiry_date: e.target.value })} className="text-sm" />
                <div className="text-[11px] text-ink-help mt-1">The risk will reappear in "Due for Review" as this date approaches.</div>
              </div>
              <div>
                <Label className="text-xs text-ink-secondary">Compensating controls (optional)</Label>
                <Textarea data-testid="accept-controls" value={acceptForm.compensating_controls} onChange={(e) => setAcceptForm({ ...acceptForm, compensating_controls: e.target.value })} rows={2} className="text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setAcceptOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={submitAcceptRisk} data-testid="accept-submit" className="bg-brand-charcoal hover:bg-brand-charcoal-hover">Accept risk</Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Schedule Vendor Review dialog */}
      {kind === "vendors" && (
        <Sheet open={scheduleOpen} onOpenChange={setScheduleOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md p-0" data-testid="schedule-review-dialog">
            <SheetHeader className="px-6 py-4 border-b border-line">
              <SheetTitle>Schedule vendor review</SheetTitle>
            </SheetHeader>
            <div className="p-6 space-y-4">
              <div className="text-xs text-ink-secondary">
                Creates a new Review entry with review type <strong>Vendor</strong>, prefilled with this vendor's owner and recurrence.
              </div>
              <div>
                <Label className="text-xs text-ink-secondary">Due date</Label>
                <Input type="date" value={scheduleForm.due_date} onChange={(e) => setScheduleForm({ ...scheduleForm, due_date: e.target.value })} className="text-sm" data-testid="schedule-due-date" />
                <div className="text-[11px] text-ink-help mt-1">Defaults to +365 days if left blank.</div>
              </div>
              <div>
                <Label className="text-xs text-ink-secondary">Owner</Label>
                <Select value={scheduleForm.owner_id || "__default__"} onValueChange={(v) => setScheduleForm({ ...scheduleForm, owner_id: v === "__default__" ? "" : v })}>
                  <SelectTrigger data-testid="schedule-owner" className="text-sm"><SelectValue placeholder="Business owner (default)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Use vendor's business owner</SelectItem>
                    {users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-ink-secondary">Recurrence</Label>
                <Select value={scheduleForm.recurrence || "__default__"} onValueChange={(v) => setScheduleForm({ ...scheduleForm, recurrence: v === "__default__" ? "" : v })}>
                  <SelectTrigger data-testid="schedule-recurrence" className="text-sm"><SelectValue placeholder="Vendor default" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Use vendor's review frequency</SelectItem>
                    <SelectItem value="none">One-time</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="semiannual">Semi-annual</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setScheduleOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={submitScheduleReview} data-testid="schedule-submit" className="bg-brand-charcoal hover:bg-brand-charcoal-hover">
                  Schedule review
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Sheet>
  );
}
