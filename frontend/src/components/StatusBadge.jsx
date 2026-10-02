// Semantic status mapping — the text label is ALWAYS shown; color only reinforces it, and sparingly:
//   red (critical)  overdue, critical — same shared shape, with a red label and dot
//   amber           needs attention: high severity, due soon, pending validation, gaps to confirm
//   green (success) confirmed outcomes: completed, approved, verified, validated
//   blue (info)     work in progress
//   gray (neutral)  everything else: open, active, scheduled, draft, closed, not applicable
const TONE_BY_STATUS = {
  // Reviews
  upcoming: "neutral",
  planned: "neutral",
  needs_scheduling: "duesoon",
  in_progress: "info",
  blocked: "moderate",
  completed: "success",
  overdue: "critical",
  cancelled: "neutral",
  // Findings / Tasks
  open: "neutral",
  in_remediation: "info",
  remediated: "moderate",
  closed: "neutral",
  accepted: "accepted",
  done: "success",
  // Severity / criticality / priority
  low: "neutral",
  medium: "neutral",
  moderate: "neutral",
  high: "high",
  critical: "critical",
  immediate: "critical",
  // Risk lifecycle
  identified: "neutral",
  assessed: "neutral",
  in_treatment: "info",
  treated: "success",
  // Requirement applicability
  applicable: "neutral",
  potentially_applicable: "moderate",
  under_review: "info",
  // Contact/assessment status
  reported: "neutral",
  verified: "success",
  // Policy lifecycle
  draft: "neutral",
  in_review: "info",
  approved: "success",
  retired: "neutral",
  needs_verification: "moderate",
  needs_creation: "moderate",
  // Policy presence (client-reported vs verified)
  reported_existing: "neutral",
  verified_existing: "success",
  reported_missing: "moderate",
  needs_confirmation: "moderate",
  not_applicable: "neutral",
  // Vendor / contact lifecycle
  active: "neutral",
  inactive: "neutral",
  onboarding: "info",
  offboarding: "neutral",
  terminated: "neutral",
  suspended: "moderate",
  // Exceptions
  requested: "info",
  expired: "moderate",
  revoked: "neutral",
};

const CLASS_BY_TONE = {
  accepted: "pill pill-accepted",
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

export function StatusPill({ className = '', children, ...props }) {
  return <span className={`pill ${className}`} {...props}>{children}</span>;
}

export default function StatusBadge({ value, tone, testid, label: override }) {
  if (!value) return null;
  const bucket = tone || toneFor(value);
  const cls = CLASS_BY_TONE[bucket] || CLASS_BY_TONE.neutral;
  const label = override || (value === "needs_scheduling" ? "Needs Scheduling" : value === "remediated" ? "Pending validation" : String(value).replace(/_/g, " "));
  return (
    <StatusPill
      data-status={value}
      data-testid={testid || `badge-${value}`}
      className={cls}
    >
      {label}
    </StatusPill>
  );
}

// Severity, priority and criticality share one scale: Critical (red), High (amber), then gray.
const SEVERITY_LABEL = { immediate: "Immediate", critical: "Critical", high: "High", medium: "Medium", moderate: "Moderate", low: "Low" };
export function SeverityBadge({ value, label, testid }) {
  if (!value) return <span className="register-empty">Not assessed</span>;
  const key = String(value).toLowerCase();
  return <StatusBadge value={key} label={label || SEVERITY_LABEL[key] || value} testid={testid || `severity-${key}`} />;
}
