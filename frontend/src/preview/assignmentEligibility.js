// Demo-only mirror of backend/assignment_eligibility.py; never standard authorization.
export const assignmentFields = {
  reviews: ['owner_id', 'reviewer_id'], tasks: ['assignee_id'], findings: ['owner_id'],
  risks: ['owner_id'], vendors: ['business_owner_id'], policies: ['owner_id'],
  assets: ['owner_id'], requirements: ['owner_id'], exceptions: ['owner_id'],
  framework_assessments: ['owner_id'], ai_systems: ['owner_id', 'technical_owner_id', 'oversight_owner_id'],
};
export const clientAccess = (user, cid) => ['super_admin','platform_admin','client_grc_manager','client_contributor','client_readonly'].includes(user?.role) &&
  (user.role === 'super_admin' || !!user?.client_ids?.includes(cid));
export const eligible = (user, cid) => user?.status === 'active' && clientAccess(user, cid);
export function validateAssignment(db, kind, row, previous) {
  for (const field of assignmentFields[kind] || []) {
    const value = row[field];
    const oldValue = previous?.[field] || (kind === 'tasks' ? previous?.owner_id : null);
    if (!value || (previous && value === oldValue)) continue;
    if (!eligible(db.users.find(u => u.user_id === value), row.client_id)) throw new Error('Choose an active platform user with access to this client');
  }
}
export function assignmentCandidates(db, cid, params = {}) {
  if (!clientAccess(db.user, cid)) throw new Error('Forbidden for this client');
  const search = String(params.search || '').trim().toLowerCase();
  const offset = Number(params.offset || 0), limit = Number(params.limit || 50);
  if (search.length > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid candidate query');
  const rows = db.users.filter(u => eligible(u, cid) && [u.name, u.email].some(v => (v || '').toLowerCase().includes(search)))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '') || a.user_id.localeCompare(b.user_id));
  return { items: rows.slice(offset, offset + limit).map(({user_id, name, email}) => ({user_id, name, email})), has_more: rows.length > offset + limit };
}
