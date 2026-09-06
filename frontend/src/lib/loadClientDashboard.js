import { aggregateClientDashboard, DASHBOARD_KINDS } from "./clientDashboard";

// Every source request includes client_id; the existing backend _scope_filter
// rejects unauthorized tenants. Client-side validation is an additional guard.
export async function loadClientDashboard(api, { clientId, user, scope, signal, today }) {
  if (!clientId) throw new Error("Select a client to view its dashboard.");
  const params = { client_id: clientId, scope: scope.kind };
  if (scope.kind === "user") params.user_id = scope.user_id;
  const [summary, memberResponse, ...sources] = await Promise.all([
    api.get("/dashboard", { params, signal }),
    api.get(`/clients/${encodeURIComponent(clientId)}/members`, { signal }),
    ...DASHBOARD_KINDS.map(kind => api.get(`/${kind}`, { params: { client_id: clientId }, signal })),
  ]);
  const records = Object.fromEntries(DASHBOARD_KINDS.map((kind, i) => [kind, sources[i].data]));
  // Existing list endpoints cap results at 1,000. Do not present a truncated
  // set as a complete operational dashboard for a larger client.
  if (Object.values(records).some(list => !Array.isArray(list) || list.length >= 1000)) {
    throw new Error("This client's record list could not be loaded in full. Please use the detailed modules while the dashboard is reviewed.");
  }
  const members = memberResponse.data;
  return { ...summary.data, members, ...aggregateClientDashboard(records, { clientId, user, scope, members, today }) };
}
