// Mirrors backend/routes/portfolio.py; all views derive from the mutable records.
import { list, ids, now } from './store';
import { closed, assessedRisk, representedFinding, riskDue } from '../lib/grcWork';
const open = (k, r) => !(closed[k] || []).includes(r.status);
const owner = r => r.owner_id || r.assignee_id;
const severity = r => r.severity || r.risk_level || r.priority || '';
const high = r => ['critical', 'high', 'immediate'].includes(severity(r));
const due = (k, r) => k === 'risks' ? riskDue(r) : r.due_date;
export function portfolio(db, includeArchived) {
  const stamp = now().slice(0,10),
    horizon = days => new Date(Date.now() + days * 86400000).toISOString().slice(0,10);
  const bucket = d => !d ? null : d.slice(0,10) < stamp ? 'past_due' : d.slice(0,10) <= horizon(30) ? 'due_30d' : d.slice(0,10) <= horizon(90) ? 'due_31_90d' : null;
  const rank = r => {
    const s = severity(r),
      overdue = r.due_date && r.due_date < stamp;
    return ['critical', 'immediate'].includes(s) ? overdue ? 0 : 1 : s === 'high' && overdue ? 2 : overdue ? 3 : s === 'high' ? 4 : r.due_date <= horizon(7) ? 5 : 6;
  };
  const attention = [];
  const rows = db.clients.filter(c => includeArchived || c.status !== 'archived').map(c => {
    const work = Object.keys(closed).flatMap(k => list(db, k, c.client_id).map(r => k === 'risks' ? assessedRisk(r) : r).filter(r => open(k, r) && !(k === 'findings' && representedFinding(r,list(db,'tasks',c.client_id)))).map(r => ({
      ...r,
      entity_type: k.slice(0, -1),
      id: r[ids[k]],
      due_date: due(k, r),
      owner_id: owner(r)
    })));
    const count = b => work.filter(r => bucket(r.due_date) === b).length;
    const critical = [...list(db,'findings',c.client_id).filter(r => open('findings',r)).map(r => ({...r,entity_type:'finding'})), ...work.filter(r => r.entity_type === 'risk' || r.entity_type === 'task' && !r.finding_id)].filter(high);
    const past_due = count('past_due'),
      due_30d = count('due_30d'),
      due_31_90d = count('due_31_90d'),
      unassigned = work.filter(r => !r.owner_id).length;
    const inactive = ['archived', 'inactive'].includes(c.status);
    const criticalOverdue = work.some(r => bucket(r.due_date) === 'past_due' && (r.severity === 'critical' || r.risk_level === 'critical' || r.priority === 'immediate'));
    const setup = work.some(r => r.status === 'remediated' || r.entity_type === 'review' && !r.due_date || r.entity_type === 'risk' && r.status !== 'accepted' && !r.risk_level);
    const program_status = inactive ? c.status : c.status === 'onboarding' ? 'onboarding' : criticalOverdue || past_due >= 3 || critical.length >= 3 ? 'action_required' : past_due || due_30d || critical.length || unassigned || setup ? 'needs_attention' : 'healthy';
    if (!inactive) for (const r of work) if (r.status === 'remediated' || !r.owner_id || r.entity_type === 'review' && !r.due_date || r.entity_type === 'risk' && r.status !== 'accepted' && !r.risk_level || ['past_due', 'due_30d'].includes(bucket(r.due_date)) || ['finding', 'risk'].includes(r.entity_type) && high(r) && !bucket(r.due_date)) attention.push({
      ...r,
      client_name: c.name,
      rank: rank(r)
    });
    const major = work.filter(r => r.entity_type === 'review' && r.due_date >= stamp && ['risk', 'risk_assessment', 'vendor', 'policy', 'access', 'penetration_test', 'bcp_dr', 'incident_response', 'awareness'].includes(r.review_type)).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    const activity = db.logs.find(l => l.client_id === c.client_id);
    return {
      ...c,
      client_status: c.status,
      program_status,
      grc_lead_id: c.assigned_owner_id,
      grc_lead: db.users.find(u => u.user_id === c.assigned_owner_id) || null,
      past_due,
      due_30d,
      due_31_90d,
      critical_high_open: critical.length,
      unassigned,
      next_major_item: major || null,
      open_actions: past_due + due_30d,
      open_findings: list(db, 'findings', c.client_id).filter(r => open('findings',r)).length,
      significant_risks: critical.filter(r => r.entity_type === 'risk').length,
      critical_high_findings: critical.filter(r => r.entity_type === 'finding').length,
      overdue_reviews: work.filter(r => r.entity_type === 'review' && bucket(r.due_date) === 'past_due').length,
      upcoming_reviews: work.filter(r => r.entity_type === 'review' && bucket(r.due_date) === 'due_30d').length,
      last_activity: activity ? {
        ...activity,
        actor: activity.user_name
      } : null
    };
  });
  const active = rows.filter(r => !['archived', 'inactive'].includes(r.client_status));
  const sum = key => active.reduce((n, r) => n + r[key], 0);
  const p = {
    total_clients: rows.length,
    generated_at: stamp
  };
  for (const key of ['past_due', 'due_30d', 'due_31_90d', 'critical_high_open', 'unassigned']) p[key] = sum(key);
  p.action_required = active.filter(r => r.program_status === 'action_required').length;
  p.needs_attention = active.filter(r => r.program_status === 'needs_attention').length;
  p.clients_requiring_attention = p.action_required + p.needs_attention;
  const order = ['action_required', 'needs_attention', 'onboarding', 'healthy', 'inactive', 'archived'];
  rows.sort((a, b) => order.indexOf(a.program_status) - order.indexOf(b.program_status) || a.name.localeCompare(b.name));
  return {
    clients: rows,
    portfolio: p,
    team_workload: [],
    attention_queue: attention.sort((a, b) => a.rank - b.rank || (a.due_date || '9999').localeCompare(b.due_date || '9999')).slice(0, 15).map(r => ({
      ...r,
      entity_id: r.id,
      priority: ['critical', 'immediate'].includes(severity(r)) ? 'critical' : severity(r) === 'high' ? 'high' : r.due_date < stamp ? 'overdue' : 'due_soon',
      overdue: !!r.due_date && r.due_date < stamp,
      owner_name: db.users.find(u => u.user_id === r.owner_id)?.name || null
    }))
  };
}
export function dashboard(db, params) {
  const stamp = now(),
    end = new Date(Date.now() + 30 * 86400000).toISOString();
  const selected = params.scope === 'mine' ? db.user.user_id : params.scope === 'user' ? params.user_id : null;
  const fields = { reviews:['owner_id','reviewer_id'], findings:['owner_id'], risks:['owner_id'], tasks:['assignee_id','owner_id'], policies:['owner_id','approver_id'], vendors:['owner_id'], exceptions:['owner_id','approver_id'] };
  const get = k => list(db, k, params.client_id).filter(r => {
    const owners = (fields[k] || ['owner_id']).map(f => r[f]).filter(Boolean);
    if (params.scope !== 'unassigned') return !selected || owners.includes(selected);
    if (owners.length) return false;
    return open(k,r);
  });
  const reviews = get('reviews'),
    findings = get('findings'),
    tasks = get('tasks'),
    risks = get('risks').map(assessedRisk);
  const overdue = (k, r) => r.due_date && r.due_date.slice(0,10) < stamp.slice(0,10) && open(k, r);
  const overdueReviews = reviews.filter(r => overdue('reviews', r)).length;
  const openFindings = findings.filter(r => open('findings',r));
  const critical = openFindings.filter(r => ['high', 'critical'].includes(r.severity)).length;
  return {
    kpis: {
      overdue_reviews: overdueReviews,
      open_findings: openFindings.length,
      critical_findings: critical,
      critical_high_findings: critical,
      significant_risks: risks.filter(r => open('risks',r) && ['high', 'critical'].includes(r.risk_level)).length,
      overdue_actions: overdueReviews + findings.filter(r => overdue('findings', r) && !representedFinding(r,tasks)).length + tasks.filter(r => overdue('tasks', r)).length,
      due_next_30: reviews.filter(r => open('reviews', r) && r.due_date >= stamp && r.due_date <= end).length + tasks.filter(r => r.status !== 'done' && r.due_date >= stamp && r.due_date <= end).length + get('policies').filter(r => r.next_review_date >= stamp && r.next_review_date <= end).length
    },
    scope: params.scope || 'org',
    scope_label: params.scope === 'mine' ? 'Your assigned work' : params.scope === 'unassigned' ? 'Unassigned records' : null,
    needs_attention: [],
    priority_findings: [],
    your_actions: [],
    watch_items: [],
    program_status: [],
    recent_activity: db.logs.filter(l => l.client_id === params.client_id).slice(0, 10)
  };
}
