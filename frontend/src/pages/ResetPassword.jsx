import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { formatError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (pw.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (pw !== pw2) { toast.error("Passwords don't match"); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: pw });
      toast.success("Password reset. Please sign in.");
      nav("/login");
    } catch (err) {
      toast.error(formatError(err));
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-md bg-slate-900 text-white flex items-center justify-center font-bold font-heading">◱</div>
            <div className="font-heading font-semibold tracking-tight">Northstar GRC</div>
          </div>
          <h2 className="text-xl font-heading font-semibold tracking-tight">Choose a new password</h2>
          <p className="text-xs text-slate-500 mt-1">At least 8 characters. Mix letters, numbers and a symbol.</p>
        </div>
        {!token ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-sm p-3" data-testid="reset-no-token">
            This link is missing a reset token. Please request a new one from the <Link className="underline" to="/forgot-password">forgot-password page</Link>.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label className="text-xs">New password</Label>
              <Input data-testid="reset-password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} />
            </div>
            <div>
              <Label className="text-xs">Confirm new password</Label>
              <Input data-testid="reset-password-confirm" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} />
            </div>
            <Button data-testid="reset-submit" type="submit" disabled={loading} className="w-full">
              {loading ? "…" : "Set new password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
