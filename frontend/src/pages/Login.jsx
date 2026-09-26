import Brand from "@/components/Brand";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DEMO_AVAILABLE, STANDARD_AUTH_ENABLED, STANDARD_AUTH_NOTICE, formatError } from "@/lib/api";
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
    if (!STANDARD_AUTH_ENABLED) return;
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

  // Preview builds offer only the Demo; standard sign-in stays visible but secondary.
  const demoOnly = DEMO_AVAILABLE && !STANDARD_AUTH_ENABLED;
  const demoButton = <Button type="button" data-testid="explore-demo" onClick={enterDemo} disabled={loading}
    variant="ghost" className={`w-full h-10 font-semibold ${demoOnly ? "login-primary" : "login-quiet"}`}>
    {loading && demoOnly ? "Opening…" : "Explore the demo"}
  </Button>;
  const demoNote = <p className="text-xs leading-relaxed text-ink-onDarkMuted">Three fictional client programs with about two years of history. Changes stay in this browser tab; no credentials required.</p>;

  return (
    <div className="login-shell min-h-screen bg-brand-charcoal text-ink-onDark flex flex-col lg:flex-row">
      {/* Brand pane */}
      <section className="relative hidden lg:flex flex-col justify-between w-1/2 xl:w-[56%] px-14 py-12 overflow-hidden">
        <header><Brand /></header>
        <div className="relative z-10 max-w-xl">
          <h1 className="text-[32px] leading-[1.15] font-heading font-semibold tracking-tight text-ink-onDark">
            Security and compliance programs, run with evidence.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-onDarkMuted">
            Reviews, findings, risks, vendors and framework assessments in one workspace, with the history an auditor asks for.
          </p>
          <ul className="login-points mt-8 space-y-3 text-sm text-ink-onDark2">
            <li>Recurring obligations with an unchangeable completion record</li>
            <li>Deficiencies followed from Finding to validated remediation</li>
            <li>Framework progress that keeps implemented and verified apart</li>
          </ul>
        </div>
        <footer className="relative z-10 text-xs text-ink-onDarkMuted">
          © {new Date().getFullYear()} Prestige Worldwide
        </footer>
      </section>

      {/* Access pane */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-6 py-10 lg:px-10 bg-brand-charcoal border-l border-brand-metallic-3">
        <div className="lg:hidden mb-10 self-start"><Brand /></div>
        <div className="w-full max-w-sm">
          {demoOnly && <div className="mb-9" data-testid="demo-entry">
            <div className="text-xs font-mono uppercase tracking-[0.28em] text-brand-lime/80 mb-3" data-testid="env-identifier">Demo workspace</div>
            <h2 className="text-2xl font-heading font-semibold tracking-tight text-ink-onDark">Explore Omnisciente</h2>
            <div className="mt-5 space-y-3">{demoButton}{demoNote}</div>
          </div>}

          <div className={demoOnly ? "pt-7 border-t border-brand-metallic-3/70" : undefined}>
            {!demoOnly && <div className="text-xs font-mono uppercase tracking-[0.28em] text-brand-lime/80 mb-3" data-testid="env-identifier">Authorized access</div>}
            {demoOnly
              ? <h2 className="text-sm font-semibold text-ink-onDark">Standard sign-in</h2>
              : <><h2 className="text-2xl font-heading font-semibold tracking-tight text-ink-onDark">Sign in</h2>
                 <p className="text-[13px] text-ink-onDarkMuted mt-1.5">Access your Omnisciente workspace.</p></>}

            <div className={demoOnly ? "mt-4 space-y-4" : "mt-7 space-y-4"}>
              <form onSubmit={submit} className="space-y-3.5">
                <div>
                  <Label htmlFor="email" className="text-[13px] font-medium text-ink-onDarkMuted">Email</Label>
                  <Input
                    id="email"
                    data-testid="email-input"
                    type="email"
                    disabled={!STANDARD_AUTH_ENABLED}
                    aria-describedby={!STANDARD_AUTH_ENABLED ? "standard-auth-notice" : undefined}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="mt-1 h-10"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-[13px] font-medium text-ink-onDarkMuted">Password</Label>
                    {STANDARD_AUTH_ENABLED && <Link
                      to="/forgot-password"
                      data-testid="forgot-password-link"
                      className="text-xs text-ink-onDarkMuted hover:text-brand-lime transition-colors"
                    >
                      Forgot password?
                    </Link>}
                  </div>
                  <div className="relative mt-1">
                    <Input
                      id="password"
                      data-testid="password-input"
                      type={showPwd ? "text" : "password"}
                      disabled={!STANDARD_AUTH_ENABLED}
                      aria-describedby={!STANDARD_AUTH_ENABLED ? "standard-auth-notice" : undefined}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      disabled={!STANDARD_AUTH_ENABLED}
                      onClick={() => setShowPwd((v) => !v)}
                      aria-label={showPwd ? "Hide password" : "Show password"}
                      data-testid="toggle-password"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-ink-onDarkMuted hover:text-ink-onDark hover:bg-brand-metallic/60 transition-colors disabled:opacity-60 disabled:hover:bg-transparent"
                    >
                      {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                <Button
                  data-testid="submit-auth"
                  type="submit"
                  disabled={loading || !STANDARD_AUTH_ENABLED}
                  aria-describedby={!STANDARD_AUTH_ENABLED ? "standard-auth-notice" : undefined}
                  variant="ghost"
                  className={`group w-full h-10 mt-1 font-semibold tracking-tight ${demoOnly ? "login-quiet" : "login-primary"}`}
                >
                  {loading && !demoOnly ? "Signing in…" : (
                    <span className="inline-flex items-center gap-1.5">
                      Sign in
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </Button>
              </form>
              {!STANDARD_AUTH_ENABLED && <p id="standard-auth-notice" role="status" className="text-xs text-ink-onDarkMuted">{STANDARD_AUTH_NOTICE}</p>}
              <div className="flex items-center gap-1.5 text-xs text-ink-onDarkMuted" data-testid="security-cue">
                <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                Authorized users only. Access is provisioned by your platform administrator.
              </div>
              {!demoOnly && DEMO_AVAILABLE && <>
                <div className="flex items-center gap-3 text-xs text-ink-onDarkMuted"><div className="h-px bg-brand-metallic-3 flex-1" />or<div className="h-px bg-brand-metallic-3 flex-1" /></div>
                {demoButton}{demoNote}
              </>}
            </div>
          </div>

          <div className="lg:hidden mt-10 text-center text-xs text-ink-onDarkMuted">
            © {new Date().getFullYear()} Prestige Worldwide
          </div>
        </div>
      </section>
    </div>
  );
}
