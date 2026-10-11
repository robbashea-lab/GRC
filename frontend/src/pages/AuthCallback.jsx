import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { formatError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signInWithGoogleSession } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const hash = location.hash || "";
    const match = hash.match(/session_id=([^&]+)/);
    if (!match) { navigate("/login", { replace: true }); return; }
    (async () => {
      try {
        const sessionId = decodeURIComponent(match[1]);
        await signInWithGoogleSession(sessionId);
        window.history.replaceState({}, "", "/");
        navigate("/", { replace: true });
      } catch (err) {
        if (err.code === 'AUTH_ATTEMPT_SUPERSEDED') return;
        toast.error(formatError(err));
        navigate("/login", { replace: true });
      }
    })();
    // eslint-disable-next-line
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-app text-ink-help">
      <div className="text-sm">Completing sign-in…</div>
    </div>
  );
}
