import PageHeader from "@/components/PageHeader";
import { ShieldCheck, Info } from "lucide-react";

import { PLANNED_ROLES as ROLES, PLANNED_CAPABILITIES as CAPS, FUTURE_CLIENT_APPROVER } from "@/lib/plannedRoleModel";

export default function AdminRoles() {
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Roles & Permissions" subtitle="Role families, client scope, and server-side authorization boundaries." />
      <div className="page-gutter py-6 max-w-5xl space-y-8">
        <div className="rounded-md border border-semantic-info-border bg-semantic-info-bg p-3 text-xs text-semantic-info flex items-start gap-2" data-testid="admin-roles-note">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>Server-enforced role contract. This page explains permissions; it does not edit grants. Every operation also requires authorized client scope and the applicable record/workflow checks.</div>
        </div>
        <section data-testid="admin-roles-grid" className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ROLES.map((r) => (
            <div key={r.key} className="rounded-md border border-line bg-surface-card p-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-md bg-surface-subtle border border-line flex items-center justify-center"><ShieldCheck className="h-4 w-4 text-ink-secondary" /></div>
                <div>
                  <div className="text-sm font-semibold text-ink-primary">{r.label}</div>
                  <div className="text-xs font-mono uppercase tracking-widest text-ink-help">{r.scope}</div>
                  <p className="text-xs text-ink-secondary mt-1.5">{r.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </section>
        <section data-testid="admin-roles-matrix">
          <h2 className="text-sm font-semibold text-ink-primary mb-2">Capability matrix</h2>
          <div className="register-table-frame rounded-md border border-line overflow-x-auto bg-surface-card">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle text-xs font-mono uppercase tracking-widest text-ink-secondary border-b border-line">
                <tr><th className="tbl-cell text-left">Capability</th>{ROLES.map((r) => <th key={r.key} className="tbl-cell text-center">{r.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
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
          <h2 className="text-sm font-semibold text-ink-primary">Trust boundaries</h2>
          <p>Only Platform Owners have global client scope. An empty service-provider assignment list grants no client access. Providers cannot create or manage internal administrator accounts.</p>
          <p>Client managers coordinate permitted operations and assign existing client users. Contributors work assigned records. Limited assignment never permits changing another user's role or client access.</p>
          <p>Read-only users cannot approve, upload or modify business records, even when named as a business approver. External auditor access requires a future explicit content-grant model and is not active.</p>
          <p>History locks, optimistic concurrency and separation-of-duties checks apply in addition to role permissions. No role grants arbitrary audit-history deletion or bypasses record integrity.</p>
        </section>
        <section className="rounded-md border border-line bg-surface-card p-4 space-y-2" data-testid="future-client-approver">
          <h2 className="text-sm font-semibold text-ink-primary">{FUTURE_CLIENT_APPROVER.label} · Future</h2>
          <p className="text-xs text-ink-secondary">{FUTURE_CLIENT_APPROVER.detail}</p>
          <p className="text-xs text-ink-secondary">Reserved capabilities cover policy approval, risk acceptance, exception decisions, closure approval, and review sign-off. This role is not active or assignable.</p>
        </section>
        <section className="space-y-3 text-xs text-ink-secondary" data-testid="current-effective-permissions">
          <h2 className="text-sm font-semibold text-ink-primary">Current Effective Permissions</h2>
          <p>Persisted role IDs are retained. No accounts are automatically promoted or assigned additional clients. The backend checks role, tenant scope and record permissions independently of browser state.</p>
          <p><code>super_admin</code> maps to Platform Owner; <code>platform_admin</code> to Service Provider GRC Administrator; <code>client_grc_manager</code> to Client GRC Manager. Contributor and read-only IDs remain unchanged.</p>
          <p>Demo simulation is synthetic and is not proof of real authentication or tenant isolation. Production-like staging validation and independent penetration testing remain required.</p>
        </section>
      </div>
    </div>
  );
}
