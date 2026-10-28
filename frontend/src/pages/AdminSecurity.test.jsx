import React, {act} from "react";
import {createRoot} from "react-dom/client";
import AdminSecurity from "./AdminSecurity";

test("security reference preserves all six native configuration statements without settings or assurance claims", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); const root = createRoot(container);
  const expected = [
    ["Authentication", "Account access", "Email and password. Access requires an authorized account."],
    ["Password policy", "Credential requirements", "15–128 characters, including spaces. Common and repetitive passwords are blocked. No required character classes or periodic expiration."],
    ["Password storage", "Credential storage", "Passwords are protected using adaptive, salted password hashing. New passwords use scrypt; existing bcrypt credentials remain supported."],
    ["Session lifetime", "Session handling", "Seven-day JWT maximum. Logout revokes account sessions. Role, status and client assignments are checked per request. Reload uses HttpOnly cookies; bearer tokens are not persisted in localStorage."],
    ["Abuse protection", "Request limits", "Authentication endpoints allow 30 requests per source IP and endpoint per minute, per process. "],
    ["Transport security", "Connection requirements", "Hosted server configuration requires HTTPS origins and Secure cookies."],
  ];
  try {
    await act(async () => root.render(<AdminSecurity />));
    expect(container.querySelector("h1").textContent).toBe("Security & Auth");
    const list = container.querySelector('[data-testid="admin-security-list"]');
    expect([...list.querySelectorAll("article")].map(row => [row.querySelector("h2").textContent,
      row.querySelector(".admin-security-category").textContent, row.querySelector("p").textContent])).toEqual(expected);
    expect(container.querySelector('[data-testid="admin-security-note"]').textContent)
      .toBe("Configuration reference. This page describes the product configuration; it does not inspect or verify the live environment.");
    expect(container.querySelectorAll("button, input, select, textarea, form, meter, progress")).toHaveLength(0);
    expect(list.querySelector(".badge, .admin-badge")).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
