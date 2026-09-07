// Design metadata only. Never use this catalogue as a runtime authorization check.
// Existing stored role IDs and backend route-level checks remain authoritative.
export const ROLE_MODEL_STATUS = "planned";
export const PLANNED_ROLES = [
  { key: "platform_owner", label: "Platform Owner", scope: "PLATFORM-WIDE", legacyKey: "super_admin", detail: "Full control over the iVenture GRC platform, all client tenants, platform administration, security settings, roles, and audit functions." },
  { key: "platform_administrator", label: "Platform Administrator", scope: "PLATFORM OPERATIONS", legacyKey: "platform_admin", detail: "Manages routine platform and client administration with guardrails against high-impact security, permission, and destructive changes." },
  { key: "grc_team_member", label: "GRC Team Member", scope: "ASSIGNED CLIENTS", legacyKey: null, detail: "Internal iVenture GRC staff who perform day-to-day GRC program work within assigned client organizations without administering the overall platform." },
  { key: "client_contributor", label: "Client Contributor", scope: "THEIR CLIENT", legacyKey: "client_contributor", detail: "Participates in their organization's GRC program, including responding to assigned work, uploading evidence, commenting, and updating permitted records." },
  { key: "client_read_only", label: "Client Read Only", scope: "THEIR CLIENT", legacyKey: "client_readonly", detail: "Read-only access to authorized information within their client organization. Cannot modify GRC records or platform configuration." },
];

// Values express intended scope, not executable grants. "Yes" still requires
// tenant authorization, record-level restrictions and workflow safeguards.
const row = (label, capabilities, values) => ({ label, capabilities,
  roles: Object.fromEntries(PLANNED_ROLES.map((role, i) => [role.key, values[i]])) });
export const PLANNED_CAPABILITIES = [
  row("View authorized client records", ["view"], ["Yes", "Yes", "Assigned Clients", "Their Client", "Their Client"]),
  row("Create/edit normal GRC records", ["create", "edit"], ["Yes", "Yes", "Assigned Clients", "Permitted Records", "No"]),
  row("Upload evidence/comment", ["upload_evidence", "comment"], ["Yes", "Yes", "Assigned Clients", "Their Client", "No"]),
  row("Assign normal work", ["assign"], ["Yes", "Yes", "Assigned Clients", "No", "No"]),
  row("Complete reviews/action items", ["complete"], ["Yes", "Yes", "Assigned Clients", "Permitted Records", "No"]),
  row("Run onboarding", ["run_onboarding"], ["Yes", "Yes", "Assigned Clients", "No", "No"]),
  row("Create client tenants", ["create_clients"], ["Yes", "Yes", "No", "No", "No"]),
  row("Edit client profile", ["edit_clients"], ["Yes", "Yes", "Limited", "No", "No"]),
  row("Assign GRC Lead", ["assign_grc_lead"], ["Yes", "Yes", "No", "No", "No"]),
  row("Archive/restore client", ["archive_clients", "restore_clients"], ["Yes", "Limited", "No", "No", "No"]),
  row("Permanently delete client", ["delete_clients"], ["Yes", "No", "No", "No", "No"]),
  row("Manage client users", ["manage_client_users"], ["Yes", "Yes", "No", "No", "No"]),
  row("Assign client-level roles", ["assign_client_roles"], ["Yes", "Limited", "No", "No", "No"]),
  row("Manage platform users", ["manage_platform_users"], ["Yes", "No", "No", "No", "No"]),
  row("Manage roles/permissions", ["manage_roles", "manage_permissions"], ["Yes", "No", "No", "No", "No"]),
  row("Manage Security & Auth", ["manage_security"], ["Yes", "No", "No", "No", "No"]),
  row("View platform Audit Log", ["view_audit_log"], ["Yes", "Yes", "No", "No", "No"]),
  row("Manage platform settings", ["manage_platform_settings"], ["Yes", "No", "No", "No", "No"]),
  row("Designated governance approvals", ["approve", "approve_policy", "accept_risk", "validate_finding", "approve_exception", "approve_closure", "sign_off_review"], ["Yes", "No", "No", "No", "No"]),
];

export const FUTURE_CLIENT_APPROVER = {
  key: "client_approver", label: "Client Approver", status: "future", assignable: false,
  scope: "THEIR CLIENT", extendsRole: "client_contributor",
  detail: "Client user authorized to perform designated governance approvals or risk decisions in addition to normal contributor capabilities.",
  capabilities: ["approve", "approve_policy", "accept_risk", "approve_exception", "approve_closure", "sign_off_review"],
};
