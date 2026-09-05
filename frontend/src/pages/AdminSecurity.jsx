import PageHeader from "@/components/PageHeader";
import { Lock, KeyRound, ShieldAlert, Clock, Info } from "lucide-react";

const ROWS = [
  { icon: KeyRound, label: "Authentication", value: "Email + password (bcrypt) with JWT bearer tokens. Emergent-managed Google OAuth available for internal admins on request." },
  { icon: Lock, label: "Password policy", value: "Minimum 8 characters. Bcrypt cost factor 12. Passwords stored hashed - never in plain text." },
  { icon: Clock, label: "Session lifetime", value: "24-hour JWT, invalidated on logout. Sessions are user-scoped; no shared tokens." },
  { icon: ShieldAlert, label: "MFA", value: "Not yet enabled at the platform level. Planned for the next security release." },
  { icon: ShieldAlert, label: "Brute-force protection", value: "Login endpoint tracks failed attempts per email and returns 429 after 5 consecutive failures within 15 minutes." },
  { icon: Lock, label: "Transport security", value: "All API and UI traffic terminates over HTTPS at the Emergent ingress. Cookies use SameSite and Secure." },
];

export default function AdminSecurity() {
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Security & Authentication" subtitle="Platform-wide authentication and hardening posture." />
      <div className="px-8 py-6 max-w-4xl space-y-4">
        <div className="rounded-md border border-semantic-info-border bg-semantic-info-bg p-3 text-xs text-semantic-info flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>Interactive security settings (MFA enrollment, session revocation, IP allow-lists) are on the roadmap. This page documents the current effective posture.</div>
        </div>
        <div className="rounded-md border border-line bg-surface-card divide-y divide-slate-100" data-testid="admin-security-list">
          {ROWS.map((r, i) => (
            <div key={i} className="flex items-start gap-3 p-4">
              <div className="h-8 w-8 rounded-md bg-surface-subtle border border-line flex items-center justify-center"><r.icon className="h-4 w-4 text-brand-charcoal" /></div>
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
