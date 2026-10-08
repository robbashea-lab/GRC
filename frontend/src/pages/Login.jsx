import LoginWelcome from "@/components/login/LoginWelcome";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DEMO_AVAILABLE, STANDARD_AUTH_ENABLED, STANDARD_AUTH_NOTICE, formatError } from "@/lib/api";
import { useBrawndoTheme } from "@/lib/brawndoTheme";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
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

  const notice = !STANDARD_AUTH_ENABLED ? "standard-auth-notice" : undefined;
  return <LoginWelcome theme={theme} setTheme={setTheme}>
    <main className="login">
      <div className="ring" aria-hidden="true"/>
      <h2 data-testid="env-identifier">Sign in to your workspace</h2>
      <p className="sub">Use your work email to continue.</p>
      <form onSubmit={submit}>
        <div className="field">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" data-testid="email-input" type="email" disabled={!STANDARD_AUTH_ENABLED} aria-describedby={notice}
            value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"/>
        </div>
        <div className="field">
          <div className="labelrow">
            <Label htmlFor="password">Password</Label>
            {STANDARD_AUTH_ENABLED && <Link className="link" to="/forgot-password" data-testid="forgot-password-link">Forgot password?</Link>}
          </div>
          <div className="password">
            <Input id="password" data-testid="password-input" type={showPwd ? "text" : "password"} disabled={!STANDARD_AUTH_ENABLED} aria-describedby={notice}
              value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"/>
            <button className="eye" type="button" disabled={!STANDARD_AUTH_ENABLED} onClick={() => setShowPwd(value => !value)} aria-label={showPwd ? "Hide password" : "Show password"} data-testid="toggle-password">
              {showPwd ? <EyeOff aria-hidden="true"/> : <Eye aria-hidden="true"/>}
            </button>
          </div>
        </div>
        <Button data-testid="submit-auth" type="submit" disabled={loading || !STANDARD_AUTH_ENABLED} aria-describedby={notice} variant="ghost" className="primary">
          {loading && STANDARD_AUTH_ENABLED ? "Signing in…" : "Sign in →"}
        </Button>
      </form>
      {!STANDARD_AUTH_ENABLED && <p id="standard-auth-notice" role="status" className="notice">{STANDARD_AUTH_NOTICE}</p>}
      {DEMO_AVAILABLE && <div data-testid="demo-entry">
        <div className="divider">Preview environment</div>
        <Button type="button" data-testid="explore-demo" onClick={enterDemo} disabled={loading} variant="ghost" className="secondary">{loading ? "Opening…" : "Explore the demo"}</Button>
        <p className="fine">Sample data only. Demo changes stay in this browser.</p>
      </div>}
      <p className="secure" data-testid="security-cue"><LockKeyhole aria-hidden="true"/>Access is limited to authorized users.</p>
    </main>
    <p className="help">Need access? Contact your account team.</p>
  </LoginWelcome>;
}
