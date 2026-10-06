import {readEvidenceFile as fileToBase64} from '@/lib/evidenceFile';
import {RiskCategoryField,RiskSummary} from './BrawndoRiskFields';
import {RiskAssessmentPanel,RiskTreatmentPanel,RiskHistoryPanel} from './RiskRecordPanels';
import {DateReadonly} from './RegisterCells';
import {pilotRiskStatus,newRiskDefaults} from '@/lib/brawndoRisks';
import {policyStatus,nextPolicyReview} from '@/lib/brawndoPolicies';
import BrawndoPolicyDetails,{PolicyStatusField} from './BrawndoPolicyDetails';
import VendorGovernancePanel from "./VendorGovernancePanel";
import BrawndoVendorDetails from './BrawndoVendorDetails';
import AssigneeSelect from "./AssigneeSelect";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {ClientPresentationContext} from './ClientSurface';
import {useCreateIntent} from '@/lib/createIntent';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {Dialog,DialogContent,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {isReferencePresentation,isBrawndoReference} from '@/lib/reference';
import './BrawndoCisAssessment.css';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import api, { formatError } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { X, ArrowUpRight, Zap, UploadCloud, ShieldCheck } from "lucide-react";
import PolicyWorkflowPanel from './PolicyWorkflowPanel';
import { Link } from "react-router-dom";
import { SCHEMAS } from "@/lib/schemas";
import {RiskSourceFields,RiskScheduleFields} from "./RiskGovernanceFields";
import {riskLevel} from "@/lib/grcWork";
import {displayDay} from "@/lib/managementDates";
import RelatedAssessment from "./RelatedAssessment";
import ReviewDrawer from "./ReviewDrawer";
import RecordSummary from "./RecordSummary";
import AIDrawer from './AIDrawer';
import FrameworkDrawer from './FrameworkDrawer';
import {OrganizationalControlDrawer} from './OrganizationalControls';
import ActionItemFields from "./ActionItemFields";
import { taskSource, SOURCE_RECORDS, actionStatus } from "@/lib/actionItems";
import { relatedReviewInitialValues } from "@/lib/reviewOccurrences";
import {completionHandoff} from '@/lib/remediation';
import CorrectiveActions from './CorrectiveActions';
import EvidencePanel from './EvidencePanel';
import ActionSourceChain from './ActionSourceChain';
import RequirementBasis, {GovernanceContextFields} from './RequirementBasis';
import {resolveEvidenceSource} from '@/lib/evidenceContext';
import ContactWorkspace from './ContactWorkspace';
import AssignmentHelp from './AssignmentHelp';
import RemediationTicketDrawer from './RemediationTicketDrawer';
import { personLabel, useClientPeople } from '@/lib/people';
import { editableFields } from '@/lib/permissions';

const ID_FIELD = {
  framework_assessments:'framework_assessment_id',
  ai_systems:'ai_system_id',
  reviews: "review_id", findings: "finding_id", risks: "risk_id", policies: "policy_id",
  vendors: "vendor_id", assets: "asset_id", tasks: "task_id", exceptions: "exception_id",
  contacts: "contact_id", requirements: "requirement_id",
};


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



function toDateInput(v) {
  if (!v) return "";
  return typeof v === "string" && v.length > 10 ? v.slice(0, 10) : v;
}

export default function RecordDrawer(props) {
  if(props.record&&['tasks','findings'].includes(props.kind))return <RemediationTicketDrawer {...props}/>;
  if(props.kind==='contacts')return <ContactWorkspace {...props}/>;
  if(props.kind==='organizational_controls')return <OrganizationalControlDrawer {...props}/>;
  if(props.kind==='framework_assessments')return <FrameworkDrawer {...props}/>;
  if(props.kind==='ai_systems') return <AIDrawer {...props}/>;
  if(props.kind==="assessments") return <RelatedAssessment {...props}/>;
  return props.kind === "reviews" ? <ReviewDrawer {...props} /> : <EntityDrawer {...props} />;
}

function EntityDrawer({ open, onOpenChange, kind, record, schema, clientId, users: passedUsers = [], onSaved, initialValues }) {
  // Callers that already hold the client's people pass them; others (Calendar, deep links) load them here.
  const loadedPeople = useClientPeople(passedUsers.length ? '' : (record?.client_id || clientId));
  const users = passedUsers.length ? passedUsers : loadedPeople;
  schema = schema || SCHEMAS[kind]?.fields || [];
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError,setSaveError]=useState('');
  const createRecord = useCreateIntent((...args) => api.post(...args), `${clientId}:${kind}`);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionForm, setDecisionForm] = useState({});
  const [relatedDrawer, setRelatedDrawer] = useState(null);
  const [tab, setTab] = useState("overview");
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [activity, setActivity] = useState([]);
  const [activityError, setActivityError] = useState('');
  const [related, setRelated] = useState({});
  const [relatedError,setRelatedError]=useState('');
  const [relatedLoading,setRelatedLoading]=useState(false);
  const [taskCompletion,setTaskCompletion]=useState(null);
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [evidenceVersion,setEvidenceVersion]=useState(0);
  const [riskHistory,setRiskHistory] = useState([]);
  const [linkTask,setLinkTask]=useState(null);
  const [closure,setClosure] = useState(null);
  const [linkedReviews, setLinkedReviews] = useState([]);
  const [linkedRisks, setLinkedRisks] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptForm, setAcceptForm] = useState({ rationale: "", expiry_date: "", approver_id: "", compensating_controls: "" });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ due_date: "", owner_id: "", recurrence: "" });
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyForm, setVerifyForm] = useState({ version: "", owner_id: "", approver_id: "", approved_at: "", last_reviewed_at: "", next_review_date: "", status: "approved" });
  const inputRef = useRef(null);
  const loadGeneration = useRef(0);
  const { user } = useAuth();
  const updateRecord = useCreateIntent((...args)=>api.patch(...args), `${user?.user_id}:${record?.client_id||clientId}:${kind}:${record?.[ID_FIELD[kind]]}:update`, true);
  const pilot=['tasks','findings','risks','policies','vendors'].includes(kind)&&isReferencePresentation(clientId,user)&&(!record||record.client_id===clientId);
  const vendorPilot=pilot&&kind==='vendors';
  const riskPilot=pilot&&kind==='risks';
  const policyPilot=pilot&&kind==='policies';
  const [approvalDirty,setApprovalDirty]=useState(false);
  const actionLayout=['tasks','findings'].includes(kind);
  const clientPresentation=useContext(ClientPresentationContext),dialogLayout=pilot||!!clientPresentation||actionLayout;
  const Root=dialogLayout?Dialog:Sheet,Content=dialogLayout?DialogContent:SheetContent;
  const initialForm=useRef({}),opener=useRef(null),heading=useRef(null);
  const [discardOpen,setDiscardOpen]=useState(false);
  const formDirty=JSON.stringify(form)!==JSON.stringify(initialForm.current);
  const dirty=(pilot||actionLayout)&&!taskCompletion&&(formDirty||!!newComment.trim()||approvalDirty);
  const close=value=>{if(value)onOpenChange(true);else if(!saving){if(dirty)setDiscardOpen(true);else onOpenChange(false);}};
  useEffect(()=>{if(!open||!dirty)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[open,dirty]);
  const isEdit = !!record;
  const idField = ID_FIELD[kind];
  const isPlatformAdmin = ["super_admin", "platform_admin"].includes(user?.role);
  const clientMayWork = user?.role === 'client_grc_manager' || user?.role === 'client_contributor' &&
    (!record && kind === 'tasks' || [record?.owner_id,record?.assignee_id,record?.business_owner_id].includes(user?.user_id) || isBrawndoReference(clientId,user)&&kind==='tasks'&&!record?.assignee_id&&!record?.owner_id&&record?.created_by===user?.user_id);
  const canWrite = (isPlatformAdmin || clientMayWork && (isEdit || kind === 'tasks')) && !(kind==="risks" && ["closed","retired"].includes(record?.status)) && !(policyPilot&&['retired','not_applicable'].includes(policyStatus(record||{})));
  const clientFields = editableFields(kind, user, record);
  const singular = kind === "tasks" ? "Action Item" : kind === "policies" ? "policy" : kind.slice(0, -1);
  const evidenceKind = kind === "tasks" ? "task" : singular;
  const tabList = vendorPilot?[...TABS_BY_KIND.vendors.map(t=>t.id==='assurance'?{...t,label:'Security Assurance Reviews'}:t),{id:'evidence',label:'Evidence'},{id:'comments',label:'Comments'}]:TABS_BY_KIND[kind];

  useEffect(() => {
    const generation = loadGeneration;
    generation.current++;
    if (open) {
      setRelatedDrawer(null);setTaskCompletion(null);setRelatedError('');
      setComments([]); setActivity([]); setRelated({}); setEvidenceItems([]);
      const base = {};
      (schema || []).forEach((f) => {
        let v = record?.[f.name] ?? f.default ?? "";
        if (f.type === "date" && typeof v === "string" && v.length > 10) v = v.slice(0, 10);
        base[f.name] = v;
      });
      // Ensure extended risk/vendor fields are always tracked, even if not in the schema list.
      if (kind === "risks") {
        ["likelihood_score","impact_score","treatment","description","impact_description","source",
         "acceptance_rationale","compensating_controls","next_review","last_reviewed","category","notes","source_type","source_id","review_cadence","custom_recurrence_days","assessment_rationale","likelihood_rationale","impact_rationale","category_other","source_other","treatment_plan"
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
        if(vendorPilot){for(const key of ['contract_notice_deadline','access_level','processing_location'])base[key]=record?.[key]||'';base.connected_system_ids=record?.connected_system_ids||[];}
        base.assurance_records = record?.assurance_records || [];base.contract_evidence_ids=record?.contract_evidence_ids||[];
        base.assurance_window_days=record?.assurance_window_days||90;base.contract_lead_days=record?.contract_lead_days||90;
        for(const key of ["assurance_required","separate_assurance_review","contract_review_enabled"])base[key]=!!record?.[key];
        ["assurance_expires_at","last_review","next_review","contract_start","contract_renewal","contract_expiration","assurance_review_date","offboarding_review_date"].forEach((k) => {
          base[k] = toDateInput(base[k]);
        });
      }
      if (kind === "tasks") Object.assign(base,{source_type:record?.source_type || (record ? taskSource(record).type : "manual"),source_id:record?.source_id || null,assignee_id:record?.assignee_id ?? record?.owner_id ?? null,status:record?.status||"open",priority:pilot&&record?record.priority??'':record?.priority||"medium"});
      if (!record && kind === "findings") Object.assign(base, {status: "open", severity: "medium",...(pilot?{source:'manual'}:{})});
      if (!record && kind === "risks") Object.assign(base, {...(riskPilot?newRiskDefaults():{}),status: "identified", review_cadence: "annual", source_type: "manual"});
      if (!record && kind === "vendors") Object.assign(base, {status: "onboarding", criticality: "medium", review_frequency: "annual"});
      if(['policies','tasks'].includes(kind))base.governance_context=record?.governance_context||null;
      if(policyPilot&&!record)Object.assign(base,{status:'draft',presence:'needs_confirmation',next_review_date:'',last_reviewed_at:''});
      base.client_id = record?.client_id || clientId;
      if(!record&&initialValues) Object.assign(base,initialValues);
      if(vendorPilot){delete base.vendorTab;delete base.assuranceId;}
      setForm(base);
      initialForm.current=base;setDiscardOpen(false);setApprovalDirty(false);if(pilot)setNewComment('');
      setTab(vendorPilot&&['assurance','contract'].includes(initialValues?.vendorTab)?initialValues.vendorTab:'overview');
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
      // Scoped per-record activity (every role that can read the record); never the admin audit log.
      const { data } = await api.get(`/${kind}/${record[idField]}/activity`);
      if(generation===loadGeneration.current) {setActivity(data.filter((a) => a.entity_id === record[idField]));setActivityError('');}
    } catch (e) { if(generation===loadGeneration.current) setActivityError(formatError(e)); }
  }
  async function loadRelated() {
    const generation=loadGeneration.current;
    setRelatedLoading(true);
    try {
      const { data } = await api.get("/related", { params: { entity_type: kind, entity_id: record[idField] } });
      if(generation===loadGeneration.current) {
        setRelated(data);setRelatedError('');
        // A nested Finding can be validated while its completed Action stays open.
        setTaskCompletion(previous=>previous?{...previous,finding:(data.findings||[]).find(f=>f.finding_id===previous.task.finding_id&&f.client_id===previous.task.client_id)||null}:previous);
      }
      return data;
    } catch (e) { if(generation===loadGeneration.current){setRelated({});setRelatedError(formatError(e));setTaskCompletion(previous=>previous?{...previous,finding:null}:previous);}return null; }
    finally {if(generation===loadGeneration.current)setRelatedLoading(false);}
  }

  async function refreshPolicyDates() {
    if(!policyPilot||!record?.policy_id)return;
    const generation=loadGeneration.current;
    try {
      const {data}=await api.get('/policies/'+record.policy_id);
      if(generation!==loadGeneration.current||data.client_id!==clientId)return;
      Object.assign(record,{last_reviewed_at:data.last_reviewed_at,next_review_date:data.next_review_date,schedule_from_reviews:data.schedule_from_reviews});
      const dates={last_reviewed_at:toDateInput(data.last_reviewed_at),next_review_date:toDateInput(data.next_review_date)};
      initialForm.current={...initialForm.current,...dates};setForm(p=>({...p,...dates}));
    }catch(e){toast.error('Policy schedule could not be refreshed: '+formatError(e));}
  }

  async function refreshVendorDates(){
    if(!vendorPilot||!record?.vendor_id)return;
    const generation=loadGeneration.current;
    try{const {data}=await api.get('/vendors/'+record.vendor_id);if(generation!==loadGeneration.current||data.client_id!==clientId)return;
      Object.assign(record,{last_review:data.last_review,next_review:data.next_review,updated_at:data.updated_at});
      const dates={last_review:toDateInput(data.last_review),next_review:toDateInput(data.next_review)};
      const nextUnchanged=form.next_review===initialForm.current.next_review;
      initialForm.current={...initialForm.current,...dates};setForm(p=>({...p,last_review:dates.last_review,...(nextUnchanged?{next_review:dates.next_review}:{})}));
    }catch(e){toast.error('Vendor schedule could not be refreshed: '+formatError(e));}
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
    setEvidenceVersion(v=>v+1);
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

  async function save(taskStatus,keepOpen=false) {
    if (!canWrite || saving) return;
    if(policyPilot&&approvalDirty){toast.error('Save or discard unfinished approval details before saving the Policy.');return;}
    if((pilot||actionLayout)&&newComment.trim()){toast.error('Post or discard the unfinished comment before saving or completing this item.');return;}
    const missing = (schema || []).find(f => f.required && !String(form[f.name] || "").trim());
    if (missing) { toast.error(`${missing.label} is required`); return; }
    setSaving(true);
    setSaveError('');
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
        savedRecord=(await updateRecord(`/${kind}/${record[idField]}`, {...clean,expected_updated_at:record.updated_at??null})).data;
        if(kind!=="tasks"||savedRecord.status!=="done"||record.status==="done")toast.success("Saved");
      } else {
        savedRecord=(await createRecord(`/${kind}`, clean)).data;
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
      if(riskPilot&&record){Object.assign(record,savedRecord);initialForm.current={...form,...savedRecord};setForm(initialForm.current);}
      onSaved?.(savedRecord);
      if(policyPilot&&!isEdit)return savedRecord;
      if(!keepOpen)onOpenChange(false);
      return savedRecord;
    } catch (e) { setSaveError(formatError(e));toast.error(formatError(e)); }
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

  async function submitDecision(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const { status: ignoredStatus, ...changes } = cleanForm();
      if (Object.keys(changes).length) {const saved=await updateRecord(`/${kind}/${record[idField]}`, {...changes,expected_updated_at:record.updated_at??null});Object.assign(record,saved.data);}
      const action = decisionForm.action || "validate";
      const { data } = await api.post(`/${kind}/${record[idField]}/${action}`, { ...decisionForm, expected_updated_at:record.updated_at??null });
      Object.assign(record, data);
      setForm(p => ({ ...p, status: record.status }));
      setDecisionOpen(false);
      toast.success(action === "validate" ? "Remediation validated and closed" : "Decision recorded");
      onSaved?.();
      loadRelated();
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  }

  async function raiseAsRisk() {
    if (record?.risk_id) { toast.info("A risk is already linked to this finding"); return; }
    if (!window.confirm(`Raise an unassessed risk from "${record.title}"? Rate its likelihood and impact in the Risk Register.`)) return;
    try {
      const { data } = await api.post(`/findings/${record[idField]}/raise-risk`);
      toast.success("Risk raised · assessment required");
      if (record) record.risk_id = data.risk?.risk_id;
      onSaved?.();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function markRiskReviewed() {
    if(!canWrite||saving)return;
    const saved=(riskPilot?dirty:formDirty)?await save(undefined,true):record;
    if(!saved)return;
    Object.assign(record,saved);
    setSaving(true);
    try {
      const {data}=await api.post(`/risks/${record.risk_id}/review`);
      setRelatedDrawer({kind:"reviews",record:data.review});
      if(!riskPilot)onSaved?.();
    } catch(e) {toast.error(formatError(e));}
    finally{setSaving(false);}
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
        if(pilot||actionLayout)initialForm.current={...initialForm.current,status:updated.status};
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
      if(updated) {Object.assign(record,updated);setForm(p=>{if(!riskPilot)return {...p,...updated};const next={...p},base={...initialForm.current};for(const key of Object.keys(p)){let value=updated[key]??'';if(['next_review','last_reviewed'].includes(key))value=toDateInput(value);if(JSON.stringify(p[key])===JSON.stringify(base[key]))next[key]=value;base[key]=value;}initialForm.current=base;return next;});}
      setRiskHistory(h.data); setRelated(relations.data); setActivity(events.data);
    } catch(e) {toast.error(formatError(e));}
  },[kind,record,clientId,riskPilot]);

  useEffect(()=>{if(open)refreshRisk();},[open,refreshRisk]);
  useEffect(()=>{
    if(!open||kind!=="risks"||!record?.risk_id||!["treatment","related","activity","history"].includes(tab)) return;
    let active=true;
    const refresh=async()=>{try{const [r,h,a]=await Promise.all([api.get("/related",{params:{entity_type:"risks",entity_id:record.risk_id}}),api.get(`/risks/${record.risk_id}/review-history`),api.get(`/risks/${record.risk_id}/activity`)]);if(active){setRelated(r.data);setRiskHistory(h.data);setActivity(a.data);}}catch(e){if(active)toast.error(formatError(e));}};
    refresh();const timer=setInterval(refresh,10000);window.addEventListener("focus",refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener("focus",refresh);};
  },[open,kind,record?.risk_id,tab]);

  async function acceptRisk() { if(riskPilot&&dirty&&!await save(undefined,true))return;setAcceptOpen(true); }

  async function submitAcceptRisk() {
    if(saving)return;
    if (!acceptForm.rationale.trim()) { toast.error("Rationale is required"); return; }
    setSaving(true);
    try {
      const body = {
        rationale: acceptForm.rationale,
        approver_id: user.user_id,
        compensating_controls: acceptForm.compensating_controls || undefined,
      };
      if (acceptForm.expiry_date) body.expiry_date = new Date(acceptForm.expiry_date).toISOString();
      const { data } = await api.post(`/risks/${record[idField]}/accept`, {...body,expected_updated_at:record.updated_at??null});
      toast.success("Risk accepted");
      if (record) Object.assign(record, data);
      setForm((p) => {const next={...p,status:"accepted",treatment:"accept",next_review:toDateInput(data.next_review),...(body.compensating_controls!==undefined?{compensating_controls:data.compensating_controls||''}:{})};if(riskPilot)initialForm.current=next;return next;});
      setAcceptOpen(false);
      onSaved?.();
    } catch (e) { toast.error(formatError(e)); }
    finally{setSaving(false);}
  }

  async function submitVerifyPolicy() {
    try {
      const body = {};
      ["version", "owner_id", "approver_id", "status"].forEach((k) => { if (verifyForm[k]) body[k] = verifyForm[k]; });
      ["approved_at", "last_reviewed_at", "next_review_date"].forEach((k) => {
        if (verifyForm[k]) body[k] = new Date(verifyForm[k]).toISOString();
      });
      const { data } = await api.post(`/policies/${record[idField]}/verify`, {...body,expected_updated_at:record.updated_at??null});
      toast.success("Policy verified");
      if (record) Object.assign(record, data);
      setForm((p) => {
        const next={...p,presence:'verified_existing',status:data.status||p.status,version:data.version||p.version,...(policyPilot?{approved_at:toDateInput(data.approved_at),last_reviewed_at:toDateInput(data.last_reviewed_at),next_review_date:toDateInput(data.next_review_date)}:{})};
        if(policyPilot)initialForm.current=next;
        return next;
      });
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
      const { data } = await api.post(`/vendors/${record[idField]}/schedule-review`, {...body,expected_updated_at:record.updated_at??null});
      if (data.vendor) Object.assign(record, data.vendor);
      toast.success(`Vendor review scheduled for ${displayDay(data.review.due_date)}`);
      setScheduleOpen(false);
      setScheduleForm({ due_date: "", owner_id: "", recurrence: "" });
      if (record) record.next_review = data.review.due_date;
      setForm((p) => ({ ...p, next_review: toDateInput(data.review.due_date) }));
      loadLinkedReviews();
      onSaved?.();
    } catch (e) { toast.error(formatError(e)); }
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
    if (!window.confirm(`Delete "${ev.filename}" from the library? It has ${ev.references?.length||1} source/supporting references. This is not an unlink. Retained history and bytes are not erased; retention rules apply.`)) return;
    try { await api.delete(`/evidence/${ev.evidence_id}`); loadEvidence(); }
    catch (e) { toast.error(formatError(e)); }
  }

  const relatedTotal = Object.values(related).reduce((a, b) => a + (b?.length || 0), 0);
  const status = form.status || record?.status;
  const liveScore = (parseInt(form.likelihood_score) || 0) * (parseInt(form.impact_score) || 0);
  const liveLevel = riskLevel(liveScore || null);

  function renderField(f) {
    if(policyPilot&&f.name==='status')return <PolicyStatusField key="status" record={{...record,...form}} disabled={!canWrite||record?.status==='in_review'||!!clientFields&&!clientFields.has('status')} onChange={value=>setForm(p=>({...p,status:value,...(p.presence==='reported_missing'&&value==='draft'?{presence:'needs_confirmation'}:{})}))}/>;
    if(riskPilot&&f.name==='category')return <RiskCategoryField key="category" form={form} setForm={setForm} disabled={!canWrite||!!clientFields&&!clientFields.has('category')}/>;
    if(riskPilot&&f.name==='owner_id')f={...f,label:'Assigned Owner'};
    if(riskPilot&&f.name==='status')f={...f,options:[{value:record?.status&&['identified','assessed','open'].includes(record.status)?record.status:'open',label:'Open'},{value:'in_progress',label:'In Treatment'},{value:'monitoring',label:'Monitoring'},{value:'accepted',label:'Accepted'},{value:'closed',label:'Closed'},...(['treated','retired','escalated'].includes(record?.status)?[{value:record.status,label:pilotRiskStatus(record.status)+' (recorded)'}]:[])]};
    if(pilot&&kind==='findings'&&f.name==='owner_id')f={...f,label:'Assigned To'};
    if(pilot&&kind==='findings'&&f.name==='severity')f={...f,options:f.options?.map(o=>o.value==='medium'?{...o,label:'Moderate'}:o)};
    if(kind==='findings'&&f.name==='status') f={...f,options:f.options?.map(o=>o.value==='remediated'?{...o,label:'Pending Validation'}:o)};
    if (!isEdit && (["findings", "risks"].includes(kind) && f.name === "status" || ["completion_date", "approved_at", "last_reviewed_at"].includes(f.name))) return null;
    if (kind === "policies" && f.name === "last_reviewed_at" && (record?.schedule_from_reviews || related.reviews?.length)) return <DateReadonly key={f.name} label={f.label} value={record?.last_reviewed_at} />;
    if (["completion_date", "approved_at", "verified_at", "verified_by"].includes(f.name)) return <DateReadonly key={f.name} label={f.label} value={record?.[f.name]} />;
    if (kind === "policies" && f.name === "next_review_date" && (record?.schedule_from_reviews || related.reviews?.length)) {
      const next = (related.reviews || []).filter(r => !["completed", "cancelled"].includes(r.status) && r.due_date).sort((a,b) => a.due_date.localeCompare(b.due_date))[0];
      return <div key={f.name}><DateReadonly label="Next review · scheduled in Reviews" value={next?.due_date || record?.next_review_date} />{!policyPilot&&<Button size="sm" variant="link" onClick={() => setTab("related")}>Open related reviews</Button>}</div>;
    }
    if (f.showIf) {
      const [k, v] = Object.entries(f.showIf)[0];
      if (form[k] !== v) return null;
    }
    // Client roles see every field but may change only what the server accepts from them.
    const locked = !!clientFields && !clientFields.has(f.name);
    return (
      <fieldset key={f.name} disabled={locked||(riskPilot||policyPilot)&&!canWrite} className={`space-y-1.5 min-w-0 ${f.type === "textarea" || ["title", "name", "policy_id"].includes(f.name) ? "record-field-wide" : ""}`}>
        <Label className="text-xs text-ink-secondary">{f.label}{f.required && <span className="text-semantic-critical ml-0.5">*</span>}</Label>
        {f.type === "textarea" ? (
          <Textarea value={form[f.name] || ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} aria-label={f.label} data-testid={`field-${f.name}`} className="text-sm" />
        ) : f.type === "select" ? (
          <Select value={form[f.name] || ""} onValueChange={(v) => setForm({ ...form, [f.name]: v })}>
            <SelectTrigger aria-label={f.label} data-testid={`field-${f.name}`} className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {kind === "risks" && f.name === "category" && form.category && !f.options?.some(o => o.value === form.category) && <SelectItem value={form.category}>{form.category} (recorded)</SelectItem>}
              {(f.options || []).map((o) => <SelectItem key={o.value} value={o.value} disabled={o.value !== record?.[f.name] && (f.name === "status" && ({policies:['approved'],findings:['closed','accepted','remediated'],risks:['accepted','closed','retired'],exceptions:['approved']}[kind] || []).includes(o.value) || f.name === "presence" && o.value === "verified_existing" && record?.presence !== o.value)}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : f.type === "user" && !["linked_user_id", "approver_id"].includes(f.name) ? (
          <AssigneeSelect clientId={record?.client_id || clientId} label={f.label} value={form[f.name]} onChange={v=>setForm({...form,[f.name]:v})} users={users} testId={`field-${f.name}`} required={f.required} showManagePeople={!actionLayout}/>
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
        {f.type === 'user' && f.name === 'approver_id' && <AssignmentHelp policy={kind === 'policies'} />}
      </fieldset>
    );
  }
  function renderFieldsByNames(names) {
    const map = {}; (schema || []).forEach((f) => { map[f.name] = f; });
    return names.map((n) => map[n] ? renderField(map[n]) : null);
  }


  async function openRiskActionPicker() {
    const generation=loadGeneration.current;
    try {
      const {data}=await api.get("/tasks",{params:{client_id:clientId}});
      if(generation===loadGeneration.current) setLinkTask({options:data.filter(t=>t.client_id===clientId&&!(related.tasks||[]).some(x=>x.task_id===t.task_id)),task_id:""});
    } catch(e) { toast.error(formatError(e)); }
  }

  async function openRiskOccurrence(occurrence) {
    const generation=loadGeneration.current;
    try {
      const {data}=await api.get("/reviews",{params:{client_id:clientId}});
      if(generation!==loadGeneration.current)return;
      const review=data.find(r=>r.review_id===occurrence.review_id&&r.client_id===clientId);
      if(!review)throw new Error('The original Risk Review is unavailable for this client.');
      setRelatedDrawer({kind:"reviews",record:review,initialValues:{occurrence}});
    } catch(e) { toast.error(formatError(e)); }
  }

  // -------- Vendor tab renderers --------

  function vendorPanel(section) {
    const Panel=vendorPilot?BrawndoVendorDetails:VendorGovernancePanel;
    return <Panel tab={section} record={record} form={form} setForm={setForm} canWrite={canWrite} isAdmin={isPlatformAdmin} users={users} reviews={linkedReviews} tasks={related.tasks||[]} risks={linkedRisks} evidence={evidenceItems} focusAssurance={initialValues?.assuranceId} openRecord={value=>{if(vendorPilot&&value.initialValues?.assurance_id&&formDirty){toast.error('Save assurance changes before creating an Action Item for this document.');return;}setRelatedDrawer(value);}} uploadFiles={uploadFiles} downloadEv={downloadEv} onSaved={()=>{loadLinkedReviews();loadLinkedRisks();loadRelated();onSaved?.();}}/>;
  }

  // -------- Overview renderers per kind --------
  function renderOverview() {
    if(kind==='tasks'&&taskCompletion)return <section className="space-y-3 text-sm" data-testid="action-completion-handoff">
      <div role="status"><h3 className="font-medium">Action Item completed</h3><p className="mt-1">{taskCompletion.task.title}</p><p className="mt-2 text-ink-secondary">{completionHandoff(taskCompletion.finding)}</p><p className="mt-2 text-ink-secondary">This Action Item is now in Completed, with its history preserved.</p></div>
      {taskCompletion.finding&&<Button size="sm" variant="outline" onClick={()=>openLinkedRecord({kind:'findings',record:taskCompletion.finding})}>View Finding</Button>}
    </section>;
    if (kind === "tasks") return <ActionItemFields pilot={pilot} form={form} setForm={setForm} record={record} clientId={clientId} canWrite={canWrite} canEditContext={!clientFields||clientFields.has('governance_context')} saving={saving} onTransition={save} sourceLocked={!!initialValues?.source_id} related={related} onOpen={openLinkedRecord}/>;
    if (kind === "risks") {
      return (
        <div className="space-y-4">
          {!riskPilot&&renderRiskActionsPanel()}
          {!liveLevel && <p className="text-sm text-ink-secondary">Needs assessment. Select numeric likelihood and impact in Assessment.{record?.likelihood || record?.impact ? ` Legacy ratings: likelihood ${record.likelihood || 'unknown'}, impact ${record.impact || 'unknown'}.` : ''}</p>}
          {record?.acceptance_expires_at && <DateReadonly label="Acceptance expiry · unchanged by routine reviews" value={record.acceptance_expires_at} />}
          {!riskPilot&&<div className="text-xs font-mono">{record?.display_id || "ID assigned on creation"}</div>}
          {renderFieldsByNames(["title", "category", "status", "owner_id", "description"])}
          <div className="grid grid-cols-2 gap-3"><DateReadonly label="Created" value={record?.created_at}/><DateReadonly label="Last Reviewed" value={record?.last_reviewed}/></div>
          {riskPilot&&record?.framework_assessment_id&&(()=>{const assessment=related.framework_assessments?.find(r=>r.framework_assessment_id===record.framework_assessment_id);return assessment?<button className="text-link underline text-sm" onClick={()=>setRelatedDrawer({kind:'framework_assessments',record:assessment})}>Framework / Control Assessment · {assessment.framework_key} {assessment.definition_id}</button>:<p className="text-sm">Original framework assessment unavailable or inaccessible.</p>;})()}
          <RiskSourceFields pilot={riskPilot} onOpen={setRelatedDrawer} form={form} setForm={setForm} clientId={clientId} disabled={!canWrite||riskPilot&&!!clientFields&&!clientFields.has("source_type")}/>
          <RiskScheduleFields pilot={riskPilot} form={form} setForm={setForm} disabled={!canWrite||!isPlatformAdmin}/>
          {record?.closed_at&&<div className="text-sm">Closed: {record.closure_reason?.replaceAll("_"," ")} · {personLabel(users, record.closed_by, 'Not recorded')}<DateReadonly label="Closed on" value={record.closed_at}/>{record.closure_note}</div>}
        </div>
      );
    }
    if (kind === "vendors") return vendorPanel("overview");
    // Default: use full schema
    return (
      <div className="space-y-4">
        {kind === "findings" && renderFindingActionsPanel()}
        {kind === 'findings' && isEdit && <section className="space-y-2 text-sm" aria-label="Corrective actions"><h3 className="font-medium">Corrective Actions</h3><p className="text-ink-secondary">Work completion is followed by separate Finding validation.</p>{relatedError?<p role="alert">Corrective actions could not be loaded: {relatedError}</p>:relatedLoading?<p>Loading corrective actions…</p>:<CorrectiveActions assignmentLabel={pilot?'Assigned To':'Owner'} actions={(related.tasks||[]).filter(t=>t.finding_id===record.finding_id&&t.client_id===record.client_id)} members={users} onOpen={task=>openLinkedRecord({kind:'tasks',record:task})}/>}</section>}
        {policyPilot&&<BrawndoPolicyDetails record={record||form} related={related} users={users} onOpen={openLinkedRecord}/>}
        {['policies','findings'].includes(kind)&&record&&!policyPilot&&<RequirementBasis kind={kind} record={record} related={related} onOpen={openLinkedRecord} loading={relatedLoading} error={relatedError} users={users}/>}
        {kind === "policies" && !policyPilot && <><GovernanceContextFields value={form.governance_context} cadence disabled={!canWrite} onChange={governance_context=>setForm(p=>({...p,governance_context}))}/>{renderPolicyPanel()}</>}
        {kind === "exceptions" && isEdit && isPlatformAdmin && record.status !== "approved" && <Button onClick={() => { setDecisionForm({action:'approve',rationale:''}); setDecisionOpen(true); }}>Approve exception</Button>}
        {!policyPilot&&!!record?.decision_history?.length && <div className="rounded-md border border-line p-3 text-sm space-y-2">{record.decision_history.map((d,i) => <p key={i}>{d.action?.replaceAll('_',' ')} · {personLabel(users, d.by || d.recorded_by, 'Not recorded')} · {(d.at || d.recorded_at)?.slice(0,10)}{d.rationale ? `: ${d.rationale}` : ''}{d.provenance ? ` · ${d.provenance}` : ''}</p>)}</div>}
        {policyPilot&&approvalDirty&&<p className="text-xs text-ink-secondary">Save the unfinished approval details before editing Policy fields.</p>}
        <fieldset disabled={policyPilot&&(record?.status==='in_review'||approvalDirty)} className="record-fields">{(schema || []).filter(f=>!policyPilot||['title','category','status','version','owner_id',...(isEdit?['approved_at','last_reviewed_at','next_review_date']:[])].includes(f.name)).map((f) => renderField(f))}</fieldset>
        {policyPilot&&(!isEdit?<p className="text-sm text-ink-secondary">Create the Policy to upload or link its document in Evidence. No review or approval date will be manufactured.</p>:<>{renderPolicyPanel()}<details className="text-sm border-t border-line pt-3"><summary className="cursor-pointer font-medium">Linked records{relatedTotal?` (${relatedTotal})`:''}</summary><div className="pt-3">{relatedError?<p role="alert">{relatedError}</p>:renderRelated()}</div></details>{[record.onboarding_note,record.applicability_rationale,record.governance_context?.cadence_rationale].some(Boolean)&&<details className="text-sm"><summary className="cursor-pointer">Retained policy context</summary>{[record.onboarding_note,record.applicability_rationale,record.governance_context?.cadence_rationale].filter(Boolean).map((text,i)=><p className="mt-2 whitespace-pre-wrap" key={i}>{text}</p>)}</details>}</>)}
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
    return <PolicyWorkflowPanel record={record} form={form} policyPilot={policyPilot} isPlatformAdmin={isPlatformAdmin} canWrite={canWrite} formDirty={formDirty} approvalDirty={approvalDirty} onDraftChange={setApprovalDirty}
      onVerify={() => { setVerifyForm({ version: record?.version || "", owner_id: record?.owner_id || "", approver_id: record?.approver_id || "", approved_at: toDateInput(record?.approved_at), last_reviewed_at: toDateInput(record?.last_reviewed_at), next_review_date: toDateInput(record?.next_review_date), status: ["approved", "in_review", "draft"].includes(record?.status) ? record.status : "draft" }); setVerifyOpen(true); }}
      onChanged={data=>{Object.assign(record,data);setForm(p=>{const next={...p,status:data.status,version:data.version,approved_at:toDateInput(data.approved_at)};if(policyPilot)initialForm.current=next;return next;});onSaved?.();loadActivity();}}/>;
  }

  // -------- Shared tab renderers --------
  function renderRelated() {
    return (
      <div className="space-y-5">
        {relatedTotal === 0 && <div className="text-sm text-ink-muted">No related records yet.</div>}
        {Object.entries(related).filter(([k])=>kind!=='risks'||k!=='evidence').map(([k, list]) => (
          (list && list.length > 0) ? (
            <div key={k}>
              <>{k==='framework_assessments'?<h4 className="text-xs font-semibold text-ink-secondary">Framework Requirements</h4>:pilot?<h4 className="text-xs font-semibold text-ink-secondary">{k==='tasks'?'Action Items':k==='ai_systems'?'AI Governance':k}</h4>:<Link to={k==='ai_systems'?'/ai-governance':k==="tasks"?"/action-items":k==="assessments"?"/onboarding":`/${k}`} className="text-xs font-mono uppercase tracking-widest text-ink-muted hover:text-ink-primary flex items-center gap-1">{k==='ai_systems'?'AI Governance':k} <ArrowUpRight className="h-3 w-3" /></Link>}</>
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
  async function openEvidenceSource(ref) {
    const generation=loadGeneration.current;
    try {const target=await resolveEvidenceSource(ref,record.client_id);if(generation===loadGeneration.current)setRelatedDrawer(target);}
    catch(e){toast.error(formatError(e));}
  }
  function renderEvidence() {
    return <div className="space-y-4">
      {kind==='tasks'&&!pilot&&<ActionSourceChain record={record} related={related} onOpen={openLinkedRecord}/>}
        {canWrite && (
          <div
            data-testid="drawer-evidence-dropzone"
            role="button" tabIndex={0} aria-label="Upload evidence files"
            onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();inputRef.current?.click();}}}
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

      <EvidencePanel clientId={record.client_id} kind={kind} id={record[idField]} onOpen={openEvidenceSource} refreshKey={evidenceVersion}
        validatedAt={kind==='findings'?(record.validated_at||record.closed_at):null}
        onDelete={isPlatformAdmin&&!(kind==='tasks'&&record.status==='done')?deleteEv:undefined}/>
    </div>;
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
        {activityError && <div role="alert" className="text-sm">Activity could not be loaded. {activityError}</div>}
        {!activityError && activity.length === 0 && <div className="text-sm text-ink-muted">No activity yet.</div>}
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
    if (tab === "overview") return <>{record && !pilot && <div className="mb-4"><RecordSummary kind={kind} record={taskCompletion?.task || record} clientId={clientId} related={related} users={users} /></div>}{pilot&&kind==='findings'&&record&&<p className="mb-4 text-sm">Finding status: <StatusBadge value={record.status}/></p>}{riskPilot&&record&&<RiskSummary risk={form} users={users}/>} {renderOverview()}</>;
    if (tab === "activity") return renderActivity();
    // Kind-specific
    if (kind === "risks") {
      if (tab === "assessment") return <RiskAssessmentPanel form={form} setForm={setForm} riskPilot={riskPilot} canWrite={canWrite} isPlatformAdmin={isPlatformAdmin}/>;
      if (tab === "treatment") return <RiskTreatmentPanel form={form} setForm={setForm} record={record} users={users} tasks={related.tasks} riskPilot={riskPilot} canWrite={canWrite} isPlatformAdmin={isPlatformAdmin} clientFields={clientFields} onOpen={setRelatedDrawer} onLinkAction={openRiskActionPicker}/>;
      if (tab === "history") return <RiskHistoryPanel record={record} users={users} riskHistory={riskHistory} onOpenOccurrence={openRiskOccurrence}/>;
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
        {DEFAULT_TABS.filter(t=>!policyPilot||t!=='related').map((t) => (
          <button key={t} onClick={() => {if(policyPilot&&approvalDirty&&t!==tab){toast.error('Save unfinished approval details before changing tabs.');return;}setTab(t);}} className={`drawer-tab whitespace-nowrap ${tab === t ? "active" : ""}`} data-testid={`tab-${t}`}>
            {t === "related" ? `Related${relatedTotal ? ` (${relatedTotal})` : ""}` :
             t === "evidence" ? 'Evidence' :
             t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
    );
  }

  const tabIsFormEditable = (
    tab === "overview" || policyPilot ||
    (kind === "risks" && ["assessment", "treatment"].includes(tab)) ||
    (kind === "vendors" && ["data_access", "assurance", "reviews_tab", "contract"].includes(tab))
  );

  return (
    <Root open={open} onOpenChange={pilot||actionLayout?close:onOpenChange}>
      <Content aria-modal={clientPresentation?'true':undefined} {...(dialogLayout?{onPointerDownOutside:e=>e.preventDefault(),onOpenAutoFocus:e=>{opener.current=document.activeElement;e.preventDefault();heading.current?.focus();},onCloseAutoFocus:e=>{e.preventDefault();const target=opener.current?.isConnected&&(!clientPresentation||opener.current!==document.body)?opener.current:document.querySelector(vendorPilot||clientPresentation&&kind==='vendors'?'[data-testid="vendor-search"]':policyPilot||clientPresentation&&kind==='policies'?'[data-testid="policies-search"]':riskPilot||clientPresentation&&kind==='risks'?'[data-testid="risk-search"]':'[data-testid="ai-search"]');target?.focus({preventScroll:true});}}:{side:'right',description:isEdit ? `Review this ${singular.toLowerCase()}, its supporting evidence, related work and activity. Changes require the relevant save or workflow action.` : `Create a ${singular.toLowerCase()} for the selected client. Complete the required fields, then choose Create.`})} className={dialogLayout?('brawndo-cis-assessment bg-surface-card'+(actionLayout?' action-record-dialog':'')):'record-drawer w-full sm:max-w-2xl p-0 flex flex-col'} data-testid={`${kind}-drawer`}>
        {dialogLayout&&<DialogDescription className="sr-only">{!pilot?`Review this ${singular.toLowerCase()}, its supporting evidence, related work and activity. Changes require the relevant save or workflow action.`:vendorPilot?'Manage the vendor relationship, assurance documents and independent review and contract schedules.':policyPilot?'Manage this Policy, its document versions, framework alignment, review schedule and recorded approvals.':riskPilot?"Assess the risk, document treatment and review history, and record authorized acceptance or closure separately.":"Document assigned work and its original source, retain evidence, and complete work separately from Finding validation."}</DialogDescription>}
        <SheetHeader className={dialogLayout?'px-6 py-4 pr-12 border-b border-line shrink-0':'px-6 py-4 border-b border-line'}>
          <div className="flex items-start justify-between">
            <div>
              {!pilot&&<div className="text-xs font-mono uppercase tracking-widest text-ink-help">{singular}</div>}
              <SheetTitle ref={heading} tabIndex={dialogLayout?-1:undefined} className="font-heading text-xl">{isEdit ? (kind === 'contacts' ? record.name : record.title || record.name) : `New ${singular}`}</SheetTitle>
              {!pilot&&isEdit && status && <div className="mt-2">{kind === "tasks" ? <span className="pill pill-neutral">{actionStatus(status)}</span> : <StatusBadge value={status} />}</div>}
            </div>
            {!dialogLayout&&<button aria-label="Close record" onClick={() => onOpenChange(false)} className="p-1 rounded hover:bg-surface-subtle" data-testid="drawer-close"><X className="h-4 w-4" /></button>}
          </div>
          {renderTabList()}
        </SheetHeader>

        <div className={dialogLayout?'flex-1 min-h-0 overflow-y-auto px-6 py-5':'flex-1 overflow-y-auto px-6 py-5'}>
          {renderTabContent()}
        </div>

        <div className={`px-6 py-3 border-t border-line bg-surface-subtle flex justify-end gap-2${dialogLayout?' flex-wrap shrink-0':''}`}>
          {saveError&&<p role="alert" className="text-sm">{saveError}{updateRecord.unconfirmed()?' Save is unconfirmed; retry the original save before making another edit.':''}</p>}
          {isEdit&&updateRecord.unconfirmed()&&<Button size="sm" disabled={saving||!canWrite} onClick={async()=>{setSaving(true);setSaveError('');try{const {data}=await updateRecord.retry();Object.assign(record,data);onSaved?.(data);toast.success('Saved');onOpenChange(false);}catch(e){setSaveError(formatError(e));toast.error(formatError(e));}finally{setSaving(false);}}}>Retry unconfirmed save</Button>}
          <Button variant="outline" size="sm" onClick={() => (pilot||actionLayout)?close(false):onOpenChange(false)} data-testid="drawer-cancel">{taskCompletion?'Close':'Cancel'}</Button>
          {(tabIsFormEditable||pilot&&['tasks','risks'].includes(kind)) && !taskCompletion && (
            <Button size="sm" onClick={save} disabled={saving || !canWrite || kind==="vendors"&&record?.status==="inactive"} data-testid="drawer-save">{saving ? "Saving…" : isEdit ? "Save changes" : vendorPilot?'Add to Register':"Create"}</Button>
          )}
          {riskPilot&&isEdit&&canWrite&&!['closed','retired'].includes(record.status)&&<><Button size="sm" variant="outline" disabled={saving} onClick={markRiskReviewed}>Review Risk</Button>{isPlatformAdmin&&<><Button size="sm" variant="outline" disabled={saving} onClick={acceptRisk}>{record.status==='accepted'?'Renew Acceptance':'Accept Risk'}</Button><Button size="sm" variant="outline" disabled={saving} onClick={async()=>{if(dirty&&!await save(undefined,true))return;setClosure({reason:'remediated',note:''});}}>Close Risk</Button></>}</>}
          {pilot&&kind==='tasks'&&isEdit&&canWrite&&!taskCompletion&&!['done','cancelled'].includes(record.status)&&<Button size="sm" disabled={saving} onClick={()=>save('done')} data-testid="complete-action">Complete Action Item</Button>}
        </div>
      </Content>
      {(pilot||actionLayout)&&<AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}><AlertDialogContent><AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle><AlertDialogDescription>Your saved records remain unchanged. Keep editing to retain this draft.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={()=>{setDiscardOpen(false);onOpenChange(false);}}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}

      {relatedDrawer && <RecordDrawer open={true} onOpenChange={v => { if (!v) { setRelatedDrawer(null); loadRelated(); setEvidenceVersion(v=>v+1); } }} reviewsPilot={riskPilot||policyPilot||vendorPilot} kind={relatedDrawer.kind} record={relatedDrawer.record} initialValues={relatedDrawer.initialValues} schema={SCHEMAS[relatedDrawer.kind]?.fields} clientId={clientId} users={users} onSaved={() => { loadRelated(); setEvidenceVersion(v=>v+1); refreshFindingReadiness(); refreshRisk(); if(policyPilot&&relatedDrawer.kind==='reviews')refreshPolicyDates();if(kind==="vendors"){loadLinkedReviews();loadLinkedRisks();if(relatedDrawer.kind==='reviews')refreshVendorDates();} onSaved?.(); }} />}

      <Sheet open={decisionOpen} onOpenChange={setDecisionOpen}>
        <SheetContent description="Record the outcome and supporting rationale for this governance decision. Confirming records your authenticated decision in its history." className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader><SheetTitle>{decisionForm.action === 'accept' ? 'Accept finding' : decisionForm.action === 'approve' ? 'Approve exception' : "Validate remediation"}</SheetTitle></SheetHeader>
          <form onSubmit={submitDecision} className="mt-5 space-y-4">
            {kind==='findings'&&record&&!decisionForm.action&&<section className="space-y-3 text-sm" aria-label="Validation context"><h3 className="font-medium">{form.title||record.title}</h3><p className="whitespace-pre-wrap">{form.description||record.description||'No description recorded.'}</p><p className="text-ink-secondary">Current Finding Status: <StatusBadge value={status}/></p><p>Confirm that the corrective work resolved the Finding. Completing an Action alone does not validate it.</p><CorrectiveActions assignmentLabel={pilot?'Assigned To':'Owner'} actions={(related.tasks||[]).filter(t=>t.finding_id===record.finding_id&&t.client_id===record.client_id)} members={users}/></section>}
            {kind==='findings'&&record&&!decisionForm.action&&<EvidencePanel clientId={record.client_id} kind="findings" id={record.finding_id} onOpen={openEvidenceSource} refreshKey={evidenceVersion}/>}
            <Label className="block">{decisionForm.action ? "Decision rationale" : "What confirms the remediation worked?"}<Textarea required value={decisionForm.rationale || ""} onChange={e => setDecisionForm(p => ({ ...p, rationale: e.target.value }))} /></Label>
            <Button type="submit" disabled={saving}>{saving ? "Recording…" : "Record decision"}</Button>
          </form>
        </SheetContent>
      </Sheet>

{linkTask&&<Sheet open onOpenChange={v=>!v&&setLinkTask(null)}><SheetContent description="Link an existing Action Item to this risk without changing the Action's original source."><SheetHeader><SheetTitle>Link Action Item</SheetTitle></SheetHeader><div className="space-y-4 mt-6"><p className="text-sm">The original source and Action Item remain unchanged.</p><Select value={linkTask.task_id||"__none__"} onValueChange={task_id=>setLinkTask({...linkTask,task_id})}><SelectTrigger aria-label="Existing Action Item"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__" disabled>Select a record</SelectItem>{linkTask.options.map(t=><SelectItem key={t.task_id} value={t.task_id}>{t.title}</SelectItem>)}</SelectContent></Select><Button disabled={!linkTask.task_id||saving} onClick={async()=>{setSaving(true);try{await api.post(`/risks/${record.risk_id}/link-action-item`,{task_id:linkTask.task_id});setLinkTask(null);loadRelated();onSaved?.();}catch(e){toast.error(formatError(e));}finally{setSaving(false);}}}>Link Action Item</Button></div></SheetContent></Sheet>}
      {closure&&<Sheet open onOpenChange={value=>!value&&setClosure(null)}><SheetContent description="Record why this risk can be closed. Its history remains available; future linked Reviews will be cancelled." className="sm:max-w-md"><SheetHeader><SheetTitle>Close Risk</SheetTitle></SheetHeader><div className="space-y-4 mt-6"><Label>Closure reason</Label><Select value={closure.reason} onValueChange={reason=>setClosure({...closure,reason})}><SelectTrigger aria-label="Closure reason"><SelectValue/></SelectTrigger><SelectContent>{Object.entries({remediated:"Remediated",no_longer_applicable:"No Longer Applicable",system_process_retired:"System / Process Retired",condition_removed:"Risk Condition Removed",other:"Other"}).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Label>Closure note</Label><Textarea aria-label="Closure note" value={closure.note} onChange={e=>setClosure({...closure,note:e.target.value})}/><p className="text-sm text-ink-secondary">The Risk and its history remain available. Future linked Reviews will be cancelled.</p><Button disabled={saving} onClick={async()=>{setSaving(true);try {await api.post(`/risks/${record.risk_id}/close`,{...closure,expected_updated_at:record.updated_at??null});setClosure(null);await refreshRisk();onSaved?.();toast.success("Risk closed and retained");}catch(e){toast.error(formatError(e));}finally{setSaving(false);}}}>Confirm closure</Button></div></SheetContent></Sheet>}
      {/* Accept Risk dialog */}
      {kind === "risks" && (
        <Sheet open={acceptOpen} onOpenChange={setAcceptOpen}>
          <SheetContent side="right" description="Record why management accepts this risk, its acceptance expiry and any compensating controls." className="w-full sm:max-w-md p-0" data-testid="accept-risk-dialog">
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
                <div className="text-xs text-ink-help mt-1">{riskPilot?"Acceptance does not lower severity. The next review is brought forward if this expiry is earlier.":"The risk will reappear in \"Due for Review\" as this date approaches."}</div>
              </div>
              <div>
                <Label className="text-xs text-ink-secondary">Compensating controls (optional)</Label>
                <Textarea data-testid="accept-controls" value={acceptForm.compensating_controls} onChange={(e) => setAcceptForm({ ...acceptForm, compensating_controls: e.target.value })} rows={2} className="text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setAcceptOpen(false)}>Cancel</Button>
                <Button size="sm" disabled={saving} onClick={submitAcceptRisk} data-testid="accept-submit" className="bg-primary hover:bg-primary/90">Accept risk</Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Verify Policy dialog */}
      {kind === "policies" && (
        <Sheet open={verifyOpen} onOpenChange={setVerifyOpen}>
          <SheetContent side="right" description="Verify the reported policy and record its confirmed metadata. Blank fields retain their existing values." className="w-full sm:max-w-md p-0" data-testid="verify-policy-dialog">
            <SheetHeader className="px-6 py-4 border-b border-line">
              <SheetTitle>Verify policy</SheetTitle>
            </SheetHeader>
            <div className="p-6 space-y-4">
              <div className="text-xs text-ink-secondary">
                {policyPilot?'Confirm an existing document and its recorded status. Approved requires a saved document/version basis; this records an external approval, not a new in-app approval. Blank historical dates stay blank.':<>Moves this policy from <strong>Reported Existing</strong> to <strong>Verified Existing</strong> and records the verified metadata below. Blank fields will be left unchanged.</>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-ink-secondary">Version</Label>
                  <Input value={verifyForm.version} onChange={(e) => setVerifyForm({ ...verifyForm, version: e.target.value })} placeholder="2.3" className="text-sm" data-testid="verify-version" />
                </div>
                <div>
                  <Label htmlFor={policyPilot?'verify-policy-status':undefined} className="text-xs text-ink-secondary">{policyPilot?'Policy Status':'Lifecycle status'}</Label>
                  <Select value={verifyForm.status} onValueChange={(v) => setVerifyForm({ ...verifyForm, status: v,...(policyPilot&&v==='approved'&&!record.schedule_from_reviews&&!related.reviews?.length&&!verifyForm.next_review_date?{next_review_date:nextPolicyReview(verifyForm.last_reviewed_at||new Date().toISOString().slice(0,10))}:{}) })}>
                    <SelectTrigger id={policyPilot?'verify-policy-status':undefined} data-testid="verify-status" className="text-sm"><SelectValue /></SelectTrigger>
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
                  <AssigneeSelect clientId={record?.client_id || clientId} label="Policy owner" value={verifyForm.owner_id} onChange={v=>setVerifyForm({...verifyForm,owner_id:v})} users={users} testId="verify-owner" emptyLabel="Leave unchanged"/>
                </div>
                <div>
                  <Label className="text-xs text-ink-secondary">{policyPilot?'Reported approver':'Approver'}</Label>
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
                  <Input disabled={policyPilot&&(record?.schedule_from_reviews||!!related.reviews?.length)} type="date" value={verifyForm.last_reviewed_at} onChange={(e) => setVerifyForm({ ...verifyForm, last_reviewed_at: e.target.value,...(policyPilot&&verifyForm.status==='approved'&&!record?.next_review_date?{next_review_date:nextPolicyReview(e.target.value||new Date().toISOString().slice(0,10))}:{}) })} className="text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-ink-secondary">Next review</Label>
                  <Input disabled={policyPilot&&(record?.schedule_from_reviews||!!related.reviews?.length)} type="date" value={verifyForm.next_review_date} onChange={(e) => setVerifyForm({ ...verifyForm, next_review_date: e.target.value })} className="text-sm" data-testid="verify-next-review" />
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
          <SheetContent side="right" description="Create a vendor Review with an accountable owner, due date and recurrence." className="w-full sm:max-w-md p-0" data-testid="schedule-review-dialog">
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
    </Root>
  );
}
