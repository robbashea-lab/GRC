import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { formatError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Search, Download, ChevronLeft, ChevronRight, X } from "lucide-react";

// User-facing action buckets (mirrors _AUDIT_ACTION_BUCKETS on the backend).
const ACTION_OPTIONS = [
  { value: "__all__", label: "All actions" },
  { value: "create", label: "Created" },
  { value: "update", label: "Updated" },
  { value: "delete", label: "Deleted" },
  { value: "assign", label: "Assigned" },
  { value: "approve", label: "Approved" },
  { value: "complete", label: "Completed" },
  { value: "upload", label: "Uploaded" },
  { value: "invite", label: "Invited" },
  { value: "auth", label: "Authentication" },
  { value: "permission", label: "Permission Changed" },
  { value: "onboarding", label: "Onboarding" },
];

const ENTITY_LABELS = {
  client: "Client", user: "User", contact: "Contact", review: "Review",
  finding: "Finding", risk: "Risk", policy: "Policy", vendor: "Vendor",
  requirement: "Requirement", evidence: "Evidence", task: "Action Item",
  onboarding: "Onboarding", auth: "Authentication", role: "Role / Permission",
  session: "Session", assessment: "Assessment", exception: "Exception",
  "audit-log": "Audit Export", "board-report": "Board Report",
};

// Raw-code → display label. Falls back to Title Case of the raw code.
const ACTION_LABEL = {
  create: "Created", update: "Updated", delete: "Deleted",
  invite: "User Invited", "invite-contact": "Contact Invited",
  "resend_invite": "Invite Resent", "role_change": "Role Changed",
  "client_access_change": "Client Access Changed",
  disable: "User Disabled", enable: "User Enabled",
  login: "Signed In", logout: "Signed Out",
  password_change: "Password Changed", password_reset: "Password Reset",
  "onboarding-response": "Onboarding Response",
  "onboarding-contact": "Onboarding Contact Recorded",
  "onboarding-assessment": "Onboarding Assessment Recorded",
  "onboarding-known-issue": "Onboarding Known Issue Recorded",
  "onboarding-review": "Onboarding Review Scheduled",
  "onboarding-complete": "Onboarding Completed",
  baseline: "Baseline Seeded",
  accept: "Risk Accepted", verify: "Policy Verified",
  "mark-reviewed": "Marked Reviewed",
  "raise-risk": "Risk Raised from Finding",
  "schedule-review": "Vendor Review Scheduled",
  approve: "Approved",
  complete: "Completed",
  "review-complete": "Review Completed",
  "policy-approve": "Policy Approved",
  "evidence-upload": "Evidence Uploaded",
  upload: "Uploaded",
  export: "Exported",
  generate: "Report Generated",
  bulk: "Bulk Action",
  "bulk-assign": "Bulk Assigned",
};

