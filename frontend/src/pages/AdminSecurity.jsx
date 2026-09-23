import PageHeader from "@/components/PageHeader";
import { Lock, KeyRound, ShieldAlert, Clock, Info } from "lucide-react";

const ROWS = [
  { icon: KeyRound, label: "Authentication", value: "Email/password with bcrypt and environment-bound JWTs. External Google session exchange is disabled in staging/production pending identity-provider validation." },
  { icon: Lock, label: "Password policy", value: "Minimum 8 characters. Bcrypt cost factor 12. Passwords stored hashed - never in plain text." },
  { icon: Clock, label: "Session lifetime", value: "Seven-day JWT maximum. Logout revokes account sessions. Role, status and client assignments are checked per request. Reload uses HttpOnly cookies; bearer tokens are not persisted in localStorage." },
  { icon: ShieldAlert, label: "MFA", value: "Not yet enabled at the platform level. Planned for the next security release." },
  { icon: ShieldAlert, label: "Abuse protection", value: "Authentication endpoints allow 30 requests per source IP and endpoint per minute, per process. Distributed rate limiting and trusted proxies still require staging validation." },
  { icon: Lock, label: "Transport security", value: "Cookies use Secure, HttpOnly and SameSite=Lax. Staging requires HTTPS origins. Live TLS and ingress behavior are not yet validated." },
];

export default function AdminSecurity() {
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Security & Authentication" subtitle="Platform-wide authentication and hardening posture." />
      <div className="page-gutter py-6 max-w-4xl space-y-4">
        <div className="rounded-md border border-semantic-info-border bg-semantic-info-bg p-3 text-xs text-semantic-info flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>Interactive security settings (MFA enrollment, session revocation, IP allow-lists) are on the roadmap. This page documents the current effective posture.</div>
        </div>
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
