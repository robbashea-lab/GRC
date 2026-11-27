import { useEffect, useState } from "react";
import api, { formatError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PlatformPageHeading from "@/components/PlatformPageHeading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, ShieldCheck, Bell } from "lucide-react";
import {nativeRoleLabel} from '@/lib/plannedRoleModel';

export default function MyAccount() {
  const { user, refresh } = useAuth();
  const [tab, setTab] = useState(user?.password_change_required ? "security" : "profile");
  const [profile, setProfile] = useState({ name: "", job_title: "", phone: "" });
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [prefs, setPrefs] = useState({ weekly_digest_optout: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfile({
      name: user.name || "",
      job_title: user.job_title || "",
      phone: user.phone || "",
      expected_updated_at: user.updated_at ?? null,
    });
    setPrefs({ weekly_digest_optout: !!user.weekly_digest_optout });
  }, [user]);

  const isGoogle = user?.auth_provider === "google" && !user?.password_hash_present;
  const roleLabel = nativeRoleLabel(user?.role);
  const initials = (user?.name || user?.email || '').trim().split(/\s+/).map(part => part[0]).slice(0,2).join('').toUpperCase();

  async function saveProfile() {
    setSaving(true);
    try {
      await api.patch("/me", profile);
      toast.success("Profile updated");
      refresh?.();
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  }

  async function changePassword() {
    if (pw.new_password !== pw.confirm) { toast.error("New passwords don't match"); return; }
    if (pw.new_password.length < 15) { toast.error("Password must be at least 15 characters"); return; }
    setSaving(true);
    try {
      await api.patch("/me/password", { current_password: pw.current_password, new_password: pw.new_password });
      toast.success("Password changed. Sign in again to continue.");
      setPw({ current_password: "", new_password: "", confirm: "" });
      await refresh();
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  }

  async function savePrefs() {
    setSaving(true);
    try {
      await api.patch("/me/preferences", prefs);
      toast.success("Preferences saved");
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  }

  const TABS = [
    { id: "profile", label: "Profile", icon: User },
    { id: "security", label: "Security", icon: ShieldCheck },
    { id: "notifications", label: "Notifications", icon: Bell },
  ];

  return (
    <div className="native-account wrap">
      <PlatformPageHeading
        eyebrow="Account"
        title="My Account"
        subtitle="Manage your personal profile, security and notification preferences."
      />
      <section className="panel native-account-panel">
        <div className="prof-top"><span className="av native-account-avatar">{initials}</span><div><b>{user?.name || user?.email}</b><div className="sub">{user?.email} · {roleLabel}</div></div></div>
        <div className="dr-tabs pf-tabs" role="tablist" aria-label="My Account" data-testid="account-tabs">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                data-testid={`account-tab-${t.id}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="pf-body native-account-body">
          {tab === "profile" && (
            <div className="space-y-3" data-testid="account-profile">
              <div>
                <Label className="text-xs text-ink-secondary">Display name</Label>
                <Input data-testid="me-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs text-ink-secondary">Email address</Label>
                <Input value={user?.email || ""} readOnly className="text-sm bg-surface-subtle" />
                <div className="text-xs text-ink-help mt-1">Contact your administrator to change your email address.</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-ink-secondary">Job title</Label>
                  <Input data-testid="me-job-title" value={profile.job_title} onChange={(e) => setProfile({ ...profile, job_title: e.target.value })} className="text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-ink-secondary">Phone</Label>
                  <Input data-testid="me-phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="text-sm" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-ink-secondary">Role</Label>
                <Input value={roleLabel} readOnly className="text-sm bg-surface-subtle" />
                <div className="text-xs text-ink-help mt-1">Roles are managed by administrators.</div>
              </div>
              <div className="pt-2">
                <Button onClick={saveProfile} disabled={saving} data-testid="me-save-profile">Save changes</Button>
              </div>
            </div>
          )}

          {user?.password_change_required && <p role="alert" className="text-semantic-critical">Change your password before continuing to client data.</p>}
          {tab === "security" && (
            <div className="space-y-3" data-testid="account-security">
              {isGoogle ? (
                <div className="p-4 border border-line rounded-md bg-surface-subtle text-sm text-ink-secondary">
                  Authentication is managed through your connected identity provider (Google). Password changes happen on your Google account.
                </div>
              ) : (
                <>
                  <div>
                    <Label className="text-xs text-ink-secondary">Current password</Label>
                    <Input aria-label="Current password" autoComplete="current-password" data-testid="me-current-pw" type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} className="text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-ink-secondary">New password</Label>
                    <Input aria-label="New password" autoComplete="new-password" minLength={15} maxLength={128} data-testid="me-new-pw" type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} className="text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-ink-secondary">Confirm new password</Label>
                    <Input aria-label="Confirm new password" autoComplete="new-password" minLength={15} maxLength={128} data-testid="me-confirm-pw" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className="text-sm" />
                  </div>
                  <div className="text-xs text-ink-help">15–128 characters. Changing your password signs out all active sessions, including this one.</div>
                  <div className="pt-2">
                    <Button onClick={changePassword} disabled={saving} data-testid="me-change-pw">Change password</Button>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "notifications" && (
            <div className="space-y-3" data-testid="account-notifications">
              <div className="tog-row">
                <span><b>Pause my Monday My Work digest email</b><span className="sub native-digest-help">You'll still receive review-due, assignment and mention notifications inside the app.</span></span>
                <button
                  type="button"
                  role="switch"
                  className="tog"
                  aria-label="Pause my Monday My Work digest email"
                  aria-checked={prefs.weekly_digest_optout}
                  data-testid="me-weekly-digest-optout"
                  disabled={saving}
                  onClick={() => setPrefs(previous => ({ ...previous, weekly_digest_optout: !previous.weekly_digest_optout }))}
                ><span/></button>
              </div>
              <div className="pt-2">
                <Button onClick={savePrefs} disabled={saving} data-testid="me-save-prefs">Save preferences</Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
