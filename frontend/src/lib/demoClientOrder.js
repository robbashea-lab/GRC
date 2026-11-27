import {NAMED_DEMO_CLIENTS} from './demoClients';
const NAMED = NAMED_DEMO_CLIENTS.map(row => row.clientId);

// Sorting never adds clients or changes the authorized/filter population.
export function orderNamedDemoClients(rows, {trustedDemo, workspaceMode, user} = {}) {
  if (trustedDemo !== true || workspaceMode !== 'demo' || user?.workspace_mode !== 'demo' || !user.user_id) return rows;
  const rank = row => row.environment === 'Demo' && NAMED.includes(row.client_id) ? NAMED.indexOf(row.client_id) : NAMED.length;
  return [...rows].sort((a, b) => rank(a) - rank(b));
}
