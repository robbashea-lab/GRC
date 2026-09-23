import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import api, { formatError, PREVIEW_MODE, setWorkspaceMode, setAccessToken, STANDARD_AUTH_ENABLED, STANDARD_AUTH_NOTICE } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const sessionGeneration = useRef(0);

  const checkAuth = useCallback(async () => {
    if (!STANDARD_AUTH_ENABLED && !PREVIEW_MODE) {
      try{localStorage.removeItem("grc_token");}catch{/* Sign-in stays disabled even when browser storage is unavailable. */}
      setUser(null);
      setLoading(false);
      return;
    }
    const generation = sessionGeneration.current;
    try {
      const { data } = await api.get("/auth/me");
      if (generation === sessionGeneration.current) setUser(data);
    } catch {
      if (generation === sessionGeneration.current) setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // If returning from Google OAuth callback, skip /me check.
    if (window.location.hash && window.location.hash.includes("session_id=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    if (!STANDARD_AUTH_ENABLED) throw new Error(STANDARD_AUTH_NOTICE);
    sessionGeneration.current++;
    setUser(null);
    setWorkspaceMode("standard");
    queryClient.clear();
    const { data } = await api.post("/auth/login", { email, password });
    if (data.access_token) setAccessToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const register = async (email, password, name) => {
    if (!STANDARD_AUTH_ENABLED) throw new Error(STANDARD_AUTH_NOTICE);
    sessionGeneration.current++;
    setUser(null);
    setWorkspaceMode("standard");
    queryClient.clear();
    const { data } = await api.post("/auth/register", { email, password, name });
    if (data.access_token) setAccessToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    sessionGeneration.current++;
    try { await api.post("/auth/logout"); } catch (e) { void e; }
    setWorkspaceMode("standard");
    queryClient.clear();
    setUser(null);
  };

  const exploreDemo = async () => {
    sessionGeneration.current++;
    setUser(null);
    setWorkspaceMode("demo");
    queryClient.clear();
    try {
      const { data } = await api.post("/demo/enter");
      setUser(data.user);
      return data.user;
    } catch (error) {
      setWorkspaceMode("standard");
      setUser(null);
      throw error;
    }
  };

  const refresh = checkAuth;

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, exploreDemo, workspaceMode: PREVIEW_MODE ? "demo" : "standard", refresh, setUser, formatError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
