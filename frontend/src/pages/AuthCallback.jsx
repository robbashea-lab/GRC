import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

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
    const sessionId = decodeURIComponent(match[1]);
    (async () => {
      try {
        const { data } = await api.post("/auth/google/session", { session_id: sessionId });
        if (data.session_token) localStorage.setItem("grc_token", data.session_token);
        setUser(data.user);
        window.history.replaceState({}, "", "/");
        navigate("/", { replace: true });
      } catch {
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
