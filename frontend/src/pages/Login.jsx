import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { DEMO_AVAILABLE, STANDARD_AUTH_ENABLED, STANDARD_AUTH_NOTICE, formatError } from "@/lib/api";
import GoverNaraEducation from "@/components/login/GoverNaraEducation";
import GoverNaraGraphics, { GoverNaraIcon } from "@/components/login/GoverNaraGraphics";
import "./LoginGoverNara.css";

// Public entry only. Authentication and Demo isolation remain owned by AuthContext.
export default function Login() {
  const { login, exploreDemo } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "GoverNara | Sign in";
    return () => { if (document.title === "GoverNara | Sign in") document.title = previousTitle; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!STANDARD_AUTH_ENABLED || pending.current) return;
    pending.current = true;
    setLoading(true);
    try {
      await login(email, password);
      nav("/");
    } catch (err) { toast.error(formatError(err)); }
    finally { pending.current = false; setLoading(false); }
  }

  async function enterDemo() {
    if (!DEMO_AVAILABLE || pending.current) return;
    pending.current = true;
    setLoading(true);
    try { await exploreDemo(); nav("/clients"); }
    catch (err) { toast.error(formatError(err)); }
    finally { pending.current = false; setLoading(false); }
  }

  const notice = !STANDARD_AUTH_ENABLED ? "standard-auth-notice" : undefined;
  return <div id="login-governara" className="site">
    <GoverNaraGraphics />
    <a className="skip" href="#governara-sign-in">Skip to sign in</a>
    <div className="scene" aria-hidden="true" />
    <GoverNaraEducation />
    <main className="main">
      <section className="hero" aria-labelledby="governara-headline">
        <p className="eyebrow">Turn complexity into clarity</p>
        <h1 id="governara-headline"><span className="first-line">See clearly.</span><span className="gradient">Govern confidently.</span></h1>
        <p className="lead">A unified GRC platform for a more resilient,<br className="desktop-break" /> responsible, and forward-looking tomorrow.</p>
        <div className="mobile-visual" role="img" aria-label="Nara, a silver-white owl, on a marble terrace above a city at dusk" />
      </section>
      <section className="login-panel" aria-labelledby="governara-login-heading" id="governara-sign-in" tabIndex={-1}>
        <GoverNaraIcon name="feather" className="card-watermark" />
        <h2 id="governara-login-heading" data-testid="env-identifier">Welcome back</h2>
        <p className="login-intro">Sign in to continue to GoverNara.</p>
        <form id="governara-login-form" onSubmit={submit} aria-busy={loading}>
          <div className="field"><label className="visually-hidden" htmlFor="email">Work email</label><GoverNaraIcon name="mail" />
            <input id="email" data-testid="email-input" name="email" type="email" placeholder="Work email" required autoComplete="email" spellCheck={false} inputMode="email"
              value={email} onChange={event => setEmail(event.target.value)} disabled={!STANDARD_AUTH_ENABLED} aria-describedby={notice} />
          </div>
          <div className="field"><label className="visually-hidden" htmlFor="password">Password</label><GoverNaraIcon name="lock" />
            <input id="password" data-testid="password-input" name="password" type={showPwd ? "text" : "password"} placeholder="Password" required autoComplete="current-password" data-password=""
              value={password} onChange={event => setPassword(event.target.value)} disabled={!STANDARD_AUTH_ENABLED} aria-describedby={notice} />
            <button type="button" className="reveal" data-testid="toggle-password" disabled={!STANDARD_AUTH_ENABLED} aria-label={showPwd ? "Hide password" : "Show password"}
              aria-pressed={showPwd} onClick={() => setShowPwd(value => !value)}><GoverNaraIcon name={showPwd ? "eye-off" : "eye"} /></button>
          </div>
          {STANDARD_AUTH_ENABLED && <div className="form-options"><Link className="text-button" to="/forgot-password" data-testid="forgot-password-link">Forgot password?</Link></div>}
          <button className="primary" type="submit" data-testid="submit-auth" disabled={loading || !STANDARD_AUTH_ENABLED} aria-describedby={notice}>
            {loading && STANDARD_AUTH_ENABLED ? "Signing in…" : "Sign in"}<GoverNaraIcon name="arrow" className="icon arrow-end" />
          </button>
        </form>
        {!STANDARD_AUTH_ENABLED && <p id="standard-auth-notice" role="status" className="auth-notice">{STANDARD_AUTH_NOTICE}</p>}
        {DEMO_AVAILABLE && <div data-testid="demo-entry">
          <div className="or" aria-hidden="true">or</div>
          <button type="button" className="secondary" data-testid="explore-demo" disabled={loading} onClick={enterDemo}><GoverNaraIcon name="bars" />{loading ? "Opening…" : "Explore a demo"}</button>
          <p className="demo-caption">See how GoverNara helps organizations<br />turn complexity into confidence.</p>
        </div>}
        <div className="card-footer"><p className="card-mantra">A stronger tomorrow<br />together</p><GoverNaraIcon name="feather" className="feather" /></div>
      </section>
    </main>
    <footer className="footer"><span>© 2026 GoverNara.</span></footer>
  </div>;
}
