// Presentation gates that mirror backend/authorization.py. The server stays authoritative;
// these only keep the UI from offering an action the server will refuse.
export const INTERNAL_ROLES = ['super_admin', 'platform_admin'];
export const OPERATOR_ROLES = [...INTERNAL_ROLES, 'client_grc_manager', 'client_contributor'];

// Program configuration, AI system records, Evidence Library relationships, policy submission.
export const isInternal = user => INTERNAL_ROLES.includes(user?.role);
// Assigned work: notes, task fields, remediation plans, evidence upload, comments.
export const canOperate = user => OPERATOR_ROLES.includes(user?.role);
// Contributors act only on work assigned to them (authorization.OWNERS).
export const isAssignedTo = (user, row, fields = ['owner_id', 'assignee_id']) => fields.some(f => row?.[f] && row[f] === user?.user_id);

const OWNER_FIELDS = { reviews: ['owner_id', 'reviewer_id'], tasks: ['assignee_id', 'owner_id'], findings: ['owner_id'], risks: ['owner_id'],
  policies: ['owner_id'], vendors: ['business_owner_id'], assets: ['owner_id'] };
// Fields a client operator may change on an existing record (authorize_request field allowlist).
// null means no field-level limit applies (internal roles, or a client creating an Action Item).
export function editableFields(kind, user, record) {
  if (isInternal(user) || (!record && kind === 'tasks' && canOperate(user))) return null;
  if (!canOperate(user)) return new Set();
  const fields = new Set(['notes']);
  if (kind === 'tasks') ['status', 'description', 'resolution', 'title', 'priority', 'due_date', 'reason', 'context'].forEach(f => fields.add(f));
  if (kind === 'findings') fields.add('remediation_plan');
  if (user.role === 'client_grc_manager') (OWNER_FIELDS[kind] || []).forEach(f => fields.add(f));
  return fields;
}
