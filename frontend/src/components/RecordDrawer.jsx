import VendorGovernancePanel from "./VendorGovernancePanel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import api, { formatError } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { X, ArrowUpRight, Zap, UploadCloud, Download, Trash2, CheckCircle2, XCircle, Send, ShieldCheck, CalendarPlus, Users2 } from "lucide-react";
import { Link } from "react-router-dom";
import { SCHEMAS } from "@/lib/schemas";
import rules from "@/lib/grcRules.json";
import {RiskSourceFields,RiskScheduleFields} from "./RiskGovernanceFields";
import {riskLevel} from "@/lib/grcWork";
import RelatedAssessment from "./RelatedAssessment";
import ReviewDrawer from "./ReviewDrawer";
import AIDrawer from './AIDrawer';
import FrameworkDrawer from './FrameworkDrawer';
import ActionItemFields from "./ActionItemFields";
import { taskSource, SOURCE_RECORDS, actionStatus } from "@/lib/actionItems";
import { relatedReviewInitialValues } from "@/lib/reviewOccurrences";
import {completionHandoff} from '@/lib/remediation';
import CorrectiveActions from './CorrectiveActions';

const ID_FIELD = {
  framework_assessments:'framework_assessment_id',
  ai_systems:'ai_system_id',
  reviews: "review_id", findings: "finding_id", risks: "risk_id", policies: "policy_id",
  vendors: "vendor_id", assets: "asset_id", tasks: "task_id", exceptions: "exception_id",
  contacts: "contact_id", requirements: "requirement_id",
};

const LIKELIHOOD_LABELS = { 1: "Rare", 2: "Unlikely", 3: "Possible", 4: "Likely", 5: "Almost Certain" };
const IMPACT_LABELS = { 1: "Minimal", 2: "Minor", 3: "Moderate", 4: "Major", 5: "Severe" };
const LEVEL_TONE = {
  critical: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border",
  high: "pill-high",
  moderate: "pill-moderate",
  low: "bg-surface-subtle text-ink-secondary border-line",
};
const DATA_TYPES = ["No Sensitive Data", "Internal", "Confidential", "PII", "PHI", "Financial",
  "Customer Data", "Employee Data", "Credentials", "Source Code / IP", "Operational Data", "Other"];
const DATA_RELATIONSHIPS = ["Stores", "Processes", "Transmits", "Accesses", "Hosts", "None"];

function levelFromScore(s) {
  return riskLevel(s);
}

