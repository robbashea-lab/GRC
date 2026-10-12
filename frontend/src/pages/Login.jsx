import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { DEMO_AVAILABLE, STANDARD_AUTH_ENABLED, STANDARD_AUTH_NOTICE, formatError } from "@/lib/api";
import PrismEducation from "@/components/login/PrismEducation";
import "./LoginPrism.css";

// Public entry only. Authentication and Demo isolation remain owned by AuthContext.
export default function Login() {
  const { login, exploreDemo } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!STANDARD_AUTH_ENABLED || loading) return;
    setLoading(true);
    try {
      await login(email, password);
      nav("/");
    } catch (err) {
      toast.error(formatError(err));
    } finally { setLoading(false); }
  }

  async function enterDemo() {
    if (loading) return;
    setLoading(true);
    try { await exploreDemo(); nav("/clients"); }
    catch (err) { toast.error(formatError(err)); }
    finally { setLoading(false); }
  }

  const notice = !STANDARD_AUTH_ENABLED ? "standard-auth-notice" : undefined;
  return <div id="login-prism" className={paused ? "paused" : undefined}>
    <main className="page">
      <div className="main">
        <section className="scene" aria-label="Omnisciente security oversight">
          <div className="brand"><span className="ring" aria-hidden="true" />
            <div>Omnisciente<small>SEE FURTHER. BE STRONGER.</small></div>
          </div>
          <div className="hero-copy">
            <h1>Clarity across<br /><em>your security</em><br />program.</h1>
            <p className="tagline">Governance. Risk. Compliance.<br />Aligned for a stronger tomorrow.</p>
          </div>
        </section>
        <section className="login" aria-labelledby="signin">
          <h2 id="signin" data-testid="env-identifier">Sign in to your<br />workspace.</h2>
          <form id="loginForm" onSubmit={submit} aria-busy={loading}>
            <label className="label" htmlFor="email">Work email</label>
            <input id="email" data-testid="email-input" type="email" placeholder="name@company.com"
              value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
              disabled={!STANDARD_AUTH_ENABLED} aria-describedby={notice} />
            <label className="label" htmlFor="password">Password</label>
            <div className="password">
              <input id="password" data-testid="password-input" type={showPwd ? "text" : "password"} placeholder="Enter your password"
                value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
                disabled={!STANDARD_AUTH_ENABLED} aria-describedby={notice} />
              <button type="button" className="show" id="show" data-testid="toggle-password" disabled={!STANDARD_AUTH_ENABLED}
                onClick={() => setShowPwd(value => !value)} aria-label={showPwd ? "Hide password" : "Show password"}>
                {showPwd ? "Hide" : "Show"}
              </button>
            </div>
            {STANDARD_AUTH_ENABLED && <Link className="textbtn forgot" id="forgot" to="/forgot-password" data-testid="forgot-password-link">Forgot password?</Link>}
            <button className="primary" type="submit" data-testid="submit-auth" disabled={loading || !STANDARD_AUTH_ENABLED} aria-describedby={notice}>
              {loading && STANDARD_AUTH_ENABLED ? "Signing in…" : "Sign in"}<span aria-hidden="true">→</span>
            </button>
          </form>
          {!STANDARD_AUTH_ENABLED && <p id="standard-auth-notice" role="status" className="auth-notice">{STANDARD_AUTH_NOTICE}</p>}
          {DEMO_AVAILABLE && <div data-testid="demo-entry">
            <button className="secondary" id="demo" type="button" data-testid="explore-demo" disabled={loading} onClick={enterDemo}>
              {loading ? "Opening…" : "Explore the demo"}<span aria-hidden="true">→</span>
            </button>
          </div>}
        </section>
      </div>
      <PrismEducation />
      <footer className="footer">
        <span>Omnisciente · Governance, risk &amp; compliance</span>
        <button id="motion" type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? "Resume motion" : "Pause motion"}</button>
      </footer>
    </main>
  </div>;
}
