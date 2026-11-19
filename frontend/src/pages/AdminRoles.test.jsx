import React, { act } from "react";
import { createRoot } from "react-dom/client";
import AdminRoles from "./AdminRoles";
import { PLANNED_ROLES, PLANNED_CAPABILITIES, FUTURE_CLIENT_APPROVER, nativeRoleLabel } from "@/lib/plannedRoleModel";
import api from '@/lib/api';
jest.mock('@/lib/api', () => ({__esModule:true,default:{get:jest.fn().mockResolvedValue({data:[]})}}));
beforeEach(() => api.get.mockResolvedValue({data:[]}));

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
  expect(nativeRoleLabel('client_viewer')).toBe('Client Read Only');
  expect(nativeRoleLabel('ClientReadOnly')).toBe('ClientReadOnly');
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
    expect(container.querySelectorAll("input, select, textarea, form")).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(10);
    const role = cards.querySelector('button');
    await act(async () => role.click());
    expect(role.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('table .hl')).toHaveLength(PLANNED_CAPABILITIES.length + 1);
    await act(async () => container.querySelector('thead th button').click());
    expect(role.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelectorAll('table .hl')).toHaveLength(0);
  } finally { await act(async () => root.unmount()); }
});

test('role counts use actual active native accounts and remain unknown after a failed read', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const users=Object.freeze([
    {role:'super_admin',status:'active'},
    {role:'super_admin',status:'disabled'},
    {role:'client_readonly',status:'active'},
    {role:'client_viewer',status:'active'},
    {role:'client_readonly',status:'invited'},
    {role:'client_viewer',status:'invited'},
    {role:'client_readonly',status:'disabled'},
    {role:'client_viewer',status:'disabled'},
    {role:'ClientReadOnly',status:'active'},
    {role:'Client Read Only',status:'active'},
    {role:'Platform Owner',status:'active'},
    {role:'not_a_role',status:'active'},
  ].map(Object.freeze));
  const original=JSON.stringify(users);
  api.get.mockResolvedValueOnce({data:users});
  const container = document.createElement('div'), root = createRoot(container);
  try {
    await act(async () => root.render(<AdminRoles/>));
    expect(container.querySelector('[data-testid="admin-roles-grid"]').children[0].textContent).toContain('1 active user');
    expect([...container.querySelector('[data-testid="admin-roles-grid"]').children].map(card=>card.querySelector('.sub').textContent))
      .toEqual(['1 active user','0 active users','0 active users','0 active users','2 active users']);
    expect(JSON.stringify(users)).toBe(original);
    await act(async () => root.render(null));
    api.get.mockRejectedValueOnce(new Error('Unavailable'));
    await act(async () => root.render(<AdminRoles/>));
    expect(container.querySelector('[data-testid="admin-roles-grid"]').textContent).toContain('Active user count unavailable');
  } finally {await act(async () => root.unmount());}
});

test("read-only disclosures retain the complete native trust and effective-permissions contract", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); const root = createRoot(container);
  const sections = [
    ["role-trust-boundaries", "Trust boundaries", [
      "Platform Owners have global client scope. Service-provider administrators may access all clients only with an explicit all-client entitlement. An empty assignment list grants no access. Providers cannot create or manage internal administrator accounts.",
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
