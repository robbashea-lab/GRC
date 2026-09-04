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
import { CheckCircle2, ChevronRight, ChevronLeft, Sparkles, Building2, ChevronDown, HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const STEPS = ["Policies & Governance Documents", "Risks", "Reviews", "Review & create"];

const RESPONSE_OPTIONS = [
  { value: "yes", label: "Yes", hint: "Reported as existing" },
  { value: "no", label: "No", hint: "Reported as missing" },
  { value: "unsure", label: "Unsure", hint: "Needs confirmation" },
  { value: "na", label: "N/A", hint: "Not applicable" },
];

const RESPONSE_TONE = {
  yes: "bg-emerald-100 text-emerald-800 border-emerald-300",
  no: "bg-red-100 text-red-800 border-red-300",
  unsure: "bg-amber-100 text-amber-800 border-amber-300",
  na: "bg-slate-100 text-slate-700 border-slate-300",
};

// Map an existing Policy row's presence back to the segmented-control value so
// re-opening onboarding for a client shows what they already reported.
const PRESENCE_TO_RESPONSE = {
  reported_existing: "yes",
  verified_existing: "yes",
  reported_missing: "no",
  needs_confirmation: "unsure",
  not_applicable: "na",
};

export default function Onboarding() {
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [library, setLibrary] = useState(null);
  const [responses, setResponses] = useState({});   // { [policyName]: {response, note, applicability_rationale, category} }
  const [templates, setTemplates] = useState(null);
  const [risks, setRisks] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [openCategories, setOpenCategories] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const canRun = ["super_admin", "platform_admin", "client_contributor"].includes(user?.role);
  const isInternal = ["super_admin", "platform_admin"].includes(user?.role);

  useEffect(() => {
    if (!currentClientId) return;
    (async () => {
      try {
        const [{ data: lib }, { data: tpl }] = await Promise.all([
          api.get("/onboarding/policy-library", { params: { client_id: currentClientId } }),
          api.get("/baseline/templates"),
        ]);
        setLibrary(lib);
        setTemplates(tpl);
        setRisks(tpl.risks.slice(0, 3));
        setReviews(tpl.review_templates.slice(0, 4));
        // Preselect responses from any existing Policy rows.
        const init = {};
        (lib.categories || []).forEach((cat) => {
          cat.items.forEach((it) => {
            const prev = it.current_presence ? PRESENCE_TO_RESPONSE[it.current_presence] : "";
            init[it.name] = {
              response: prev || "",
              note: it.last_onboarding_note || "",
              applicability_rationale: it.applicability_rationale || "",
              category: it.category,
            };
          });
        });
        setResponses(init);
        setOpenCategories(Object.fromEntries((lib.categories || []).map((c) => [c.name, true])));
      } catch (e) { toast.error(formatError(e)); }
    })();
  }, [currentClientId]);

  const setResp = (name, patch) => setResponses((prev) => ({ ...prev, [name]: { ...(prev[name] || {}), ...patch } }));

  const summary = useMemo(() => {
    const counts = { yes: 0, no: 0, unsure: 0, na: 0, unanswered: 0 };
    const grouped = { yes: [], no: [], unsure: [], na: [] };
    (library?.categories || []).forEach((cat) => {
      cat.items.forEach((it) => {
        const r = responses[it.name]?.response;
        if (!r) counts.unanswered += 1;
        else { counts[r] += 1; grouped[r].push(it.name); }
      });
    });
    return { counts, grouped };
  }, [responses, library]);

  const toggleReview = (rv) => {
    const has = reviews.find((r) => r.title === rv.title);
    setReviews(has ? reviews.filter((r) => r.title !== rv.title) : [...reviews, rv]);
  };
  const toggleRisk = (r) => setRisks(risks.includes(r) ? risks.filter((x) => x !== r) : [...risks, r]);

  async function create() {
    if (!currentClientId) { toast.error("No active client selected"); return; }
    // Validate: N/A responses must include rationale.
    const missingRationale = [];
    Object.entries(responses).forEach(([name, r]) => {
      if (r?.response === "na" && !(r?.applicability_rationale || "").trim()) missingRationale.push(name);
    });
    if (missingRationale.length) {
      toast.error(`Rationale required for N/A: ${missingRationale.slice(0, 2).join(", ")}${missingRationale.length > 2 ? "…" : ""}`);
      return;
    }
    setSubmitting(true);
    try {
      // 1) Policies & Governance responses (only send answered items).
      const payloadResponses = Object.entries(responses)
        .filter(([, r]) => r?.response)
        .map(([name, r]) => ({
          name,
          category: r.category,
          response: r.response,
          note: r.note || undefined,
          applicability_rationale: r.applicability_rationale || undefined,
        }));
      const { data: polResult } = await api.post("/onboarding/policy-responses", {
        client_id: currentClientId,
        responses: payloadResponses,
      });
      // 2) Legacy baseline (risks + reviews only — policies have moved to the new endpoint).
      const { data: baseResult } = await api.post("/baseline", {
        client_id: currentClientId,
        policies: [],
        risks,
        reviews,
      });
      toast.success(
        `Onboarding complete · policies: ${polResult.counters.policies_created + polResult.counters.policies_updated} · tasks: ${polResult.counters.tasks_created} · risks: ${baseResult.created.risks} · reviews: ${baseResult.created.reviews}`
      );
      nav("/policies");
    } catch (e) {
      toast.error(formatError(e));
    } finally { setSubmitting(false); }
  }

  if (!canRun) {
    return <div className="p-8"><PageHeader title="GRC Program Onboarding" subtitle="You need contributor access to run this wizard." /></div>;
  }
  if (!currentClientId) {
    return (
      <div>
        <PageHeader
          title="GRC Program Onboarding"
          subtitle="Establish the client's initial GRC program, identify existing capabilities and gaps, and create the appropriate ongoing review schedule."
        />
        <div className="p-8 max-w-xl">
          <div className="bg-surface-card border border-line rounded-lg p-6 text-center">
            <Building2 className="h-8 w-8 text-ink-help mx-auto mb-3" />
            <h2 className="text-base font-heading font-semibold text-ink-primary mb-1">Select a client organization first</h2>
            <p className="text-sm text-ink-muted mb-4">Onboarding always operates within an active client workspace. Choose the client whose program you want to establish.</p>
            {isInternal && (
              <Button onClick={() => nav("/clients")} data-testid="onboarding-goto-clients">Open Client Directory</Button>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (!library || !templates) return <div className="p-8 text-sm text-slate-500">Loading onboarding library…</div>;

  return (
    <div>
      <PageHeader
        title="GRC Program Onboarding"
        subtitle="Baseline the client's governance program. Client-reported answers are recorded separately from verified evidence."
      />
      <div className="px-8 pt-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-line bg-surface-card text-sm text-ink-primary" data-testid="onboarding-active-tenant">
          <Building2 className="h-3.5 w-3.5 text-ink-secondary" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-ink-help">Active client</span>
          <span className="text-ink-help">·</span>
          <span className="font-medium">{currentClient?.name || "Loading…"}</span>
        </div>
      </div>

      <div className="p-8 max-w-5xl">
        <ol className="flex items-center gap-2 mb-8 text-xs font-mono uppercase tracking-widest">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 ${i === step ? "text-slate-900" : "text-slate-400"}`}>
              <span className={`h-5 w-5 rounded-full border flex items-center justify-center text-[10px] ${i === step ? "border-slate-900 bg-slate-900 text-white" : i < step ? "bg-emerald-500 text-white border-emerald-500" : "border-slate-300"}`}>{i < step ? "✓" : i + 1}</span>
              <span className="whitespace-nowrap">{s}</span>
              {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300" />}
            </li>
          ))}
        </ol>

        <div className="bg-white border border-slate-200 rounded-lg p-6">
          {step === 0 && (
            <div className="space-y-4" data-testid="onboarding-step-policies">
              <div>
                <h2 className="text-lg font-heading font-semibold">Policies & Governance Documents</h2>
                <p className="text-sm text-slate-600 mt-1 max-w-3xl">
                  For each policy, plan, or governance document, record what the client <strong>reports</strong> today.
                  This is a baseline inventory — a "Yes" is <em>not</em> a verification.
                  The GRC team will verify existing documents in a follow-up step.
                </p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" /> Yes → Reported Existing</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" /> No → Reported Missing (+ task)</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" /> Unsure → Needs Confirmation (+ task)</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1" /> N/A → Not Applicable (requires rationale)</span>
                </div>
              </div>

              <div className="space-y-3" data-testid="policy-categories">
                {library.categories.map((cat) => (
                  <div key={cat.name} className="border border-slate-200 rounded-md">
                    <button
                      onClick={() => setOpenCategories({ ...openCategories, [cat.name]: !openCategories[cat.name] })}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
                      data-testid={`policy-category-${cat.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition ${openCategories[cat.name] ? "" : "-rotate-90"}`} />
                        <span className="text-sm font-semibold text-slate-800">{cat.name}</span>
                        <span className="text-[11px] text-slate-400 font-mono">{cat.items.length} items</span>
                      </div>
                      <span className="text-[11px] font-mono uppercase tracking-widest text-slate-400">
                        {cat.items.filter((it) => responses[it.name]?.response).length} / {cat.items.length} answered
                      </span>
                    </button>
                    {openCategories[cat.name] && (
                      <div className="divide-y divide-slate-100 border-t border-slate-200">
                        {cat.items.map((it) => {
                          const r = responses[it.name] || {};
                          return (
                            <div key={it.name} className="px-4 py-3" data-testid={`policy-item-${it.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}>
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
                                    {it.existing_policy_id && (
                                      <span className="text-[10px] font-mono uppercase tracking-wide text-slate-400" title={`Existing record ${it.existing_policy_id}`}>
                                        · on register
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1 shrink-0" role="radiogroup" aria-label={`${it.name} response`}>
                                  {RESPONSE_OPTIONS.map((opt) => {
                                    const active = r.response === opt.value;
                                    return (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setResp(it.name, { response: opt.value })}
                                        data-testid={`response-${it.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${opt.value}`}
                                        className={`px-2.5 py-1 rounded border text-xs font-medium transition ${active ? RESPONSE_TONE[opt.value] : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}
                                        title={opt.hint}
                                        role="radio"
                                        aria-checked={active}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              {(r.response || r.note) && (
                                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <Input
                                    value={r.note || ""}
                                    onChange={(e) => setResp(it.name, { note: e.target.value })}
                                    placeholder='Optional note (e.g., "Lives in SharePoint", "MSP may have a copy")'
                                    className="text-xs"
                                    data-testid={`note-${it.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                                  />
                                  {r.response === "na" && (
                                    <Input
                                      value={r.applicability_rationale || ""}
                                      onChange={(e) => setResp(it.name, { applicability_rationale: e.target.value })}
                                      placeholder="Rationale required — why is this not applicable?"
                                      className={`text-xs ${!r.applicability_rationale ? "border-red-400 focus:border-red-500" : ""}`}
                                      data-testid={`rationale-${it.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                                    />
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

              <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500" data-testid="onboarding-progress">
                <span>Yes: <strong className="text-emerald-700">{summary.counts.yes}</strong></span>
                <span>No: <strong className="text-red-700">{summary.counts.no}</strong></span>
                <span>Unsure: <strong className="text-amber-700">{summary.counts.unsure}</strong></span>
                <span>N/A: <strong className="text-slate-700">{summary.counts.na}</strong></span>
                <span>Unanswered: <strong>{summary.counts.unanswered}</strong></span>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4" data-testid="onboarding-step-risks">
              <h2 className="text-lg font-heading font-semibold">Starter risk register</h2>
              <p className="text-sm text-slate-500">Seed the risk register with typical enterprise risks. You can tune likelihood/impact per client after.</p>
              <div className="space-y-2">
                {templates.risks.map((r) => (
                  <label key={r} className="flex items-center gap-2 border border-slate-200 rounded-md px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
                    <Checkbox data-testid={`risk-${r.split(" ")[0].toLowerCase()}`} checked={risks.includes(r)} onCheckedChange={() => toggleRisk(r)} />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="onboarding-step-reviews">
              <h2 className="text-lg font-heading font-semibold">Recurring review calendar</h2>
              <p className="text-sm text-slate-500">These reviews will be scheduled with a first due date, then repeat automatically at the cadence shown.</p>
              <div className="space-y-2">
                {templates.review_templates.map((rv) => (
                  <label key={rv.title} className="flex items-center justify-between gap-2 border border-slate-200 rounded-md px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Checkbox data-testid={`review-${rv.review_type}`} checked={!!reviews.find((r) => r.title === rv.title)} onCheckedChange={() => toggleReview(rv)} />
                      <span>{rv.title}</span>
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{rv.recurrence} · first due in {rv.due_days}d</div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5" data-testid="onboarding-step-review">
              <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-500" /> Policies & Governance summary
              </h2>
              <p className="text-xs text-slate-500">Review before creating records. Yes answers are recorded as <em>Reported Existing</em> — not verified.</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <SummaryTile label="Reported Existing" count={summary.counts.yes} tone="emerald" testid="tile-yes" />
                <SummaryTile label="Reported Missing" count={summary.counts.no} tone="red" testid="tile-no" />
                <SummaryTile label="Needs Confirmation" count={summary.counts.unsure} tone="amber" testid="tile-unsure" />
                <SummaryTile label="Not Applicable" count={summary.counts.na} tone="slate" testid="tile-na" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SummaryGroup title="Reported Existing" items={summary.grouped.yes} tone="emerald" />
                <SummaryGroup title="Reported Missing (task created)" items={summary.grouped.no} tone="red" />
                <SummaryGroup title="Needs Confirmation (task created)" items={summary.grouped.unsure} tone="amber" />
                <SummaryGroup title="Not Applicable" items={summary.grouped.na} tone="slate" />
              </div>

              <div className="border-t border-slate-200 pt-4 grid grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-md p-3">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500">Risks to seed</div>
                  <div className="text-2xl font-heading">{risks.length}</div>
                </div>
                <div className="border border-slate-200 rounded-md p-3">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500">Recurring reviews</div>
                  <div className="text-2xl font-heading">{reviews.length}</div>
                </div>
              </div>

              <p className="text-xs text-slate-500">Records will be created / updated in <span className="font-medium text-slate-700">{currentClient?.name}</span>. Existing policies with the same title will not be duplicated.</p>
            </div>
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
              <Button onClick={create} disabled={submitting} data-testid="onboarding-create">
                <CheckCircle2 className="h-4 w-4 mr-1" /> {submitting ? "Creating…" : `Complete onboarding for ${currentClient?.name || "client"}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, count, tone, testid }) {
  const t = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-red-200 bg-red-50 text-red-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  }[tone];
  return (
    <div className={`border rounded-md p-3 ${t}`} data-testid={testid}>
      <div className="text-[10px] font-mono uppercase tracking-widest opacity-70">{label}</div>
      <div className="text-2xl font-heading">{count}</div>
    </div>
  );
}

function SummaryGroup({ title, items, tone }) {
  const t = {
    emerald: "text-emerald-700 border-emerald-100",
    red: "text-red-700 border-red-100",
    amber: "text-amber-700 border-amber-100",
    slate: "text-slate-700 border-slate-100",
  }[tone];
  return (
    <div className={`border rounded-md p-3 ${t}`}>
      <div className={`text-[11px] font-mono uppercase tracking-widest mb-2 ${t.split(" ")[0]}`}>{title} · {items.length}</div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400">None</div>
      ) : (
        <ul className="text-xs text-slate-700 space-y-0.5 list-disc list-inside">
          {items.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}
