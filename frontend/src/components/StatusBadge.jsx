// Semantic status mapping — text label ALWAYS included; color only reinforces meaning.
// Buckets: critical | high | moderate | duesoon | success | info | neutral
const TONE_BY_STATUS = {
  // Reviews
  upcoming: "info",
  planned: "neutral",
  in_progress: "info",
  blocked: "moderate",
  completed: "success",
  overdue: "critical",
  cancelled: "neutral",
  // Findings / Tasks
  open: "high",
  in_remediation: "moderate",
  remediated: "success",
  closed: "neutral",
  accepted: "info",
  done: "success",
  // Severity / criticality
  low: "neutral",
  medium: "info",
  high: "high",
  critical: "critical",
  // Risk lifecycle
  identified: "neutral",
  assessed: "info",
  treated: "success",
  // Policy lifecycle
  draft: "neutral",
  in_review: "info",
  approved: "success",
  retired: "neutral",
  // Vendor lifecycle
  active: "success",
  under_review: "info",
  terminated: "neutral",
  // Exceptions
  requested: "info",
  expired: "moderate",
  revoked: "neutral",
};

const CLASS_BY_TONE = {
  critical: "pill pill-critical",
  high: "pill pill-high",
  moderate: "pill pill-moderate",
  duesoon: "pill pill-duesoon",
  success: "pill pill-success",
  info: "pill pill-info",
  neutral: "pill pill-neutral",
};

export function toneFor(value) {
  return TONE_BY_STATUS[value] || "neutral";
}

export default function StatusBadge({ value, tone, testid }) {
  if (!value) return null;
  const bucket = tone || toneFor(value);
  const cls = CLASS_BY_TONE[bucket] || CLASS_BY_TONE.neutral;
  const label = String(value).replace(/_/g, " ");
  return (
    <span
      data-testid={testid || `badge-${value}`}
      className={cls}
    >
      {label}
    </span>
  );
}
