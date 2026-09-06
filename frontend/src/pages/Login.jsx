import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PREVIEW_MODE, formatError } from "@/lib/api";
import { Lock, Eye, EyeOff, ArrowRight } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      const isInternal = ["super_admin", "platform_admin"].includes(u?.role);
      nav(isInternal ? "/clients" : "/dashboard");
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
    <div className="min-h-screen bg-brand-charcoal text-ink-onDark flex flex-col lg:flex-row">
      {/* ─── Brand pane (left) ─────────────────────────────────────────── */}
      <section className="relative hidden lg:flex flex-col justify-between w-1/2 xl:w-[58%] px-14 py-12 overflow-hidden">
        {/* Background: layered SVG grid + soft radial glow + oversized GRC monogram.
            Everything below sits above the layers via z-10. */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
          {/* Radial lighting */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(1200px 700px at 20% 15%, rgba(163,219,51,0.055), transparent 60%), radial-gradient(900px 600px at 85% 90%, rgba(163,219,51,0.035), transparent 65%)",
            }}
          />
          {/* Thin grid */}
          <svg className="absolute inset-0 h-full w-full opacity-[0.055]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
                <path d="M42 0H0V42" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
          {/* Oversized monogram */}
          <div
            aria-hidden="true"
            className="absolute -bottom-24 -right-20 text-[24rem] leading-none font-heading font-semibold tracking-tighter select-none"
            style={{ color: "rgba(255,255,255,0.014)" }}
          >
            GRC
          </div>
          {/* Diagonal accent line */}
          <div
            aria-hidden="true"
            className="absolute top-0 right-0 h-full w-px"
            style={{ background: "linear-gradient(180deg, transparent 0%, rgba(163,219,51,0.28) 40%, rgba(163,219,51,0.28) 60%, transparent 100%)" }}
          />
        </div>

        {/* Top — brand */}
        <header className="relative z-10 flex items-center gap-3">
          <div className="relative h-10 w-10 rounded-md bg-brand-metallic text-ink-onDark flex items-center justify-center font-bold font-heading border border-brand-metallic-3">
            iV
            <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-brand-lime" />
          </div>
          <div className="leading-tight">
            <div className="text-ink-onDark font-heading font-semibold tracking-tight">iVenture GRC</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-ink-onDarkMuted font-mono mt-0.5">
              by iVenture Solutions
            </div>
          </div>
        </header>

        {/* Middle — minimal statement */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2.5 text-[11px] font-mono uppercase tracking-[0.22em] text-ink-onDarkMuted mb-5">
            <span className="h-px w-8 bg-brand-lime" />
            GRC Operations
          </div>
          <h1 className="text-4xl xl:text-[42px] leading-[1.05] font-heading font-semibold tracking-tight text-ink-onDark">
            GRC Workspace
          </h1>
          <p className="mt-4 text-[11px] leading-relaxed text-ink-onDarkMuted font-mono uppercase tracking-[0.28em]">
            Governance · Risk · Compliance
          </p>
        </div>

        {/* Bottom — footer */}
        <footer className="relative z-10 text-[11px] font-mono uppercase tracking-[0.18em] text-ink-onDarkMuted">
          © {new Date().getFullYear()} iVenture Solutions
        </footer>
      </section>

      {/* ─── Auth pane (right) ─────────────────────────────────────────── */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-6 py-10 lg:px-10 bg-brand-charcoal border-l border-brand-metallic-3">
        {/* Mobile-only brand header (visible when the left pane is hidden) */}
        <div className="lg:hidden mb-10 flex items-center gap-3 self-start">
          <div className="relative h-9 w-9 rounded-md bg-brand-metallic text-ink-onDark flex items-center justify-center font-bold font-heading border border-brand-metallic-3">
            iV
            <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-brand-lime" />
          </div>
          <div className="leading-tight">
            <div className="text-ink-onDark font-heading font-semibold tracking-tight text-sm">iVenture GRC</div>
            <div className="text-[9px] uppercase tracking-[0.22em] text-ink-onDarkMuted font-mono">by iVenture Solutions</div>
          </div>
        </div>

        <div className="w-full max-w-sm">
          {/* Environment identifier */}
          <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-brand-lime/80 mb-3" data-testid="env-identifier">
            Authorized Access
          </div>
          <h2 className="text-2xl font-heading font-semibold tracking-tight text-ink-onDark">Sign in</h2>
          <p className="text-[13px] text-ink-onDarkMuted mt-1.5">
            Access your iVenture GRC workspace.
          </p>

          {/* Panel */}
          <div className="mt-7 space-y-4">
            {PREVIEW_MODE ? (
              <>
                <Button data-testid="preview-signin" onClick={submit} disabled={loading} className="w-full h-10 bg-[#8FC22B] hover:bg-[#7FAE24] text-brand-charcoal font-semibold">
                  {loading ? "Opening…" : "Sign in"}
                </Button>
                <p className="text-xs text-ink-onDarkMuted">Demo preview · No credentials needed. Sample data is read-only.</p>
              </>
            ) : <>
            <button
              data-testid="google-signin"
              onClick={googleSignIn}
              className="w-full flex items-center justify-center gap-2.5 rounded-md border border-brand-metallic-3 bg-brand-metallic/40 hover:bg-brand-metallic/70 text-ink-onDark text-sm font-medium h-10 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-ink-onDarkMuted font-mono">
              <div className="h-px bg-brand-metallic-3 flex-1" /> or with email <div className="h-px bg-brand-metallic-3 flex-1" />
            </div>

            <form onSubmit={submit} className="space-y-3.5">
              <div>
                <Label htmlFor="email" className="text-[11px] uppercase tracking-[0.18em] font-mono text-ink-onDarkMuted">Work email</Label>
                <Input
                  id="email"
                  data-testid="email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  autoComplete="email"
                  className="mt-1 h-10 bg-brand-metallic/25 border-brand-metallic-3 text-ink-onDark placeholder:text-ink-onDarkMuted/60 focus-visible:ring-brand-lime/60 focus-visible:border-brand-lime/60"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-[11px] uppercase tracking-[0.18em] font-mono text-ink-onDarkMuted">Password</Label>
                  <Link
                    to="/forgot-password"
                    data-testid="forgot-password-link"
                    className="text-[11px] text-ink-onDarkMuted hover:text-brand-lime transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    data-testid="password-input"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-10 pr-10 bg-brand-metallic/25 border-brand-metallic-3 text-ink-onDark placeholder:text-ink-onDarkMuted/60 focus-visible:ring-brand-lime/60 focus-visible:border-brand-lime/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    aria-label={showPwd ? "Hide password" : "Show password"}
                    data-testid="toggle-password"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-ink-onDarkMuted hover:text-ink-onDark hover:bg-brand-metallic/60 transition-colors"
                  >
                    {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <Button
                data-testid="submit-auth"
                type="submit"
                disabled={loading}
                className="group w-full h-10 mt-1 bg-[#8FC22B] hover:bg-[#7FAE24] text-brand-charcoal font-semibold tracking-tight border border-[#7FAE24] shadow-[0_1px_0_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all"
              >
                {loading ? "Signing in…" : (
                  <span className="inline-flex items-center gap-1.5">
                    Sign in
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </Button>
            </form>

            {/* Security cue */}
            <div
              className="flex items-center justify-center gap-1.5 pt-2 text-[10px] font-mono uppercase tracking-[0.22em] text-ink-onDarkMuted"
              data-testid="security-cue"
            >
              <Lock className="h-3 w-3" />
              Secure access · Authorized users only
            </div>
            </>}
          </div>

          {/* Invitation-only note */}
          <div className="mt-8 pt-5 border-t border-brand-metallic-3/70 text-center">
            <p className="text-[11px] text-ink-onDarkMuted" data-testid="need-access-note">
              Need access?{" "}
              <span className="text-ink-onDark2">Contact your iVenture representative.</span>
            </p>
          </div>

          {/* Mobile-only compact footer */}
          <div className="lg:hidden mt-8 text-center text-[10px] font-mono uppercase tracking-[0.18em] text-ink-onDarkMuted">
            © {new Date().getFullYear()} iVenture Solutions
          </div>
        </div>
      </section>
    </div>
  );
}
