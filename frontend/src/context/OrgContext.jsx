import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import {selectedClient, rememberClient} from '@/lib/clientSelection';

const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const [clients, setClients] = useState([]);
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
    load();
    const refreshScope = () => { if (!document.hidden) load(); };
    window.addEventListener("focus", refreshScope);
    const interval = window.setInterval(refreshScope, 60000);
    return () => { loadSequence.current++; window.removeEventListener("focus", refreshScope); window.clearInterval(interval); };
  }, [load]);

  const switchClient = (id) => {
    setCurrentClientId(id);
    rememberClient(id);
  };

  const currentClient = clients.find((c) => c.client_id === currentClientId) || null;

  return (
    <OrgContext.Provider value={{ clients, currentClient, currentClientId, switchClient, loading, error, refresh: load }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
