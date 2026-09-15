import Brand from "@/components/Brand";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DEMO_AVAILABLE, formatError } from "@/lib/api";
import { Lock, Eye, EyeOff, ArrowRight } from "lucide-react";

export default function Login() {
  const { login, exploreDemo } = useAuth();
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

  async function enterDemo() {
    setLoading(true);
    try { await exploreDemo(); nav("/clients"); }
    catch (err) { toast.error(formatError(err)); }
    finally { setLoading(false); }
  }

  return (
    <div className="login-shell min-h-screen bg-brand-charcoal text-ink-onDark flex flex-col lg:flex-row">
      {/* ─── Brand pane (left) ─────────────────────────────────────────── */}
      <section className="relative hidden lg:flex flex-col justify-between w-1/2 xl:w-[58%] px-14 py-12 overflow-hidden">
        <header><Brand /></header>

        {/* Secure workspace identity */}
        <div className="relative z-10">
          <h1 className="text-3xl leading-tight font-heading font-semibold tracking-tight text-ink-onDark">
            GRC Workspace
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-onDarkMuted">
            Governance · Risk · Compliance
          </p>
        </div>

        {/* Bottom — footer */}
        <footer className="relative z-10 text-xs text-ink-onDarkMuted">
          © {new Date().getFullYear()} Prestige Worldwide
        </footer>
      </section>

      {/* ─── Auth pane (right) ─────────────────────────────────────────── */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-6 py-10 lg:px-10 bg-brand-charcoal border-l border-brand-metallic-3">
        {/* Mobile-only brand header (visible when the left pane is hidden) */}
        <div className="lg:hidden mb-10 self-start"><Brand /></div>

        <div className="w-full max-w-sm">
          {/* Environment identifier */}
          <div className="text-xs font-mono uppercase tracking-[0.28em] text-brand-lime/80 mb-3" data-testid="env-identifier">
            Authorized Access
          </div>
          <h2 className="text-2xl font-heading font-semibold tracking-tight text-ink-onDark">Sign in</h2>
          <p className="text-[13px] text-ink-onDarkMuted mt-1.5">
            Access your Omnisciente workspace.
          </p>

          {/* Panel */}
          <div className="mt-7 space-y-4">
            <form onSubmit={submit} className="space-y-3.5">
              <div>
                <Label htmlFor="email" className="text-[13px] font-medium text-ink-onDarkMuted">Email</Label>
                <Input
                  id="email"
                  data-testid="email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="mt-1 h-10 bg-brand-metallic/25 border-brand-metallic-3 text-ink-onDark placeholder:text-ink-onDarkMuted/60 focus-visible:ring-brand-lime/60 focus-visible:border-brand-lime/60"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-[13px] font-medium text-ink-onDarkMuted">Password</Label>
                  <Link
                    to="/forgot-password"
                    data-testid="forgot-password-link"
                    className="text-xs text-ink-onDarkMuted hover:text-brand-lime transition-colors"
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
                className="group w-full h-10 mt-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold tracking-tight border border-transparent transition-all"
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
              className="flex items-center justify-center gap-1.5 pt-2 text-xs font-mono uppercase tracking-[0.22em] text-ink-onDarkMuted"
              data-testid="security-cue"
            >
              <Lock className="h-3 w-3" />
              Secure access · Authorized users only
            </div>
            {DEMO_AVAILABLE && <>
              <div className="flex items-center gap-3 text-xs text-ink-onDarkMuted"><div className="h-px bg-brand-metallic-3 flex-1" />or<div className="h-px bg-brand-metallic-3 flex-1" /></div>
              <Button type="button" variant="outline" data-testid="explore-demo" onClick={enterDemo} disabled={loading} className="w-full h-10 border-brand-metallic-3 text-ink-onDark hover:bg-brand-metallic">Explore Demo</Button>
              <p className="text-xs text-ink-onDarkMuted">Explore a preconfigured sample GRC environment. No credentials required.</p>
            </>}
          </div>

          {/* Invitation-only note */}
          <div className="mt-8 pt-5 border-t border-brand-metallic-3/70 text-center">
            <p className="text-xs text-ink-onDarkMuted" data-testid="need-access-note">
              Need access?{" "}
              <span className="text-ink-onDark2">Contact your platform administrator.</span>
            </p>
          </div>

          {/* Mobile-only compact footer */}
          <div className="lg:hidden mt-8 text-center text-xs text-ink-onDarkMuted">
            © {new Date().getFullYear()} Prestige Worldwide
          </div>
        </div>
      </section>
    </div>
  );
}
