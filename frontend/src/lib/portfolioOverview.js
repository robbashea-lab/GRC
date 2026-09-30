import rules from './portfolioRules.json';
import { complianceNavigation } from './complianceNavigation';

// A projection of the existing management populations, not another issue engine.
// Keep the legacy combined metric intact for other consumers.
export function portfolioPopulations(model) {
  return {
    critical_high_issues: model.metrics.critical_high_open.filter(r => r.kind !== 'risks'),
    significant_risks: model.significantRisks
  };
}
// Open work first (priorityOrder), then the least recently active program, then name.
// Programs with no recorded lifecycle activity sort as the most stale.
export function portfolioOrder(a, b) {
  for (const key of rules.priorityOrder) {
    const difference = b[key] - a[key];
    if (difference) return difference;
  }
  const activity = (a.last_activity?.at || '').localeCompare(b.last_activity?.at || '');
  if (activity) return activity;
  return a.name.localeCompare(b.name, undefined, {
    sensitivity: 'base'
  }) || a.client_id.localeCompare(b.client_id);
}
export function portfolioFrameworks(clientId, baseline, requirements) {
  return complianceNavigation(clientId, baseline, requirements).map(({
    key,
    label,
    to
  }) => ({
    key,
    label,
    to
  }));
}
export function meaningfulActivity(log, now = new Date()) {
  const definition = rules.activity.find(r => [r.kind, r.kind === 'policy' ? 'policies' : r.kind + 's'].includes(log.entity_type) && r.actions.includes(log.action));
  const time = Date.parse(log.at);
  if (!definition || !Number.isFinite(time) || time > now.getTime()) return null;
  return {
    at: log.at,
    label: definition.labels?.[log.action] || log.action
  };
}
export function latestPortfolioActivity(logs, now = new Date()) {
  const latest = new Map();
  for (const log of logs) {
    const activity = meaningfulActivity(log, now),
      previous = latest.get(log.client_id);
    if (activity && (!previous || Date.parse(activity.at) > Date.parse(previous.at))) latest.set(log.client_id, activity);
  }
  return latest;
}

export const STALE_AFTER_DAYS = rules.staleAfterDays;
// Whole days since the last meaningful lifecycle event; null when none is recorded.
export function inactiveDays(activity, now = new Date()) {
  const at = Date.parse(activity?.at);
  return Number.isFinite(at) ? Math.max(0, Math.floor((now.getTime() - at) / 86400000)) : null;
}
export const isStale = (activity, now = new Date()) => {
  const days = inactiveDays(activity, now);
  return days == null || days >= STALE_AFTER_DAYS;
};

// Reference portfolio tiles: totals plus the client holding the most, so each tile says where to look first.
export const PORTFOLIO_TILES = [['past_due', 'Past due', 'critical'], ['critical_high_issues', 'Critical / High', 'critical'], ['significant_risks', 'Significant risks', 'attention'], ['unassigned', 'Unassigned', 'attention'], ['due_30d', 'Due ≤30 days', 'neutral']];
export function portfolioTotals(rows) {
  return Object.fromEntries(PORTFOLIO_TILES.map(([key]) => {
    const total = rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);
    const top = rows.reduce((best, r) => (Number(r[key]) || 0) > (Number(best?.[key]) || 0) ? r : best, null);
    const clients = rows.filter(r => Number(r[key]) > 0).length;
    return [key, { total, clients, top: top && Number(top[key]) > 0 ? top.name : null }];
  }));
}
