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
  expect(approval.roles.grc_team_member).toBe("No");
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
    for (const role of PLANNED_ROLES) expect(cards.textContent).toContain(role.label);
    expect(cards.textContent).not.toContain("Super Admin");
    expect(container.querySelectorAll("thead th")).toHaveLength(6);
    expect(container.querySelector('[data-testid="admin-roles-note"]').textContent).toContain("not yet enforced");
    expect(container.querySelector('[data-testid="current-effective-permissions"]').textContent).toContain("No stored IDs or assignments have changed");
    expect(container.querySelector('[data-testid="future-client-approver"]').textContent).toContain("not active or assignable");
  } finally { await act(async () => root.unmount()); }
});
