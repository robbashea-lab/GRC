import axios from "axios";
import previewFixtures from "@/preview/fixtures.json";

const BASE = process.env.REACT_APP_BACKEND_URL || "";
export const API = `${BASE}/api`;

// The hosted visual preview runs without the project's private MongoDB service.
// It uses read-only snapshots captured from the application's own demo seed data.
// The production application continues to use the normal axios client whenever
// REACT_APP_PREVIEW is not enabled.
const PREVIEW_MODE = process.env.REACT_APP_PREVIEW === "true";
const previewResponses = previewFixtures?.responses || {};

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function paramsObject(params) {
  if (!params) return {};
  if (typeof params === "string") return Object.fromEntries(new URLSearchParams(params));
  if (params instanceof URLSearchParams) return Object.fromEntries(params.entries());
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null));
}

function previewKey(path, params) {
  const cleanPath = String(path || "/").split("?")[0] || "/";
  const values = paramsObject(params);
  const query = new URLSearchParams();
  Object.entries(values).sort(([a], [b]) => a.localeCompare(b)).forEach(([name, value]) => {
    if (Array.isArray(value)) value.forEach((item) => query.append(name, String(item)));
    else query.set(name, String(value));
  });
  const serialized = query.toString();
  return serialized ? `${cleanPath}?${serialized}` : cleanPath;
}

function lookupPreview(path, params) {
  const values = paramsObject(params);
  const exact = previewResponses[previewKey(path, values)];
  if (exact !== undefined) return clone(exact);

  const cleanPath = String(path || "/").split("?")[0] || "/";
  const candidates = Object.entries(previewResponses).filter(([key]) => {
    const candidatePath = key.split("?")[0];
    return candidatePath === cleanPath;
  });

  // Some UI calls use the current date range (calendar) or add drawer-only
  // filters (evidence). Reuse the captured response for the same resource and
  // tenant when all shared query parameters match.
  let best = null;
  let bestScore = -1;
  for (const [key, value] of candidates) {
    const candidateValues = Object.fromEntries(new URLSearchParams(key.split("?")[1] || ""));
    const shared = Object.entries(values).filter(([name, current]) => {
      if (name === "start" || name === "end" || name === "page" || name === "page_size") return false;
      return candidateValues[name] === String(current);
    });
    const hasConflict = Object.entries(values).some(([name, current]) => (
      candidateValues[name] !== undefined && candidateValues[name] !== String(current)
    ));
    if (!hasConflict && shared.length >= bestScore) {
      best = value;
      bestScore = shared.length;
    }
  }
  if (best !== null) return clone(best);

  // Empty collections are the safest response for an unseeded or newly-created
  // record in this non-persistent preview.
  if (["/comments", "/related", "/evidence", "/notifications"].includes(cleanPath)) return [];
  if (cleanPath === "/audit-logs") return values.page || values.page_size ? { items: [], total: 0, page: 1, page_size: 50 } : [];
  return {};
}

function previewUser() {
  const user = clone(previewResponses["/auth/me"] || {});
  return { ...user, name: "Preview Admin", email: "preview@example.invalid" };
}

async function previewAdapter(config) {
  const path = String(config.url || "/").split("?")[0] || "/";
  const params = config.params || {};
  const method = String(config.method || "get").toLowerCase();
  let data;

  if (path.endsWith(".csv")) {
    data = new Blob(["Preview export\n"], { type: "text/csv" });
  } else if (method === "get") {
    data = lookupPreview(path, params);
    if (path === "/audit-logs" && !Object.keys(paramsObject(params)).length && data?.items) data = data.items;
  } else if (path === "/auth/login" || path === "/auth/register") {
    // Demo mode is intentionally tokenless; authentication is represented by
    // the in-memory preview user and never persists a credential.
    data = { user: previewUser() };
  } else if (path === "/auth/logout" || path.startsWith("/notifications/") || path === "/notifications/read-all") {
    data = { ok: true };
  } else if (path === "/bulk") {
    data = { count: 0 };
  } else if (path.endsWith("/download")) {
    data = { content_base64: "", filename: "preview.txt", mime_type: "text/plain" };
  } else {
    data = clone(config.data ? (typeof config.data === "string" ? JSON.parse(config.data) : config.data) : {});
  }

  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
    request: null,
  };
}

const api = axios.create({
  baseURL: PREVIEW_MODE ? "/api" : API,
  withCredentials: false,
  ...(PREVIEW_MODE ? { adapter: previewAdapter } : {}),
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
