import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { DEMO_AVAILABLE, STANDARD_AUTH_ENABLED, STANDARD_AUTH_NOTICE, formatError } from "@/lib/api";
import "./LoginTwilight.css";

// Public presentation only; AuthContext owns authentication and demo isolation.
export default function Login() {
  const { login, exploreDemo } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState({});
  const pending = useRef(false);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "GoverNara Sign In";
    return () => { if (document.title === "GoverNara Sign In") document.title = previousTitle; };
  }, []);

  function fieldError(input) {
    if (input.name === "email") {
      return input.validity.valueMissing ? "Enter your work email." : input.validity.typeMismatch ? "Enter a valid work email." : "";
    }
    return input.validity.valueMissing ? "Enter your password." : "";
  }

  function updateField(event, setValue) {
    const input = event.currentTarget;
    setValue(input.value);
    if (errors[input.name]) setErrors(current => ({ ...current, [input.name]: fieldError(input) }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!STANDARD_AUTH_ENABLED || pending.current) return;
    const inputs = event.currentTarget.elements;
    const nextErrors = { email: fieldError(inputs.email), password: fieldError(inputs.password) };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) {
      (nextErrors.email ? inputs.email : inputs.password).focus();
      return;
    }
    pending.current = true;
    setLoading(true);
    setStatus("");
    try {
      await login(email, password);
      nav("/");
    } catch (err) {
      const message = formatError(err);
      setStatus(message);
      toast.error(message);
    } finally { pending.current = false; setLoading(false); }
  }

  async function enterDemo() {
    if (!DEMO_AVAILABLE || pending.current) return;
    pending.current = true;
    setLoading(true);
    setStatus("");
    try { await exploreDemo(); nav("/clients"); }
    catch (err) {
      const message = formatError(err);
      setStatus(message);
      toast.error(message);
    } finally { pending.current = false; setLoading(false); }
  }

  const notice = !STANDARD_AUTH_ENABLED ? "standard-auth-notice" : undefined;
  const updateCapsLock = event => setCapsLock(!!event.getModifierState?.("CapsLock"));
  return <div id="login-governara">
    <a className="skip" href="#governara-sign-in">Skip to sign in</a>
    <div className="scene" role="img" aria-label="A snowy owl on a marble ledge above a city and river at twilight" />
    <div className="page">
      <header>
        <Link className="logo" to="/" aria-label="GoverNara home">
          <svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="login-feather-gradient" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#85C4FF" /><stop offset="1" stopColor="#C4B5FD" /></linearGradient></defs>
            <path d="M36 4C24 6 12 14 8 28l-3 8" fill="none" stroke="url(#login-feather-gradient)" strokeWidth="2.4" strokeLinecap="round" /><path d="M36 4c-1 11-9 21-22 25" fill="none" stroke="url(#login-feather-gradient)" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M31 10 15 23M27 16 12 27M23 22 11 29" fill="none" stroke="url(#login-feather-gradient)" strokeWidth="1.8" strokeLinecap="round" opacity=".8" /></svg>
          GoverNara</Link>
        {DEMO_AVAILABLE && <button className="demo-link" type="button" data-testid="explore-demo-top" disabled={loading} onClick={enterDemo}>Explore a demo</button>}
      </header>

      <main className="main">
        <section className="hero" aria-labelledby="governara-headline">
          <h1 id="governara-headline"><span>Govern confidently.</span><span className="grad sub">Turn complexity into clarity.</span></h1>
        </section>

        <section className="card" aria-labelledby="governara-login-heading" id="governara-sign-in" tabIndex={-1}>
          <h2 id="governara-login-heading" data-testid="env-identifier">Welcome back</h2>
          <p className="sub">Sign in to continue to GoverNara.</p>
          <button className="btn ms" type="button" id="sso" onClick={() => setStatus("Microsoft sign-in is not available yet.")}><svg viewBox="0 0 18 18" aria-hidden="true"><rect width="8.5" height="8.5" fill="#F25022" /><rect x="9.5" width="8.5" height="8.5" fill="#7FBA00" /><rect y="9.5" width="8.5" height="8.5" fill="#00A4EF" /><rect x="9.5" y="9.5" width="8.5" height="8.5" fill="#FFB900" /></svg>Sign in with Microsoft</button>
          <div className="or">or use your email</div>
          <form id="governara-login-form" onSubmit={submit} noValidate aria-busy={loading}>
            <div className="field"><label htmlFor="email">Work email</label>
              <div className="inp"><svg className="lead" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="3" width="13" height="10" rx="2" /><path d="m2 4 6 5 6-5" /></svg>
                <input id="email" data-testid="email-input" name="email" type="email" autoComplete="username" placeholder="name@company.com" required spellCheck={false} inputMode="email"
                  value={email} onChange={event => updateField(event, setEmail)} disabled={!STANDARD_AUTH_ENABLED} aria-invalid={!!errors.email} aria-describedby={["email-err", notice].filter(Boolean).join(" ")} /></div>
              <div className="err" id="email-err" role="alert">{errors.email}</div></div>
            <div className="field"><label htmlFor="password">Password</label>
              <div className="inp"><svg className="lead" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>
                <input id="password" data-testid="password-input" name="password" type={showPwd ? "text" : "password"} autoComplete="current-password" placeholder="Your password" required
                  value={password} onChange={event => updateField(event, setPassword)} disabled={!STANDARD_AUTH_ENABLED} aria-invalid={!!errors.password} aria-describedby={["pw-err", capsLock ? "caps" : undefined, notice].filter(Boolean).join(" ")}
                  onKeyDown={updateCapsLock} onKeyUp={updateCapsLock} onBlur={() => setCapsLock(false)} />
                <button type="button" className="eye" data-testid="toggle-password" disabled={!STANDARD_AUTH_ENABLED} aria-label={showPwd ? "Hide password" : "Show password"}
                  aria-pressed={showPwd} onClick={() => setShowPwd(value => !value)}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z" /><circle cx="8" cy="8" r="2" /></svg></button></div>
              <div className={`caps${capsLock ? " on" : ""}`} id="caps" role="status">Caps Lock is on.</div>
              <div className="err" id="pw-err" role="alert">{errors.password}</div></div>
            <div className="row"><label className="chk"><input type="checkbox" id="keep" aria-disabled="true" checked={false} onChange={() => {}} title="This setting is not supported; the existing session policy applies." /> Keep me signed in on this device</label>
              {STANDARD_AUTH_ENABLED && <Link className="link" to="/forgot-password" data-testid="forgot-password-link">Forgot password?</Link>}</div>
            <button className="btn go" type="submit" data-testid="submit-auth" disabled={loading || !STANDARD_AUTH_ENABLED} aria-busy={loading} aria-describedby={notice}>
              {loading && STANDARD_AUTH_ENABLED ? <><span className="spin" aria-hidden="true" /><span>Signing in…</span></> : <><span>Sign in</span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg></>}
            </button>
            <div className="status" id="status" role="status" aria-live="polite">{status}</div>
          </form>
          {!STANDARD_AUTH_ENABLED && <p id="standard-auth-notice" role="status" className="auth-notice">{STANDARD_AUTH_NOTICE}</p>}
          {DEMO_AVAILABLE && <div className="alt" data-testid="demo-entry">New to GoverNara? <button className="link" type="button" data-testid="explore-demo" disabled={loading} onClick={enterDemo}>Explore a demo</button></div>}
        </section>
      </main>

      <footer><span>© 2026 GoverNara</span><nav aria-label="Legal and trust">{["Privacy", "Terms", "Security & trust", "System status"].map(label => <a key={label} href="#" aria-disabled="true" title="Destination not configured" onClick={event => event.preventDefault()}>{label}</a>)}</nav></footer>
    </div>
  </div>;
}
