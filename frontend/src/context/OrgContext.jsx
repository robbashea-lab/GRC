import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [currentClientId, setCurrentClientId] = useState(() => localStorage.getItem("grc_client_id") || "");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/clients");
      setClients(data);
      // Keep the previously-selected client if still authorized; otherwise fall back to the first client.
      // Internal users (super/platform admin) may land on /clients with no active selection — that's fine.
      const stored = localStorage.getItem("grc_client_id") || "";
      const found = data.find((c) => c.client_id === stored);
      if (found) {
        setCurrentClientId(stored);
      } else if (data.length) {
        setCurrentClientId(data[0].client_id);
        localStorage.setItem("grc_client_id", data[0].client_id);
      } else {
        setCurrentClientId("");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const switchClient = (id) => {
    setCurrentClientId(id);
    localStorage.setItem("grc_client_id", id);
  };

  const currentClient = clients.find((c) => c.client_id === currentClientId) || null;

  return (
    <OrgContext.Provider value={{ clients, currentClient, currentClientId, switchClient, loading, refresh: load }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
