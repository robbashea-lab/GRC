import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const OrgContext = createContext(null);
const selectedClient=()=>{try{return localStorage.getItem('grc_client_id')||'';}catch{return '';}};
const rememberClient=id=>{try{localStorage.setItem('grc_client_id',id);}catch{/* Selection is a preference, never proof of authorization. */}};

export function OrgProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [currentClientId, setCurrentClientId] = useState(selectedClient);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/clients");
      setClients(data);
      // Keep the previously-selected client if still authorized; otherwise fall back to the first client.
      // Internal users (super/platform admin) may land on /clients with no active selection — that's fine.
      const stored = selectedClient();
      const found = data.find((c) => c.client_id === stored);
      if (found) {
        setCurrentClientId(stored);
      } else if (data.length) {
        setCurrentClientId(data[0].client_id);
        rememberClient(data[0].client_id);
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
    rememberClient(id);
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
