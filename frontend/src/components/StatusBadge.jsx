const MAP = {
  // reviews
  planned: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  blocked: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
  // findings/tasks
  open: "bg-red-50 text-red-700 border-red-200",
  in_remediation: "bg-amber-50 text-amber-700 border-amber-200",
  remediated: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-slate-100 text-slate-500 border-slate-200",
  accepted: "bg-violet-50 text-violet-700 border-violet-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  // severity/criticality
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-blue-50 text-blue-700 border-blue-200",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-red-50 text-red-700 border-red-200",
  // risks
  identified: "bg-slate-100 text-slate-700 border-slate-200",
  assessed: "bg-blue-50 text-blue-700 border-blue-200",
  treated: "bg-emerald-50 text-emerald-700 border-emerald-200",
  // policies
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  in_review: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  retired: "bg-slate-100 text-slate-500 border-slate-200",
  // vendors
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  under_review: "bg-amber-50 text-amber-700 border-amber-200",
  terminated: "bg-slate-100 text-slate-500 border-slate-200",
};

export default function StatusBadge({ value, testid }) {
  if (!value) return null;
  const cls = MAP[value] || "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      data-testid={testid || `badge-${value}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {String(value).replace(/_/g, " ")}
    </span>
  );
}
