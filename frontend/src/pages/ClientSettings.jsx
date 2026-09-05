import { useEffect, useState } from "react";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Building2, ShieldCheck, ScrollText, FileWarning, Umbrella, Layers } from "lucide-react";
import { UsersTable } from "@/pages/PlatformAdmin";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import api, { formatError } from "@/lib/api";
import { toast } from "sonner";

// Buckets we surface in the Compliance Profile. We fetch the raw Requirements
// register and group by category (no new backend model — pure UI grouping).
const COMPLIANCE_BUCKETS = [
  {
    id: "assurance",
    label: "SOC 2 · ISO · CMMC · PCI",
    hint: "Assurance & certification frameworks",
    icon: ShieldCheck,
    match: (cat) => /assurance|certif|soc\s*2|iso|cmmc|pci/i.test(cat || ""),
  },
  {
    id: "legal",
    label: "HIPAA & Privacy",
    hint: "Legal, regulatory, and privacy requirements",
    icon: ScrollText,
    match: (cat) => /legal|regulat|privacy|hipaa|gdpr/i.test(cat || ""),
  },
  {
    id: "contractual",
    label: "Contractual",
    hint: "Customer & third-party contractual security obligations",
    icon: FileWarning,
    match: (cat) => /contract/i.test(cat || ""),
  },
  {
    id: "insurance",
    label: "Insurance",
    hint: "Cyber insurance and related coverage requirements",
    icon: Umbrella,
    match: (cat) => /insur/i.test(cat || ""),
  },
  {
    id: "other",
    label: "Other Obligations",
    hint: "Industry-specific and internal governance requirements",
    icon: Layers,
    match: () => true, // catch-all bucket, evaluated last
  },
];

const APPLICABILITY_TONE = {
  applicable: "bg-semantic-success-bg text-semantic-success border-semantic-success-border",
  potentially_applicable: "bg-semantic-info-bg text-semantic-info border-semantic-info-border",
  needs_review: "bg-semantic-duesoon-bg text-semantic-duesoon-text border-semantic-duesoon-border",
  not_applicable: "bg-surface-subtle text-ink-secondary border-line",
};

const APPLICABILITY_LABEL = {
  applicable: "Applicable",
  potentially_applicable: "Potentially applicable",
  needs_review: "Needs review",
  not_applicable: "Not applicable",
};

function bucketize(requirements) {
  const buckets = COMPLIANCE_BUCKETS.map((b) => ({ ...b, items: [] }));
  const other = buckets[buckets.length - 1];
  for (const r of requirements) {
    const cat = r.category || "";
    let placed = false;
    for (let i = 0; i < buckets.length - 1; i += 1) {
      if (buckets[i].match(cat)) {
        buckets[i].items.push(r);
        placed = true;
        break;
      }
    }
    if (!placed) other.items.push(r);
  }
  return buckets;
}

