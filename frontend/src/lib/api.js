import axios from "axios";

// Every sign-in, session check, and application request uses the same backend.
// The preview runner supplies its test backend URL; production deployments
// continue to supply REACT_APP_BACKEND_URL through their own configuration.
const BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
export const API = `${BASE.replace(/\/api$/, "")}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: false,
});

// Attach bearer token if present in localStorage (fallback when cookies blocked)
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("grc_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export function formatError(e) {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(", ");
  return e?.message || "Something went wrong";
}

export default api;
