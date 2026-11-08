import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import {selectedClient, rememberClient} from '@/lib/clientSelection';
import {useLocation} from 'react-router-dom';
import {usePortfolioRefresh} from '@/lib/usePortfolioRefresh';

const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const location = useLocation();
  const [clients, setClients] = useState([]);
  const authorizedClients = useRef(clients);
  authorizedClients.current = clients;
  const [currentClientId, setCurrentClientId] = useState(selectedClient);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
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
      setError(e?.response?.data?.detail || e?.message || "Clients could not be loaded.");
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, []);

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

  return (
    <OrgContext.Provider value={{ clients, currentClient, currentClientId: resolvedId, switchClient, loading,
      error: error || (!loading && requestedId && !resolvedId ? 'This client is unavailable or outside your current access.' : ''), refresh: load }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