function ComplianceProfile({ clientId }) {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    api.get("/requirements", { params: { client_id: clientId } })
      .then(({ data }) => setRequirements(Array.isArray(data) ? data : []))
      .catch((e) => toast.error(formatError(e)))
      .finally(() => setLoading(false));
  }, [clientId]);

  const buckets = bucketize(requirements);
  const activeCount = requirements.filter((r) => r.applicability === "applicable").length;
  const reviewCount = requirements.filter((r) => ["needs_review", "potentially_applicable"].includes(r.applicability)).length;

  return (
    <div className="space-y-6" data-testid="compliance-profile">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="border border-line rounded-md bg-surface-card p-4" data-testid="compliance-summary-total">
          <div className="text-xs uppercase tracking-widest text-ink-help">Total requirements</div>
          <div className="mt-1 text-2xl font-medium text-ink-primary">{requirements.length}</div>
        </div>
        <div className="border border-line rounded-md bg-surface-card p-4" data-testid="compliance-summary-applicable">
          <div className="text-xs uppercase tracking-widest text-ink-help">Applicable</div>
          <div className="mt-1 text-2xl font-medium text-semantic-success">{activeCount}</div>
        </div>
        <div className="border border-line rounded-md bg-surface-card p-4" data-testid="compliance-summary-review">
          <div className="text-xs uppercase tracking-widest text-ink-help">Needs review</div>
          <div className="mt-1 text-2xl font-medium text-semantic-duesoon-text">{reviewCount}</div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-ink-secondary p-6 border border-dashed border-line rounded-md">
          Loading compliance profile…
        </div>
      ) : requirements.length === 0 ? (
        <div className="border border-dashed border-line rounded-md p-6 text-sm text-ink-secondary" data-testid="compliance-empty">
          No requirements captured yet.{" "}
          <Link to="/onboarding" className="text-brand-charcoal underline">Complete Compliance & Requirements onboarding</Link>{" "}
          to populate this profile.
        </div>
      ) : (
        <div className="space-y-4">
          {buckets.map((b) => (
            <div key={b.id} className="border border-line rounded-md bg-surface-card" data-testid={`compliance-bucket-${b.id}`}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
                <div className="flex items-center gap-3">
                  <b.icon className="h-4 w-4 text-brand-charcoal" />
                  <div>
                    <div className="text-sm font-medium text-ink-primary">{b.label}</div>
                    <div className="text-xs text-ink-help">{b.hint}</div>
                  </div>
                </div>
                <div className="text-xs font-mono text-ink-secondary" data-testid={`compliance-bucket-count-${b.id}`}>
                  {b.items.length}
                </div>
              </div>
              {b.items.length === 0 ? (
                <div className="px-4 py-3 text-xs text-ink-help">No requirements in this category.</div>
              ) : (
                <ul className="divide-y divide-line">
                  {b.items.map((r) => (
                    <li key={r.requirement_id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/requirements?open=${r.requirement_id}`}
                          className="text-sm text-ink-primary hover:underline block truncate"
                        >
                          {r.title}
                        </Link>
                        {r.category ? (
                          <div className="text-xs text-ink-help truncate">{r.category}</div>
                        ) : null}
                      </div>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${APPLICABILITY_TONE[r.applicability] || APPLICABILITY_TONE.needs_review}`}
                      >
                        {APPLICABILITY_LABEL[r.applicability] || r.applicability || "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientSettings() {
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const nav = useNavigate();
  const canManage = ["super_admin", "platform_admin"].includes(user?.role);

  if (!canManage) {
    return (
      <div className="p-8">
        <PageHeader title="Client Settings" subtitle="You need administrator access to manage this client's users and settings." />
      </div>
    );
  }

  if (!currentClientId) {
    return (
      <div>
        <PageHeader title="Client Settings" subtitle="Select a client organization first." />
        <div className="p-8 max-w-xl">
          <Button onClick={() => nav("/clients")}>Open Client Directory</Button>
        </div>
      </div>
    );
  }

  const allowedRoles = user.role === "super_admin"
    ? ["platform_admin", "client_contributor", "client_readonly"]
    : ["client_contributor", "client_readonly"];

  return (
    <div>
      <PageHeader
        eyebrow="Client Settings"
        title={currentClient?.name || "Client"}
        subtitle="Manage users, access, and the compliance profile for this client. The active client determines where every change is scoped — no cross-tenant exposure."
      />
      <div className="px-8 pt-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-line bg-surface-card text-sm text-ink-primary" data-testid="client-settings-tenant">
          <Building2 className="h-3.5 w-3.5 text-ink-secondary" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-ink-help">Active client</span>
          <span className="text-ink-help">·</span>
          <span className="font-medium">{currentClient?.name}</span>
        </div>
      </div>
      <div className="p-8">
        <Tabs defaultValue="users" className="w-full">
          <TabsList data-testid="client-settings-tabs">
            <TabsTrigger value="users" data-testid="tab-users-access">Users &amp; Access</TabsTrigger>
            <TabsTrigger value="compliance" data-testid="tab-compliance-profile">Compliance Profile</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-4">
            <h2 className="text-sm font-medium text-ink-primary mb-3">Users &amp; Access</h2>
            <UsersTable scope="client" clientId={currentClientId} allowedRoles={allowedRoles} />
          </TabsContent>
          <TabsContent value="compliance" className="mt-4">
            <div className="mb-3">
              <h2 className="text-sm font-medium text-ink-primary">Compliance Profile</h2>
              <p className="text-xs text-ink-help">
                Requirements captured during onboarding, grouped by obligation type. Update this
                list from the <Link to="/onboarding" className="underline">Compliance &amp; Requirements onboarding step</Link>{" "}
                or the <Link to="/requirements" className="underline">Requirements register</Link>.
              </p>
            </div>
            <ComplianceProfile clientId={currentClientId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
