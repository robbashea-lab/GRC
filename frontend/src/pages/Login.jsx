import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatError } from "@/lib/api";
import { CalendarClock, ShieldCheck, Users } from "lucide-react";

const VALUE_BLOCKS = [
  {
    icon: CalendarClock,
    title: "Stay Ahead of What Matters",
    body: "Keep upcoming reviews, due dates, findings, and required actions visible.",
  },
  {
    icon: ShieldCheck,
    title: "Manage Risk with Confidence",
    body: "Track identified risks, remediation efforts, and decisions in one place.",
  },
  {
    icon: Users,
    title: "Work Together, Stay Prepared",
    body: "Share evidence, respond to requests, and collaborate directly with your iVenture security team.",
  },
];

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
    <div className="min-h-screen bg-brand-charcoal text-ink-onDark flex">
      {/* Hero / brand pane */}
      <section className="hidden lg:flex flex-col justify-between w-1/2 xl:w-[58%] px-14 py-12 border-r border-brand-metallic-3">
        <header className="flex items-center gap-3">
          <div className="relative h-10 w-10 rounded-md bg-brand-metallic text-ink-onDark flex items-center justify-center font-bold font-heading">
            iV
            <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-brand-lime" />
          </div>
          <div className="leading-tight">
            <div className="text-ink-onDark font-heading font-semibold tracking-tight">iVenture GRC Tool</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-onDarkMuted font-mono">by iVenture Solutions</div>
          </div>
        </header>

        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-ink-onDarkMuted mb-6">
            <span className="h-px w-8 bg-brand-lime" /> Client Portal
          </div>
          <h1 className="text-4xl xl:text-[44px] leading-[1.1] font-heading font-semibold tracking-tight text-ink-onDark">
            Simplify your GRC program.<br />
            <span className="text-ink-onDark2">Strengthen your security posture.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-onDark2 max-w-lg">
            A centralized workspace for managing reviews, risks, findings, policies, evidence, and ongoing security program activities.
          </p>

          <ul className="mt-10 space-y-5 max-w-lg">
            {VALUE_BLOCKS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-4">
                <div className="h-9 w-9 shrink-0 rounded-md border border-brand-metallic-3 bg-brand-metallic flex items-center justify-center">
                  <Icon className="h-4 w-4 text-brand-lime" />
                </div>
                <div>
                  <div className="text-sm font-heading font-semibold text-ink-onDark">{title}</div>
                  <div className="text-[13px] text-ink-onDark2 leading-relaxed mt-0.5">{body}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-10 pt-6 border-t border-brand-metallic-3 max-w-lg">
            <div className="text-[15px] font-heading text-ink-onDark italic">Know what matters. Worry less.</div>
          </div>
        </div>

        <footer className="text-[11px] font-mono uppercase tracking-widest text-ink-onDarkMuted">
          © {new Date().getFullYear()} iVenture Solutions. All rights reserved.
        </footer>
      </section>

      {/* Sign-in pane */}
      <section className="flex-1 flex flex-col items-center justify-center p-6 lg:p-10 bg-brand-metallic">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div className="relative h-9 w-9 rounded-md bg-brand-charcoal text-ink-onDark flex items-center justify-center font-bold font-heading">
              iV<span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-brand-lime" />
            </div>
            <div className="text-ink-onDark font-heading font-semibold tracking-tight">iVenture GRC Tool</div>
          </div>

          <div className="bg-surface-card text-ink-primary rounded-xl border border-line p-7">
            <div className="mb-6">
              <h2 className="text-xl font-heading font-semibold tracking-tight text-ink-primary">
                {mode === "login" ? "Sign in to your workspace" : "Create your account"}
              </h2>
              <p className="text-[13px] text-ink-muted mt-1">
                {mode === "login"
                  ? "Access your GRC program, reviews, and evidence."
                  : "Set up your access to the iVenture GRC Tool."}
              </p>
            </div>

            <button
              data-testid="google-signin"
              onClick={googleSignIn}
              className="w-full mb-4 flex items-center justify-center gap-2 border border-line rounded-md py-2.5 text-sm font-medium hover:bg-surface-app transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3 my-4 text-[11px] uppercase tracking-wider text-ink-help">
              <div className="h-px bg-line flex-1" /> or with email <div className="h-px bg-line flex-1" />
            </div>

            <form onSubmit={submit} className="space-y-3.5">
              {mode === "register" && (
                <div>
                  <Label className="text-xs text-ink-secondary">Name</Label>
                  <Input data-testid="name-input" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              )}
              <div>
                <Label className="text-xs text-ink-secondary">Work email</Label>
                <Input data-testid="email-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-ink-secondary">Password</Label>
                  <Link to="/forgot-password" data-testid="forgot-password-link" className="text-[11px] text-link hover:text-link-hover underline">
                    Forgot?
                  </Link>
                </div>
                <Input data-testid="password-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button
                data-testid="submit-auth"
                type="submit"
                disabled={loading}
                className="w-full bg-brand-charcoal hover:bg-brand-charcoal-hover h-10 mt-1"
              >
                {loading ? "Signing in…" : mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <div className="mt-5 text-xs text-ink-muted text-center">
              {mode === "login" ? (
                <>New to the iVenture GRC Tool?{" "}
                  <button data-testid="switch-register" className="text-ink-primary font-medium underline underline-offset-2" onClick={() => setMode("register")}>
                    Create an account
                  </button>
                </>
              ) : (
                <>Already have an account?{" "}
                  <button data-testid="switch-login" className="text-ink-primary font-medium underline underline-offset-2" onClick={() => setMode("login")}>
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between text-[11px] text-ink-onDarkMuted">
            <span>Secure client access · iVenture Solutions</span>
            <a href="https://iventuresolutions.com/" target="_blank" rel="noreferrer" className="hover:text-ink-onDark underline underline-offset-2">
              iventuresolutions.com
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
