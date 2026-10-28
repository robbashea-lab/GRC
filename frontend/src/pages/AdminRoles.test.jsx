import React, { act } from "react";
import { createRoot } from "react-dom/client";
import AdminRoles from "./AdminRoles";
import { PLANNED_ROLES, PLANNED_CAPABILITIES, FUTURE_CLIENT_APPROVER } from "@/lib/plannedRoleModel";

test("planned matrix has explicit values and separates contribution from approvals", () => {
  const keys = PLANNED_ROLES.map(r => r.key);
  expect(keys).toHaveLength(5);
  for (const row of PLANNED_CAPABILITIES) {
    expect(Object.keys(row.roles)).toEqual(keys);
    expect(Object.values(row.roles).every(v => ["Yes", "No", "Assigned Clients", "Their Client", "Limited", "Permitted Records"].includes(v))).toBe(true);
    expect(row.roles.client_read_only).toBe(row.capabilities.includes("view") ? "Their Client" : "No");
  }
  const approval = PLANNED_CAPABILITIES.find(r => r.capabilities.includes("accept_risk"));
  expect(approval.roles.client_contributor).toBe("No");
  expect(approval.roles.client_grc_manager).toBe("No");
  expect(FUTURE_CLIENT_APPROVER.assignable).toBe(false);
  expect(keys).not.toContain(FUTURE_CLIENT_APPROVER.key);
});

test("page clearly separates the five planned roles from current permissions", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); const root = createRoot(container);
  try {
    await act(async () => root.render(<AdminRoles />));
    const cards = container.querySelector('[data-testid="admin-roles-grid"]');
    expect(cards.children).toHaveLength(5);
    expect([...cards.children].map(card => [card.querySelector("h3").textContent,
      card.querySelector(".admin-role-scope").textContent, card.querySelector("p").textContent]))
      .toEqual(PLANNED_ROLES.map(role => [role.label, role.scope, role.detail]));
    expect(cards.textContent).not.toContain("Super Admin");
    expect(container.querySelectorAll("thead th")).toHaveLength(6);
    expect(container.querySelector('[data-testid="admin-roles-note"]').textContent).toContain("Server-enforced role contract");
    expect(container.querySelector('[data-testid="current-effective-permissions"]').textContent).toContain("No accounts are automatically promoted");
    expect(container.querySelector('[data-testid="future-client-approver"]')).toBeNull();
    expect(container.textContent).not.toMatch(/future|coming soon|planned/i);
    expect([...container.querySelectorAll("tbody tr")].map(row => [...row.cells].map(cell => cell.textContent)))
      .toEqual(PLANNED_CAPABILITIES.map(row => [row.label, ...PLANNED_ROLES.map(role => row.roles[role.key])]));
    expect(container.querySelectorAll("button, input, select, textarea, form")).toHaveLength(0);
  } finally { await act(async () => root.unmount()); }
});

test("read-only disclosures retain the complete native trust and effective-permissions contract", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); const root = createRoot(container);
  const sections = [
    ["role-trust-boundaries", "Trust boundaries", [
      "Super Admins have global client scope. Service-provider administrators may access all clients only with an explicit all-client entitlement. An empty assignment list grants no access. Providers cannot create or manage internal administrator accounts.",
      "Client managers coordinate permitted operations and assign existing client users. Contributors work assigned records. Limited assignment never permits changing another user's role or client access.",
      "Read-only users cannot approve, upload or modify business records, even when named as a business approver.",
      "History locks, optimistic concurrency and separation-of-duties checks apply in addition to role permissions. No role grants arbitrary audit-history deletion or bypasses record integrity.",
    ]],
    ["current-effective-permissions", "Current Effective Permissions", [
      "Persisted role IDs are retained. No accounts are automatically promoted or assigned additional clients. The backend checks role, tenant scope and record permissions independently of browser state.",
      "super_admin maps to Platform Owner; platform_admin to Service Provider GRC Administrator; client_grc_manager to Client GRC Manager. Contributor and read-only IDs remain unchanged.",
    ]],
  ];
  const original = JSON.stringify([PLANNED_ROLES, PLANNED_CAPABILITIES]);
  try {
    await act(async () => root.render(<AdminRoles />));
    for (const [id, label, paragraphs] of sections) {
      const section = container.querySelector(`[data-testid="${id}"]`);
      expect(section.tagName).toBe("DETAILS");
      const summary = section.querySelector("summary");
      expect(summary.textContent).toBe(label);
      expect([...section.querySelectorAll("p")].map(node => node.textContent)).toEqual(paragraphs);
      expect(section.open).toBe(false);
      await act(async () => summary.click()); expect(section.open).toBe(true);
      await act(async () => summary.click()); expect(section.open).toBe(false);
      expect(section.querySelectorAll("button, input, select, textarea, form")).toHaveLength(0);
    }
    expect(JSON.stringify([PLANNED_ROLES, PLANNED_CAPABILITIES])).toBe(original);
  } finally { await act(async () => root.unmount()); }
});
