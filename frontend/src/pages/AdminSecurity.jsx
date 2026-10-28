import PageHeader from "@/components/PageHeader";
import { Lock, KeyRound, ShieldAlert, Clock, Info } from "lucide-react";

const ROWS = [
  { icon: KeyRound, label: "Authentication", category: "Account access", value: "Email and password. Access requires an authorized account." },
  { icon: Lock, label: "Password policy", category: "Credential requirements", value: "15–128 characters, including spaces. Common and repetitive passwords are blocked. No required character classes or periodic expiration." },
  { icon: Lock, label: "Password storage", category: "Credential storage", value: "Passwords are protected using adaptive, salted password hashing. New passwords use scrypt; existing bcrypt credentials remain supported." },
  { icon: Clock, label: "Session lifetime", category: "Session handling", value: "Seven-day JWT maximum. Logout revokes account sessions. Role, status and client assignments are checked per request. Reload uses HttpOnly cookies; bearer tokens are not persisted in localStorage." },
  { icon: ShieldAlert, label: "Abuse protection", category: "Request limits", value: "Authentication endpoints allow 30 requests per source IP and endpoint per minute, per process. " },
  { icon: Lock, label: "Transport security", category: "Connection requirements", value: "Hosted server configuration requires HTTPS origins and Secure cookies." },
];

export default function AdminSecurity() {
  return (
    <div className="admin-page admin-security-page">
      <PageHeader eyebrow="Administration" title="Security & Auth" subtitle="Platform-wide authentication and hardening posture." />
      <div className="admin-body">
        <div className="admin-notice" data-testid="admin-security-note">
          <Info aria-hidden="true" />
          <div><strong>Configuration reference.</strong> This page describes the product configuration; it does not inspect or verify the live environment.</div>
        </div>
        <section className="admin-panel admin-security-list" data-testid="admin-security-list" aria-label="Authentication and hardening information">
          {ROWS.map((r) => (
            <article key={r.label} className="admin-security-row">
              <div className="admin-tile-icon"><r.icon aria-hidden="true" /></div>
              <div className="admin-security-copy">
                <h2>{r.label}</h2>
                <p>{r.value}</p>
                <div className="admin-security-category">{r.category}</div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
