import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatError } from "@/lib/api";

export default function Login() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name);
      nav("/");
    } catch (err) {
      toast.error(formatError(err));
    } finally { setLoading(false); }
  }

  function googleSignIn() {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border-r border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-10">
            <div className="h-9 w-9 rounded-md bg-white text-slate-900 flex items-center justify-center font-bold font-heading">◱</div>
            <div className="font-heading font-semibold tracking-tight">Northstar GRC</div>
          </div>
          <h1 className="text-4xl xl:text-5xl font-heading font-semibold tracking-tight leading-tight max-w-md">
            The operating system for<br/>your GRC program.
          </h1>
          <p className="mt-4 text-slate-400 max-w-md text-sm leading-relaxed">
            Reviews, findings, risks, policies, vendors, assets and evidence — one calm surface, multi-tenant by design, built for GRC teams who want work done, not gauges polished.
          </p>
        </div>
        <div className="space-y-3">
          {[
            "Reusable review workflow for every recurring assurance activity",
            "Findings → remediation tasks → risks, always one click apart",
            "Strict tenant isolation, granular roles, full audit trail",
          ].map((t) => (
            <div key={t} className="flex items-start gap-3 text-sm text-slate-300">
              <div className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400"/> {t}
            </div>
          ))}
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">v0.1 · Preview build</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="mb-6">
            <h2 className="text-xl font-heading font-semibold tracking-tight">{mode === "login" ? "Sign in" : "Create your account"}</h2>
            <p className="text-xs text-slate-500 mt-1">Use email & password or continue with Google.</p>
          </div>
          <button data-testid="google-signin" onClick={googleSignIn} className="w-full mb-4 flex items-center justify-center gap-2 border border-slate-200 rounded-md py-2.5 text-sm hover:bg-slate-50">
            <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Continue with Google
          </button>
          <div className="flex items-center gap-2 my-4 text-[11px] text-slate-400">
            <div className="h-px bg-slate-200 flex-1" /> or with email <div className="h-px bg-slate-200 flex-1" />
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && (
              <div>
                <Label className="text-xs">Name</Label>
                <Input data-testid="name-input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div>
              <Label className="text-xs">Email</Label>
              <Input data-testid="email-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Password</Label>
                <Link to="/forgot-password" data-testid="forgot-password-link" className="text-[11px] text-slate-500 hover:text-slate-900 underline">Forgot?</Link>
              </div>
              <Input data-testid="password-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button data-testid="submit-auth" type="submit" disabled={loading} className="w-full">
              {loading ? "…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <div className="mt-4 text-xs text-slate-500 text-center">
            {mode === "login" ? (
              <>New to Northstar? <button data-testid="switch-register" className="text-slate-900 underline" onClick={() => setMode("register")}>Create an account</button></>
            ) : (
              <>Already have an account? <button data-testid="switch-login" className="text-slate-900 underline" onClick={() => setMode("login")}>Sign in</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
