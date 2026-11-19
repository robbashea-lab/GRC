import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import {selectedClient, rememberClient} from '@/lib/clientSelection';
import {useLocation} from 'react-router-dom';
import {usePortfolioRefresh} from '@/lib/usePortfolioRefresh';
import {useAuth} from '@/context/AuthContext';

const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const location = useLocation();
  const {user, workspaceMode} = useAuth() || {};
  const identity = JSON.stringify([workspaceMode, user?.user_id, user?.role, user?.status,
    user?.updated_at, user?.client_ids, user?.all_clients]);
  const [clients, setClients] = useState([]);
  const authorizedClients = useRef(clients);
  authorizedClients.current = clients;
  const [currentClientId, setCurrentClientId] = useState(selectedClient);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(null);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    setRecovery(null);
    try {
      // Archived clients are included so an archived workspace opened from the Portfolio keeps its identity;
      // navigation lists and the default selection use active clients only.
      const { data } = await api.get("/clients", { params: { include_archived: true } });
      if (sequence !== loadSequence.current) return;
      setClients(data);
      const active = data.filter((c) => (c.status || "active") !== "archived");
      const stored = selectedClient();
      const found = data.find((c) => c.client_id === stored);
      if (found) {
        setCurrentClientId(stored);
      } else if (active.length) {
        setCurrentClientId(active[0].client_id);
        rememberClient(active[0].client_id);
      } else {
        setCurrentClientId("");
      }
    } catch (e) {
      if (sequence !== loadSequence.current) return;
      setClients([]); setCurrentClientId("");
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 409 && detail?.code === 'SHARED_CONTEXT_RECOVERY_REQUIRED'
          && Array.isArray(detail.client_ids) && detail.client_ids.every(id => typeof id === 'string' && id)) {
        setRecovery({identity, ids: detail.client_ids});
        setError(detail.message);
      } else {
        setError(typeof detail === 'string' ? detail : e?.message || "Clients could not be loaded.");
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [identity]);

  useEffect(() => {
    const generation = loadSequence;
    load();
    return () => { generation.current++; };
  }, [load]);
  usePortfolioRefresh(load);

  // A URL-selected tenant is resolved against the authorized list before any child reads it.
  const requestedId = new URLSearchParams(location.search).get('client_id');
  const resolvedId = requestedId ? clients.some(client => client.client_id === requestedId) ? requestedId : '' : currentClientId;
  useEffect(() => {
    if (requestedId && resolvedId) {
      setCurrentClientId(resolvedId);
      rememberClient(resolvedId);
    }
  }, [requestedId, resolvedId]);

  const switchClient = (id) => {
    if (!authorizedClients.current.some(client => client.client_id === id)) return false;
    setCurrentClientId(id);
    rememberClient(id);
    return true;
  };

  const currentClient = clients.find((c) => c.client_id === resolvedId) || null;
  // This ID is never a normal selected Client or a placeholder data object.
  // Only a dedicated retained-command retry may use it while reads fail closed.
  const recoveryTarget = requestedId || selectedClient();
  const recoveryClientId = !loading && recovery?.identity === identity
    && recovery.ids.includes(recoveryTarget) ? recoveryTarget : '';

  return (
    <OrgContext.Provider value={{ clients, currentClient, currentClientId: resolvedId, recoveryClientId, switchClient, loading,
      error: error || (!loading && requestedId && !resolvedId ? 'This client is unavailable or outside your current access.' : ''), refresh: load }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
