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
const PREVIEW_SESSION_KEY = "grc_preview_session";
const PREVIEW_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// This account is intentionally limited to the static preview.  The reserved
// email domain and unmistakable password make it impossible to confuse with a
// production credential.  Hosted production builds never use these values.
const PREVIEW_EMAIL = (process.env.REACT_APP_PREVIEW_EMAIL || "preview@example.invalid").trim().toLowerCase();
const PREVIEW_PASSWORD = process.env.REACT_APP_PREVIEW_PASSWORD || "TEST_ONLY_PREVIEW_PASSWORD";
// Google sign-in in the preview is accepted only after the real backend
// verifies the provider-issued session ID.  Keep the backend URL and the
// preview admin allowlist build-time configurable; neither is a credential.
const PREVIEW_AUTH_URL = (process.env.REACT_APP_PREVIEW_AUTH_URL || process.env.REACT_APP_BACKEND_URL || "")
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
const PREVIEW_GOOGLE_ADMIN_EMAIL = (process.env.REACT_APP_PREVIEW_GOOGLE_ADMIN_EMAIL || "").trim().toLowerCase();

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

function previewUser(overrides = {}) {
  const user = clone(previewResponses["/auth/me"] || {});
  return {
    ...user,
    ...clone(overrides),
    name: overrides.name || user.name || "Preview Admin",
    email: (overrides.email || PREVIEW_EMAIL).trim().toLowerCase(),
  };
}

function previewRequestBody(config) {
  if (!config?.data) return {};
  if (typeof config.data !== "string") return config.data;
  try { return JSON.parse(config.data); } catch { return {}; }
}

function previewResponse(config, data, status = 200, statusText = "OK") {
  const response = { data, status, statusText, headers: {}, config, request: null };
  if (status < 200 || status >= 300) {
    throw new axios.AxiosError(
      data?.detail || statusText,
      axios.AxiosError.ERR_BAD_REQUEST,
      config,
      null,
      response,
    );
  }
  return response;
}

function newPreviewToken() {
  // This is a local test-session identifier, not a production auth token.
  return window.crypto?.randomUUID?.() || `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readPreviewSession() {
  const token = localStorage.getItem("grc_token");
  if (!token) return null;
  try {
    const session = JSON.parse(localStorage.getItem(PREVIEW_SESSION_KEY) || "null");
    if (!session || session.token !== token || session.expires_at <= Date.now()) {
      localStorage.removeItem(PREVIEW_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(PREVIEW_SESSION_KEY);
    return null;
  }
}

function createPreviewSession(user, token = newPreviewToken(), provider = "password") {
  const session = {
    token,
    user_id: user.user_id,
    expires_at: Date.now() + PREVIEW_SESSION_TTL_MS,
    provider,
  };
  if (provider === "google") session.user = clone(user);
  localStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(session));
  return token;
}

function previewGoogleUser(user) {
  const verified = previewUser(user || {});
  if (PREVIEW_GOOGLE_ADMIN_EMAIL && verified.email === PREVIEW_GOOGLE_ADMIN_EMAIL) {
    const fixtureAdmin = previewUser();
    return {
      ...verified,
      role: fixtureAdmin.role,
      client_ids: fixtureAdmin.client_ids,
    };
  }
  return verified;
}

async function previewAuthBackend(config, path, body = {}, token = "", method = "POST") {
  if (!PREVIEW_AUTH_URL) {
    return previewResponse(
      config,
      { detail: "Google sign-in is not configured for this preview." },
      503,
      "Service Unavailable",
    );
  }
  let response;
  try {
    response = await fetch(`${PREVIEW_AUTH_URL}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return previewResponse(
      config,
      { detail: "The preview authentication service could not be reached." },
      502,
      "Bad Gateway",
    );
  }
  let data;
  try { data = await response.json(); } catch { data = { detail: "Invalid authentication service response." }; }
  return previewResponse(config, data, response.status, response.statusText || "Authentication error");
}

async function previewAdapter(config) {
  const path = String(config.url || "/").split("?")[0] || "/";
  const params = config.params || {};
  const method = String(config.method || "get").toLowerCase();
  const body = previewRequestBody(config);
  let data;

  if (path === "/auth/me" && method === "get") {
    const session = readPreviewSession();
    if (!session) return previewResponse(config, { detail: "Not authenticated" }, 401, "Unauthorized");
    if (session.provider === "google") {
      const response = await previewAuthBackend(config, "/auth/me", {}, session.token, "GET");
      data = previewGoogleUser(response.data);
    } else {
      data = previewUser();
    }
  } else if (path === "/auth/login" && method === "post") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (email !== PREVIEW_EMAIL || password !== PREVIEW_PASSWORD) {
      return previewResponse(config, { detail: "Invalid credentials" }, 401, "Unauthorized");
    }
    const user = previewUser();
    const token = createPreviewSession(user);
    data = { access_token: token, user };
  } else if (path === "/auth/google/session" && method === "post") {
    const response = await previewAuthBackend(config, "/auth/google/session", body);
    const verified = response.data || {};
    if (!verified.session_token || !verified.user?.email) {
      return previewResponse(
        config,
        { detail: "Google sign-in returned an incomplete session." },
        502,
        "Bad Gateway",
      );
    }
    const user = previewGoogleUser(verified.user);
    createPreviewSession(user, verified.session_token, "google");
    data = { ...verified, user };
  } else if (path === "/auth/register" && method === "post") {
    return previewResponse(
      config,
      { detail: "Preview registration is disabled; use the provided preview account." },
      403,
      "Forbidden",
    );
  } else if (path === "/auth/logout" && method === "post") {
    localStorage.removeItem(PREVIEW_SESSION_KEY);
    data = { ok: true };
  } else if (!path.startsWith("/auth/") && !readPreviewSession()) {
    // Keep the static preview subject to the same authenticated-entry rule as
    // the real API.  The UI also protects its routes, but the adapter should
    // not expose fixture data to unauthenticated API calls either.
    return previewResponse(config, { detail: "Not authenticated" }, 401, "Unauthorized");
  } else if (path.endsWith(".csv")) {
    data = new Blob(["Preview export\n"], { type: "text/csv" });
  } else if (method === "get") {
    data = lookupPreview(path, params);
    if (path === "/audit-logs" && !Object.keys(paramsObject(params)).length && data?.items) data = data.items;
  } else if (path.startsWith("/notifications/") || path === "/notifications/read-all") {
    data = { ok: true };
  } else if (path === "/bulk") {
    data = { count: 0 };
  } else if (path.endsWith("/download")) {
    data = { content_base64: "", filename: "preview.txt", mime_type: "text/plain" };
  } else {
    data = clone(config.data ? (typeof config.data === "string" ? JSON.parse(config.data) : config.data) : {});
  }

  return previewResponse(config, data);
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
