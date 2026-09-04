import { useEffect, useState } from "react";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import api, { formatError } from "@/lib/api";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

const STEPS = ["Tenant", "Policies", "Risks", "Reviews", "Review & create"];

export default function Onboarding() {
  const { clients, currentClientId, switchClient } = useOrg();
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState(null);
  const [selectedClient, setSelectedClient] = useState(currentClientId || "");
  const [policies, setPolicies] = useState([]);
  const [risks, setRisks] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const canRun = ["super_admin", "platform_admin", "client_contributor"].includes(user?.role);

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
    if (!selectedClient) { toast.error("Pick a client tenant"); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post("/baseline", { client_id: selectedClient, policies, risks, reviews });
      toast.success(`Baseline created: ${data.created.policies} policies · ${data.created.risks} risks · ${data.created.reviews} reviews`);
      switchClient(selectedClient);
      nav("/");
    } catch (e) {
      toast.error(formatError(e));
    } finally { setSubmitting(false); }
  }

  if (!canRun) {
    return <div className="p-8"><PageHeader title="Baseline Assessment" subtitle="You need contributor access to run this wizard." /></div>;
  }
  if (!templates) return <div className="p-8 text-sm text-slate-500">Loading templates…</div>;

  return (
    <div>
      <PageHeader
        title="Baseline Assessment"
        subtitle="Spin up a starter GRC program for a client — policies, risks and a recurring review calendar in one go."
      />
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
            <div className="space-y-4" data-testid="onboarding-step-tenant">
              <h2 className="text-lg font-heading font-semibold">Which client are we onboarding?</h2>
              <p className="text-sm text-slate-500">The baseline templates below will be created inside this tenant. You can edit or remove anything after.</p>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger data-testid="onboarding-tenant" className="w-96"><SelectValue placeholder="Choose tenant" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.client_id} value={c.client_id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {step === 1 && (
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

          {step === 2 && (
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

          {step === 3 && (
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

          {step === 4 && (
            <div className="space-y-4" data-testid="onboarding-step-review">
              <h2 className="text-lg font-heading font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-emerald-500" /> Ready to create baseline</h2>
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
              <p className="text-xs text-slate-500">Client tenant: <span className="font-medium text-slate-700">{clients.find((c) => c.client_id === selectedClient)?.name}</span></p>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} data-testid="onboarding-back">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !selectedClient} data-testid="onboarding-next">
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={create} disabled={submitting} data-testid="onboarding-create">
                <CheckCircle2 className="h-4 w-4 mr-1" /> {submitting ? "Creating…" : "Create baseline"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
