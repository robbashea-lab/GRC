import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ShieldCheck,ScrollText,FileWarning,Umbrella,Layers} from 'lucide-react';
import api,{formatError} from '@/lib/api';
import {toast} from 'sonner';

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

export default function ComplianceProfile({ clientId }) {
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
          <Link to="/onboarding" className="text-link underline">Complete Compliance & Requirements onboarding</Link>{" "}
          to populate this profile.
        </div>
      ) : (
        <div className="space-y-4">
          {buckets.map((b) => (
            <div key={b.id} className="border border-line rounded-md bg-surface-card" data-testid={`compliance-bucket-${b.id}`}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
                <div className="flex items-center gap-3">
                  <b.icon className="h-4 w-4 text-link" />
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
                        className={`text-xs px-2 py-0.5 rounded-full border ${APPLICABILITY_TONE[r.applicability] || APPLICABILITY_TONE.needs_review}`}
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
