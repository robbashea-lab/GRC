import PageHeader from "@/components/PageHeader";
import { Building2, ChevronDown, FileText, KeyRound, Lock, ShieldCheck, Users } from "lucide-react";

import { PLANNED_ROLES as ROLES, PLANNED_CAPABILITIES as CAPS } from "@/lib/plannedRoleModel";

const ROLE_ICONS = {
  platform_owner: ShieldCheck,
  platform_administrator: Building2,
  client_grc_manager: Users,
  client_contributor: FileText,
  client_read_only: Lock,
};
const PERMISSION_CLASSES = {Yes: "admin-permission-yes", No: "admin-permission-no", Limited: "admin-permission-limited"};

export default function AdminRoles() {
  return (
    <div className="admin-page admin-roles-page">
      <PageHeader eyebrow="Administration" title="Roles & Permissions" subtitle="Role families, client scope, and server-side authorization boundaries." />
      <div className="admin-body">
        <div className="admin-notice" data-testid="admin-roles-note">
          <ShieldCheck aria-hidden="true" />
          <div><strong>Server-enforced role contract.</strong> This page explains permissions; it does not edit grants. Every operation also requires authorized client scope and the applicable record/workflow checks.</div>
        </div>
        <section data-testid="admin-roles-grid" className="admin-role-grid" aria-label="Role families">
          {ROLES.map((r) => {
            const Icon = ROLE_ICONS[r.key] || ShieldCheck;
            return <article key={r.key} className="admin-role-card">
              <div className="admin-tile-icon"><Icon aria-hidden="true" /></div>
              <div>
                <h3>{r.label}</h3>
                <span className="admin-role-scope">{r.scope}</span>
                <p>{r.detail}</p>
              </div>
            </article>;
          })}
        </section>
        <section data-testid="admin-roles-matrix" className="admin-panel">
          <div className="admin-panel-head">
            <div><h2>Capability matrix</h2><p>Capabilities apply within the role's authorized scope.</p></div>
            <span className="admin-readonly-badge"><Lock aria-hidden="true" />Read-only reference</span>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table admin-matrix">
              <thead>
                <tr><th scope="col">Capability</th>{ROLES.map((r) => <th key={r.key} scope="col">{r.label}</th>)}</tr>
              </thead>
              <tbody>
                {CAPS.map(({ label, roles }) => (
                  <tr key={label}>
                    <td>{label}</td>
                    {ROLES.map((r) => (
                      <td key={r.key}>
                        <span className={PERMISSION_CLASSES[roles[r.key]] || "admin-permission-scope"}>{roles[r.key]}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <details className="admin-details" data-testid="role-trust-boundaries">
          <summary><ShieldCheck aria-hidden="true" /><span>Trust boundaries</span><ChevronDown aria-hidden="true" /></summary>
          <div className="admin-details-content">
            <p>Super Admins have global client scope. Service-provider administrators may access all clients only with an explicit all-client entitlement. An empty assignment list grants no access. Providers cannot create or manage internal administrator accounts.</p>
            <p>Client managers coordinate permitted operations and assign existing client users. Contributors work assigned records. Limited assignment never permits changing another user's role or client access.</p>
            <p>Read-only users cannot approve, upload or modify business records, even when named as a business approver.</p>
            <p>History locks, optimistic concurrency and separation-of-duties checks apply in addition to role permissions. No role grants arbitrary audit-history deletion or bypasses record integrity.</p>
          </div>
        </details>
        <details className="admin-details" data-testid="current-effective-permissions">
          <summary><KeyRound aria-hidden="true" /><span>Current Effective Permissions</span><ChevronDown aria-hidden="true" /></summary>
          <div className="admin-details-content">
            <p>Persisted role IDs are retained. No accounts are automatically promoted or assigned additional clients. The backend checks role, tenant scope and record permissions independently of browser state.</p>
            <p><code>super_admin</code> maps to Platform Owner; <code>platform_admin</code> to Service Provider GRC Administrator; <code>client_grc_manager</code> to Client GRC Manager. Contributor and read-only IDs remain unchanged.</p>
          </div>
        </details>
      </div>
    </div>
  );
}
