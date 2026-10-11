import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import api, { formatError, PREVIEW_MODE, setWorkspaceMode, setAccessToken, STANDARD_AUTH_ENABLED, STANDARD_AUTH_NOTICE } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import {clearClientSelection} from '@/lib/clientSelection';
import {toast} from 'sonner';
import {clearPendingCommands, syncPendingCommandIdentity} from '@/lib/createIntent';

const AuthContext = createContext(null);
const cleanupWarning = () => toast.error('Local pending data could not be removed. Close this application tab before another person uses it.',
  {id: 'pending-cleanup-incomplete', duration: Infinity});

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUserState] = useState(null);
  const userRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const sessionGeneration = useRef(0);

  const setUser = useCallback(next => {
    if (!next) {
      try { clearPendingCommands(); }
      finally { userRef.current = null; setUserState(null); }
      return;
    }
    syncPendingCommandIdentity(next.user_id, PREVIEW_MODE ? 'demo' : 'standard');
    userRef.current = next;
    setUserState(next);
  }, []);

  const checkAuth = useCallback(async () => {
    if (!STANDARD_AUTH_ENABLED && !PREVIEW_MODE) {
      try{localStorage.removeItem("grc_token");}catch{/* Sign-in stays disabled even when browser storage is unavailable. */}
      try { setUser(null); } catch { cleanupWarning(); }
      setLoading(false);
      return;
    }
    const generation = sessionGeneration.current;
    try {
      const { data } = await api.get("/auth/me");
      if (generation === sessionGeneration.current) {
        try { setUser(data); }
        catch (error) {
          setAccessToken(null);
          queryClient.clear();
          userRef.current = null;
          setUserState(null);
          if (error.code === 'PENDING_COMMAND_OWNERSHIP_UNVERIFIED') toast.error(error.message, {id:'pending-ownership-unverified',duration:Infinity});
          else cleanupWarning();
        }
      }
    } catch (error) {
      if (generation === sessionGeneration.current && error?.response?.status === 401) {
        setAccessToken(null);
        queryClient.clear();
        try { setUser(null); } catch { cleanupWarning(); }
      }
    } finally {
      setLoading(false);
    }
  }, [queryClient, setUser]);

  useEffect(() => {
    // If returning from Google OAuth callback, skip /me check.
    if (window.location.hash && window.location.hash.includes("session_id=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const beginSignIn = () => {
    sessionGeneration.current++;
    setAccessToken(null);
    setUser(null);
    setWorkspaceMode("standard");
    clearClientSelection();
    queryClient.clear();
    return sessionGeneration.current;
  };

  const completeSignIn = (generation, nextUser, token) => {
    if (generation !== sessionGeneration.current) throw Object.assign(new Error('This sign-in attempt has been replaced. Use the current sign-in window.'), {code:'AUTH_ATTEMPT_SUPERSEDED'});
    setUser(nextUser);
    setAccessToken(token || null);
    return nextUser;
  };

  const login = async (email, password) => {
    if (!STANDARD_AUTH_ENABLED) throw new Error(STANDARD_AUTH_NOTICE);
    const generation = beginSignIn();
    const { data } = await api.post("/auth/login", { email, password });
    return completeSignIn(generation, data.user, data.access_token);
  };

  const register = async (email, password, name) => {
    if (!STANDARD_AUTH_ENABLED) throw new Error(STANDARD_AUTH_NOTICE);
    const generation = beginSignIn();
    const { data } = await api.post("/auth/register", { email, password, name });
    return completeSignIn(generation, data.user, data.access_token);
  };

  const signInWithGoogleSession = async sessionId => {
    const generation = beginSignIn();
    try {
      const {data} = await api.post('/auth/google/session', {session_id:sessionId});
      if (!data?.session_token || !data.user?.user_id || !data.user?.role) throw new Error('Google sign-in did not return a valid application session.');
      return completeSignIn(generation, data.user, data.session_token);
    } catch (error) {
      if (generation !== sessionGeneration.current) throw Object.assign(error, {code:'AUTH_ATTEMPT_SUPERSEDED'});
      setAccessToken(null);
      throw error;
    }
  };

  const logout = async () => {
    sessionGeneration.current++;
    const generation = sessionGeneration.current;
    try {
      await api.post("/auth/logout");
    } catch (error) {
      if (generation !== sessionGeneration.current) return false;
      // A lost success response can leave a revoked bearer in this document.
      // Only a server denial of cookie authentication confirms that session ended.
      let sessionEnded = false;
      if (error?.response?.status === 401) {
        try { await api.get('/auth/me', {cookieAuthOnly: true}); }
        catch (verificationError) { sessionEnded = verificationError?.response?.status === 401; }
      }
      if (!sessionEnded) {
        toast.error("Sign-out incomplete. Your server session may still be active. Retry sign-out before leaving this device.", {
          id: 'logout-incomplete', duration: Infinity,
          action: {label: 'Retry sign-out', onClick: event => {event.preventDefault(); return logout();}},
        });
        return false;
      }
    }
    if (generation !== sessionGeneration.current) return false;
    toast.dismiss('logout-incomplete');
    setAccessToken(null);
    queryClient.clear();
    try {
      setUser(null);
      setWorkspaceMode("standard");
      toast.dismiss('pending-cleanup-incomplete');
    } catch {
      toast.error('Server sign-out is confirmed, but local pending data could not be removed. Close this application tab before another person uses it.',
        {id: 'pending-cleanup-incomplete', duration: Infinity});
      return false;
    }
    return true;
  };

  const exploreDemo = async () => {
    sessionGeneration.current++;
    const generation = sessionGeneration.current;
    setAccessToken(null);
    setUser(null);
    setWorkspaceMode("demo");
    queryClient.clear();
    try {
      const { data } = await api.post("/demo/enter");
      return completeSignIn(generation, data.user);
    } catch (error) {
      if (generation === sessionGeneration.current) {
        setWorkspaceMode("standard");
        setUser(null);
      }
      throw error;
    }
  };

  const refresh = checkAuth;

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, exploreDemo, signInWithGoogleSession, workspaceMode: PREVIEW_MODE ? "demo" : "standard", refresh, setUser, formatError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