function humanAction(raw) {
  if (!raw) return "—";
  if (ACTION_LABEL[raw]) return ACTION_LABEL[raw];
  return String(raw).replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanEntity(raw) {
  if (!raw) return "—";
  return ENTITY_LABELS[raw] || String(raw).replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const DATE_PRESETS = [
  { value: "__any__", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

function computeRange(preset, customStart, customEnd) {
  const now = new Date();
  if (preset === "__any__") return { start: "", end: "" };
  if (preset === "custom") return { start: customStart || "", end: customEnd || "" };
  if (preset === "today") {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    return { start: s.toISOString(), end: now.toISOString() };
  }
  const days = parseInt(preset, 10);
  if (Number.isFinite(days)) {
    const s = new Date(now); s.setDate(s.getDate() - days); s.setHours(0, 0, 0, 0);
    return { start: s.toISOString(), end: now.toISOString() };
  }
  return { start: "", end: "" };
}

export default function AdminAudit() {
  const [params, setParams] = useSearchParams();
  const initialClient = params.get("client") || "__all__";
  const [clientFilter, setClientFilter] = useState(initialClient);
  const [userFilter, setUserFilter] = useState(params.get("user") || "__all__");
  const [actionFilter, setActionFilter] = useState(params.get("action") || "__all__");
  const [entityFilter, setEntityFilter] = useState(params.get("entity") || "__all__");
  const [datePreset, setDatePreset] = useState(params.get("date") || "30");
  const [customStart, setCustomStart] = useState(params.get("start") || "");
  const [customEnd, setCustomEnd] = useState(params.get("end") || "");
  const [q, setQ] = useState(params.get("q") || "");
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [facets, setFacets] = useState({ clients: [], users: [], entity_types: [] });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Load filter facets once
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/audit-logs/facets");
        setFacets(data || {});
      } catch (e) { toast.error(formatError(e)); }
    })();
  }, []);

  const buildQuery = useCallback(() => {
    const { start, end } = computeRange(datePreset, customStart, customEnd);
    const query = { page, page_size: pageSize };
    if (clientFilter !== "__all__") query.client_id = clientFilter;
    if (userFilter !== "__all__") query.user_id = userFilter;
    if (actionFilter !== "__all__") query.action = actionFilter;
    if (entityFilter !== "__all__") query.entity_type = entityFilter;
    if (start) query.start_date = start;
    if (end) query.end_date = end;
    if (debouncedQ.trim()) query.q = debouncedQ.trim();
    return query;
  }, [clientFilter, userFilter, actionFilter, entityFilter, datePreset, customStart, customEnd, debouncedQ, page]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/audit-logs", { params: buildQuery() });
      setRows(data.items || []);
      setTotal(data.total || 0);
    } catch (e) { toast.error(formatError(e)); setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [buildQuery]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Reset to page 1 whenever filters change.
  useEffect(() => { setPage(1); },
    [clientFilter, userFilter, actionFilter, entityFilter, datePreset, customStart, customEnd, debouncedQ]);

  // Persist filters in URL for shareable/back-nav parity.
  useEffect(() => {
    const next = new URLSearchParams();
    if (clientFilter !== "__all__") next.set("client", clientFilter);
    if (userFilter !== "__all__") next.set("user", userFilter);
    if (actionFilter !== "__all__") next.set("action", actionFilter);
    if (entityFilter !== "__all__") next.set("entity", entityFilter);
    if (datePreset !== "30") next.set("date", datePreset);
    if (datePreset === "custom" && customStart) next.set("start", customStart);
    if (datePreset === "custom" && customEnd) next.set("end", customEnd);
    if (debouncedQ) next.set("q", debouncedQ);
    setParams(next, { replace: true });
  }, [clientFilter, userFilter, actionFilter, entityFilter, datePreset, customStart, customEnd, debouncedQ, setParams]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function exportCsv() {
    try {
      setExporting(true);
      const q = buildQuery();
      delete q.page; delete q.page_size;
      const res = await api.get("/audit-logs/export.csv", { params: q, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url; a.download = "audit-log.csv"; a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (e) { toast.error(formatError(e)); }
    finally { setExporting(false); }
  }

  function resetFilters() {
    setClientFilter("__all__"); setUserFilter("__all__");
    setActionFilter("__all__"); setEntityFilter("__all__");
    setDatePreset("30"); setCustomStart(""); setCustomEnd(""); setQ("");
  }

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (clientFilter !== "__all__") n += 1;
    if (userFilter !== "__all__") n += 1;
    if (actionFilter !== "__all__") n += 1;
    if (entityFilter !== "__all__") n += 1;
    if (datePreset !== "30") n += 1;
    if (debouncedQ) n += 1;
    return n;
  }, [clientFilter, userFilter, actionFilter, entityFilter, datePreset, debouncedQ]);

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Audit Log"
        subtitle="Immutable record of platform and client activity across authorized organizations."
      />
      <div className="px-8 pt-4 pb-2 flex items-center gap-3 flex-wrap" data-testid="audit-filters">
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="h-9 w-56 text-sm" data-testid="audit-filter-client">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All clients</SelectItem>
            <SelectItem value="platform">Platform Activity</SelectItem>
            {(facets.clients || []).map((c) => (
              <SelectItem key={c.client_id} value={c.client_id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="h-9 w-56 text-sm" data-testid="audit-filter-user">
            <SelectValue placeholder="All users" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="__all__">All users</SelectItem>
            {(facets.users || []).map((u) => (
              <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-9 w-44 text-sm" data-testid="audit-filter-action">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="h-9 w-44 text-sm" data-testid="audit-filter-entity">
            <SelectValue placeholder="All entities" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="__all__">All entities</SelectItem>
            {(facets.entity_types || []).map((e) => (
              <SelectItem key={e} value={e}>{humanEntity(e)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={datePreset} onValueChange={setDatePreset}>
          <SelectTrigger className="h-9 w-40 text-sm" data-testid="audit-filter-date">
            <SelectValue placeholder="Last 30 days" />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {datePreset === "custom" && (
          <>
            <Input type="date" value={customStart ? customStart.slice(0, 10) : ""}
              onChange={(e) => setCustomStart(e.target.value ? new Date(e.target.value).toISOString() : "")}
              className="h-9 w-40 text-sm" data-testid="audit-filter-start" />
            <Input type="date" value={customEnd ? customEnd.slice(0, 10) : ""}
              onChange={(e) => setCustomEnd(e.target.value ? new Date(new Date(e.target.value).setHours(23, 59, 59, 999)).toISOString() : "")}
              className="h-9 w-40 text-sm" data-testid="audit-filter-end" />
          </>
        )}

        <div className="relative w-72 ml-auto">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-help" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search action, entity, user, record…"
            className="pl-8 h-9 text-sm" data-testid="audit-search" />
        </div>

        <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting}
          className="h-9" data-testid="audit-export">
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 text-xs" data-testid="audit-reset">
            <X className="h-3.5 w-3.5 mr-1" /> Clear filters
          </Button>
        )}
      </div>

      <div className="px-8 pb-8">
        <div className="text-xs text-ink-help mb-2" data-testid="audit-count">
          {loading ? "Loading…" : `${total.toLocaleString()} event${total === 1 ? "" : "s"}`}
          {total > 0 && ` · Page ${page} of ${totalPages}`}
        </div>
        <div className="bg-surface-card border border-line rounded-lg overflow-hidden" data-testid="audit-table">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-[10px] font-mono uppercase tracking-widest text-ink-secondary border-b border-line">
              <tr>
                <th className="tbl-cell text-left">Date / Time</th>
                <th className="tbl-cell text-left">Client</th>
                <th className="tbl-cell text-left">User</th>
                <th className="tbl-cell text-left">Action</th>
                <th className="tbl-cell text-left">Entity</th>
                <th className="tbl-cell text-left">Record</th>
                <th className="tbl-cell text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (<tr><td colSpan={7} className="tbl-cell text-center text-ink-help py-8">Loading…</td></tr>)}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="tbl-cell text-center text-ink-help py-8">No events match this filter.</td></tr>
              )}
              {!loading && rows.map((r, i) => {
                const isPlatform = !r.client_id;
                return (
                  <tr key={r.log_id || i} className="row-hover cursor-pointer"
                      data-testid={`audit-row-${i}`}
                      onClick={() => setSelected(r)}>
                    <td className="tbl-cell text-xs font-mono text-ink-help whitespace-nowrap">
                      {r.at ? new Date(r.at).toLocaleString() : "—"}
                    </td>
                    <td className="tbl-cell text-xs">
                      {isPlatform ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full border border-line text-[10px] uppercase tracking-widest text-ink-secondary bg-surface-subtle">Platform</span>
                      ) : (
                        <span className="text-ink-primary">{r.client_name || r.client_id}</span>
                      )}
                    </td>
                    <td className="tbl-cell text-xs">
                      <div className="text-ink-primary">{r.user_name || r.user_email || "—"}</div>
                      {r.user_email && r.user_name && r.user_email !== r.user_name && (
                        <div className="text-[10px] text-ink-help">{r.user_email}</div>
                      )}
                    </td>
                    <td className="tbl-cell text-xs text-ink-primary">{humanAction(r.action)}</td>
                    <td className="tbl-cell text-xs text-ink-secondary">{humanEntity(r.entity_type)}</td>
                    <td className="tbl-cell text-xs">
                      <div className="text-ink-primary truncate max-w-[220px]">{r?.meta?.title || r?.meta?.name || r.entity_id || "—"}</div>
                      <div className="text-[10px] text-ink-help font-mono truncate max-w-[220px]">{r.entity_id}</div>
                    </td>
                    <td className="tbl-cell text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={(e) => { e.stopPropagation(); setSelected(r); }}
                        data-testid={`audit-view-${i}`}>View</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-ink-help">
          <div>{total > 0 && `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total.toLocaleString()}`}</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="audit-prev">
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <span className="font-mono">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-8" disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))} data-testid="audit-next">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <AuditDetailDrawer event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function DetailRow({ label, children, mono = false, testid }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-line last:border-0">
      <div className="text-[10px] uppercase tracking-widest font-mono text-ink-help pt-1">{label}</div>
      <div className={`col-span-2 text-sm ${mono ? "font-mono text-ink-secondary" : "text-ink-primary"} break-words`} data-testid={testid}>
        {children}
      </div>
    </div>
  );
}

function AuditDetailDrawer({ event, onClose }) {
  if (!event) return null;
  const isPlatform = !event.client_id;
  const meta = event.meta || {};
  const prevVal = meta.prev ?? meta.previous ?? meta.before;
  const newVal = meta.next ?? meta.new ?? meta.after;
  const restMeta = Object.fromEntries(
    Object.entries(meta).filter(([k]) => !["prev", "previous", "before", "next", "new", "after"].includes(k))
  );

  return (
    <Sheet open={!!event} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto" data-testid="audit-detail">
        <SheetHeader>
          <SheetTitle className="text-base">{humanAction(event.action)}</SheetTitle>
          <SheetDescription className="text-xs text-ink-help">
            Detailed record of a single audit event, including tenant, actor, and change payload.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <DetailRow label="Event" testid="audit-detail-event">{humanAction(event.action)}</DetailRow>
          <DetailRow label="Raw code" mono testid="audit-detail-raw">{event.action || "—"}</DetailRow>
          <DetailRow label="Date / Time" mono testid="audit-detail-at">
            {event.at ? new Date(event.at).toLocaleString() : "—"}
          </DetailRow>
          <DetailRow label="Client" testid="audit-detail-client">
            {isPlatform ? (
              <span className="inline-flex px-2 py-0.5 rounded-full border border-line text-[10px] uppercase tracking-widest text-ink-secondary bg-surface-subtle">Platform</span>
            ) : (event.client_name || event.client_id)}
          </DetailRow>
          {!isPlatform && (
            <DetailRow label="Client ID" mono testid="audit-detail-client-id">{event.client_id}</DetailRow>
          )}
          <DetailRow label="Performed by" testid="audit-detail-user">
            {event.user_name || event.user_email || "—"}
            {event.user_email && event.user_name && event.user_email !== event.user_name && (
              <div className="text-[11px] text-ink-help">{event.user_email}</div>
            )}
          </DetailRow>
          <DetailRow label="Entity" testid="audit-detail-entity">{humanEntity(event.entity_type)}</DetailRow>
          <DetailRow label="Entity ID" mono testid="audit-detail-entity-id">{event.entity_id || "—"}</DetailRow>
          {prevVal !== undefined && (
            <DetailRow label="Previous value" mono testid="audit-detail-prev">
              <pre className="whitespace-pre-wrap text-xs bg-surface-subtle border border-line rounded-md p-2">{JSON.stringify(prevVal, null, 2)}</pre>
            </DetailRow>
          )}
          {newVal !== undefined && (
            <DetailRow label="New value" mono testid="audit-detail-new">
              <pre className="whitespace-pre-wrap text-xs bg-surface-subtle border border-line rounded-md p-2">{JSON.stringify(newVal, null, 2)}</pre>
            </DetailRow>
          )}
          {Object.keys(restMeta).length > 0 && (
            <DetailRow label="Metadata" mono testid="audit-detail-meta">
              <pre className="whitespace-pre-wrap text-xs bg-surface-subtle border border-line rounded-md p-2">{JSON.stringify(restMeta, null, 2)}</pre>
            </DetailRow>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
