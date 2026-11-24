import PlatformPageHeading from "@/components/PlatformPageHeading";
import { Building2, ChevronDown, FileText, KeyRound, Lock, ShieldCheck, Users } from "lucide-react";

import { PLANNED_ROLES as ROLES, PLANNED_CAPABILITIES as CAPS, nativeRoleDefinition } from "@/lib/plannedRoleModel";
import {Fragment, useEffect, useState} from 'react';
import './AdminRoleFamilies.css';
import api from '@/lib/api';

const ROLE_ICONS = {
  platform_owner: ShieldCheck,
  platform_administrator: Building2,
  client_grc_manager: Users,
  client_contributor: FileText,
  client_read_only: Lock,
};
const PERMISSION_CLASSES = {Yes: "admin-permission-yes", No: "admin-permission-no", Limited: "admin-permission-limited"};

const roleFamilies = [
  {label:'iVenture team', roles:ROLES.filter(role => ['platform_owner','platform_administrator'].includes(role.key))},
  {label:'Client users', roles:ROLES.filter(role => !['platform_owner','platform_administrator'].includes(role.key))},
];

function capabilityGroup(row) {
  if (row.capabilities.some(key => ['manage_platform_users','view_audit_log'].includes(key))) return 'Platform';
  if (row.capabilities.some(key => ['configure','create_clients','manage_client_users'].includes(key))) return 'Client setup and access';
  return 'Client work';
}

export default function AdminRoles() {
  const [highlight, setHighlight] = useState(null);
  const [users, setUsers] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    api.get('/users', {signal:controller.signal}).then(({data}) => {if (!controller.signal.aborted && Array.isArray(data)) setUsers(data);})
      .catch(() => {if (!controller.signal.aborted) setUsers(null);});
    return () => controller.abort();
  }, []);
  const select = key => setHighlight(previous => previous === key ? null : key);
  return (
    <div className="wrap admin-page admin-roles-page">
      <PlatformPageHeading eyebrow="Administration" title="Roles & Permissions" subtitle="Role families, client scope, and server-side authorization boundaries." />
      <div className="admin-body">
        <div className="callout admin-notice" data-testid="admin-roles-note">
          <ShieldCheck aria-hidden="true" />
          <div><strong>Server-enforced role contract.</strong> This page explains permissions; it does not edit grants. Every operation also requires authorized client scope and the applicable record/workflow checks.</div>
        </div>
        <section data-testid="admin-roles-grid" className="admin-role-grid" aria-label="Role families">
          {roleFamilies.map(family => <Fragment key={family.label}><h2 className="admin-role-family">{family.label}</h2>{family.roles.map((r) => {
            const Icon = ROLE_ICONS[r.key] || ShieldCheck;
            const count = users?.filter(user => nativeRoleDefinition(user.role)?.legacyKey === r.legacyKey && user.status === 'active').length;
            return <button type="button" key={r.key} className="role-card admin-role-card" aria-pressed={highlight === r.key} onClick={() => select(r.key)}>
              <div className="admin-tile-icon"><Icon aria-hidden="true" /></div>
              <div>
                <h3>{r.label}</h3>
                <span className="admin-role-scope">{r.scope}</span>
                <p>{r.detail}</p>
                <span className="sub">{count == null ? 'Active user count unavailable' : `${count} active user${count === 1 ? '' : 's'}`}</span>
              </div>
            </button>;
          })}</Fragment>)}
        </section>
        <section data-testid="admin-roles-matrix" className="panel admin-panel">
          <div className="panel-head admin-panel-head">
            <div><h2>Capability matrix</h2><p>Capabilities apply within the role's authorized scope.</p></div>
            <span className="admin-readonly-badge"><Lock aria-hidden="true" />Read-only reference</span>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table admin-matrix">
              <thead>
                <tr className="admin-matrix-families"><td/>{roleFamilies.map(family => <th scope="colgroup" colSpan={family.roles.length} key={family.label}>{family.label}</th>)}</tr>
                <tr><th scope="col">Capability</th>{ROLES.map((r) => <th key={r.key} scope="col" className={highlight === r.key ? 'hl' : ''}><button type="button" aria-pressed={highlight === r.key} onClick={() => select(r.key)}>{r.label}</button></th>)}</tr>
              </thead>
              {Array.from(new Set(CAPS.map(capabilityGroup))).map(group => <tbody key={group}>
                <tr className="admin-matrix-group"><th scope="rowgroup" colSpan={ROLES.length + 1}>{group}</th></tr>
                {CAPS.filter(row => capabilityGroup(row) === group).map(({ label, roles }) => (

                  <tr key={label}>
                    <td>{label}</td>
                    {ROLES.map((r) => (
                      <td key={r.key} className={highlight === r.key ? 'hl' : ''}>
                        <span className={PERMISSION_CLASSES[roles[r.key]] || "admin-permission-scope"}>{roles[r.key]}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>)}
            </table>
          </div>
        </section>
        <details className="admin-details" data-testid="role-trust-boundaries">
          <summary><ShieldCheck aria-hidden="true" /><span>Trust boundaries</span><ChevronDown aria-hidden="true" /></summary>
          <div className="admin-details-content">
            <p>Platform Owners have global client scope. Service-provider administrators may access all clients only with an explicit all-client entitlement. An empty assignment list grants no access. Providers cannot create or manage internal administrator accounts.</p>
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
