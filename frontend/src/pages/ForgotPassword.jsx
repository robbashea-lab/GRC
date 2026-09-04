import { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
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
          <h2 className="text-xl font-heading font-semibold tracking-tight">Reset your password</h2>
          <p className="text-xs text-slate-500 mt-1">We'll email you a secure link to choose a new password.</p>
        </div>
        {sent ? (
          <div className="space-y-3">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm p-3" data-testid="forgot-sent-message">
              If <span className="font-medium">{email}</span> is registered, a reset link is on its way. It expires in 2 hours.
            </div>
            <Link to="/login" className="text-xs text-slate-600 underline">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label className="text-xs">Email</Label>
              <Input data-testid="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button data-testid="forgot-submit" type="submit" disabled={loading} className="w-full">
              {loading ? "…" : "Send reset link"}
            </Button>
            <div className="text-xs text-slate-500 text-center pt-2">
              <Link to="/login" className="text-slate-900 underline">Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
