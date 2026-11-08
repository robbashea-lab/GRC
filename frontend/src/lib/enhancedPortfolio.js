import { assignedToUser, periodChange } from './portfolioProgress';
import {orderNamedDemoClients} from './demoClientOrder';
import { calendarDay, managementDay } from './managementDates';
export const ENHANCED_PORTFOLIO_ENABLED = true;
export const PORTFOLIO_KPIS = [['attention', 'Needs attention', 'Clients with a red status'], ['overdue', 'Overdue items', 'Reviews and action items'], ['due30', 'Due in 30 days', 'Reviews, follow-ups, renewals'], ['notstarted', 'Not started', 'Onboarding has not started']];

// Appearance only; the native endpoints still authorize the returned client cohort.
export function enhancedPortfolioEligible({user, pathname, authLoading, authError}) {
  return ENHANCED_PORTFOLIO_ENABLED && pathname === '/clients' && !!user?.user_id
    && ['platform_admin', 'super_admin'].includes(user.role) && !authLoading && !authError;
}
export function operationalItems(client, asOf) {
  const today = managementDay(asOf);
  const normalize = items => [...new Map((items || []).filter(item => item.client_id === client.client_id && item.entity_id && calendarDay(item.due_date) !== null).map(item => [item.key || `${item.entity_type}:${item.entity_id}:${item.event}`, item])).values()];
  const overdue = normalize(client.metric_items?.past_due).filter(item => ['task', 'review'].includes(item.entity_type) && calendarDay(item.due_date) < today);
  const due30 = normalize(client.metric_items?.due_30d).filter(item => calendarDay(item.due_date) >= today && calendarDay(item.due_date) <= today + 30);
  const scheduled = normalize([...(client.metric_items?.due_30d || []), ...(client.metric_items?.due_31_90d || [])]).filter(item => calendarDay(item.due_date) >= today && calendarDay(item.due_date) <= today + 90);
  const next = [...overdue, ...scheduled].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.entity_id.localeCompare(b.entity_id))[0] || null;
  return {
    overdue,
    due30,
    next
  };
}
export function clientAttention(client, asOf) {
  const work = operationalItems(client, asOf),
    day = managementDay(asOf);
  const noLead = !client.grc_lead_id && !client.assigned_owner_id;
  const oldest = work.overdue.reduce((max, item) => Math.max(max, day - calendarDay(item.due_date)), 0);
  const reasons = [noLead ? 'No GRC lead assigned' : '', work.overdue.length ? `${work.overdue.length} overdue${oldest >= 30 ? ` (oldest ${oldest} days)` : ''}` : ''].filter(Boolean);
  if (noLead) return {
    level: 0,
    tone: 'red',
    label: 'Needs a lead',
    reason: reasons.join(' · ')
  };
  if (work.overdue.length >= 2 || oldest >= 30) return {
    level: 1,
    tone: 'red',
    label: 'Needs attention',
    reason: reasons.join(' · ')
  };
  const due7 = work.due30.filter(item => calendarDay(item.due_date) <= day + 7).length;
  if (work.overdue.length || due7) return {
    level: 2,
    tone: 'amber',
    label: 'Watch',
    reason: [...reasons, due7 ? `${due7} due this week` : ''].filter(Boolean).join(' · ')
  };
  if (client.monitoring?.onboarding === 'not_started') return {
    level: 3,
    tone: 'gray',
    label: 'Not started',
    reason: 'Onboarding has not started'
  };
  if (client.monitoring?.onboarding === 'in_progress') return {
    level: 2,
    tone: 'amber',
    label: 'Onboarding',
    reason: 'Onboarding is in progress'
  };
  if (client.monitoring?.onboarding !== 'complete') return {
    level: 3,
    tone: 'gray',
    label: 'Status unavailable',
    reason: 'Onboarding status is not recorded'
  };
  return {
    level: 4,
    tone: 'green',
    label: 'On track',
    reason: work.due30.length ? `Nothing overdue · ${work.due30.length} due in 30 days` : 'Nothing overdue'
  };
}
export function portfolioKpiValue(key, clients, asOf) {
  if (!PORTFOLIO_KPIS.some(([id]) => id === key)) return null;
  if (key === 'overdue' || key === 'due30') return clients.reduce((sum, client) => sum + operationalItems(client, asOf)[key].length, 0);
  if (key === 'notstarted' && clients.some(client => !['complete', 'in_progress', 'not_started'].includes(client.monitoring?.onboarding))) return null;
  return clients.filter(client => key === 'attention' ? clientAttention(client, asOf).tone === 'red' : client.monitoring?.onboarding === 'not_started').length;
}
export function filterPortfolio(clients, programs, state, userId, asOf, includeKpi = true, demoContext) {
  const query = state.search.trim().toLowerCase();
  const rows = clients.filter(client => (!state.mine || assignedToUser(client, userId)) && (!state.framework || programs.some(program => program.client_id === client.client_id && program.program_key === state.framework)) && (!query || [client.name, client.grc_lead?.name || 'Unassigned', ...programs.filter(program => program.client_id === client.client_id).map(program => program.program_label)].join(' ').toLowerCase().includes(query)) && (!includeKpi || !state.kpi || (state.kpi === 'overdue' || state.kpi === 'due30' ? operationalItems(client, asOf)[state.kpi].length > 0 : state.kpi === 'attention' ? clientAttention(client, asOf).tone === 'red' : state.kpi === 'notstarted' && client.monitoring?.onboarding === 'not_started')));
  const sorted = rows.sort((a, b) => (state.sort === 'attention' ? clientAttention(a, asOf).level - clientAttention(b, asOf).level : state.sort === 'next' ? (operationalItems(a, asOf).next?.due_date || '9999').localeCompare(operationalItems(b, asOf).next?.due_date || '9999') : 0) || a.name.localeCompare(b.name) || a.client_id.localeCompare(b.client_id));
  // Keep the established Demo default order; explicit user sorts must take precedence.
  return ['name', 'next'].includes(state.sort) ? sorted : orderNamedDemoClients(sorted, demoContext);
}
export function trailingChange(program, asOf) {
  return periodChange(program.snapshots_90d, program.current, new Date(Date.parse(asOf) - 90 * 86400000).toISOString(), {
    comparison: program.comparison_90d,
    scopeChanges: program.scope_changes_90d
  });
}
