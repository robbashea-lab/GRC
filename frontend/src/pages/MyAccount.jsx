import { useEffect, useState } from "react";
import api, { formatError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, ShieldCheck, Bell } from "lucide-react";

export default function MyAccount() {
  const { user, refresh } = useAuth();
  const [tab, setTab] = useState("profile");
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
    });
    setPrefs({ weekly_digest_optout: !!user.weekly_digest_optout });
  }, [user]);

  const isGoogle = user?.auth_provider === "google" && !user?.password_hash_present;

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
    if (pw.new_password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      await api.patch("/me/password", { current_password: pw.current_password, new_password: pw.new_password });
      toast.success("Password changed. Other sessions signed out.");
      setPw({ current_password: "", new_password: "", confirm: "" });
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
    <div>
      <PageHeader
        eyebrow="My Account"
        title={user?.name || user?.email || "My account"}
        subtitle="Manage your personal profile, security and notification preferences."
      />
      <div className="p-8 max-w-3xl">
        <div className="flex gap-2 mb-6" data-testid="account-tabs">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                data-testid={`account-tab-${t.id}`}
                className={`inline-flex items-center gap-2 px-3 h-9 rounded-md border text-sm transition ${active ? "border-brand-charcoal bg-brand-charcoal text-ink-onDark font-medium" : "border-line bg-surface-card text-ink-secondary hover:bg-surface-subtle"}`}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="bg-surface-card border border-line rounded-lg p-6 space-y-4">
          {tab === "profile" && (
            <div className="space-y-3" data-testid="account-profile">
              <div>
                <Label className="text-xs text-ink-secondary">Display name</Label>
                <Input data-testid="me-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs text-ink-secondary">Email address</Label>
                <Input value={user?.email || ""} readOnly className="text-sm bg-surface-subtle" />
                <div className="text-[11px] text-ink-help mt-1">Contact your administrator to change your email address.</div>
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
                <Input value={(user?.role || "").replace("_", " ")} readOnly className="text-sm bg-surface-subtle capitalize" />
                <div className="text-[11px] text-ink-help mt-1">Roles are managed by administrators.</div>
              </div>
              <div className="pt-2">
                <Button onClick={saveProfile} disabled={saving} data-testid="me-save-profile">Save changes</Button>
              </div>
            </div>
          )}

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
                    <Input data-testid="me-current-pw" type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} className="text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-ink-secondary">New password</Label>
                    <Input data-testid="me-new-pw" type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} className="text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-ink-secondary">Confirm new password</Label>
                    <Input data-testid="me-confirm-pw" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className="text-sm" />
                  </div>
                  <div className="text-[11px] text-ink-help">At least 8 characters. Changing your password will sign out other active sessions.</div>
                  <div className="pt-2">
                    <Button onClick={changePassword} disabled={saving} data-testid="me-change-pw">Change password</Button>
                  </div>
                </>
              )}
              <div className="mt-6 p-3 border border-line rounded-md bg-surface-subtle text-xs text-ink-help">
                Multi-factor authentication (MFA) and active session management are coming next. Ask your admin for help in the meantime.
              </div>
            </div>
          )}

          {tab === "notifications" && (
            <div className="space-y-3" data-testid="account-notifications">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid="me-weekly-digest-optout"
                  checked={prefs.weekly_digest_optout}
                  onChange={(e) => setPrefs({ ...prefs, weekly_digest_optout: e.target.checked })}
                />
                Pause my Monday <strong>My Work</strong> digest email
              </label>
              <div className="text-[11px] text-ink-help">You'll still receive review-due, assignment and mention notifications inside the app.</div>
              <div className="pt-2">
                <Button onClick={savePrefs} disabled={saving} data-testid="me-save-prefs">Save preferences</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
