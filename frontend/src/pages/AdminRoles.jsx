import PageHeader from "@/components/PageHeader";
import { ShieldCheck, Info } from "lucide-react";

import { PLANNED_ROLES as ROLES, PLANNED_CAPABILITIES as CAPS, FUTURE_CLIENT_APPROVER } from "@/lib/plannedRoleModel";

export default function AdminRoles() {
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Roles & Permissions" subtitle="Planned roles, trust boundaries, and capabilities for the iVenture GRC platform." />
      <div className="px-8 py-6 max-w-5xl space-y-8">
        <div className="rounded-md border border-semantic-info-border bg-semantic-info-bg p-3 text-xs text-semantic-info flex items-start gap-2" data-testid="admin-roles-note">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>Planned / Defined Role Model — not yet enforced. These definitions do not change current effective permissions, user assignments, or sign-in access. Fine-grained RBAC will be implemented separately.</div>
        </div>
        <section data-testid="admin-roles-grid" className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ROLES.map((r) => (
            <div key={r.key} className="rounded-md border border-line bg-surface-card p-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-md bg-surface-subtle border border-line flex items-center justify-center"><ShieldCheck className="h-4 w-4 text-brand-charcoal" /></div>
                <div>
                  <div className="text-sm font-semibold text-ink-primary">{r.label}</div>
                  <div className="text-[11px] font-mono uppercase tracking-widest text-ink-help">{r.scope}</div>
                  <p className="text-xs text-ink-secondary mt-1.5">{r.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </section>
        <section data-testid="admin-roles-matrix">
          <h2 className="text-sm font-semibold text-ink-primary mb-2">Planned capability matrix</h2>
          <div className="rounded-md border border-line overflow-x-auto bg-surface-card">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle text-[10px] font-mono uppercase tracking-widest text-ink-secondary border-b border-line">
                <tr><th className="tbl-cell text-left">Capability</th>{ROLES.map((r) => <th key={r.key} className="tbl-cell text-center">{r.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {CAPS.map(({ label, roles }) => (
                  <tr key={label}>
                    <td className="tbl-cell text-ink-primary">{label}</td>
                    {ROLES.map((r) => (
                      <td key={r.key} className="tbl-cell text-center">
                        <span className={roles[r.key] === "No" ? "text-ink-help" : "text-ink-primary"}>{roles[r.key]}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="space-y-3 text-xs text-ink-secondary" data-testid="role-trust-boundaries">
          <h2 className="text-sm font-semibold text-ink-primary">Intended trust boundaries</h2>
          <p>Platform Owner is reserved for a small number of trusted iVenture leaders. Permanent client deletion is an exceptional future operation requiring safeguards; archive is the normal lifecycle action and preserves historical records.</p>
          <p>Platform Administrators handle routine operations. They may assign Client Contributor and Client Read Only, but cannot grant equal or greater authority or modify Platform Owner accounts without an explicit, future owner-authorized delegation. They cannot change unrestricted role definitions, platform security, or delete audit history.</p>
          <p>Limited means separately authorized routine client-profile fields for GRC Team Members, archive/restore for Platform Administrators, and only the two listed client-level roles for administrator role assignment. It never implies permission to delete tenants or escalate authority.</p>
          <p>GRC Team Members work only in assigned clients. Client Contributors work only on permitted records in their own organization. Client Read Only is for executives, auditors, observers, and other stakeholders who need visibility without modification rights.</p>
          <p>All intended grants remain subject to server-side tenant scope, record permissions, and workflow rules. Approval, risk acceptance, and closure decisions require explicit governance authority and any separation-of-duties checks; normal contribution does not confer approval authority.</p>
        </section>
        <section className="rounded-md border border-line bg-surface-card p-4 space-y-2" data-testid="future-client-approver">
          <h2 className="text-sm font-semibold text-ink-primary">{FUTURE_CLIENT_APPROVER.label} · Future</h2>
          <p className="text-xs text-ink-secondary">{FUTURE_CLIENT_APPROVER.detail}</p>
          <p className="text-xs text-ink-secondary">Reserved capabilities cover policy approval, risk acceptance, exception decisions, closure approval, and review sign-off. This role is not active or assignable.</p>
        </section>
        <section className="space-y-3 text-xs text-ink-secondary" data-testid="current-effective-permissions">
          <h2 className="text-sm font-semibold text-ink-primary">Current Effective Permissions</h2>
          <p>Existing fixed role IDs and backend endpoint checks continue to control the connected application. The planned restrictions above are not a claim about current enforcement. The chat demo uses a local Preview Admin entry and sample data; it does not validate real authentication or RBAC.</p>
          <p>Compatibility mapping for later migration: <code>super_admin</code> → Platform Owner; <code>platform_admin</code> → Platform Administrator; <code>client_contributor</code> → Client Contributor; <code>client_readonly</code> → Client Read Only. These are design mappings only. No stored IDs or assignments have changed. GRC Team Member has no current runtime mapping.</p>
          <p>The current implementation still gives both internal admin roles broad client access and client-management rights. The narrower planned administrator and contributor boundaries require a separate enforcement review before rollout.</p>
        </section>
      </div>
    </div>
  );
}
