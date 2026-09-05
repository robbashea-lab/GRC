import { useEffect, useMemo, useState } from "react";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import api, { formatError } from "@/lib/api";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2, ChevronRight, ChevronLeft, Building2, ChevronDown, HelpCircle,
  Plus, Trash2, Sparkles, Users2, ClipboardList, FileSearch, CalendarClock, ShieldCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const STEPS = [
  { key: "policies", label: "Policies & Governance Documents", icon: ShieldCheck },
  { key: "requirements", label: "Compliance & Requirements", icon: ClipboardList },
  { key: "contacts", label: "Key Roles & Contacts", icon: Users2 },
  { key: "assessments", label: "Existing Assessments / Known Issues", icon: FileSearch },
  { key: "reviews", label: "Recurring Reviews", icon: CalendarClock },
  { key: "summary", label: "Review & Create", icon: Sparkles },
];

const POLICY_RESPONSES = [
  { value: "yes", label: "Yes" }, { value: "no", label: "No" },
  { value: "unsure", label: "Unsure" }, { value: "na", label: "N/A" },
];
const POLICY_TONE = {
  yes: "bg-emerald-100 text-emerald-800 border-emerald-300",
  no: "bg-red-100 text-red-800 border-red-300",
  unsure: "bg-amber-100 text-amber-800 border-amber-300",
  na: "bg-slate-100 text-slate-700 border-slate-300",
};
const POLICY_PRESENCE_TO_RESPONSE = {
  reported_existing: "yes", verified_existing: "yes",
  reported_missing: "no", needs_confirmation: "unsure", not_applicable: "na",
};

const REQ_RESPONSES = [
  { value: "applicable", label: "Applicable" },
  { value: "potentially_applicable", label: "Potentially" },
  { value: "needs_review", label: "Needs Review" },
  { value: "not_applicable", label: "N/A" },
];
const REQ_TONE = {
  applicable: "bg-emerald-100 text-emerald-800 border-emerald-300",
  potentially_applicable: "bg-amber-100 text-amber-800 border-amber-300",
  needs_review: "bg-sky-100 text-sky-800 border-sky-300",
  not_applicable: "bg-slate-100 text-slate-700 border-slate-300",
};

const KNOWN_ISSUE_CLASSIFICATIONS = [
  { value: "reported", label: "Reported Known Issue" },
  { value: "verified_finding", label: "Existing Verified Finding" },
  { value: "needs_review", label: "Needs Review" },
];

const slug = (s) => (s || "").replace(/[^a-z0-9]/gi, "-").toLowerCase();

