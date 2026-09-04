import { useEffect, useState } from "react";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import api, { formatError } from "@/lib/api";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, ChevronRight, ChevronLeft, Sparkles, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Tenant selection happens BEFORE entering onboarding (Client Directory → workspace).
// This wizard always operates against the currently active client organization.
const STEPS = ["Policies", "Risks", "Reviews", "Review & create"];

export default function Onboarding() {
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [risks, setRisks] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const canRun = ["super_admin", "platform_admin", "client_contributor"].includes(user?.role);
  const isInternal = ["super_admin", "platform_admin"].includes(user?.role);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/baseline/templates");
        setTemplates(data);
        setPolicies(data.policies.slice(0, 4));
        setRisks(data.risks.slice(0, 3));
        setReviews(data.review_templates.slice(0, 4));
      } catch (e) { toast.error(formatError(e)); }
    })();
  }, []);

  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const toggleReview = (rv) => {
    const has = reviews.find((r) => r.title === rv.title);
    setReviews(has ? reviews.filter((r) => r.title !== rv.title) : [...reviews, rv]);
  };

  async function create() {
    // The active client is the ONLY tenant this wizard can write to. Backend also
    // re-verifies authorization via _can_access_client, so a tampered request is rejected.
    if (!currentClientId) { toast.error("No active client selected"); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post("/baseline", {
        client_id: currentClientId,
        policies, risks, reviews,
      });
      toast.success(`Onboarding complete: ${data.created.policies} policies · ${data.created.risks} risks · ${data.created.reviews} reviews`);
      nav("/dashboard");
    } catch (e) {
      toast.error(formatError(e));
    } finally { setSubmitting(false); }
  }

  if (!canRun) {
    return <div className="p-8"><PageHeader title="GRC Program Onboarding" subtitle="You need contributor access to run this wizard." /></div>;
  }

  // Internal admins landing here without a client selected: guide them back to Clients.
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

  if (!templates) return <div className="p-8 text-sm text-slate-500">Loading templates…</div>;

  return (
    <div>
      <PageHeader
        title="GRC Program Onboarding"
        subtitle="Establish the client's initial GRC program, identify existing capabilities and gaps, and create the appropriate ongoing review schedule."
      />
      <div className="px-8 pt-4">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-line bg-surface-card text-sm text-ink-primary"
          data-testid="onboarding-active-tenant"
        >
          <Building2 className="h-3.5 w-3.5 text-ink-secondary" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-ink-help">Active client</span>
          <span className="text-ink-help">·</span>
          <span className="font-medium">{currentClient?.name || "Loading…"}</span>
        </div>
      </div>
      <div className="p-8 max-w-4xl">
        <ol className="flex items-center gap-2 mb-8 text-xs font-mono uppercase tracking-widest">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 ${i === step ? "text-slate-900" : "text-slate-400"}`}>
              <span className={`h-5 w-5 rounded-full border flex items-center justify-center text-[10px] ${i === step ? "border-slate-900 bg-slate-900 text-white" : i < step ? "bg-emerald-500 text-white border-emerald-500" : "border-slate-300"}`}>{i < step ? "✓" : i + 1}</span>
              <span>{s}</span>
              {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300" />}
            </li>
          ))}
        </ol>

        <div className="bg-white border border-slate-200 rounded-lg p-6">
          {step === 0 && (
            <div className="space-y-4" data-testid="onboarding-step-policies">
              <h2 className="text-lg font-heading font-semibold">Starter policies</h2>
              <p className="text-sm text-slate-500">Pick the policies that should exist in draft form so owners can adopt them.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {templates.policies.map((p) => (
                  <label key={p} className="flex items-center gap-2 border border-slate-200 rounded-md px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
                    <Checkbox data-testid={`policy-${p.split(" ")[0].toLowerCase()}`} checked={policies.includes(p)} onCheckedChange={() => toggle(policies, setPolicies, p)} />
                    <span>{p}</span>
                  </label>
                ))}
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
                    <Checkbox data-testid={`risk-${r.split(" ")[0].toLowerCase()}`} checked={risks.includes(r)} onCheckedChange={() => toggle(risks, setRisks, r)} />
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
            <div className="space-y-4" data-testid="onboarding-step-review">
              <h2 className="text-lg font-heading font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-emerald-500" /> Ready to establish {currentClient?.name}'s program</h2>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="border border-slate-200 rounded-md p-3">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500">Policies</div>
                  <div className="text-2xl font-heading">{policies.length}</div>
                </div>
                <div className="border border-slate-200 rounded-md p-3">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500">Risks</div>
                  <div className="text-2xl font-heading">{risks.length}</div>
                </div>
                <div className="border border-slate-200 rounded-md p-3">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500">Reviews</div>
                  <div className="text-2xl font-heading">{reviews.length}</div>
                </div>
              </div>
              <p className="text-xs text-slate-500">These records will be created in <span className="font-medium text-slate-700">{currentClient?.name}</span>.</p>
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
