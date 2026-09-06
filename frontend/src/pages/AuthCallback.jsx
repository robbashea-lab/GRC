import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { formatError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setUser } = useAuth();
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
        const { data } = await api.post("/auth/google/session", { session_id: sessionId });
        if (!data?.session_token || !data.user?.user_id || !data.user?.role) {
          throw new Error("Google sign-in did not return a valid application session.");
        }
        localStorage.setItem("grc_token", data.session_token);
        setUser(data.user);
        window.history.replaceState({}, "", "/");
        navigate("/", { replace: true });
      } catch (err) {
        localStorage.removeItem("grc_token");
        setUser(null);
        toast.error(formatError(err));
        navigate("/login", { replace: true });
      }
    })();
    // eslint-disable-next-line
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">
      <div className="text-sm">Completing sign-in…</div>
    </div>
  );
}
