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
export function portfolioOrder(a, b) {
  for (const key of rules.priorityOrder) {
    const difference = b[key] - a[key];
    if (difference) return difference;
  }
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
