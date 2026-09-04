import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [currentClientId, setCurrentClientId] = useState(() => localStorage.getItem("grc_client_id") || "");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/clients");
        setClients(data);
        if (data.length && !data.find((c) => c.client_id === currentClientId)) {
          setCurrentClientId(data[0].client_id);
          localStorage.setItem("grc_client_id", data[0].client_id);
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  const switchClient = (id) => {
    setCurrentClientId(id);
    localStorage.setItem("grc_client_id", id);
  };

  const currentClient = clients.find((c) => c.client_id === currentClientId) || null;

  return (
    <OrgContext.Provider value={{ clients, currentClient, currentClientId, switchClient, loading }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
