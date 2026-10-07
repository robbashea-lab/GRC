import Brand from "@/components/Brand";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DEMO_AVAILABLE, STANDARD_AUTH_ENABLED, STANDARD_AUTH_NOTICE, formatError } from "@/lib/api";
import { useBrawndoTheme } from "@/lib/brawndoTheme";
import { Eye, EyeOff } from "lucide-react";
import "./Login.css";

// Sign-in page. Carries no client or program information: nothing here depends on who signs in.
export default function Login() {
  const { login, exploreDemo } = useAuth();
  const nav = useNavigate();
  const [theme, setTheme] = useBrawndoTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!STANDARD_AUTH_ENABLED) return;
    setLoading(true);
    try {
      await login(email, password);
      nav("/");
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

  const year = new Date().getFullYear();
  const notice = !STANDARD_AUTH_ENABLED ? "standard-auth-notice" : undefined;
  return (
    <div className="login-shell lg-shell min-h-screen flex flex-col lg:flex-row" data-theme={theme}>
      <section className="lg-brand hidden lg:flex flex-col">
        <header><Brand /></header>
        <div className="lg-intro">
          <p className="lg-eyebrow">Governance, risk &amp; compliance</p>
          <h1>Clarity across your security program.</h1>
          <p className="lg-lede">A shared workspace for governance, risk, and compliance.</p>
        </div>
        <footer className="lg-legal">
          <span>© {year} Prestige Worldwide</span>
        </footer>
      </section>

      <section className="lg-access flex-1 flex flex-col">
        <div className="lg-topbar">
          <div className="lg:hidden"><Brand /></div>
          <div className="lg-theme" role="group" aria-label="Color theme">
            {["light", "dark"].map(t => <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>{t === "light" ? "Light" : "Dark"}</button>)}
          </div>
        </div>
        <main className="lg-card">
          <h2 data-testid="env-identifier">Sign in to your workspace.</h2>
          <p className="lg-sub">Sign in with the email address that received your invitation.</p>

          {DEMO_AVAILABLE && <div className="lg-demo" data-testid="demo-entry">
            <div className="lg-demo-head"><span>Preview environment</span><span>Demo build only</span></div>
            <Button type="button" data-testid="explore-demo" onClick={enterDemo} disabled={loading} variant="ghost" className="lg-demo-btn w-full">
              {loading ? "Opening…" : "Explore the demo"}
            </Button>
            <p>Uses sample data only. Changes stay in this browser tab.</p>
          </div>}
          {DEMO_AVAILABLE && <div className="lg-divider" aria-hidden="true"><span>or sign in</span></div>}

          <form onSubmit={submit} className="lg-form">
            <div>
              <Label htmlFor="email">Work email</Label>
              <Input id="email" data-testid="email-input" type="email" disabled={!STANDARD_AUTH_ENABLED} aria-describedby={notice}
                value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <div className="lg-label-row">
                <Label htmlFor="password">Password</Label>
                {STANDARD_AUTH_ENABLED && <Link to="/forgot-password" data-testid="forgot-password-link">Forgot password?</Link>}
              </div>
              <div className="relative">
                <Input id="password" data-testid="password-input" type={showPwd ? "text" : "password"} disabled={!STANDARD_AUTH_ENABLED} aria-describedby={notice}
                  value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="pr-12" />
                <button type="button" disabled={!STANDARD_AUTH_ENABLED} onClick={() => setShowPwd((v) => !v)} aria-label={showPwd ? "Hide password" : "Show password"} data-testid="toggle-password" className="lg-eye">
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button data-testid="submit-auth" type="submit" disabled={loading || !STANDARD_AUTH_ENABLED} aria-describedby={notice} variant="ghost" className="lg-submit w-full">
              {loading && STANDARD_AUTH_ENABLED ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          {!STANDARD_AUTH_ENABLED && <p id="standard-auth-notice" role="status" className="lg-notice">{STANDARD_AUTH_NOTICE}</p>}
          <p className="lg-foot" data-testid="security-cue">Access is limited to authorized users.</p>
        </main>
        <p className="lg-help">Need access or having trouble signing in? Contact your account team.</p>
        <p className="lg-help lg:hidden">© {year} Prestige Worldwide</p>
      </section>
    </div>
  );
}
