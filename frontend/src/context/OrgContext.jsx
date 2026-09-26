import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const OrgContext = createContext(null);
const selectedClient=()=>{try{return localStorage.getItem('grc_client_id')||'';}catch{return '';}};
const rememberClient=id=>{try{localStorage.setItem('grc_client_id',id);}catch{/* Selection is a preference, never proof of authorization. */}};

export function OrgProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [currentClientId, setCurrentClientId] = useState(selectedClient);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Archived clients are included so an archived workspace opened from the Portfolio keeps its identity;
      // navigation lists and the default selection use active clients only.
      const { data } = await api.get("/clients", { params: { include_archived: true } });
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
      setError(e?.response?.data?.detail || e?.message || "Clients could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
