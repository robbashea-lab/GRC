import axios from "axios";
import {recordUuid} from './recordUuid';

// Standard authentication and operational data always use the configured API.
// Only intentional Explore Demo sessions use the isolated, session-local adapter.
const BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
export const API = `${BASE.replace(/\/api$/, "")}/api`;

export const DEMO_AVAILABLE = process.env.REACT_APP_PREVIEW === "true";
export const STANDARD_AUTH_ENABLED = !DEMO_AVAILABLE || process.env.REACT_APP_STANDARD_SIGN_IN === "true";
export const STANDARD_AUTH_NOTICE = "Standard sign-in is not enabled in this preview.";
const MODE_KEY = "grc_workspace_mode";
export let PREVIEW_MODE = sessionStorage.getItem(MODE_KEY) === "demo" && DEMO_AVAILABLE;
export function setWorkspaceMode(mode) {
  if (!["standard", "demo"].includes(mode) || (mode === "demo" && !DEMO_AVAILABLE)) throw new Error("Workspace unavailable.");
  PREVIEW_MODE = mode === "demo";
  sessionStorage.setItem(MODE_KEY, mode);
  localStorage.removeItem("grc_token");
  localStorage.removeItem("grc_client_id");
  localStorage.removeItem("grc_demo_entered");
  sessionStorage.removeItem("grc_demo_entered");
}

const api = axios.create({
  baseURL: API,
  withCredentials: false,
});

// Attach bearer token if present in localStorage (fallback when cookies blocked)
api.interceptors.request.use((cfg) => {
  // Capture the intentional mode per request. Demo requests never reach HTTP.
  if (PREVIEW_MODE) {
    delete cfg.headers.Authorization;
    cfg.adapter = async config => {
      const { previewAdapter } = await import("@/preview/adapter");
      return previewAdapter(config);
    };
    return cfg;
  }
  if (!STANDARD_AUTH_ENABLED) {
    throw new axios.AxiosError(STANDARD_AUTH_NOTICE, "ERR_STANDARD_AUTH_DEFERRED", cfg);
  }
  // Transport retries using the same config retain this identity. Forms also
  // retain their intent across a fresh submit after an uncertain response.
  if (cfg.method === 'post' && /^\/(clients|reviews|findings|tasks|risks|vendors|policies|contacts|assets|exceptions|requirements|evidence|ai_systems)$/.test(cfg.url)) {
    cfg.headers['Idempotency-Key'] ||= recordUuid();
  }
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