export default function Onboarding() {
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [policyLib, setPolicyLib] = useState(null);
  const [reqLib, setReqLib] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [users, setUsers] = useState([]);
  const [state, setState] = useState({ contacts: [], assessments: [], onboarding_history: [] });

  const [policyResp, setPolicyResp] = useState({});
  const [reqResp, setReqResp] = useState({});
  const [contacts, setContacts] = useState({});   // { role -> {...} }
  const [assessments, setAssessments] = useState([]);
  const [knownIssues, setKnownIssues] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [openPolicyCats, setOpenPolicyCats] = useState({});
  const [openReqCats, setOpenReqCats] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const canRun = ["super_admin", "platform_admin", "client_contributor"].includes(user?.role);
  const isInternal = ["super_admin", "platform_admin"].includes(user?.role);

  useEffect(() => {
    if (!currentClientId) return;
    (async () => {
      try {
        const [{ data: pl }, { data: rl }, { data: tpl }, { data: st }, { data: usersData }] = await Promise.all([
          api.get("/onboarding/policy-library", { params: { client_id: currentClientId } }),
          api.get("/onboarding/requirements-library", { params: { client_id: currentClientId } }),
          api.get("/baseline/templates"),
          api.get("/onboarding/state", { params: { client_id: currentClientId } }),
          api.get("/users").catch(() => ({ data: [] })),
        ]);
        setPolicyLib(pl); setReqLib(rl); setTemplates(tpl); setState(st); setUsers(usersData || []);
        // Preload policy responses.
        const p = {};
        (pl.categories || []).forEach((c) => c.items.forEach((it) => {
          p[it.name] = {
            response: it.current_presence ? POLICY_PRESENCE_TO_RESPONSE[it.current_presence] : "",
            note: it.last_onboarding_note || "",
            applicability_rationale: it.applicability_rationale || "",
            category: it.category,
          };
        }));
        setPolicyResp(p);
        setOpenPolicyCats(Object.fromEntries((pl.categories || []).map((c) => [c.name, true])));
        // Preload requirement responses.
        const q = {};
        (rl.categories || []).forEach((c) => c.items.forEach((it) => {
          q[it.name] = {
            applicability: it.current_applicability || "",
            note: it.current_note || "",
            rationale: it.current_rationale || "",
            category: it.category,
          };
        }));
        setReqResp(q);
        setOpenReqCats(Object.fromEntries((rl.categories || []).map((c) => [c.name, true])));
        // Preload contacts by role.
        const cmap = {};
        (st.contacts || []).forEach((c) => { cmap[c.role] = c; });
        // Ensure every role template has an entry.
        (rl.role_templates || []).forEach((t) => {
          if (!cmap[t.role]) cmap[t.role] = { role: t.role };
        });
        setContacts(cmap);
        // Preload assessments (edit-in-place).
        setAssessments((st.assessments || []).map((a) => ({ ...a })));
        // Preselect first 3 reviews (Annual Risk Assessment first).
        setReviews((tpl.review_templates || []).slice(0, 3));
      } catch (e) { toast.error(formatError(e)); }
    })();
  }, [currentClientId]);

  // ------------- Handlers -------------
  const setPR = (name, patch) => setPolicyResp((p) => ({ ...p, [name]: { ...(p[name] || {}), ...patch } }));
  const setQR = (name, patch) => setReqResp((p) => ({ ...p, [name]: { ...(p[name] || {}), ...patch } }));
  const setCT = (role, patch) => setContacts((c) => ({ ...c, [role]: { ...(c[role] || { role }), ...patch } }));

  const addAssessment = () => setAssessments((a) => [...a, { name: "", assessment_type: "", date: "", status: "reported", document_available: false, open_findings: "unknown", notes: "" }]);
  const removeAssessment = (i) => setAssessments((a) => a.filter((_, idx) => idx !== i));
  const setAssessment = (i, patch) => setAssessments((a) => a.map((x, idx) => idx === i ? { ...x, ...patch } : x));

  const addIssue = () => setKnownIssues((a) => [...a, { title: "", classification: "reported", priority: "medium", notes: "" }]);
  const removeIssue = (i) => setKnownIssues((a) => a.filter((_, idx) => idx !== i));
  const setIssue = (i, patch) => setKnownIssues((a) => a.map((x, idx) => idx === i ? { ...x, ...patch } : x));

  const toggleReview = (rv) => {
    const has = reviews.find((r) => r.title === rv.title);
    setReviews(has ? reviews.filter((r) => r.title !== rv.title) : [...reviews, rv]);
  };

  // ------------- Summary numbers -------------
  const policySummary = useMemo(() => {
    const c = { yes: 0, no: 0, unsure: 0, na: 0, unanswered: 0 };
    const g = { yes: [], no: [], unsure: [], na: [] };
    (policyLib?.categories || []).forEach((cat) => cat.items.forEach((it) => {
      const r = policyResp[it.name]?.response;
      if (!r) c.unanswered += 1; else { c[r] += 1; g[r].push(it.name); }
    }));
    return { counts: c, grouped: g };
  }, [policyResp, policyLib]);

  const reqSummary = useMemo(() => {
    const c = { applicable: 0, potentially_applicable: 0, needs_review: 0, not_applicable: 0, unanswered: 0 };
    const g = { applicable: [], potentially_applicable: [], needs_review: [], not_applicable: [] };
    (reqLib?.categories || []).forEach((cat) => cat.items.forEach((it) => {
      const a = reqResp[it.name]?.applicability;
      if (!a) c.unanswered += 1; else { c[a] += 1; g[a].push(it.name); }
    }));
    return { counts: c, grouped: g };
  }, [reqResp, reqLib]);

  const contactSummary = useMemo(() => {
    const identified = []; const unassigned = [];
    Object.values(contacts).forEach((c) => {
      if (c.not_applicable) return;
      if (c.name || c.email || c.linked_user_id) identified.push(c);
      else unassigned.push(c);
    });
    return { identified, unassigned };
  }, [contacts]);

  const validKnownIssues = useMemo(() => knownIssues.filter((x) => (x.title || "").trim()), [knownIssues]);
  const validAssessments = useMemo(() => assessments.filter((x) => (x.name || "").trim()), [assessments]);

  // ------------- Finalize -------------
  async function finalize() {
    if (!currentClientId) { toast.error("No active client"); return; }
    // Validation
    const naNoRationalePolicy = Object.entries(policyResp).filter(([, r]) => r?.response === "na" && !(r?.applicability_rationale || "").trim()).map(([n]) => n);
    const naNoRationaleReq = Object.entries(reqResp).filter(([, r]) => r?.applicability === "not_applicable" && !(r?.rationale || "").trim()).map(([n]) => n);
    if (naNoRationalePolicy.length + naNoRationaleReq.length > 0) {
      toast.error(`Rationale required for ${naNoRationalePolicy.length + naNoRationaleReq.length} N/A responses`);
      return;
    }
    setSubmitting(true);
    try {
      const policy_responses = Object.entries(policyResp)
        .filter(([, r]) => r?.response)
        .map(([name, r]) => ({ name, category: r.category, response: r.response, note: r.note || undefined, applicability_rationale: r.applicability_rationale || undefined }));
      const requirement_responses = Object.entries(reqResp)
        .filter(([, r]) => r?.applicability)
        .map(([name, r]) => ({ name, category: r.category, applicability: r.applicability, note: r.note || undefined, rationale: r.rationale || undefined }));
      const contactsList = Object.values(contacts).filter((c) => c.not_applicable || c.name || c.email || c.linked_user_id).map((c) => ({
        role: c.role, name: c.name || undefined, title: c.title || undefined,
        email: c.email || undefined, phone: c.phone || undefined,
        linked_user_id: c.linked_user_id || undefined, notes: c.notes || undefined,
        not_applicable: !!c.not_applicable,
      }));
      const { data } = await api.post("/onboarding/finalize", {
        client_id: currentClientId,
        policy_responses,
        requirement_responses,
        contacts: contactsList,
        assessments: validAssessments,
        known_issues: validKnownIssues,
        recurring_reviews: reviews.map((r) => ({ title: r.title, review_type: r.review_type, recurrence: r.recurrence, due_days: r.due_days })),
      });
      const c = data.counters;
      toast.success(`Onboarding complete — policies ${c.policies_created + c.policies_updated}, requirements ${c.requirements_created + c.requirements_updated}, contacts ${c.contacts_saved}, assessments ${c.assessments_created}, known issues ${c.known_issues_promoted}, reviews ${c.reviews_created}, tasks ${c.tasks_created}, findings ${c.findings_created}`);
      if ((data.validation_errors || []).length) {
        data.validation_errors.forEach((v) => toast.warning(v));
      }
      nav("/dashboard");
    } catch (e) { toast.error(formatError(e)); }
    finally { setSubmitting(false); }
  }

  // ------------- Renders -------------
  if (!canRun) return <div className="p-8"><PageHeader title="GRC Program Onboarding" subtitle="You need contributor access to run this wizard." /></div>;
  if (!currentClientId) {
    return (
      <div>
        <PageHeader title="GRC Program Onboarding" subtitle="Establish the client's initial GRC program." />
        <div className="p-8 max-w-xl">
          <div className="bg-surface-card border border-line rounded-lg p-6 text-center">
            <Building2 className="h-8 w-8 text-ink-help mx-auto mb-3" />
            <h2 className="text-base font-heading font-semibold text-ink-primary mb-1">Select a client organization first</h2>
            <p className="text-sm text-ink-muted mb-4">Onboarding always operates within an active client workspace.</p>
            {isInternal && <Button onClick={() => nav("/clients")} data-testid="onboarding-goto-clients">Open Client Directory</Button>}
          </div>
        </div>
      </div>
    );
  }
  if (!policyLib || !reqLib || !templates) return <div className="p-8 text-sm text-slate-500">Loading onboarding library…</div>;

  const current = STEPS[step];

  return (
    <div>
      <PageHeader
        title="GRC Program Onboarding"
        subtitle="Establish the client's baseline: what they have, what applies, who is responsible, and what recurring GRC activities need to be scheduled."
      />
      <div className="px-8 pt-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-line bg-surface-card text-sm text-ink-primary" data-testid="onboarding-active-tenant">
          <Building2 className="h-3.5 w-3.5 text-ink-secondary" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-ink-help">Active client</span>
          <span className="text-ink-help">·</span>
          <span className="font-medium">{currentClient?.name}</span>
        </div>
        {(() => {
          const last = (state.onboarding_history || []).find((h) => h.action === "onboarding-complete");
          if (!last) return null;
          return (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-semantic-info-border bg-semantic-info-bg text-sm text-semantic-info" data-testid="onboarding-revisit-banner">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-semantic-info/80">Previously completed</span>
              <span className="text-ink-help">·</span>
              <span className="font-medium">{new Date(last.at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
              <span className="text-ink-help">by</span>
              <span className="font-medium">{last.user_name || last.user_email || "unknown"}</span>
            </div>
          );
        })()}
      </div>

      <div className="p-8 max-w-6xl">
        <ol className="flex flex-wrap items-center gap-2 mb-8 text-xs font-mono uppercase tracking-widest" data-testid="onboarding-stepper">
          {STEPS.map((s, i) => (
            <li key={s.key} className={`flex items-center gap-2 ${i === step ? "text-slate-900" : "text-slate-400"}`}>
              <span className={`h-5 w-5 rounded-full border flex items-center justify-center text-[10px] ${i === step ? "border-slate-900 bg-slate-900 text-white" : i < step ? "bg-emerald-500 text-white border-emerald-500" : "border-slate-300"}`}>{i < step ? "✓" : i + 1}</span>
              <span className="whitespace-nowrap">{s.label}</span>
              {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300" />}
            </li>
          ))}
        </ol>

        <div className="bg-white border border-slate-200 rounded-lg p-6">
          {current.key === "policies" && (
            <PoliciesStep lib={policyLib} responses={policyResp} setResp={setPR}
              openCats={openPolicyCats} setOpenCats={setOpenPolicyCats} summary={policySummary} />
          )}
          {current.key === "requirements" && (
            <RequirementsStep lib={reqLib} responses={reqResp} setResp={setQR}
              openCats={openReqCats} setOpenCats={setOpenReqCats} summary={reqSummary} />
          )}
          {current.key === "contacts" && (
            <ContactsStep roles={reqLib.role_templates || []} contacts={contacts} setCT={setCT} users={users} />
          )}
          {current.key === "assessments" && (
            <AssessmentsStep
              assessments={assessments} addAssessment={addAssessment} removeAssessment={removeAssessment} setAssessment={setAssessment}
              knownIssues={knownIssues} addIssue={addIssue} removeIssue={removeIssue} setIssue={setIssue}
              assessmentTypes={reqLib.assessment_types || []} users={users}
            />
          )}
          {current.key === "reviews" && (
            <ReviewsStep templates={templates.review_templates || []} reviews={reviews} toggleReview={toggleReview} />
          )}
          {current.key === "summary" && (
            <SummaryStep
              client={currentClient}
              policySummary={policySummary}
              reqSummary={reqSummary}
              contactSummary={contactSummary}
              assessments={validAssessments}
              knownIssues={validKnownIssues}
              reviews={reviews}
              contacts={contacts}
              userMap={Object.fromEntries(users.map((u) => [u.user_id, u]))}
            />
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} data-testid="onboarding-back">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} data-testid="onboarding-next">
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={finalize} disabled={submitting} data-testid="onboarding-create" className="bg-brand-charcoal hover:bg-brand-charcoal-hover">
                <CheckCircle2 className="h-4 w-4 mr-1" /> {submitting ? "Completing…" : "Complete onboarding"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ Sub-step components ============

function CategoryToggle({ label, count, answered, open, onToggle, testid }) {
  return (
    <button onClick={onToggle} data-testid={testid}
      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left">
      <div className="flex items-center gap-2">
        <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? "" : "-rotate-90"}`} />
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        <span className="text-[11px] text-slate-400 font-mono">{count} items</span>
      </div>
      <span className="text-[11px] font-mono uppercase tracking-widest text-slate-400">{answered} / {count} answered</span>
    </button>
  );
}

function PoliciesStep({ lib, responses, setResp, openCats, setOpenCats, summary }) {
  return (
    <div className="space-y-4" data-testid="onboarding-step-policies">
      <div>
        <h2 className="text-lg font-heading font-semibold">Policies & Governance Documents</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          For each policy, plan, or governance document, record what the client <strong>reports</strong> today.
          A "Yes" is <em>not</em> verification — the GRC team verifies later.
        </p>
      </div>
      <div className="space-y-3">
        {lib.categories.map((cat) => (
          <div key={cat.name} className="border border-slate-200 rounded-md">
            <CategoryToggle label={cat.name} count={cat.items.length} testid={`policy-category-${slug(cat.name)}`}
              answered={cat.items.filter((it) => responses[it.name]?.response).length}
              open={openCats[cat.name]} onToggle={() => setOpenCats({ ...openCats, [cat.name]: !openCats[cat.name] })} />
            {openCats[cat.name] && (
              <div className="divide-y divide-slate-100 border-t border-slate-200">
                {cat.items.map((it) => {
                  const r = responses[it.name] || {};
                  return (
                    <div key={it.name} className="px-4 py-3" data-testid={`policy-item-${slug(it.name)}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-slate-900 font-medium flex items-center gap-2">
                            {it.name}
                            {it.applicability === "consider_based_on_applicability" && (
                              <span title="Depends on business model / technology / regulatory obligations"
                                className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wide text-slate-500 border border-slate-200 rounded px-1.5 py-0.5">
                                <HelpCircle className="h-3 w-3" /> applicability
                              </span>
                            )}
                            {it.existing_policy_id && <span className="text-[10px] font-mono uppercase tracking-wide text-slate-400">· on register</span>}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 shrink-0" role="radiogroup">
                          {POLICY_RESPONSES.map((opt) => {
                            const active = r.response === opt.value;
                            return (
                              <button key={opt.value} type="button" onClick={() => setResp(it.name, { response: opt.value })}
                                data-testid={`response-${slug(it.name)}-${opt.value}`}
                                className={`px-2.5 py-1 rounded border text-xs font-medium transition ${active ? POLICY_TONE[opt.value] : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {(r.response || r.note) && (
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                          <Input value={r.note || ""} onChange={(e) => setResp(it.name, { note: e.target.value })}
                            placeholder='Optional note (e.g., "Lives in SharePoint")' className="text-xs"
                            data-testid={`note-${slug(it.name)}`} />
                          {r.response === "na" && (
                            <Input value={r.applicability_rationale || ""} onChange={(e) => setResp(it.name, { applicability_rationale: e.target.value })}
                              placeholder="Rationale required — why is this not applicable?" className={`text-xs ${!r.applicability_rationale ? "border-red-400 focus:border-red-500" : ""}`}
                              data-testid={`rationale-${slug(it.name)}`} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
        <span>Yes: <strong className="text-emerald-700">{summary.counts.yes}</strong></span>
        <span>No: <strong className="text-red-700">{summary.counts.no}</strong></span>
        <span>Unsure: <strong className="text-amber-700">{summary.counts.unsure}</strong></span>
        <span>N/A: <strong className="text-slate-700">{summary.counts.na}</strong></span>
        <span>Unanswered: <strong>{summary.counts.unanswered}</strong></span>
      </div>
    </div>
  );
}

function RequirementsStep({ lib, responses, setResp, openCats, setOpenCats, summary }) {
  return (
    <div className="space-y-4" data-testid="onboarding-step-requirements">
      <div>
        <h2 className="text-lg font-heading font-semibold">Compliance & Requirements</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Identify the frameworks, regulatory requirements, contractual commitments, insurance requirements, and other
          obligations the client currently believes apply. This is an initial applicability inventory - not a formal legal determination.
        </p>
      </div>
      <div className="space-y-3">
        {lib.categories.map((cat) => (
          <div key={cat.name} className="border border-slate-200 rounded-md">
            <CategoryToggle label={cat.name} count={cat.items.length} testid={`req-category-${slug(cat.name)}`}
              answered={cat.items.filter((it) => responses[it.name]?.applicability).length}
              open={openCats[cat.name]} onToggle={() => setOpenCats({ ...openCats, [cat.name]: !openCats[cat.name] })} />
            {openCats[cat.name] && (
              <div className="divide-y divide-slate-100 border-t border-slate-200">
                {cat.items.map((it) => {
                  const r = responses[it.name] || {};
                  return (
                    <div key={it.name} className="px-4 py-3" data-testid={`req-item-${slug(it.name)}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-slate-900 font-medium flex items-center gap-2">
                            {it.name}
                            {it.existing_requirement_id && <span className="text-[10px] font-mono uppercase tracking-wide text-slate-400">· on register</span>}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 shrink-0" role="radiogroup">
                          {REQ_RESPONSES.map((opt) => {
                            const active = r.applicability === opt.value;
                            return (
                              <button key={opt.value} type="button" onClick={() => setResp(it.name, { applicability: opt.value })}
                                data-testid={`req-response-${slug(it.name)}-${opt.value}`}
                                className={`px-2.5 py-1 rounded border text-xs font-medium transition ${active ? REQ_TONE[opt.value] : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {(r.applicability || r.note) && (
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                          <Input value={r.note || ""} onChange={(e) => setResp(it.name, { note: e.target.value })}
                            placeholder="Optional note" className="text-xs" data-testid={`req-note-${slug(it.name)}`} />
                          {r.applicability === "not_applicable" && (
                            <Input value={r.rationale || ""} onChange={(e) => setResp(it.name, { rationale: e.target.value })}
                              placeholder="Rationale required — why is this not applicable?"
                              className={`text-xs ${!r.rationale ? "border-red-400 focus:border-red-500" : ""}`}
                              data-testid={`req-rationale-${slug(it.name)}`} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
        <span>Applicable: <strong className="text-emerald-700">{summary.counts.applicable}</strong></span>
        <span>Potentially: <strong className="text-amber-700">{summary.counts.potentially_applicable}</strong></span>
        <span>Needs Review: <strong className="text-sky-700">{summary.counts.needs_review}</strong></span>
        <span>N/A: <strong className="text-slate-700">{summary.counts.not_applicable}</strong></span>
        <span>Unanswered: <strong>{summary.counts.unanswered}</strong></span>
      </div>
    </div>
  );
}

function ContactsStep({ roles, contacts, setCT, users }) {
  return (
    <div className="space-y-4" data-testid="onboarding-step-contacts">
      <div>
        <h2 className="text-lg font-heading font-semibold">Key Roles & Contacts</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Identify the key client contacts and business roles involved in managing the GRC program.
          Identifying someone here does <strong>not</strong> create a platform account — invite them explicitly from Client Settings later.
          One person may occupy multiple roles.
        </p>
      </div>
      <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
        {roles.map((rt) => {
          const c = contacts[rt.role] || { role: rt.role };
          return (
            <div key={rt.role} className="px-4 py-3" data-testid={`contact-role-${slug(rt.role)}`}>
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <div className="text-sm font-medium text-slate-900">{rt.role}</div>
                  <div className="text-[11px] text-slate-500">{rt.hint}</div>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 select-none whitespace-nowrap">
                  <input type="checkbox" checked={!!c.not_applicable}
                    onChange={(e) => setCT(rt.role, { not_applicable: e.target.checked })}
                    data-testid={`contact-na-${slug(rt.role)}`} />
                  Not applicable
                </label>
              </div>
              {!c.not_applicable && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <Input placeholder="Name" value={c.name || ""} onChange={(e) => setCT(rt.role, { name: e.target.value })}
                    className="text-xs" data-testid={`contact-name-${slug(rt.role)}`} />
                  <Input placeholder="Title" value={c.title || ""} onChange={(e) => setCT(rt.role, { title: e.target.value })} className="text-xs" />
                  <Input placeholder="Email" value={c.email || ""} onChange={(e) => setCT(rt.role, { email: e.target.value })}
                    className="text-xs" data-testid={`contact-email-${slug(rt.role)}`} />
                  <Select value={c.linked_user_id || "__none__"} onValueChange={(v) => setCT(rt.role, { linked_user_id: v === "__none__" ? "" : v })}>
                    <SelectTrigger className="text-xs" data-testid={`contact-link-${slug(rt.role)}`}>
                      <SelectValue placeholder="Link platform user (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not a platform user</SelectItem>
                      {users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssessmentsStep({ assessments, addAssessment, removeAssessment, setAssessment,
                          knownIssues, addIssue, removeIssue, setIssue, assessmentTypes, users }) {
  return (
    <div className="space-y-6" data-testid="onboarding-step-assessments">
      <div>
        <h2 className="text-lg font-heading font-semibold">Existing Assessments / Known Issues</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Capture assessments, audits, and known GRC gaps that already exist so the new program does not start from a blank slate.
          Client-reported issues are recorded separately from verified findings.
        </p>
      </div>

      {/* Existing Assessments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-slate-800">Existing Assessments</div>
          <Button size="sm" variant="outline" onClick={addAssessment} data-testid="add-assessment">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Existing Assessment
          </Button>
        </div>
        {assessments.length === 0 ? (
          <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-md p-6 text-center">
            No assessments recorded yet. Optional — you can add later.
          </div>
        ) : (
          <div className="space-y-2">
            {assessments.map((a, i) => (
              <div key={i} className="border border-slate-200 rounded-md p-3" data-testid={`assessment-row-${i}`}>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                  <Input placeholder="Assessment name" value={a.name} onChange={(e) => setAssessment(i, { name: e.target.value })}
                    className="text-xs md:col-span-2" data-testid={`assessment-name-${i}`} />
                  <Select value={a.assessment_type || ""} onValueChange={(v) => setAssessment(i, { assessment_type: v })}>
                    <SelectTrigger className="text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      {assessmentTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="date" value={a.date || ""} onChange={(e) => setAssessment(i, { date: e.target.value })} className="text-xs" />
                  <Select value={a.status || "reported"} onValueChange={(v) => setAssessment(i, { status: v })}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reported">Reported</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="needs_review">Needs Review</SelectItem>
                    </SelectContent>
                  </Select>
                  <button onClick={() => removeAssessment(i)} className="text-slate-400 hover:text-red-500 justify-self-end" data-testid={`assessment-delete-${i}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={!!a.document_available} onChange={(e) => setAssessment(i, { document_available: e.target.checked })} />
                    Document available
                  </label>
                  <Select value={a.open_findings || "unknown"} onValueChange={(v) => setAssessment(i, { open_findings: v })}>
                    <SelectTrigger className="text-xs"><SelectValue placeholder="Open findings?" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Open findings — Yes</SelectItem>
                      <SelectItem value="no">Open findings — No</SelectItem>
                      <SelectItem value="unknown">Open findings — Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Notes" value={a.notes || ""} onChange={(e) => setAssessment(i, { notes: e.target.value })} className="text-xs" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Known Issues */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-slate-800">Known Issues / Existing Gaps</div>
          <Button size="sm" variant="outline" onClick={addIssue} data-testid="add-known-issue">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Known Issue
          </Button>
        </div>
        <p className="text-xs text-slate-500 mb-2">Reported / Needs Review issues become <strong>Tasks</strong>. Verified existing findings become <strong>Findings</strong>.</p>
        {knownIssues.length === 0 ? (
          <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-md p-6 text-center">
            No known issues recorded yet.
          </div>
        ) : (
          <div className="space-y-2">
            {knownIssues.map((iss, i) => (
              <div key={i} className="border border-slate-200 rounded-md p-3" data-testid={`known-issue-row-${i}`}>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                  <Input placeholder="Issue / gap" value={iss.title} onChange={(e) => setIssue(i, { title: e.target.value })}
                    className="text-xs md:col-span-2" data-testid={`issue-title-${i}`} />
                  <Select value={iss.classification} onValueChange={(v) => setIssue(i, { classification: v })}>
                    <SelectTrigger className="text-xs" data-testid={`issue-class-${i}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KNOWN_ISSUE_CLASSIFICATIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={iss.priority || "medium"} onValueChange={(v) => setIssue(i, { priority: v })}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={iss.owner_id || "__none__"} onValueChange={(v) => setIssue(i, { owner_id: v === "__none__" ? "" : v })}>
                    <SelectTrigger className="text-xs"><SelectValue placeholder="Owner (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <button onClick={() => removeIssue(i)} className="text-slate-400 hover:text-red-500 justify-self-end" data-testid={`issue-delete-${i}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2">
                  <Input placeholder="Notes" value={iss.notes || ""} onChange={(e) => setIssue(i, { notes: e.target.value })} className="text-xs" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewsStep({ templates, reviews, toggleReview }) {
  return (
    <div className="space-y-4" data-testid="onboarding-step-reviews">
      <h2 className="text-lg font-heading font-semibold">Recurring Reviews</h2>
      <p className="text-sm text-slate-500">Establish the ongoing GRC schedule. These are scheduled with a first due date and then repeat automatically at the selected cadence.</p>
      <div className="space-y-2">
        {templates.map((rv) => (
          <label key={rv.title} className="flex items-center justify-between gap-2 border border-slate-200 rounded-md px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
            <div className="flex items-center gap-2">
              <Checkbox checked={!!reviews.find((r) => r.title === rv.title)} onCheckedChange={() => toggleReview(rv)}
                data-testid={`review-${rv.review_type}`} />
              <span>{rv.title}</span>
            </div>
            <div className="text-xs text-slate-500 font-mono">{rv.recurrence} · first due in {rv.due_days}d</div>
          </label>
        ))}
      </div>
    </div>
  );
}

function SummaryTile({ label, count, tone, testid }) {
  const t = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-red-200 bg-red-50 text-red-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  }[tone];
  return (
    <div className={`border rounded-md p-3 ${t}`} data-testid={testid}>
      <div className="text-[10px] font-mono uppercase tracking-widest opacity-70">{label}</div>
      <div className="text-2xl font-heading">{count}</div>
    </div>
  );
}

function SummaryStep({ client, policySummary, reqSummary, contactSummary, assessments, knownIssues, reviews, contacts, userMap }) {
  return (
    <div className="space-y-8" data-testid="onboarding-step-summary">
      <div>
        <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-emerald-500" /> GRC Program Onboarding Summary
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Review the client-reported baseline and records that will be created or updated before establishing the GRC program for
          <strong className="text-slate-700"> {client?.name}</strong>. Existing records with matching titles will be updated, not duplicated.
        </p>
      </div>

      {/* Policies */}
      <section data-testid="summary-policies">
        <h3 className="text-sm font-heading font-semibold text-slate-800 mb-2">Policies & Governance Documents</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryTile label="Reported Existing" count={policySummary.counts.yes} tone="emerald" testid="tile-policy-yes" />
          <SummaryTile label="Reported Missing" count={policySummary.counts.no} tone="red" testid="tile-policy-no" />
          <SummaryTile label="Needs Confirmation" count={policySummary.counts.unsure} tone="amber" testid="tile-policy-unsure" />
          <SummaryTile label="Not Applicable" count={policySummary.counts.na} tone="slate" testid="tile-policy-na" />
        </div>
      </section>

      {/* Requirements */}
      <section data-testid="summary-requirements">
        <h3 className="text-sm font-heading font-semibold text-slate-800 mb-2">Compliance & Requirements</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryTile label="Applicable" count={reqSummary.counts.applicable} tone="emerald" testid="tile-req-applicable" />
          <SummaryTile label="Potentially" count={reqSummary.counts.potentially_applicable} tone="amber" testid="tile-req-potentially" />
          <SummaryTile label="Needs Review" count={reqSummary.counts.needs_review} tone="sky" testid="tile-req-needs-review" />
          <SummaryTile label="Not Applicable" count={reqSummary.counts.not_applicable} tone="slate" testid="tile-req-na" />
        </div>
      </section>

      {/* Contacts */}
      <section data-testid="summary-contacts">
        <h3 className="text-sm font-heading font-semibold text-slate-800 mb-2">Key Roles & Contacts</h3>
        <div className="bg-slate-50 border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-slate-500 bg-white border-b border-slate-200">
              <tr><th className="tbl-cell text-left">Role</th><th className="tbl-cell text-left">Contact</th><th className="tbl-cell text-left">Email</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.values(contacts).map((c) => (
                <tr key={c.role} data-testid={`summary-contact-${slug(c.role)}`}>
                  <td className="tbl-cell text-slate-700">{c.role}</td>
                  <td className="tbl-cell">
                    {c.not_applicable ? <span className="text-slate-400 italic">Not applicable</span> :
                     c.name || c.email || c.linked_user_id ? (c.name || userMap[c.linked_user_id]?.name || userMap[c.linked_user_id]?.email || "—") :
                     <span className="text-amber-700 italic">Not assigned</span>}
                  </td>
                  <td className="tbl-cell text-slate-500 font-mono text-xs">{c.email || (c.linked_user_id && userMap[c.linked_user_id]?.email) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Assessments & Known Issues */}
      <section data-testid="summary-assessments">
        <h3 className="text-sm font-heading font-semibold text-slate-800 mb-2">Existing Assessments & Known Issues</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-slate-200 rounded-md p-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">Existing Assessments · {assessments.length}</div>
            {assessments.length === 0 ? <div className="text-xs text-slate-400">None</div> : (
              <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                {assessments.map((a, i) => <li key={i}>{a.name}{a.date ? ` — ${a.date}` : ""}{a.status === "verified" ? " (verified)" : ""}</li>)}
              </ul>
            )}
          </div>
          <div className="border border-slate-200 rounded-md p-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">Known Issues · {knownIssues.length}</div>
            {knownIssues.length === 0 ? <div className="text-xs text-slate-400">None</div> : (
              <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                {knownIssues.map((k, i) => <li key={i}>{k.title} <span className="text-slate-400">· {(KNOWN_ISSUE_CLASSIFICATIONS.find((o) => o.value === k.classification) || {}).label}</span></li>)}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section data-testid="summary-reviews">
        <h3 className="text-sm font-heading font-semibold text-slate-800 mb-2">Recurring GRC Reviews · {reviews.length}</h3>
        {reviews.length === 0 ? <div className="text-xs text-slate-400">No recurring reviews selected</div> : (
          <div className="bg-slate-50 border border-slate-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-[10px] font-mono uppercase tracking-widest text-slate-500 bg-white border-b border-slate-200">
                <tr><th className="tbl-cell text-left">Review</th><th className="tbl-cell text-left">Frequency</th><th className="tbl-cell text-left">First Due</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reviews.map((r) => (
                  <tr key={r.title} data-testid={`summary-review-${slug(r.title)}`}>
                    <td className="tbl-cell text-slate-700">{r.title}</td>
                    <td className="tbl-cell text-slate-500 capitalize">{r.recurrence}</td>
                    <td className="tbl-cell text-slate-500 font-mono text-xs">in {r.due_days}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Records to be created */}
      <section data-testid="summary-records-created" className="border-t border-slate-200 pt-5">
        <h3 className="text-sm font-heading font-semibold text-slate-800 mb-2">Records to be Created or Updated</h3>
        <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
          <li><strong>{policySummary.counts.yes + policySummary.counts.no + policySummary.counts.unsure + policySummary.counts.na}</strong> Policy Register records created or updated</li>
          <li><strong>{reqSummary.counts.applicable + reqSummary.counts.potentially_applicable + reqSummary.counts.needs_review + reqSummary.counts.not_applicable}</strong> Requirements Register records created or updated</li>
          <li><strong>{Object.values(contacts).filter((c) => c.not_applicable || c.name || c.email || c.linked_user_id).length}</strong> client role/contact records saved</li>
          <li><strong>{policySummary.counts.no + policySummary.counts.unsure + knownIssues.filter((k) => k.classification !== "verified_finding").length}</strong> Action Items will be created</li>
          <li><strong>{reviews.length}</strong> recurring Reviews will be scheduled</li>
          <li><strong>{knownIssues.filter((k) => k.classification === "verified_finding").length}</strong> existing Findings imported</li>
          <li><strong>{assessments.length}</strong> assessment intake records created</li>
        </ul>
        <p className="text-[11px] text-slate-500 mt-3">Records with matching titles will be <em>updated</em>, not duplicated. Contacts do not create platform accounts.</p>
      </section>

      <OnboardingHistoryTimeline />
    </div>
  );
}

function OnboardingHistoryTimeline() {
  const { currentClientId } = useOrg();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !currentClientId || history.length) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/onboarding/state", { params: { client_id: currentClientId } });
        setHistory(data.onboarding_history || []);
      } catch (e) { void e; }
      finally { setLoading(false); }
    })();
  }, [open, currentClientId, history.length]);

  const groups = useMemo(() => {
    const g = {};
    history.forEach((h) => {
      const day = (h.at || "").slice(0, 10) || "unknown";
      (g[day] ||= []).push(h);
    });
    return Object.entries(g).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [history]);

  return (
    <section className="border-t border-slate-200 pt-5" data-testid="onboarding-history-section">
      <button onClick={() => setOpen(!open)} data-testid="onboarding-history-toggle"
        className="flex items-center gap-2 text-sm font-heading font-semibold text-slate-800 hover:text-slate-900">
        <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? "" : "-rotate-90"}`} />
        Onboarding history {history.length > 0 && <span className="text-[11px] text-slate-500 font-mono">({history.length} entries)</span>}
      </button>
      {open && (
        <div className="mt-3 pl-6 border-l-2 border-slate-100 space-y-4" data-testid="onboarding-history-timeline">
          {loading && <div className="text-xs text-slate-400">Loading history...</div>}
          {!loading && history.length === 0 && <div className="text-xs text-slate-400">No prior onboarding activity for this client.</div>}
          {!loading && groups.map(([day, items]) => (
            <div key={day}>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1.5">
                {day === "unknown" ? "Unknown" : new Date(day).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </div>
              <ul className="space-y-1 text-xs text-slate-700">
                {items.map((h, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-mono text-slate-400 shrink-0">{h.at ? new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</span>
                    <span className="font-medium text-slate-800">{h.user_name || h.user_email || "unknown"}</span>
                    <span className="text-slate-500">{(h.action || "").replace(/-/g, " ")}</span>
                    {h.entity_type && <span className="text-slate-400">on {h.entity_type}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
