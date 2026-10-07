import PageHeader from "@/components/PageHeader";
import { Lock, KeyRound, ShieldAlert, Clock } from "lucide-react";

const ROWS = [
  { icon: KeyRound, label: "Authentication", value: "Email and password. Access requires an authorized account." },
  { icon: Lock, label: "Password policy", value: "15–128 characters, including spaces. Common and repetitive passwords are blocked. No required character classes or periodic expiration." },
  { icon: Lock, label: "Password storage", value: "Passwords are protected using adaptive, salted password hashing. New passwords use scrypt; existing bcrypt credentials remain supported." },
  { icon: Clock, label: "Session lifetime", value: "Seven-day JWT maximum. Logout revokes account sessions. Role, status and client assignments are checked per request. Reload uses HttpOnly cookies; bearer tokens are not persisted in localStorage." },
  { icon: ShieldAlert, label: "Abuse protection", value: "Authentication endpoints allow 30 requests per source IP and endpoint per minute, per process. " },
  { icon: Lock, label: "Transport security", value: "Hosted server configuration requires HTTPS origins and Secure cookies." },
];

export default function AdminSecurity() {
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Security & Authentication" subtitle="Platform-wide authentication and hardening posture." />
      <div className="page-gutter py-6 max-w-4xl space-y-4">
        <div className="rounded-md border border-line bg-surface-card divide-y divide-line" data-testid="admin-security-list">
          {ROWS.map((r, i) => (
            <div key={i} className="flex items-start gap-3 p-4">
              <div className="h-8 w-8 rounded-md bg-surface-subtle border border-line flex items-center justify-center"><r.icon className="h-4 w-4 text-ink-secondary" /></div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink-primary">{r.label}</div>
                <p className="text-xs text-ink-secondary mt-0.5">{r.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
