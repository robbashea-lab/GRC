import PageHeader from "@/components/PageHeader";
import { ShieldCheck, Info } from "lucide-react";

const ROLES = [
  { key: "super_admin", label: "Super Admin", scope: "Platform-wide", detail: "Full read/write across every tenant, Administration, and audit log." },
  { key: "platform_admin", label: "Platform Admin", scope: "Assigned clients", detail: "Manages assigned client portfolios, runs onboarding, verifies policies, and configures platform settings within their scope." },
  { key: "client_contributor", label: "Client Contributor", scope: "Their tenant", detail: "Creates and edits records within their tenant. Cannot access Administration." },
  { key: "client_readonly", label: "Client Read-Only", scope: "Their tenant", detail: "Read-only view of their tenant. Cannot modify data." },
];
const CAPS = [
  ["Manage platform users & roles", ["super_admin"]],
  ["View platform audit log", ["super_admin", "platform_admin"]],
  ["Manage all client tenants", ["super_admin"]],
  ["Verify policies (Reported to Verified)", ["super_admin", "platform_admin"]],
  ["Run onboarding wizard", ["super_admin", "platform_admin", "client_contributor"]],
  ["Create/edit records in tenant", ["super_admin", "platform_admin", "client_contributor"]],
  ["Approve or reject policies", ["super_admin", "platform_admin"]],
  ["Read tenant records", ["super_admin", "platform_admin", "client_contributor", "client_readonly"]],
];

export default function AdminRoles() {
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Roles & Permissions" subtitle="Role-based access model applied across the platform and every client tenant." />
      <div className="px-8 py-6 max-w-5xl space-y-8">
        <div className="rounded-md border border-semantic-info-border bg-semantic-info-bg p-3 text-xs text-semantic-info flex items-start gap-2" data-testid="admin-roles-note">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>Roles are currently fixed. Fine-grained per-role permission editing is on the roadmap - this page documents the effective policy in production today.</div>
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
          <h2 className="text-sm font-semibold text-ink-primary mb-2">Capability matrix</h2>
          <div className="rounded-md border border-line overflow-hidden bg-surface-card">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle text-[10px] font-mono uppercase tracking-widest text-ink-secondary border-b border-line">
                <tr><th className="tbl-cell text-left">Capability</th>{ROLES.map((r) => <th key={r.key} className="tbl-cell text-center">{r.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {CAPS.map(([cap, allowed]) => (
                  <tr key={cap}>
                    <td className="tbl-cell text-ink-primary">{cap}</td>
                    {ROLES.map((r) => (
                      <td key={r.key} className="tbl-cell text-center">
                        {allowed.includes(r.key) ? <span className="text-semantic-success font-bold">Yes</span> : <span className="text-slate-300">-</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
