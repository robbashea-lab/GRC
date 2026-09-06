import axios from "axios";
import fixtures from "./fixtures.json";

const SESSION = "grc_demo_entered";
const responses = fixtures.responses;
const clone = value => JSON.parse(JSON.stringify(value));

// This adapter never makes a network request and is loaded only by demo builds.
// The local entry marker is not a backend credential or a real authentication token.
export async function previewAdapter(config) {
  const url = new URL(config.url, "https://demo.invalid");
  const path = url.pathname;
  const params = { ...Object.fromEntries(url.searchParams), ...config.params };
  const method = (config.method || "get").toLowerCase();
  const respond = data => ({ data: clone(data), status: 200, statusText: "OK", headers: {}, config });
  const fail = (status, detail) => {
    throw new axios.AxiosError(detail, "ERR_BAD_REQUEST", config, null,
      { data: { detail }, status, config });
  };
  if (path === "/auth/login" && method === "post") {
    localStorage.removeItem("grc_token");
    localStorage.setItem(SESSION, "true");
    return respond({ user: responses["/auth/me"] });
  }
  if (path === "/auth/logout") {
    localStorage.removeItem(SESSION);
    return respond({ ok: true });
  }
  if (localStorage.getItem(SESSION) !== "true") return fail(401, "Click Sign in to open the demo preview.");
  if (method !== "get") return fail(405, "This demo uses read-only sample data. Changes are not saved.");

  const clientId = params.client_id;
  if (clientId && !responses["/clients"].some(c => c.client_id === clientId)) {
    return fail(404, "Demo client not found.");
  }
  const exactKey = path + (Object.keys(params).length ? "?" + new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null).sort(([a], [b]) => a.localeCompare(b))) : "");
  if (responses[exactKey] !== undefined) return respond(responses[exactKey]);

  const candidates = Object.entries(responses).filter(([key]) => {
    const u = new URL(key, "https://demo.invalid");
    if (u.pathname !== path) return false;
    // Never substitute a different client's snapshot or another owner's summary.
    for (const name of ["client_id", "scope", "user_id", "entity_id", "entity_type"]) {
      if ((u.searchParams.get(name) || "") !== String(params[name] || "")) return false;
    }
    return true;
  });
  if (candidates.length) {
    let data = clone(candidates[0][1]);
    if (Array.isArray(data)) {
      data = data.filter(record => Object.entries(params).every(([key, value]) =>
        value == null || value === "" || !(key in record) || String(record[key]) === String(value)));
    }
    return respond(data);
  }
  // Drawers may request the authoritative record directly.
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 2) {
    for (const [key, records] of Object.entries(responses)) {
      if (key.split("?")[0] !== "/" + parts[0] || !Array.isArray(records)) continue;
      const record = records.find(r => Object.entries(r).some(([k, v]) => k.endsWith("_id") && v === parts[1]));
      if (record && (!clientId || record.client_id === clientId)) return respond(record);
    }
  }
  if (["/comments", "/related", "/evidence", "/exceptions"].includes(path)) return respond([]);
  return fail(404, "This view is not included in the demo snapshot.");
}
