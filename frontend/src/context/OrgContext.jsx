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
  const [refreshing, setRefreshing] = useState(false);
  // A background list refresh may retain only this exact identity's verified
  // client list. A -> B -> A receives a new owner, never the earlier proof.
  const identityOwner = useRef(null);
  const verifiedList = useRef(null), foregroundRead = useRef(null);
  if (identityOwner.current?.identity !== identity) {
    identityOwner.current = {identity};
    verifiedList.current = null;
    foregroundRead.current = null;
  }
  const owner = identityOwner.current;
  const requestedClient = useRef(null);
  requestedClient.current = new URLSearchParams(location.search).get('client_id') || selectedClient();
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(null);
  const loadSequence = useRef(0);

  const load = useCallback(async (options) => {
    if (identityOwner.current !== owner) return;
    const sequence = ++loadSequence.current;
    const background = options?.background === true && verifiedList.current === owner
      && !foregroundRead.current && authorizedClients.current.some(client => client.client_id === requestedClient.current);
    if (!background) {
      verifiedList.current = null;
      foregroundRead.current = {owner, sequence};
      setLoading(true);
    }
    setRefreshing(background);
    setError("");
    setRecovery(null);
    try {
      // Archived clients are included so an archived workspace opened from the Portfolio keeps its identity;
      // navigation lists and the default selection use active clients only.
      const { data } = await api.get("/clients", { params: { include_archived: true } });
      if (sequence !== loadSequence.current || identityOwner.current !== owner) return;
      setClients(data);
      verifiedList.current = data.length ? owner : null;
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
      if (sequence !== loadSequence.current || identityOwner.current !== owner) return;
      verifiedList.current = null;
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
      if (sequence === loadSequence.current && identityOwner.current === owner) {
        foregroundRead.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [identity, owner]);

  useEffect(() => {
    const generation = loadSequence;
    load();
    return () => { generation.current++; };
  }, [load]);
  // Portfolio notifications follow completed writes and must not end
  // an already-dispatched same-owner native workflow. Explicit refresh remains
  // a foreground access check, including recovery after any failed read.
  const refreshList = useCallback(() => load({background: true}), [load]);
  usePortfolioRefresh(load, refreshList);

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
  // A successful refresh that changes the authorized native client DTO ends
  // old operation leases; an identical list read is only background delivery.
  const workspaceIdentity = JSON.stringify(currentClient);
  // This ID is never a normal selected Client or a placeholder data object.
  // Only a dedicated retained-command retry may use it while reads fail closed.
  const recoveryTarget = requestedId || selectedClient();
  const recoveryClientId = !loading && recovery?.identity === identity
    && recovery.ids.includes(recoveryTarget) ? recoveryTarget : '';

  return (
    <OrgContext.Provider value={{ clients, currentClient, currentClientId: resolvedId, recoveryClientId, switchClient, loading, refreshing, workspaceIdentity,
      error: error || (!loading && requestedId && !resolvedId ? 'This client is unavailable or outside your current access.' : ''), refresh: load }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