const GRC_ROLE_OPTIONS = ["Executive Sponsor", "Primary GRC / Security Contact", "IT Lead",
  "Information Security Lead", "Risk Management Contact", "Vendor / Third-Party Contact",
  "Business Continuity / Disaster Recovery Lead", "Incident Response Lead", "HR Contact",
  "Legal / Privacy Contact", "Finance Contact", "Other"];

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
  requirements: [
    { id: "overview", label: "Overview" },
    { id: "applicability", label: "Applicability" },
    { id: "verification", label: "Verification" },
    { id: "related", label: "Related" },
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

export default function RecordDrawer(props) {
  if(props.kind==='framework_assessments')return <FrameworkDrawer {...props}/>;
  if(props.kind==='ai_systems') return <AIDrawer {...props}/>;
  if(props.kind==="assessments") return <RelatedAssessment {...props}/>;
  return props.kind === "reviews" ? <ReviewDrawer {...props} /> : <EntityDrawer {...props} />;
}

function EntityDrawer({ open, onOpenChange, kind, record, schema, clientId, users = [], onSaved, initialValues }) {
  schema = schema || SCHEMAS[kind]?.fields || [];
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionForm, setDecisionForm] = useState({});
  const [findingOpen, setFindingOpen] = useState(false);
  const [relatedDrawer, setRelatedDrawer] = useState(null);
  const [findingForm, setFindingForm] = useState({});
  const [tab, setTab] = useState("overview");
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [activity, setActivity] = useState([]);
  const [related, setRelated] = useState({});
  const [relatedError,setRelatedError]=useState('');
  const [relatedLoading,setRelatedLoading]=useState(false);
  const [taskCompletion,setTaskCompletion]=useState(null);
  const [policyOptions, setPolicyOptions] = useState([]);
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [riskHistory,setRiskHistory] = useState([]);
  const [linkTask,setLinkTask]=useState(null);
  const [closure,setClosure] = useState(null);
  const [linkedReviews, setLinkedReviews] = useState([]);
  const [linkedRisks, setLinkedRisks] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptForm, setAcceptForm] = useState({ rationale: "", expiry_date: "", approver_id: "", compensating_controls: "" });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ due_date: "", owner_id: "", recurrence: "" });
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyForm, setVerifyForm] = useState({ version: "", owner_id: "", approver_id: "", approved_at: "", last_reviewed_at: "", next_review_date: "", status: "approved" });
  const inputRef = useRef(null);
  const loadGeneration = useRef(0);
  const { user } = useAuth();
  const isEdit = !!record;
  const idField = ID_FIELD[kind];
  const isPlatformAdmin = ["super_admin", "platform_admin"].includes(user?.role);
  const canWrite = ["super_admin", "platform_admin", "client_contributor"].includes(user?.role) && !(kind==="risks" && ["closed","retired"].includes(record?.status));
  const singular = kind === "tasks" ? "Action Item" : kind === "policies" ? "policy" : kind.slice(0, -1);
  const evidenceKind = kind === "tasks" ? "task" : singular;
  const tabList = TABS_BY_KIND[kind];

  useEffect(() => {
    const generation = loadGeneration;
    generation.current++;
    if (open) {
      setRelatedDrawer(null); setFindingOpen(false);setTaskCompletion(null);setRelatedError('');
      if (kind === "reviews") api.get("/policies", { params: { client_id: record?.client_id || clientId } }).then(({data}) => setPolicyOptions(data)).catch(() => setPolicyOptions([]));
      setComments([]); setActivity([]); setRelated({}); setEvidenceItems([]);
      const base = {};
      (schema || []).forEach((f) => {
        let v = record?.[f.name] ?? f.default ?? "";
        if (kind === "reviews" && record?.status === "needs_scheduling" && f.name === "recurrence" && !record.recurrence) v = "";
        if (f.type === "date" && typeof v === "string" && v.length > 10) v = v.slice(0, 10);
        base[f.name] = v;
      });
      // Ensure extended risk/vendor fields are always tracked, even if not in the schema list.
      if (kind === "risks") {
        ["likelihood_score","impact_score","treatment","description","impact_description","source",
         "acceptance_rationale","compensating_controls","next_review","last_reviewed","category","notes","source_type","source_id","review_cadence","custom_recurrence_days","assessment_rationale","likelihood_rationale","impact_rationale"
        ].forEach((k) => { if (!(k in base)) base[k] = record?.[k] ?? ""; });
      }
      if (kind === "vendors") {
        ["service","category","criticality","status","contact_name","contact_email","contact_phone","website",
         "data_types","data_relationship","business_owner_id","assurance_status","assurance_expires_at",
         "review_frequency","last_review","next_review","contract_start","contract_renewal","contract_expiration",
         "auto_renewal","related_risk_ids","notes","custom_recurrence_days","assurance_required","assurance_records","assurance_window_days","separate_assurance_review","assurance_review_date","assurance_cadence","contract_review_enabled","contract_lead_days","contract_evidence_ids","dpa_present","baa_present","security_addendum_present","contract_notes","termination_requirements","dependency_notes","offboarding_review_date"
        ].forEach((k) => {
          if (!(k in base)) base[k] = record?.[k] ?? (["data_types","data_relationship","related_risk_ids"].includes(k) ? [] : "");
        });
        base.service = record?.service || record?.services || "";
        base.assurance_records = record?.assurance_records || [];base.contract_evidence_ids=record?.contract_evidence_ids||[];
        base.assurance_window_days=record?.assurance_window_days||90;base.contract_lead_days=record?.contract_lead_days||90;
        for(const key of ["assurance_required","separate_assurance_review","contract_review_enabled"])base[key]=!!record?.[key];
        ["assurance_expires_at","last_review","next_review","contract_start","contract_renewal","contract_expiration","assurance_review_date","offboarding_review_date"].forEach((k) => {
          base[k] = toDateInput(base[k]);
        });
      }
      if (kind === "tasks") Object.assign(base,{source_type:record?.source_type || (record ? taskSource(record).type : "manual"),source_id:record?.source_id || null,assignee_id:record?.assignee_id ?? record?.owner_id ?? null,status:record?.status||"open",priority:record?.priority||"medium"});
      if (!record && kind === "findings") Object.assign(base, {status: "open", severity: "medium"});
      if (!record && kind === "risks") Object.assign(base, {status: "identified", review_cadence: "annual", source_type: "manual"});
      if (!record && kind === "vendors") Object.assign(base, {status: "onboarding", criticality: "medium", review_frequency: "annual"});
      base.client_id = record?.client_id || clientId;
      if(!record&&initialValues) Object.assign(base,initialValues);
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
    return () => { generation.current++; };
    // eslint-disable-next-line
  }, [open, record, clientId]);

  useEffect(() => {
    if (!open || !["tasks","vendors"].includes(kind) || !record) return;
    const refresh = () => { loadRelated(); loadActivity(); if(kind==="vendors"){loadLinkedReviews();loadLinkedRisks();loadEvidence();} };
    refresh(); window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 10000);
    return () => { window.removeEventListener("focus", refresh); clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open,kind,record,tab]);


  async function loadComments() {
    const generation=loadGeneration.current;
    try {
      const { data } = await api.get("/comments", { params: { entity_type: kind, entity_id: record[idField] } });
      if(generation===loadGeneration.current) setComments(data);
    } catch (e) { void e; }
  }
  async function loadActivity() {
    const generation=loadGeneration.current;
    try {
      const { data } = await api.get(["tasks","risks","vendors"].includes(kind) ? `/${kind}/${record[idField]}/activity` : "/audit-logs");
      if(generation===loadGeneration.current) setActivity(data.filter((a) => a.entity_id === record[idField]).slice(0, 30));
    } catch (e) { void e; }
  }
  async function loadRelated() {
    const generation=loadGeneration.current;
    setRelatedLoading(true);
    try {
      const { data } = await api.get("/related", { params: { entity_type: kind, entity_id: record[idField] } });
      if(generation===loadGeneration.current) {setRelated(data);setRelatedError('');}
      return data;
    } catch (e) { if(generation===loadGeneration.current){setRelated({});setRelatedError(formatError(e));}return null; }
    finally {if(generation===loadGeneration.current)setRelatedLoading(false);}
  }

  async function openLinkedRecord(target) {
    const generation=loadGeneration.current;
    try {
      // Assessments are exposed through authorized Related, not a standalone CRUD endpoint.
      const data=target.kind==='assessments'
        ? (await loadRelated())?.assessments?.find(item=>item.assessment_id===target.record.assessment_id)
        : (await api.get(`/${target.kind}/${encodeURIComponent(target.record[ID_FIELD[target.kind]])}`)).data;
      if(generation!==loadGeneration.current)return;
      if(!data)throw new Error('Linked record unavailable.');
      if(data.client_id!==(record?.client_id||clientId)) throw new Error('Record belongs to another client.');
      setRelatedDrawer({...target,record:data});
    } catch(e) {toast.error(formatError(e));}
  }
  async function loadEvidence() {
    const generation=loadGeneration.current;
    try {
      const { data } = await api.get("/evidence", { params: { client_id: record.client_id, linked_type: evidenceKind, linked_id: record[idField] } });
      if(generation===loadGeneration.current) setEvidenceItems(data);
    } catch (e) { void e; }
  }
  async function loadLinkedReviews() {
    const generation=loadGeneration.current;
    try {
      const { data } = await api.get("/reviews", { params: { client_id: record.client_id } });
      if(generation===loadGeneration.current) setLinkedReviews((data || []).filter(r => r.vendor_id === record[idField] && r.client_id === record.client_id));
    } catch (e) { void e; }
  }
  async function loadLinkedRisks() {
    const generation=loadGeneration.current;
    try {
      const ids = record.related_risk_ids || [];
      const { data } = await api.get("/risks", { params: { client_id: record.client_id } });
      if(generation===loadGeneration.current) setLinkedRisks((data || []).filter((r) => r.client_id===record.client_id && (ids.includes(r.risk_id)||r.vendor_id===record.vendor_id)));
    } catch (e) { void e; }
  }

  function cleanForm() {
    return Object.fromEntries(Object.entries(form).map(([k,v]) => {
      const field = (schema || []).find(f => f.name === k);
      return [k, v === "__none__" || (v === "" && (["number", "date", "policy", "user"].includes(field?.type) || ["likelihood_score", "impact_score"].includes(k))) ? null : field?.type === "number" ? Number(v) : v];
    }).filter(([k, v]) => !isEdit || !(JSON.stringify(v) === JSON.stringify(record[k]) || (v == null || v === "") && (record[k] == null || record[k] === "") || schema.find(f => f.name === k)?.type === "date" && String(record[k] || '').slice(0,10) === v)));
  }

  async function save(taskStatus) {
    if (!canWrite || saving) return;
    const missing = (schema || []).find(f => f.required && !String(form[f.name] || "").trim());
    if (missing) { toast.error(`${missing.label} is required`); return; }
    if (kind === "reviews" && isEdit && form.status === "completed" && record.status !== "completed") return completeReview();
    setSaving(true);
    try {
      const clean = cleanForm();
      if(kind==="risks" && clean.custom_recurrence_days==="") clean.custom_recurrence_days=null;
      if(kind==="vendors") {for(const key of ["last_review","assurance_status","services","assurance_expires_at"])delete clean[key];for(const key of ["assurance_records"])if(clean[key])clean[key]=clean[key].map(({status,...a})=>a);if(clean.custom_recurrence_days==="")delete clean.custom_recurrence_days;if(!clean.assurance_cadence)delete clean.assurance_cadence;}
      if(kind==="risks") for(const key of ["last_reviewed","risk_score","risk_level","date_identified","display_id","legacy_display_id","linked_review_id","review_sync_occurrence_id","rating_history","decision_history","created_at","created_by","updated_at","closed_at","closed_by","closure_reason","closure_note","accepted","accepted_by","acceptance_date","acceptance_rationale","acceptance_expires_at"]) delete clean[key];
      if (kind === "tasks") {
        if (isEdit) { delete clean.source_type; delete clean.source_id;
          if (form.assignee_id !== (record.assignee_id ?? record.owner_id ?? null)) clean.assignee_id=form.assignee_id||null;
        }
        else { clean.status="open"; if(SOURCE_RECORDS[form.source_type]&&form.source_type!=="audit"&&!form.source_id) throw new Error("Select the source record"); }
        if (typeof taskStatus === "string") clean.status=taskStatus;
      }
      if (kind === "policies" && (record?.schedule_from_reviews || related.reviews?.length)) { delete clean.next_review_date; delete clean.last_reviewed_at; }
      let savedRecord;
      if (isEdit) {
        savedRecord=(await api.patch(`/${kind}/${record[idField]}`, clean)).data;
        if(kind!=="tasks"||savedRecord.status!=="done"||record.status==="done")toast.success("Saved");
      } else {
        savedRecord=(await api.post(`/${kind}`, clean)).data;
        toast.success("Created");
      }
      if(kind==='tasks'&&savedRecord.status==='done'&&record?.status!=='done') {
        if(savedRecord.finding_id) {
          let finding=null;
          try {const {data}=await api.get(`/findings/${encodeURIComponent(savedRecord.finding_id)}`);if(data.client_id===savedRecord.client_id)finding=data;}catch(e){void e;}
          setTaskCompletion({task:savedRecord,finding});setForm(p=>({...p,status:'done'}));
          onSaved?.(savedRecord);return;
        }
        toast.success('Action Item completed');
      }
      onSaved?.(savedRecord);
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
    setFindingForm({ title: "", description: "", severity: "medium", owner_id: record.owner_id || "", due_date: "", remediation_title: "", remediation_plan: "" });
    setFindingOpen(true);
  }

  async function saveReviewFinding(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.post(`/reviews/${record[idField]}/create-finding`, findingForm);
      toast.success("Finding and remediation action linked to this review");
      setFindingOpen(false);
      onSaved?.(); loadRelated();
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  }

  async function completeReview() {
    setDecisionForm({ tested_period: form.period || "", tested_scope: form.scope || "", conclusion: "", no_evidence_reason: "", checklist_confirmed: false });
    setDecisionOpen(true);
  }

  async function submitDecision(event) {
    event.preventDefault();
    setSaving(true);
    try {
      if (!(kind === "reviews" && record.status === "completed")) {
        const { status: ignoredStatus, ...changes } = cleanForm();
        if (Object.keys(changes).length) await api.patch(`/${kind}/${record[idField]}`, changes);
      }
      const action = decisionForm.action || (kind === "findings" ? "validate" : record.status === "completed" ? "amend" : "complete");
      const { data } = await api.post(`/${kind}/${record[idField]}/${action}`, { ...decisionForm, spawn_next: true });
      Object.assign(record, data.review || data);
      setForm(p => ({ ...p, status: record.status }));
      setDecisionOpen(false);
      toast.success(action === "complete" ? "Review completed; evidence and outcome preserved" : action === "amend" ? "Amendment recorded" : action === "validate" ? "Remediation validated and closed" : "Decision recorded");
      onSaved?.();
      loadRelated();
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  }

  async function raiseAsRisk() {
    if (record?.risk_id) { toast.info("A risk is already linked to this finding"); return; }
    if (!confirm(`Raise an unassessed risk from "${record.title}"? Rate its likelihood and impact in the Risk Register.`)) return;
    try {
      const { data } = await api.post(`/findings/${record[idField]}/raise-risk`);
      toast.success("Risk raised · assessment required");
      if (record) record.risk_id = data.risk?.risk_id;
      onSaved?.();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function markRiskReviewed() {
    try {
      const changes=cleanForm();
      for(const key of ["last_reviewed","risk_score","risk_level","date_identified"]) delete changes[key];
      if(Object.keys(changes).length) await api.patch(`/risks/${record.risk_id}`,changes);
      const {data}=await api.post(`/risks/${record.risk_id}/review`);
      setRelatedDrawer({kind:"reviews",record:data.review});
      onSaved?.();
    } catch(e) {toast.error(formatError(e));}
  }

  async function refreshFindingReadiness() {
    if (kind !== "findings" || !record?.finding_id) return;
    const version = loadGeneration.current;
    try {
      const {data} = await api.get("/findings", {params:{client_id:clientId}});
      if (version !== loadGeneration.current) return;
      const updated = data.find(item => item.finding_id === record.finding_id && item.client_id === clientId);
      if (updated) {
        // Refresh only authoritative readiness; retain unsaved descriptive edits.
        record.status = updated.status;
        setForm(previous => ({...previous,status:updated.status}));
      }
    } catch (e) { toast.error(formatError(e)); }
  }

  const refreshRisk = useCallback(async () => {
    if(kind!=="risks"||!record?.risk_id) return;
    const version=loadGeneration.current;
    try {
      const [rows,h,relations,events]=await Promise.all([api.get("/risks",{params:{client_id:clientId}}),api.get(`/risks/${record.risk_id}/review-history`),api.get("/related",{params:{entity_type:"risks",entity_id:record.risk_id}}),api.get(`/risks/${record.risk_id}/activity`)]);
      if(version!==loadGeneration.current) return;
      const updated=rows.data.find(r=>r.risk_id===record.risk_id);
      if(updated) {Object.assign(record,updated);setForm(p=>({...p,...updated}));}
      setRiskHistory(h.data); setRelated(relations.data); setActivity(events.data);
    } catch(e) {toast.error(formatError(e));}
  },[kind,record,clientId]);

  useEffect(()=>{if(open)refreshRisk();},[open,refreshRisk]);
  useEffect(()=>{
    if(!open||kind!=="risks"||!record?.risk_id||!["treatment","related","activity","history"].includes(tab)) return;
    let active=true;
    const refresh=async()=>{try{const [r,h,a]=await Promise.all([api.get("/related",{params:{entity_type:"risks",entity_id:record.risk_id}}),api.get(`/risks/${record.risk_id}/review-history`),api.get(`/risks/${record.risk_id}/activity`)]);if(active){setRelated(r.data);setRiskHistory(h.data);setActivity(a.data);}}catch(e){if(active)toast.error(formatError(e));}};
    refresh();const timer=setInterval(refresh,10000);window.addEventListener("focus",refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener("focus",refresh);};
  },[open,kind,record?.risk_id,tab]);

  async function acceptRisk() { setAcceptOpen(true); }

  async function submitAcceptRisk() {
    if (!acceptForm.rationale.trim()) { toast.error("Rationale is required"); return; }
    try {
      const body = {
        rationale: acceptForm.rationale,
        approver_id: user.user_id,
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

  async function inviteContact() {
    if (!record?.email) { toast.error("Contact needs an email address before invite"); return; }
    if (record?.linked_user_id) { toast.info("Contact already linked to a platform user"); return; }
    if (!confirm(`Invite ${record.name || record.email} to the platform as a client contributor?`)) return;
    try {
      const { data } = await api.post(`/contacts/${record[idField]}/invite`);
      if (record) record.linked_user_id = data.user?.user_id;
      setForm((p) => ({ ...p, linked_user_id: data.user?.user_id }));
      const inviteLink = data.invite_link;
      const message = data.simulated ? "Simulated invitation — no email was sent" : data.linked ? "Contact linked to existing platform user" : "Invitation sent";
      if (inviteLink) {
        toast.success(message, {
          description: "Share the invite link if the email doesn't arrive.",
          action: {
            label: "Copy link",
            onClick: () => {
              navigator.clipboard.writeText(inviteLink).then(
                () => toast.success("Invite link copied to clipboard"),
                () => toast.error("Unable to copy — please copy manually"),
              );
            },
          },
          duration: 10000,
        });
      } else {
        toast.success(message);
      }
      onSaved?.();
    } catch (e) { toast.error(formatError(e)); }
  }

  function renderContactActions() {
    if (!isPlatformAdmin) return null;
    const linked = form.linked_user_id || record?.linked_user_id;
    const hasEmail = !!(form.email || record?.email);
    return (
      <div className="border border-line bg-surface-subtle rounded-md p-3 flex items-center justify-between gap-2 flex-wrap" data-testid="contact-actions">
        <div className="flex items-center gap-2 text-sm text-ink-primary">
          <Users2 className="h-4 w-4 text-ink-secondary" /> Platform access
        </div>
        {linked ? (
          <span className="text-xs text-semantic-success">Linked to platform user</span>
        ) : (
          <Button size="sm" onClick={inviteContact} disabled={!hasEmail} data-testid="contact-invite"
            className="bg-primary hover:bg-primary/90">
            Invite to Platform
          </Button>
        )}
      </div>
    );
  }

  async function submitVerifyPolicy() {
    try {
      const body = {};
      ["version", "owner_id", "approver_id", "status"].forEach((k) => { if (verifyForm[k]) body[k] = verifyForm[k]; });
      ["approved_at", "last_reviewed_at", "next_review_date"].forEach((k) => {
        if (verifyForm[k]) body[k] = new Date(verifyForm[k]).toISOString();
      });
      const { data } = await api.post(`/policies/${record[idField]}/verify`, body);
      toast.success("Policy verified");
      if (record) Object.assign(record, data);
      setForm((p) => ({
        ...p,
        presence: "verified_existing",
        status: data.status || p.status,
        version: data.version || p.version,
      }));
      setVerifyOpen(false);
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
      toast.success(`Policy ${action === "submit-review" ? "sent for approval" : action + "d"}`);
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
          mime_type: f.type, linked_type: evidenceKind, linked_id: record[idField],
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
    if(kind==='findings'&&f.name==='status') f={...f,options:f.options?.map(o=>o.value==='remediated'?{...o,label:'Pending Validation'}:o)};
    if (!isEdit && (["findings", "risks"].includes(kind) && f.name === "status" || ["completion_date", "approved_at", "last_reviewed_at"].includes(f.name))) return null;
    if (kind === "policies" && f.name === "last_reviewed_at" && (record?.schedule_from_reviews || related.reviews?.length)) return <DateReadonly key={f.name} label={f.label} value={record?.last_reviewed_at} />;
    if (["completion_date", "approved_at", "verified_at", "verified_by"].includes(f.name)) return <DateReadonly key={f.name} label={f.label} value={record?.[f.name]} />;
    if (kind === "policies" && f.name === "next_review_date" && (record?.schedule_from_reviews || related.reviews?.length)) {
      const next = (related.reviews || []).filter(r => !["completed", "cancelled"].includes(r.status) && r.due_date).sort((a,b) => a.due_date.localeCompare(b.due_date))[0];
      return <div key={f.name}><DateReadonly label="Next review · scheduled in Reviews" value={next?.due_date || record?.next_review_date} /><Button size="sm" variant="link" onClick={() => setTab("related")}>Open related reviews</Button></div>;
    }
    if (f.showIf) {
      const [k, v] = Object.entries(f.showIf)[0];
      if (form[k] !== v) return null;
    }
    return (
      <div key={f.name} className={`space-y-1.5 min-w-0 ${f.type === "textarea" || ["title", "name", "policy_id"].includes(f.name) ? "record-field-wide" : ""}`}>
        <Label className="text-xs text-ink-secondary">{f.label}{f.required && <span className="text-semantic-critical ml-0.5">*</span>}</Label>
        {f.type === "textarea" ? (
          <Textarea value={form[f.name] || ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} aria-label={f.label} data-testid={`field-${f.name}`} className="text-sm" />
        ) : f.type === "policy" ? (
          <Select value={form[f.name] || "__none__"} onValueChange={v => setForm(p => ({ ...p, [f.name]: v }))}><SelectTrigger aria-label={f.label} data-testid={`field-${f.name}`}><SelectValue placeholder="Related policy" /></SelectTrigger><SelectContent><SelectItem value="__none__">No linked policy</SelectItem>{policyOptions.map(p => <SelectItem key={p.policy_id} value={p.policy_id}>{p.title}</SelectItem>)}</SelectContent></Select>
        ) : f.type === "select" ? (
          <Select value={form[f.name] || ""} onValueChange={(v) => setForm({ ...form, [f.name]: v })}>
            <SelectTrigger aria-label={f.label} data-testid={`field-${f.name}`} className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {kind === "risks" && f.name === "category" && form.category && !f.options?.some(o => o.value === form.category) && <SelectItem value={form.category}>{form.category} (recorded)</SelectItem>}
              {(f.options || []).map((o) => <SelectItem key={o.value} value={o.value} disabled={o.value !== record?.[f.name] && (f.name === "status" && ({policies:['approved'],findings:['closed','accepted','remediated'],risks:['accepted','closed','retired'],reviews:['completed'],exceptions:['approved']}[kind] || []).includes(o.value) || f.name === "presence" && o.value === "verified_existing" && record?.presence !== o.value)}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : f.type === "user" ? (
          <Select value={form[f.name] || "__none__"} onValueChange={(v) => setForm({ ...form, [f.name]: v })}>
            <SelectTrigger aria-label={f.label} data-testid={`field-${f.name}`} className="text-sm"><SelectValue placeholder="Assign…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input type={f.type || "text"} value={form[f.name] || ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} aria-label={f.label} data-testid={`field-${f.name}`} className="text-sm" />
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
        <div className="text-sm font-mono text-ink-primary">{value ? new Date(String(value).slice(0, 10) + "T00:00:00").toLocaleDateString() : <span className="text-ink-help">—</span>}</div>
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
          <div className="text-xs font-mono uppercase tracking-widest text-ink-help">Calculated</div>
          <div className="font-mono text-sm text-ink-primary">Score {liveScore || "—"}</div>
          <span className="text-ink-help">→</span>
          {liveLevel ? (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${LEVEL_TONE[liveLevel]}`}>{liveLevel}</span>
          ) : <span className="text-ink-help text-xs">select both</span>}
        </div>
        <div>
          <Label className="text-xs text-ink-secondary">Impact description</Label>
          <Textarea value={form.impact_description || ""} onChange={(e) => setForm({ ...form, impact_description: e.target.value })} rows={3} className="text-sm" data-testid="field-impact_description" />
        </div>
        {["likelihood_rationale","impact_rationale","assessment_rationale"].map(key=><div key={key}><Label>{key.replaceAll("_"," ")}</Label><Textarea aria-label={key.replaceAll("_"," ")} value={form[key]||""} onChange={e=>setForm({...form,[key]:e.target.value})}/></div>)}
      </div>
    );
  }

  function renderRiskTreatment() {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-medium text-sm mb-2">Remediation Action Items</h3>
          {(related.tasks||[]).map(t=><button className="block w-full text-left text-sm border border-line rounded-md p-2 mb-2" key={t.task_id} onClick={()=>setRelatedDrawer({kind:"tasks",record:t})}>{t.title} · {actionStatus(t.status)}</button>)}
          {!related.tasks?.length&&<p className="text-sm text-ink-secondary mb-2">No linked remediation work yet.</p>}
          {canWrite&&<Button size="sm" variant="outline" className="mb-4" onClick={()=>setRelatedDrawer({kind:"tasks",record:null,initialValues:{source_type:"risk",source_id:record.risk_id,assignee_id:record.owner_id||null}})}>Create Action Item</Button>}
          {canWrite&&<Button size="sm" variant="outline" className="mb-4 ml-2" onClick={async()=>{try{const {data}=await api.get("/tasks",{params:{client_id:clientId}});setLinkTask({options:data.filter(t=>!(related.tasks||[]).some(x=>x.task_id===t.task_id)),task_id:""});}catch(e){toast.error(formatError(e));}}}>Link existing Action Item</Button>}
          <Label className="text-xs text-ink-secondary">Treatment strategy</Label>
          <Select value={form.treatment || ""} onValueChange={(v) => setForm({ ...form, treatment: v })}>
            <SelectTrigger data-testid="field-treatment" className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {["mitigate", "accept", "transfer", "avoid", "monitor"].map((t) => (
                <SelectItem key={t} value={t} disabled={t === 'accept' && record?.treatment !== 'accept'}>{t[0].toUpperCase() + t.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-ink-secondary">Acceptance rationale</Label>
          <Textarea readOnly value={record?.acceptance_rationale || ""} rows={3} className="text-sm" data-testid="field-acceptance_rationale" />
          <p className="text-xs text-ink-secondary">Recorded by the acceptance action; renew acceptance to record a new decision.</p>
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
            <div className="text-xs font-mono uppercase tracking-widest text-ink-help">Acceptance</div>
            <div><span className="text-ink-secondary">Approved by:</span> <span className="text-ink-primary font-medium">{userMap[record.accepted_by] || record.accepted_by || "—"}</span></div>
            <div><span className="text-ink-secondary">Accepted on:</span> <span className="font-mono">{new Date(record.acceptance_date).toLocaleDateString()}</span></div>
            {record.acceptance_expires_at && <div><span className="text-ink-secondary">Expires:</span> <span className="font-mono">{new Date(record.acceptance_expires_at).toLocaleDateString()}</span></div>}
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
          <h3 className="text-sm font-medium mb-2">Completed Risk Reviews</h3>
          {!riskHistory.length&&<p className="text-sm text-ink-secondary">No completed Risk Reviews recorded.</p>}
          {riskHistory.map(o=><button key={o.occurrence_id} className="block w-full text-left border border-line rounded-md p-3 mb-2 text-sm" onClick={async()=>{const {data}=await api.get("/reviews",{params:{client_id:clientId}});const r=data.find(r=>r.review_id===o.review_id);if(r)setRelatedDrawer({kind:"reviews",record:r,initialValues:{occurrence:o}});}}><strong>{o.period}</strong><div>Scheduled {o.due_date?.slice(0,10)} · Completed {o.completed_at?.slice(0,10)} · {o.completed_by_name||userMap[o.completed_by]||o.completed_by}</div><div>{o.outcome}</div></button>)}
          <div className="text-xs font-mono uppercase tracking-widest text-ink-help mb-2 mt-4">Rating history</div>
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

  function vendorPanel(section) {
    return <VendorGovernancePanel tab={section} record={record} form={form} setForm={setForm} canWrite={canWrite} isAdmin={isPlatformAdmin} users={users} reviews={linkedReviews} tasks={related.tasks||[]} risks={linkedRisks} evidence={evidenceItems} openRecord={setRelatedDrawer} uploadFiles={uploadFiles} downloadEv={downloadEv} onSaved={()=>{loadLinkedReviews();loadLinkedRisks();loadRelated();onSaved?.();}}/>;
  }

  // -------- Overview renderers per kind --------
  function renderOverview() {
    if(kind==='tasks'&&taskCompletion)return <section className="space-y-3 text-sm" data-testid="action-completion-handoff">
      <div role="status"><h3 className="font-medium">Action Item completed</h3><p className="mt-1">{taskCompletion.task.title}</p><p className="mt-2 text-ink-secondary">{completionHandoff(taskCompletion.finding)}</p><p className="mt-2 text-ink-secondary">This Action Item is now in Completed, with its history preserved.</p></div>
      {taskCompletion.finding&&<Button size="sm" variant="outline" onClick={()=>openLinkedRecord({kind:'findings',record:taskCompletion.finding})}>View Finding</Button>}
    </section>;
    if (kind === "tasks") return <ActionItemFields form={form} setForm={setForm} record={record} clientId={clientId} canWrite={canWrite} saving={saving} onTransition={save} sourceLocked={!!initialValues?.source_id} related={related} onOpen={openLinkedRecord}/>;
    if (kind === "risks") {
      return (
        <div className="space-y-4">
          {renderRiskActionsPanel()}
          {!liveLevel && <p className="text-sm text-ink-secondary">Needs assessment. Select numeric likelihood and impact in Assessment.{record?.likelihood || record?.impact ? ` Legacy ratings: likelihood ${record.likelihood || 'unknown'}, impact ${record.impact || 'unknown'}.` : ''}</p>}
          {record?.acceptance_expires_at && <DateReadonly label="Acceptance expiry · unchanged by routine reviews" value={record.acceptance_expires_at} />}
          <div className="text-xs font-mono">{record?.display_id || "ID assigned on creation"}</div>
          {renderFieldsByNames(["title", "category", "status", "owner_id", "description"])}
          <div className="grid grid-cols-2 gap-3"><DateReadonly label="Created" value={record?.created_at}/><DateReadonly label="Last Reviewed" value={record?.last_reviewed}/></div>
          <RiskSourceFields form={form} setForm={setForm} clientId={clientId} disabled={!canWrite}/>
          <RiskScheduleFields form={form} setForm={setForm} disabled={!canWrite||!isPlatformAdmin}/>
          {record?.closed_at&&<div className="text-sm">Closed: {record.closure_reason?.replaceAll("_"," ")} · {userMap[record.closed_by] || record.closed_by}<DateReadonly label="Closed on" value={record.closed_at}/>{record.closure_note}</div>}
        </div>
      );
    }
    if (kind === "vendors") return vendorPanel("overview");
    // Default: use full schema
    return (
      <div className="space-y-4">
        {kind === "reviews" && renderReviewActionsPanel()}
        {kind === "findings" && renderFindingActionsPanel()}
        {kind === 'findings' && isEdit && <section className="space-y-2 text-sm" aria-label="Corrective actions"><h3 className="font-medium">Corrective Actions</h3><p className="text-ink-secondary">Work completion is followed by separate Finding validation.</p>{relatedError?<p role="alert">Corrective actions could not be loaded: {relatedError}</p>:relatedLoading?<p>Loading corrective actions…</p>:<CorrectiveActions actions={(related.tasks||[]).filter(t=>t.finding_id===record.finding_id&&t.client_id===record.client_id)} members={users} onOpen={task=>openLinkedRecord({kind:'tasks',record:task})}/>}</section>}
        {kind === "policies" && renderPolicyPanel()}
        {kind === "contacts" && renderContactActions()}
        {kind === "exceptions" && isEdit && isPlatformAdmin && record.status !== "approved" && <Button onClick={() => { setDecisionForm({action:'approve',rationale:''}); setDecisionOpen(true); }}>Approve exception</Button>}
        {kind === "reviews" && record?.status === "completed" && <div className="rounded-md border border-line p-4 space-y-2 text-sm" data-testid="review-outcome">
          {record.completion_snapshot ? <><p>Completed by {userMap[record.completion_snapshot.by] || record.completion_snapshot.by} · {record.completion_snapshot.at?.slice(0,10)}</p><p>Period: {record.completion_snapshot.tested_period}</p><p>Examined: {record.completion_snapshot.tested_scope}</p><p className="whitespace-pre-wrap">Conclusion: {record.completion_snapshot.conclusion}</p><p>{record.completion_snapshot.evidence?.length || 0} preserved evidence version(s){record.completion_snapshot.no_evidence_reason ? ` · ${record.completion_snapshot.no_evidence_reason}` : ''}</p></> : <p>Historical completion: structured outcome and decision provenance were not captured.</p>}
          {(record.amendments || []).map((a,i) => <p key={i}>Amendment · {a.at?.slice(0,10)} · {userMap[a.by] || a.by}: {a.rationale}</p>)}
        </div>}
        {!!record?.decision_history?.length && <div className="rounded-md border border-line p-3 text-sm space-y-2">{record.decision_history.map((d,i) => <p key={i}>{d.action?.replaceAll('_',' ')} · {userMap[d.by || d.recorded_by] || d.by || d.recorded_by} · {(d.at || d.recorded_at)?.slice(0,10)}{d.rationale ? `: ${d.rationale}` : ''}{d.provenance ? ` · ${d.provenance}` : ''}</p>)}</div>}
        <fieldset disabled={kind === "reviews" && record?.status === "completed"} className="record-fields">{(schema || []).map((f) => renderField(f))}</fieldset>
      </div>
    );
  }

  function renderReviewActionsPanel() {
    if (!isEdit) return null;
    return (
      <div className="border border-line bg-surface-subtle rounded-md p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-ink-primary">
            <Zap className="h-4 w-4 text-ink-secondary" /> Review actions
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite && ["needs_scheduling", "upcoming"].includes(record?.status) && <Button size="sm" variant="outline" data-testid="review-start" onClick={async () => {
              try { await api.patch(`/reviews/${record[idField]}`, { status: "in_progress" }); record.status = "in_progress"; setForm(p => ({ ...p, status: "in_progress" })); onSaved?.(); toast.success("Review started"); }
              catch (e) { toast.error(formatError(e)); }
            }}>Start review</Button>}
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
        <div className="flex items-center gap-2 text-sm text-ink-primary"><Zap className="h-4 w-4 text-ink-secondary" /> Finding actions</div>
        <div className="flex flex-wrap gap-2">
          {!['closed','accepted'].includes(status)&&<Button size="sm" variant="outline" data-testid="quick-create-task" disabled={relatedLoading||!!relatedError} onClick={()=>setRelatedDrawer({kind:'tasks',record:null,initialValues:{source_type:'finding',source_id:record.finding_id,assignee_id:record.owner_id||null,priority:record.severity||'medium'}})}>{related.tasks?.length?'Add Corrective Action':'Create Corrective Action'}</Button>}
          {status === "remediated" && isPlatformAdmin && <Button size="sm" data-testid="finding-validate" disabled={relatedLoading||!!relatedError} onClick={async() => { if(await loadRelated()){setDecisionForm({ rationale: "" }); setDecisionOpen(true);} }}>Validate and close</Button>}
          {isPlatformAdmin && !['closed','accepted'].includes(status) && <Button size="sm" variant="outline" onClick={() => { setDecisionForm({action:'accept',rationale:''}); setDecisionOpen(true); }}>Accept finding</Button>}
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
        <div className="flex items-center gap-2 text-sm text-ink-primary"><ShieldCheck className="h-4 w-4 text-ink-secondary" /> Risk actions</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={markRiskReviewed} data-testid="risk-mark-reviewed">Review Risk</Button>
          {isPlatformAdmin&&<Button size="sm" variant="outline" onClick={()=>setClosure({reason:"remediated",note:""})}>Close Risk</Button>}
          {isPlatformAdmin && record?.status !== "closed" && (
            <Button size="sm" onClick={acceptRisk} data-testid="risk-accept" className="bg-primary hover:bg-primary/90">
              {record?.status === 'accepted' ? 'Renew acceptance' : 'Accept risk'}
            </Button>
          )}
        </div>
      </div>
    );
  }

  function renderPolicyPanel() {
    if (!isEdit) return null;
    const presence = form.presence || record?.presence;
    const canVerify = isPlatformAdmin && presence && presence !== "verified_existing" && presence !== "not_applicable";
    return (
      <div className="border border-line bg-surface-subtle rounded-md p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm text-ink-primary">Approval workflow</div>
          <div className="flex items-center gap-1.5">
            {presence && <StatusBadge value={presence} />}
            <StatusBadge value={status || "draft"} />
          </div>
        </div>
        {canVerify && (
          <div className="flex items-center justify-between border-t border-line pt-2">
            <div className="text-xs text-ink-secondary">Confirm the document and record verified metadata.</div>
            <Button size="sm" onClick={() => { setVerifyForm({ version: record?.version || "", owner_id: record?.owner_id || "", approver_id: record?.approver_id || "", approved_at: toDateInput(record?.approved_at), last_reviewed_at: toDateInput(record?.last_reviewed_at), next_review_date: toDateInput(record?.next_review_date), status: ["approved", "in_review", "draft"].includes(record?.status) ? record.status : "draft" }); setVerifyOpen(true); }} data-testid="policy-verify" className="bg-primary hover:bg-primary/90">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Verify policy
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {status === "draft" && canWrite && (
            <Button size="sm" variant="outline" onClick={() => policyAction("submit-review")} data-testid="policy-submit-review">
              <Send className="h-3.5 w-3.5 mr-1" /> Submit for approval
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
          <div className="pt-2 border-t border-line">
            <div className="text-xs font-mono uppercase tracking-widest text-ink-muted mb-1">History</div>
            <ul className="space-y-1.5">
              {record.approval_history.map((h, i) => (
                <li key={i} className="text-xs text-ink-secondary flex items-center gap-2">
                  <span className="font-mono text-ink-help">{new Date(h.at).toLocaleString()}</span>
                  <span className="font-medium">{h.by_email}</span>
                  <span className="text-ink-muted">{h.action}</span>
                  {h.reason && <span className="text-semantic-critical italic">"{h.reason}"</span>}
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
        {relatedTotal === 0 && <div className="text-sm text-ink-muted">No related records yet.</div>}
        {Object.entries(related).map(([k, list]) => (
          (list && list.length > 0) ? (
            <div key={k}>
              <Link to={k==='framework_assessments'?'/compliance/cis-ig1':k==='ai_systems'?'/ai-governance':k==="tasks"?"/action-items":k==="assessments"?"/onboarding":`/${k}`} className="text-xs font-mono uppercase tracking-widest text-ink-muted hover:text-ink-primary flex items-center gap-1">{k==='framework_assessments'?'CIS Safeguards':k==='ai_systems'?'AI Governance':k} <ArrowUpRight className="h-3 w-3" /></Link>
              <ul className="mt-1.5 space-y-1.5">
                {list.map((it) => (
                  <li key={it[ID_FIELD[k]] || it.evidence_id || it.assessment_id} className="border border-line rounded-md p-2.5 text-sm flex items-center justify-between hover:bg-surface-subtle" data-testid={`related-${k}-item`}>
                    <div className="min-w-0">
                      {(SCHEMAS[k]||k==="assessments") ? <button className="text-left text-ink-primary font-medium hover:underline" onClick={() => setRelatedDrawer({ kind: k, record: it, initialValues:k === "reviews" ? relatedReviewInitialValues(it, record) : {} })}>{it.title || it.name}</button> : <div className="text-ink-primary font-medium truncate">{it.title || it.name || it.filename}</div>}
                      <div className="text-xs text-ink-muted font-mono">{it.display_id || it[ID_FIELD[k]] || it.evidence_id || it.assessment_id}</div>
                      {k === "reviews" && it.linked_occurrence && <div className="text-xs text-ink-secondary">Occurrence: {it.linked_occurrence.period || "Not recorded"} · {it.linked_occurrence.status}</div>}
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
        {canWrite && !(kind === "reviews" && record?.status === "completed") && (
          <div
            data-testid="drawer-evidence-dropzone"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(Array.from(e.dataTransfer.files)); }}
            onClick={() => inputRef.current?.click()}
            className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition ${dragOver ? "border-line-strong bg-surface-subtle" : "border-line-strong hover:bg-surface-subtle"}`}
          >
            <UploadCloud className="h-6 w-6 mx-auto text-ink-muted mb-1" />
            <div className="text-sm font-medium text-ink-primary">Drop files here to attach</div>
            <div className="text-xs text-ink-muted mt-0.5">They will be linked to this {singular}.</div>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => uploadFiles(Array.from(e.target.files || []))} data-testid="drawer-evidence-input" />
          </div>
        )}
        <ul className="divide-y divide-line border border-line rounded-md">
          {evidenceItems.length === 0 && <li className="p-4 text-center text-ink-help text-sm">No evidence attached yet.</li>}
          {evidenceItems.map((ev, i) => (
            <li key={ev.evidence_id} className="flex items-center justify-between px-3 py-2 hover:bg-surface-subtle" data-testid={`drawer-evidence-item-${i}`}>
              <div className="min-w-0">
                <div className="text-sm text-ink-primary font-medium truncate">{ev.filename}</div>
                <div className="text-xs text-ink-muted font-mono">{ev.uploaded_by_email} · {new Date(ev.created_at).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => downloadEv(ev)} className="p-1 rounded hover:bg-surface-subtle text-ink-muted"><Download className="h-3.5 w-3.5" /></button>
                {isPlatformAdmin && !(kind === "tasks" && record?.status === "done") && <button onClick={() => deleteEv(ev)} className="p-1 rounded hover:bg-semantic-critical-bg text-ink-help hover:text-semantic-critical"><Trash2 className="h-3.5 w-3.5" /></button>}
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
          {comments.length === 0 && <div className="text-sm text-ink-muted">No comments yet.</div>}
          {comments.map((c) => (
            <div key={c.comment_id} className="border border-line rounded-md p-3 bg-surface-card">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                <span className="font-medium text-ink-primary">{c.user_name || c.user_email}</span>
                <span className="font-mono">{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <div className="text-sm text-ink-secondary whitespace-pre-wrap">{c.body}</div>
            </div>
          ))}
        </div>
        <div className="space-y-2 pt-2 border-t border-line">
          <Textarea disabled={!canWrite} value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment… use @email to mention" data-testid="comment-input" className="text-sm" />
          <Button disabled={!canWrite} onClick={submitComment} data-testid="comment-submit" size="sm">Post comment</Button>
        </div>
      </div>
    );
  }
  function renderActivity() {
    return (
      <div className="space-y-2">
        {activity.length === 0 && <div className="text-sm text-ink-muted">No activity yet.</div>}
        {activity.map((a) => (
          <div key={a.log_id || a.audit_id} className="text-xs flex items-center gap-3 py-2 border-b border-line">
            <span className="font-mono text-ink-help">{new Date(a.at).toLocaleString()}</span>
            <span className="text-ink-secondary font-medium">{a.user_email}</span>
            <span className="text-ink-muted">{a.action}</span>
            <span className="text-ink-help">{a.entity_type}</span>
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
      if (tab === "related") return <div className="space-y-4">{renderRelated()}{renderEvidence()}</div>;
    }
    if (kind === "vendors") {
      if (["data_access","assurance","reviews_tab","actions_tab","risks_tab","contract"].includes(tab)) return vendorPanel(tab);
    }
    if (kind === "requirements") {
      if (tab === "applicability") return (
        <div className="space-y-4">
          {renderFieldsByNames(["applicability", "rationale"])}
          <div className="border border-line rounded-md p-3 bg-surface-subtle text-xs">
            <div className="text-xs font-mono uppercase tracking-widest text-ink-help mb-1">Guidance</div>
            <div className="text-ink-secondary">Applicable = confirmed applies. Potentially = likely but needs confirmation. Needs Review = undetermined. Not Applicable = confirmed does not apply and requires a rationale.</div>
          </div>
        </div>
      );
      if (tab === "verification") return (
        <div className="space-y-4">
          {renderFieldsByNames(["status", "owner_id", "next_review_date", "source", "note"])}
          {record?.is_client_reported && (
            <div className="border border-semantic-info-border bg-semantic-info-bg rounded-md p-3 text-xs text-semantic-info">
              Client-reported during GRC Program Onboarding. The GRC team should verify and set the next review date above.
            </div>
          )}
        </div>
      );
      if (tab === "related") return renderRelated();
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
      <SheetContent side="right" className="record-drawer w-full sm:max-w-2xl p-0 flex flex-col" data-testid={`${kind}-drawer`}>
        <SheetHeader className="px-6 py-4 border-b border-line">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-ink-help">{singular}</div>
              <SheetTitle className="font-heading text-xl">{isEdit ? (record.title || record.name) : `New ${singular}`}</SheetTitle>
              {isEdit && status && <div className="mt-2">{kind === "tasks" ? <span className="pill pill-neutral">{actionStatus(status)}</span> : <StatusBadge value={status} />}</div>}
            </div>
            <button aria-label="Close record" onClick={() => onOpenChange(false)} className="p-1 rounded hover:bg-surface-subtle" data-testid="drawer-close"><X className="h-4 w-4" /></button>
          </div>
          {renderTabList()}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {renderTabContent()}
        </div>

        <div className="px-6 py-3 border-t border-line bg-surface-subtle flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="drawer-cancel">{taskCompletion?'Close':'Cancel'}</Button>
          {kind === "reviews" && record?.status === "completed" && canWrite && <Button size="sm" onClick={() => { setDecisionForm({ rationale: "" }); setDecisionOpen(true); }}>Add amendment</Button>}
          {tabIsFormEditable && !taskCompletion && !(kind === "reviews" && record?.status === "completed") && (
            <Button size="sm" onClick={save} disabled={saving || !canWrite || kind==="vendors"&&record?.status==="inactive"} data-testid="drawer-save">{saving ? "Saving…" : isEdit ? "Save changes" : "Create"}</Button>
          )}
        </div>
      </SheetContent>

      {relatedDrawer && <RecordDrawer open={true} onOpenChange={v => { if (!v) { setRelatedDrawer(null); loadRelated(); } }} kind={relatedDrawer.kind} record={relatedDrawer.record} initialValues={relatedDrawer.initialValues} schema={SCHEMAS[relatedDrawer.kind]?.fields} clientId={clientId} users={users} onSaved={() => { loadRelated(); refreshFindingReadiness(); refreshRisk(); if(kind==="vendors"){loadLinkedReviews();loadLinkedRisks();} onSaved?.(); }} />}

      <Sheet open={decisionOpen} onOpenChange={setDecisionOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader><SheetTitle>{decisionForm.action === 'accept' ? 'Accept finding' : decisionForm.action === 'approve' ? 'Approve exception' : kind === "findings" ? "Validate remediation" : record?.status === "completed" ? "Add review amendment" : "Complete review"}</SheetTitle></SheetHeader>
          <form onSubmit={submitDecision} className="mt-5 space-y-4">
            {kind==='findings'&&!decisionForm.action&&<section className="space-y-3 text-sm" aria-label="Validation context"><h3 className="font-medium">{form.title||record.title}</h3><p className="whitespace-pre-wrap">{form.description||record.description||'No description recorded.'}</p><p className="text-ink-secondary">Current Finding Status: <StatusBadge value={status}/></p><p>Confirm that the corrective work resolved the Finding. Completing an Action alone does not validate it.</p><CorrectiveActions actions={(related.tasks||[]).filter(t=>t.finding_id===record.finding_id&&t.client_id===record.client_id)} members={users}/></section>}
            {kind === "reviews" && record?.status !== "completed" ? <>
              <p className="text-sm">Confirm the scope, examine the supporting evidence, and record the outcome. Raise Findings for gaps before completing this Review.</p>
              <ul className="list-disc pl-5 text-sm space-y-1">{(rules.reviewPlaybooks[record?.review_type] || rules.reviewPlaybooks.default).map(item => <li key={item}>{item}</li>)}</ul>
              <Label className="block">Tested period<Input required value={decisionForm.tested_period || ""} onChange={e => setDecisionForm(p => ({ ...p, tested_period: e.target.value }))} /></Label>
              <Label className="block">What was examined?<Textarea required value={decisionForm.tested_scope || ""} onChange={e => setDecisionForm(p => ({ ...p, tested_scope: e.target.value }))} /></Label>
              <Label className="block">Conclusion and exceptions<Textarea required value={decisionForm.conclusion || ""} onChange={e => setDecisionForm(p => ({ ...p, conclusion: e.target.value }))} /></Label>
              <p className="text-sm">{evidenceItems.length} evidence file(s) attached. Their versions will be preserved with this outcome.</p>
              {!evidenceItems.length && <Label className="block">Why is no evidence required?<Textarea required value={decisionForm.no_evidence_reason || ""} onChange={e => setDecisionForm(p => ({ ...p, no_evidence_reason: e.target.value }))} /></Label>}
              <label className="flex gap-2 text-sm"><Checkbox required checked={!!decisionForm.checklist_confirmed} onCheckedChange={checked => setDecisionForm(p => ({ ...p, checklist_confirmed: checked === true }))} />I checked the scope, evidence, outcome, and any required follow-up.</label>
            </> : <Label className="block">{decisionForm.action ? "Decision rationale" : kind === "findings" ? "What confirms the remediation worked?" : "Amendment explanation"}<Textarea required value={decisionForm.rationale || ""} onChange={e => setDecisionForm(p => ({ ...p, rationale: e.target.value }))} /></Label>}
            <Button type="submit" disabled={saving}>{saving ? "Recording…" : "Record decision"}</Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={findingOpen} onOpenChange={setFindingOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-testid="review-finding-form">
          <SheetHeader><SheetTitle>Raise finding</SheetTitle></SheetHeader>
          <p className="my-4 text-sm text-ink-secondary">Source review: {record?.title}</p>
          <form onSubmit={saveReviewFinding} className="space-y-4">
            <Label className="block">Finding title *<Input required value={findingForm.title || ""} onChange={e => setFindingForm(p => ({ ...p, title: e.target.value }))} data-testid="finding-title" /></Label>
            <Label className="block">What was identified?<Textarea value={findingForm.description || ""} onChange={e => setFindingForm(p => ({ ...p, description: e.target.value }))} /></Label>
            <div><Label>Severity</Label><Select value={findingForm.severity || "medium"} onValueChange={v => setFindingForm(p => ({ ...p, severity: v }))}><SelectTrigger aria-label="Finding severity"><SelectValue /></SelectTrigger><SelectContent>{["low", "medium", "high", "critical"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Owner</Label><Select value={findingForm.owner_id || "__none__"} onValueChange={v => setFindingForm(p => ({ ...p, owner_id: v === "__none__" ? "" : v }))}><SelectTrigger aria-label="Finding owner"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">Unassigned</SelectItem>{users.map(u => <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>)}</SelectContent></Select></div>
            <Label className="block">Due date<Input type="date" value={findingForm.due_date || ""} onChange={e => setFindingForm(p => ({ ...p, due_date: e.target.value }))} /></Label>
            <Label className="block">Remediation action *<Input required placeholder="Develop and approve a Business Impact Analysis" value={findingForm.remediation_title || ""} onChange={e => setFindingForm(p => ({ ...p, remediation_title: e.target.value }))} data-testid="finding-remediation-title" /></Label>
            <Label className="block">Remediation plan<Textarea value={findingForm.remediation_plan || ""} onChange={e => setFindingForm(p => ({ ...p, remediation_plan: e.target.value }))} /></Label>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setFindingOpen(false)}>Cancel</Button><Button type="submit" disabled={saving} data-testid="finding-save">{saving ? "Saving…" : "Save finding and action"}</Button></div>
          </form>
        </SheetContent>
      </Sheet>

      {linkTask&&<Sheet open onOpenChange={v=>!v&&setLinkTask(null)}><SheetContent><SheetHeader><SheetTitle>Link Action Item</SheetTitle></SheetHeader><div className="space-y-4 mt-6"><p className="text-sm">The original source and Action Item remain unchanged.</p><Select value={linkTask.task_id||"__none__"} onValueChange={task_id=>setLinkTask({...linkTask,task_id})}><SelectTrigger aria-label="Existing Action Item"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__" disabled>Select a record</SelectItem>{linkTask.options.map(t=><SelectItem key={t.task_id} value={t.task_id}>{t.title}</SelectItem>)}</SelectContent></Select><Button disabled={!linkTask.task_id||saving} onClick={async()=>{setSaving(true);try{await api.post(`/risks/${record.risk_id}/link-action-item`,{task_id:linkTask.task_id});setLinkTask(null);loadRelated();onSaved?.();}catch(e){toast.error(formatError(e));}finally{setSaving(false);}}}>Link Action Item</Button></div></SheetContent></Sheet>}
      {closure&&<Sheet open onOpenChange={value=>!value&&setClosure(null)}><SheetContent className="sm:max-w-md"><SheetHeader><SheetTitle>Close Risk</SheetTitle></SheetHeader><div className="space-y-4 mt-6"><Label>Closure reason</Label><Select value={closure.reason} onValueChange={reason=>setClosure({...closure,reason})}><SelectTrigger aria-label="Closure reason"><SelectValue/></SelectTrigger><SelectContent>{Object.entries({remediated:"Remediated",no_longer_applicable:"No Longer Applicable",system_process_retired:"System / Process Retired",condition_removed:"Risk Condition Removed",other:"Other"}).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Label>Closure note</Label><Textarea aria-label="Closure note" value={closure.note} onChange={e=>setClosure({...closure,note:e.target.value})}/><p className="text-sm text-ink-secondary">The Risk and its history remain available. Future linked Reviews will be cancelled.</p><Button disabled={saving} onClick={async()=>{setSaving(true);try {await api.post(`/risks/${record.risk_id}/close`,closure);setClosure(null);await refreshRisk();onSaved?.();toast.success("Risk closed and retained");}catch(e){toast.error(formatError(e));}finally{setSaving(false);}}}>Confirm closure</Button></div></SheetContent></Sheet>}
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
                <p className="text-sm">{user?.name || user?.email} · your authenticated decision</p>
              </div>
              <div>
                <Label className="text-xs text-ink-secondary">Acceptance expiry (required)</Label>
                <Input type="date" data-testid="accept-expiry" value={acceptForm.expiry_date} onChange={(e) => setAcceptForm({ ...acceptForm, expiry_date: e.target.value })} className="text-sm" />
                <div className="text-xs text-ink-help mt-1">The risk will reappear in "Due for Review" as this date approaches.</div>
              </div>
              <div>
                <Label className="text-xs text-ink-secondary">Compensating controls (optional)</Label>
                <Textarea data-testid="accept-controls" value={acceptForm.compensating_controls} onChange={(e) => setAcceptForm({ ...acceptForm, compensating_controls: e.target.value })} rows={2} className="text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setAcceptOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={submitAcceptRisk} data-testid="accept-submit" className="bg-primary hover:bg-primary/90">Accept risk</Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Verify Policy dialog */}
      {kind === "policies" && (
        <Sheet open={verifyOpen} onOpenChange={setVerifyOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md p-0" data-testid="verify-policy-dialog">
            <SheetHeader className="px-6 py-4 border-b border-line">
              <SheetTitle>Verify policy</SheetTitle>
            </SheetHeader>
            <div className="p-6 space-y-4">
              <div className="text-xs text-ink-secondary">
                Moves this policy from <strong>Reported Existing</strong> to <strong>Verified Existing</strong> and records the verified metadata below. Blank fields will be left unchanged.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-ink-secondary">Version</Label>
                  <Input value={verifyForm.version} onChange={(e) => setVerifyForm({ ...verifyForm, version: e.target.value })} placeholder="2.3" className="text-sm" data-testid="verify-version" />
                </div>
                <div>
                  <Label className="text-xs text-ink-secondary">Lifecycle status</Label>
                  <Select value={verifyForm.status} onValueChange={(v) => setVerifyForm({ ...verifyForm, status: v })}>
                    <SelectTrigger data-testid="verify-status" className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="in_review">In review</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-ink-secondary">Owner</Label>
                  <Select value={verifyForm.owner_id || "__none__"} onValueChange={(v) => setVerifyForm({ ...verifyForm, owner_id: v === "__none__" ? "" : v })}>
                    <SelectTrigger data-testid="verify-owner" className="text-sm"><SelectValue placeholder="Assign" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Leave unchanged</SelectItem>
                      {users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-ink-secondary">Approver</Label>
                  <Select value={verifyForm.approver_id || "__none__"} onValueChange={(v) => setVerifyForm({ ...verifyForm, approver_id: v === "__none__" ? "" : v })}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Assign" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Leave unchanged</SelectItem>
                      {users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-ink-secondary">Approved on</Label>
                  <Input type="date" value={verifyForm.approved_at} onChange={(e) => setVerifyForm({ ...verifyForm, approved_at: e.target.value })} className="text-sm" data-testid="verify-approved-at" />
                </div>
                <div>
                  <Label className="text-xs text-ink-secondary">Last reviewed</Label>
                  <Input type="date" value={verifyForm.last_reviewed_at} onChange={(e) => setVerifyForm({ ...verifyForm, last_reviewed_at: e.target.value })} className="text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-ink-secondary">Next review</Label>
                  <Input type="date" value={verifyForm.next_review_date} onChange={(e) => setVerifyForm({ ...verifyForm, next_review_date: e.target.value })} className="text-sm" data-testid="verify-next-review" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setVerifyOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={submitVerifyPolicy} data-testid="verify-submit" className="bg-primary hover:bg-primary/90">
                  Mark as verified
                </Button>
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
                <div className="text-xs text-ink-help mt-1">Defaults to +365 days if left blank.</div>
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
                <Button size="sm" onClick={submitScheduleReview} data-testid="schedule-submit" className="bg-primary hover:bg-primary/90">
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
